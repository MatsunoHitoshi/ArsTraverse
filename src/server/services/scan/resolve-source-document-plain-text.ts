import { DocumentType } from "@prisma/client";
import { getTextFromDocumentFile } from "@/app/_utils/text/text";
import type { OcrMetadata } from "@/server/api/schemas/scan";
import { resolveScanPlainText } from "@/server/services/scan/resolve-scan-plain-text";

type SourceDocumentTextSource = {
  url: string;
  documentType: DocumentType;
  ocrMetadata: unknown;
};

export async function resolveSourceDocumentPlainText(
  document: SourceDocumentTextSource,
): Promise<string> {
  if (document.documentType === DocumentType.INPUT_SCAN) {
    return resolveScanPlainText(
      document.url,
      document.documentType,
      document.ocrMetadata as OcrMetadata | null,
    );
  }

  const url = document.url?.trim();
  if (!url) {
    return "";
  }

  try {
    return await getTextFromDocumentFile(url, document.documentType);
  } catch (error) {
    console.error("Failed to load source document text", {
      documentType: document.documentType,
      error,
    });
    return "";
  }
}
