import type { PrismaClient } from "@prisma/client";

export async function resolveTopicSpaceIdForMetaGraph(
  db: PrismaClient,
  opts: {
    userId: string;
    workspaceId?: string;
    topicSpaceId?: string;
    graphNodes: Array<{ topicSpaceId?: string }>;
  },
): Promise<string | null> {
  if (opts.topicSpaceId) return opts.topicSpaceId;

  if (opts.workspaceId) {
    const workspace = await db.workspace.findFirst({
      where: {
        id: opts.workspaceId,
        isDeleted: false,
        OR: [
          { userId: opts.userId },
          { collaborators: { some: { id: opts.userId } } },
        ],
      },
      include: {
        referencedTopicSpaces: {
          where: { isDeleted: false },
          take: 1,
        },
      },
    });
    const first = workspace?.referencedTopicSpaces[0];
    return first?.id ?? null;
  }

  const ids = new Set(
    opts.graphNodes
      .map((n) => n.topicSpaceId)
      .filter((id): id is string => Boolean(id)),
  );
  if (ids.size === 1) return [...ids][0]!;
  return null;
}
