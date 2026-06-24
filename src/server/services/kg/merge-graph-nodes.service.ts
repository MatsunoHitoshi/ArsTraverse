import type { PrismaClient } from "@prisma/client";
import { mergerNodes } from "@/server/domain/kg/data-disambiguation";
import type { NodeTypeForFrontend } from "@/app/const/types";
import { findTopicSpaceWithGraphAndAssertAdmin } from "@/server/repositories/topic-space-graph.repository";
import { reassignTopicSpaceNodeProvenanceOnMerge } from "@/server/repositories/topic-space-document-provenance.repository";
import { applyTopicSpaceGraphDiff } from "./apply-topic-space-graph-diff.service";

export async function mergeGraphNodes(
  db: PrismaClient,
  params: {
    topicSpaceId: string;
    userId: string;
    nodesToMerge: NodeTypeForFrontend[];
  },
) {
  const topicSpace = await findTopicSpaceWithGraphAndAssertAdmin(
    db,
    params.topicSpaceId,
    params.userId,
  );

  const prevNodes = topicSpace.graphNodes;
  const prevRelationships = topicSpace.graphRelationships;

  const canonicalNodeId = params.nodesToMerge[0]?.id;
  const duplicateNodeIds = params.nodesToMerge
    .slice(1)
    .map((node) => node.id)
    .filter((id) => id !== canonicalNodeId);

  const updatedGraphData = mergerNodes(
    {
      nodes: prevNodes,
      relationships: prevRelationships,
    },
    params.nodesToMerge,
  );

  await db.$transaction(
    async (tx) => {
      if (canonicalNodeId && duplicateNodeIds.length > 0) {
        await reassignTopicSpaceNodeProvenanceOnMerge(
          tx,
          params.topicSpaceId,
          canonicalNodeId,
          duplicateNodeIds,
        );
      }

      await applyTopicSpaceGraphDiff(tx, {
        topicSpaceId: params.topicSpaceId,
        userId: params.userId,
        description: "ノードを統合しました",
        prevNodes,
        prevRelationships,
        nextNodes: updatedGraphData.nodes,
        nextRelationships: updatedGraphData.relationships,
      });
    },
    { timeout: 30000 },
  );

  return db.topicSpace.findFirst({ where: { id: params.topicSpaceId } });
}
