"""Modal app for FloodDiffusion inference (HF FloodDiffusionTiny).

Usage:
    modal serve modal_flooddiffusion_app.py   # dev (hot-reload)
    modal deploy modal_flooddiffusion_app.py  # production

Optional HF token (recommended for model download rate limits):
    modal secret create huggingface HF_TOKEN=hf_xxxx
"""

from __future__ import annotations

from typing import Literal, Optional

import modal
from pydantic import BaseModel, Field

app = modal.App("flooddiffusion-motion-worker")

# Optional HF token: modal secret create huggingface HF_TOKEN=hf_xxxx
# then add secrets=[modal.Secret.from_name("huggingface")] to @app.function

# ---------------------------------------------------------------------------
# Modal Image
# ---------------------------------------------------------------------------

flood_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git", "git-lfs", "build-essential")
    .pip_install(
        "torch>=2.1.0",
        "numpy>=1.24.0,<2.0",
        "transformers>=4.40.0",
        "huggingface_hub>=0.23.0",
        "lightning>=2.0.0",
        "diffusers>=0.27.0",
        "omegaconf>=2.3.0",
        "ftfy",
        "pydantic>=2.0.0",
        "fastapi[standard]>=0.115.0",
        "tqdm",
        "regex",
        "safetensors",
        "sentencepiece>=0.1.99",
        "protobuf",
    )
    .run_commands(
        # google/umt5-base config.json lacks model_type; patch before first load
        "python -c \""
        "from huggingface_hub import snapshot_download; "
        "import json, os; "
        "p = snapshot_download('google/umt5-base'); "
        "cfg = os.path.join(p, 'config.json'); "
        "c = json.load(open(cfg)); "
        "c.setdefault('model_type', 'umt5'); "
        "json.dump(c, open(cfg, 'w'), indent=2); "
        "print('patched umt5 config at', cfg)"
        "\"",
    )
    # No copy=True so modal serve hot-reloads local changes
    .add_local_file("projection.py", "/root/projection.py")
    .add_local_file("flooddiffusion_inference.py", "/root/flooddiffusion_inference.py")
)

# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------


class FloodSegment(BaseModel):
    text: str = Field(..., min_length=1, max_length=500)
    endToken: int = Field(..., ge=1, le=120)


class FloodGenerateRequest(BaseModel):
    mode: Literal["single", "streaming"] = "single"
    text: Optional[str] = Field(default=None, max_length=500)
    length: int = Field(default=15, ge=5, le=120)
    segments: Optional[list[FloodSegment]] = None
    numDenoiseSteps: Optional[int] = Field(default=None, ge=5, le=100)
    smoothingAlpha: float = Field(default=0.5, ge=0.0, le=1.0)
    seed: Optional[int] = None


# ---------------------------------------------------------------------------
# GPU function
# ---------------------------------------------------------------------------


@app.function(
    image=flood_image,
    gpu="T4",
    timeout=600,
    memory=16384,
)
@modal.fastapi_endpoint(method="POST")
def generate(request: FloodGenerateRequest) -> dict:
    """Generate skeleton motion via FloodDiffusion."""
    import sys
    import traceback

    from fastapi import HTTPException

    sys.path.insert(0, "/root")

    from flooddiffusion_inference import flooddiffusion_inference
    from projection import skeleton_to_json

    segments = (
        [s.model_dump() for s in request.segments] if request.segments else None
    )

    try:
        joints_3d, flood_meta = flooddiffusion_inference(
            mode=request.mode,
            text=request.text,
            length=request.length,
            segments=segments,
            num_denoise_steps=request.numDenoiseSteps,
            smoothing_alpha=request.smoothingAlpha,
            seed=request.seed,
        )
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"FloodDiffusion inference failed: {exc}",
        ) from exc

    result = skeleton_to_json(joints_3d, fps=20, include_metrics=True)
    result["model"] = "flooddiffusion"
    result["floodMeta"] = flood_meta
    return result


@app.function(image=flood_image)
@modal.fastapi_endpoint(method="GET")
def health() -> dict:
    """Health check endpoint."""
    return {"status": "ok", "models": ["flooddiffusion"], "variant": "tiny"}
