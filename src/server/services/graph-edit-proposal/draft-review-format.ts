import { GraphChangeType } from "@prisma/client";
import type {
  NodeTypeForFrontend,
  RelationshipTypeForFrontend,
} from "@/app/const/types";
import type {
  NodeDiffType,
  RelationshipDiffType,
} from "@/app/_utils/kg/get-nodes-and-relationships-from-result";
import type { DraftGraphData } from "./draft.service";

function formatNodeSnapshot(node: NodeTypeForFrontend) {
  return {
    name: node.name,
    label: node.label,
    properties: node.properties,
  };
}

export function buildNodeNameMap(graphs: DraftGraphData[]): Map<string, string> {
  const nameById = new Map<string, string>();
  for (const graph of graphs) {
    for (const node of graph.nodes) {
      nameById.set(node.id, node.name);
    }
  }
  return nameById;
}

export function formatNodeDiffsForReview(nodeDiffs: NodeDiffType[]) {
  return nodeDiffs.map((diff) => ({
    changeType: diff.type,
    entityId: String(diff.original?.id ?? diff.updated?.id),
    before: diff.original ? formatNodeSnapshot(diff.original) : null,
    after: diff.updated ? formatNodeSnapshot(diff.updated) : null,
  }));
}

export function formatRelationshipDiffsForReview(
  relationshipDiffs: RelationshipDiffType[],
  nameById: Map<string, string>,
) {
  const resolveName = (id: string) => nameById.get(id) ?? `(unknown:${id})`;

  const formatEdgeSnapshot = (rel: RelationshipTypeForFrontend) => ({
    type: rel.type,
    sourceId: rel.sourceId,
    targetId: rel.targetId,
    sourceName: resolveName(rel.sourceId),
    targetName: resolveName(rel.targetId),
    properties: rel.properties,
  });

  return relationshipDiffs.map((diff) => ({
    changeType: diff.type,
    entityId: String(diff.original?.id ?? diff.updated?.id),
    before: diff.original ? formatEdgeSnapshot(diff.original) : null,
    after: diff.updated ? formatEdgeSnapshot(diff.updated) : null,
  }));
}

export function summarizeDiffCounts(
  nodeDiffs: NodeDiffType[],
  relationshipDiffs: RelationshipDiffType[],
) {
  const countByType = (diffs: Array<{ type: GraphChangeType }>) => ({
    added: diffs.filter((d) => d.type === GraphChangeType.ADD).length,
    updated: diffs.filter((d) => d.type === GraphChangeType.UPDATE).length,
    removed: diffs.filter((d) => d.type === GraphChangeType.REMOVE).length,
  });

  return {
    nodes: countByType(nodeDiffs),
    edges: countByType(relationshipDiffs),
    totalChanges: nodeDiffs.length + relationshipDiffs.length,
  };
}
