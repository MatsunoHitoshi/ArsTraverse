import type {
  OcrLanguage,
  PdfExtractionMetadata,
} from "@/server/lib/pdf-extraction/types";

export type OcrLanguageMode = OcrLanguage | "auto";

export type DriveSourceMetadata = PdfExtractionMetadata & {
  drive?: {
    fileId: string;
    mimeType: string;
    folderId?: string;
  };
};

export function buildDriveSourceMetadata(input: {
  fileId: string;
  mimeType: string;
  folderId?: string;
  extraction?: PdfExtractionMetadata["extraction"];
  plainText?: string;
}): DriveSourceMetadata {
  return {
    drive: {
      fileId: input.fileId,
      mimeType: input.mimeType,
      folderId: input.folderId,
    },
    extraction: input.extraction,
    plainText: input.plainText,
  };
}

export function readDriveMimeType(ocrMetadata: unknown): string | undefined {
  if (!ocrMetadata || typeof ocrMetadata !== "object") return undefined;
  const drive = (ocrMetadata as DriveSourceMetadata).drive;
  return drive?.mimeType;
}

export function readCachedPlainText(ocrMetadata: unknown): string | undefined {
  if (!ocrMetadata || typeof ocrMetadata !== "object") return undefined;
  const plainText = (ocrMetadata as PdfExtractionMetadata).plainText;
  return typeof plainText === "string" && plainText.trim()
    ? plainText.trim()
    : undefined;
}

export function parseDefaultOcrLanguage(
  value: string | null | undefined,
): OcrLanguage {
  if (value === "jpn_vert" || value === "eng" || value === "jpn") {
    return value;
  }
  return "jpn";
}

export function parseOcrLanguageMode(
  value: string | null | undefined,
): OcrLanguageMode {
  if (value === "auto") return "auto";
  return parseDefaultOcrLanguage(value);
}

export function resolveJobOcrLanguage(
  jobOcrLanguage: string | null | undefined,
  topicSpaceDefault: string | null | undefined,
): {
  mode: OcrLanguageMode;
  forceLanguage?: OcrLanguage;
  defaultLanguage: OcrLanguage;
} {
  const mode = parseOcrLanguageMode(jobOcrLanguage);
  const defaultLanguage = parseDefaultOcrLanguage(topicSpaceDefault);
  if (mode === "auto") {
    return { mode, defaultLanguage };
  }
  return { mode, forceLanguage: mode, defaultLanguage: mode };
}

export function readDriveFileId(
  ocrMetadata: unknown,
  externalSourceId?: string | null,
): string | undefined {
  const fromExternal = externalSourceId?.trim();
  if (fromExternal) return fromExternal;
  if (!ocrMetadata || typeof ocrMetadata !== "object") return undefined;
  const fileId = (ocrMetadata as DriveSourceMetadata).drive?.fileId;
  return typeof fileId === "string" && fileId.trim() ? fileId.trim() : undefined;
}
