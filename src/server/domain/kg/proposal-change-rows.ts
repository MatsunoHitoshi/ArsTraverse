import { GraphChangeEntityType } from "@prisma/client";
import type {
  NodeDiffType,
  RelationshipDiffType,
} from "@/app/_utils/kg/get-nodes-and-relationships-from-result";

export type GraphEditChangeRow = {
  changeType: NodeDiffType["type"];
  changeEntityType:
    | typeof GraphChangeEntityType.NODE
    | typeof GraphChangeEntityType.EDGE;
  changeEntityId: string;
  previousState: object;
  nextState: object;
};

export function buildGraphEditChangeRows(
  nodeDiffs: NodeDiffType[],
  relationshipDiffs: RelationshipDiffType[],
): GraphEditChangeRow[] {
  return [
    ...nodeDiffs.map((diff) => ({
      changeType: diff.type,
      changeEntityType: GraphChangeEntityType.NODE,
      changeEntityId: String(diff.original?.id ?? diff.updated?.id),
      previousState: diff.original ?? {},
      nextState: diff.updated ?? {},
    })),
    ...relationshipDiffs.map((diff) => ({
      changeType: diff.type,
      changeEntityType: GraphChangeEntityType.EDGE,
      changeEntityId: String(diff.original?.id ?? diff.updated?.id),
      previousState: diff.original ?? {},
      nextState: diff.updated ?? {},
    })),
  ];
}
