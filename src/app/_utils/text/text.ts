import fs from "fs";
import { DocumentType } from "@prisma/client";
import { isFetchableStoragePublicUrl } from "../supabase/storage-url";
import { writeLocalFileFromUrl } from "../sys/file";
import { BUCKETS } from "../supabase/const";
import { extractPdfTextFromBuffer } from "@/server/lib/pdf/extract-pdf-text";
import { readCachedPlainText } from "@/server/lib/google-drive/source-metadata";
import type { OcrLanguage } from "@/server/lib/pdf-extraction/types";

type GetTextOptions = {
  externalSourceId?: string | null;
  mimeType?: string | null;
  fileName?: string | null;
  ocrMetadata?: unknown;
  defaultOcrLanguage?: OcrLanguage;
  processOcr?: boolean;
};

async function extractPdfTextFromLocalFile(
  filePath: string,
  options?: Pick<GetTextOptions, "defaultOcrLanguage" | "processOcr">,
): Promise<string> {
  const dataBuffer = await fs.promises.readFile(filePath);
  const result = await extractPdfTextFromBuffer(dataBuffer, {
    defaultOcrLanguage: options?.defaultOcrLanguage ?? "jpn",
    processOcr: options?.processOcr ?? true,
  });
  return result.plainText.trim();
}

export const getTextFromDocumentFile = async (
  url: string,
  type: DocumentType,
  options?: GetTextOptions,
) => {
  const trimmedUrl = url.trim();
  if (!trimmedUrl && type !== DocumentType.INPUT_DRIVE) {
    throw new Error("ドキュメント URL が空です");
  }

  if (type === DocumentType.INPUT_DRIVE) {
    throw new Error(
      "INPUT_DRIVE の本文取得は resolveSourceDocumentPlainText を使用してください",
    );
  }

  if (type === DocumentType.INPUT_PDF) {
    const fileId = options?.externalSourceId?.trim();
    if (fileId) {
      throw new Error(
        "Drive 由来 PDF の本文取得は resolveSourceDocumentPlainText を使用してください",
      );
    }

    const cached = readCachedPlainText(options?.ocrMetadata);
    if (cached) return cached;

    const localFilePath = await writeLocalFileFromUrl(trimmedUrl, "input.pdf");
    return extractPdfTextFromLocalFile(localFilePath, {
      defaultOcrLanguage: options?.defaultOcrLanguage,
      processOcr: options?.processOcr ?? true,
    });
  }

  if (type !== DocumentType.INPUT_TXT && type !== DocumentType.INPUT_SCAN) {
    throw new Error(`未対応のドキュメントタイプです: ${String(type)}`);
  }

  if (!isFetchableStoragePublicUrl(trimmedUrl, BUCKETS.PATH_TO_INPUT_TXT)) {
    throw new Error("ドキュメント本文の取得に失敗しました");
  }

  const response = await fetch(trimmedUrl);
  const text = await response.text();

  if (
    !response.ok ||
    (text.startsWith("{") &&
      text.includes('"InvalidKey"') &&
      text.includes('"statusCode"'))
  ) {
    throw new Error("ドキュメント本文の取得に失敗しました");
  }

  return text;
};
