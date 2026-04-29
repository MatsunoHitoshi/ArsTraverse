import createGraph from "ngraph.graph";
import { detectClusters as detectClustersUntyped } from "ngraph.leiden";
import type { MetaGraphGraphDoc, TopologyClusterResult } from "./types";

type LeidenResult = {
  getClass: (nodeId: string) => number;
};

type NgraphGraph = ReturnType<typeof createGraph>;

type DetectClustersFn = (
  graph: NgraphGraph,
  options: { randomSeed: number; refine: boolean; quality: string },
) => LeidenResult;

/** ngraph.leiden に公式型がないため、境界で関数型を固定する */
const detectClusters = detectClustersUntyped as DetectClustersFn;

/** 無向・多重なし等重みで Leiden（ngraph.leiden） */
export function clusterLeidenUnweighted(
  graphDocument: MetaGraphGraphDoc,
  randomSeed = 42,
): TopologyClusterResult {
  const g = createGraph();
  for (const n of graphDocument.nodes) {
    g.addNode(n.id);
  }
  const pairKey = new Set<string>();
  for (const rel of graphDocument.relationships) {
    const a = rel.sourceId;
    const b = rel.targetId;
    const key = a < b ? `${a}\0${b}` : `${b}\0${a}`;
    if (pairKey.has(key)) continue;
    pairKey.add(key);
    g.addLink(a, b, { weight: 1 });
  }

  const result = detectClusters(g, {
    randomSeed,
    refine: true,
    quality: "modularity",
  });

  const nodeClusterLabel: Record<string, number> = {};
  for (const n of graphDocument.nodes) {
    nodeClusterLabel[n.id] = result.getClass(n.id);
  }

  const labelToNodeIds = new Map<number, string[]>();
  for (const n of graphDocument.nodes) {
    const lab = nodeClusterLabel[n.id]!;
    if (!labelToNodeIds.has(lab)) labelToNodeIds.set(lab, []);
    labelToNodeIds.get(lab)!.push(n.id);
  }

  return { nodeClusterLabel, labelToNodeIds };
}
