import {
  GraphChangeEntityType,
  GraphChangeType,
} from "@prisma/client";

const MERGE_DESCRIPTION = "ノードを統合しました";

export function isNodeMergeChangeHistory(description: string | null): boolean {
  if (description === MERGE_DESCRIPTION) {
    return true;
  }
  // GraphEditProposal のマージ（ノード統合を含む変更提案）
  if (description?.includes("変更提案") && description.includes("をマージしました")) {
    return true;
  }
  return false;
}

type NodeSnapshot = {
  id?: string;
  name?: string;
  label?: string;
};

type RelationshipSnapshot = {
  sourceId?: string;
  targetId?: string;
  fromNodeId?: string;
  toNodeId?: string;
};

export type ParsedNodeMergeOperation = {
  changeHistoryId: string;
  createdAt: Date;
  description: string;
  canonicalOldNodeId: string;
  removedNodeSnapshots: Array<{
    oldId: string;
    name: string;
    label: string;
  }>;
};

function asNodeSnapshot(value: unknown): NodeSnapshot {
  if (!value || typeof value !== "object") return {};
  return value as NodeSnapshot;
}

function asRelationshipSnapshot(value: unknown): RelationshipSnapshot {
  if (!value || typeof value !== "object") return {};
  return value as RelationshipSnapshot;
}

function relationshipEndpoint(
  snapshot: RelationshipSnapshot,
  side: "source" | "target",
): string | undefined {
  if (side === "source") {
    return snapshot.sourceId ?? snapshot.fromNodeId;
  }
  return snapshot.targetId ?? snapshot.toNodeId;
}

/**
 * applyTopicSpaceGraphDiff（mergeGraphNodes）または変更提案マージで記録された統合履歴から、
 * 代表ノード ID と統合されたノードのスナップショットを復元する。
 * 1 件の履歴に複数統合が含まれる場合は複数件返す。
 */
export function parseNodeMergeOperationsFromChangeHistory(history: {
  id: string;
  createdAt: Date;
  description: string | null;
  nodeLinkChangeHistories: Array<{
    changeType: GraphChangeType;
    changeEntityType: GraphChangeEntityType;
    previousState: unknown;
    nextState: unknown;
  }>;
}): ParsedNodeMergeOperation[] {
  if (!isNodeMergeChangeHistory(history.description)) {
    return [];
  }

  const removedNodeSnapshots = history.nodeLinkChangeHistories
    .filter(
      (row) =>
        row.changeEntityType === GraphChangeEntityType.NODE &&
        row.changeType === GraphChangeType.REMOVE,
    )
    .map((row) => {
      const snapshot = asNodeSnapshot(row.previousState);
      if (!snapshot.id || !snapshot.name || !snapshot.label) {
        return null;
      }
      return {
        oldId: snapshot.id,
        name: snapshot.name,
        label: snapshot.label,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (removedNodeSnapshots.length === 0) {
    return [];
  }

  const removedIds = new Set(removedNodeSnapshots.map((row) => row.oldId));
  // エッジ UPDATE から代表ノードを推定する。接続エッジのない統合は復元できない。
  const canonicalByRemovedId = new Map<string, string>();

  for (const row of history.nodeLinkChangeHistories) {
    if (
      row.changeEntityType !== GraphChangeEntityType.EDGE ||
      row.changeType !== GraphChangeType.UPDATE
    ) {
      continue;
    }

    const previous = asRelationshipSnapshot(row.previousState);
    const next = asRelationshipSnapshot(row.nextState);

    for (const side of ["source", "target"] as const) {
      const prevId = relationshipEndpoint(previous, side);
      const nextId = relationshipEndpoint(next, side);
      if (!prevId || !nextId || prevId === nextId) continue;
      if (removedIds.has(prevId) && !removedIds.has(nextId)) {
        canonicalByRemovedId.set(prevId, nextId);
      }
      if (removedIds.has(nextId) && !removedIds.has(prevId)) {
        canonicalByRemovedId.set(nextId, prevId);
      }
    }
  }

  const grouped = new Map<
    string,
    ParsedNodeMergeOperation["removedNodeSnapshots"]
  >();

  for (const removed of removedNodeSnapshots) {
    const canonicalOldNodeId = canonicalByRemovedId.get(removed.oldId);
    if (!canonicalOldNodeId) continue;
    const bucket = grouped.get(canonicalOldNodeId) ?? [];
    bucket.push(removed);
    grouped.set(canonicalOldNodeId, bucket);
  }

  return Array.from(grouped.entries()).map(
    ([canonicalOldNodeId, removedSnapshots]) => ({
      changeHistoryId: history.id,
      createdAt: history.createdAt,
      description: history.description ?? MERGE_DESCRIPTION,
      canonicalOldNodeId,
      removedNodeSnapshots: removedSnapshots,
    }),
  );
}

/** 後方互換: 最初の 1 統合のみ */
export function parseNodeMergeFromChangeHistory(history: {
  id: string;
  createdAt: Date;
  description: string | null;
  nodeLinkChangeHistories: Array<{
    changeType: GraphChangeType;
    changeEntityType: GraphChangeEntityType;
    previousState: unknown;
    nextState: unknown;
  }>;
}): ParsedNodeMergeOperation | null {
  return parseNodeMergeOperationsFromChangeHistory(history)[0] ?? null;
}
