export type DriveSourceMetadata = {
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
}): DriveSourceMetadata {
  return {
    drive: {
      fileId: input.fileId,
      mimeType: input.mimeType,
      folderId: input.folderId,
    },
  };
}

export function readDriveMimeType(
  ocrMetadata: unknown,
): string | undefined {
  if (!ocrMetadata || typeof ocrMetadata !== "object") return undefined;
  const drive = (ocrMetadata as DriveSourceMetadata).drive;
  return drive?.mimeType;
}
