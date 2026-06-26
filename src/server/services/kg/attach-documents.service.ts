import type { Prisma, PrismaClient } from "@prisma/client";
import { applyTopicSpaceGraphDiff } from "./apply-topic-space-graph-diff.service";
import { attachTopicSpaceGraphData } from "./topic-space-graph-fusion.service";

type AttachDocumentsCtx = {
  db: PrismaClient;
  session: { user: { id: string } };
};

export async function attachDocumentsToTopicSpace(
  ctx: AttachDocumentsCtx,
  input: { id: string; documentIds: string[] },
) {
  const topicSpace = await ctx.db.topicSpace.findFirst({
    where: { id: input.id, isDeleted: false },
    include: {
      admins: true,
      graphNodes: true,
      graphRelationships: true,
      sourceDocuments: { include: { graph: true } },
    },
  });

  if (
    !topicSpace?.admins.some((admin) => admin.id === ctx.session.user.id)
  ) {
    throw new Error("リポジトリが見つかりません");
  }

  const attachDocuments = await ctx.db.sourceDocument.findMany({
    where: { id: { in: input.documentIds }, isDeleted: false },
    include: { graph: true },
  });
  const attachDocumentsWithGraphs = attachDocuments
    .filter((doc) => doc.graph !== null)
    .filter(
      (doc) =>
        !topicSpace.sourceDocuments.some(
          (d) => d.graph?.id === doc.graph?.id,
        ),
    );
  const additionalGraphIds = attachDocumentsWithGraphs.map(
    (doc) => doc.graph?.id,
  );
  const documentIdsByGraphId = new Map(
    attachDocumentsWithGraphs.map((d) => [
      (d.graph as { id: string }).id,
      d.id,
    ]),
  );

  const prevNodes = topicSpace.graphNodes;
  const prevRelationships = topicSpace.graphRelationships;

  const updatedGraphData = await attachTopicSpaceGraphData(
    topicSpace,
    additionalGraphIds,
    ctx,
    documentIdsByGraphId,
  );

  return await ctx.db.$transaction(async (tx: Prisma.TransactionClient) => {
    const documentAttachedTopicSpace = await tx.topicSpace.update({
      where: { id: input.id },
      data: {
        sourceDocuments: {
          connect: attachDocuments.map((doc) => ({ id: doc.id })),
        },
      },
      include: { sourceDocuments: { include: { graph: true } } },
    });

    await applyTopicSpaceGraphDiff(tx, {
      topicSpaceId: input.id,
      userId: ctx.session.user.id,
      description: "ドキュメントを追加しました",
      prevNodes,
      prevRelationships,
      nextNodes: updatedGraphData.nodes,
      nextRelationships: updatedGraphData.relationships,
    });

    const provenanceData = updatedGraphData.provenance.flatMap((p) =>
      p.relationshipIds.map((relId) => ({
        topicSpaceId: input.id,
        sourceDocumentId: p.sourceDocumentId,
        graphRelationshipId: relId,
      })),
    );
    if (provenanceData.length > 0) {
      await tx.topicSpaceDocumentEdgeProvenance.createMany({
        data: provenanceData,
      });
    }

    const nodeProvenanceData = updatedGraphData.nodeProvenance.flatMap((p) =>
      p.mappings.map((mapping) => ({
        topicSpaceId: input.id,
        sourceDocumentId: p.sourceDocumentId,
        graphNodeId: mapping.graphNodeId,
        localNodeId: mapping.localNodeId,
      })),
    );
    if (nodeProvenanceData.length > 0) {
      await tx.topicSpaceDocumentNodeProvenance.createMany({
        data: nodeProvenanceData,
      });
    }

    return documentAttachedTopicSpace;
  });
}
