import { createHash } from "node:crypto";
import { DocumentType } from "@prisma/client";
import type { drive_v3 } from "googleapis";

export type DriveFileMeta = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  md5Checksum?: string | null;
  webViewLink?: string | null;
};

const TEXT_MIME_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "text/x-markdown",
  "application/json",
]);

const GOOGLE_DOC_MIME = "application/vnd.google-apps.document";

export function isSyncableDriveMimeType(mimeType: string): boolean {
  return (
    mimeType === GOOGLE_DOC_MIME ||
    mimeType === "application/pdf" ||
    TEXT_MIME_TYPES.has(mimeType) ||
    mimeType.startsWith("text/")
  );
}

export function resolveDocumentTypeFromDriveMime(mimeType: string): DocumentType {
  if (mimeType === "application/pdf") {
    return DocumentType.INPUT_PDF;
  }
  return DocumentType.INPUT_DRIVE;
}

export function computeDriveContentHash(meta: DriveFileMeta, body: string): string {
  const basis = [
    meta.id,
    meta.modifiedTime,
    meta.md5Checksum ?? "",
    body.length.toString(),
    createHash("sha256").update(body).digest("hex"),
  ].join("|");
  return createHash("sha256").update(basis).digest("hex");
}

export async function listDriveFilesInFolder(
  input: {
    folderId: string;
    recursive: boolean;
  },
  driveClient: drive_v3.Drive,
): Promise<DriveFileMeta[]> {
  const drive = driveClient;
  const files: DriveFileMeta[] = [];
  const queue = [input.folderId];

  while (queue.length > 0) {
    const currentFolderId = queue.shift();
    if (!currentFolderId) continue;

    let pageToken: string | undefined;
    do {
      const response = await drive.files.list({
        q: `'${currentFolderId}' in parents and trashed = false`,
        fields:
          "nextPageToken, files(id, name, mimeType, modifiedTime, md5Checksum, webViewLink)",
        pageSize: 100,
        pageToken,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });

      for (const file of response.data.files ?? []) {
        if (!file.id || !file.name || !file.mimeType || !file.modifiedTime) {
          continue;
        }

        if (file.mimeType === "application/vnd.google-apps.folder") {
          if (input.recursive) {
            queue.push(file.id);
          }
          continue;
        }

        if (!isSyncableDriveMimeType(file.mimeType)) {
          continue;
        }

        files.push({
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          modifiedTime: file.modifiedTime,
          md5Checksum: file.md5Checksum,
          webViewLink: file.webViewLink,
        });
      }

      pageToken = response.data.nextPageToken ?? undefined;
    } while (pageToken);
  }

  return files;
}

export async function fetchDriveFileText(
  meta: DriveFileMeta,
  driveClient: drive_v3.Drive,
): Promise<string> {
  const drive = driveClient;

  if (meta.mimeType === GOOGLE_DOC_MIME) {
    const response = await drive.files.export(
      { fileId: meta.id, mimeType: "text/plain" },
      { responseType: "text" },
    );
    const text = typeof response.data === "string" ? response.data : "";
    return text.trim();
  }

  if (meta.mimeType === "application/pdf") {
    const response = await drive.files.get(
      { fileId: meta.id, alt: "media" },
      { responseType: "arraybuffer" },
    );
    const buffer = Buffer.from(response.data as ArrayBuffer);
    const { createRequire } = await import("module");
    const require = createRequire(import.meta.url);
    const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (
      data: Buffer,
    ) => Promise<{ text: string }>;
    const parsed = await pdfParse(buffer);
    return parsed.text.trim();
  }

  const response = await drive.files.get(
    { fileId: meta.id, alt: "media" },
    { responseType: "text" },
  );
  const text = typeof response.data === "string" ? response.data : "";
  return text.trim();
}
