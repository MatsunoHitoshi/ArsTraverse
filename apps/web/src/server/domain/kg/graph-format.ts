import type { Prisma } from "@prisma/client";
import type { GraphNode, GraphRelationship } from "@prisma/client";
import type {
  NodeTypeForFrontend,
  RelationshipTypeForFrontend,
} from "@/app/const/types";

export function mapFrontendNodeToPrisma(
  node: NodeTypeForFrontend,
): Pick<
  GraphNode,
  "id" | "name" | "label" | "properties" | "topicSpaceId" | "documentGraphId"
> & {
  createdAt: null;
  updatedAt: null;
  deletedAt: null;
} {
  return {
    id: node.id,
    name: node.name,
    label: node.label,
    properties: (node.properties ?? {}) as Prisma.JsonValue,
    topicSpaceId: node.topicSpaceId ?? null,
    documentGraphId: node.documentGraphId ?? null,
    createdAt: null,
    updatedAt: null,
    deletedAt: null,
  };
}

export function mapFrontendRelationshipToPrisma(
  rel: RelationshipTypeForFrontend,
): Pick<
  GraphRelationship,
  | "id"
  | "type"
  | "properties"
  | "fromNodeId"
  | "toNodeId"
  | "topicSpaceId"
  | "documentGraphId"
> & {
  createdAt: null;
  updatedAt: null;
  deletedAt: null;
} {
  return {
    id: rel.id,
    type: rel.type,
    properties: (rel.properties ?? {}) as Prisma.JsonValue,
    fromNodeId: rel.sourceId,
    toNodeId: rel.targetId,
    topicSpaceId: rel.topicSpaceId ?? null,
    documentGraphId: rel.documentGraphId ?? null,
    createdAt: null,
    updatedAt: null,
    deletedAt: null,
  };
}

export function mapFrontendGraphToPrismaGraph(graph: {
  nodes: NodeTypeForFrontend[];
  relationships: RelationshipTypeForFrontend[];
}): {
  nodes: GraphNode[];
  relationships: GraphRelationship[];
} {
  return {
    nodes: graph.nodes.map((n) => mapFrontendNodeToPrisma(n) as GraphNode),
    relationships: graph.relationships.map(
      (r) => mapFrontendRelationshipToPrisma(r) as GraphRelationship,
    ),
  };
}

export function buildRelationshipCreateRowsFromIdMap(
  relationships: Array<{
    type: string;
    properties: unknown;
    fromNodeId: string;
    toNodeId: string;
  }>,
  oldToNewNodeIdMap: Map<string, string | undefined>,
  topicSpaceId: string,
): Array<{
  type: string;
  properties: Prisma.InputJsonValue;
  fromNodeId: string;
  toNodeId: string;
  topicSpaceId: string;
}> {
  return relationships
    .map((relationship) => {
      const fromNodeId = oldToNewNodeIdMap.get(relationship.fromNodeId);
      const toNodeId = oldToNewNodeIdMap.get(relationship.toNodeId);
      if (!fromNodeId || !toNodeId) return null;
      return {
        type: relationship.type,
        properties: (relationship.properties ?? {}) as Prisma.InputJsonValue,
        fromNodeId,
        toNodeId,
        topicSpaceId,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
}
