import { Document } from "@langchain/core/documents";
import { TokenTextSplitter } from "@langchain/textsplitters";

/**
 * プレーンテキストから Document[] を生成する（ファイルを経由しない）。
 * PDF/OCR 依存を含まないため、KG バッチ Cron など軽量ルート向け。
 */
export async function textInspectFromPlainText(
  plainText: string,
  options?: {
    chunkSize?: number;
    chunkOverlap?: number;
  },
): Promise<Document[]> {
  if (!plainText.trim()) return [];

  const textSplitter = new TokenTextSplitter({
    chunkSize: options?.chunkSize ?? 2048,
    chunkOverlap: options?.chunkOverlap ?? 256,
  });

  const chunks = await textSplitter.splitText(plainText.trim());
  return chunks.map(
    (chunk, index) =>
      new Document({
        pageContent: chunk,
        metadata: { a: index + 1, source: "inline" },
      }),
  );
}
