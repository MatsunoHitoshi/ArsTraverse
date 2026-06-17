"""MoMask and OmniControl inference wrappers.

MoMask: Official gen_t2m.py VQ + masked-transformer pipeline.
OmniControl: Official CMDM diffusion pipeline with spatial guidance.
"""

from __future__ import annotations

import json
import os
import sys
from argparse import Namespace
from pathlib import Path

import numpy as np

MOMASK_DIR = Path("/opt/momask")
MOMASK_CHECKPOINTS = MOMASK_DIR / "checkpoints"
OMNICONTROL_DIR = Path("/opt/omnicontrol")
OMNICONTROL_CKPT = OMNICONTROL_DIR / "save" / "omnicontrol_ckpt" / "model_humanml3d.pt"

CLIP_VERSION = "ViT-B/32"
N_JOINTS_HUMANML = 22
OMNICONTROL_SEQ_LEN = 196  # model trained at this fixed length

_MOMASK_STATE: dict | None = None
_OMNICONTROL_STATE: dict | None = None


# ═══════════════════════════════════════════════════════════════════
# Shared helpers
# ═══════════════════════════════════════════════════════════════════

def _add_to_path(directory: Path) -> None:
    path_str = str(directory)
    if path_str not in sys.path:
        sys.path.insert(0, path_str)


# ═══════════════════════════════════════════════════════════════════
# MoMask helpers  (unchanged from previous implementation)
# ═══════════════════════════════════════════════════════════════════

def _momask_t2m_root() -> Path:
    root = MOMASK_CHECKPOINTS / "t2m"
    nested = root / "checkpoints" / "t2m"
    if nested.is_dir():
        return nested
    return root


def _find_checkpoint_dir(root: Path, name_predicate) -> Path:
    matches: list[Path] = []
    for opt_path in root.rglob("opt.txt"):
        model_root = opt_path.parent
        if not (model_root / "model").is_dir():
            continue
        if name_predicate(model_root.name):
            matches.append(model_root)

    if matches:
        matches.sort(key=lambda p: len(str(p)))
        return matches[0]

    available = sorted({p.parent.name for p in root.rglob("opt.txt")})
    raise FileNotFoundError(
        f"No matching checkpoint under {root}. "
        f"Available model dirs: {available or ['(none)']}"
    )


def _resolve_checkpoint_dir(root: Path, name: str) -> Path:
    direct = root / name
    if (direct / "opt.txt").exists():
        return direct
    for opt_path in root.rglob("opt.txt"):
        if opt_path.parent.name == name:
            return opt_path.parent
    raise FileNotFoundError(f"Checkpoint '{name}' not found under {root}")


def _patch_momask_numpy_compat() -> None:
    import re

    if not MOMASK_DIR.exists():
        return

    patterns = [
        (re.compile(r"np\.float\b"), "np.float64"),
        (re.compile(r"np\.int\b"), "np.int64"),
        (re.compile(r"np\.bool\b"), "np.bool_"),
    ]

    for path in MOMASK_DIR.rglob("*.py"):
        try:
            text = path.read_text()
        except OSError:
            continue
        patched = text
        for pattern, replacement in patterns:
            patched = pattern.sub(replacement, patched)
        if patched != text:
            path.write_text(patched)


def _load_momask_models(device):
    global _MOMASK_STATE
    if _MOMASK_STATE is not None:
        return _MOMASK_STATE

    _add_to_path(MOMASK_DIR)
    _patch_momask_numpy_compat()

    import torch
    import torch.nn.functional as F

    from models.mask_transformer.transformer import MaskTransformer, ResidualTransformer
    from models.vq.model import RVQVAE
    from utils.get_opt import get_opt

    dim_pose = 263
    t2m_root = _momask_t2m_root()

    model_dir = _find_checkpoint_dir(
        t2m_root,
        lambda n: n.startswith("t2m_") and "nlayer" in n and not n.startswith("tres_"),
    )
    res_dir = _find_checkpoint_dir(
        t2m_root,
        lambda n: n.startswith("tres_"),
    )

    model_opt = get_opt(str(model_dir / "opt.txt"), device=device)

    vq_dir = _resolve_checkpoint_dir(t2m_root, model_opt.vq_name)
    vq_opt = get_opt(str(vq_dir / "opt.txt"), device=device)
    vq_opt.dim_pose = dim_pose

    vq_model = RVQVAE(
        vq_opt,
        vq_opt.dim_pose,
        vq_opt.nb_code,
        vq_opt.code_dim,
        vq_opt.output_emb_width,
        vq_opt.down_t,
        vq_opt.stride_t,
        vq_opt.width,
        vq_opt.depth,
        vq_opt.dilation_growth_rate,
        vq_opt.vq_act,
        vq_opt.vq_norm,
    )
    vq_ckpt = torch.load(str(vq_dir / "model" / "net_best_fid.tar"), map_location="cpu")
    vq_key = "vq_model" if "vq_model" in vq_ckpt else "net"
    vq_model.load_state_dict(vq_ckpt[vq_key])

    model_opt.num_tokens = vq_opt.nb_code
    model_opt.num_quantizers = vq_opt.num_quantizers
    model_opt.code_dim = vq_opt.code_dim

    t2m_transformer = MaskTransformer(
        code_dim=model_opt.code_dim,
        cond_mode="text",
        latent_dim=model_opt.latent_dim,
        ff_size=model_opt.ff_size,
        num_layers=model_opt.n_layers,
        num_heads=model_opt.n_heads,
        dropout=model_opt.dropout,
        clip_dim=512,
        cond_drop_prob=model_opt.cond_drop_prob,
        clip_version=CLIP_VERSION,
        opt=model_opt,
    )
    trans_ckpt = torch.load(str(model_dir / "model" / "latest.tar"), map_location="cpu")
    trans_key = "t2m_transformer" if "t2m_transformer" in trans_ckpt else "trans"
    t2m_transformer.load_state_dict(trans_ckpt[trans_key], strict=False)

    res_opt = get_opt(str(res_dir / "opt.txt"), device=device)
    res_opt.num_quantizers = vq_opt.num_quantizers
    res_opt.num_tokens = vq_opt.nb_code

    res_model = ResidualTransformer(
        code_dim=vq_opt.code_dim,
        cond_mode="text",
        latent_dim=res_opt.latent_dim,
        ff_size=res_opt.ff_size,
        num_layers=res_opt.n_layers,
        num_heads=res_opt.n_heads,
        dropout=res_opt.dropout,
        clip_dim=512,
        shared_codebook=vq_opt.shared_codebook,
        cond_drop_prob=res_opt.cond_drop_prob,
        share_weight=res_opt.share_weight,
        clip_version=CLIP_VERSION,
        opt=res_opt,
    )
    res_ckpt = torch.load(str(res_dir / "model" / "net_best_fid.tar"), map_location="cpu")
    res_model.load_state_dict(res_ckpt["res_transformer"], strict=False)

    mean = np.load(str(vq_dir / "meta" / "mean.npy"))
    std = np.load(str(vq_dir / "meta" / "std.npy"))

    vq_model.to(device).eval()
    t2m_transformer.to(device).eval()
    res_model.to(device).eval()

    _MOMASK_STATE = {
        "vq_model": vq_model,
        "t2m_transformer": t2m_transformer,
        "res_model": res_model,
        "mean": mean,
        "std": std,
        "device": device,
        "F": F,
    }
    return _MOMASK_STATE


# ═══════════════════════════════════════════════════════════════════
# MoMask inference
# ═══════════════════════════════════════════════════════════════════

def momask_inference(
    text: str,
    num_frames: int = 24,
    seed: int | None = None,
) -> np.ndarray:
    """Run MoMask text-to-motion generation.

    Returns:
        joints_3d: (num_frames, 22, 3) numpy array of joint positions.
    """
    _add_to_path(MOMASK_DIR)
    _patch_momask_numpy_compat()

    import torch
    from utils.motion_process import recover_from_ric

    if seed is not None:
        torch.manual_seed(seed)
        np.random.seed(seed)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    state = _load_momask_models(device)

    vq_model = state["vq_model"]
    t2m_transformer = state["t2m_transformer"]
    res_model = state["res_model"]
    mean = state["mean"]
    std = state["std"]

    m_length = max(4, (num_frames // 4) * 4)
    token_lens = torch.tensor([m_length // 4], dtype=torch.long, device=device)

    captions = [text]
    cond_scale = 4.0
    time_steps = 10

    with torch.no_grad():
        mids = t2m_transformer.generate(
            captions,
            token_lens,
            timesteps=time_steps,
            cond_scale=cond_scale,
            temperature=1.0,
            topk_filter_thres=0.9,
            gsample=False,
        )
        mids = res_model.generate(mids, captions, token_lens, temperature=1, cond_scale=5)
        pred_motions = vq_model.forward_decoder(mids)

    motion_np = pred_motions[0].detach().cpu().numpy()
    motion_np = motion_np[:m_length] * std + mean

    joints = recover_from_ric(torch.from_numpy(motion_np).float(), 22).numpy()

    if joints.shape[0] < num_frames:
        pad = np.repeat(joints[-1:], num_frames - joints.shape[0], axis=0)
        joints = np.concatenate([joints, pad], axis=0)

    return joints[:num_frames]


# ═══════════════════════════════════════════════════════════════════
# OmniControl helpers
# ═══════════════════════════════════════════════════════════════════

def _load_omnicontrol_args() -> Namespace:
    """Load model args from checkpoint's args.json."""
    args_path = OMNICONTROL_CKPT.parent / "args.json"
    if args_path.exists():
        with open(args_path) as f:
            model_args = json.load(f)
    else:
        model_args = {}

    defaults = {
        "dataset": "humanml",
        "arch": "trans_enc",
        "layers": 8,
        "latent_dim": 512,
        "cond_mode": "both_text_spatial",
        "cond_mask_prob": 0.1,
        "emb_trans_dec": False,
        "noise_schedule": "cosine",
        "diffusion_steps": 1000,
        "sigma_small": True,
        "lambda_vel": 0.0,
        "lambda_rcxyz": 0.0,
        "lambda_fc": 0.0,
        "guidance_param": 2.5,
    }
    defaults.update(model_args)
    return Namespace(**defaults)


def _build_omnicontrol_model_kwargs(
    text: str,
    n_frames: int,
    hint: "torch.Tensor | None",
    device: "torch.device",
) -> dict:
    """Create model_kwargs dict for OmniControl diffusion sampling.

    When hint is None the key is omitted so that p_sample skips the
    expensive spatial-guidance gradient loop (the CMDM model handles
    missing hints internally by zeroing the control signal).
    """
    import torch

    lengths = torch.tensor([n_frames], dtype=torch.long, device=device)
    mask = (
        torch.arange(n_frames, device=device).unsqueeze(0) < lengths.unsqueeze(1)
    ).unsqueeze(1).unsqueeze(1)

    y: dict = {
        "mask": mask,
        "lengths": lengths,
        "text": [text],
    }

    if hint is not None:
        y["hint"] = hint.to(device)

    return {"y": y}


def _create_spatial_hint(
    spatial_control: dict | None,
    n_frames: int,
    raw_mean: np.ndarray,
    raw_std: np.ndarray,
) -> "torch.Tensor | None":
    """Convert our API's spatial control to OmniControl's hint tensor.

    OmniControl hint: (batch, n_frames, n_joints*3), normalized, zero where no control.
    """
    if not spatial_control:
        return None

    import torch

    joint_map = {"pelvis": 0, "left_foot": 10, "right_foot": 11, "head": 15, "left_wrist": 20, "right_wrist": 21}
    joint_idx = joint_map.get(spatial_control.get("controlJoint", "pelvis"), 0)

    start = spatial_control["startPosition"]
    end = spatial_control["endPosition"]
    start_pos = np.array([start["x"], 0.0, start["y"]], dtype=np.float32) / 30.0
    end_pos = np.array([end["x"], 0.0, end["y"]], dtype=np.float32) / 30.0

    hint = np.zeros((1, n_frames, N_JOINTS_HUMANML, 3), dtype=np.float32)

    density = max(2, n_frames // 10)
    control_frames = np.linspace(0, n_frames - 1, density, dtype=int)
    for f_idx in control_frames:
        t = f_idx / max(n_frames - 1, 1)
        pos = start_pos + (end_pos - start_pos) * t
        normalized = (pos - raw_mean.reshape(N_JOINTS_HUMANML, 3)[joint_idx]) / (
            raw_std.reshape(N_JOINTS_HUMANML, 3)[joint_idx] + 1e-8
        )
        hint[0, f_idx, joint_idx] = normalized

    hint = hint.reshape(1, n_frames, N_JOINTS_HUMANML * 3)
    return torch.from_numpy(hint).float()


def _stub_omnicontrol_rotation2xyz() -> None:
    """Skip SMPL/chumpy init in CMDM; our API path uses recover_from_ric only."""
    import types

    if "model.rotation2xyz" in sys.modules:
        return

    stub_mod = types.ModuleType("model.rotation2xyz")

    class _DummySmpl:
        def _apply(self, fn):
            pass

        def train(self, *args, **kwargs):
            pass

    class Rotation2xyz:
        def __init__(self, device="cpu", dataset="amass"):
            self.device = device
            self.dataset = dataset
            self.smpl_model = _DummySmpl()

        def _apply(self, fn):
            pass

        def train(self, *args, **kwargs):
            pass

    stub_mod.Rotation2xyz = Rotation2xyz
    sys.modules["model.rotation2xyz"] = stub_mod


def _load_omnicontrol_models(device):
    """Load OmniControl CMDM model + diffusion once per container."""
    global _OMNICONTROL_STATE
    if _OMNICONTROL_STATE is not None:
        return _OMNICONTROL_STATE

    import torch

    _add_to_path(OMNICONTROL_DIR)
    _stub_omnicontrol_rotation2xyz()

    saved_cwd = os.getcwd()
    os.chdir(str(OMNICONTROL_DIR))

    try:
        from model.cmdm import CMDM
        from model.cfg_sampler import ClassifierFreeSampleModel
        from diffusion import gaussian_diffusion as gd
        from diffusion.respace import SpacedDiffusion, space_timesteps

        args = _load_omnicontrol_args()

        # --- Build model ---
        model_kwargs = {
            "modeltype": "",
            "njoints": 263,
            "nfeats": 1,
            "num_actions": 1,
            "translation": True,
            "pose_rep": "rot6d",
            "glob": True,
            "glob_rot": True,
            "latent_dim": args.latent_dim,
            "ff_size": 1024,
            "num_layers": args.layers,
            "num_heads": 4,
            "dropout": 0.1,
            "activation": "gelu",
            "data_rep": "hml_vec",
            "cond_mode": args.cond_mode,
            "cond_mask_prob": args.cond_mask_prob,
            "action_emb": "tensor",
            "arch": args.arch,
            "emb_trans_dec": args.emb_trans_dec,
            "clip_version": CLIP_VERSION,
            "dataset": args.dataset,
        }

        model = CMDM(**model_kwargs)

        print(f"Loading OmniControl checkpoint from [{OMNICONTROL_CKPT}]...")
        state_dict = torch.load(str(OMNICONTROL_CKPT), map_location="cpu")
        missing, unexpected = model.load_state_dict(state_dict, strict=False)
        assert all(k.startswith("clip_model.") for k in missing), (
            f"Unexpected missing keys: {[k for k in missing if not k.startswith('clip_model.')]}"
        )

        model = ClassifierFreeSampleModel(model)
        model.to(device).eval()

        # --- Build diffusion ---
        betas = gd.get_named_beta_schedule(args.noise_schedule, 1000)
        diffusion = SpacedDiffusion(
            use_timesteps=space_timesteps(1000, [1000]),
            betas=betas,
            model_mean_type=gd.ModelMeanType.START_X,
            model_var_type=gd.ModelVarType.FIXED_SMALL,
            loss_type=gd.LossType.MSE,
            rescale_timesteps=False,
            lambda_vel=0.0,
            lambda_rcxyz=0.0,
            lambda_fc=0.0,
            dataset=args.dataset,
        )

        # Motion normalization (same as HumanML3D dataset)
        humanml_dir = OMNICONTROL_DIR / "dataset" / "HumanML3D"
        mean = np.load(str(humanml_dir / "Mean.npy"))
        std = np.load(str(humanml_dir / "Std.npy"))

        spatial_norm_dir = OMNICONTROL_DIR / "dataset" / "humanml_spatial_norm"
        raw_mean = np.load(str(spatial_norm_dir / "Mean_raw.npy"))
        raw_std = np.load(str(spatial_norm_dir / "Std_raw.npy"))

    finally:
        os.chdir(saved_cwd)

    _OMNICONTROL_STATE = {
        "model": model,
        "diffusion": diffusion,
        "mean": mean,
        "std": std,
        "raw_mean": raw_mean,
        "raw_std": raw_std,
        "device": device,
        "guidance_param": args.guidance_param,
    }
    return _OMNICONTROL_STATE


# ═══════════════════════════════════════════════════════════════════
# OmniControl inference
# ═══════════════════════════════════════════════════════════════════

def omnicontrol_inference(
    text: str,
    num_frames: int = 24,
    spatial_control: dict | None = None,
    seed: int | None = None,
) -> np.ndarray:
    """Run OmniControl CMDM diffusion text-to-motion with optional spatial guidance.

    Always returns the full model sequence (196 frames). Diffusion cost is fixed
    at 196 frames regardless of num_frames; that parameter is ignored here.

    Returns:
        joints_3d: (196, 22, 3) numpy array of joint positions.
    """
    import torch

    _add_to_path(MOMASK_DIR)
    _patch_momask_numpy_compat()
    from utils.motion_process import recover_from_ric

    if seed is not None:
        torch.manual_seed(seed)
        np.random.seed(seed)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    state = _load_omnicontrol_models(device)

    model = state["model"]
    diffusion = state["diffusion"]
    mean = state["mean"]
    std = state["std"]
    guidance_param = state["guidance_param"]

    # OmniControl always generates fixed-length 196-frame sequences
    n_frames = OMNICONTROL_SEQ_LEN

    hint = _create_spatial_hint(
        spatial_control, n_frames, state["raw_mean"], state["raw_std"]
    )
    model_kwargs = _build_omnicontrol_model_kwargs(text, n_frames, hint, device)

    model_kwargs["y"]["scale"] = (
        torch.ones(1, device=device) * guidance_param
    )

    sample_fn = diffusion.p_sample_loop

    with torch.no_grad():
        sample = sample_fn(
            model,
            (1, model.njoints, model.nfeats, n_frames),
            clip_denoised=False,
            model_kwargs=model_kwargs,
            skip_timesteps=0,
            init_image=None,
            progress=True,
            dump_steps=None,
            noise=None,
            const_noise=False,
        )

    # Post-process: inverse-normalize → recover 3D joints
    # sample shape: (1, 263, 1, T) → permute → (1, 1, T, 263) → squeeze → (1, T, 263)
    sample = sample[:, :263].cpu().permute(0, 2, 3, 1).float().squeeze(1)
    std_t = torch.from_numpy(std).float()
    mean_t = torch.from_numpy(mean).float()
    sample = sample * std_t + mean_t

    joints = recover_from_ric(sample, N_JOINTS_HUMANML)  # (1, T, 22, 3)
    return joints.squeeze(0).numpy()  # (196, 22, 3)
