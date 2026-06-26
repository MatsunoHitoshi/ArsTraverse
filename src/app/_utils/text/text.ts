import fs from "fs";
import { createRequire } from "module";
import { DocumentType } from "@prisma/client";
import { isFetchableStoragePublicUrl } from "../supabase/storage-url";
import { writeLocalFileFromUrl } from "../sys/file";
import { BUCKETS } from "../supabase/const";

const require = createRequire(import.meta.url);

type GetTextOptions = {
  externalSourceId?: string | null;
  mimeType?: string | null;
  fileName?: string | null;
  ocrMetadata?: unknown;
};

type PdfParseResult = { text: string };

async function extractPdfTextFromLocalFile(filePath: string): Promise<string> {
  // index.js runs a debug read when `!module.parent` (true under createRequire).
  const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (
    buffer: Buffer,
  ) => Promise<PdfParseResult>;
  const dataBuffer = await fs.promises.readFile(filePath);
  const pdfData = await pdfParse(dataBuffer);
  return pdfData.text.trim();
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

    const localFilePath = await writeLocalFileFromUrl(trimmedUrl, "input.pdf");
    return extractPdfTextFromLocalFile(localFilePath);
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
