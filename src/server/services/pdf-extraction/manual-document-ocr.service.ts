import {
  DocumentType,
  JobStatus,
  type PrismaClient,
} from "@prisma/client";
import { TRPCError } from "@trpc/server";
import {
  readDriveFileId,
  readDriveMimeType,
  readCachedPlainText,
} from "@/server/lib/google-drive/source-metadata";
import type { OcrLanguageMode } from "@/server/lib/pdf-extraction/types";
import { assertTopicSpaceAdmin } from "@/server/repositories/topic-space-graph.repository";
import { enqueuePdfExtractionJob } from "@/server/services/pdf-extraction/enqueue-pdf-extraction-job.service";
import { processPdfExtractionJob } from "@/server/services/pdf-extraction/process-pdf-extraction-job.service";

export function isOcrEligibleDocument(document: {
  documentType: DocumentType;
  ocrMetadata: unknown;
  externalSourceId?: string | null;
}): boolean {
  if (document.documentType === DocumentType.INPUT_PDF) {
    return true;
  }
  if (document.documentType === DocumentType.INPUT_DRIVE) {
    const mimeType = readDriveMimeType(document.ocrMetadata);
    return !mimeType || mimeType === "application/pdf";
  }
  return false;
}

function formatJobResponse(job: {
  id: string;
  status: JobStatus;
  error: string | null;
  pageCount: number | null;
  processedPages: number;
  ocrLanguage: string;
  detectedLanguage: string | null;
  writingDirection: string | null;
  createdAt: Date;
  completedAt: Date | null;
}) {
  return {
    id: job.id,
    status: job.status,
    error: job.error,
    pageCount: job.pageCount,
    processedPages: job.processedPages,
    ocrLanguage: job.ocrLanguage,
    detectedLanguage: job.detectedLanguage,
    writingDirection: job.writingDirection,
    createdAt: job.createdAt.toISOString(),
    completedAt: job.completedAt?.toISOString() ?? null,
  };
}

async function assertTopicSpaceDocumentAccess(
  db: PrismaClient,
  input: { topicSpaceId: string; documentId: string; userId: string },
) {
  const topicSpace = await db.topicSpace.findFirst({
    where: { id: input.topicSpaceId, isDeleted: false },
    include: {
      admins: true,
      sourceDocuments: {
        where: { id: input.documentId, isDeleted: false },
      },
    },
  });

  if (!topicSpace) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "リポジトリが見つかりません",
    });
  }

  assertTopicSpaceAdmin(topicSpace, input.userId);

  const document = topicSpace.sourceDocuments[0];
  if (!document) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "ドキュメントが見つかりません",
    });
  }

  if (!isOcrEligibleDocument(document)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "このドキュメントは OCR 再抽出の対象ではありません",
    });
  }

  return { topicSpace, document };
}

function resolveDocumentOcrSource(document: {
  documentType: DocumentType;
  url: string;
  name: string;
  ocrMetadata: unknown;
  externalSourceId: string | null;
}): {
  sourceType: "drive" | "storage";
  driveFileId?: string;
  driveFileName?: string;
  storageUrl?: string;
} {
  const driveFileId = readDriveFileId(
    document.ocrMetadata,
    document.externalSourceId,
  );

  if (
    document.documentType === DocumentType.INPUT_DRIVE ||
    (document.documentType === DocumentType.INPUT_PDF && driveFileId)
  ) {
    if (!driveFileId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Drive ファイル ID が見つかりません",
      });
    }
    return {
      sourceType: "drive",
      driveFileId,
      driveFileName: document.name,
    };
  }

  if (!document.url.trim()) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "PDF の URL が見つかりません",
    });
  }

  return {
    sourceType: "storage",
    storageUrl: document.url,
    driveFileName: document.name,
  };
}

export async function getDocumentOcrJobStatus(
  db: PrismaClient,
  input: { topicSpaceId: string; documentId: string; userId: string },
) {
  await assertTopicSpaceDocumentAccess(db, input);

  const job = await db.pdfExtractionJob.findFirst({
    where: { sourceDocumentId: input.documentId },
    orderBy: { createdAt: "desc" },
  });

  if (!job) {
    return { job: null, textPreview: null };
  }

  const document = await db.sourceDocument.findUnique({
    where: { id: input.documentId },
    select: { ocrMetadata: true },
  });
  const cached = readCachedPlainText(document?.ocrMetadata);
  const textPreview = cached ? cached.slice(0, 500) : null;

  return {
    job: formatJobResponse(job),
    textPreview,
  };
}

export async function startManualDocumentOcr(
  db: PrismaClient,
  input: {
    topicSpaceId: string;
    documentId: string;
    userId: string;
    ocrLanguage: OcrLanguageMode;
  },
) {
  const { document } = await assertTopicSpaceDocumentAccess(db, input);
  const source = resolveDocumentOcrSource(document);

  const existing = await db.pdfExtractionJob.findFirst({
    where: {
      sourceDocumentId: input.documentId,
      status: { in: [JobStatus.PENDING, JobStatus.PROCESSING] },
    },
  });
  if (existing) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "このドキュメントの OCR ジョブは既に処理中です",
    });
  }

  const job = await enqueuePdfExtractionJob(db, {
    userId: input.userId,
    topicSpaceId: input.topicSpaceId,
    sourceDocumentId: input.documentId,
    ocrLanguage: input.ocrLanguage,
    ...source,
  });

  await db.pdfExtractionJob.update({
    where: { id: job.id },
    data: {
      status: JobStatus.PROCESSING,
      startedAt: new Date(),
      processedPages: 0,
      accumulatedPlainText: null,
      error: null,
      completedAt: null,
    },
  });

  const result = await processPdfExtractionJob(db, job.id);
  const updated = await db.pdfExtractionJob.findUnique({ where: { id: job.id } });

  return {
    job: updated ? formatJobResponse(updated) : null,
    result,
  };
}

export async function advanceManualDocumentOcr(
  db: PrismaClient,
  input: { topicSpaceId: string; documentId: string; userId: string },
) {
  await assertTopicSpaceDocumentAccess(db, input);

  const job = await db.pdfExtractionJob.findFirst({
    where: {
      sourceDocumentId: input.documentId,
      status: { in: [JobStatus.PENDING, JobStatus.PROCESSING] },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!job) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "進行中の OCR ジョブが見つかりません",
    });
  }

  if (job.status === JobStatus.PENDING) {
    await db.pdfExtractionJob.update({
      where: { id: job.id },
      data: {
        status: JobStatus.PROCESSING,
        startedAt: new Date(),
        error: null,
      },
    });
  }

  const result = await processPdfExtractionJob(db, job.id);
  const updated = await db.pdfExtractionJob.findUnique({ where: { id: job.id } });

  return {
    job: updated ? formatJobResponse(updated) : null,
    result,
  };
}
