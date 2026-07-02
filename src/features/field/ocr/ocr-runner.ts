import type {
  OcrLanguage,
  OcrProgressHandler,
  OcrResult,
} from "@/features/field/ocr/ocr-types";
import { runNdlOcrOnRegions } from "@/features/field/ocr/ndlocr/ndlocr-client";
import type { NormalizedOcrRegion } from "@/features/field/ocr/region-types";
import { runTesseractOnRegions } from "@/features/field/ocr/tesseract-client";

export type {
  OcrLanguage,
  OcrProgressHandler,
  OcrProgressUpdate,
  OcrResult,
} from "@/features/field/ocr/ocr-types";

export async function runOcrOnRegions(
  file: File,
  regions: NormalizedOcrRegion[],
  language: OcrLanguage = "jpn",
  onProgress?: OcrProgressHandler,
): Promise<OcrResult> {
  if (language === "jpn_vert") {
    return runNdlOcrOnRegions(file, regions, onProgress);
  }

  return runTesseractOnRegions(file, regions, language, onProgress);
}
