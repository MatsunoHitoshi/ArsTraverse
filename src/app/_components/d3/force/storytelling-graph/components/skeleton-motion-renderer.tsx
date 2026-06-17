"use client";

import React, { useEffect, useRef, useMemo } from "react";
import type { SkeletonMotionData, SkeletonViewCamera } from "@/app/const/skeleton-motion";
import {
  SKELETON_DISPLAY_SCALE,
  BONE_STROKE_WIDTH,
  BONE_COLOR,
  JOINT_COLOR,
  getSkeletonJointRadius,
  getSkeletonJointRole,
} from "@/app/const/skeleton-motion";
import { sampleSkeletonPose2d } from "@/app/_utils/kg/skeleton-3d-projection";

type SkeletonMotionRendererProps = {
  motionData: SkeletonMotionData;
  /** Global X position on the D3 graph (edge midpoint or along-edge position) */
  globalX: number;
  /** Global Y position on the D3 graph */
  globalY: number;
  /** Display scale factor from graph zoom */
  displayScale: number;
  opacity?: number;
  /** Whether to flip the skeleton horizontally (legacy 2D when no viewCamera) */
  facesLeft?: boolean;
  /** Edge-aligned 3D projection camera (requires frames3d for full effect). */
  viewCamera?: SkeletonViewCamera | null;
  boneColor?: string;
  jointColor?: string;
  frameIndex?: number;
  playbackProgress?: number;
  loopCrossfade?: boolean;
};

export function SkeletonMotionRenderer({
  motionData,
  globalX,
  globalY,
  displayScale,
  opacity = 1,
  facesLeft = false,
  viewCamera = null,
  boneColor = BONE_COLOR,
  jointColor = JOINT_COLOR,
  frameIndex: controlledFrameIndex,
  playbackProgress,
  loopCrossfade = true,
}: SkeletonMotionRendererProps) {
  const groupRef = useRef<SVGGElement>(null);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  const { fps, boneConnections, frames, jointNames } = motionData;
  const totalFrames = frames.length;
  const durationMs = (totalFrames / fps) * 1000;
  const isControlled =
    playbackProgress !== undefined || controlledFrameIndex !== undefined;

  const scale = SKELETON_DISPLAY_SCALE / Math.max(0.5, displayScale);

  const sampleOptions = useMemo(
    () => ({
      loopCrossfade,
      viewCamera,
      facesLeft: viewCamera?.alignWithEdge ? false : facesLeft,
    }),
    [loopCrossfade, viewCamera, facesLeft],
  );

  const resolveProgress = (progress: number) =>
    sampleSkeletonPose2d(motionData, progress, sampleOptions);

  useEffect(() => {
    if (totalFrames === 0) return;

    const g = groupRef.current;
    if (!g) return;

    const boneElements = g.querySelectorAll<SVGLineElement>(".skel-bone");
    const jointElements = g.querySelectorAll<SVGCircleElement>(".skel-joint");

    const applyPoseFromJoints = (currentJoints: [number, number][]) => {
      boneElements.forEach((el, i) => {
        const conn = boneConnections[i];
        if (!conn) return;
        const [a, b] = conn;
        const ja = currentJoints[a];
        const jb = currentJoints[b];
        if (!ja || !jb) return;

        el.setAttribute("x1", String(ja[0] * scale));
        el.setAttribute("y1", String(ja[1] * scale));
        el.setAttribute("x2", String(jb[0] * scale));
        el.setAttribute("y2", String(jb[1] * scale));
      });

      jointElements.forEach((el, i) => {
        const j = currentJoints[i];
        if (!j) return;
        el.setAttribute("cx", String(j[0] * scale));
        el.setAttribute("cy", String(j[1] * scale));
      });
    };

    if (isControlled) {
      if (playbackProgress !== undefined) {
        applyPoseFromJoints(resolveProgress(playbackProgress));
      } else {
        const idx = controlledFrameIndex ?? 0;
        const progress =
          totalFrames <= 1 ? 0 : idx / Math.max(totalFrames - 1, 1);
        applyPoseFromJoints(resolveProgress(progress));
      }
      return;
    }

    const tick = (now: number) => {
      if (startTimeRef.current === null) startTimeRef.current = now;

      const elapsed = now - startTimeRef.current;
      const progress = (elapsed % durationMs) / durationMs;
      applyPoseFromJoints(resolveProgress(progress));

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      startTimeRef.current = null;
    };
  }, [
    motionData,
    boneConnections,
    totalFrames,
    durationMs,
    scale,
    isControlled,
    controlledFrameIndex,
    playbackProgress,
    sampleOptions,
  ]);

  const initialJoints = useMemo(
    () => resolveProgress(0),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- motionData + camera
    [motionData, sampleOptions],
  );

  if (totalFrames === 0) return null;

  return (
    <g
      ref={groupRef}
      transform={`translate(${globalX}, ${globalY})`}
      style={{ pointerEvents: "none", opacity }}
    >
      {boneConnections.map(([a, b], i) => {
        const ja = initialJoints[a];
        const jb = initialJoints[b];
        if (!ja || !jb) return null;
        return (
          <line
            key={`bone-${i}`}
            className="skel-bone"
            x1={ja[0] * scale}
            y1={ja[1] * scale}
            x2={jb[0] * scale}
            y2={jb[1] * scale}
            stroke={boneColor}
            strokeWidth={BONE_STROKE_WIDTH}
            strokeLinecap="round"
          />
        );
      })}

      {initialJoints.map((j, i) => {
        const role = getSkeletonJointRole(jointNames[i]);
        const radius = getSkeletonJointRadius(role);
        return (
          <circle
            key={`joint-${i}`}
            className={`skel-joint skel-joint-${role}`}
            cx={j[0] * scale}
            cy={j[1] * scale}
            r={radius}
            fill={jointColor}
            stroke={role === "head" ? boneColor : undefined}
            strokeWidth={role === "head" ? 0.6 : 0}
          />
        );
      })}
    </g>
  );
}

export function SkeletonMotionPreview({
  motionData,
  width = 200,
  height = 200,
  boneColor = BONE_COLOR,
  jointColor = JOINT_COLOR,
  frameIndex,
  playbackProgress,
  loopCrossfade,
  facesLeft,
}: {
  motionData: SkeletonMotionData;
  width?: number;
  height?: number;
  boneColor?: string;
  jointColor?: string;
  frameIndex?: number;
  playbackProgress?: number;
  loopCrossfade?: boolean;
  facesLeft?: boolean;
}) {
  return (
    <svg
      width={width}
      height={height}
      viewBox={`-100 -120 200 200`}
      style={{ background: "rgba(0,0,0,0.2)", borderRadius: 8 }}
    >
      <SkeletonMotionRenderer
        motionData={motionData}
        globalX={0}
        globalY={0}
        displayScale={1}
        boneColor={boneColor}
        jointColor={jointColor}
        frameIndex={frameIndex}
        playbackProgress={playbackProgress}
        loopCrossfade={loopCrossfade}
        facesLeft={facesLeft}
      />
    </svg>
  );
}
