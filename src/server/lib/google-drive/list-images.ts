import type { drive_v3 } from "googleapis";

export type DriveImageFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string | null;
  webViewLink: string | null;
};

const IMAGE_MIME_PREFIX = "image/";
const FOLDER_MIME = "application/vnd.google-apps.folder";

function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function listChildren(
  drive: drive_v3.Drive,
  folderId: string,
): Promise<drive_v3.Schema$File[]> {
  const files: drive_v3.Schema$File[] = [];
  let pageToken: string | undefined;
  const query = `'${escapeDriveQueryValue(folderId)}' in parents and trashed = false`;

  do {
    const response = await drive.files.list({
      q: query,
      fields:
        "nextPageToken, files(id, name, mimeType, modifiedTime, webViewLink)",
      pageSize: 100,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    files.push(...(response.data.files ?? []));
    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);

  return files;
}

export async function listDriveImageFilesInFolder(
  drive: drive_v3.Drive,
  folderId: string,
  options?: { includeSubfolders?: boolean },
): Promise<DriveImageFile[]> {
  const includeSubfolders = options?.includeSubfolders !== false;
  const roots = await listChildren(drive, folderId);
  const files = roots.filter(
    (file) => file.mimeType?.startsWith(IMAGE_MIME_PREFIX) && file.id,
  );

  if (includeSubfolders) {
    const folders = roots.filter((file) => file.mimeType === FOLDER_MIME && file.id);
    for (const folder of folders) {
      const nested = await listChildren(drive, folder.id!);
      for (const file of nested) {
        if (file.mimeType?.startsWith(IMAGE_MIME_PREFIX) && file.id) {
          files.push(file);
        }
      }
    }
  }

  return files
    .map((file) => ({
      id: file.id!,
      name: file.name ?? file.id!,
      mimeType: file.mimeType ?? "image/jpeg",
      modifiedTime: file.modifiedTime ?? null,
      webViewLink: file.webViewLink ?? null,
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "ja"));
}
