import type { Prisma, PrismaClient } from "@prisma/client";
import {
  GraphChangeEntityType,
  GraphChangeRecordType,
  GraphChangeType,
} from "@prisma/client";
import type {
  GraphEditChangeForFrontend,
  NodeTypeForFrontend,
  PropertyTypeForFrontend,
  RelationshipTypeForFrontend,
} from "@/app/const/types";
import { diffNodes, diffRelationships } from "@/app/_utils/kg/diff";
import { sanitizeNodeImageProperties } from "@/server/lib/sanitize-node-image-properties";
import { formGraphDataForFrontend } from "@/app/_utils/kg/frontend-properties";
import type {
  NodeDiffType,
  RelationshipDiffType,
} from "@/app/_utils/kg/get-nodes-and-relationships-from-result";

// グラフ変更データの型定義
export interface GraphChangeData {
  nodeCreateData: NodeTypeForFrontend[];
  nodeUpdateData: NodeTypeForFrontend[];
  nodeDeleteData: { id: string }[];
  relationshipCreateData: RelationshipTypeForFrontend[];
  relationshipUpdateData: RelationshipTypeForFrontend[];
  relationshipDeleteData: { id: string }[];
}

function isPrismaClient(
  db: PrismaClient | Prisma.TransactionClient,
): db is PrismaClient {
  return typeof (db as PrismaClient).$transaction === "function";
}

async function applyGraphChangesInTransaction(
  tx: Prisma.TransactionClient,
  topicSpaceId: string,
  changeData: GraphChangeData,
): Promise<void> {
  // ノードの作成
  if (changeData.nodeCreateData.length > 0) {
    await tx.graphNode.createMany({
      data: changeData.nodeCreateData.map((node) => ({
        id: node.id,
        name: node.name,
        label: node.label,
        properties: sanitizeNodeImageProperties(
          node.properties as Record<string, unknown>,
        ),
        topicSpaceId: topicSpaceId,
      })),
      skipDuplicates: true,
    });
  }

  // リレーションシップの作成
  if (changeData.relationshipCreateData.length > 0) {
    const relationshipsToCreate = changeData.relationshipCreateData.filter(
      (relationship) => relationship.sourceId && relationship.targetId,
    );
    if (relationshipsToCreate.length > 0) {
      await tx.graphRelationship.createMany({
        data: relationshipsToCreate.map((relationship) => ({
          id: relationship.id,
          type: relationship.type,
          properties: relationship.properties,
          fromNodeId: relationship.sourceId,
          toNodeId: relationship.targetId,
          topicSpaceId: topicSpaceId,
        })),
        skipDuplicates: true,
      });
    }
  }

  // ノードの更新
  for (const node of changeData.nodeUpdateData) {
    const sanitized = sanitizeNodeImageProperties(
      node.properties as Record<string, unknown>,
    );
    await tx.graphNode.updateMany({
      where: { id: node.id, topicSpaceId: topicSpaceId },
      data: {
        name: node.name,
        properties: sanitized,
        label: node.label,
        topicSpaceId: topicSpaceId,
      },
    });
  }

  // リレーションシップの更新
  for (const relationship of changeData.relationshipUpdateData) {
    await tx.graphRelationship.updateMany({
      where: { id: relationship.id, topicSpaceId: topicSpaceId },
      data: {
        type: relationship.type,
        properties: relationship.properties,
        fromNodeId: relationship.sourceId,
        toNodeId: relationship.targetId,
        topicSpaceId: topicSpaceId,
      },
    });
  }

  const nodeDeleteIds = changeData.nodeDeleteData.map((node) => node.id);
  const explicitRelationshipDeleteIds = changeData.relationshipDeleteData.map(
    (relationship) => relationship.id,
  );

  // エッジを先に論理削除（ノード削除に伴うインシデントエッジも含む）
  const relationshipIdsToDelete = new Set(explicitRelationshipDeleteIds);

  if (nodeDeleteIds.length > 0) {
    const incidentEdges = await tx.graphRelationship.findMany({
      where: {
        topicSpaceId: topicSpaceId,
        deletedAt: null,
        OR: [
          { fromNodeId: { in: nodeDeleteIds } },
          { toNodeId: { in: nodeDeleteIds } },
        ],
      },
      select: { id: true },
    });
    for (const edge of incidentEdges) {
      relationshipIdsToDelete.add(edge.id);
    }
  }

  if (relationshipIdsToDelete.size > 0) {
    await tx.graphRelationship.updateMany({
      where: {
        id: { in: Array.from(relationshipIdsToDelete) },
        topicSpaceId: topicSpaceId,
      },
      data: {
        topicSpaceId: null,
        deletedAt: new Date(),
      },
    });
  }

  // ノードの論理削除
  if (nodeDeleteIds.length > 0) {
    await tx.graphNode.updateMany({
      where: {
        id: { in: nodeDeleteIds },
        topicSpaceId: topicSpaceId,
      },
      data: {
        topicSpaceId: null,
        deletedAt: new Date(),
      },
    });
  }
}

// グラフ変更を適用する関数（TransactionClient を渡すとそのトランザクション内で実行）
export async function applyGraphChanges(
  db: PrismaClient | Prisma.TransactionClient,
  topicSpaceId: string,
  changeData: GraphChangeData,
): Promise<void> {
  if (isPrismaClient(db)) {
    await db.$transaction(
      async (tx) => {
        await applyGraphChangesInTransaction(tx, topicSpaceId, changeData);
      },
      { timeout: 30000 },
    );
    return;
  }

  await applyGraphChangesInTransaction(db, topicSpaceId, changeData);
}

// グラフデータから変更データを生成する関数
export function generateGraphChangeData(
  prevNodes: NodeTypeForFrontend[],
  prevRelationships: RelationshipTypeForFrontend[],
  newNodes: NodeTypeForFrontend[],
  newRelationships: RelationshipTypeForFrontend[],
): GraphChangeData {
  const prevGraphData = formGraphDataForFrontend({
    nodes: prevNodes.map((node) => ({
      ...node,
      documentGraphId: null,
      topicSpaceId: null,
      createdAt: null,
      updatedAt: null,
      deletedAt: null,
    })),
    relationships: prevRelationships.map((rel) => ({
      ...rel,
      documentGraphId: null,
      topicSpaceId: null,
      createdAt: null,
      updatedAt: null,
      deletedAt: null,
      fromNodeId: rel.sourceId,
      toNodeId: rel.targetId,
    })),
  });

  const sanitizedGraphData = {
    nodes: newNodes,
    relationships: newRelationships,
  };

  const nodeDiffs = diffNodes(prevGraphData.nodes, sanitizedGraphData.nodes);
  const relationshipDiffs = diffRelationships(
    prevGraphData.relationships,
    sanitizedGraphData.relationships,
  );

  const nodeCreateData = nodeDiffs
    .filter((diff) => diff.type === GraphChangeType.ADD)
    .map((diff) => diff.updated)
    .filter((node): node is NodeTypeForFrontend => node !== null);

  const relationshipCreateData = relationshipDiffs
    .filter((diff) => diff.type === GraphChangeType.ADD)
    .map((diff) => diff.updated)
    .filter(
      (relationship): relationship is RelationshipTypeForFrontend =>
        relationship !== null,
    );

  const nodeDeleteData = nodeDiffs
    .filter((diff) => diff.type === GraphChangeType.REMOVE)
    .map((diff) => diff.original)
    .filter((node): node is NodeTypeForFrontend => node !== null);

  const relationshipDeleteData = relationshipDiffs
    .filter((diff) => diff.type === GraphChangeType.REMOVE)
    .map((diff) => diff.original)
    .filter(
      (relationship): relationship is RelationshipTypeForFrontend =>
        relationship !== null,
    );

  const nodeUpdateData = nodeDiffs
    .filter((diff) => diff.type === GraphChangeType.UPDATE)
    .map((diff) => diff.updated)
    .filter((node): node is NodeTypeForFrontend => node !== null);

  const relationshipUpdateData = relationshipDiffs
    .filter((diff) => diff.type === GraphChangeType.UPDATE)
    .map((diff) => diff.updated)
    .filter(
      (relationship): relationship is RelationshipTypeForFrontend =>
        relationship !== null,
    );

  return {
    nodeCreateData,
    nodeUpdateData,
    nodeDeleteData,
    relationshipCreateData,
    relationshipUpdateData,
    relationshipDeleteData,
  };
}

// 変更履歴を記録する関数
export async function recordGraphChangeHistory(
  db: PrismaClient | Prisma.TransactionClient,
  recordId: string,
  description: string,
  userId: string,
  nodeDiffs: NodeDiffType[],
  relationshipDiffs: RelationshipDiffType[],
) {
  const graphChangeHistory = await db.graphChangeHistory.create({
    data: {
      recordType: GraphChangeRecordType.TOPIC_SPACE,
      recordId: recordId,
      description: description,
      user: { connect: { id: userId } },
    },
  });

  await db.nodeLinkChangeHistory.createMany({
    data: nodeDiffs.map((diff) => ({
      changeType: diff.type,
      changeEntityType: GraphChangeEntityType.NODE,
      changeEntityId: String(diff.original?.id ?? diff.updated?.id),
      previousState: diff.original ?? {},
      nextState: diff.updated ?? {},
      graphChangeHistoryId: graphChangeHistory.id,
    })),
  });

  await db.nodeLinkChangeHistory.createMany({
    data: relationshipDiffs.map((diff) => ({
      changeType: diff.type,
      changeEntityType: GraphChangeEntityType.EDGE,
      changeEntityId: String(diff.original?.id ?? diff.updated?.id),
      previousState: diff.original ?? {},
      nextState: diff.updated ?? {},
      graphChangeHistoryId: graphChangeHistory.id,
    })),
  });

  return graphChangeHistory;
}

// プロポーザル変更から変更データを生成する関数
export function generateProposalChangeData(
  changes: GraphEditChangeForFrontend[],
  _topicSpaceId: string,
): GraphChangeData {
  const nodeCreateData: NodeTypeForFrontend[] = [];
  const nodeUpdateData: NodeTypeForFrontend[] = [];
  const nodeDeleteIds: string[] = [];
  const relationshipCreateData: RelationshipTypeForFrontend[] = [];
  const relationshipUpdateData: RelationshipTypeForFrontend[] = [];
  const relationshipDeleteIds: string[] = [];

  for (const change of changes) {
    if (change.changeEntityType === GraphChangeEntityType.NODE) {
      if (change.changeType === GraphChangeType.ADD) {
        const nextState = change.nextState;
        nodeCreateData.push({
          id: change.changeEntityId,
          name: String(nextState.name ?? ""),
          label: String(nextState.label ?? ""),
          properties: (nextState.properties as PropertyTypeForFrontend) ?? {},
        });
      } else if (change.changeType === GraphChangeType.UPDATE) {
        const nextState = change.nextState;
        nodeUpdateData.push({
          id: change.changeEntityId,
          name: String(nextState.name),
          label: String(nextState.label),
          properties: (nextState.properties as PropertyTypeForFrontend) ?? {},
        });
      } else if (change.changeType === GraphChangeType.REMOVE) {
        nodeDeleteIds.push(change.changeEntityId);
      }
    } else if (change.changeEntityType === GraphChangeEntityType.EDGE) {
      if (change.changeType === GraphChangeType.ADD) {
        const nextState = change.nextState;
        relationshipCreateData.push({
          id: change.changeEntityId,
          type: String(nextState.type ?? ""),
          properties: (nextState.properties as PropertyTypeForFrontend) ?? {},
          sourceId: String(nextState.sourceId ?? ""),
          targetId: String(nextState.targetId ?? ""),
        });
      } else if (change.changeType === GraphChangeType.UPDATE) {
        const nextState = change.nextState;
        relationshipUpdateData.push({
          id: change.changeEntityId,
          type: String(nextState.type),
          properties: (nextState.properties as PropertyTypeForFrontend) ?? {},
          sourceId: String(nextState.sourceId),
          targetId: String(nextState.targetId),
        });
      } else if (change.changeType === GraphChangeType.REMOVE) {
        relationshipDeleteIds.push(change.changeEntityId);
      }
    }
  }

  // DELETE用のダミーデータを生成
  const nodeDeleteData = nodeDeleteIds.map((id) => ({ id }));
  const relationshipDeleteData = relationshipDeleteIds.map((id) => ({ id }));

  return {
    nodeCreateData,
    nodeUpdateData,
    nodeDeleteData,
    relationshipCreateData,
    relationshipUpdateData,
    relationshipDeleteData,
  };
}
