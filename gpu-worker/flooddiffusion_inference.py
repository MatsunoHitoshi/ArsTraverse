"""FloodDiffusion (HF) inference wrapper.

Loads ShandaAI/FloodDiffusionTiny via transformers AutoModel and returns
22×3 joint coordinates for projection.py skeleton_to_json().
"""

from __future__ import annotations

import time
from typing import Any

import numpy as np

FLOOD_MODEL_ID = "ShandaAI/FloodDiffusionTiny"
FLOOD_LATENT_TO_FRAME_RATIO = 4

_FLOOD_STATE: dict[str, Any] | None = None


def _load_model(device: str):
    """Load FloodDiffusionTiny once per container."""
    global _FLOOD_STATE
    if _FLOOD_STATE is not None:
        return _FLOOD_STATE

    import torch
    from transformers import AutoModel

    print(f"Loading FloodDiffusion from [{FLOOD_MODEL_ID}] on {device}...")
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
    return [
        {
            "text": seg["text"],
            "endToken": seg["endToken"],
            "endFrame": seg["endToken"] * FLOOD_LATENT_TO_FRAME_RATIO,
        }
        for seg in segments
    ]


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
        output = model(
            [texts],
            length=[total_length],
            text_end=[text_end],
            **kwargs,
        )
        joints = _to_numpy_joints(output)
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
