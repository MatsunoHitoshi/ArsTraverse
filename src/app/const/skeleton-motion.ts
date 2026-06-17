/**
 * T2Mモデル（MoMask / OmniControl）が生成する骨格モーションの型定義。
 * GPU Worker (Python) から返されるJSONの構造と一致する。
 */

export type SkeletonMotionData = {
  fps: number;
  jointNames: string[];
  boneConnections: [number, number][];
  /** frames[frameIdx][jointIdx] = [x, y] in local coordinates (pelvis-centered) */
  frames: [number, number][][];
  /** Optional pelvis-centered 3D joints (HumanML3D XYZ, same scale as frames). */
  frames3d?: [number, number, number][][];
};

export type JointPose3d = [number, number, number];

/** Camera for projecting 3D skeleton onto graph edge orientation. */
export type SkeletonViewCamera = {
  edgeDx: number;
  edgeDy: number;
  /** Camera pitch above horizontal (radians). */
  pitch: number;
  /** Extra yaw around vertical axis (radians). */
  yawOffset: number;
  /** When true, rotate projection so +Z walk aligns with edge direction. */
  alignWithEdge: boolean;
};

/** Default oblique pitch (~30°) for edge-following camera projection. */
export const DEFAULT_SKELETON_VIEW_PITCH = Math.PI / 6;

export type SkeletonMotionMetrics = {
  footSkatingRatio: number;
  jointJitter: number;
  trajectoryAdherence?: number;
  totalFrames: number;
  /** Present when static leading/trailing frames were trimmed (OmniControl). */
  trimStartFrame?: number;
  trimEndFrame?: number;
  originalFrames?: number;
  trimmed?: boolean;
  trimmedFrames?: number;
};

export type SkeletonMotionResponse = SkeletonMotionData & {
  metrics?: SkeletonMotionMetrics;
  model: string;
};

export type FloodDiffusionSegmentMeta = {
  text: string;
  startToken?: number;
  endToken: number;
  startFrame?: number;
  endFrame: number;
};

export type FloodDiffusionMeta = {
  mode: "single" | "streaming";
  latentTokens: number;
  segments?: FloodDiffusionSegmentMeta[];
  inferenceMs: number;
  numDenoiseSteps?: number;
};

export type FloodDiffusionMotionResponse = SkeletonMotionResponse & {
  model: "flooddiffusion";
  floodMeta: FloodDiffusionMeta;
};

export type FloodDiffusionSegmentInput = {
  text: string;
  endToken: number;
};

export type SkeletonMotionComparisonResponse = {
  momask: SkeletonMotionResponse;
  omnicontrol: SkeletonMotionResponse;
  flooddiffusion?: FloodDiffusionMotionResponse;
};

export type SkeletonMotionCacheEntrySummary = {
  id: string;
  model: string;
  promptHash: string;
  totalFrames: number | null;
  updatedAt: Date | string;
};

export type MotionComparisonCacheGroup = {
  groupKey: string;
  promptText: string | null;
  promptHash: string | null;
  numFrames: number | null;
  momask: SkeletonMotionCacheEntrySummary | null;
  omnicontrol: SkeletonMotionCacheEntrySummary | null;
  flooddiffusion: SkeletonMotionCacheEntrySummary | null;
  updatedAt: Date | string;
};

/** OmniControl CMDM fixed output length (HumanML3D max). GPU cost is constant. */
export const OMNICONTROL_OUTPUT_FRAMES = 196;

/** FloodDiffusion VAE: after the first latent, each token upsamples to 4 frames. */
export const FLOOD_LATENT_TO_FRAME_RATIO = 4;

/** Exclusive end-frame index after `token` latent steps (matches gpu-worker decode). */
export function floodLatentTokenToFrame(token: number): number {
  if (token <= 0) return 0;
  return 1 + (token - 1) * FLOOD_LATENT_TO_FRAME_RATIO;
}

export function floodFramesFromLatentTokens(latentTokens: number): number {
  return floodLatentTokenToFrame(latentTokens);
}

export function floodLatentTokensFromFrames(numFrames: number): number {
  if (numFrames <= 0) return 5;
  return Math.max(5, 1 + Math.ceil((numFrames - 1) / FLOOD_LATENT_TO_FRAME_RATIO));
}

/** @deprecated alias — use floodFramesFromLatentTokens for exact VAE frame count */
export function floodApproxFramesFromLatentTokens(latentTokens: number): number {
  return floodFramesFromLatentTokens(latentTokens);
}

export const SKELETON_DISPLAY_SCALE = 0.8;

/** Default joint dot radius (torso, limbs). */
export const JOINT_RADIUS = 2;

/** Head joint — larger circle for stick-figure readability. */
export const JOINT_RADIUS_HEAD = 4.5;

/** Wrist / hand joints — slightly larger than body joints. */
export const JOINT_RADIUS_HAND = 2.8;

export const BONE_STROKE_WIDTH = 2.4;

export const BONE_COLOR = "rgba(255, 255, 255, 0.85)";

export const JOINT_COLOR = "rgba(255, 255, 255, 0.95)";

export type SkeletonJointRole = "default" | "head" | "hand";

export function getSkeletonJointRole(jointName: string | undefined): SkeletonJointRole {
  if (!jointName) return "default";
  const name = jointName.toLowerCase();
  if (name === "head") return "head";
  if (name.includes("wrist") || name.includes("hand")) return "hand";
  return "default";
}

export function getSkeletonJointRadius(role: SkeletonJointRole): number {
  switch (role) {
    case "head":
      return JOINT_RADIUS_HEAD;
    case "hand":
      return JOINT_RADIUS_HAND;
    default:
      return JOINT_RADIUS;
  }
}

/** Loop crossfade length at each end (at 20fps ≈ 0.75s per side). */
export const LOOP_CROSSFADE_FRAMES = 15;

/** Map normalized progress [0, 1] to a fractional frame index. */
export function progressToFrameIndex(
  progress: number,
  totalFrames: number,
): number {
  if (totalFrames <= 1) return 0;
  const clamped = Math.max(0, Math.min(1, progress));
  return clamped * (totalFrames - 1);
}

/** Per-frame mean joint displacement (frame 0 is always 0). */
export function computeFrameIntensity(
  frames: [number, number][][],
): number[] {
  if (frames.length === 0) return [];
  if (frames.length === 1) return [0];

  const intensities: number[] = [0];
  for (let f = 1; f < frames.length; f++) {
    const prev = frames[f - 1]!;
    const curr = frames[f]!;
    let sum = 0;
    let count = 0;
    for (let j = 0; j < curr.length; j++) {
      const pj = prev[j];
      const cj = curr[j];
      if (!pj || !cj) continue;
      sum += Math.hypot(cj[0] - pj[0], cj[1] - pj[1]);
      count += 1;
    }
    intensities.push(count > 0 ? sum / count : 0);
  }
  return intensities;
}

export function formatMotionTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins > 0) {
    return `${mins}:${secs.toFixed(1).padStart(4, "0")}`;
  }
  return `${secs.toFixed(1)}s`;
}

function blendPoses(
  a: [number, number][],
  b: [number, number][],
  t: number,
): [number, number][] {
  return a.map(([ax, ay], i) => {
    const [bx, by] = b[i] ?? [ax, ay];
    return [ax + (bx - ax) * t, ay + (by - ay) * t] as [number, number];
  });
}

function smoothstep(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

/**
 * Sample a pose for loop playback. The first and last `crossfadeFrames` blend
 * toward frame 0 so the wrap from progress 1 → 0 stays continuous.
 * The full frame sequence is preserved (no trimming).
 */
export function interpolateLoopFrame(
  frames: [number, number][][],
  progress: number,
  crossfadeFrames: number = LOOP_CROSSFADE_FRAMES,
): [number, number][] {
  const n = frames.length;
  if (n === 0) return [];
  if (n === 1) return frames[0]!;

  const clamped = ((progress % 1) + 1) % 1;
  const cf = Math.min(
    Math.max(1, crossfadeFrames),
    Math.floor((n - 1) / 2),
  );
  const crossfadeRatio = cf / n;
  const frameIndex = clamped * (n - 1);
  const headPose = interpolateFrame(frames, 0);

  if (clamped < crossfadeRatio) {
    const alpha = smoothstep(clamped / crossfadeRatio);
    const currentPose = interpolateFrame(frames, frameIndex);
    return blendPoses(headPose, currentPose, alpha);
  }

  if (clamped >= 1 - crossfadeRatio) {
    const alpha = smoothstep((clamped - (1 - crossfadeRatio)) / crossfadeRatio);
    const tailPose = interpolateFrame(frames, frameIndex);
    return blendPoses(tailPose, headPose, alpha);
  }

  return interpolateFrame(frames, frameIndex);
}

export function interpolateFrame(
  frames: [number, number][][],
  frameIndex: number,
): [number, number][] {
  if (frames.length === 0) return [];
  const floorIdx = Math.floor(frameIndex);
  const ceilIdx = Math.ceil(frameIndex);
  const t = frameIndex - floorIdx;

  if (ceilIdx >= frames.length || t === 0) {
    return frames[Math.min(floorIdx, frames.length - 1)]!;
  }

  const a = frames[floorIdx]!;
  const b = frames[ceilIdx]!;

  return a.map(([ax, ay], i) => {
    const [bx, by] = b[i]!;
    return [ax + (bx - ax) * t, ay + (by - ay) * t] as [number, number];
  });
}

function blendPoses3d(
  a: JointPose3d[],
  b: JointPose3d[],
  t: number,
): JointPose3d[] {
  return a.map(([ax, ay, az], i) => {
    const [bx, by, bz] = b[i] ?? [ax, ay, az];
    return [
      ax + (bx - ax) * t,
      ay + (by - ay) * t,
      az + (bz - az) * t,
    ] as JointPose3d;
  });
}

export function interpolateFrame3d(
  frames: JointPose3d[][],
  frameIndex: number,
): JointPose3d[] {
  if (frames.length === 0) return [];
  const floorIdx = Math.floor(frameIndex);
  const ceilIdx = Math.ceil(frameIndex);
  const t = frameIndex - floorIdx;

  if (ceilIdx >= frames.length || t === 0) {
    return frames[Math.min(floorIdx, frames.length - 1)]!;
  }

  const a = frames[floorIdx]!;
  const b = frames[ceilIdx]!;

  return a.map(([ax, ay, az], i) => {
    const [bx, by, bz] = b[i]!;
    return [
      ax + (bx - ax) * t,
      ay + (by - ay) * t,
      az + (bz - az) * t,
    ] as JointPose3d;
  });
}

export function interpolateLoopFrame3d(
  frames: JointPose3d[][],
  progress: number,
  crossfadeFrames: number = LOOP_CROSSFADE_FRAMES,
): JointPose3d[] {
  const n = frames.length;
  if (n === 0) return [];
  if (n === 1) return frames[0]!;

  const clamped = ((progress % 1) + 1) % 1;
  const cf = Math.min(
    Math.max(1, crossfadeFrames),
    Math.floor((n - 1) / 2),
  );
  const crossfadeRatio = cf / n;
  const frameIndex = clamped * (n - 1);
  const headPose = interpolateFrame3d(frames, 0);

  if (clamped < crossfadeRatio) {
    const alpha = smoothstep(clamped / crossfadeRatio);
    const currentPose = interpolateFrame3d(frames, frameIndex);
    return blendPoses3d(headPose, currentPose, alpha);
  }

  if (clamped >= 1 - crossfadeRatio) {
    const alpha = smoothstep((clamped - (1 - crossfadeRatio)) / crossfadeRatio);
    const tailPose = interpolateFrame3d(frames, frameIndex);
    return blendPoses3d(tailPose, headPose, alpha);
  }

  return interpolateFrame3d(frames, frameIndex);
}
