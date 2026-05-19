import type { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";

type TopicSpaceWithGraph = NonNullable<
  Awaited<ReturnType<typeof findTopicSpaceWithGraph>>
>;

export async function findTopicSpaceWithGraph(
  db: PrismaClient,
  topicSpaceId: string,
  options?: { includeDeletedNodes?: boolean },
) {
  return db.topicSpace.findFirst({
    where: { id: topicSpaceId, isDeleted: false },
    include: {
      admins: true,
      graphNodes: options?.includeDeletedNodes
        ? true
        : { where: { deletedAt: null } },
      graphRelationships: options?.includeDeletedNodes
        ? true
        : { where: { deletedAt: null } },
    },
  });
}

export function assertTopicSpaceAdmin(
  topicSpace: { admins: { id: string }[] },
  userId: string,
): void {
  const isAdmin = topicSpace.admins.some((admin) => admin.id === userId);
  if (!isAdmin) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "TopicSpace not found",
    });
  }
}

export async function findTopicSpaceWithGraphAndAssertAdmin(
  db: PrismaClient,
  topicSpaceId: string,
  userId: string,
) {
  const topicSpace = await findTopicSpaceWithGraph(db, topicSpaceId);
  if (!topicSpace) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "TopicSpace not found",
    });
  }
  assertTopicSpaceAdmin(topicSpace, userId);
  return topicSpace;
}
