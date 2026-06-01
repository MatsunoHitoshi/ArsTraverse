import type { CSSProperties } from "react";
import type { OcrRegion } from "@/server/api/schemas/scan";

export type NormalizedOcrRegion = OcrRegion;

/** Suggested default ROI (centered, leaves margins for captions/background). */
export const DEFAULT_OCR_REGION: NormalizedOcrRegion = {
  x: 0.075,
  y: 0.1,
  w: 0.85,
  h: 0.75,
};

export type DisplayedImageLayout = {
  offsetX: number;
  offsetY: number;
  displayWidth: number;
  displayHeight: number;
  containerWidth: number;
  containerHeight: number;
};

export function getDisplayedImageLayout(
  containerWidth: number,
  containerHeight: number,
  naturalWidth: number,
  naturalHeight: number,
): DisplayedImageLayout {
  if (naturalWidth <= 0 || naturalHeight <= 0 || containerWidth <= 0) {
    return {
      offsetX: 0,
      offsetY: 0,
      displayWidth: containerWidth,
      displayHeight: containerHeight,
      containerWidth,
      containerHeight,
    };
  }

  const scale = Math.min(
    containerWidth / naturalWidth,
    containerHeight / naturalHeight,
  );
  const displayWidth = naturalWidth * scale;
  const displayHeight = naturalHeight * scale;

  return {
    offsetX: (containerWidth - displayWidth) / 2,
    offsetY: (containerHeight - displayHeight) / 2,
    displayWidth,
    displayHeight,
    containerWidth,
    containerHeight,
  };
}

export function clientPointToNormalized(
  clientX: number,
  clientY: number,
  containerRect: DOMRect,
  layout: DisplayedImageLayout,
): { x: number; y: number } | null {
  const localX = clientX - containerRect.left - layout.offsetX;
  const localY = clientY - containerRect.top - layout.offsetY;

  if (
    localX < 0 ||
    localY < 0 ||
    localX > layout.displayWidth ||
    localY > layout.displayHeight
  ) {
    return null;
  }

  return {
    x: localX / layout.displayWidth,
    y: localY / layout.displayHeight,
  };
}

export type RegionCorner = "tl" | "tr" | "br" | "bl";

const MIN_REGION_SIZE = 0.03;

export function getRegionCorners(
  region: NormalizedOcrRegion,
): Record<RegionCorner, { x: number; y: number }> {
  return {
    tl: { x: region.x, y: region.y },
    tr: { x: region.x + region.w, y: region.y },
    br: { x: region.x + region.w, y: region.y + region.h },
    bl: { x: region.x, y: region.y + region.h },
  };
}

export function updateRegionCorner(
  region: NormalizedOcrRegion,
  corner: RegionCorner,
  point: { x: number; y: number },
): NormalizedOcrRegion {
  const right = region.x + region.w;
  const bottom = region.y + region.h;
  let x = region.x;
  let y = region.y;
  let w = region.w;
  let h = region.h;

  switch (corner) {
    case "tl":
      x = point.x;
      y = point.y;
      w = right - x;
      h = bottom - y;
      break;
    case "tr":
      y = point.y;
      w = point.x - region.x;
      h = bottom - y;
      break;
    case "br":
      w = point.x - region.x;
      h = point.y - region.y;
      break;
    case "bl":
      x = point.x;
      w = right - x;
      h = point.y - region.y;
      break;
  }

  if (w < 0) {
    x += w;
    w = -w;
  }
  if (h < 0) {
    y += h;
    h = -h;
  }

  return clampRegion({ x, y, w, h });
}

export function moveRegion(
  region: NormalizedOcrRegion,
  delta: { dx: number; dy: number },
): NormalizedOcrRegion {
  return clampRegion({
    x: region.x + delta.dx,
    y: region.y + delta.dy,
    w: region.w,
    h: region.h,
  });
}

export function createOffsetDefaultRegion(index: number): NormalizedOcrRegion {
  const offset = Math.min(0.05 * index, 0.15);
  return clampRegion({
    x: DEFAULT_OCR_REGION.x + offset,
    y: DEFAULT_OCR_REGION.y + offset,
    w: DEFAULT_OCR_REGION.w,
    h: DEFAULT_OCR_REGION.h,
  });
}

export function clampRegion(region: NormalizedOcrRegion): NormalizedOcrRegion {
  let { x, y, w, h } = region;
  w = Math.max(MIN_REGION_SIZE, Math.min(1, w));
  h = Math.max(MIN_REGION_SIZE, Math.min(1, h));
  x = Math.max(0, Math.min(1 - w, x));
  y = Math.max(0, Math.min(1 - h, y));
  return { x, y, w, h };
}

export function regionToOverlayStyle(
  region: NormalizedOcrRegion,
  layout: DisplayedImageLayout,
): CSSProperties {
  return {
    left: layout.offsetX + region.x * layout.displayWidth,
    top: layout.offsetY + region.y * layout.displayHeight,
    width: region.w * layout.displayWidth,
    height: region.h * layout.displayHeight,
  };
}

export function cornerToRegionStyle(corner: RegionCorner): CSSProperties {
  switch (corner) {
    case "tl":
      return { left: 0, top: 0 };
    case "tr":
      return { left: "100%", top: 0 };
    case "br":
      return { left: "100%", top: "100%" };
    case "bl":
      return { left: 0, top: "100%" };
  }
}
