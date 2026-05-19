import type { PrismaClient } from "@prisma/client";
import { GraphChangeRecordType } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { rollbackNodeLinkChanges } from "@/server/domain/kg";
export async function rollbackGraphChange(
  db: PrismaClient,
  params: {
    changeHistoryId: string;
    userId: string;
    reason?: string;
  },
) {
  const changeHistory = await db.graphChangeHistory.findUnique({
    where: { id: params.changeHistoryId },
    include: {
      nodeLinkChangeHistories: true,
    },
  });

  if (!changeHistory) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "変更履歴が見つかりません",
    });
  }

  if (changeHistory.recordType !== GraphChangeRecordType.TOPIC_SPACE) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "この変更履歴はロールバックできません",
    });
  }

  const topicSpace = await db.topicSpace.findFirst({
    where: {
      id: changeHistory.recordId,
      isDeleted: false,
    },
    include: { admins: true },
  });

  if (!topicSpace) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "TopicSpaceが見つかりません",
    });
  }

  const isAdmin = topicSpace.admins.some(
    (admin) => admin.id === params.userId,
  );
  if (!isAdmin) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "この変更をロールバックする権限がありません",
    });
  }

  const topicSpaceId = changeHistory.recordId;

  return db.$transaction(async (tx) => {
    await rollbackNodeLinkChanges(
      tx,
      topicSpaceId,
      changeHistory.nodeLinkChangeHistories,
    );

    const rollbackHistory = await tx.graphChangeHistory.create({
      data: {
        recordType: GraphChangeRecordType.TOPIC_SPACE,
        recordId: topicSpaceId,
        description: `変更をロールバックしました${params.reason ? `: ${params.reason}` : ""}`,
        userId: params.userId,
      },
    });

    const inverseRows = changeHistory.nodeLinkChangeHistories.map((change) => ({
      changeType: change.changeType,
      changeEntityType: change.changeEntityType,
      changeEntityId: change.changeEntityId,
      previousState: (change.nextState ?? {}) as object,
      nextState: (change.previousState ?? {}) as object,
      graphChangeHistoryId: rollbackHistory.id,
    }));

    if (inverseRows.length > 0) {
      await tx.nodeLinkChangeHistory.createMany({ data: inverseRows });
    }

    return {
      message: "ロールバックが完了しました",
      rollbackHistoryId: rollbackHistory.id,
    };
  });
}
