import type { ClusterStrategySection, MetaGraphGraphDoc } from "./types";

/** セクション index ごとのシードノード ID（entityNames とノード名の完全一致） */
export function buildSectionSeedNodeIds(
  graphDocument: MetaGraphGraphDoc,
  sections: ClusterStrategySection[],
): Array<Set<string>> {
  const nameToNode = new Map(graphDocument.nodes.map((n) => [n.name, n]));
  const sectionSeedIds = sections.map(() => new Set<string>());
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]!;
    const seedSet = sectionSeedIds[i]!;
    for (const name of section.entityNames) {
      const node = nameToNode.get(name);
      if (node) seedSet.add(node.id);
    }
  }
  return sectionSeedIds;
}
