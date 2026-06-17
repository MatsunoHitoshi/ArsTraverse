# T2M GPU Worker

Text-to-Motion inference workers running on [Modal](https://modal.com/) with GPU acceleration.

## Supported Models

### modal_app.py — MoMask / OmniControl

- **MoMask**: VQ-VAE + masked-transformer pipeline (official `gen_t2m.py` logic)
- **OmniControl**: CMDM diffusion with spatial guidance (official `model_humanml3d.pt` checkpoint, ICLR 2024)

### modal_flooddiffusion_app.py — FloodDiffusion

- **FloodDiffusionTiny**: Hugging Face [ShandaAI/FloodDiffusionTiny](https://huggingface.co/ShandaAI/FloodDiffusionTiny)
- Single-prompt and multi-text streaming (`text_end`) generation
- Outputs 22×3 joint coordinates compatible with `projection.py`

## Setup

Checkpoint downloads use `gdown` with direct Google Drive file IDs
(MoMask's upstream `--fuzzy` flag is broken on gdown 5+).

1. Install Modal CLI:

```bash
pip install modal
modal setup  # authenticate
```

2. Development (hot-reload):

```bash
# MoMask / OmniControl
modal serve modal_app.py

# FloodDiffusion (separate app)
modal serve modal_flooddiffusion_app.py
```

3. Production deploy:

```bash
modal deploy modal_app.py
modal deploy modal_flooddiffusion_app.py
```

### FloodDiffusion: optional Hugging Face token

Public model weights download without a token, but rate limits may apply during cold starts.
Recommended for production:

```bash
modal secret create huggingface HF_TOKEN=hf_xxxx
```

The FloodDiffusion app references this secret when present.

## API

### POST /generate (modal_app.py)

Generate skeleton motion from a text prompt.

Request body:

```json
{
  "text": "a person walks forward",
  "numFrames": 24,
  "model": "momask",
  "spatialControl": null,
  "seed": null
}
```

Response:

```json
{
  "fps": 20,
  "jointNames": ["pelvis", "left_hip", ...],
  "boneConnections": [[0,1], [0,2], ...],
  "frames": [[[0, 0], [-10.2, 5.1], ...], ...],
  "frames3d": [[[0, 0, 0], [-10.2, 5.1, 2.3], ...], ...],
  "metrics": {
    "footSkatingRatio": 0.12,
    "jointJitter": 0.034,
    "totalFrames": 60
  },
  "model": "momask"
}
```

### POST /generate (modal_flooddiffusion_app.py)

FloodDiffusion generation (single or streaming).

Single mode:

```json
{
  "mode": "single",
  "text": "a person walks forward",
  "length": 15,
  "smoothingAlpha": 0.5,
  "seed": null
}
```

Streaming mode:

```json
{
  "mode": "streaming",
  "segments": [
    { "text": "a person walks forward", "endToken": 20 },
    { "text": "a person turns around", "endToken": 40 },
    { "text": "a person runs", "endToken": 60 }
  ],
  "smoothingAlpha": 0.5
}
```

Response includes `floodMeta` with `mode`, `latentTokens`, `inferenceMs`, and optional `segments`.

Note: `length` / `endToken` are **latent token** counts. Output frames = `1 + (tokens - 1) × 4` (first latent → 1 frame, then 4/frame) at 20 FPS. Example: 60 tokens → 237 frames.

### GET /health

Health check endpoint for each app.

## Next.js integration

Set in `.env`:

```env
MODAL_ENDPOINT_URL=https://...t2m-motion-worker-generate.modal.run
# modal serve 時は -generate-dev、modal deploy 後は -generate（-dev なし）
MODAL_FLOODDIFFUSION_URL=https://...flooddiffusion-motion-worker-generate-dev.modal.run
```

Motion Comparison Lab (`/dev/motion-comparison-lab`) uses both endpoints.
