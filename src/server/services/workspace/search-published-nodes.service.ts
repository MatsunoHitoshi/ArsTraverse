import type { Prisma, PrismaClient } from "@prisma/client";
import { DocumentType, WorkspaceStatus } from "@prisma/client";
import type { SearchPublishedNodesInput, PublishedNodeMatch } from "@/server/api/schemas/scan";

type SearchCtx = {
  db: PrismaClient;
};

export async function searchPublishedNodes(
  ctx: SearchCtx,
  input: SearchPublishedNodesInput,
): Promise<PublishedNodeMatch[]> {
  const workspaces = await ctx.db.workspace.findMany({
    where: {
      status: WorkspaceStatus.PUBLISHED,
      isDeleted: false,
      ...(input.workspaceId ? { id: input.workspaceId } : {}),
    },
    select: {
      id: true,
      name: true,
      referencedTopicSpaces: {
        select: {
          id: true,
          name: true,
          graphNodes: {
            where: {
              deletedAt: null,
              name: {
                contains: input.query,
                mode: "insensitive",
              },
            },
            select: {
              id: true,
              name: true,
              label: true,
            },
            take: input.limit,
          },
        },
      },
    },
  });

  const matches: PublishedNodeMatch[] = [];

  for (const workspace of workspaces) {
    for (const topicSpace of workspace.referencedTopicSpaces) {
      for (const node of topicSpace.graphNodes) {
        matches.push({
          nodeId: node.id,
          name: node.name,
          label: node.label,
          workspaceId: workspace.id,
          workspaceName: workspace.name,
          topicSpaceId: topicSpace.id,
          topicSpaceName: topicSpace.name,
        });
        if (matches.length >= input.limit) {
          return matches;
        }
      }
    }
  }

  return matches;
}

export async function searchPublishedNodesByNames(
  ctx: SearchCtx,
  nodeNames: string[],
  limit = 20,
): Promise<PublishedNodeMatch[]> {
  const uniqueNames = [...new Set(nodeNames.map((name) => name.trim()).filter(Boolean))];
  const matches: PublishedNodeMatch[] = [];
  const seenNodeIds = new Set<string>();

  for (const name of uniqueNames) {
    if (matches.length >= limit) break;

    const batch = await searchPublishedNodes(ctx, {
      query: name,
      limit: Math.min(5, limit - matches.length),
    });

    for (const match of batch) {
      if (seenNodeIds.has(match.nodeId)) continue;
      seenNodeIds.add(match.nodeId);
      matches.push(match);
      if (matches.length >= limit) break;
    }
  }

  return matches;
}
