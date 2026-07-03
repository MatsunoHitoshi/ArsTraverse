import type { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { buildDriveWebViewUrl } from "@/server/lib/google-drive/urls";
import {
  computeDriveContentHash,
  fetchDrivePdfBuffer,
  listDriveFilesInFolder,
  resolveDocumentTypeFromDriveMime,
  type DriveFileMeta,
} from "@/server/lib/google-drive/fetch-document-text";
import {
  buildDriveSourceMetadata,
  parseDefaultOcrLanguage,
} from "@/server/lib/google-drive/source-metadata";
import { extractPdfTextFromBuffer } from "@/server/lib/pdf/extract-pdf-text";
import { enqueuePdfExtractionJob } from "@/server/services/pdf-extraction/enqueue-pdf-extraction-job.service";
import {
  getDriveClientForTopicSpaceSync,
  isDriveSyncAvailable,
} from "@/server/lib/google-drive/sync-client";
import { assertTopicSpaceAdmin } from "@/server/repositories/topic-space-graph.repository";
import { attachDocumentsToTopicSpace } from "@/server/services/kg/attach-documents.service";
import { createSourceDocumentWithGraph } from "@/server/services/kg/create-source-document-with-graph.service";
import { detachDocumentsFromTopicSpace } from "@/server/services/kg/detach-documents.service";
import { replaceDocumentGraphFromExtraction } from "@/server/services/kg/replace-document-graph-from-extraction.service";
import { extractKgForDocument } from "@/server/services/kg-extraction/extract-kg-for-document.service";

type SyncCtx = {
  db: PrismaClient;
  session: { user: { id: string } };
};

export type DriveSyncResult = {
  topicSpaceId: string;
  created: number;
  updated: number;
  skipped: number;
  detached: number;
  pendingOcr: number;
  pendingKg: number;
  errors: { fileName: string; message: string }[];
};

const EMPTY_GRAPH = { nodes: [], relationships: [] };

async function applyKgExtractionForDocument(
  ctx: SyncCtx,
  input: {
    topicSpaceId: string;
    plainText: string;
    sourceDocumentId: string;
  },
): Promise<"inline" | "queued"> {
  const kgResult = await extractKgForDocument(ctx.db, {
    userId: ctx.session.user.id,
    plainText: input.plainText,
    sourceDocumentId: input.sourceDocumentId,
    topicSpaceId: input.topicSpaceId,
  });

  if (kgResult.mode === "inline") {
    const document = await ctx.db.sourceDocument.findFirst({
      where: { id: input.sourceDocumentId, isDeleted: false },
      include: { graph: true },
    });
    if (!document?.graph) {
      throw new Error("既存 SourceDocument の DocumentGraph が見つかりません");
    }
    await replaceDocumentGraphFromExtraction(ctx.db, {
      documentGraphId: document.graph.id,
      dataJson: kgResult.dataJson,
    });
    return "inline";
  }

  return "queued";
}

async function upsertDriveSourceDocument(
  ctx: SyncCtx,
  input: {
    topicSpaceId: string;
    file: DriveFileMeta;
    plainText: string;
    contentHash: string;
    isAttached: boolean;
    existingDocumentId?: string;
    driveMetadata?: ReturnType<typeof buildDriveSourceMetadata>;
  },
): Promise<{ action: "created" | "updated" | "skipped"; kgQueued: boolean }> {
  const documentType = resolveDocumentTypeFromDriveMime(input.file.mimeType);
  const webViewUrl =
    input.file.webViewLink ?? buildDriveWebViewUrl(input.file.id);
  const externalModifiedAt = new Date(input.file.modifiedTime);
  const driveMetadata =
    input.driveMetadata ??
    buildDriveSourceMetadata({
      fileId: input.file.id,
      mimeType: input.file.mimeType,
    });

  const existing = input.existingDocumentId
    ? await ctx.db.sourceDocument.findFirst({
        where: { id: input.existingDocumentId, isDeleted: false },
        include: { graph: true },
      })
    : null;

  if (existing?.contentHash === input.contentHash) {
    if (!input.isAttached) {
      await attachDocumentsToTopicSpace(ctx, {
        id: input.topicSpaceId,
        documentIds: [existing.id],
      });
      return { action: "updated", kgQueued: false };
    }
    return { action: "skipped", kgQueued: false };
  }

  if (!existing) {
    const { sourceDocument } = await createSourceDocumentWithGraph(ctx, {
      name: input.file.name,
      url: webViewUrl,
      dataJson: EMPTY_GRAPH,
      documentType,
      ocrMetadata: driveMetadata,
      externalSourceId: input.file.id,
      externalModifiedAt,
      contentHash: input.contentHash,
    });

    await attachDocumentsToTopicSpace(ctx, {
      id: input.topicSpaceId,
      documentIds: [sourceDocument.id],
    });

    const kgMode = await applyKgExtractionForDocument(ctx, {
      topicSpaceId: input.topicSpaceId,
      plainText: input.plainText,
      sourceDocumentId: sourceDocument.id,
    });

    return {
      action: "created",
      kgQueued: kgMode === "queued",
    };
  }

  if (!existing.graph) {
    throw new Error("既存 SourceDocument の DocumentGraph が見つかりません");
  }

  if (input.isAttached) {
    await detachDocumentsFromTopicSpace(ctx, {
      id: input.topicSpaceId,
      documentId: existing.id,
    });
  }

  await ctx.db.sourceDocument.update({
    where: { id: existing.id },
    data: {
      name: input.file.name,
      url: webViewUrl,
      documentType,
      ocrMetadata: driveMetadata,
      externalSourceId: input.file.id,
      externalModifiedAt,
      contentHash: input.contentHash,
    },
  });

  await attachDocumentsToTopicSpace(ctx, {
    id: input.topicSpaceId,
    documentIds: [existing.id],
  });

  const kgMode = await applyKgExtractionForDocument(ctx, {
    topicSpaceId: input.topicSpaceId,
    plainText: input.plainText,
    sourceDocumentId: existing.id,
  });

  return {
    action: "updated",
    kgQueued: kgMode === "queued",
  };
}

export async function syncTopicSpaceDriveFolder(
  ctx: SyncCtx,
  input: { topicSpaceId: string },
): Promise<DriveSyncResult> {
  const topicSpace = await ctx.db.topicSpace.findFirst({
    where: { id: input.topicSpaceId, isDeleted: false },
    include: {
      admins: true,
      driveSync: true,
      sourceDocuments: {
        where: { isDeleted: false },
      },
    },
  });

  if (!topicSpace) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "リポジトリが見つかりません。",
    });
  }

  assertTopicSpaceAdmin(topicSpace, ctx.session.user.id);

  const driveSync = topicSpace.driveSync;
  if (!driveSync?.enabled) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Drive 同期が有効化されていません。フォルダを選択してください。",
    });
  }

  const driveAvailable = await isDriveSyncAvailable(ctx.db, driveSync);
  if (!driveAvailable) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Google Drive が未連携です。Drive を連携してから同期してください。",
    });
  }

  const driveClient = await getDriveClientForTopicSpaceSync(ctx.db, driveSync);

  await ctx.db.topicSpaceDriveSync.update({
    where: { id: driveSync.id },
    data: {
      lastSyncStatus: "running",
      lastSyncError: null,
    },
  });

  const result: DriveSyncResult = {
    topicSpaceId: input.topicSpaceId,
    created: 0,
    updated: 0,
    skipped: 0,
    detached: 0,
    pendingOcr: 0,
    pendingKg: 0,
    errors: [],
  };

  try {
    const driveFiles = await listDriveFilesInFolder(
      {
        folderId: driveSync.driveFolderId,
        recursive: driveSync.recursive,
      },
      driveClient,
    );

    const driveFileIdSet = new Set(driveFiles.map((file) => file.id));
    const existingByDriveId = new Map(
      topicSpace.sourceDocuments
        .filter((doc) => doc.externalSourceId)
        .map((doc) => [doc.externalSourceId, doc]),
    );
    const attachedDocumentIds = new Set(
      topicSpace.sourceDocuments.map((doc) => doc.id),
    );

    const defaultOcrLanguage = parseDefaultOcrLanguage(
      topicSpace.defaultOcrLanguage,
    );

    for (const file of driveFiles) {
      try {
        let plainText = "";
        let contentHash = "";
        let driveMetadata = buildDriveSourceMetadata({
          fileId: file.id,
          mimeType: file.mimeType,
        });

        if (file.mimeType === "application/pdf") {
          const buffer = await fetchDrivePdfBuffer(file, driveClient);
          const extraction = await extractPdfTextFromBuffer(buffer, {
            defaultOcrLanguage,
            processOcr: false,
          });

          if (extraction.needsOcr) {
            const existing = existingByDriveId.get(file.id);
            await enqueuePdfExtractionJob(ctx.db, {
              userId: ctx.session.user.id,
              topicSpaceId: input.topicSpaceId,
              sourceDocumentId: existing?.id,
              sourceType: "drive",
              driveFileId: file.id,
              driveFileName: file.name,
              pageCount: extraction.pageCount,
            });
            result.pendingOcr += 1;
            continue;
          }

          plainText = extraction.plainText;
          contentHash = computeDriveContentHash(file, plainText);
          driveMetadata = buildDriveSourceMetadata({
            fileId: file.id,
            mimeType: file.mimeType,
            extraction: extraction.extraction,
          });
        } else {
          const { fetchDriveFileText } = await import(
            "@/server/lib/google-drive/fetch-document-text"
          );
          plainText = await fetchDriveFileText(file, driveClient);
          contentHash = computeDriveContentHash(file, plainText);
        }

        if (!plainText.trim()) {
          result.skipped += 1;
          continue;
        }

        const existing = existingByDriveId.get(file.id);
        const outcome = await upsertDriveSourceDocument(ctx, {
          topicSpaceId: input.topicSpaceId,
          file,
          plainText,
          contentHash,
          isAttached: existing ? attachedDocumentIds.has(existing.id) : false,
          existingDocumentId: existing?.id,
          driveMetadata,
        });

        if (outcome.action === "created") result.created += 1;
        else if (outcome.action === "updated") result.updated += 1;
        else result.skipped += 1;
        if (outcome.kgQueued) result.pendingKg += 1;
      } catch (error) {
        result.errors.push({
          fileName: file.name,
          message:
            error instanceof Error
              ? error.message
              : "不明なエラーが発生しました",
        });
      }
    }

    for (const doc of topicSpace.sourceDocuments) {
      if (doc.externalSourceId && !driveFileIdSet.has(doc.externalSourceId)) {
        try {
          await detachDocumentsFromTopicSpace(ctx, {
            id: input.topicSpaceId,
            documentId: doc.id,
          });
          await ctx.db.sourceDocument.update({
            where: { id: doc.id },
            data: { isDeleted: true },
          });
          result.detached += 1;
        } catch (error) {
          result.errors.push({
            fileName: doc.name,
            message:
              error instanceof Error
                ? error.message
                : "Drive から削除されたファイルの切り離しに失敗しました",
          });
        }
      }
    }

    await ctx.db.topicSpaceDriveSync.update({
      where: { id: driveSync.id },
      data: {
        lastSyncedAt: new Date(),
        lastSyncStatus: result.errors.length > 0 ? "error" : "idle",
        lastSyncError:
          result.errors.length > 0
            ? result.errors.map((e) => `${e.fileName}: ${e.message}`).join("; ")
            : null,
      },
    });

    return result;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Drive 同期に失敗しました";
    await ctx.db.topicSpaceDriveSync.update({
      where: { id: driveSync.id },
      data: {
        lastSyncStatus: "error",
        lastSyncError: message,
      },
    });
    throw error;
  }
}

export async function syncAllEnabledTopicSpaceDriveFolders(
  db: PrismaClient,
): Promise<DriveSyncResult[]> {
  const configs = await db.topicSpaceDriveSync.findMany({
    where: { enabled: true },
    include: {
      topicSpace: {
        include: { admins: true },
      },
    },
  });

  const results: DriveSyncResult[] = [];
  for (const config of configs) {
    const userId = config.configuredByUserId;
    if (!userId) {
      results.push({
        topicSpaceId: config.topicSpaceId,
        created: 0,
        updated: 0,
        skipped: 0,
        detached: 0,
        pendingOcr: 0,
        pendingKg: 0,
        errors: [
          {
            fileName: config.topicSpace.name,
            message:
              "configuredByUserId が未設定です。Drive 連携後にフォルダを選び直してください。",
          },
        ],
      });
      continue;
    }

    try {
      const result = await syncTopicSpaceDriveFolder(
        { db, session: { user: { id: userId } } },
        { topicSpaceId: config.topicSpaceId },
      );
      results.push(result);
    } catch (error) {
      results.push({
        topicSpaceId: config.topicSpaceId,
        created: 0,
        updated: 0,
        skipped: 0,
        detached: 0,
        pendingOcr: 0,
        pendingKg: 0,
        errors: [
          {
            fileName: config.topicSpace.name,
            message:
              error instanceof Error ? error.message : "同期に失敗しました",
          },
        ],
      });
    }
  }

  return results;
}
