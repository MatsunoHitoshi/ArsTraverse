import type { Prisma, PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { assertTopicSpaceAdmin } from "@/server/repositories/topic-space-graph.repository";
import { applyTopicSpaceGraphDiff } from "./apply-topic-space-graph-diff.service";
import {
  detachTopicSpaceGraphData,
  resolveDetachedNodeIds,
} from "./topic-space-graph-fusion.service";

type DetachDocumentsCtx = {
  db: PrismaClient;
  session: { user: { id: string } };
};

export async function detachDocumentsFromTopicSpace(
  ctx: DetachDocumentsCtx,
  input: { id: string; documentId: string },
) {
  const topicSpace = await ctx.db.topicSpace.findFirst({
    where: { id: input.id, isDeleted: false },
    include: {
      admins: true,
      sourceDocuments: { include: { graph: true } },
    },
  });

  if (!topicSpace) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "リポジトリが見つかりません",
    });
  }
  assertTopicSpaceAdmin(topicSpace, ctx.session.user.id);

  const prevNodes = await ctx.db.graphNode.findMany({
    where: { topicSpaceId: input.id, deletedAt: null },
  });
  const prevRelationships = await ctx.db.graphRelationship.findMany({
    where: { topicSpaceId: input.id, deletedAt: null },
  });

  const leftGraphIds = topicSpace.sourceDocuments
    .filter(
      (sourceDocument) =>
        sourceDocument.graph !== null &&
        sourceDocument.id !== input.documentId,
    )
    .map((sourceDocument) => sourceDocument.graph?.id);

  const documentGraphId = topicSpace.sourceDocuments.find(
    (sourceDocument) => sourceDocument.id === input.documentId,
  )?.graph?.id;
  if (!documentGraphId) {
    throw new Error("Document graph not found");
  }

  const nodeProvenanceRows =
    await ctx.db.topicSpaceDocumentNodeProvenance.findMany({
      where: {
        topicSpaceId: input.id,
        sourceDocumentId: input.documentId,
      },
    });

  const otherDocumentIds = topicSpace.sourceDocuments
    .filter((sourceDocument) => sourceDocument.id !== input.documentId)
    .map((sourceDocument) => sourceDocument.id);

  let deletedNodeIds: Set<string>;
  if (nodeProvenanceRows.length > 0) {
    const otherNodeProvenanceRows =
      otherDocumentIds.length > 0
        ? await ctx.db.topicSpaceDocumentNodeProvenance.findMany({
            where: {
              topicSpaceId: input.id,
              sourceDocumentId: { in: otherDocumentIds },
            },
          })
        : [];
    deletedNodeIds = resolveDetachedNodeIds({
      documentNodeProvenance: nodeProvenanceRows,
      otherDocumentsNodeProvenance: otherNodeProvenanceRows,
    });
  } else {
    const detachedGraphData = await detachTopicSpaceGraphData(
      topicSpace,
      documentGraphId,
      leftGraphIds.filter((id): id is string => id !== undefined),
      ctx,
    );
    deletedNodeIds = new Set(
      detachedGraphData.deletedNodes.map((node) => node.id),
    );
  }

  const provenanceEdges =
    await ctx.db.topicSpaceDocumentEdgeProvenance.findMany({
      where: {
        topicSpaceId: input.id,
        sourceDocumentId: input.documentId,
      },
    });

  const edgeIdsToRemove = new Set([
    ...prevRelationships
      .filter(
        (rel) =>
          deletedNodeIds.has(rel.fromNodeId) || deletedNodeIds.has(rel.toNodeId),
      )
      .map((rel) => rel.id),
    ...provenanceEdges.map((p) => p.graphRelationshipId),
  ]);

  const nextNodes = prevNodes.filter((node) => !deletedNodeIds.has(node.id));
  const nextRelationships = prevRelationships.filter(
    (rel) => !edgeIdsToRemove.has(rel.id),
  );

  return await ctx.db.$transaction(async (tx: Prisma.TransactionClient) => {
    const documentDetachedTopicSpace = await tx.topicSpace.update({
      where: { id: input.id },
      data: {
        sourceDocuments: {
          disconnect: { id: input.documentId },
        },
      },
      include: { sourceDocuments: { include: { graph: true } } },
    });

    await applyTopicSpaceGraphDiff(tx, {
      topicSpaceId: input.id,
      userId: ctx.session.user.id,
      description: "ドキュメントを削除しました",
      prevNodes,
      prevRelationships,
      nextNodes,
      nextRelationships,
    });

    await tx.topicSpaceDocumentEdgeProvenance.deleteMany({
      where: {
        topicSpaceId: input.id,
        sourceDocumentId: input.documentId,
      },
    });

    await tx.topicSpaceDocumentNodeProvenance.deleteMany({
      where: {
        topicSpaceId: input.id,
        sourceDocumentId: input.documentId,
      },
    });

    return documentDetachedTopicSpace;
  });
}
