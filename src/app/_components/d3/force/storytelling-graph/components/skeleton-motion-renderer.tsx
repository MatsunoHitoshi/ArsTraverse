"use client";

import React, { useEffect, useRef, useMemo } from "react";
import type { SkeletonMotionData } from "@/app/const/skeleton-motion";
import {
  SKELETON_DISPLAY_SCALE,
  JOINT_RADIUS,
  BONE_STROKE_WIDTH,
  BONE_COLOR,
  JOINT_COLOR,
  interpolateFrame,
  interpolateLoopFrame,
} from "@/app/const/skeleton-motion";

type SkeletonMotionRendererProps = {
  motionData: SkeletonMotionData;
  /** Global X position on the D3 graph (edge midpoint or along-edge position) */
  globalX: number;
  /** Global Y position on the D3 graph */
  globalY: number;
  /** Display scale factor from graph zoom */
  displayScale: number;
  opacity?: number;
  /** Whether to flip the skeleton horizontally (faces left) */
  facesLeft?: boolean;
  /** Color override for bones */
  boneColor?: string;
  /** Color override for joints */
  jointColor?: string;
  /** When set, disables internal auto-play and renders this frame index. */
  frameIndex?: number;
  /** Normalized playback position [0, 1). Preferred over frameIndex for loop crossfade. */
  playbackProgress?: number;
  /** When true with playbackProgress, blends tail toward head at the loop seam. */
  loopCrossfade?: boolean;
};

/**
 * SVG skeleton motion renderer.
 *
 * Reads a SkeletonMotionData (from T2M model output) and renders bones/joints
 * as SVG <line>/<circle> elements, driven by requestAnimationFrame.
 * The skeleton is drawn in local coordinates (pelvis-centered) and translated
 * to the global position on the D3 graph.
 */
export function SkeletonMotionRenderer({
  motionData,
  globalX,
  globalY,
  displayScale,
  opacity = 1,
  facesLeft = false,
  boneColor = BONE_COLOR,
  jointColor = JOINT_COLOR,
  frameIndex: controlledFrameIndex,
  playbackProgress,
  loopCrossfade = true,
}: SkeletonMotionRendererProps) {
  const groupRef = useRef<SVGGElement>(null);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  const { fps, boneConnections, frames } = motionData;
  const totalFrames = frames.length;
  const durationMs = (totalFrames / fps) * 1000;
  const isControlled =
    playbackProgress !== undefined || controlledFrameIndex !== undefined;

  const scale = SKELETON_DISPLAY_SCALE / Math.max(0.5, displayScale);
  const flipX = facesLeft ? -1 : 1;

  useEffect(() => {
    if (totalFrames === 0) return;

    const g = groupRef.current;
    if (!g) return;

    const boneElements = g.querySelectorAll<SVGLineElement>(".skel-bone");
    const jointElements = g.querySelectorAll<SVGCircleElement>(".skel-joint");

    const samplePose = (progress: number) => {
      return loopCrossfade
        ? interpolateLoopFrame(frames, progress)
        : interpolateFrame(frames, progress * Math.max(totalFrames - 1, 0));
    };

    const applyPoseFromJoints = (currentJoints: [number, number][]) => {
      boneElements.forEach((el, i) => {
        const conn = boneConnections[i];
        if (!conn) return;
        const [a, b] = conn;
        const ja = currentJoints[a];
        const jb = currentJoints[b];
        if (!ja || !jb) return;

        el.setAttribute("x1", String(ja[0] * scale * flipX));
        el.setAttribute("y1", String(-ja[1] * scale));
        el.setAttribute("x2", String(jb[0] * scale * flipX));
        el.setAttribute("y2", String(-jb[1] * scale));
      });

      jointElements.forEach((el, i) => {
        const j = currentJoints[i];
        if (!j) return;
        el.setAttribute("cx", String(j[0] * scale * flipX));
        el.setAttribute("cy", String(-j[1] * scale));
      });
    };

    if (isControlled) {
      if (playbackProgress !== undefined) {
        applyPoseFromJoints(samplePose(playbackProgress));
      } else {
        applyPoseFromJoints(
          interpolateFrame(frames, controlledFrameIndex ?? 0),
        );
      }
      return;
    }

    const tick = (now: number) => {
      if (startTimeRef.current === null) startTimeRef.current = now;

      const elapsed = now - startTimeRef.current;
      const progress = (elapsed % durationMs) / durationMs;
      applyPoseFromJoints(samplePose(progress));

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
    frames,
    boneConnections,
    totalFrames,
    durationMs,
    scale,
    flipX,
    isControlled,
    controlledFrameIndex,
    playbackProgress,
    loopCrossfade,
  ]);

  const initialJoints = useMemo(
    () => (frames.length > 0 ? frames[0]! : []),
    [frames],
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
            x1={ja[0] * scale * flipX}
            y1={-ja[1] * scale}
            x2={jb[0] * scale * flipX}
            y2={-jb[1] * scale}
            stroke={boneColor}
            strokeWidth={BONE_STROKE_WIDTH}
            strokeLinecap="round"
          />
        );
      })}

      {initialJoints.map((j, i) => (
        <circle
          key={`joint-${i}`}
          className="skel-joint"
          cx={j[0] * scale * flipX}
          cy={-j[1] * scale}
          r={JOINT_RADIUS}
          fill={jointColor}
        />
      ))}
    </g>
  );
}

/**
 * Variant used for comparison lab: renders skeleton inside a fixed-size SVG viewBox.
 */
export function SkeletonMotionPreview({
  motionData,
  width = 200,
  height = 200,
  boneColor = BONE_COLOR,
  jointColor = JOINT_COLOR,
  frameIndex,
  playbackProgress,
  loopCrossfade,
}: {
  motionData: SkeletonMotionData;
  width?: number;
  height?: number;
  boneColor?: string;
  jointColor?: string;
  frameIndex?: number;
  playbackProgress?: number;
  loopCrossfade?: boolean;
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
      />
    </svg>
  );
}
