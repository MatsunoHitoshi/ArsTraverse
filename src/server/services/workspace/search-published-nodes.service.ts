import type { PrismaClient } from "@prisma/client";
import { WorkspaceStatus } from "@prisma/client";
import type {
  SearchPublishedNodesInput,
  PublishedNodeMatch,
} from "@/server/api/schemas/scan";

type SearchCtx = {
  db: PrismaClient;
};

type PublishedNodeRow = {
  id: string;
  name: string;
  label: string;
  topicSpace: {
    id: string;
    name: string;
    referencedByWorkspaces: Array<{ id: string; name: string }>;
  } | null;
};

function publishedWorkspaceFilter(workspaceId?: string) {
  return {
    status: WorkspaceStatus.PUBLISHED,
    isDeleted: false,
    ...(workspaceId ? { id: workspaceId } : {}),
  };
}

function mapNodesToMatches(
  nodes: PublishedNodeRow[],
  limit: number,
): PublishedNodeMatch[] {
  const matches: PublishedNodeMatch[] = [];
  const seenNodeIds = new Set<string>();

  for (const node of nodes) {
    if (!node.topicSpace) continue;

    for (const workspace of node.topicSpace.referencedByWorkspaces) {
      if (seenNodeIds.has(node.id)) continue;
      seenNodeIds.add(node.id);

      matches.push({
        nodeId: node.id,
        name: node.name,
        label: node.label,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        topicSpaceId: node.topicSpace.id,
        topicSpaceName: node.topicSpace.name,
      });

      if (matches.length >= limit) {
        return matches;
      }
    }
  }

  return matches;
}

export async function searchPublishedNodes(
  ctx: SearchCtx,
  input: SearchPublishedNodesInput,
): Promise<PublishedNodeMatch[]> {
  const workspaceFilter = publishedWorkspaceFilter(input.workspaceId);

  const nodes = await ctx.db.graphNode.findMany({
    where: {
      deletedAt: null,
      name: {
        contains: input.query,
        mode: "insensitive",
      },
      topicSpace: {
        referencedByWorkspaces: {
          some: workspaceFilter,
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
          referencedByWorkspaces: {
            where: workspaceFilter,
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
    take: input.limit,
  });

  return mapNodesToMatches(nodes, input.limit);
}

export async function searchPublishedNodesByNames(
  ctx: SearchCtx,
  nodeNames: string[],
  limit = 20,
): Promise<PublishedNodeMatch[]> {
  const uniqueNames = [
    ...new Set(nodeNames.map((name) => name.trim()).filter(Boolean)),
  ];
  if (uniqueNames.length === 0) return [];

  const nodes = await ctx.db.graphNode.findMany({
    where: {
      deletedAt: null,
      name: {
        in: uniqueNames,
        mode: "insensitive",
      },
      topicSpace: {
        referencedByWorkspaces: {
          some: publishedWorkspaceFilter(),
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
          referencedByWorkspaces: {
            where: publishedWorkspaceFilter(),
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

  return mapNodesToMatches(nodes, limit);
}
