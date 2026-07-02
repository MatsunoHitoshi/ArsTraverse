import type { OcrMetadata } from "@/server/api/schemas/scan";
import {
  cropRegionToBlob,
  loadImageBitmapFromFile,
} from "@/features/field/ocr/image-crop";
import type {
  OcrLanguage,
  OcrProgressHandler,
  OcrResult,
} from "@/features/field/ocr/ocr-types";
import {
  DEFAULT_OCR_REGION,
  type NormalizedOcrRegion,
} from "@/features/field/ocr/region-types";

export type { OcrLanguage } from "@/features/field/ocr/ocr-types";

const OCR_STATUS_LABELS: Record<string, string> = {
  "loading tesseract core": "Loading OCR engine",
  "initializing tesseract": "Initializing OCR",
  "loading language traineddata": "Loading language data",
  "initializing api": "Initializing OCR API",
  "recognizing text": "Recognizing text",
};

export function getOcrStatusLabel(update: {
  status: string;
  regionIndex?: number;
  regionCount?: number;
}): string {
  const base = OCR_STATUS_LABELS[update.status] ?? "Preparing OCR";
  if (update.regionIndex != null && update.regionCount != null) {
    return `${base} (region ${update.regionIndex + 1}/${update.regionCount})`;
  }
  return base;
}

export async function runTesseractOnRegions(
  file: File,
  regions: NormalizedOcrRegion[],
  language: Exclude<OcrLanguage, "jpn_vert"> = "jpn",
  onProgress?: OcrProgressHandler,
): Promise<OcrResult> {
  const effectiveRegions =
    regions.length > 0 ? regions : [DEFAULT_OCR_REGION];

  const bitmap = await loadImageBitmapFromFile(file);
  try {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker(language, 1, {
      logger: (message) => {
        onProgress?.({
          progress: message.progress ?? 0,
          status: message.status,
        });
      },
    });

    try {
      const textParts: string[] = [];
      let confidenceSum = 0;
      let recognizedCount = 0;

      for (let index = 0; index < effectiveRegions.length; index++) {
        const region = effectiveRegions[index]!;
        onProgress?.({
          progress: 0,
          status: "recognizing text",
          regionIndex: index,
          regionCount: effectiveRegions.length,
        });

        const blob = await cropRegionToBlob(bitmap, region);
        const { data } = await worker.recognize(blob);

        const text = data.text.trim();
        if (text) {
          textParts.push(text);
        }
        confidenceSum += data.confidence;
        recognizedCount += 1;
      }

      return {
        plainText: textParts.join("\n\n"),
        ocrMetadata: {
          engine: "tesseract.js",
          language,
          confidence:
            recognizedCount > 0 ? confidenceSum / recognizedCount : undefined,
          regions: effectiveRegions,
          processedAt: new Date().toISOString(),
        } satisfies OcrMetadata,
      };
    } finally {
      await worker.terminate();
    }
  } finally {
    bitmap.close();
  }
}
