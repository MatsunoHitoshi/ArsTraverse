export type PageSizeTemplate =
  | "A4"
  | "A3"
  | "A2"
  | "A1"
  | "A0"
  | "B4"
  | "B3"
  | "B2"
  | "B1";
export type SizeUnit = "mm" | "cm" | "inch";
export type PageOrientation = "portrait" | "landscape";
export type ColorMode = "color" | "grayscale";
export type MetaGraphDisplayMode = "none" | "story" | "all";
export type TextOverlayDisplayMode = "none" | "show";
export type WorkspaceTitleDisplayMode = "none" | "show";
export type LayoutOrientation = "vertical" | "horizontal";
export type DetailedGraphDisplayMode = "all" | "story";

export interface PageSizeSettings {
  mode: "template" | "custom";
  template?: PageSizeTemplate;
  customWidth?: number;
  customHeight?: number;
  unit?: SizeUnit;
  orientation?: PageOrientation;
}

export interface MarginSettings {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface FontSizeSettings {
  /** ワークスペースタイトル（メインタイトル）のフォントサイズ */
  workspaceTitle: number;
  /** セクションタイトル（ストーリー各セクションのタイトル）のフォントサイズ */
  sectionTitle: number;
  body: number;
  node: number;
  edge: number;
}

export interface GraphSizeSettings {
  width: number;
  height: number;
  autoFit: boolean;
}

export interface PrintLayoutSettings {
  pageSize: PageSizeSettings;
  margins: MarginSettings;
  fontSize: FontSizeSettings;
  graphSize: GraphSizeSettings;
  colorMode: ColorMode;
  metaGraphDisplay: MetaGraphDisplayMode;
  textOverlayDisplay?: TextOverlayDisplayMode;
  workspaceTitleDisplay?: WorkspaceTitleDisplayMode;
  workspaceTitlePosition?: { x: number; y: number };
  /** ワークスペースタイトルの表示範囲（幅・高さ） */
  workspaceTitleSize?: { width: number; height: number };
  /** セクション（ストーリー各セクション）の表示範囲（幅・高さ）communityIdごとの個別設定 */
  sectionSizes?: Record<string, { width: number; height: number }>;
  /** コミュニティ中心座標のDnD調整値（communityIdごと） */
  communityPositions?: Record<string, { x: number; y: number }>;
  /** ノード位置のDnD調整値（nodeIdごと）。コミュニティ中心からの相対オフセット。コミュニティ移動時もノードが追従する。metaGraphDisplay=none 時のみ有効 */
  nodePositions?: Record<string, { x: number; y: number }>;
  layoutOrientation?: LayoutOrientation;
  detailedGraphDisplay?: DetailedGraphDisplayMode;
  showEdgeLabels?: boolean;
  /** 通常エッジの色（プレビュー画面で変更可能） */
  edgeColor?: string;
  /** フォーカスエッジの色（未指定時は edgeColor を暗くした色） */
  edgeFocusColor?: string;
  /** 通常ノードの色（プレビュー画面で変更可能） */
  nodeColor?: string;
  /** フォーカスノードの色（未指定時は #2563eb。メタグラフの塗りつぶし色も同じデフォルト） */
  nodeFocusColor?: string;
  /** PDFダウンロード時のファイル名（拡張子なしで指定、未指定時はワークスペース名を使用） */
  pdfFilename?: string;
}

// テンプレートサイズ定義（mm単位）
export const PAGE_SIZE_TEMPLATES: Record<
  PageSizeTemplate,
  { width: number; height: number }
> = {
  A4: { width: 210, height: 297 },
  A3: { width: 297, height: 420 },
  A2: { width: 420, height: 594 },
  A1: { width: 594, height: 841 },
  A0: { width: 841, height: 1189 },
  B4: { width: 257, height: 364 },
  B3: { width: 364, height: 515 },
  B2: { width: 515, height: 728 },
  B1: { width: 728, height: 1030 },
};

// 単位変換関数
export function convertUnit(
  value: number,
  from: SizeUnit,
  to: SizeUnit,
): number {
  // まずmmに変換
  let mmValue: number;
  switch (from) {
    case "mm":
      mmValue = value;
      break;
    case "cm":
      mmValue = value * 10;
      break;
    case "inch":
      mmValue = value * 25.4;
      break;
  }

  // 目的の単位に変換
  switch (to) {
    case "mm":
      return mmValue;
    case "cm":
      return mmValue / 10;
    case "inch":
      return mmValue / 25.4;
  }
}
