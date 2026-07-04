import type { PrismaClient } from "@prisma/client";
import type { z } from "zod";
import { KnowledgeGraphInputSchema } from "@/server/api/schemas/knowledge-graph";
import { runExtractKGFromPlainText } from "@/server/api/routers/kg-extraction";
import { enqueueKgExtractionJob } from "./enqueue-kg-extraction-job.service";
import { resolveKgExtractionStrategy } from "./resolve-kg-extraction-strategy.service";

export type ExtractKgForDocumentInput = {
  userId: string;
  plainText: string;
  sourceDocumentId: string;
  topicSpaceId?: string;
};

export type ExtractKgForDocumentResult =
  | {
      mode: "inline";
      dataJson: z.infer<typeof KnowledgeGraphInputSchema>;
    }
  | {
      mode: "queued";
      jobId: string;
      totalChunks: number;
    };

/**
 * プレーンテキストから KG を抽出する。
 * チャンク数が閾値以下なら即時抽出、超える場合は KgExtractionJob を enqueue する。
 */
export async function extractKgForDocument(
  db: PrismaClient,
  input: ExtractKgForDocumentInput,
): Promise<ExtractKgForDocumentResult> {
  const strategy = await resolveKgExtractionStrategy(input.plainText);

  if (!strategy.useBatch) {
    const extracted = await runExtractKGFromPlainText(input.plainText);
    if (!extracted) {
      throw new Error("知識グラフの抽出に失敗しました");
    }
    return {
      mode: "inline",
      dataJson: KnowledgeGraphInputSchema.parse(extracted),
    };
  }

  const job = await enqueueKgExtractionJob(db, {
    userId: input.userId,
    plainText: input.plainText,
    sourceDocumentId: input.sourceDocumentId,
    topicSpaceId: input.topicSpaceId,
    totalChunks: strategy.totalChunks,
  });

  return {
    mode: "queued",
    jobId: job.id,
    totalChunks: strategy.totalChunks,
  };
}
