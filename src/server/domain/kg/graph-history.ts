import {
  GraphChangeEntityType,
  type GraphChangeType,
} from "@prisma/client";
import type {
  NodeDiffType,
  RelationshipDiffType,
} from "@/app/_utils/kg/get-nodes-and-relationships-from-result";

export type NodeLinkChangeHistoryRow = {
  changeType: GraphChangeType;
  changeEntityType: GraphChangeEntityType;
  changeEntityId: string;
  previousState: object;
  nextState: object;
  graphChangeHistoryId: string;
};

export function buildNodeLinkChangeHistoryRows(
  nodeDiffs: NodeDiffType[],
  relationshipDiffs: RelationshipDiffType[],
  graphChangeHistoryId: string,
): NodeLinkChangeHistoryRow[] {
  const nodeRows = nodeDiffs.map((diff) => ({
    changeType: diff.type,
    changeEntityType: GraphChangeEntityType.NODE,
    changeEntityId: String(diff.original?.id ?? diff.updated?.id),
    previousState: (diff.original ?? {}) as object,
    nextState: (diff.updated ?? {}) as object,
    graphChangeHistoryId,
  }));

  const relationshipRows = relationshipDiffs.map((diff) => ({
    changeType: diff.type,
    changeEntityType: GraphChangeEntityType.EDGE,
    changeEntityId: String(diff.original?.id ?? diff.updated?.id),
    previousState: (diff.original ?? {}) as object,
    nextState: (diff.updated ?? {}) as object,
    graphChangeHistoryId,
  }));

  return [...nodeRows, ...relationshipRows];
}
