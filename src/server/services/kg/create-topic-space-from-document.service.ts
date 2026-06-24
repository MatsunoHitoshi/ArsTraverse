import type { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { slugifyMcpToolIdentifier } from "@/app/_utils/mcp/mcp-tool-identifier";
import { buildRelationshipCreateRowsFromIdMap } from "@/server/domain/kg/graph-format";

export async function createTopicSpaceFromDocument(
  db: PrismaClient,
  params: {
    userId: string;
    documentId?: string;
    name: string;
    image?: string | null;
    description?: string | null;
  },
) {
  if (!params.documentId) {
    return db.topicSpace.create({
      data: {
        name: params.name,
        image: params.image,
        description: params.description,
        mcpToolIdentifier: slugifyMcpToolIdentifier(params.name),
        admins: { connect: { id: params.userId } },
      },
    });
  }

  return db.$transaction(async (tx) => {
    const document = await tx.sourceDocument.findFirst({
      where: { id: params.documentId, isDeleted: false },
      include: {
        graph: {
          include: {
            graphNodes: { where: { deletedAt: null } },
            graphRelationships: { where: { deletedAt: null } },
          },
        },
      },
    });

    if (!document) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "ドキュメントが見つかりません",
      });
    }

    const topicSpace = await tx.topicSpace.create({
      data: {
        name: params.name,
        image: params.image,
        description: params.description,
        mcpToolIdentifier: slugifyMcpToolIdentifier(params.name),
        sourceDocuments: { connect: { id: params.documentId } },
        admins: { connect: { id: params.userId } },
      },
    });

    if (document.graph) {
      const graphData = {
        nodes: document.graph.graphNodes,
        relationships: document.graph.graphRelationships,
      };

      if (graphData.nodes.length > 0) {
        await tx.graphNode.createMany({
          data: graphData.nodes.map((node) => ({
            name: node.name,
            label: node.label,
            properties: node.properties ?? {},
            topicSpaceId: topicSpace.id,
          })),
        });
      }

      const createdNodes = await tx.graphNode.findMany({
        where: { topicSpaceId: topicSpace.id },
      });

      const oldToNewNodeIdMap = new Map(
        graphData.nodes.map((node) => [
          node.id,
          createdNodes.find(
            (n) => n.name === node.name && n.label === node.label,
          )?.id,
        ]),
      );

      const relationshipCreateData = buildRelationshipCreateRowsFromIdMap(
        graphData.relationships,
        oldToNewNodeIdMap,
        topicSpace.id,
      );

      if (relationshipCreateData.length > 0) {
        await tx.graphRelationship.createMany({
          data: relationshipCreateData,
          skipDuplicates: true,
        });
      }

      const nodeProvenanceData = graphData.nodes
        .map((node) => {
          const graphNodeId = oldToNewNodeIdMap.get(node.id);
          if (!graphNodeId || !params.documentId) {
            return null;
          }
          return {
            topicSpaceId: topicSpace.id,
            sourceDocumentId: params.documentId,
            graphNodeId,
            localNodeId: node.id,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null);

      if (nodeProvenanceData.length > 0) {
        await tx.topicSpaceDocumentNodeProvenance.createMany({
          data: nodeProvenanceData,
        });
      }

      const createdRelationships = await tx.graphRelationship.findMany({
        where: { topicSpaceId: topicSpace.id },
      });
      const sourceDocumentId = params.documentId;
      if (createdRelationships.length > 0 && sourceDocumentId) {
        await tx.topicSpaceDocumentEdgeProvenance.createMany({
          data: createdRelationships.map((relationship) => ({
            topicSpaceId: topicSpace.id,
            sourceDocumentId,
            graphRelationshipId: relationship.id,
          })),
        });
      }
    }

    return topicSpace;
  });
}
