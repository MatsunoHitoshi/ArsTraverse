import { DocumentType, JobStatus, type PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";
import { writeLocalFileFromUrl } from "@/app/_utils/sys/file";
import {
  buildDriveSourceMetadata,
  resolveJobOcrLanguage,
} from "@/server/lib/google-drive/source-metadata";
import { getGoogleDriveClientForUser } from "@/server/lib/google-drive/user-oauth";
import { extractPdfTextFromBuffer } from "@/server/lib/pdf/extract-pdf-text";
import { attachDocumentsToTopicSpace } from "@/server/services/kg/attach-documents.service";
import { createSourceDocumentWithGraph } from "@/server/services/kg/create-source-document-with-graph.service";
import { replaceDocumentGraphFromExtraction } from "@/server/services/kg/replace-document-graph-from-extraction.service";
import { extractKgForDocument } from "@/server/services/kg-extraction/extract-kg-for-document.service";
import { computeDriveContentHash } from "@/server/lib/google-drive/fetch-document-text";

const PAGES_PER_JOB = 10;
const EMPTY_GRAPH = { nodes: [], relationships: [] };

function appendPlainText(previous: string, next: string): string {
  const prev = previous.trim();
  const batch = next.trim();
  if (!prev) return batch;
  if (!batch) return prev;
  return `${prev}\n\n${batch}`;
}

async function loadPdfBufferForJob(
  db: PrismaClient,
  job: {
    sourceType: string;
    driveFileId: string | null;
    driveFileName: string | null;
    storageUrl: string | null;
    userId: string;
  },
): Promise<Buffer> {
  if (job.sourceType === "storage") {
    const url = job.storageUrl?.trim();
    if (!url) {
      throw new Error("storageUrl が未設定です");
    }
    const localPath = await writeLocalFileFromUrl(url, "input.pdf");
    return readFile(localPath);
  }

  const fileId = job.driveFileId?.trim();
  if (!fileId) {
    throw new Error("driveFileId が未設定です");
  }

  const drive = await getGoogleDriveClientForUser(db, job.userId);
  const response = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" },
  );
  return Buffer.from(response.data as ArrayBuffer);
}

export async function processPdfExtractionJob(
  db: PrismaClient,
  jobId: string,
) {
  const job = await db.pdfExtractionJob.findUnique({
    where: { id: jobId },
    include: {
      topicSpace: true,
      sourceDocument: {
        include: { graph: true },
      },
    },
  });

  if (!job || job.status !== JobStatus.PROCESSING) {
    return null;
  }

  try {
    const ocrLanguageConfig = resolveJobOcrLanguage(
      job.ocrLanguage,
      job.topicSpace?.defaultOcrLanguage,
    );
    const buffer = await loadPdfBufferForJob(db, job);
    const startPage = job.processedPages + 1;
    const extraction = await extractPdfTextFromBuffer(buffer, {
      defaultOcrLanguage: ocrLanguageConfig.defaultLanguage,
      forceOcrLanguage: ocrLanguageConfig.forceLanguage,
      forceOcr: true,
      processOcr: true,
      startPage,
      maxPages: PAGES_PER_JOB,
    });

    const processedPages = Math.min(
      extraction.pageCount,
      startPage + PAGES_PER_JOB - 1,
    );
    const isComplete = processedPages >= extraction.pageCount;
    const accumulatedPlainText = appendPlainText(
      job.accumulatedPlainText ?? "",
      extraction.plainText,
    );

    if (!isComplete) {
      await db.pdfExtractionJob.update({
        where: { id: job.id },
        data: {
          accumulatedPlainText: accumulatedPlainText || null,
          pageCount: extraction.pageCount,
          processedPages,
          detectedLanguage:
            extraction.extraction?.language ?? job.detectedLanguage,
          writingDirection:
            extraction.extraction?.writingDirection ?? job.writingDirection,
          directionConfidence:
            extraction.extraction?.directionConfidence ??
            job.directionConfidence,
          status: JobStatus.PENDING,
          completedAt: null,
          startedAt: null,
          error: null,
        },
      });

      return {
        jobId: job.id,
        status: JobStatus.PENDING,
        processedPages,
        pageCount: extraction.pageCount,
      };
    }

    if (!accumulatedPlainText) {
      await db.pdfExtractionJob.update({
        where: { id: job.id },
        data: {
          status: JobStatus.COMPLETED,
          completedAt: new Date(),
          pageCount: extraction.pageCount,
          processedPages,
          accumulatedPlainText: null,
        },
      });
      return { jobId: job.id, status: JobStatus.COMPLETED, skipped: true };
    }

    const plainText = accumulatedPlainText;
    const driveMetadata = job.driveFileId
      ? buildDriveSourceMetadata({
          fileId: job.driveFileId,
          mimeType: "application/pdf",
          extraction: extraction.extraction,
          plainText,
        })
      : {
          extraction: extraction.extraction,
          plainText,
        };

    const contentHash =
      job.driveFileId && job.driveFileName
        ? computeDriveContentHash(
            {
              id: job.driveFileId,
              name: job.driveFileName,
              mimeType: "application/pdf",
              modifiedTime: new Date().toISOString(),
            },
            plainText,
          )
        : undefined;

    let sourceDocumentId = job.sourceDocumentId;
    let kgQueued = false;

    if (job.sourceDocument) {
      if (!job.sourceDocument.graph) {
        throw new Error("既存 SourceDocument の DocumentGraph が見つかりません");
      }
      await db.sourceDocument.update({
        where: { id: job.sourceDocument.id },
        data: {
          ocrMetadata: driveMetadata,
          contentHash: contentHash ?? job.sourceDocument.contentHash,
        },
      });
      sourceDocumentId = job.sourceDocument.id;

      const kgResult = await extractKgForDocument(db, {
        userId: job.userId,
        plainText,
        sourceDocumentId: job.sourceDocument.id,
        topicSpaceId: job.topicSpaceId ?? undefined,
      });

      if (kgResult.mode === "inline") {
        await replaceDocumentGraphFromExtraction(db, {
          documentGraphId: job.sourceDocument.graph.id,
          dataJson: kgResult.dataJson,
        });
      } else {
        kgQueued = true;
      }
    } else {
      const created = await createSourceDocumentWithGraph(
        { db, session: { user: { id: job.userId } } },
        {
          name: job.driveFileName ?? "PDF document",
          url: job.storageUrl ?? job.driveFileId ?? "",
          dataJson: EMPTY_GRAPH,
          documentType: DocumentType.INPUT_PDF,
          ocrMetadata: driveMetadata,
          externalSourceId: job.driveFileId ?? undefined,
          contentHash,
        },
      );
      sourceDocumentId = created.sourceDocument.id;

      if (job.topicSpaceId) {
        await attachDocumentsToTopicSpace(
          { db, session: { user: { id: job.userId } } },
          {
            id: job.topicSpaceId,
            documentIds: [sourceDocumentId],
          },
        );
      }

      const kgResult = await extractKgForDocument(db, {
        userId: job.userId,
        plainText,
        sourceDocumentId,
        topicSpaceId: job.topicSpaceId ?? undefined,
      });

      if (kgResult.mode === "inline") {
        await replaceDocumentGraphFromExtraction(db, {
          documentGraphId: created.documentGraph.id,
          dataJson: kgResult.dataJson,
        });
      } else {
        kgQueued = true;
      }
    }

    await db.pdfExtractionJob.update({
      where: { id: job.id },
      data: {
        sourceDocumentId,
        pageCount: extraction.pageCount,
        processedPages,
        accumulatedPlainText: plainText,
        detectedLanguage: extraction.extraction?.language,
        writingDirection: extraction.extraction?.writingDirection,
        directionConfidence: extraction.extraction?.directionConfidence,
        status: JobStatus.COMPLETED,
        completedAt: new Date(),
        error: null,
      },
    });

    return {
      jobId: job.id,
      status: JobStatus.COMPLETED,
      sourceDocumentId,
      kgQueued,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "PDF 抽出ジョブに失敗しました";
    await db.pdfExtractionJob.update({
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

export async function processNextPdfExtractionJob(db: PrismaClient) {
  const { claimNextPdfExtractionJob } = await import(
    "@/server/services/pdf-extraction/enqueue-pdf-extraction-job.service"
  );
  const job = await claimNextPdfExtractionJob(db);
  if (!job) {
    return { processed: false as const };
  }

  const result = await processPdfExtractionJob(db, job.id);
  return { processed: true as const, result };
}
