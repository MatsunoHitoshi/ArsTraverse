export function getStorageObjectKeyFromPublicUrl(
  url: string,
  bucket: string,
): string | null {
  try {
    const pathname = new URL(url).pathname;
    const marker = `/storage/v1/object/public/${bucket}/`;
    const index = pathname.indexOf(marker);
    if (index === -1) {
      return null;
    }

    const objectKey = pathname.slice(index + marker.length);
    return objectKey.length > 0 ? decodeURIComponent(objectKey) : null;
  } catch {
    return null;
  }
}

export function isFetchableStoragePublicUrl(
  url: string,
  bucket: string,
): boolean {
  return getStorageObjectKeyFromPublicUrl(url, bucket) != null;
}
