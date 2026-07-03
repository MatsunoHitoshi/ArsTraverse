import { assessPdfTextQuality } from "@/server/lib/pdf/assess-pdf-text-quality";
import {
  detectWritingDirectionFromLayout,
  resolveOcrLanguage,
} from "@/server/lib/pdf/detect-writing-direction";
import { extractTextLayerFromPdfBuffer } from "@/server/lib/pdf/extract-text-from-pdf-buffer";
import { rasterizePdfPages } from "@/server/lib/pdf/rasterize-pdf-pages";
import {
  detectLayoutForDirection,
  runServerOcrOnPages,
} from "@/server/lib/ocr/run-server-ocr";
import type {
  ExtractPdfTextOptions,
  OcrLanguage,
  PdfExtractionMethod,
  PdfExtractionMetadata,
  PdfExtractionResult,
  WritingDirection,
} from "@/server/lib/pdf-extraction/types";

function buildExtractionMetadata(input: {
  method: PdfExtractionMethod;
  language: OcrLanguage;
  writingDirection: WritingDirection;
  directionConfidence: number;
  directionSource: "auto" | "topic_space_default" | "manual";
  qualityScore: number;
  confidence?: number;
  pageCount: number;
}): PdfExtractionMetadata["extraction"] {
  return {
    method: input.method,
    language: input.language,
    writingDirection: input.writingDirection,
    directionConfidence: input.directionConfidence,
    directionSource: input.directionSource,
    qualityScore: input.qualityScore,
    confidence: input.confidence,
    processedAt: new Date().toISOString(),
    pageCount: input.pageCount,
  };
}

export async function extractPdfTextFromBuffer(
  buffer: Buffer,
  options?: ExtractPdfTextOptions,
): Promise<PdfExtractionResult> {
  const defaultOcrLanguage = options?.defaultOcrLanguage ?? "jpn";
  const textLayer = await extractTextLayerFromPdfBuffer(buffer);
  const quality = assessPdfTextQuality(textLayer.text, textLayer.pageCount);

  if (!options?.forceOcr && !quality.needsOcr) {
    return {
      plainText: textLayer.text,
      method: textLayer.method,
      needsOcr: false,
      quality,
      pageCount: textLayer.pageCount,
      extraction: buildExtractionMetadata({
        method: textLayer.method,
        language: defaultOcrLanguage,
        writingDirection: "horizontal",
        directionConfidence: quality.score,
        directionSource: "auto",
        qualityScore: quality.score,
        pageCount: textLayer.pageCount,
      }),
    };
  }

  if (!options?.processOcr) {
    return {
      plainText: "",
      method: textLayer.method,
      needsOcr: true,
      quality,
      pageCount: textLayer.pageCount,
    };
  }

  const rasterized = await rasterizePdfPages(buffer, {
    maxPages: options.maxPages,
    startPage: options.startPage,
  });

  if (rasterized.pages.length === 0) {
    return {
      plainText: "",
      method: textLayer.method,
      needsOcr: true,
      quality,
      pageCount: textLayer.pageCount,
    };
  }

  const directionSamplePage = rasterized.pages[0]!;
  let resolvedLanguage: {
    language: OcrLanguage;
    directionSource: "auto" | "topic_space_default" | "manual";
    writingDirection: WritingDirection;
    directionConfidence: number;
  };

  if (options?.forceOcrLanguage) {
    resolvedLanguage = {
      language: options.forceOcrLanguage,
      directionSource: "manual",
      writingDirection:
        options.forceOcrLanguage === "jpn_vert" ? "vertical" : "horizontal",
      directionConfidence: 1,
    };
  } else {
    const layout = await detectLayoutForDirection(directionSamplePage);
    const detection = detectWritingDirectionFromLayout(layout);
    resolvedLanguage = resolveOcrLanguage({
      detection,
      defaultOcrLanguage,
    });
  }

  const ocrResult = await runServerOcrOnPages(
    rasterized.pages,
    resolvedLanguage.language,
    { normalizeWithLlm: true },
  );

  const method =
    resolvedLanguage.language === "jpn_vert" ? "ocr-ndlocr" : "ocr-tesseract";

  return {
    plainText: ocrResult.plainText,
    method,
    needsOcr: false,
    quality,
    pageCount: rasterized.pageCount,
    extraction: buildExtractionMetadata({
      method,
      language: resolvedLanguage.language,
      writingDirection: resolvedLanguage.writingDirection,
      directionConfidence: resolvedLanguage.directionConfidence,
      directionSource: resolvedLanguage.directionSource,
      qualityScore: quality.score,
      confidence: ocrResult.confidence,
      pageCount: rasterized.pageCount,
    }),
  };
}
