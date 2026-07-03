import type {
  NodeTypeForFrontend,
  RelationshipTypeForFrontend,
} from "@/app/const/types";
import { textInspectFromPlainText } from "@/app/_utils/text/text-inspector";
import { KnowledgeGraphInputSchema } from "@/server/api/schemas/knowledge-graph";
import { IterativeGraphExtractor } from "@/server/lib/extractors/iterative";
import { replaceDocumentGraphFromExtraction } from "@/server/services/kg/replace-document-graph-from-extraction.service";
import {
  JobStatus,
  KgExtractionPhase,
  type PrismaClient,
} from "@prisma/client";
import { finalizeAccumulatedKg } from "./finalize-accumulated-kg.service";

const EMPTY_GRAPH = { nodes: [], relationships: [] };

function parseAccumulatedNodes(value: unknown): NodeTypeForFrontend[] {
  if (!Array.isArray(value)) return [];
  return value as NodeTypeForFrontend[];
}

function parseAccumulatedRelationships(
  value: unknown,
): RelationshipTypeForFrontend[] {
  if (!Array.isArray(value)) return [];
  return value as RelationshipTypeForFrontend[];
}

function dedupeNodesByName(
  nodes: NodeTypeForFrontend[],
): NodeTypeForFrontend[] {
  const map = new Map<string, NodeTypeForFrontend>();
  for (const node of nodes) {
    if (!map.has(node.name)) {
      map.set(node.name, node);
    }
  }
  return Array.from(map.values());
}

async function applyFinalizedGraph(
  db: PrismaClient,
  input: {
    sourceDocumentId: string;
    dataJson: ReturnType<typeof finalizeAccumulatedKg> extends Promise<infer T>
      ? T
      : never;
  },
) {
  const document = await db.sourceDocument.findFirst({
    where: { id: input.sourceDocumentId, isDeleted: false },
    include: { graph: true },
  });

  if (!document?.graph) {
    throw new Error("KG 抽出対象の DocumentGraph が見つかりません");
  }

  const parsed = KnowledgeGraphInputSchema.parse(input.dataJson);
  await replaceDocumentGraphFromExtraction(db, {
    documentGraphId: document.graph.id,
    dataJson: parsed,
  });
}

export async function processKgExtractionJob(
  db: PrismaClient,
  jobId: string,
) {
  const job = await db.kgExtractionJob.findUnique({
    where: { id: jobId },
    include: {
      sourceDocument: {
        include: { graph: true },
      },
    },
  });

  if (!job || job.status !== JobStatus.PROCESSING) {
    return null;
  }

  if (!job.sourceDocumentId) {
    throw new Error("sourceDocumentId が未設定です");
  }

  try {
    const documents = await textInspectFromPlainText(job.plainText);
    const totalChunks = documents.length;

    if (totalChunks === 0) {
      await applyFinalizedGraph(db, {
        sourceDocumentId: job.sourceDocumentId,
        dataJson: EMPTY_GRAPH,
      });
      await db.kgExtractionJob.update({
        where: { id: job.id },
        data: {
          status: JobStatus.COMPLETED,
          phase: KgExtractionPhase.FINALIZE,
          totalChunks: 0,
          completedAt: new Date(),
          error: null,
        },
      });
      return {
        jobId: job.id,
        status: JobStatus.COMPLETED,
        phase: KgExtractionPhase.FINALIZE,
      };
    }

    const extractor = new IterativeGraphExtractor();
    const schema = {
      allowedNodes: [] as string[],
      allowedRelationships: [] as string[],
    };
    const options = {
      localFilePath: "",
      isPlaneTextMode: true,
      schema,
    };

    let accumulatedNodes = parseAccumulatedNodes(job.accumulatedNodes);
    let accumulatedRelationships = parseAccumulatedRelationships(
      job.accumulatedRelationships,
    );

    if (job.phase === KgExtractionPhase.PHASE1) {
      const start = job.processedChunks;
      const end = Math.min(start + job.batchSize, totalChunks);
      const batch = documents.slice(start, end);
      const result = await extractor.extractPhase1(batch, options);

      accumulatedNodes = [...accumulatedNodes, ...result.nodes];
      accumulatedRelationships = [
        ...accumulatedRelationships,
        ...result.relationships,
      ];

      if (end < totalChunks) {
        await db.kgExtractionJob.update({
          where: { id: job.id },
          data: {
            totalChunks,
            processedChunks: end,
            accumulatedNodes,
            accumulatedRelationships,
            status: JobStatus.PENDING,
            startedAt: null,
            error: null,
          },
        });
        return {
          jobId: job.id,
          status: JobStatus.PENDING,
          phase: KgExtractionPhase.PHASE1,
          processedChunks: end,
          totalChunks,
        };
      }

      const uniqueNodes = dedupeNodesByName(accumulatedNodes);
      const contextSnapshot = extractor.buildContextFromNodes(uniqueNodes);

      await db.kgExtractionJob.update({
        where: { id: job.id },
        data: {
          phase: KgExtractionPhase.PHASE2,
          totalChunks,
          processedChunks: 0,
          contextSnapshot,
          accumulatedNodes: uniqueNodes,
          accumulatedRelationships,
          status: JobStatus.PENDING,
          startedAt: null,
          error: null,
        },
      });

      return {
        jobId: job.id,
        status: JobStatus.PENDING,
        phase: KgExtractionPhase.PHASE2,
        processedChunks: 0,
        totalChunks,
      };
    }

    if (job.phase === KgExtractionPhase.PHASE2) {
      if (!job.contextSnapshot) {
        throw new Error("Phase2 の contextSnapshot が未設定です");
      }

      const start = job.processedChunks;
      const end = Math.min(start + job.batchSize, totalChunks);
      const batch = documents.slice(start, end);
      const result = await extractor.extractPhase2(
        batch,
        job.contextSnapshot,
        options,
      );

      accumulatedNodes = [...accumulatedNodes, ...result.nodes];
      accumulatedRelationships = [
        ...accumulatedRelationships,
        ...result.relationships,
      ];

      if (end < totalChunks) {
        await db.kgExtractionJob.update({
          where: { id: job.id },
          data: {
            totalChunks,
            processedChunks: end,
            accumulatedNodes,
            accumulatedRelationships,
            status: JobStatus.PENDING,
            startedAt: null,
            error: null,
          },
        });
        return {
          jobId: job.id,
          status: JobStatus.PENDING,
          phase: KgExtractionPhase.PHASE2,
          processedChunks: end,
          totalChunks,
        };
      }

      const dataJson = await finalizeAccumulatedKg(
        accumulatedNodes,
        accumulatedRelationships,
      );
      await applyFinalizedGraph(db, {
        sourceDocumentId: job.sourceDocumentId,
        dataJson,
      });

      await db.kgExtractionJob.update({
        where: { id: job.id },
        data: {
          phase: KgExtractionPhase.FINALIZE,
          totalChunks,
          processedChunks: totalChunks,
          accumulatedNodes,
          accumulatedRelationships,
          status: JobStatus.COMPLETED,
          completedAt: new Date(),
          error: null,
        },
      });

      return {
        jobId: job.id,
        status: JobStatus.COMPLETED,
        phase: KgExtractionPhase.FINALIZE,
        sourceDocumentId: job.sourceDocumentId,
      };
    }

    throw new Error(`未対応の KG 抽出フェーズ: ${job.phase}`);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "KG 抽出ジョブに失敗しました";
    await db.kgExtractionJob.update({
      where: { id: job.id },
      data: {
        status: JobStatus.FAILED,
        error: message,
        completedAt: new Date(),
      },
    });
    throw error;
  }
}

export async function processNextKgExtractionJob(db: PrismaClient) {
  const { claimNextKgExtractionJob } = await import(
    "./enqueue-kg-extraction-job.service"
  );
  const job = await claimNextKgExtractionJob(db);
  if (!job) {
    return { processed: false as const };
  }

  const result = await processKgExtractionJob(db, job.id);
  return { processed: true as const, result };
}
