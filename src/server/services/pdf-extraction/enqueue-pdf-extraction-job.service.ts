import type { PrismaClient } from "@prisma/client";
import { JobStatus } from "@prisma/client";

type EnqueuePdfExtractionJobInput = {
  userId: string;
  topicSpaceId?: string;
  sourceDocumentId?: string;
  sourceType: "drive" | "storage";
  driveFileId?: string;
  driveFileName?: string;
  storageUrl?: string;
  pageCount?: number;
  ocrLanguage?: string;
};

export async function enqueuePdfExtractionJob(
  db: PrismaClient,
  input: EnqueuePdfExtractionJobInput,
) {
  if (input.sourceDocumentId) {
    const existing = await db.pdfExtractionJob.findFirst({
      where: {
        sourceDocumentId: input.sourceDocumentId,
        status: { in: [JobStatus.PENDING, JobStatus.PROCESSING] },
      },
    });
    if (existing) return existing;
  }

  return db.pdfExtractionJob.create({
    data: {
      userId: input.userId,
      topicSpaceId: input.topicSpaceId,
      sourceDocumentId: input.sourceDocumentId,
      sourceType: input.sourceType,
      driveFileId: input.driveFileId,
      driveFileName: input.driveFileName,
      storageUrl: input.storageUrl,
      pageCount: input.pageCount,
      ocrLanguage: input.ocrLanguage ?? "auto",
      status: JobStatus.PENDING,
    },
  });
}

export async function claimNextPdfExtractionJob(db: PrismaClient) {
  const job = await db.pdfExtractionJob.findFirst({
    where: { status: JobStatus.PENDING },
    orderBy: { createdAt: "asc" },
  });
  if (!job) return null;

  return db.pdfExtractionJob.update({
    where: { id: job.id },
    data: {
      status: JobStatus.PROCESSING,
      startedAt: new Date(),
      error: null,
    },
  });
}
