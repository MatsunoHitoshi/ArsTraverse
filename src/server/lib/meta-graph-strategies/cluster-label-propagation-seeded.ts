import type {
  ClusterStrategyContext,
  MetaGraphGraphDoc,
  TopologyClusterResult,
} from "./types";
import { buildSectionSeedNodeIds } from "./section-seeds";

function buildAdjacency(graphDocument: MetaGraphGraphDoc): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const n of graphDocument.nodes) adj.set(n.id, []);
  for (const rel of graphDocument.relationships) {
    adj.get(rel.sourceId)?.push(rel.targetId);
    adj.get(rel.targetId)?.push(rel.sourceId);
  }
  return adj;
}

/** 最頻ラベル。同率なら最小のラベル */
function majorityLabel(labels: number[]): number | null {
  const counts = new Map<number, number>();
  for (const L of labels) {
    if (L < 0) continue;
    counts.set(L, (counts.get(L) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  let bestL = -1;
  let bestC = -1;
  for (const [L, c] of counts) {
    if (c > bestC || (c === bestC && L < bestL)) {
      bestC = c;
      bestL = L;
    }
  }
  return bestL;
}

/**
 * セクションシードで初期化し、隣接ノードの多数決でラベルを伝播する（同期更新）。
 */
export function clusterLabelPropagationSeeded(
  graphDocument: MetaGraphGraphDoc,
  ctx: ClusterStrategyContext,
): TopologyClusterResult {
  const adj = buildAdjacency(graphDocument);
  const sectionSeedIds = buildSectionSeedNodeIds(graphDocument, ctx.sections);

  let labels = new Map<string, number>();
  for (const n of graphDocument.nodes) {
    let init = -1;
    for (let i = 0; i < ctx.sections.length; i++) {
      if (sectionSeedIds[i]!.has(n.id)) {
        init = init === -1 ? i : Math.min(init, i);
      }
    }
    labels.set(n.id, init);
  }

  const maxIter = ctx.labelPropagationIterations ?? 50;
  for (let t = 0; t < maxIter; t++) {
    const next = new Map(labels);
    let changed = false;
    for (const n of graphDocument.nodes) {
      const neigh = adj.get(n.id) ?? [];
      const neighLabs: number[] = [];
      for (const v of neigh) {
        const L = labels.get(v);
        if (L !== undefined && L >= 0) neighLabs.push(L);
      }
      const self = labels.get(n.id) ?? -1;
      if (self >= 0) neighLabs.push(self);
      const maj = majorityLabel(neighLabs);
      if (maj === null) continue;
      if (next.get(n.id) !== maj) {
        next.set(n.id, maj);
        changed = true;
      }
    }
    labels = next;
    if (!changed) break;
  }

  let iso = 0;
  const preliminary = new Map<string, number>();
  for (const n of graphDocument.nodes) {
    let L = labels.get(n.id) ?? -1;
    if (L < 0) L = 1_000_000_000 + iso++;
    preliminary.set(n.id, L);
  }
  const distinct = [...new Set(preliminary.values())].sort((a, b) => a - b);
  const compact = new Map<number, number>();
  distinct.forEach((v, i) => compact.set(v, i));

  const nodeClusterLabel: Record<string, number> = {};
  const labelToNodeIds = new Map<number, string[]>();
  for (const n of graphDocument.nodes) {
    const lab = compact.get(preliminary.get(n.id)!)!;
    nodeClusterLabel[n.id] = lab;
    if (!labelToNodeIds.has(lab)) labelToNodeIds.set(lab, []);
    labelToNodeIds.get(lab)!.push(n.id);
  }

  return { nodeClusterLabel, labelToNodeIds };
}
