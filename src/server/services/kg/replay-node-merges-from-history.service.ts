import type { PrismaClient } from "@prisma/client";
import { GraphChangeRecordType } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { formNodeDataForFrontend } from "@/app/_utils/kg/frontend-properties";
import type { NodeTypeForFrontend } from "@/app/const/types";
import {
  isNodeMergeChangeHistory,
  parseNodeMergeFromChangeHistory,
  parseNodeMergeOperationsFromChangeHistory,
  type ParsedNodeMergeOperation,
} from "@/server/domain/kg/parse-merge-from-change-history";
import { findTopicSpaceWithGraphAndAssertAdmin } from "@/server/repositories/topic-space-graph.repository";
import { mergeGraphNodes } from "./merge-graph-nodes.service";

export type ReplayNodeMergeResult = {
  changeHistoryId: string;
  status: "applied" | "skipped" | "failed";
  reason?: string;
  canonicalNode?: { id: string; name: string; label: string };
  mergedNodeIds?: string[];
};

export async function listTopicSpaceChangeHistory(
  db: PrismaClient,
  params: {
    topicSpaceId: string;
    userId: string;
    includeDetails?: boolean;
    mergeOnly?: boolean;
    before?: Date;
    after?: Date;
    limit?: number;
  },
) {
  await findTopicSpaceWithGraphAndAssertAdmin(
    db,
    params.topicSpaceId,
    params.userId,
  );

  const histories = await db.graphChangeHistory.findMany({
    where: {
      recordId: params.topicSpaceId,
      recordType: GraphChangeRecordType.TOPIC_SPACE,
      ...(params.before ? { createdAt: { lt: params.before } } : {}),
      ...(params.after ? { createdAt: { gt: params.after } } : {}),
      ...(params.mergeOnly
        ? { description: "ノードを統合しました" }
        : {}),
    },
    include: {
      user: { select: { id: true, name: true } },
      nodeLinkChangeHistories: params.includeDetails ?? false,
    },
    orderBy: { createdAt: "desc" },
    take: params.limit ?? 100,
  });

  return histories.map((history) => ({
    id: history.id,
    description: history.description,
    createdAt: history.createdAt.toISOString(),
    userId: history.userId,
    userName: history.user.name,
    changeCount: params.includeDetails
      ? history.nodeLinkChangeHistories.length
      : undefined,
    isNodeMerge: isNodeMergeChangeHistory(history.description),
    ...(params.includeDetails
      ? {
          nodeLinkChangeHistories: history.nodeLinkChangeHistories.map(
            (row) => ({
              id: row.id,
              changeType: row.changeType,
              changeEntityType: row.changeEntityType,
              changeEntityId: row.changeEntityId,
              previousState: row.previousState,
              nextState: row.nextState,
            }),
          ),
          parsedMerge: parseNodeMergeFromChangeHistory(history),
          parsedMerges: parseNodeMergeOperationsFromChangeHistory(history),
        }
      : {}),
  }));
}

async function findActiveTopicSpaceNodeByIdentity(
  db: PrismaClient,
  topicSpaceId: string,
  identity: { name: string; label: string },
) {
  const matches = await db.graphNode.findMany({
    where: {
      topicSpaceId,
      deletedAt: null,
      name: identity.name,
      label: identity.label,
    },
  });

  if (matches.length !== 1) {
    return { node: null, reason: `一致ノードが ${matches.length} 件` };
  }

  return { node: matches[0]!, reason: undefined };
}

async function resolveMergeParticipants(
  db: PrismaClient,
  topicSpaceId: string,
  operation: ParsedNodeMergeOperation,
): Promise<
  | { nodesToMerge: NodeTypeForFrontend[] }
  | { error: string }
> {
  const canonicalRecord = await db.graphNode.findUnique({
    where: { id: operation.canonicalOldNodeId },
  });

  if (!canonicalRecord) {
    return { error: "代表ノードの履歴 ID が DB 上に見つかりません" };
  }

  const canonicalLookup = await findActiveTopicSpaceNodeByIdentity(
    db,
    topicSpaceId,
    {
      name: canonicalRecord.name,
      label: canonicalRecord.label,
    },
  );
  if (!canonicalLookup.node) {
    return {
      error: `代表ノード「${canonicalRecord.name}」(${canonicalRecord.label}): ${canonicalLookup.reason}`,
    };
  }

  const duplicateNodes: NodeTypeForFrontend[] = [];
  for (const removed of operation.removedNodeSnapshots) {
    const lookup = await findActiveTopicSpaceNodeByIdentity(db, topicSpaceId, {
      name: removed.name,
      label: removed.label,
    });
    if (!lookup.node) {
      return {
        error: `統合対象「${removed.name}」(${removed.label}): ${lookup.reason}`,
      };
    }
    if (lookup.node.id === canonicalLookup.node.id) {
      continue;
    }
    duplicateNodes.push(formNodeDataForFrontend(lookup.node));
  }

  if (duplicateNodes.length === 0) {
    return { error: "統合対象が既に代表ノードに含まれています" };
  }

  return {
    nodesToMerge: [
      formNodeDataForFrontend(canonicalLookup.node),
      ...duplicateNodes,
    ],
  };
}

export async function replayNodeMergesFromHistory(
  db: PrismaClient,
  params: {
    topicSpaceId: string;
    userId: string;
    before?: Date;
    after?: Date;
    dryRun?: boolean;
    changeHistoryIds?: string[];
  },
) {
  await findTopicSpaceWithGraphAndAssertAdmin(
    db,
    params.topicSpaceId,
    params.userId,
  );

  const histories = await db.graphChangeHistory.findMany({
    where: {
      recordId: params.topicSpaceId,
      recordType: GraphChangeRecordType.TOPIC_SPACE,
      ...(params.changeHistoryIds?.length
        ? { id: { in: params.changeHistoryIds } }
        : {}),
      ...(params.before ? { createdAt: { lt: params.before } } : {}),
      ...(params.after ? { createdAt: { gt: params.after } } : {}),
    },
    include: { nodeLinkChangeHistories: true },
    orderBy: { createdAt: "asc" },
  });

  const mergeHistories = histories.filter(
    (history) => parseNodeMergeOperationsFromChangeHistory(history).length > 0,
  );

  const results: ReplayNodeMergeResult[] = [];

  for (const history of mergeHistories) {
    const operations = parseNodeMergeOperationsFromChangeHistory(history);
    for (const operation of operations) {
      const resolved = await resolveMergeParticipants(
        db,
        params.topicSpaceId,
        operation,
      );

      if ("error" in resolved) {
        results.push({
          changeHistoryId: history.id,
          status: "skipped",
          reason: resolved.error,
        });
        continue;
      }

      const canonical = resolved.nodesToMerge[0]!;
      const mergedIds = resolved.nodesToMerge.slice(1).map((node) => node.id);

      if (params.dryRun) {
        results.push({
          changeHistoryId: history.id,
          status: "applied",
          reason: "dryRun: 統合可能",
          canonicalNode: {
            id: canonical.id,
            name: canonical.name,
            label: canonical.label,
          },
          mergedNodeIds: mergedIds,
        });
        continue;
      }

      try {
        await mergeGraphNodes(db, {
          topicSpaceId: params.topicSpaceId,
          userId: params.userId,
          nodesToMerge: resolved.nodesToMerge,
        });

        results.push({
          changeHistoryId: history.id,
          status: "applied",
          canonicalNode: {
            id: canonical.id,
            name: canonical.name,
            label: canonical.label,
          },
          mergedNodeIds: mergedIds,
        });
      } catch (error) {
        results.push({
          changeHistoryId: history.id,
          status: "failed",
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  const applied = results.filter((row) => row.status === "applied").length;
  const skipped = results.filter((row) => row.status === "skipped").length;
  const failed = results.filter((row) => row.status === "failed").length;

  return {
    topicSpaceId: params.topicSpaceId,
    dryRun: params.dryRun ?? false,
    totalMergeHistories: mergeHistories.length,
    totalOperations: results.length,
    applied,
    skipped,
    failed,
    results,
    message: params.dryRun
      ? `${mergeHistories.length} 件の統合履歴を解析しました（dryRun）`
      : `統合を ${applied} 件適用、${skipped} 件スキップ、${failed} 件失敗`,
  };
}

export async function getTopicSpaceChangeHistoryById(
  db: PrismaClient,
  params: {
    changeHistoryId: string;
    userId: string;
  },
) {
  const history = await db.graphChangeHistory.findFirst({
    where: {
      id: params.changeHistoryId,
      recordType: GraphChangeRecordType.TOPIC_SPACE,
    },
    include: {
      user: { select: { id: true, name: true } },
      nodeLinkChangeHistories: true,
    },
  });

  if (!history) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "変更履歴が見つかりません",
    });
  }

  await findTopicSpaceWithGraphAndAssertAdmin(
    db,
    history.recordId,
    params.userId,
  );

  return {
    id: history.id,
    topicSpaceId: history.recordId,
    description: history.description,
    createdAt: history.createdAt.toISOString(),
    userId: history.userId,
    userName: history.user.name,
    isNodeMerge: isNodeMergeChangeHistory(history.description),
    parsedMerge: parseNodeMergeFromChangeHistory(history),
    parsedMerges: parseNodeMergeOperationsFromChangeHistory(history),
    nodeLinkChangeHistories: history.nodeLinkChangeHistories.map((row) => ({
      id: row.id,
      changeType: row.changeType,
      changeEntityType: row.changeEntityType,
      changeEntityId: row.changeEntityId,
      previousState: row.previousState,
      nextState: row.nextState,
    })),
  };
}
