import type { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { attachDocumentsToTopicSpace } from "@/server/services/kg/attach-documents.service";
import { createTopicSpaceFromDocument } from "@/server/services/kg/create-topic-space-from-document.service";

type CreateTopicSpaceFromDocumentsCtx = {
  db: PrismaClient;
  session: { user: { id: string } };
};

export async function createTopicSpaceFromSourceDocuments(
  ctx: CreateTopicSpaceFromDocumentsCtx,
  input: {
    name: string;
    sourceDocumentIds: string[];
    description?: string | null;
    image?: string | null;
  },
) {
  const uniqueIds = [...new Set(input.sourceDocumentIds.map((id) => id.trim()))].filter(
    Boolean,
  );

  if (uniqueIds.length === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "sourceDocumentIds に 1 件以上の ID を指定してください。",
    });
  }

  const documents = await ctx.db.sourceDocument.findMany({
    where: {
      id: { in: uniqueIds },
      isDeleted: false,
      userId: ctx.session.user.id,
    },
    select: { id: true, graph: { select: { id: true } } },
  });

  if (documents.length !== uniqueIds.length) {
    const found = new Set(documents.map((doc) => doc.id));
    const missing = uniqueIds.filter((id) => !found.has(id));
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `SourceDocument が見つからないか、アクセス権がありません: ${missing.join(", ")}`,
    });
  }

  const withoutGraph = documents.filter((doc) => !doc.graph);
  if (withoutGraph.length > 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `グラフが未作成の SourceDocument があります: ${withoutGraph.map((d) => d.id).join(", ")}`,
    });
  }

  const [firstId, ...restIds] = uniqueIds;
  const topicSpace = await createTopicSpaceFromDocument(ctx.db, {
    userId: ctx.session.user.id,
    documentId: firstId,
    name: input.name,
    description: input.description,
    image: input.image,
  });

  if (restIds.length > 0) {
    await attachDocumentsToTopicSpace(ctx, {
      id: topicSpace.id,
      documentIds: restIds,
    });
  }

  const linked = await ctx.db.topicSpace.findFirst({
    where: { id: topicSpace.id },
    select: {
      id: true,
      name: true,
      mcpToolIdentifier: true,
      sourceDocuments: { where: { isDeleted: false }, select: { id: true, name: true } },
      graphNodes: { where: { deletedAt: null }, select: { id: true } },
      graphRelationships: { where: { deletedAt: null }, select: { id: true } },
    },
  });

  if (!linked) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "リポジトリの作成後に読み込みに失敗しました。",
    });
  }

  return {
    topicSpaceId: linked.id,
    topicSpaceName: linked.name,
    mcpToolIdentifier: linked.mcpToolIdentifier,
    nodeCount: linked.graphNodes.length,
    relationshipCount: linked.graphRelationships.length,
    linkedDocuments: linked.sourceDocuments,
    sourceDocumentIds: uniqueIds,
    attachedDocumentCount: uniqueIds.length,
  };
}
