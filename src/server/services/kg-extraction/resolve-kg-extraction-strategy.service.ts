import { textInspectFromPlainText } from "@/app/_utils/text/text-inspector";
import type { Document } from "@langchain/core/documents";
import {
  KG_EXTRACTION_INLINE_CHUNK_THRESHOLD,
} from "./constants";

export type KgExtractionStrategy = {
  useBatch: boolean;
  totalChunks: number;
  documents: Document[];
};

export async function resolveKgExtractionStrategy(
  plainText: string,
): Promise<KgExtractionStrategy> {
  const documents = await textInspectFromPlainText(plainText);
  const totalChunks = documents.length;
  return {
    useBatch: totalChunks > KG_EXTRACTION_INLINE_CHUNK_THRESHOLD,
    totalChunks,
    documents,
  };
}
