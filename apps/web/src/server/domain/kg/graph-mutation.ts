import type { Prisma, PrismaClient } from "@prisma/client";
import { sanitizeNodeImageProperties } from "@/server/lib/sanitize-node-image-properties";
import type { GraphScope } from "./graph-scope";
import {
  clearNodeScopeFields,
  clearRelationshipScopeFields,
  nodeCreateScopeFields,
  nodeScopeFilter,
  relationshipScopeFilter,
  topicSpaceScope,
} from "./graph-scope";
import type { GraphChangeData } from "./types";

function isPrismaClient(
  db: PrismaClient | Prisma.TransactionClient,
): db is PrismaClient {
  return typeof (db as PrismaClient).$transaction === "function";
}

export async function applyScopedGraphChanges(
  tx: Prisma.TransactionClient,
  scope: GraphScope,
  changeData: GraphChangeData,
): Promise<void> {
  const nodeScope = nodeScopeFilter(scope);
  const relationshipScope = relationshipScopeFilter(scope);
  const createScope = nodeCreateScopeFields(scope);

  if (changeData.nodeCreateData.length > 0) {
    await tx.graphNode.createMany({
      data: changeData.nodeCreateData.map((node) => ({
        id: node.id,
        name: node.name,
        label: node.label,
        properties: sanitizeNodeImageProperties(
          node.properties as Record<string, unknown>,
        ),
        ...createScope,
      })),
      skipDuplicates: true,
    });
  }

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
          topicSpaceId: createScope.topicSpaceId,
          documentGraphId: createScope.documentGraphId,
        })),
        skipDuplicates: true,
      });
    }
  }

  for (const node of changeData.nodeUpdateData) {
    const sanitized = sanitizeNodeImageProperties(
      node.properties as Record<string, unknown>,
    );
    await tx.graphNode.updateMany({
      where: { id: node.id, ...nodeScope },
      data: {
        name: node.name,
        properties: sanitized,
        label: node.label,
        ...nodeScope,
      },
    });
  }

  for (const relationship of changeData.relationshipUpdateData) {
    await tx.graphRelationship.updateMany({
      where: { id: relationship.id, ...relationshipScope },
      data: {
        type: relationship.type,
        properties: relationship.properties,
        fromNodeId: relationship.sourceId,
        toNodeId: relationship.targetId,
        ...relationshipScope,
      },
    });
  }

  const nodeDeleteIds = changeData.nodeDeleteData.map((node) => node.id);
  const explicitRelationshipDeleteIds = changeData.relationshipDeleteData.map(
    (relationship) => relationship.id,
  );

  const relationshipIdsToDelete = new Set(explicitRelationshipDeleteIds);

  if (nodeDeleteIds.length > 0) {
    const incidentEdges = await tx.graphRelationship.findMany({
      where: {
        ...relationshipScope,
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
        ...relationshipScope,
      },
      data: clearRelationshipScopeFields(),
    });
  }

  if (nodeDeleteIds.length > 0) {
    await tx.graphNode.updateMany({
      where: {
        id: { in: nodeDeleteIds },
        ...nodeScope,
      },
      data: clearNodeScopeFields(),
    });
  }
}

export async function applyGraphChanges(
  db: PrismaClient | Prisma.TransactionClient,
  topicSpaceId: string,
  changeData: GraphChangeData,
): Promise<void> {
  return applyScopedGraphChangesToDb(
    db,
    topicSpaceScope(topicSpaceId),
    changeData,
  );
}

export async function applyScopedGraphChangesToDb(
  db: PrismaClient | Prisma.TransactionClient,
  scope: GraphScope,
  changeData: GraphChangeData,
): Promise<void> {
  if (isPrismaClient(db)) {
    await db.$transaction(
      async (tx) => {
        await applyScopedGraphChanges(tx, scope, changeData);
      },
      { timeout: 30000 },
    );
    return;
  }

  await applyScopedGraphChanges(db, scope, changeData);
}
