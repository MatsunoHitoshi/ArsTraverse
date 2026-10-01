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

export type DriveFolderEntry = {
  id: string;
  name: string;
};

function compareDriveName(left: { name: string }, right: { name: string }): number {
  return left.name.localeCompare(right.name, "ja");
}

/** 指定フォルダの直下だけを返す。サブフォルダの中身は展開しない。 */
export async function listDriveFolderChildren(
  drive: drive_v3.Drive,
  folderId: string,
): Promise<{ files: DriveImageFile[]; folders: DriveFolderEntry[] }> {
  const children = await listChildren(drive, folderId);
  const folders: DriveFolderEntry[] = [];
  const files: DriveImageFile[] = [];

  for (const file of children) {
    if (!file.id) continue;
    if (file.mimeType === FOLDER_MIME) {
      folders.push({ id: file.id, name: file.name ?? file.id });
      continue;
    }
    if (!file.mimeType?.startsWith(IMAGE_MIME_PREFIX)) continue;
    files.push({
      id: file.id,
      name: file.name ?? file.id,
      mimeType: file.mimeType,
      modifiedTime: file.modifiedTime ?? null,
      webViewLink: file.webViewLink ?? null,
    });
  }

  folders.sort(compareDriveName);
  files.sort(compareDriveName);
  return { files, folders };
}

const PARENT_WALK_LIMIT = 16;

/** `itemId` 自身か、その親を辿った先に `rootFolderId` があるか。 */
export async function driveItemIsInsideFolder(
  drive: drive_v3.Drive,
  itemId: string,
  rootFolderId: string,
): Promise<boolean> {
  if (!itemId || !rootFolderId) return false;
  if (itemId === rootFolderId) return true;

  const visited = new Set<string>();
  let frontier = [itemId];

  for (let depth = 0; depth < PARENT_WALK_LIMIT && frontier.length > 0; depth += 1) {
    const next: string[] = [];
    for (const current of frontier) {
      if (visited.has(current)) continue;
      visited.add(current);
      let parents: string[] = [];
      try {
        const response = await drive.files.get({
          fileId: current,
          fields: "id, parents",
          supportsAllDrives: true,
        });
        parents = response.data.parents ?? [];
      } catch {
        continue;
      }
      for (const parent of parents) {
        if (parent === rootFolderId) return true;
        if (!visited.has(parent)) next.push(parent);
      }
    }
    frontier = next;
  }

  return false;
}
