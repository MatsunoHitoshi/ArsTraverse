import type { OcrMetadata } from "@/server/api/schemas/scan";

export type OcrLanguage = "jpn" | "jpn_vert" | "eng";

export type OcrResult = {
  plainText: string;
  ocrMetadata: OcrMetadata;
};

export type OcrProgressUpdate = {
  progress: number;
  status: string;
};

export type OcrProgressHandler = (update: OcrProgressUpdate) => void;

const OCR_STATUS_LABELS: Record<string, string> = {
  "loading tesseract core": "OCR エンジンを読み込み中",
  "initializing tesseract": "OCR を初期化中",
  "loading language traineddata": "言語データを読み込み中",
  "initializing api": "OCR API を初期化中",
  "recognizing text": "文字を認識中",
};

export function getOcrStatusLabel(status: string): string {
  return OCR_STATUS_LABELS[status] ?? "OCR を準備中";
}

export async function runOcr(
  imageSource: string | File,
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
