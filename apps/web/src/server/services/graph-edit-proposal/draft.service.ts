import type { PrismaClient } from "@prisma/client";
import {
  GraphChangeEntityType,
  GraphChangeType,
  type GraphEditChange,
} from "@prisma/client";
import { diffNodes, diffRelationships } from "@/app/_utils/kg/diff";
import { buildGraphEditChangeRows } from "@/server/domain/kg/proposal-change-rows";
import { replaceProposalChanges } from "@/server/repositories/graph-edit-proposal-changes.repository";
import type {
  NodeTypeForFrontend,
  RelationshipTypeForFrontend,
} from "@/app/const/types";

export type DraftGraphData = {
  nodes: NodeTypeForFrontend[];
  relationships: RelationshipTypeForFrontend[];
};

export function normalizePropertiesToStringRecord(
  properties: unknown,
): Record<string, string> {
  if (
    properties === null ||
    properties === undefined ||
    typeof properties !== "object" ||
    Array.isArray(properties)
  ) {
    return {};
  }
  const obj = properties as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = String(v);
  }
  return out;
}

export function normalizeNodeForDiff(
  node: NodeTypeForFrontend,
): NodeTypeForFrontend {
  return {
    ...node,
    name: String(node.name ?? ""),
    label: String(node.label ?? ""),
    properties: normalizePropertiesToStringRecord(node.properties),
  };
}

export function normalizeRelationshipForDiff(
  relationship: RelationshipTypeForFrontend,
): RelationshipTypeForFrontend {
  return {
    ...relationship,
    type: String(relationship.type ?? ""),
    properties: normalizePropertiesToStringRecord(relationship.properties),
    sourceId: String(relationship.sourceId ?? ""),
    targetId: String(relationship.targetId ?? ""),
  };
}

export function normalizeGraphDataForDiff(
  graphData: DraftGraphData,
): DraftGraphData {
  return {
    nodes: graphData.nodes.map(normalizeNodeForDiff),
    relationships: graphData.relationships.map(normalizeRelationshipForDiff),
  };
}

export function parseNodeFromChangeState(
  state: unknown,
  fallbackId: string,
): NodeTypeForFrontend {
  type NodeChangeState = {
    id?: unknown;
    name?: unknown;
    label?: unknown;
    properties?: unknown;
  };

  const obj =
    typeof state === "object" && state !== null && !Array.isArray(state)
      ? (state as NodeChangeState)
      : null;

  const id = String(obj?.id ?? fallbackId);
  return {
    id,
    name: String(obj?.name ?? ""),
    label: String(obj?.label ?? ""),
    properties: normalizePropertiesToStringRecord(obj?.properties ?? {}),
  };
}

export function parseRelationshipFromChangeState(
  state: unknown,
  fallbackId: string,
): RelationshipTypeForFrontend {
  type RelationshipChangeState = {
    id?: unknown;
    type?: unknown;
    properties?: unknown;
    sourceId?: unknown;
    targetId?: unknown;
  };

  const obj =
    typeof state === "object" && state !== null && !Array.isArray(state)
      ? (state as RelationshipChangeState)
      : null;

  const id = String(obj?.id ?? fallbackId);
  return {
    id,
    type: String(obj?.type ?? ""),
    properties: normalizePropertiesToStringRecord(obj?.properties ?? {}),
    sourceId: String(obj?.sourceId ?? ""),
    targetId: String(obj?.targetId ?? ""),
  };
}

/**
 * proposal.changes をベースグラフに適用してドラフト状態を復元する。
 */
export function reconstructDraftGraphData(
  baseGraphData: DraftGraphData,
  changes: GraphEditChange[],
): DraftGraphData {
  const normalizedBase = normalizeGraphDataForDiff(baseGraphData);

  const nodeMap = new Map<string, NodeTypeForFrontend>(
    normalizedBase.nodes.map((n) => [n.id, n]),
  );
  const relationshipMap = new Map<string, RelationshipTypeForFrontend>(
    normalizedBase.relationships.map((r) => [r.id, r]),
  );

  for (const change of changes) {
    const entityId = String(change.changeEntityId);

    if (change.changeEntityType === GraphChangeEntityType.NODE) {
      if (change.changeType === GraphChangeType.REMOVE) {
        nodeMap.delete(entityId);
      } else if (
        change.changeType === GraphChangeType.ADD ||
        change.changeType === GraphChangeType.UPDATE
      ) {
        const nextNode = parseNodeFromChangeState(change.nextState, entityId);
        nodeMap.set(nextNode.id, nextNode);
      }
    } else if (change.changeEntityType === GraphChangeEntityType.EDGE) {
      if (change.changeType === GraphChangeType.REMOVE) {
        relationshipMap.delete(entityId);
      } else if (
        change.changeType === GraphChangeType.ADD ||
        change.changeType === GraphChangeType.UPDATE
      ) {
        const nextRel = parseRelationshipFromChangeState(
          change.nextState,
          entityId,
        );
        relationshipMap.set(nextRel.id, nextRel);
      }
    }
  }

  const nodeIds = new Set(nodeMap.keys());
  const draftRelationships = Array.from(relationshipMap.values()).filter(
    (r) => nodeIds.has(r.sourceId) && nodeIds.has(r.targetId),
  );

  return {
    nodes: Array.from(nodeMap.values()),
    relationships: draftRelationships,
  };
}

/**
 * ドラフトグラフとベースの差分を graphEditChange へ上書きする。
 */
export async function overwriteProposalChangesFromDraft(
  db: PrismaClient,
  proposalId: string,
  baseGraphData: DraftGraphData,
  draftGraphData: DraftGraphData,
) {
  const normalizedBase = normalizeGraphDataForDiff(baseGraphData);
  const normalizedDraft = normalizeGraphDataForDiff(draftGraphData);

  const nodeDiffs = diffNodes(normalizedBase.nodes, normalizedDraft.nodes);
  const relationshipDiffs = diffRelationships(
    normalizedBase.relationships,
    normalizedDraft.relationships,
  );

  const changeRows = buildGraphEditChangeRows(nodeDiffs, relationshipDiffs);

  const runReplace = async (
    client: Parameters<typeof replaceProposalChanges>[0],
  ) => {
    await replaceProposalChanges(client, proposalId, changeRows);
  };

  if ("$transaction" in db && typeof db.$transaction === "function") {
    await db.$transaction(async (tx) => runReplace(tx));
  } else {
    await runReplace(db);
  }
}
