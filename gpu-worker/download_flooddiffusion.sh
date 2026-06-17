#!/usr/bin/env bash
# Pre-download FloodDiffusionTiny weights into HF cache (optional, for faster cold starts).
set -euo pipefail

MODEL_ID="${FLOOD_MODEL_ID:-ShandaAI/FloodDiffusionTiny}"

echo "=== Downloading ${MODEL_ID} ==="
python3 - <<'PY'
import os
from transformers import AutoModel

model_id = os.environ.get("FLOOD_MODEL_ID", "ShandaAI/FloodDiffusionTiny")
print(f"Fetching {model_id} ...")
AutoModel.from_pretrained(model_id, trust_remote_code=True)
print("OK")
PY

echo "FloodDiffusion checkpoint cached."
