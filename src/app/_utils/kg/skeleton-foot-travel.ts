import type { JointPose3d, SkeletonMotionData } from "@/app/const/skeleton-motion";

/** Furthest travel along edge (0=source, 0.5=midpoint, 1=target). */
export const MAX_SKELETON_EDGE_TRAVEL_T = 0.5;

const LEFT_FOOT_IDX = 10;
const RIGHT_FOOT_IDX = 11;
const LEFT_ANKLE_IDX = 7;
const RIGHT_ANKLE_IDX = 8;

/** Scaled HumanML3D units (frames3d are pelvis-centered × 30). */
const GROUND_Y_THRESHOLD = 1.5;
const FOOT_XZ_VELOCITY_THRESHOLD = 0.6;
const POSE2D_ACTIVITY_THRESHOLD = 1.2;

export type SkeletonFootTravelProfile = {
  /** Share of frames where at least one foot is stepping (0–1). */
  footActiveRatio: number;
  /** Max edge position reached at end of active travel (≤ MAX_SKELETON_EDGE_TRAVEL_T). */
  maxTravelT: number;
  /** Edge position t for normalized playback progress [0, 1]. */
  positionTAtProgress: (progress: number) => number;
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function footIndices(jointNames: string[]): number[] {
  const names = jointNames.map((n) => n.toLowerCase());
  const feet = names
    .map((name, i) =>
      name.includes("foot") || name.includes("ankle") ? i : -1,
    )
    .filter((i) => i >= 0);
  if (feet.length > 0) return feet;
  return [LEFT_FOOT_IDX, RIGHT_FOOT_IDX, LEFT_ANKLE_IDX, RIGHT_ANKLE_IDX];
}

function isFootMoving3d(
  current: JointPose3d[],
  previous: JointPose3d[],
  footIdx: number[],
): boolean {
  for (const fi of footIdx) {
    const curr = current[fi];
    const prev = previous[fi];
    if (!curr || !prev) continue;
    const [, y] = curr;
    if (y > GROUND_Y_THRESHOLD) continue;
    const vx = curr[0] - prev[0];
    const vz = curr[2] - prev[2];
    if (Math.hypot(vx, vz) > FOOT_XZ_VELOCITY_THRESHOLD) return true;
  }
  return false;
}

function isPoseActive2d(
  current: [number, number][],
  previous: [number, number][],
): boolean {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < current.length; i++) {
    const c = current[i];
    const p = previous[i];
    if (!c || !p) continue;
    sum += Math.hypot(c[0] - p[0], c[1] - p[1]);
    count += 1;
  }
  return count > 0 && sum / count > POSE2D_ACTIVITY_THRESHOLD;
}

function buildTravelProfile(
  footActivePerFrame: boolean[],
): SkeletonFootTravelProfile {
  const n = footActivePerFrame.length;
  if (n === 0) {
    return {
      footActiveRatio: 0,
      maxTravelT: 0,
      positionTAtProgress: () => 0,
    };
  }

  const activeCount = footActivePerFrame.filter(Boolean).length;
  const footActiveRatio = activeCount / n;
  const maxTravelT = MAX_SKELETON_EDGE_TRAVEL_T * footActiveRatio;

  const cumulativeActive = Array.from({ length: n }, () => 0);
  let total = 0;
  for (let i = 0; i < n; i++) {
    if (footActivePerFrame[i]) total += 1;
    cumulativeActive[i] = total;
  }

  const positionTAtProgress = (progress: number) => {
    if (maxTravelT <= 0 || total <= 0) return 0;
    const clamped = clamp01(progress);
    if (n === 1) return maxTravelT * clamped;
    const frameIndex = clamped * (n - 1);
    const floorIdx = Math.floor(frameIndex);
    const ceilIdx = Math.min(n - 1, Math.ceil(frameIndex));
    const t = frameIndex - floorIdx;
    const cum =
      cumulativeActive[floorIdx]! +
      (cumulativeActive[ceilIdx]! - cumulativeActive[floorIdx]!) * t;
    return (cum / total) * maxTravelT;
  };

  return { footActiveRatio, maxTravelT, positionTAtProgress };
}

/**
 * Derive edge travel from foot activity over the clip.
 * Movement advances only during foot-active frames; max reach scales with active ratio.
 */
export function analyzeSkeletonFootTravel(
  motionData: SkeletonMotionData,
): SkeletonFootTravelProfile {
  const frames3d = motionData.frames3d;
  if (frames3d && frames3d.length > 0) {
    const footIdx = footIndices(motionData.jointNames);
    const footActivePerFrame = frames3d.map((pose, i) => {
      if (i === 0) return false;
      return isFootMoving3d(pose, frames3d[i - 1]!, footIdx);
    });
    return buildTravelProfile(footActivePerFrame);
  }

  const frames = motionData.frames;
  const footActivePerFrame = frames.map((pose, i) => {
    if (i === 0) return false;
    return isPoseActive2d(pose, frames[i - 1]!);
  });
  return buildTravelProfile(footActivePerFrame);
}
