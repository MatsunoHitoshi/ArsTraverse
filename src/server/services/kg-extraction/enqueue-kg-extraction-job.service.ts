import type { PrismaClient } from "@prisma/client";
import { JobStatus } from "@prisma/client";
import { KG_EXTRACTION_BATCH_SIZE } from "./constants";

type EnqueueKgExtractionJobInput = {
  userId: string;
  plainText: string;
  sourceDocumentId: string;
  topicSpaceId?: string;
  totalChunks: number;
};

export async function enqueueKgExtractionJob(
  db: PrismaClient,
  input: EnqueueKgExtractionJobInput,
) {
  const existing = await db.kgExtractionJob.findFirst({
    where: {
      sourceDocumentId: input.sourceDocumentId,
      status: { in: [JobStatus.PENDING, JobStatus.PROCESSING] },
    },
  });
  if (existing) return existing;

  return db.kgExtractionJob.create({
    data: {
      userId: input.userId,
      plainText: input.plainText,
      sourceDocumentId: input.sourceDocumentId,
      topicSpaceId: input.topicSpaceId,
      totalChunks: input.totalChunks,
      batchSize: KG_EXTRACTION_BATCH_SIZE,
      status: JobStatus.PENDING,
    },
  });
}

export async function claimNextKgExtractionJob(db: PrismaClient) {
  const job = await db.kgExtractionJob.findFirst({
    where: { status: JobStatus.PENDING },
    orderBy: { createdAt: "asc" },
  });
  if (!job) return null;

  return db.kgExtractionJob.update({
    where: { id: job.id },
    data: {
      status: JobStatus.PROCESSING,
      startedAt: new Date(),
      error: null,
    },
  });
}
