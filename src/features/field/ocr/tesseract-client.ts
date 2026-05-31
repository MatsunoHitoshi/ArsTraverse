import type { OcrMetadata } from "@/server/api/schemas/scan";
import {
  cropRegionToBlob,
  loadImageBitmapFromFile,
} from "@/features/field/ocr/image-crop";
import {
  DEFAULT_OCR_REGION,
  type NormalizedOcrRegion,
} from "@/features/field/ocr/region-types";

export type OcrLanguage = "jpn" | "jpn_vert" | "eng";

export type OcrResult = {
  plainText: string;
  ocrMetadata: OcrMetadata;
};

export type OcrProgressUpdate = {
  progress: number;
  status: string;
  regionIndex?: number;
  regionCount?: number;
};

export type OcrProgressHandler = (update: OcrProgressUpdate) => void;

const OCR_STATUS_LABELS: Record<string, string> = {
  "loading tesseract core": "OCR エンジンを読み込み中",
  "initializing tesseract": "OCR を初期化中",
  "loading language traineddata": "言語データを読み込み中",
  "initializing api": "OCR API を初期化中",
  "recognizing text": "文字を認識中",
};

export function getOcrStatusLabel(update: OcrProgressUpdate): string {
  const base = OCR_STATUS_LABELS[update.status] ?? "OCR を準備中";
  if (update.regionIndex != null && update.regionCount != null) {
    return `${base}（領域 ${update.regionIndex + 1}/${update.regionCount}）`;
  }
  return base;
}

export async function runOcr(
  imageSource: string | File | Blob,
  language: OcrLanguage = "jpn",
  onProgress?: OcrProgressHandler,
): Promise<OcrResult> {
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
    const { data } = await worker.recognize(imageSource);
    const plainText = data.text.trim();

    return {
      plainText,
      ocrMetadata: {
        engine: "tesseract.js",
        language,
        confidence: data.confidence,
        processedAt: new Date().toISOString(),
      },
    };
  } finally {
    await worker.terminate();
  }
}

export async function runOcrOnRegions(
  file: File,
  regions: NormalizedOcrRegion[],
  language: OcrLanguage = "jpn",
  onProgress?: OcrProgressHandler,
): Promise<OcrResult> {
  const effectiveRegions =
    regions.length > 0 ? regions : [DEFAULT_OCR_REGION];

  const bitmap = await loadImageBitmapFromFile(file);
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
      },
    };
  } finally {
    await worker.terminate();
    bitmap.close();
  }
}
