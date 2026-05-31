/**
 * ストーリーセグメントと局所グラフ対応付けの型・定数
 * API（kg-copilot）とフロントで共有
 */

export type SegmentSource = "generated" | "auto_annotated" | "user_selected";

export interface StorySegment {
  text: string;
  nodeIds?: string[];
  edgeIds?: string[];
  source?: SegmentSource;
}

/** エッジ複合キー: sourceId|targetId|type（internalEdgesDetailed に id がないため） */
export function toEdgeCompositeKey(
  sourceId: string,
  targetId: string,
  type: string,
): string {
  return `${sourceId}|${targetId}|${type}`;
}

/** リンクからエッジ複合キーを取得（RelationshipTypeForFrontend 用） */
export function getEdgeCompositeKeyFromLink(link: {
  sourceId: string;
  targetId: string;
  type: string;
}): string {
  return toEdgeCompositeKey(link.sourceId, link.targetId, link.type);
}

/** Tiptap 段落のカスタム attrs（セグメント対応付け） */
export interface SegmentParagraphAttrs {
  segmentNodeIds?: string[];
  segmentEdgeIds?: string[];
  segmentSource?: SegmentSource;
}

/** フォーカス中のセグメント参照（グラフハイライト用） */
export interface FocusedSegmentRef {
  communityId: string;
  nodeIds: string[];
  edgeIds?: string[];
}
