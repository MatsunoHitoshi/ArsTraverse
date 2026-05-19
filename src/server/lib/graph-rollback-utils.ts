import type { Prisma, PrismaClient } from "@prisma/client";
import {
  GraphChangeEntityType,
  GraphChangeType,
} from "@prisma/client";

type NodeLinkChange = {
  changeType: GraphChangeType;
  changeEntityType: GraphChangeEntityType;
  changeEntityId: string;
  previousState: unknown;
  nextState: unknown;
};

const previousState = (change: { previousState: unknown }) =>
  (change.previousState ?? {}) as Record<string, unknown>;

/** 変更履歴1件分のグラフ状態をロールバックする（履歴レコード作成は呼び出し元の責務） */
export async function rollbackNodeLinkChanges(
  db: PrismaClient | Prisma.TransactionClient,
  topicSpaceId: string,
  changes: NodeLinkChange[],
): Promise<void> {
  for (const change of changes) {
    if (change.changeEntityType === GraphChangeEntityType.NODE) {
      if (change.changeType === GraphChangeType.UPDATE) {
        const prev = previousState(change);
        await db.graphNode.updateMany({
          where: { id: change.changeEntityId, topicSpaceId },
          data: {
            name: prev.name != null ? String(prev.name) : undefined,
            label: prev.label != null ? String(prev.label) : undefined,
            properties: (prev.properties as object) ?? {},
          },
        });
      } else if (change.changeType === GraphChangeType.ADD) {
        const incidentEdges = await db.graphRelationship.findMany({
          where: {
            topicSpaceId,
            deletedAt: null,
            OR: [
              { fromNodeId: change.changeEntityId },
              { toNodeId: change.changeEntityId },
            ],
          },
          select: { id: true },
        });
        if (incidentEdges.length > 0) {
          await db.graphRelationship.updateMany({
            where: {
              id: { in: incidentEdges.map((e) => e.id) },
              topicSpaceId,
            },
            data: { topicSpaceId: null, deletedAt: new Date() },
          });
        }
        await db.graphNode.updateMany({
          where: { id: change.changeEntityId, topicSpaceId },
          data: { topicSpaceId: null, deletedAt: new Date() },
        });
      } else if (change.changeType === GraphChangeType.REMOVE) {
        const prev = previousState(change);
        await db.graphNode.updateMany({
          where: { id: change.changeEntityId },
          data: {
            topicSpaceId,
            deletedAt: null,
            name: prev.name != null ? String(prev.name) : undefined,
            label: prev.label != null ? String(prev.label) : undefined,
            properties: (prev.properties as object) ?? {},
          },
        });
      }
    } else if (change.changeEntityType === GraphChangeEntityType.EDGE) {
      if (change.changeType === GraphChangeType.UPDATE) {
        const prev = previousState(change);
        await db.graphRelationship.updateMany({
          where: { id: change.changeEntityId, topicSpaceId },
          data: {
            type: prev.type != null ? String(prev.type) : undefined,
            properties: (prev.properties as object) ?? {},
            fromNodeId:
              prev.sourceId != null ? String(prev.sourceId) : undefined,
            toNodeId:
              prev.targetId != null ? String(prev.targetId) : undefined,
          },
        });
      } else if (change.changeType === GraphChangeType.ADD) {
        await db.graphRelationship.updateMany({
          where: { id: change.changeEntityId, topicSpaceId },
          data: { topicSpaceId: null, deletedAt: new Date() },
        });
      } else if (change.changeType === GraphChangeType.REMOVE) {
        const prev = previousState(change);
        await db.graphRelationship.updateMany({
          where: { id: change.changeEntityId },
          data: {
            topicSpaceId,
            deletedAt: null,
            type: prev.type != null ? String(prev.type) : undefined,
            properties: (prev.properties as object) ?? {},
            fromNodeId:
              prev.sourceId != null ? String(prev.sourceId) : undefined,
            toNodeId:
              prev.targetId != null ? String(prev.targetId) : undefined,
          },
        });
      }
    }
  }
}
