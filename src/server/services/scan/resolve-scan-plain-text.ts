import { BUCKETS } from "@/app/_utils/supabase/const";
import { isFetchableStoragePublicUrl } from "@/app/_utils/supabase/storage-url";
import { getTextFromDocumentFile } from "@/app/_utils/text/text";
import type { DocumentType } from "@prisma/client";
import type { OcrMetadata } from "@/server/api/schemas/scan";

const MISSING_PLAIN_TEXT_MESSAGE =
  "OCR テキストを取得できませんでした。新しいスキャンを作成してください。";

export async function resolveScanPlainText(
  url: string,
  documentType: DocumentType,
  ocrMetadata: OcrMetadata | null,
): Promise<string> {
  const storedPlainText = ocrMetadata?.plainText?.trim();
  if (storedPlainText) {
    return storedPlainText;
  }

  if (!isFetchableStoragePublicUrl(url, BUCKETS.PATH_TO_INPUT_TXT)) {
    return MISSING_PLAIN_TEXT_MESSAGE;
  }

  try {
    return await getTextFromDocumentFile(url, documentType);
  } catch {
    return MISSING_PLAIN_TEXT_MESSAGE;
  }
}
