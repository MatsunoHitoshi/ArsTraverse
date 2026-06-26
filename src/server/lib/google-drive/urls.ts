export function buildDriveWebViewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

export function buildDriveFolderUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${folderId}`;
}
