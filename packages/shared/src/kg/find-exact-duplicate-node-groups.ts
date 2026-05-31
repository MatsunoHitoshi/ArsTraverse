export type ExactDuplicateNodeRef = {
  id: string;
  name: string;
  label: string;
};

export type ExactDuplicateNodeGroup = {
  groupKey: string;
  name: string;
  label: string;
  nodeCount: number;
  nodes: ExactDuplicateNodeRef[];
};

/**
 * name (+ label) が完全一致するノードをグループ化する。
 * data-disambiguation の simpleMerge と同じ基準（name + label）。
 */
export function findExactDuplicateNodeGroups(
  nodes: ExactDuplicateNodeRef[],
  options?: {
    requireSameLabel?: boolean;
    minGroupSize?: number;
  },
): ExactDuplicateNodeGroup[] {
  const requireSameLabel = options?.requireSameLabel ?? true;
  const minGroupSize = options?.minGroupSize ?? 2;

  const groups = new Map<string, ExactDuplicateNodeRef[]>();

  for (const node of nodes) {
    const key = requireSameLabel
      ? `${node.name}\0${node.label}`
      : node.name;

    const existing = groups.get(key);
    if (existing) {
      existing.push(node);
    } else {
      groups.set(key, [node]);
    }
  }

  return Array.from(groups.entries())
    .filter(([, members]) => members.length >= minGroupSize)
    .map(([groupKey, members]) => ({
      groupKey,
      name: members[0]!.name,
      label: members[0]!.label,
      nodeCount: members.length,
      nodes: members,
    }))
    .sort((a, b) => b.nodeCount - a.nodeCount);
}
