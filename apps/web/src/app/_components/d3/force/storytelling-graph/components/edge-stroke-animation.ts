import type { CSSProperties } from "react";
import type { EdgeMotionConfig, EdgeMotionType } from "@/app/const/edge-cdt-animation";

/** pathLength=1 正規化座標での stroke-dasharray */
export const EDGE_STROKE_DASHARRAY: Record<EdgeMotionType, string | undefined> = {
  flow: "0.14 0.1",
  extend: undefined,
  "pulse-impact": "0.08 0.06",
  wave: "0.06 0.06",
  converge: "0.18 0.12",
  diverge: "0.1 0.18",
  pop: undefined,
  glow: undefined,
};

export const EDGE_STROKE_CLASS: Record<EdgeMotionType, string> = {
  flow: "edge-stroke-anim edge-stroke-flow",
  extend: "edge-stroke-anim edge-stroke-extend",
  "pulse-impact": "edge-stroke-anim edge-stroke-impact",
  wave: "edge-stroke-anim edge-stroke-wave",
  converge: "edge-stroke-anim edge-stroke-converge",
  diverge: "edge-stroke-anim edge-stroke-diverge",
  pop: "edge-stroke-anim edge-stroke-pop",
  glow: "edge-stroke-anim edge-stroke-glow",
};

export function getCdtEdgeStrokeStyle(
  motionConfig: EdgeMotionConfig,
  strokeWidth: number,
): CSSProperties {
  return {
    ["--edge-stroke-duration" as string]: `${motionConfig.durationMs}ms`,
    ["--edge-stroke-width" as string]: `${strokeWidth}px`,
  };
}

export function shouldShowGlowUnderlay(motionType: EdgeMotionType): boolean {
  return motionType === "glow";
}
