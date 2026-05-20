export type EdgeRef = {
  id: string;
  type: string;
  sourceId: string;
  targetId: string;
};

export type DuplicateEdgeGroup = {
  groupKey: string;
  type: string;
  sourceId: string;
  targetId: string;
  edgeCount: number;
  edges: EdgeRef[];
};

function edgeGroupKey(rel: EdgeRef): string {
  return `${rel.sourceId}\0${rel.targetId}\0${rel.type}`;
}

/**
 * (sourceId, targetId, type) が同一のエッジをグループ化する。
 * プロパティの差異は考慮しない（data-disambiguation と同じ基準）。
 */
export function findDuplicateEdgeGroups(
  relationships: EdgeRef[],
  options?: { minGroupSize?: number },
): DuplicateEdgeGroup[] {
  const minGroupSize = options?.minGroupSize ?? 2;
  const groups = new Map<string, EdgeRef[]>();

  for (const rel of relationships) {
    const key = edgeGroupKey(rel);
    const existing = groups.get(key);
    if (existing) {
      existing.push(rel);
    } else {
      groups.set(key, [rel]);
    }
  }

  return Array.from(groups.entries())
    .filter(([, members]) => members.length >= minGroupSize)
    .map(([groupKey, members]) => ({
      groupKey,
      type: members[0]!.type,
      sourceId: members[0]!.sourceId,
      targetId: members[0]!.targetId,
      edgeCount: members.length,
      edges: members,
    }))
    .sort((a, b) => b.edgeCount - a.edgeCount);
}
