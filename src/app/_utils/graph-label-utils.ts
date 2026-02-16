/** エッジラベルがエッジ長の80%を超えないフォントサイズの上限を算出（文字幅 ≈ fontSize * 0.6） */
export function getMaxEdgeLabelFontSizeByLength(edgeLengthPx: number, textLength: number): number {
  if (edgeLengthPx <= 0 || textLength <= 0) return 999;
  return (edgeLengthPx * 0.8) / (Math.max(1, textLength) * 0.6);
}
