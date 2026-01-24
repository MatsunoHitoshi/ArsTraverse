export type PageSizeTemplate = "A4" | "A3" | "A2" | "A1" | "A0" | "B4" | "B3" | "B2" | "B1";
export type SizeUnit = "mm" | "cm" | "inch";
export type PageOrientation = "portrait" | "landscape";
export type ColorMode = "color" | "grayscale";
export type MetaGraphDisplayMode = "none" | "story" | "all";
export type TextOverlayDisplayMode = "none" | "show";
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
  title: number;
  body: number;
  graph: number;
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
  layoutOrientation?: LayoutOrientation;
  detailedGraphDisplay?: DetailedGraphDisplayMode;
  showEdgeLabels?: boolean;
}

// テンプレートサイズ定義（mm単位）
export const PAGE_SIZE_TEMPLATES: Record<PageSizeTemplate, { width: number; height: number }> = {
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
export function convertUnit(value: number, from: SizeUnit, to: SizeUnit): number {
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
