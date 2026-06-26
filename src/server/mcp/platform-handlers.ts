import { DocumentType, type PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { formGraphDataForFrontend } from "@/app/_utils/kg/frontend-properties";
import { runExtractKGFromPlainText } from "@/server/api/routers/kg-extraction";
import { KnowledgeGraphInputSchema } from "@/server/api/schemas/knowledge-graph";
import { uploadPlainTextToInputTxt } from "@/server/lib/supabase/upload-input-text";
import {
  buildSourceDocumentIdsByGraphNodeId,
  loadTopicSpaceDocumentProvenanceForExport,
} from "@/server/repositories/topic-space-document-provenance.repository";
import { createSourceDocumentWithGraph } from "@/server/services/kg/create-source-document-with-graph.service";
import { createTopicSpaceFromSourceDocuments } from "@/server/services/kg/create-topic-space-from-documents.service";
import {
  runAttachDocuments,
  runDetachDocument,
} from "@/server/api/routers/topic-space";
import {
  getTopicSpaceChangeHistoryById,
  listTopicSpaceChangeHistory,
  replayNodeMergesFromHistory,
} from "@/server/services/kg/replay-node-merges-from-history.service";
import { syncTopicSpaceDriveFolder } from "@/server/services/kg/sync-topic-space-drive.service";
import { buildDriveFolderUrl } from "@/server/lib/google-drive/urls";
import type { McpDraftHandlerCtx } from "@/server/mcp/graph-edit-draft-handlers";

export type McpPlatformHandlerCtx = McpDraftHandlerCtx;

type ExportedGraphNode = {
  id: string;
  name: string;
  label: string;
  properties: Record<string, string>;
  sourceDocumentIds?: string[];
};

type ExportedGraph = {
  nodes: ExportedGraphNode[];
  relationships: Array<{
    id: string;
    type: string;
    sourceId: string;
    targetId: string;
    properties: Record<string, string>;
    sourceDocumentIds?: string[];
  }>;
};

type ExportedGraphProvenance = {
  nodes: Array<{
    graphNodeId: string;
    sourceDocumentId: string;
    localNodeId: string;
  }>;
  relationships: Array<{
    graphRelationshipId: string;
    sourceDocumentId: string;
  }>;
};

async function readDocumentGraphForExport(
  db: PrismaClient,
  sourceDocumentId: string,
  documentGraphId: string,
): Promise<ExportedGraph> {
  const graph = await db.documentGraph.findFirst({
    where: {
      id: documentGraphId,
      sourceDocumentId,
    },
    include: {
      graphNodes: { where: { deletedAt: null } },
      graphRelationships: { where: { deletedAt: null } },
    },
  });

  if (!graph) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `DocumentGraph が見つかりません: ${documentGraphId}`,
    });
  }

  const frontend = formGraphDataForFrontend({
    nodes: graph.graphNodes,
    relationships: graph.graphRelationships,
  });

  return {
    nodes: frontend.nodes.map((node) => ({
      id: node.id,
      name: node.name,
      label: node.label,
      properties: node.properties ?? {},
    })),
    relationships: frontend.relationships.map((rel) => ({
      id: rel.id,
      type: rel.type,
      sourceId: rel.sourceId,
      targetId: rel.targetId,
      properties: rel.properties ?? {},
    })),
  };
}

export async function mcpGetSourceDocumentGraph(
  ctx: McpPlatformHandlerCtx,
  input: {
    sourceDocumentId: string;
    documentGraphId?: string;
  },
) {
  const sourceDocument = await ctx.db.sourceDocument.findFirst({
    where: {
      id: input.sourceDocumentId,
      userId: ctx.userId,
      isDeleted: false,
    },
    include: {
      graph: true,
    },
  });

  if (!sourceDocument) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "SourceDocument が見つかりません。",
    });
  }

  const documentGraphId = input.documentGraphId ?? sourceDocument.graph?.id;
  if (!documentGraphId) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "DocumentGraph が見つかりません。",
    });
  }

  const graph = await readDocumentGraphForExport(
    ctx.db,
    sourceDocument.id,
    documentGraphId,
  );

  return {
    sourceDocumentId: sourceDocument.id,
    sourceDocumentName: sourceDocument.name,
    documentGraphId,
    nodeCount: graph.nodes.length,
    relationshipCount: graph.relationships.length,
    graph,
  };
}

export async function mcpCreateSourceDocumentFromPlainText(
  ctx: McpPlatformHandlerCtx,
  input: {
    name: string;
    plainText: string;
  },
) {
  const name = input.name.trim();
  const plainText = input.plainText.trim();

  if (!name) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "name を指定してください。",
    });
  }

  if (!plainText) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "plainText が空です。",
    });
  }

  const extracted = await runExtractKGFromPlainText(plainText);
  if (!extracted) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "知識グラフの抽出に失敗しました。",
    });
  }

  const dataJson = KnowledgeGraphInputSchema.parse(extracted);

  let textUrl: string;
  try {
    textUrl = await uploadPlainTextToInputTxt(plainText);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "プレーンテキストの Storage アップロードに失敗しました";
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message,
    });
  }

  const sessionCtx = {
    db: ctx.db,
    session: { user: { id: ctx.userId } },
  };

  const { sourceDocument, documentGraph } = await createSourceDocumentWithGraph(
    sessionCtx,
    {
      name,
      url: textUrl,
      dataJson,
      documentType: DocumentType.INPUT_TXT,
    },
  );

  const graph = await readDocumentGraphForExport(
    ctx.db,
    sourceDocument.id,
    documentGraph.id,
  );

  return {
    sourceDocumentId: sourceDocument.id,
    sourceDocumentName: sourceDocument.name,
    documentGraphId: documentGraph.id,
    textUrl,
    nodeCount: graph.nodes.length,
    relationshipCount: graph.relationships.length,
    graph,
    message:
      "SourceDocument を作成し、LLM による知識グラフ抽出を完了しました。リポジトリを作成する場合は create_topic_space_from_source_documents を使用してください。",
  };
}

export async function mcpCreateTopicSpaceFromSourceDocuments(
  ctx: McpPlatformHandlerCtx,
  input: {
    name: string;
    sourceDocumentIds: string[];
    description?: string;
  },
) {
  const sessionCtx = {
    db: ctx.db,
    session: { user: { id: ctx.userId } },
  };

  const result = await createTopicSpaceFromSourceDocuments(sessionCtx, {
    name: input.name,
    sourceDocumentIds: input.sourceDocumentIds,
    description: input.description,
  });

  const mcpUrl = `/api/topic-spaces/${result.topicSpaceId}/mcp`;

  return {
    topicSpaceId: result.topicSpaceId,
    topicSpaceName: result.topicSpaceName,
    mcpToolIdentifier: result.mcpToolIdentifier,
    mcpUrl,
    sourceDocumentIds: result.sourceDocumentIds,
    attachedDocumentCount: result.attachedDocumentCount,
    nodeCount: result.nodeCount,
    relationshipCount: result.relationshipCount,
    linkedDocuments: result.linkedDocuments,
    message:
      "リポジトリを作成し、指定した SourceDocument のグラフを統合しました。",
  };
}

export async function mcpGetTopicSpaceGraph(
  ctx: McpPlatformHandlerCtx,
  input: {
    topicSpaceId: string;
  },
) {
  const topicSpace = await ctx.db.topicSpace.findFirst({
    where: {
      id: input.topicSpaceId,
      isDeleted: false,
      admins: { some: { id: ctx.userId } },
    },
    include: {
      sourceDocuments: {
        where: { isDeleted: false },
        select: { id: true, name: true },
      },
      graphNodes: { where: { deletedAt: null } },
      graphRelationships: { where: { deletedAt: null } },
    },
  });

  if (!topicSpace) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "リポジトリが見つからないか、アクセス権がありません。",
    });
  }

  const graph = await readTopicSpaceGraphForExport(ctx.db, topicSpace);

  return {
    topicSpaceId: topicSpace.id,
    topicSpaceName: topicSpace.name,
    mcpToolIdentifier: topicSpace.mcpToolIdentifier,
    sourceDocumentIds: topicSpace.sourceDocuments.map((doc) => doc.id),
    linkedDocuments: topicSpace.sourceDocuments,
    nodeCount: graph.graph.nodes.length,
    relationshipCount: graph.graph.relationships.length,
    provenance: graph.provenance,
    graph: graph.graph,
  };
}

export async function mcpAttachDocumentsToTopicSpace(
  ctx: McpPlatformHandlerCtx,
  input: {
    topicSpaceId: string;
    documentIds: string[];
  },
) {
  const uniqueDocumentIds = [
    ...new Set(input.documentIds.map((id) => id.trim())),
  ].filter(Boolean);

  if (uniqueDocumentIds.length === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "documentIds に 1 件以上の SourceDocument ID を指定してください。",
    });
  }

  const sessionCtx = {
    db: ctx.db,
    session: { user: { id: ctx.userId } },
  };

  const topicSpace = await runAttachDocuments(sessionCtx, {
    id: input.topicSpaceId,
    documentIds: uniqueDocumentIds,
  });

  const [nodeCount, relationshipCount] = await Promise.all([
    ctx.db.graphNode.count({
      where: { topicSpaceId: input.topicSpaceId, deletedAt: null },
    }),
    ctx.db.graphRelationship.count({
      where: { topicSpaceId: input.topicSpaceId, deletedAt: null },
    }),
  ]);

  const linkedDocuments = topicSpace.sourceDocuments.map((doc) => ({
    id: doc.id,
    name: doc.name,
  }));

  return {
    topicSpaceId: topicSpace.id,
    topicSpaceName: topicSpace.name,
    attachedDocumentIds: uniqueDocumentIds,
    sourceDocumentIds: linkedDocuments.map((doc) => doc.id),
    linkedDocuments,
    nodeCount,
    relationshipCount,
    message:
      "SourceDocument をリポジトリに統合しました。node / edge provenance も記録されます。",
  };
}

export async function mcpDetachDocumentFromTopicSpace(
  ctx: McpPlatformHandlerCtx,
  input: {
    topicSpaceId: string;
    documentId: string;
  },
) {
  const documentId = input.documentId.trim();
  if (!documentId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "documentId を指定してください。",
    });
  }

  const sessionCtx = {
    db: ctx.db,
    session: { user: { id: ctx.userId } },
  };

  const topicSpace = await runDetachDocument(sessionCtx, {
    id: input.topicSpaceId,
    documentId,
  });

  const [nodeCount, relationshipCount] = await Promise.all([
    ctx.db.graphNode.count({
      where: { topicSpaceId: input.topicSpaceId, deletedAt: null },
    }),
    ctx.db.graphRelationship.count({
      where: { topicSpaceId: input.topicSpaceId, deletedAt: null },
    }),
  ]);

  const linkedDocuments = topicSpace.sourceDocuments.map((doc) => ({
    id: doc.id,
    name: doc.name,
  }));

  return {
    topicSpaceId: topicSpace.id,
    topicSpaceName: topicSpace.name,
    detachedDocumentId: documentId,
    sourceDocumentIds: linkedDocuments.map((doc) => doc.id),
    linkedDocuments,
    nodeCount,
    relationshipCount,
    message:
      "SourceDocument をリポジトリから切り離しました。当該ドキュメント由来の provenance も削除されます。",
  };
}

export async function mcpGetTopicSpaceChangeHistory(
  ctx: McpPlatformHandlerCtx,
  input: {
    topicSpaceId: string;
    includeDetails?: boolean;
    mergeOnly?: boolean;
    before?: string;
    after?: string;
    limit?: number;
  },
) {
  const histories = await listTopicSpaceChangeHistory(ctx.db, {
    topicSpaceId: input.topicSpaceId,
    userId: ctx.userId,
    includeDetails: input.includeDetails,
    mergeOnly: input.mergeOnly,
    before: input.before ? new Date(input.before) : undefined,
    after: input.after ? new Date(input.after) : undefined,
    limit: input.limit,
  });

  return {
    topicSpaceId: input.topicSpaceId,
    count: histories.length,
    histories,
    message:
      "リポジトリの変更履歴を取得しました。isNodeMerge=true の行が UI 手動統合の履歴です。",
  };
}

export async function mcpGetTopicSpaceChangeHistoryDetail(
  ctx: McpPlatformHandlerCtx,
  input: {
    changeHistoryId: string;
  },
) {
  const history = await getTopicSpaceChangeHistoryById(ctx.db, {
    changeHistoryId: input.changeHistoryId,
    userId: ctx.userId,
  });

  return {
    ...history,
    message:
      "変更履歴の詳細です。parsedMerge に代表ノードと統合されたノードのスナップショットが含まれます。",
  };
}

export async function mcpReplayNodeMergesFromHistory(
  ctx: McpPlatformHandlerCtx,
  input: {
    topicSpaceId: string;
    dryRun?: boolean;
    before?: string;
    after?: string;
    changeHistoryIds?: string[];
  },
) {
  return replayNodeMergesFromHistory(ctx.db, {
    topicSpaceId: input.topicSpaceId,
    userId: ctx.userId,
    dryRun: input.dryRun,
    before: input.before ? new Date(input.before) : undefined,
    after: input.after ? new Date(input.after) : undefined,
    changeHistoryIds: input.changeHistoryIds,
  });
}

async function readTopicSpaceGraphForExport(
  db: Parameters<typeof loadTopicSpaceDocumentProvenanceForExport>[0],
  topicSpace: {
    id: string;
    graphNodes: Parameters<typeof formGraphDataForFrontend>[0]["nodes"];
    graphRelationships: Parameters<typeof formGraphDataForFrontend>[0]["relationships"];
  },
): Promise<{ graph: ExportedGraph; provenance: ExportedGraphProvenance }> {
  const frontend = formGraphDataForFrontend({
    nodes: topicSpace.graphNodes,
    relationships: topicSpace.graphRelationships,
  });
  const provenance = await loadTopicSpaceDocumentProvenanceForExport(
    db,
    topicSpace.id,
  );
  const sourceDocumentIdsByNodeId = buildSourceDocumentIdsByGraphNodeId(
    provenance.nodes,
  );
  const sourceDocumentIdsByRelationshipId = buildSourceDocumentIdsByGraphNodeId(
    provenance.relationships.map((row) => ({
      graphNodeId: row.graphRelationshipId,
      sourceDocumentId: row.sourceDocumentId,
    })),
  );

  return {
    provenance,
    graph: {
      nodes: frontend.nodes.map((node) => ({
        id: node.id,
        name: node.name,
        label: node.label,
        properties: node.properties ?? {},
        sourceDocumentIds: sourceDocumentIdsByNodeId.get(node.id),
      })),
      relationships: frontend.relationships.map((rel) => ({
        id: rel.id,
        type: rel.type,
        sourceId: rel.sourceId,
        targetId: rel.targetId,
        properties: rel.properties ?? {},
        sourceDocumentIds: sourceDocumentIdsByRelationshipId.get(rel.id),
      })),
    },
  };
}

export async function mcpGetTopicSpaceDriveSyncStatus(
  ctx: McpPlatformHandlerCtx,
  input: { topicSpaceId: string },
) {
  const topicSpace = await ctx.db.topicSpace.findFirst({
    where: {
      id: input.topicSpaceId,
      isDeleted: false,
      admins: { some: { id: ctx.userId } },
    },
    include: { driveSync: true },
  });

  if (!topicSpace) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "リポジトリが見つからないか、アクセス権がありません。",
    });
  }

  const driveSync = topicSpace.driveSync;
  return {
    topicSpaceId: topicSpace.id,
    configured: Boolean(driveSync),
    enabled: driveSync?.enabled ?? false,
    driveFolderId: driveSync?.driveFolderId ?? null,
    driveFolderName: driveSync?.driveFolderName ?? null,
    driveFolderUrl: driveSync?.driveFolderId
      ? buildDriveFolderUrl(driveSync.driveFolderId)
      : null,
    configuredByUserId: driveSync?.configuredByUserId ?? null,
    recursive: driveSync?.recursive ?? true,
    lastSyncedAt: driveSync?.lastSyncedAt?.toISOString() ?? null,
    lastSyncStatus: driveSync?.lastSyncStatus ?? null,
    lastSyncError: driveSync?.lastSyncError ?? null,
  };
}

export async function mcpSyncTopicSpaceDriveFolder(
  ctx: McpPlatformHandlerCtx,
  input: { topicSpaceId: string },
) {
  const result = await syncTopicSpaceDriveFolder(
    { db: ctx.db, session: { user: { id: ctx.userId } } },
    { topicSpaceId: input.topicSpaceId },
  );

  return {
    ...result,
    message: `Drive 同期完了: 作成 ${result.created}, 更新 ${result.updated}, スキップ ${result.skipped}, 削除 ${result.detached}`,
  };
}
