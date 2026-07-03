import type { OcrTextLanguage } from "@/server/services/scan/normalize-ocr-text.service";

export type OcrLanguage = OcrTextLanguage;

export type WritingDirection =
  | "horizontal"
  | "vertical"
  | "mixed"
  | "unknown";

export type PdfExtractionMethod =
  | "pdf-parse"
  | "pdf-loader"
  | "ocr-tesseract"
  | "ocr-ndlocr";

export type PdfExtractionMetadata = {
  drive?: {
    fileId: string;
    mimeType: string;
    folderId?: string;
  };
  extraction?: {
    method: PdfExtractionMethod;
    language: OcrLanguage;
    writingDirection: WritingDirection;
    directionConfidence?: number;
    directionSource: "auto" | "topic_space_default" | "manual";
    qualityScore?: number;
    confidence?: number;
    processedAt?: string;
    pageCount?: number;
  };
  plainText?: string;
};

export type PdfTextQuality = {
  score: number;
  needsOcr: boolean;
  reasons: string[];
};

export type PdfExtractionResult = {
  plainText: string;
  method: PdfExtractionMethod;
  needsOcr: boolean;
  quality: PdfTextQuality;
  pageCount: number;
  extraction?: PdfExtractionMetadata["extraction"];
};

export type OcrLanguageMode = OcrLanguage | "auto";

export type ExtractPdfTextOptions = {
  defaultOcrLanguage?: OcrLanguage;
  forceOcrLanguage?: OcrLanguage;
  /** テキスト層の品質に関わらず OCR を実行する */
  forceOcr?: boolean;
  processOcr?: boolean;
  maxPages?: number;
  startPage?: number;
};
