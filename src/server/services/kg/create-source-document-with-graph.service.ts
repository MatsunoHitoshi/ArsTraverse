import type { PrismaClient, Prisma } from "@prisma/client";
import { DocumentType } from "@prisma/client";
import type {
  NodeTypeForFrontend,
  RelationshipTypeForFrontend,
} from "@/app/const/types";
import { inspectFileTypeFromUrl } from "@/app/_utils/sys/file";
import type { z } from "zod";
import { KnowledgeGraphInputSchema } from "@/server/api/schemas/knowledge-graph";

export type CreateSourceDocumentWithGraphInput = {
  name: string;
  url: string;
  dataJson: z.infer<typeof KnowledgeGraphInputSchema>;
  documentType?: DocumentType;
  sourceImageUrl?: string | null;
  ocrMetadata?: Prisma.InputJsonValue;
  externalSourceId?: string | null;
  externalModifiedAt?: Date | null;
  contentHash?: string | null;
};

type CreateWithGraphCtx = {
  db: PrismaClient;
  session: { user: { id: string } };
};

export async function createSourceDocumentWithGraph(
  ctx: CreateWithGraphCtx,
  input: CreateSourceDocumentWithGraphInput,
) {
  let documentType = input.documentType;

  if (!documentType) {
    const docFileType = await inspectFileTypeFromUrl(input.url);
    if (!docFileType) {
      throw new Error("ファイルタイプを判定できませんでした");
    }
    documentType =
      docFileType === "pdf" ? DocumentType.INPUT_PDF : DocumentType.INPUT_TXT;
  }

  const nodes = input.dataJson.nodes as NodeTypeForFrontend[];
  const existingNodeIds = await ctx.db.graphNode.findMany({
    where: { id: { in: nodes.map((n) => n.id) } },
    select: { id: true },
  });
  const existingNodeIdSet = new Set(existingNodeIds.map((n) => n.id));
  const nodesToCreate = nodes.filter((node) => !existingNodeIdSet.has(node.id));

  if (nodesToCreate.length !== nodes.length) {
    const skippedCount = nodes.length - nodesToCreate.length;
    const skippedIds = nodes
      .filter((node) => existingNodeIdSet.has(node.id))
      .map((node) => node.id);
    console.warn(
      `Skipping ${skippedCount} node(s) that already exist in database:`,
      skippedIds.slice(0, 10),
    );
  }

  const relationships = input.dataJson
    .relationships as RelationshipTypeForFrontend[];
  const existingRelationshipIds = await ctx.db.graphRelationship.findMany({
    where: { id: { in: relationships.map((r) => r.id) } },
    select: { id: true },
  });
  const existingRelationshipIdSet = new Set(
    existingRelationshipIds.map((r) => r.id),
  );
  const relationshipsToCreate = relationships.filter(
    (relationship) => !existingRelationshipIdSet.has(relationship.id),
  );

  if (relationshipsToCreate.length !== relationships.length) {
    const skippedCount = relationships.length - relationshipsToCreate.length;
    const skippedIds = relationships
      .filter((relationship) =>
        existingRelationshipIdSet.has(relationship.id),
      )
      .map((relationship) => relationship.id);
    console.warn(
      `Skipping ${skippedCount} relationship(s) that already exist in database:`,
      skippedIds.slice(0, 10),
    );
  }

  return ctx.db.$transaction(async (tx) => {
    const document = await tx.sourceDocument.create({
      data: {
        name: input.name,
        url: input.url,
        documentType,
        sourceImageUrl: input.sourceImageUrl ?? null,
        ocrMetadata: input.ocrMetadata ?? undefined,
        externalSourceId: input.externalSourceId ?? null,
        externalModifiedAt: input.externalModifiedAt ?? null,
        contentHash: input.contentHash ?? null,
        user: { connect: { id: ctx.session.user.id } },
      },
    });

    const documentGraph = await tx.documentGraph.create({
      data: {
        user: { connect: { id: ctx.session.user.id } },
        sourceDocument: { connect: { id: document.id } },
        dataJson: {},
      },
    });

    if (nodesToCreate.length > 0) {
      await tx.graphNode.createMany({
        data: nodesToCreate.map((node: NodeTypeForFrontend) => ({
          id: node.id,
          name: node.name,
          label: node.label,
          properties: node.properties ?? {},
          documentGraphId: documentGraph.id,
        })),
      });
    }

    if (relationshipsToCreate.length > 0) {
      await tx.graphRelationship.createMany({
        data: relationshipsToCreate.map(
          (relationship: RelationshipTypeForFrontend) => ({
            id: relationship.id,
            fromNodeId: relationship.sourceId,
            toNodeId: relationship.targetId,
            type: relationship.type,
            properties: relationship.properties ?? {},
            documentGraphId: documentGraph.id,
          }),
        ),
      });
    }

    return { documentGraph, sourceDocument: document };
  });
}
