import type {
  ClusterStrategyContext,
  MetaGraphGraphDoc,
  TopologyClusterResult,
} from "./types";

function dist2(a: number[], b: number[]): number {
  let s = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const d = a[i]! - b[i]!;
    s += d * d;
  }
  return s;
}

function addVec(acc: number[], v: number[]) {
  for (let i = 0; i < acc.length; i++) acc[i]! += v[i] ?? 0;
}

function scaleVec(v: number[], s: number) {
  return v.map((x) => x * s);
}

/**
 * nameEmbedding 上で k-means（k = min(セクション数, 埋め込みありノード数, maxK)）。
 * 埋め込みなしノードは最終重心に最も近いクラスタへ割当。
 */
export function clusterEmbeddingKMeansName(
  graphDocument: MetaGraphGraphDoc,
  ctx: ClusterStrategyContext,
): TopologyClusterResult {
  const emb = ctx.nodeNameEmbeddings;
  if (!emb || emb.size === 0) {
    throw new Error("embedding-kmeans-name requires nodeNameEmbeddings");
  }

  const withEmb = graphDocument.nodes
    .map((n) => ({ id: n.id, v: emb.get(n.id) }))
    .filter((x): x is { id: string; v: number[] } => Boolean(x.v && x.v.length > 0));

  if (withEmb.length === 0) {
    throw new Error("embedding-kmeans-name: no vectors for graph nodes");
  }

  const dim = withEmb[0]!.v.length;
  const maxK = ctx.maxK ?? Number.POSITIVE_INFINITY;
  const k = Math.max(
    1,
    Math.min(ctx.sections.length, withEmb.length, maxK),
  );

  let centroids = withEmb.slice(0, k).map((p) => [...p.v]);
  const assignment = new Map<string, number>();
  const maxIter = 40;

  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;
    for (const p of withEmb) {
      let best = 0;
      let bestD = Infinity;
      for (let j = 0; j < k; j++) {
        const d = dist2(p.v, centroids[j]!);
        if (d < bestD) {
          bestD = d;
          best = j;
        }
      }
      if (assignment.get(p.id) !== best) {
        assignment.set(p.id, best);
        changed = true;
      }
    }

    const sums = Array.from({ length: k }, () => new Array(dim).fill(0) as number[]);
    const counts = new Array(k).fill(0);
    for (const p of withEmb) {
      const c = assignment.get(p.id) ?? 0;
      counts[c]!++;
      addVec(sums[c]!, p.v);
    }
    const nextCentroids = centroids.map((_, j) => {
      if (counts[j] === 0) return [...centroids[j]!];
      return scaleVec(sums[j]!, 1 / counts[j]!);
    });
    centroids = nextCentroids;
    if (!changed && iter > 2) break;
  }

  for (const n of graphDocument.nodes) {
    if (assignment.has(n.id)) continue;
    const fallback = emb.get(n.id);
    if (fallback && fallback.length === dim) {
      let best = 0;
      let bestD = Infinity;
      for (let j = 0; j < k; j++) {
        const d = dist2(fallback, centroids[j]!);
        if (d < bestD) {
          bestD = d;
          best = j;
        }
      }
      assignment.set(n.id, best);
    } else {
      assignment.set(n.id, k);
    }
  }

  const nodeClusterLabel: Record<string, number> = {};
  const labelToNodeIds = new Map<number, string[]>();
  let nextSingleton = k + 1;
  for (const n of graphDocument.nodes) {
    let lab = assignment.get(n.id);
    if (lab === undefined) {
      lab = nextSingleton++;
      assignment.set(n.id, lab);
    }
    nodeClusterLabel[n.id] = lab;
    if (!labelToNodeIds.has(lab)) labelToNodeIds.set(lab, []);
    labelToNodeIds.get(lab)!.push(n.id);
  }

  return { nodeClusterLabel, labelToNodeIds };
}
