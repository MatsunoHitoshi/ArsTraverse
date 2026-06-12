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
    )
    .run_commands(
        "pip install flash-attn --no-build-isolation || "
        "echo 'WARNING: flash-attn install failed; model may fail at runtime'",
    )
    .add_local_file("projection.py", "/root/projection.py", copy=True)
    .add_local_file(
        "flooddiffusion_inference.py",
        "/root/flooddiffusion_inference.py",
        copy=True,
    )
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

    sys.path.insert(0, "/root")

    from flooddiffusion_inference import flooddiffusion_inference
    from projection import skeleton_to_json

    segments = (
        [s.model_dump() for s in request.segments] if request.segments else None
    )

    joints_3d, flood_meta = flooddiffusion_inference(
        mode=request.mode,
        text=request.text,
        length=request.length,
        segments=segments,
        num_denoise_steps=request.numDenoiseSteps,
        smoothing_alpha=request.smoothingAlpha,
        seed=request.seed,
    )

    result = skeleton_to_json(joints_3d, fps=20, include_metrics=True)
    result["model"] = "flooddiffusion"
    result["floodMeta"] = flood_meta
    return result


@app.function(image=flood_image)
@modal.fastapi_endpoint(method="GET")
def health() -> dict:
    """Health check endpoint."""
    return {"status": "ok", "models": ["flooddiffusion"], "variant": "tiny"}
