"""3D skeletal joint data to 2D projection and JSON serialization."""

from __future__ import annotations

import numpy as np

HUMANML3D_JOINT_NAMES = [
    "pelvis",
    "left_hip",
    "right_hip",
    "spine1",
    "left_knee",
    "right_knee",
    "spine2",
    "left_ankle",
    "right_ankle",
    "spine3",
    "left_foot",
    "right_foot",
    "neck",
    "left_collar",
    "right_collar",
    "head",
    "left_shoulder",
    "right_shoulder",
    "left_elbow",
    "right_elbow",
    "left_wrist",
    "right_wrist",
]

HUMANML3D_BONE_CONNECTIONS: list[tuple[int, int]] = [
    (0, 1),   # pelvis -> left_hip
    (0, 2),   # pelvis -> right_hip
    (0, 3),   # pelvis -> spine1
    (1, 4),   # left_hip -> left_knee
    (2, 5),   # right_hip -> right_knee
    (3, 6),   # spine1 -> spine2
    (4, 7),   # left_knee -> left_ankle
    (5, 8),   # right_knee -> right_ankle
    (6, 9),   # spine2 -> spine3
    (7, 10),  # left_ankle -> left_foot
    (8, 11),  # right_ankle -> right_foot
    (9, 12),  # spine3 -> neck
    (9, 13),  # spine3 -> left_collar
    (9, 14),  # spine3 -> right_collar
    (12, 15), # neck -> head
    (13, 16), # left_collar -> left_shoulder
    (14, 17), # right_collar -> right_shoulder
    (16, 18), # left_shoulder -> left_elbow
    (17, 19), # right_shoulder -> right_elbow
    (18, 20), # left_elbow -> left_wrist
    (19, 21), # right_elbow -> right_wrist
]


def project_to_2d(joints_3d: np.ndarray) -> np.ndarray:
    """Orthographic side-view projection, centered on pelvis.

    HumanML3D coords: X=lateral, Y=up, Z=forward.
    We project onto the sagittal plane (Z forward, Y up) so walking motion
    reads naturally instead of a top-down floor plan.

    Args:
        joints_3d: (num_frames, num_joints, 3) array in XYZ space.

    Returns:
        (num_frames, num_joints, 2) array: [horizontal=Z, vertical=Y], pelvis-centered.
    """
    joints_2d = joints_3d[:, :, [2, 1]]  # Z (forward), Y (up)
    pelvis = joints_2d[:, 0:1, :]
    return joints_2d - pelvis


def compute_trajectory_adherence(
    joints_3d: np.ndarray,
    start_pos: list[float],
    end_pos: list[float],
    joint_idx: int = 0,
) -> float:
    """Measure how well the pelvis follows the intended trajectory.

    Returns value in [0, 1] where 1 means perfect adherence.
    """
    pelvis_trajectory = joints_3d[:, joint_idx, [0, 2]]  # X, Z plane
    start = np.array(start_pos[:2])
    end = np.array(end_pos[:2])

    intended_length = np.linalg.norm(end - start)
    if intended_length < 1e-6:
        return 1.0

    direction = (end - start) / intended_length
    actual_start = pelvis_trajectory[0]
    actual_end = pelvis_trajectory[-1]

    start_err = np.linalg.norm(actual_start - start)
    end_err = np.linalg.norm(actual_end - end)
    avg_endpoint_err = (start_err + end_err) / 2

    # Compute max lateral deviation from the intended line
    projections = np.dot(pelvis_trajectory - start, direction)
    perpendicular = pelvis_trajectory - start - np.outer(projections, direction)
    max_deviation = float(np.max(np.linalg.norm(perpendicular, axis=-1)))

    adherence = max(
        0.0,
        1.0
        - (avg_endpoint_err / intended_length) * 0.5
        - (max_deviation / intended_length) * 0.5,
    )
    return round(adherence, 4)


def compute_frame_intensity_3d(joints_3d: np.ndarray) -> np.ndarray:
    """Per-frame mean joint displacement in 3D (frame 0 is always 0)."""
    num_frames = joints_3d.shape[0]
    if num_frames <= 1:
        return np.zeros(num_frames)

    intensities = np.zeros(num_frames)
    for i in range(1, num_frames):
        diff = joints_3d[i] - joints_3d[i - 1]
        intensities[i] = float(np.mean(np.linalg.norm(diff, axis=-1)))
    return intensities


def trim_static_ends(
    joints_3d: np.ndarray,
    *,
    min_frames: int = 12,
    threshold_ratio: float = 0.08,
) -> tuple[np.ndarray, dict]:
    """Remove leading/trailing frames where motion intensity stays near zero.

    OmniControl often pads with static poses at the start and end of the
    fixed 196-frame output. Trimming improves loop playback and comparison.
    """
    num_frames = joints_3d.shape[0]
    no_trim = {
        "trimStartFrame": 0,
        "trimEndFrame": num_frames - 1,
        "originalFrames": num_frames,
        "trimmed": False,
    }
    if num_frames <= min_frames:
        return joints_3d, no_trim

    intensities = compute_frame_intensity_3d(joints_3d)
    peak = float(np.max(intensities))
    if peak < 1e-6:
        return joints_3d, no_trim

    nonzero = intensities[intensities > 0]
    p10 = float(np.percentile(nonzero, 10)) if len(nonzero) > 0 else 0.01
    threshold = max(peak * threshold_ratio, p10 * 0.5, 0.005)

    start = 0
    for i in range(1, num_frames):
        if intensities[i] > threshold:
            start = max(0, i - 1)
            break

    end = num_frames - 1
    for i in range(num_frames - 1, 0, -1):
        if intensities[i] > threshold:
            end = min(num_frames - 1, i + 1)
            break

    if end - start + 1 < min_frames or (start == 0 and end == num_frames - 1):
        return joints_3d, no_trim

    trimmed = joints_3d[start : end + 1]
    return trimmed, {
        "trimStartFrame": int(start),
        "trimEndFrame": int(end),
        "originalFrames": num_frames,
        "trimmed": True,
        "trimmedFrames": int(trimmed.shape[0]),
    }


def compute_metrics(joints_3d: np.ndarray, fps: int) -> dict:
    """Compute quality metrics for generated motion.

    Returns dict with footSkatingRatio, jointJitter, totalFrames.
    """
    num_frames = joints_3d.shape[0]

    foot_indices = [10, 11]  # left_foot, right_foot
    foot_positions = joints_3d[:, foot_indices, :]

    skating_frames = 0
    ground_threshold = 0.05
    velocity_threshold = 0.02

    for f in range(1, num_frames):
        for fi in range(len(foot_indices)):
            height = foot_positions[f, fi, 1]
            if height < ground_threshold:
                velocity = np.linalg.norm(
                    foot_positions[f, fi, [0, 2]] - foot_positions[f - 1, fi, [0, 2]]
                )
                if velocity > velocity_threshold:
                    skating_frames += 1

    total_ground_frames = max(
        1,
        sum(
            1
            for f in range(num_frames)
            for fi in range(len(foot_indices))
            if foot_positions[f, fi, 1] < ground_threshold
        ),
    )
    foot_skating_ratio = skating_frames / total_ground_frames

    velocities = np.diff(joints_3d, axis=0) * fps
    accelerations = np.diff(velocities, axis=0) * fps
    joint_jitter = float(np.mean(np.linalg.norm(accelerations, axis=-1)))

    return {
        "footSkatingRatio": round(foot_skating_ratio, 4),
        "jointJitter": round(joint_jitter, 4),
        "totalFrames": num_frames,
    }


def skeleton_to_json(
    joints_3d: np.ndarray,
    fps: int = 20,
    include_metrics: bool = True,
    spatial_control: dict | None = None,
    trim_info: dict | None = None,
) -> dict:
    """Convert 3D joint array to the canonical skeleton JSON format.

    Args:
        joints_3d: (num_frames, 22, 3) array.
        fps: Frames per second of the motion.
        include_metrics: Whether to compute and attach quality metrics.
        spatial_control: Optional dict with startPosition, endPosition, controlJoint
                         for trajectory adherence metric.
        trim_info: Optional dict from trim_static_ends() merged into metrics.
    """
    joints_2d = project_to_2d(joints_3d)

    scale = 30.0
    joints_2d_scaled = joints_2d * scale

    pelvis_3d = joints_3d[:, 0:1, :]
    joints_3d_centered = (joints_3d - pelvis_3d) * scale

    frames = [
        [[round(float(x), 2), round(float(y), 2)] for x, y in frame_joints]
        for frame_joints in joints_2d_scaled
    ]

    frames3d = [
        [
            [round(float(x), 2), round(float(y), 2), round(float(z), 2)]
            for x, y, z in frame_joints
        ]
        for frame_joints in joints_3d_centered
    ]

    result: dict = {
        "fps": fps,
        "jointNames": HUMANML3D_JOINT_NAMES,
        "boneConnections": [list(pair) for pair in HUMANML3D_BONE_CONNECTIONS],
        "frames": frames,
        "frames3d": frames3d,
    }

    if include_metrics:
        metrics = compute_metrics(joints_3d, fps)
        if spatial_control:
            joint_map = {"pelvis": 0, "left_foot": 10, "right_foot": 11}
            joint_idx = joint_map.get(
                spatial_control.get("controlJoint", "pelvis"), 0
            )
            start = spatial_control["startPosition"]
            end = spatial_control["endPosition"]
            metrics["trajectoryAdherence"] = compute_trajectory_adherence(
                joints_3d,
                [start["x"], start["y"]],
                [end["x"], end["y"]],
                joint_idx,
            )
        if trim_info:
            metrics.update(trim_info)
        result["metrics"] = metrics

    return result
