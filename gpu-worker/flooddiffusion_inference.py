"""FloodDiffusion (HF) inference wrapper.

Loads ShandaAI/FloodDiffusionTiny via transformers AutoModel and returns
22×3 joint coordinates for projection.py skeleton_to_json().
"""

from __future__ import annotations

import time
from typing import Any

import numpy as np

FLOOD_MODEL_ID = "ShandaAI/FloodDiffusionTiny"
UMT5_MODEL_ID = "google/umt5-base"
FLOOD_LATENT_TO_FRAME_RATIO = 4

_FLOOD_STATE: dict[str, Any] | None = None


def _latent_token_to_frame(token: int) -> int:
    """Exclusive end-frame boundary after `token` latent steps (VAE causal decode).

    First latent yields 1 frame; each later latent yields 4 frames.
    """
    if token <= 0:
        return 0
    return 1 + (token - 1) * FLOOD_LATENT_TO_FRAME_RATIO


def _latent_tokens_to_frame_count(tokens: int) -> int:
    return _latent_token_to_frame(tokens)


def _prepare_flood_model_env(model_dir: str) -> None:
    """Register attention fallback before wan_model imports flash_attention."""
    import importlib.util
    import os
    import sys
    import types

    if model_dir not in sys.path:
        sys.path.insert(0, model_dir)

    for pkg_name, pkg_path in (
        ("ldf_models", os.path.join(model_dir, "ldf_models")),
        ("ldf_models.tools", os.path.join(model_dir, "ldf_models", "tools")),
    ):
        if pkg_name not in sys.modules:
            pkg = types.ModuleType(pkg_name)
            pkg.__path__ = [pkg_path]
            sys.modules[pkg_name] = pkg

    attn_path = os.path.join(model_dir, "ldf_models", "tools", "attention.py")
    spec = importlib.util.spec_from_file_location(
        "ldf_models.tools.attention",
        attn_path,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load attention module from {attn_path}")

    attn_mod = importlib.util.module_from_spec(spec)
    sys.modules["ldf_models.tools.attention"] = attn_mod
    spec.loader.exec_module(attn_mod)

    if not (attn_mod.FLASH_ATTN_2_AVAILABLE or attn_mod.FLASH_ATTN_3_AVAILABLE):
        import warnings

        import torch

        def _sdpa_fallback(q, k, v, q_lens=None, k_lens=None, **kwargs):
            if q_lens is not None or k_lens is not None:
                warnings.warn(
                    "flash-attn unavailable; SDP fallback ignores length masks",
                )
            out_dtype = q.dtype
            out = torch.nn.functional.scaled_dot_product_attention(
                q.transpose(1, 2),
                k.transpose(1, 2),
                v.transpose(1, 2),
                attn_mask=None,
                is_causal=kwargs.get("causal", False),
                dropout_p=kwargs.get("dropout_p", 0.0),
            )
            return out.transpose(1, 2).contiguous().to(out_dtype)

        print("flash-attn unavailable; using scaled_dot_product_attention fallback")
        attn_mod.flash_attention = _sdpa_fallback


def _patch_umt5_config(model_id: str = UMT5_MODEL_ID) -> None:
    """Patch google/umt5-base config — HF repo omits model_type, transformers>=4.40 needs it."""
    import json
    import os

    from huggingface_hub import snapshot_download

    path = snapshot_download(model_id)
    config_path = os.path.join(path, "config.json")
    with open(config_path, encoding="utf-8") as f:
        config = json.load(f)
    if config.get("model_type"):
        return
    config["model_type"] = "umt5"
    with open(config_path, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2)
    print(f"Patched {config_path} with model_type=umt5")


def _load_model(device: str):
    """Load FloodDiffusionTiny once per container."""
    global _FLOOD_STATE
    if _FLOOD_STATE is not None:
        return _FLOOD_STATE

    import torch
    from huggingface_hub import snapshot_download
    from transformers import AutoModel

    print(f"Loading FloodDiffusion from [{FLOOD_MODEL_ID}] on {device}...")
    _patch_umt5_config()
    model_path = snapshot_download(FLOOD_MODEL_ID)
    _prepare_flood_model_env(model_path)
    model = AutoModel.from_pretrained(
        FLOOD_MODEL_ID,
        trust_remote_code=True,
    )
    model = model.to(device)
    model.eval()

    _FLOOD_STATE = {"model": model, "device": device}
    return _FLOOD_STATE


def _to_numpy_joints(output: Any) -> np.ndarray:
    """Normalize HF model output to (frames, 22, 3) float32."""
    if isinstance(output, list):
        output = output[0]
    if hasattr(output, "detach"):
        output = output.detach().cpu().numpy()
    else:
        output = np.asarray(output)
    if output.ndim != 3 or output.shape[1] != 22 or output.shape[2] != 3:
        raise ValueError(
            f"Expected joints shape (frames, 22, 3), got {output.shape}",
        )
    return output.astype(np.float32)


def _build_flood_meta(
    *,
    mode: str,
    latent_tokens: int,
    inference_ms: int,
    segments: list[dict] | None = None,
    num_denoise_steps: int | None = None,
) -> dict:
    meta: dict = {
        "mode": mode,
        "latentTokens": latent_tokens,
        "inferenceMs": inference_ms,
    }
    if segments is not None:
        meta["segments"] = segments
    if num_denoise_steps is not None:
        meta["numDenoiseSteps"] = num_denoise_steps
    return meta


def _segment_meta_from_request(segments: list[dict]) -> list[dict]:
    prev_end = 0
    meta: list[dict] = []
    for seg in segments:
        end_token = seg["endToken"]
        meta.append(
            {
                "text": seg["text"],
                "startToken": prev_end,
                "endToken": end_token,
                "startFrame": _latent_token_to_frame(prev_end),
                "endFrame": _latent_token_to_frame(end_token),
            },
        )
        prev_end = end_token
    return meta


def _multi_text_batch_inference(
    hf_model: Any,
    *,
    texts: list[str],
    text_end: list[int],
    total_length: int,
    num_denoise_steps: int | None,
    smoothing_alpha: float,
) -> np.ndarray:
    """Multi-segment inference via official ldf_model.generate + batch VAE decode.

    Uses the HF pipeline's text_end path so segment boundaries align with latent
    tokens. stream_generate_step + stream_decode drops 3 warmup frames on the first
    chunk and misaligns text switches for offline multi-prompt generation.
    """
    kwargs: dict[str, Any] = {
        "output_joints": True,
        "smoothing_alpha": smoothing_alpha,
    }
    if num_denoise_steps is not None:
        kwargs["num_denoise_steps"] = num_denoise_steps

    output = hf_model(
        text=[texts],
        length=[total_length],
        text_end=[text_end],
        **kwargs,
    )
    joints = _to_numpy_joints(output)

    expected_frames = _latent_tokens_to_frame_count(total_length)
    if joints.shape[0] != expected_frames:
        raise ValueError(
            f"Expected {expected_frames} frames for {total_length} latent tokens, "
            f"got {joints.shape[0]}",
        )
    return joints


def flooddiffusion_inference(
    *,
    mode: str = "single",
    text: str | None = None,
    length: int = 15,
    segments: list[dict] | None = None,
    num_denoise_steps: int | None = None,
    smoothing_alpha: float = 0.5,
    seed: int | None = None,
) -> tuple[np.ndarray, dict]:
    """Run FloodDiffusion inference.

    Args:
        mode: "single" or "streaming"
        text: Prompt for single mode
        length: Latent tokens for single mode
        segments: List of {text, endToken} for streaming mode
        num_denoise_steps: Optional denoising step override
        smoothing_alpha: EMA smoothing for joint output (0–1)
        seed: Optional RNG seed

    Returns:
        (joints_3d, flood_meta) where joints_3d is (frames, 22, 3)
    """
    import torch

    device = "cuda" if torch.cuda.is_available() else "cpu"
    if seed is not None:
        torch.manual_seed(seed)
        if torch.cuda.is_available():
            torch.cuda.manual_seed_all(seed)

    state = _load_model(device)
    model = state["model"]

    kwargs: dict[str, Any] = {
        "output_joints": True,
        "smoothing_alpha": smoothing_alpha,
    }
    if num_denoise_steps is not None:
        kwargs["num_denoise_steps"] = num_denoise_steps

    t0 = time.perf_counter()

    if mode == "streaming":
        if not segments:
            raise ValueError("streaming mode requires segments")
        texts = [seg["text"] for seg in segments]
        text_end = [seg["endToken"] for seg in segments]
        total_length = text_end[-1]
        joints = _multi_text_batch_inference(
            model,
            texts=texts,
            text_end=text_end,
            total_length=total_length,
            num_denoise_steps=num_denoise_steps,
            smoothing_alpha=smoothing_alpha,
        )
        flood_meta = _build_flood_meta(
            mode="streaming",
            latent_tokens=total_length,
            inference_ms=int((time.perf_counter() - t0) * 1000),
            segments=_segment_meta_from_request(segments),
            num_denoise_steps=num_denoise_steps,
        )
    else:
        if not text:
            raise ValueError("single mode requires text")
        output = model(text, length=length, **kwargs)
        joints = _to_numpy_joints(output)
        flood_meta = _build_flood_meta(
            mode="single",
            latent_tokens=length,
            inference_ms=int((time.perf_counter() - t0) * 1000),
            num_denoise_steps=num_denoise_steps,
        )

    return joints, flood_meta
