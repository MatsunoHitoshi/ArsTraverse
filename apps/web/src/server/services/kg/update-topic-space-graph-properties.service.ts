import type { PrismaClient } from "@prisma/client";
import type { GraphNode, GraphRelationship } from "@prisma/client";
import type {
  NodeTypeForFrontend,
  RelationshipTypeForFrontend,
} from "@/app/const/types";
import {
  formNodeDataForFrontend,
  formRelationshipDataForFrontend,
} from "@/app/_utils/kg/frontend-properties";
import { findTopicSpaceWithGraphAndAssertAdmin } from "@/server/repositories/topic-space-graph.repository";
import { updateTopicSpaceGraph } from "./update-topic-space-graph.service";

export function mergeTopicSpaceGraphProperties(
  prevNodes: GraphNode[],
  prevRelationships: GraphRelationship[],
  input: {
    nodes: NodeTypeForFrontend[];
    relationships: RelationshipTypeForFrontend[];
  },
): {
  nodes: NodeTypeForFrontend[];
  relationships: RelationshipTypeForFrontend[];
} {
  return {
    nodes: prevNodes.map((node) => {
      const updateNode = input.nodes.find((n) => n.id === node.id);
      return updateNode ?? formNodeDataForFrontend(node);
    }),
    relationships: prevRelationships.map((rel) => {
      const updateRel = input.relationships.find((r) => r.id === rel.id);
      return updateRel ?? formRelationshipDataForFrontend(rel);
    }),
  };
}

export async function updateTopicSpaceGraphProperties(
  db: PrismaClient,
  params: {
    topicSpaceId: string;
    userId: string;
    nodes: NodeTypeForFrontend[];
    relationships: RelationshipTypeForFrontend[];
  },
) {
  const topicSpace = await findTopicSpaceWithGraphAndAssertAdmin(
    db,
    params.topicSpaceId,
    params.userId,
  );

  const merged = mergeTopicSpaceGraphProperties(
    topicSpace.graphNodes,
    topicSpace.graphRelationships,
    {
      nodes: params.nodes,
      relationships: params.relationships,
    },
  );

  return updateTopicSpaceGraph(db, {
    topicSpaceId: params.topicSpaceId,
    userId: params.userId,
    nodes: merged.nodes,
    relationships: merged.relationships,
    description: "プロパティを更新しました",
  });
}
