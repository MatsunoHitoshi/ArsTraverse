import { DocumentType, type PrismaClient } from "@prisma/client";
import type { PublishedNodeMatch } from "@/server/api/schemas/scan";

type SearchCtx = {
  db: PrismaClient;
  session: { user: { id: string } };
};

function uniqueNodeNames(nodeNames: string[]): string[] {
  return [...new Set(nodeNames.map((name) => name.trim()).filter(Boolean))];
}

function nameOrFilter(uniqueNames: string[]) {
  return uniqueNames.map((name) => ({
    name: {
      equals: name,
      mode: "insensitive" as const,
    },
  }));
}

export async function searchUserTopicSpaceNodeMatchesByNames(
  ctx: SearchCtx,
  nodeNames: string[],
  limit = 20,
): Promise<PublishedNodeMatch[]> {
  const uniqueNames = uniqueNodeNames(nodeNames);
  if (uniqueNames.length === 0) return [];

  const nodes = await ctx.db.graphNode.findMany({
    where: {
      deletedAt: null,
      OR: nameOrFilter(uniqueNames),
      topicSpace: {
        isDeleted: false,
        admins: {
          some: { id: ctx.session.user.id },
        },
      },
    },
    select: {
      id: true,
      name: true,
      label: true,
      topicSpace: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    take: limit,
  });

  const matches: PublishedNodeMatch[] = [];

  for (const node of nodes) {
    if (!node.topicSpace) continue;
    matches.push({
      nodeId: node.id,
      name: node.name,
      label: node.label,
      sourceType: "topicSpace",
      topicSpaceId: node.topicSpace.id,
      topicSpaceName: node.topicSpace.name,
    });
  }

  return matches;
}

export async function searchUserSourceDocumentNodeMatchesByNames(
  ctx: SearchCtx,
  nodeNames: string[],
  excludeSourceDocumentId?: string,
  limit = 20,
): Promise<PublishedNodeMatch[]> {
  const uniqueNames = uniqueNodeNames(nodeNames);
  if (uniqueNames.length === 0) return [];

  const nodes = await ctx.db.graphNode.findMany({
    where: {
      deletedAt: null,
      OR: nameOrFilter(uniqueNames),
      documentGraph: {
        isDeleted: false,
        sourceDocument: {
          userId: ctx.session.user.id,
          isDeleted: false,
          documentType: {
            in: [
              DocumentType.INPUT_PDF,
              DocumentType.INPUT_TXT,
              DocumentType.INPUT_SCAN,
            ],
          },
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
              documentType: true,
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
      sourceDocumentType: sourceDocument.documentType,
    });
  }

  return matches;
}

export async function searchUserNodeMatchesByNames(
  ctx: SearchCtx,
  nodeNames: string[],
  excludeSourceDocumentId?: string,
  limit = 100,
): Promise<PublishedNodeMatch[]> {
  const [topicSpaceMatches, sourceDocumentMatches] = await Promise.all([
    searchUserTopicSpaceNodeMatchesByNames(ctx, nodeNames, limit),
    searchUserSourceDocumentNodeMatchesByNames(
      ctx,
      nodeNames,
      excludeSourceDocumentId,
      limit,
    ),
  ]);

  const merged: PublishedNodeMatch[] = [];
  const seenNodeIds = new Set<string>();

  for (const match of [...topicSpaceMatches, ...sourceDocumentMatches]) {
    if (seenNodeIds.has(match.nodeId)) continue;
    seenNodeIds.add(match.nodeId);
    merged.push(match);
    if (merged.length >= limit) break;
  }

  return merged;
}
