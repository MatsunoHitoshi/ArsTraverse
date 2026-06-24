import {
  attachGraphProperties,
  fuseGraphs,
} from "@/server/domain/kg/data-disambiguation";
import type { PrismaClient } from "@prisma/client";
import type {
  GraphNode,
  GraphRelationship,
  TopicSpace,
} from "@prisma/client";

export async function attachTopicSpaceGraphData(
  topicSpace: TopicSpace & {
    graphNodes: GraphNode[];
    graphRelationships: GraphRelationship[];
  },
  additionalGraphIds: (string | undefined)[],
  ctx: { db: PrismaClient },
  documentIdsByGraphId?: Map<string, string>,
): Promise<{
  nodes: GraphNode[];
  relationships: GraphRelationship[];
  provenance: Array<{ sourceDocumentId: string; relationshipIds: string[] }>;
  nodeProvenance: Array<{
    sourceDocumentId: string;
    mappings: Array<{ localNodeId: string; graphNodeId: string }>;
  }>;
}> {
  let newGraphNodes: GraphNode[] = topicSpace.graphNodes;
  let newGraphRelationships: GraphRelationship[] =
    topicSpace.graphRelationships;
  const labelCheck = true;
  const provenance: Array<{
    sourceDocumentId: string;
    relationshipIds: string[];
  }> = [];
  const nodeProvenance: Array<{
    sourceDocumentId: string;
    mappings: Array<{ localNodeId: string; graphNodeId: string }>;
  }> = [];

  if (additionalGraphIds.length > 0) {
    for (const graphId of additionalGraphIds) {
      const documentNodes = await ctx.db.graphNode.findMany({
        where: { documentGraphId: graphId },
      });
      const documentRelationships = await ctx.db.graphRelationship.findMany({
        where: { documentGraphId: graphId },
      });

      const fusedGraph = await fuseGraphs({
        sourceGraph: {
          nodes: newGraphNodes,
          relationships: newGraphRelationships,
        },
        targetGraph: {
          nodes: documentNodes.map((node) => ({
            ...node,
            documentGraphId: null,
            topicSpaceId: topicSpace.id,
          })),
          relationships: documentRelationships.map((r) => ({
            ...r,
            documentGraphId: null,
            topicSpaceId: topicSpace.id,
          })),
        },
        labelCheck,
      });

      if (documentIdsByGraphId && graphId) {
        const sourceDocumentId = documentIdsByGraphId.get(graphId);
        const addedRelationshipIds = fusedGraph.relationships
          .filter(
            (r) => !newGraphRelationships.some((prev) => prev.id === r.id),
          )
          .map((r) => r.id);
        if (sourceDocumentId && addedRelationshipIds.length > 0) {
          provenance.push({
            sourceDocumentId,
            relationshipIds: addedRelationshipIds,
          });
        }
        if (sourceDocumentId && fusedGraph.nodeIdRecords.length > 0) {
          nodeProvenance.push({
            sourceDocumentId,
            mappings: fusedGraph.nodeIdRecords.map((record) => ({
              localNodeId: record.prevId,
              graphNodeId: record.newId,
            })),
          });
        }
      }

      newGraphNodes = fusedGraph.nodes;
      newGraphRelationships = fusedGraph.relationships;
    }
  }

  const topicSpaceNodes = await ctx.db.graphNode.findMany({
    where: { topicSpaceId: topicSpace.id },
  });
  const topicSpaceRelationships = await ctx.db.graphRelationship.findMany({
    where: { topicSpaceId: topicSpace.id },
  });

  const newGraphWithProperties = attachGraphProperties(
    { nodes: newGraphNodes, relationships: newGraphRelationships },
    { nodes: topicSpaceNodes, relationships: topicSpaceRelationships },
    labelCheck,
  );

  return {
    ...newGraphWithProperties,
    provenance,
    nodeProvenance,
  };
}

export function resolveDetachedNodeIds(params: {
  documentNodeProvenance: Array<{ graphNodeId: string }>;
  otherDocumentsNodeProvenance: Array<{ graphNodeId: string }>;
}): Set<string> {
  const fromThisDoc = new Set(
    params.documentNodeProvenance.map((row) => row.graphNodeId),
  );
  const fromOthers = new Set(
    params.otherDocumentsNodeProvenance.map((row) => row.graphNodeId),
  );
  const deleted = new Set<string>();
  for (const graphNodeId of fromThisDoc) {
    if (!fromOthers.has(graphNodeId)) {
      deleted.add(graphNodeId);
    }
  }
  return deleted;
}

export async function detachTopicSpaceGraphData(
  topicSpace: TopicSpace,
  documentGraphId: string,
  leftGraphIds: string[],
  ctx: { db: PrismaClient },
) {
  const documentGraph = await ctx.db.documentGraph.findFirst({
    where: { id: documentGraphId },
    include: {
      graphNodes: true,
      graphRelationships: true,
    },
  });

  if (!documentGraph) {
    throw new Error("DocumentGraph not found");
  }

  const topicSpaceNodes = await ctx.db.graphNode.findMany({
    where: { topicSpaceId: topicSpace.id },
  });
  const topicSpaceRelationships = await ctx.db.graphRelationship.findMany({
    where: { topicSpaceId: topicSpace.id },
  });

  const otherDocumentGraphNodes = await ctx.db.graphNode.findMany({
    where: { documentGraphId: { in: leftGraphIds } },
  });

  const deletedNodes = topicSpaceNodes.filter((topicSpaceNode) => {
    return (
      documentGraph.graphNodes.some(
        (documentGraphNode) =>
          documentGraphNode.name === topicSpaceNode.name &&
          documentGraphNode.label === topicSpaceNode.label,
      ) &&
      !otherDocumentGraphNodes.some(
        (otherDocumentGraphNode) =>
          otherDocumentGraphNode.name === topicSpaceNode.name &&
          otherDocumentGraphNode.label === topicSpaceNode.label,
      )
    );
  });

  const deletedRelationships = topicSpaceRelationships.filter(
    (topicSpaceRelationship) => {
      return deletedNodes.some(
        (deletedNode) =>
          deletedNode.id === topicSpaceRelationship.fromNodeId ||
          deletedNode.id === topicSpaceRelationship.toNodeId,
      );
    },
  );

  return {
    deletedNodes,
    deletedRelationships,
  };
}
