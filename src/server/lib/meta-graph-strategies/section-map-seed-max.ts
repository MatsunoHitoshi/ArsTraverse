import type { ClusterStrategySection, MetaGraphGraphDoc } from "./types";
import { buildSectionSeedNodeIds } from "./section-seeds";

/**
 * 現行: 各数値クラスタを、セクションシード（entityNames→ノード名一致）との
 * 重なり数が最大の text-{i} に割当。重なりゼロは louvain-{idx}（数値ラベル昇順）。
 */
export function mapNumericClustersSeedMaxCount(
  graphDocument: MetaGraphGraphDoc,
  sections: ClusterStrategySection[],
  labelToNodeIds: Map<number, string[]>,
): Map<number, string> {
  const communityIdBySectionIndex = (i: number) => `text-${i}` as const;

  const sectionSeedIds = buildSectionSeedNodeIds(graphDocument, sections);

  const numericToSectionOrNonStory = new Map<number, string>();
  const nonStoryNumericLabels: number[] = [];
  for (const [num, nodeIds] of labelToNodeIds) {
    let bestSectionIndex: number | null = null;
    let bestCount = 0;
    for (let i = 0; i < sections.length; i++) {
      const seedSet = sectionSeedIds[i]!;
      const count = nodeIds.filter((id) => seedSet.has(id)).length;
      if (count > bestCount) {
        bestCount = count;
        bestSectionIndex = i;
      }
    }
    if (bestSectionIndex !== null && bestCount > 0) {
      numericToSectionOrNonStory.set(
        num,
        communityIdBySectionIndex(bestSectionIndex),
      );
    } else {
      nonStoryNumericLabels.push(num);
    }
  }
  nonStoryNumericLabels.sort((a, b) => a - b);
  nonStoryNumericLabels.forEach((num, idx) => {
    numericToSectionOrNonStory.set(num, `louvain-${idx}`);
  });

  return numericToSectionOrNonStory;
}
