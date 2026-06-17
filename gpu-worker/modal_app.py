"""Modal app for Text-to-Motion inference (MoMask / OmniControl).

Usage:
    modal serve modal_app.py   # dev (hot-reload)
    modal deploy modal_app.py  # production
"""

from __future__ import annotations

from typing import Optional

import modal
from pydantic import BaseModel, Field

app = modal.App("t2m-motion-worker")

# ---------------------------------------------------------------------------
# Modal Image
# ---------------------------------------------------------------------------

t2m_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git", "git-lfs", "ffmpeg", "unzip")
    .pip_install(
        "torch>=2.1.0",
        "numpy>=1.24.0,<2.0",
        "scipy>=1.11.0",
        "pydantic>=2.0.0",
        "fastapi[standard]>=0.115.0",
        "gdown>=5.0.0",
        "einops==0.6.1",
        "vector-quantize-pytorch==1.6.30",
        "tqdm",
        "matplotlib",
        "scikit-learn",
        "joblib",
        "ftfy",
        "regex",
        "smplx",
        "clip @ git+https://github.com/openai/CLIP.git",
    )
    .run_commands(
        "git clone --depth 1 https://github.com/EricGuo5513/momask-codes.git /opt/momask",
        "git clone --depth 1 https://github.com/neu-vi/omnicontrol.git /opt/omnicontrol",
        # Patch deprecated NumPy aliases (np.float, np.int, np.bool) in both repos
        "find /opt/momask /opt/omnicontrol -name '*.py' -exec sed -i -E "
        "'s/np\\.float([^0-9_]|$)/np.float64\\1/g; s/np\\.int([^0-9_]|$)/np.int64\\1/g; "
        "s/np\\.bool([^_]|$)/np.bool_\\1/g' {} +",
    )
    .add_local_file("download_checkpoints.sh", "/root/download_checkpoints.sh", copy=True)
    .run_commands(
        "chmod +x /root/download_checkpoints.sh && bash /root/download_checkpoints.sh",
        "pip install 'numpy==1.26.4' --force-reinstall --no-deps",
    )
    # Hot-reload mounts (must be last — no run_commands after these)
    .add_local_file("projection.py", "/root/projection.py")
    .add_local_file("inference.py", "/root/inference.py")
)

# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------


class SpatialControl(BaseModel):
    startPosition: dict = Field(..., description="Start {x, y}")
    endPosition: dict = Field(..., description="End {x, y}")
    controlJoint: str = Field(default="pelvis")


class GenerateRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=500)
    numFrames: int = Field(default=24, ge=10, le=300)
    model: str = Field(default="momask", pattern="^(momask|omnicontrol)$")
    spatialControl: Optional[SpatialControl] = None
    seed: Optional[int] = None


# ---------------------------------------------------------------------------
# GPU function
# ---------------------------------------------------------------------------


@app.function(
    image=t2m_image,
    gpu="T4",
    timeout=300,
    memory=16384,
)
@modal.fastapi_endpoint(method="POST")
def generate(request: GenerateRequest) -> dict:
    """Generate skeleton motion from text prompt."""
    import sys

    sys.path.insert(0, "/root")
    sys.path.insert(0, "/opt/momask")

    from inference import momask_inference, omnicontrol_inference
    from projection import skeleton_to_json, trim_static_ends

    spatial_dict = (
        request.spatialControl.model_dump() if request.spatialControl else None
    )

    trim_info = None
    if request.model == "omnicontrol":
        joints_3d = omnicontrol_inference(
            text=request.text,
            num_frames=request.numFrames,
            spatial_control=spatial_dict,
            seed=request.seed,
        )
        joints_3d, trim_info = trim_static_ends(joints_3d)
    else:
        joints_3d = momask_inference(
            text=request.text,
            num_frames=request.numFrames,
            seed=request.seed,
        )

    result = skeleton_to_json(
        joints_3d,
        fps=20,
        include_metrics=True,
        spatial_control=spatial_dict,
        trim_info=trim_info,
    )
    result["model"] = request.model
    return result


@app.function(image=t2m_image)
@modal.fastapi_endpoint(method="GET")
def health() -> dict:
    """Health check endpoint."""
    return {"status": "ok", "models": ["momask", "omnicontrol"]}
