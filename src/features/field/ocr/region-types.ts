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

export function normalizedRectFromPoints(
  start: { x: number; y: number },
  end: { x: number; y: number },
): NormalizedOcrRegion | null {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const w = Math.abs(end.x - start.x);
  const h = Math.abs(end.y - start.y);

  if (w < 0.03 || h < 0.03) {
    return null;
  }

  return clampRegion({ x, y, w, h });
}

export function clampRegion(region: NormalizedOcrRegion): NormalizedOcrRegion {
  const x = Math.max(0, Math.min(1, region.x));
  const y = Math.max(0, Math.min(1, region.y));
  const w = Math.max(0.01, Math.min(1 - x, region.w));
  const h = Math.max(0.01, Math.min(1 - y, region.h));
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
