import { DocumentType, type PrismaClient } from "@prisma/client";
import type { PublishedNodeMatch } from "@/server/api/schemas/scan";

type SearchCtx = {
  db: PrismaClient;
  session: { user: { id: string } };
};

export async function searchUserScanNodeMatchesByNames(
  ctx: SearchCtx,
  nodeNames: string[],
  excludeSourceDocumentId?: string,
  limit = 20,
): Promise<PublishedNodeMatch[]> {
  const uniqueNames = [
    ...new Set(nodeNames.map((name) => name.trim()).filter(Boolean)),
  ];
  if (uniqueNames.length === 0) return [];

  const nodes = await ctx.db.graphNode.findMany({
    where: {
      deletedAt: null,
      OR: uniqueNames.map((name) => ({
        name: {
          equals: name,
          mode: "insensitive" as const,
        },
      })),
      documentGraph: {
        sourceDocument: {
          userId: ctx.session.user.id,
          isDeleted: false,
          documentType: DocumentType.INPUT_SCAN,
          ...(excludeSourceDocumentId
            ? {
                id: {
                  not: excludeSourceDocumentId,
                },
              }
            : {}),
        },
      },
    },
    select: {
      id: true,
      name: true,
      label: true,
      documentGraph: {
        select: {
          sourceDocument: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
    take: limit,
  });

  const matches: PublishedNodeMatch[] = [];

  for (const node of nodes) {
    const sourceDocument = node.documentGraph?.sourceDocument;
    if (!sourceDocument) continue;
    matches.push({
      nodeId: node.id,
      name: node.name,
      label: node.label,
      sourceType: "sourceDocument",
      sourceDocumentId: sourceDocument.id,
      sourceDocumentName: sourceDocument.name,
    });
  }

  return matches;
}
