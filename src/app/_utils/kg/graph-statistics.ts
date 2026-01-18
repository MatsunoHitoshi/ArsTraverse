import type {
  GraphDocumentForFrontend,
  NodeTypeForFrontend,
} from "@/app/const/types";
import { bfsDistances } from "./bfs";

/**
 * グラフの統計情報を計算
 * - 次数中心性（上位ノード）
 * - グラフの直径
 * - 平均パス長
 * - クラスター係数（局所・大域）
 */
export function calculateGraphStatistics(graph: GraphDocumentForFrontend) {
  const { nodes: graphNodes, relationships: graphLinks } = graph;

  // 1. 次数計算
  const degrees = new Map<string, number>();
  graphNodes.forEach((n) => degrees.set(n.id, 0));
  graphLinks.forEach((l) => {
    degrees.set(l.sourceId, (degrees.get(l.sourceId) ?? 0) + 1);
    degrees.set(l.targetId, (degrees.get(l.targetId) ?? 0) + 1);
  });

  // ハブ（次数上位）の抽出
  const topDegreeNodes = [...graphNodes]
    .sort((a, b) => {
      return (degrees.get(b.id) ?? 0) - (degrees.get(a.id) ?? 0);
    })
    .slice(0, 5) // 上位5件
    .map((n) => ({ ...n, degree: degrees.get(n.id) ?? 0 }));

  // 2. 直径と平均ホップ数の計算
  const adj = new Map<string, string[]>();
  graphNodes.forEach((n) => adj.set(n.id, []));
  graphLinks.forEach((l) => {
    if (!adj.has(l.sourceId)) adj.set(l.sourceId, []);
    if (!adj.has(l.targetId)) adj.set(l.targetId, []);

    adj.get(l.sourceId)!.push(l.targetId);
    adj.get(l.targetId)!.push(l.sourceId);
  });

  let maxDist = 0;
  let totalDist = 0;
  let pathCount = 0;

  // 計算コスト削減のため、ノード数が多すぎる場合はサンプリング
  const calculationNodes =
    graphNodes.length > 800
      ? topDegreeNodes
          .map((n) => graphNodes.find((gn) => gn.id === n.id))
          .filter((n): n is NodeTypeForFrontend => !!n)
      : graphNodes;

  for (const startNode of calculationNodes) {
    const dists = bfsDistances(startNode.id, adj);

    // 統計情報の更新
    for (const d of dists.values()) {
      if (d > maxDist) maxDist = d;
      if (d > 0) {
        totalDist += d;
        pathCount++;
      }
    }
  }

  const avgPathLength = pathCount > 0 ? totalDist / pathCount : 0;

  // 3. クラスター係数の計算
  let totalLocalClusteringCoeff = 0;
  let totalNumeratorGlobal = 0; // Σ(2 * links)
  let totalDenominatorGlobal = 0; // Σ(k * (k - 1))

  // adjはすでに無向グラフとして構築済み
  for (const node of graphNodes) {
    const neighbors = adj.get(node.id) ?? [];
    const k = neighbors.length; // 次数

    if (k < 2) continue; // 隣接ノードが2つ未満なら係数は0

    let links = 0;
    // 隣接ノード同士が繋がっているか確認
    for (let i = 0; i < k; i++) {
      for (let j = i + 1; j < k; j++) {
        const u = neighbors[i];
        const v = neighbors[j];
        if (u && v && adj.get(u)?.includes(v)) {
          links++;
        }
      }
    }

    const possibleLinks = k * (k - 1);

    // 局所クラスター係数 C_i = 2 * links / (k * (k - 1))
    const ci = (2 * links) / possibleLinks;
    totalLocalClusteringCoeff += ci;

    // 大域的クラスター係数用集計
    totalNumeratorGlobal += 2 * links;
    totalDenominatorGlobal += possibleLinks;
  }

  const avgClusteringCoeff =
    graphNodes.length > 0 ? totalLocalClusteringCoeff / graphNodes.length : 0;

  // 大域的クラスター係数 = (3 * 三角形数) / (連結トリプレット数)
  // = Σ(2 * links) / Σ(k * (k - 1))
  const globalClusteringCoeff =
    totalDenominatorGlobal > 0
      ? totalNumeratorGlobal / totalDenominatorGlobal
      : 0;

  return {
    topDegreeNodes,
    diameter: maxDist,
    avgPathLength,
    avgClusteringCoeff,
    globalClusteringCoeff,
  };
}
