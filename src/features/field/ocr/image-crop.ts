import type { NormalizedOcrRegion } from "@/features/field/ocr/region-types";
import { clampRegion } from "@/features/field/ocr/region-types";

export async function loadImageBitmapFromFile(file: File): Promise<ImageBitmap> {
  return createImageBitmap(file, { imageOrientation: "from-image" });
}

export async function rotateImageFile90CounterClockwise(
  file: File,
  mimeType = "image/jpeg",
): Promise<File> {
  const bitmap = await loadImageBitmapFromFile(file);

  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.height;
    canvas.height = bitmap.width;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas is not available");
    }

    ctx.translate(0, canvas.height);
    ctx.rotate(-Math.PI / 2);
    ctx.drawImage(bitmap, 0, 0);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (result) {
            resolve(result);
            return;
          }
          reject(new Error("Failed to generate rotated image"));
        },
        mimeType,
        0.92,
      );
    });

    return new File([blob], file.name, { type: mimeType });
  } finally {
    bitmap.close();
  }
}

export function cropRegionFromBitmap(
  bitmap: ImageBitmap,
  region: NormalizedOcrRegion,
): HTMLCanvasElement {
  const clamped = clampRegion(region);
  const sx = Math.round(clamped.x * bitmap.width);
  const sy = Math.round(clamped.y * bitmap.height);
  const sw = Math.max(1, Math.round(clamped.w * bitmap.width));
  const sh = Math.max(1, Math.round(clamped.h * bitmap.height));

  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas is not available");
  }

  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
  return canvas;
}

export async function cropRegionToBlob(
  bitmap: ImageBitmap,
  region: NormalizedOcrRegion,
  mimeType = "image/png",
): Promise<Blob> {
  const canvas = cropRegionFromBitmap(bitmap, region);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        reject(new Error("Failed to generate cropped image"));
      },
      mimeType,
      0.92,
    );
  });
}
