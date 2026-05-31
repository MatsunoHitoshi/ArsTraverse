"use client";

import type { EdgeMotionConfig } from "@/app/const/edge-cdt-animation";
import {
  EDGE_STROKE_CLASS,
  EDGE_STROKE_DASHARRAY,
  getCdtEdgeStrokeStyle,
  shouldShowGlowUnderlay,
} from "./edge-stroke-animation";

const CDT_GLOW_FILTER_ID = "edge-cdt-glow-filter";

export function CdtEdgeGlowFilterDef() {
  return (
    <filter id={CDT_GLOW_FILTER_ID} x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  );
}

type CdtAnimatedEdgePathProps = {
  pathD: string;
  motionConfig: EdgeMotionConfig;
  strokeWidth: number;
  strokeOpacity: number;
  /** 0–1: セグメント進行による描画。1 未満のときはループアニメを止めて伸長表示 */
  revealProgress?: number;
  /** false なら定常ループアニメを無効化 */
  steadyAnimate?: boolean;
};

/**
 * CDT カテゴリに連動したエッジ線ストローク（dash / opacity / width / glow）。
 * ピクトグラムの motionType・durationMs と揃える。
 */
export function CdtAnimatedEdgePath({
  pathD,
  motionConfig,
  strokeWidth,
  strokeOpacity,
  revealProgress,
  steadyAnimate = true,
}: CdtAnimatedEdgePathProps) {
  const { motionType, color } = motionConfig;
  const dasharray = EDGE_STROKE_DASHARRAY[motionType];
  const isRevealing = revealProgress != null && revealProgress < 1;
  const runSteadyAnim = steadyAnimate && !isRevealing;
  const animClass = runSteadyAnim ? EDGE_STROKE_CLASS[motionType] : undefined;
  const strokeStyle = getCdtEdgeStrokeStyle(motionConfig, strokeWidth);
  const showGlow = shouldShowGlowUnderlay(motionType) && runSteadyAnim;

  return (
    <g className="cdt-animated-edge" aria-hidden>
      {showGlow && (
        <path
          d={pathD}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth * 2.8}
          strokeOpacity={Math.min(0.45, strokeOpacity * 0.5)}
          strokeLinecap="round"
          filter={`url(#${CDT_GLOW_FILTER_ID})`}
          className="edge-stroke-glow-underlay"
          style={strokeStyle}
        />
      )}
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeOpacity={strokeOpacity}
        strokeLinecap="round"
        pathLength={1}
        className={animClass}
        strokeDasharray={isRevealing ? 1 : dasharray}
        strokeDashoffset={isRevealing ? 1 - revealProgress : undefined}
        style={{
          ...strokeStyle,
          ...(isRevealing ? { transition: "stroke-dashoffset 100ms ease-out" } : undefined),
        }}
      />
    </g>
  );
}
