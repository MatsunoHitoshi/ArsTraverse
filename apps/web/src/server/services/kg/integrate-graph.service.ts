import type { PrismaClient } from "@prisma/client";
import {
  attachGraphProperties,
  fuseGraphs,
} from "@/server/domain/kg/data-disambiguation";
import type {
  NodeTypeForFrontend,
  RelationshipTypeForFrontend,
} from "@/app/const/types";
import { mapFrontendGraphToPrismaGraph } from "@/server/domain/kg/graph-format";
import { findTopicSpaceWithGraphAndAssertAdmin } from "@/server/repositories/topic-space-graph.repository";
import { applyTopicSpaceGraphDiff } from "./apply-topic-space-graph-diff.service";

export async function integrateGraph(
  db: PrismaClient,
  params: {
    topicSpaceId: string;
    userId: string;
    graphDocument: {
      nodes: NodeTypeForFrontend[];
      relationships: RelationshipTypeForFrontend[];
    };
  },
) {
  const topicSpace = await findTopicSpaceWithGraphAndAssertAdmin(
    db,
    params.topicSpaceId,
    params.userId,
  );

  const prevGraphData = {
    nodes: topicSpace.graphNodes,
    relationships: topicSpace.graphRelationships,
  };

  const targetGraphForFusion = mapFrontendGraphToPrismaGraph(params.graphDocument);

  const updatedGraphData = await fuseGraphs({
    sourceGraph: prevGraphData,
    targetGraph: targetGraphForFusion,
    labelCheck: false,
  });

  const newGraphWithProperties = attachGraphProperties(
    updatedGraphData,
    prevGraphData,
    false,
  );

  if (!newGraphWithProperties) {
    throw new Error("Graph fusion failed");
  }

  await db.$transaction(
    async (tx) => {
      await applyTopicSpaceGraphDiff(tx, {
        topicSpaceId: params.topicSpaceId,
        userId: params.userId,
        description: "グラフを追加しました",
        prevNodes: prevGraphData.nodes,
        prevRelationships: prevGraphData.relationships,
        nextNodes: newGraphWithProperties.nodes,
        nextRelationships: newGraphWithProperties.relationships,
      });
    },
    { timeout: 30000 },
  );

  return { data: topicSpace };
}
