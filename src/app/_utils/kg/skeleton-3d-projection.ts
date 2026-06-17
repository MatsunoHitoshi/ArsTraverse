import type {
  JointPose3d,
  SkeletonMotionData,
  SkeletonViewCamera,
} from "@/app/const/skeleton-motion";
import {
  DEFAULT_SKELETON_VIEW_PITCH,
  interpolateFrame,
  interpolateFrame3d,
  interpolateLoopFrame,
  interpolateLoopFrame3d,
} from "@/app/const/skeleton-motion";

export type ProjectPose3dOptions = {
  pitch?: number;
  yawOffset?: number;
};

const DEFAULT_CAMERA_DISTANCE = 90;
const DEFAULT_CAMERA_FOCAL_LENGTH = 95;
const MIN_CAMERA_Z = 1e-3;

function normalize3(v: [number, number, number]): [number, number, number] {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len < 1e-8) return [0, 0, 1];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function cross3(
  a: [number, number, number],
  b: [number, number, number],
): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function dot3(
  a: [number, number, number],
  b: [number, number, number],
): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * Graph edge angle in SVG space (x right, y down).
 * HumanML3D +Z (walk) maps to screen +x after fixed rear-elevated projection,
 * so align pose yaw with edge using a +90° offset from atan2.
 */
function edgeYawFromVector(edgeDx: number, edgeDy: number, yawOffset: number): number {
  const len = Math.hypot(edgeDx, edgeDy);
  if (len < 1e-6) return Math.PI / 2 + Math.PI + yawOffset;
  return Math.PI / 2 + Math.atan2(edgeDy, edgeDx) + Math.PI + yawOffset;
}

function rotateJointYaw([x, y, z]: JointPose3d, yaw: number): JointPose3d {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return [x * cos + z * sin, y, -x * sin + z * cos];
}

function projectJoint3dTo2dFixed(
  joint: JointPose3d,
  pitch: number,
): [number, number] {
  const cameraPos: [number, number, number] = [
    0,
    DEFAULT_CAMERA_DISTANCE * Math.sin(pitch),
    DEFAULT_CAMERA_DISTANCE * Math.cos(pitch),
  ];

  const worldUp: [number, number, number] = [0, 1, 0];
  const forward = normalize3([-cameraPos[0], -cameraPos[1], -cameraPos[2]]);
  const right = normalize3(cross3(worldUp, forward));
  const up = normalize3(cross3(forward, right));

  const rel: [number, number, number] = [
    joint[0] - cameraPos[0],
    joint[1] - cameraPos[1],
    joint[2] - cameraPos[2],
  ];

  const cameraX = dot3(rel, right);
  const cameraY = dot3(rel, up);
  const cameraZ = Math.max(MIN_CAMERA_Z, dot3(rel, forward));

  const invZ = DEFAULT_CAMERA_FOCAL_LENGTH / cameraZ;
  return [cameraX * invZ, -cameraY * invZ];
}

/**
 * Project pelvis-centered HumanML3D joints to 2D screen space.
 * X=lateral, Y=up, Z=forward (walk direction).
 *
 * 1. Rotate pose around Y so +Z walk aligns with graph edge direction
 * 2. Project with a fixed elevated rear camera (perspective)
 */
export function projectJoint3dTo2d(
  joint: JointPose3d,
  edgeDx: number,
  edgeDy: number,
  options: ProjectPose3dOptions = {},
): [number, number] {
  const pitch = Math.max(
    0.05,
    Math.min(Math.PI * 0.48, options.pitch ?? DEFAULT_SKELETON_VIEW_PITCH),
  );
  const yawOffset = options.yawOffset ?? 0;
  const yaw = edgeYawFromVector(edgeDx, edgeDy, yawOffset);
  const rotated = rotateJointYaw(joint, yaw);
  return projectJoint3dTo2dFixed(rotated, pitch);
}

export function projectPose3dTo2d(
  pose3d: JointPose3d[],
  edgeDx: number,
  edgeDy: number,
  options?: ProjectPose3dOptions,
): [number, number][] {
  return pose3d.map((joint) =>
    projectJoint3dTo2d(joint, edgeDx, edgeDy, options),
  );
}

/** Edge vector from source → target node positions (SVG coordinates). */
export function edgeVectorFromNodes(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
): { edgeDx: number; edgeDy: number } {
  return {
    edgeDx: targetX - sourceX,
    edgeDy: targetY - sourceY,
  };
}

function flipPoseX(pose: [number, number][]): [number, number][] {
  return pose.map(([x, y]) => [-x, y] as [number, number]);
}

function rotatePose2d(
  pose: [number, number][],
  angleRad: number,
): [number, number][] {
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  return pose.map(([x, y]) => [x * c - y * s, x * s + y * c] as [number, number]);
}

function edgeAngleFromVector(
  edgeDx: number,
  edgeDy: number,
  yawOffset: number,
): number {
  return edgeYawFromVector(edgeDx, edgeDy, yawOffset);
}

/**
 * Sample a 2D pose for rendering, using 3D frames + edge camera when available.
 */
export function sampleSkeletonPose2d(
  motionData: SkeletonMotionData,
  progress: number,
  options: {
    loopCrossfade: boolean;
    viewCamera?: SkeletonViewCamera | null;
    facesLeft?: boolean;
  },
): [number, number][] {
  const { loopCrossfade, viewCamera, facesLeft = false } = options;
  const frames3d = motionData.frames3d;
  const has3d = !!frames3d && frames3d.length > 0;

  if (has3d && viewCamera) {
    const pose3d: JointPose3d[] = loopCrossfade
      ? interpolateLoopFrame3d(frames3d, progress)
      : interpolateFrame3d(
          frames3d,
          progress * Math.max(frames3d.length - 1, 0),
        );

    const edgeDx = viewCamera.alignWithEdge ? viewCamera.edgeDx : facesLeft ? -1 : 1;
    const edgeDy = viewCamera.alignWithEdge ? viewCamera.edgeDy : 0;

    return projectPose3dTo2d(pose3d, edgeDx, edgeDy, {
      pitch: viewCamera.pitch,
      yawOffset: viewCamera.yawOffset,
    });
  }

  if (has3d) {
    const pose3d: JointPose3d[] = loopCrossfade
      ? interpolateLoopFrame3d(frames3d, progress)
      : interpolateFrame3d(
          frames3d,
          progress * Math.max(frames3d.length - 1, 0),
        );
    const edgeDx = facesLeft ? -1 : 1;
    return projectPose3dTo2d(pose3d, edgeDx, 0, {
      pitch: DEFAULT_SKELETON_VIEW_PITCH,
      yawOffset: 0,
    });
  }

  const frames = motionData.frames;
  const pose = loopCrossfade
    ? interpolateLoopFrame(frames, progress)
    : interpolateFrame(frames, progress * Math.max(frames.length - 1, 0));

  let result = facesLeft ? flipPoseX(pose) : pose;

  if (viewCamera?.alignWithEdge) {
    const angle = edgeAngleFromVector(
      viewCamera.edgeDx,
      viewCamera.edgeDy,
      viewCamera.yawOffset,
    );
    result = rotatePose2d(result, angle);
  }

  return result;
}
