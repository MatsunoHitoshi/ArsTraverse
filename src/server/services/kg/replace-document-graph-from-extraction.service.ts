import type {
  NodeTypeForFrontend,
  RelationshipTypeForFrontend,
} from "@/app/const/types";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { z } from "zod";
import { KnowledgeGraphInputSchema } from "@/server/api/schemas/knowledge-graph";

type GraphDataJson = z.infer<typeof KnowledgeGraphInputSchema>;

export async function replaceDocumentGraphFromExtraction(
  db: PrismaClient,
  input: {
    documentGraphId: string;
    dataJson: GraphDataJson;
  },
) {
  const nodes = input.dataJson.nodes as NodeTypeForFrontend[];
  const relationships = input.dataJson
    .relationships as RelationshipTypeForFrontend[];

  const nodeIds = new Set(nodes.map((node) => node.id));
  const validRelationships = relationships.filter(
    (relationship) =>
      nodeIds.has(relationship.sourceId) && nodeIds.has(relationship.targetId),
  );

  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.graphRelationship.deleteMany({
      where: { documentGraphId: input.documentGraphId },
    });
    await tx.graphNode.deleteMany({
      where: { documentGraphId: input.documentGraphId },
    });

    if (nodes.length > 0) {
      await tx.graphNode.createMany({
        data: nodes.map((node) => ({
          id: node.id,
          name: node.name,
          label: node.label,
          properties: node.properties ?? {},
          documentGraphId: input.documentGraphId,
        })),
      });
    }

    if (validRelationships.length > 0) {
      await tx.graphRelationship.createMany({
        data: validRelationships.map((relationship) => ({
          id: relationship.id,
          fromNodeId: relationship.sourceId,
          toNodeId: relationship.targetId,
          type: relationship.type,
          properties: relationship.properties ?? {},
          documentGraphId: input.documentGraphId,
        })),
      });
    }

    await tx.documentGraph.update({
      where: { id: input.documentGraphId },
      data: { dataJson: input.dataJson as Prisma.InputJsonValue },
    });
  });
}
