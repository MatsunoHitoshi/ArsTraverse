import type { GraphNode, GraphRelationship } from "@prisma/client";

export function makeGraphNode(
  overrides: Partial<GraphNode> & Pick<GraphNode, "id" | "name" | "label">,
): GraphNode {
  const now = new Date();
  return {
    properties: {},
    documentGraphId: null,
    topicSpaceId: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

export function makeGraphRelationship(
  overrides: Partial<GraphRelationship> &
    Pick<GraphRelationship, "id" | "fromNodeId" | "toNodeId" | "type">,
): GraphRelationship {
  const now = new Date();
  return {
    properties: {},
    documentGraphId: null,
    topicSpaceId: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}
