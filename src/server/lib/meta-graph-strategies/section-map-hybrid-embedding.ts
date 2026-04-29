import type {
  ClusterStrategySection,
  HybridSectionMappingContext,
  MetaGraphGraphDoc,
} from "./types";
import { buildSectionSeedNodeIds } from "./section-seeds";

function l2Norm(v: number[]): number {
  return Math.sqrt(v.reduce((s, x) => s + x * x, 0));
}

function l2Normalize(v: number[]): number[] | null {
  const n = l2Norm(v);
  if (n === 0) return null;
  return v.map((x) => x / n);
}

function meanVectors(vectors: number[][]): number[] | null {
  if (vectors.length === 0) return null;
  const dim = vectors[0]!.length;
  const acc = new Array(dim).fill(0) as number[];
  for (const v of vectors) {
    for (let d = 0; d < dim; d++) {
      acc[d]! += v[d] ?? 0;
    }
  }
  const n = vectors.length;
  return acc.map((x) => x / n);
}

function dot(a: number[], b: number[]): number {
  let s = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) s += a[i]! * b[i]!;
  return s;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function sectionPlainText(section: ClusterStrategySection): string {
  const body = section.segments.map((s) => s.text).join("\n\n");
  return `${section.title}\n\n${body}`.trim();
}

/**
 * シード正規化 + セクション／クラスタ centroid のコサイン（[0,1] にクランプ）の重み付き合成。
 * maxSeed==0 かつ maxSemantic<=threshold のクラスタは louvain-* 側へ回す（数値ラベル昇順で付番）。
 */
export function mapNumericClustersHybridSeedEmbedding(
  graphDocument: MetaGraphGraphDoc,
  sections: ClusterStrategySection[],
  labelToNodeIds: Map<number, string[]>,
  ctx: HybridSectionMappingContext,
): Map<number, string> {
  const communityIdBySectionIndex = (i: number) => `text-${i}` as const;

  const sectionSeedIds = buildSectionSeedNodeIds(graphDocument, sections);

  const { weights, semanticThreshold, nodeNameEmbeddings, sectionEmbeddingVectors } =
    ctx;

  const numericToSectionOrNonStory = new Map<number, string>();
  const nonStoryNumericLabels: number[] = [];

  const sectionNorms: (number[] | null)[] = sections.map((_, i) => {
    const v = sectionEmbeddingVectors[i];
    if (!v || v.length === 0) return null;
    return l2Normalize(v);
  });

  for (const [num, nodeIds] of labelToNodeIds) {
    const seedCounts: number[] = [];
    let maxSeed = 0;
    for (let i = 0; i < sections.length; i++) {
      const seedSet = sectionSeedIds[i]!;
      const c = nodeIds.filter((id) => seedSet.has(id)).length;
      seedCounts.push(c);
      if (c > maxSeed) maxSeed = c;
    }
    const seedScores = seedCounts.map((c) =>
      maxSeed > 0 ? c / maxSeed : 0,
    );

    const embList: number[][] = [];
    for (const id of nodeIds) {
      const e = nodeNameEmbeddings.get(id);
      if (e && e.length > 0) embList.push(e);
    }
    const centroidRaw = meanVectors(embList);
    const centroid = centroidRaw ? l2Normalize(centroidRaw) : null;

    const semanticScores: number[] = [];
    let maxSemantic = 0;
    for (let i = 0; i < sections.length; i++) {
      const secN = sectionNorms[i];
      let sem = 0;
      if (centroid && secN) {
        sem = clamp01(dot(centroid, secN));
      }
      semanticScores.push(sem);
      if (sem > maxSemantic) maxSemantic = sem;
    }

    if (maxSeed === 0 && maxSemantic <= semanticThreshold) {
      nonStoryNumericLabels.push(num);
      continue;
    }

    let bestI = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < sections.length; i++) {
      const combined =
        weights.seed * seedScores[i]! + weights.semantic * semanticScores[i]!;
      if (combined > bestScore) {
        bestScore = combined;
        bestI = i;
      }
    }
    numericToSectionOrNonStory.set(num, communityIdBySectionIndex(bestI));
  }

  nonStoryNumericLabels.sort((a, b) => a - b);
  nonStoryNumericLabels.forEach((num, idx) => {
    numericToSectionOrNonStory.set(num, `louvain-${idx}`);
  });

  return numericToSectionOrNonStory;
}

/** セクション埋め込み用のプレーンテキスト（外部で embed する際に利用可） */
export { sectionPlainText };
