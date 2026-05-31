import type { OcrMetadata } from "@/server/api/schemas/scan";

export type OcrLanguage = "jpn" | "jpn_vert" | "eng";

export type OcrResult = {
  plainText: string;
  ocrMetadata: OcrMetadata;
};

export type OcrProgressHandler = (progress: number) => void;

export async function runOcr(
  imageSource: string | File,
  language: OcrLanguage = "jpn",
  onProgress?: OcrProgressHandler,
): Promise<OcrResult> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker(language, 1, {
    logger: (message) => {
      if (message.status === "recognizing text") {
        onProgress?.(message.progress);
      }
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

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("画像の読み込みに失敗しました"));
    };
    reader.onerror = () => reject(new Error("画像の読み込みに失敗しました"));
    reader.readAsDataURL(file);
  });
}
