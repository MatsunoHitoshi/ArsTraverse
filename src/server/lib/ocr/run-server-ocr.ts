import type { OcrMetadata } from "@/server/api/schemas/scan";
import { normalizeOcrTextWithLlm } from "@/server/services/scan/normalize-ocr-text.service";
import {
  detectLayoutOnly,
  runNdlOcrOnImage,
} from "@/server/lib/ndlocr-server/ndlocr-engine";
import { runTesseractOnImageBuffer } from "@/server/lib/ocr/run-tesseract-on-image";
import type { RasterizedPdfPage } from "@/server/lib/pdf/rasterize-pdf-pages";
import type { OcrLanguage } from "@/server/lib/pdf-extraction/types";

export type ServerOcrPageResult = {
  plainText: string;
  confidence: number;
  engine: "tesseract.js" | "ndlocr-lite";
  ocrMetadata: OcrMetadata;
};

async function runOcrOnPage(
  page: RasterizedPdfPage,
  language: OcrLanguage,
): Promise<ServerOcrPageResult> {
  if (language === "jpn_vert") {
    const result = await runNdlOcrOnImage(page.imageData);
    return {
      plainText: result.plainText,
      confidence: result.confidence,
      engine: "ndlocr-lite",
      ocrMetadata: {
        engine: "ndlocr-lite",
        language,
        confidence: result.confidence,
        processedAt: new Date().toISOString(),
      },
    };
  }

  const tessLanguage = language === "eng" ? "eng" : "jpn";
  const result = await runTesseractOnImageBuffer(page.pngBuffer, tessLanguage);
  return {
    plainText: result.plainText,
    confidence: result.confidence,
    engine: "tesseract.js",
    ocrMetadata: result.ocrMetadata,
  };
}

export async function runServerOcrOnPages(
  pages: RasterizedPdfPage[],
  language: OcrLanguage,
  options?: { normalizeWithLlm?: boolean },
): Promise<ServerOcrPageResult & { pagesProcessed: number }> {
  const textParts: string[] = [];
  let confidenceSum = 0;
  let recognizedCount = 0;
  let engine: ServerOcrPageResult["engine"] = "tesseract.js";

  for (const page of pages) {
    const result = await runOcrOnPage(page, language);
    if (result.plainText) {
      textParts.push(result.plainText);
      confidenceSum += result.confidence;
      recognizedCount += 1;
      engine = result.engine;
    }
  }

  let plainText = textParts.join("\n\n").trim();
  if (options?.normalizeWithLlm && plainText) {
    try {
      const normalized = await normalizeOcrTextWithLlm({
        plainText,
        language,
      });
      plainText = normalized.correctedText;
    } catch (error) {
      console.warn(
        "LLM OCR normalization failed, using raw OCR text:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  return {
    plainText,
    confidence: recognizedCount > 0 ? confidenceSum / recognizedCount : 0,
    engine,
    pagesProcessed: pages.length,
    ocrMetadata: {
      engine,
      language,
      confidence: recognizedCount > 0 ? confidenceSum / recognizedCount : 0,
      processedAt: new Date().toISOString(),
    },
  };
}

export async function detectLayoutForDirection(page: RasterizedPdfPage) {
  return detectLayoutOnly(page.imageData);
}
