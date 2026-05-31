"use client";

import React from "react";
import type { CdtCategory, EdgeMotionConfig, EdgeMotionType } from "@/app/const/edge-cdt-animation";

// ---------------------------------------------------------------------------
// PictogramRenderer 差し替えインターフェース
// ---------------------------------------------------------------------------

export type PictogramRendererProps = {
  /** CDTカテゴリ・色・速度などのアニメーション設定 */
  config: EdgeMotionConfig;
  /** 描画領域のサイズ（px）: foreignObject の width/height に使用 */
  size: number;
};

// ---------------------------------------------------------------------------
// CDTカテゴリ別インラインSVGアイコン（外部ライブラリ不要）
// ---------------------------------------------------------------------------

const CDT_ICONS: Record<CdtCategory, React.FC<{ size: number; color: string }>> = {
  // PTRANS: 矢印（移動）
  PTRANS: ({ size, color }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  ),
  // ATRANS: 手のひら（渡す）
  ATRANS: ({ size, color }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2" />
      <path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2" />
      <path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8" />
      <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
    </svg>
  ),
  // PROPEL: 剣（攻撃・衝突）
  PROPEL: ({ size, color }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5" />
      <line x1="13" y1="19" x2="19" y2="13" />
      <line x1="16" y1="16" x2="20" y2="20" />
      <line x1="19" y1="21" x2="21" y2="19" />
    </svg>
  ),
  // MOVE: 波線（接触・アプローチ）
  MOVE: ({ size, color }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12c1.5-3 3-4.5 4.5-4.5S9 9 10.5 9s3-3 4.5-3S18 8.5 19.5 9 22 12 22 12" />
    </svg>
  ),
  // INGEST: 収束矢印（吸収・合併）
  INGEST: ({ size, color }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  // EXPEL: 放射矢印（分離・放出）
  EXPEL: ({ size, color }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 8V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-2" />
      <path d="M7 12h14l-3-3m0 6 3-3" />
    </svg>
  ),
  // SPEAK: 吹き出し（発言・宣言）
  SPEAK: ({ size, color }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  // MENTAL: 電球（認知・推測）
  MENTAL: ({ size, color }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="9" y1="18" x2="15" y2="18" />
      <line x1="10" y1="22" x2="14" y2="22" />
      <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
    </svg>
  ),
};

// ---------------------------------------------------------------------------
// Case 1: IconPictogramRenderer（インラインSVGアイコン + CSS アニメ）
// ---------------------------------------------------------------------------

const MOTION_ANIMATION_STYLE: Record<
  EdgeMotionType,
  (durationMs: number) => React.CSSProperties
> = {
  flow: (d) => ({
    animation: `edge-motion-flow ${d}ms linear infinite`,
  }),
  extend: (d) => ({
    animation: `edge-motion-extend ${d}ms ease-in-out infinite`,
  }),
  "pulse-impact": (d) => ({
    animation: `edge-motion-impact ${d}ms ease-in-out infinite`,
  }),
  wave: (d) => ({
    animation: `edge-motion-wave ${d}ms ease-in-out infinite`,
  }),
  converge: (d) => ({
    animation: `edge-motion-converge ${d}ms ease-in-out infinite`,
  }),
  diverge: (d) => ({
    animation: `edge-motion-diverge ${d}ms ease-in-out infinite`,
  }),
  pop: (d) => ({
    animation: `edge-motion-pop ${d}ms ease-out infinite`,
  }),
  glow: (d) => ({
    animation: `edge-motion-glow ${d}ms ease-in-out infinite`,
  }),
};

/**
 * 案1: インラインSVGアイコン + CSS アニメーションによるデフォルト実装。
 * `<foreignObject>` 経由でReactコンポーネントをSVG上に配置する。
 */
export function IconPictogramRenderer({ config, size }: PictogramRendererProps) {
  const IconSvg = CDT_ICONS[config.category];
  const iconSize = Math.round(size * 0.55);
  const animStyle = MOTION_ANIMATION_STYLE[config.motionType](config.durationMs);

  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "50%",
        background: `${config.color}22`,
        border: `1.5px solid ${config.color}88`,
        boxSizing: "border-box",
      }}
    >
      <div style={{ ...animStyle, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {IconSvg ? (
          <IconSvg size={iconSize} color={config.color} />
        ) : (
          <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={config.color} strokeWidth={2}>
            <circle cx="12" cy="12" r="4" />
          </svg>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EdgeSemanticPictogram: エッジ中点に配置するコンテナ（SVG <g> + <foreignObject>）
// ---------------------------------------------------------------------------

export function EdgeSemanticPictogram({
  config,
  cx,
  cy,
  displayScale,
  opacity = 1,
  renderer: Renderer = IconPictogramRenderer,
}: {
  config: EdgeMotionConfig;
  /** SVG座標系でのエッジ中点X */
  cx: number;
  /** SVG座標系でのエッジ中点Y */
  cy: number;
  /** 表示スケール（ズーム係数の逆数でサイズを一定に保つ） */
  displayScale: number;
  opacity?: number;
  /**
   * ピクトグラム描画の実装を差し替えられる。
   * デフォルト: IconPictogramRenderer
   * 将来: BodyPartsPictogramRenderer（案2）や LottiePictogramRenderer
   */
  renderer?: React.ComponentType<PictogramRendererProps>;
}) {
  const BASE_SIZE = 28;
  const size = Math.round(BASE_SIZE / Math.max(0.5, displayScale));
  const half = size / 2;

  return (
    <g
      transform={`translate(${cx}, ${cy})`}
      style={{ pointerEvents: "none", opacity }}
      className="edge-semantic-pictogram"
    >
      <foreignObject x={-half} y={-half} width={size} height={size} overflow="visible">
        {/* xmlns は <foreignObject> 内の HTML を有効化するために必要 */}
        <div
          // @ts-expect-error xmlns is a valid SVG attribute for foreignObject body
          xmlns="http://www.w3.org/1999/xhtml"
          style={{ width: size, height: size }}
        >
          <Renderer config={config} size={size} />
        </div>
      </foreignObject>
    </g>
  );
}
