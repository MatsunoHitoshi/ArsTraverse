#!/bin/bash
# Download pretrained weights for MoMask + OmniControl.
# Uses direct Google Drive file IDs (gdown >=5 removed --fuzzy).
set -euo pipefail

# ────────────────────────────────────────────────────────────────────
# 1. MoMask HumanML3D checkpoints
# ────────────────────────────────────────────────────────────────────
T2M_DIR="/opt/momask/checkpoints/t2m"
mkdir -p "$T2M_DIR"
cd "$T2M_DIR"

echo "=== Downloading MoMask checkpoints ==="
gdown "1vXS7SHJBgWPt59wupQ5UUzhFObrnGkQ0" -O humanml3d_models.zip

echo "Unzipping MoMask..."
unzip -q humanml3d_models.zip
rm -f humanml3d_models.zip

if [ -d "checkpoints/t2m" ]; then
  mv checkpoints/t2m/* ./
  rm -rf checkpoints
fi

COUNT=$(find . -name opt.txt | wc -l | tr -d ' ')
echo "Found $COUNT MoMask checkpoint opt.txt files"
if [ "$COUNT" -eq 0 ]; then
  echo "ERROR: no MoMask checkpoints after unzip"
  ls -laR .
  exit 1
fi
find . -name opt.txt | head -10

# ────────────────────────────────────────────────────────────────────
# 2. OmniControl checkpoint (CMDM diffusion model)
# ────────────────────────────────────────────────────────────────────
OMNI_SAVE="/opt/omnicontrol/save"
mkdir -p "$OMNI_SAVE"
cd "$OMNI_SAVE"

echo "=== Downloading OmniControl checkpoint ==="
gdown "1oTkBtArc3xjqkYD6Id7LksrTOn3e1Zud" -O omnicontrol_ckpt.zip

echo "Unzipping OmniControl..."
unzip -q omnicontrol_ckpt.zip
rm -f omnicontrol_ckpt.zip

# flatten if nested
if [ -d "omnicontrol_ckpt/omnicontrol_ckpt" ]; then
  mv omnicontrol_ckpt/omnicontrol_ckpt/* omnicontrol_ckpt/
fi

if [ ! -f "omnicontrol_ckpt/model_humanml3d.pt" ]; then
  echo "ERROR: model_humanml3d.pt not found"
  ls -laR omnicontrol_ckpt/
  exit 1
fi
echo "OmniControl checkpoint OK"

# ────────────────────────────────────────────────────────────────────
# 3. SMPL body model (needed by OmniControl's Rotation2xyz init)
# ────────────────────────────────────────────────────────────────────
cd /opt/omnicontrol
mkdir -p body_models
cd body_models

echo "=== Downloading SMPL body model ==="
gdown "1INYlGA76ak_cKGzvpOV2Pe6RkYTlXTW2" -O smpl.zip
unzip -q smpl.zip
rm -f smpl.zip
echo "SMPL files OK"

# ────────────────────────────────────────────────────────────────────
# 4. Copy HumanML3D Mean/Std from MoMask → OmniControl dataset path
#    (GaussianDiffusion loads from ./dataset/HumanML3D/)
# ────────────────────────────────────────────────────────────────────
MEAN_SRC=$(find /opt/momask/checkpoints -name "mean.npy" -path "*/meta/*" | head -1)
STD_SRC=$(find /opt/momask/checkpoints -name "std.npy" -path "*/meta/*" | head -1)
HUMANML_DIR="/opt/omnicontrol/dataset/HumanML3D"
mkdir -p "$HUMANML_DIR"

if [ -n "$MEAN_SRC" ] && [ -n "$STD_SRC" ]; then
  cp "$MEAN_SRC" "$HUMANML_DIR/Mean.npy"
  cp "$STD_SRC" "$HUMANML_DIR/Std.npy"
  echo "Copied Mean/Std to $HUMANML_DIR"
else
  echo "WARNING: could not find MoMask mean/std to copy"
fi

echo "=== All downloads complete ==="
