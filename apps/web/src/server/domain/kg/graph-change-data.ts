import { GraphChangeType } from "@prisma/client";
import type {
  GraphEditChangeForFrontend,
  NodeTypeForFrontend,
  PropertyTypeForFrontend,
  RelationshipTypeForFrontend,
} from "@/app/const/types";
import { diffNodes, diffRelationships } from "@/app/_utils/kg/diff";
import { formGraphDataForFrontend } from "@/app/_utils/kg/frontend-properties";
import type {
  NodeDiffType,
  RelationshipDiffType,
} from "@/app/_utils/kg/get-nodes-and-relationships-from-result";
import { GraphChangeEntityType } from "@prisma/client";
import type { GraphChangeData } from "./types";

export type { GraphChangeData } from "./types";

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

  return graphChangeDataFromDiffs(nodeDiffs, relationshipDiffs);
}

export function graphChangeDataFromDiffs(
  nodeDiffs: NodeDiffType[],
  relationshipDiffs: RelationshipDiffType[],
): GraphChangeData {
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
    .filter((node): node is NodeTypeForFrontend => node !== null)
    .map((node) => ({ id: node.id }));

  const relationshipDeleteData = relationshipDiffs
    .filter((diff) => diff.type === GraphChangeType.REMOVE)
    .map((diff) => diff.original)
    .filter(
      (relationship): relationship is RelationshipTypeForFrontend =>
        relationship !== null,
    )
    .map((relationship) => ({ id: relationship.id }));

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
