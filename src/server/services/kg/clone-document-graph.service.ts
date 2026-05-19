import type { Prisma, PrismaClient } from "@prisma/client";
import type { DocumentType } from "@prisma/client";

type GraphWithNodes = {
  graphNodes: Array<{
    id: string;
    name: string;
    label: string;
    properties: Prisma.JsonValue;
  }>;
  graphRelationships: Array<{
    fromNodeId: string;
    toNodeId: string;
    type: string;
    properties: Prisma.JsonValue;
  }>;
};

export async function cloneDocumentGraphToRecipient(
  tx: Prisma.TransactionClient,
  params: {
    documentName: string;
    documentUrl: string;
    documentType: DocumentType;
    recipientUserId: string;
    sourceGraph: GraphWithNodes;
  },
) {
  const newDocument = await tx.sourceDocument.create({
    data: {
      name: params.documentName,
      url: params.documentUrl,
      documentType: params.documentType,
      user: { connect: { id: params.recipientUserId } },
    },
  });

  const newGraph = await tx.documentGraph.create({
    data: {
      dataJson: {},
      user: { connect: { id: params.recipientUserId } },
      sourceDocument: { connect: { id: newDocument.id } },
    },
  });

  const oldToNewNodeId = new Map<string, string>();
  for (const node of params.sourceGraph.graphNodes) {
    const created = await tx.graphNode.create({
      data: {
        name: node.name,
        label: node.label,
        properties: node.properties ?? {},
        documentGraphId: newGraph.id,
      },
    });
    oldToNewNodeId.set(node.id, created.id);
  }

  const relationshipsToCreate = params.sourceGraph.graphRelationships
    .map((rel) => {
      const fromId = oldToNewNodeId.get(rel.fromNodeId);
      const toId = oldToNewNodeId.get(rel.toNodeId);
      if (!fromId || !toId) return null;
      return {
        type: rel.type,
        properties: rel.properties ?? {},
        fromNodeId: fromId,
        toNodeId: toId,
        documentGraphId: newGraph.id,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (relationshipsToCreate.length > 0) {
    await tx.graphRelationship.createMany({
      data: relationshipsToCreate,
    });
  }

  return {
    sourceDocument: newDocument,
    documentGraph: newGraph,
  };
}

export async function sendDocumentGraphToUser(
  db: PrismaClient,
  params: {
    senderId: string;
    documentId: string;
    recipientUserId: string;
  },
) {
  if (params.recipientUserId === params.senderId) {
    throw new Error("自分自身には送信できません");
  }

  const document = await db.sourceDocument.findFirst({
    where: {
      id: params.documentId,
      isDeleted: false,
      userId: params.senderId,
    },
    include: {
      graph: {
        include: {
          graphNodes: true,
          graphRelationships: true,
        },
      },
    },
  });

  if (!document) {
    throw new Error("Document not found");
  }

  const recipient = await db.user.findUnique({
    where: { id: params.recipientUserId },
  });
  if (!recipient) {
    throw new Error("受信者が見つかりません");
  }

  if (!document.graph) {
    return db.$transaction(async (tx) => {
      const newDocument = await tx.sourceDocument.create({
        data: {
          name: document.name,
          url: document.url,
          documentType: document.documentType,
          user: { connect: { id: params.recipientUserId } },
        },
      });
      return { sourceDocument: newDocument };
    });
  }

  return db.$transaction(async (tx) =>
    cloneDocumentGraphToRecipient(tx, {
      documentName: document.name,
      documentUrl: document.url,
      documentType: document.documentType,
      recipientUserId: params.recipientUserId,
      sourceGraph: document.graph!,
    }),
  );
}
