import type { CustomLinkType, CustomNodeType } from "@/app/const/types";

export function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

/** 最初をゆるく、終わりに速く（セグメント進入後のフェード・線描画用） */
export function easeInCubic(t: number): number {
  return t * t * t;
}

/** 最初と最後をゆるく、中間を速く（カメラ遷移用） */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/** 同一ノード対のエッジをグループ化するキー（ソース・ターゲットの順序を正規化） */
export function getNodePairKey(link: CustomLinkType): string {
  const a = (link.source as CustomNodeType).id;
  const b = (link.target as CustomNodeType).id;
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** 方向付きエッジキー（source→target。逆向きは別キー、同一方向の重複パス描画を省くため） */
export function getDirectionalKey(link: CustomLinkType): string {
  const src = (link.source as CustomNodeType).id;
  const tgt = (link.target as CustomNodeType).id;
  return `${src}|${tgt}`;
}

/** 線分 (x1,y1)-(x2,y2) が矩形 (minX,minY)-(maxX,maxY) と交差するか */
export function isLineSegmentInViewport(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): boolean {
  const pointInRect = (px: number, py: number) =>
    px >= minX && px <= maxX && py >= minY && py <= maxY;
  if (pointInRect(x1, y1) || pointInRect(x2, y2)) return true;
  const lineIntersectsHorizontal = (
    y: number,
    xa: number,
    ya: number,
    xb: number,
    yb: number,
  ) => {
    if (ya === yb) return ya === y && Math.min(xa, xb) <= maxX && Math.max(xa, xb) >= minX;
    const t = (y - ya) / (yb - ya);
    if (t < 0 || t > 1) return false;
    const x = xa + t * (xb - xa);
    return x >= minX && x <= maxX;
  };
  const lineIntersectsVertical = (
    x: number,
    xa: number,
    ya: number,
    xb: number,
    yb: number,
  ) => {
    if (xa === xb) return xa === x && Math.min(ya, yb) <= maxY && Math.max(ya, yb) >= minY;
    const t = (x - xa) / (xb - xa);
    if (t < 0 || t > 1) return false;
    const y = ya + t * (yb - ya);
    return y >= minY && y <= maxY;
  };
  return (
    lineIntersectsHorizontal(minY, x1, y1, x2, y2) ||
    lineIntersectsHorizontal(maxY, x1, y1, x2, y2) ||
    lineIntersectsVertical(minX, x1, y1, x2, y2) ||
    lineIntersectsVertical(maxX, x1, y1, x2, y2)
  );
}

export function isCustomNodeType(x: unknown): x is CustomNodeType {
  return typeof x === "object" && x !== null && "id" in x && typeof (x as { id: unknown }).id === "string";
}

/** スケールからノードラベルフォントサイズの基準値を推定（nodeLabelFontSizeBase と同等の logic） */
export function estimateNodeLabelFontSizeFromScale(
  scale: number,
  forRecording: boolean,
): number {
  if (forRecording) return Math.max(6, scale) * 0.7;
  const base =
    scale > 4 ? 3 : scale > 3 ? 4 : scale > 2 ? 5 : scale > 1.5 ? 6 : scale > 1 ? 7 : scale > 0.9 ? 8 : 9;
  const stepped = base * 1.5;
  /** 引きのとき（scale < 1）は実際の描画と一致させるため zoomOutFactor を掛ける */
  const zoomOutFactor = scale < 1 ? Math.max(0.4, scale) : 1;
  return stepped * zoomOutFactor;
}

/** ラベルがノードからはみ出す量をレイアウト座標で推定（ビューpx を scale で割って layout 座標に） */
export function estimateLabelMarginLayout(
  scale: number,
  fontSize: number,
  textLength: number,
): { halfWidth: number; heightAbove: number } {
  const halfWidthView = (textLength * fontSize) / 2;
  const heightAboveView = 10 + fontSize;
  return {
    halfWidth: halfWidthView / scale,
    heightAbove: heightAboveView / scale,
  };
}
