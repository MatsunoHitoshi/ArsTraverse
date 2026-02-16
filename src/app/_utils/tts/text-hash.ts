import { createHash } from "node:crypto";

/**
 * テキストの SHA-256 ハッシュを hex 文字列で返す。
 * キャッシュキー・ファイルパスに使用。
 * サーバーサイドのみで利用すること。
 */
export function computeTextHash(text: string): string {
  const normalized = text.trim().replace(/\s+/g, " ");
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}
