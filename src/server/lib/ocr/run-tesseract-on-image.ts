import type { OcrMetadata } from "@/server/api/schemas/scan";
import type { OcrLanguage } from "@/server/lib/pdf-extraction/types";
import { createWorker } from "tesseract.js";

export async function runTesseractOnImageBuffer(
  imageBuffer: Buffer,
  language: Exclude<OcrLanguage, "jpn_vert">,
): Promise<{ plainText: string; confidence: number; ocrMetadata: OcrMetadata }> {
  const worker = await createWorker(language, 1);
  try {
    const { data } = await worker.recognize(imageBuffer);
    const plainText = data.text.trim();
    return {
      plainText,
      confidence: data.confidence,
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
