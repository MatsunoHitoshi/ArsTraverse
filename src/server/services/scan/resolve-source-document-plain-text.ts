import { DocumentType } from "@prisma/client";
import { getTextFromDocumentFile } from "@/app/_utils/text/text";
import type { OcrMetadata } from "@/server/api/schemas/scan";
import { db } from "@/server/db";
import { fetchDriveFileText } from "@/server/lib/google-drive/fetch-document-text";
import { readDriveMimeType } from "@/server/lib/google-drive/source-metadata";
import { getGoogleDriveClientForUser } from "@/server/lib/google-drive/user-oauth";
import { resolveScanPlainText } from "@/server/services/scan/resolve-scan-plain-text";

type SourceDocumentTextSource = {
  url: string;
  name?: string;
  userId?: string;
  documentType: DocumentType;
  ocrMetadata: unknown;
  externalSourceId?: string | null;
};

async function resolveDriveBackedPlainText(
  document: SourceDocumentTextSource,
): Promise<string> {
  const fileId = document.externalSourceId?.trim();
  const userId = document.userId?.trim();
  if (!fileId || !userId) {
    throw new Error("Drive ドキュメントの externalSourceId または userId が未設定です");
  }

  const mimeType =
    readDriveMimeType(document.ocrMetadata) ??
    (document.documentType === DocumentType.INPUT_PDF
      ? "application/pdf"
      : "text/plain");

  const drive = await getGoogleDriveClientForUser(db, userId);
  return fetchDriveFileText(
    {
      id: fileId,
      name: document.name ?? fileId,
      mimeType,
      modifiedTime: new Date().toISOString(),
    },
    drive,
  );
}

export async function resolveSourceDocumentPlainText(
  document: SourceDocumentTextSource,
): Promise<string> {
  if (document.documentType === DocumentType.INPUT_SCAN) {
    try {
      return await resolveScanPlainText(
        document.url,
        document.documentType,
        document.ocrMetadata as OcrMetadata | null,
      );
    } catch (error) {
      console.error("Failed to resolve scan plain text", {
        documentType: document.documentType,
        error,
      });
      return "";
    }
  }

  if (
    document.externalSourceId &&
    (document.documentType === DocumentType.INPUT_DRIVE ||
      document.documentType === DocumentType.INPUT_PDF)
  ) {
    try {
      return await resolveDriveBackedPlainText(document);
    } catch (error) {
      console.error("Failed to load drive-backed document text", {
        documentType: document.documentType,
        error,
      });
      return "";
    }
  }

  const url = document.url?.trim();
  if (!url) {
    return "";
  }

  try {
    return await getTextFromDocumentFile(url, document.documentType, {
      fileName: document.name,
      ocrMetadata: document.ocrMetadata,
    });
  } catch (error) {
    console.error("Failed to load source document text", {
      documentType: document.documentType,
      error,
    });
    return "";
  }
}
