import type { GraphDocumentForFrontend } from "@/app/const/types";
import { calculateGraphStatistics } from "./graph-statistics";

/**
 * グラフ分析結果の型定義
 * LLMが洞察を生成するために必要な統計情報を含む
 */
export interface GraphAnalysisResult {
  // 構造統計
  structure: {
    nodeCount: number;
    relationshipCount: number;
    nodeLabels: Record<string, number>;
    relationshipTypes: Record<string, number>;
    topDegreeNodes: Array<{
      id: string;
      name: string;
      label: string;
      degree: number;
    }>;
    diameter: number;
    avgPathLength: number;
    clusteringCoeff: number;
  };

  // 属性分析
  attributes: {
    numericAttributes: Array<{
      name: string;
      min: number;
      max: number;
      avg: number;
      hasTimeSeries: boolean;
      sampleValues: number[];
    }>;
    categoricalAttributes: Array<{
      name: string;
      uniqueValues: string[];
      distribution: Record<string, number>;
    }>;
  };

  // 中心性分析
  centrality: {
    degreeCentrality: Map<string, number>;
    // 将来的にbetweenness, closeness, PageRankも追加可能
  };
}

/**
 * グラフの構造と属性を包括的に分析
 * calculateGraphStatisticsを利用して統計情報を取得し、
 * さらに属性分析と中心性分析を追加
 */
export function analyzeGraphStructure(
  graph: GraphDocumentForFrontend,
): GraphAnalysisResult {
  const { nodes, relationships } = graph;

  // 既存の統計計算を利用
  const stats = calculateGraphStatistics(graph);

  // ノードラベルの分布
  const nodeLabels: Record<string, number> = {};
  nodes.forEach((node) => {
    nodeLabels[node.label] = (nodeLabels[node.label] ?? 0) + 1;
  });

  // リレーションタイプの分布
  const relationshipTypes: Record<string, number> = {};
  relationships.forEach((rel) => {
    relationshipTypes[rel.type] = (relationshipTypes[rel.type] ?? 0) + 1;
  });

  // 次数中心性の計算
  const degreeCentrality = new Map<string, number>();
  nodes.forEach((node) => degreeCentrality.set(node.id, 0));
  relationships.forEach((rel) => {
    degreeCentrality.set(
      rel.sourceId,
      (degreeCentrality.get(rel.sourceId) ?? 0) + 1,
    );
    degreeCentrality.set(
      rel.targetId,
      (degreeCentrality.get(rel.targetId) ?? 0) + 1,
    );
  });

  // 属性分析
  const numericAttributes: GraphAnalysisResult["attributes"]["numericAttributes"] =
    [];
  const categoricalAttributes: GraphAnalysisResult["attributes"]["categoricalAttributes"] =
    [];

  // 全ノードのプロパティを収集
  const allPropertyKeys = new Set<string>();
  nodes.forEach((node) => {
    Object.keys(node.properties ?? {}).forEach((key) =>
      allPropertyKeys.add(key),
    );
  });

  allPropertyKeys.forEach((key) => {
    const values = nodes
      .map((n) => n.properties?.[key])
      .filter((v) => v !== undefined && v !== null);

    if (values.length === 0) return;

    // 数値属性かどうかを判定
    const numericValues = values
      .map((v) => {
        if (typeof v === "number") return v;
        if (typeof v === "string") {
          const num = Number(v);
          if (!isNaN(num)) return num;
          // 日付文字列の可能性
          const date = new Date(v).getTime();
          if (!isNaN(date)) return date;
        }
        return null;
      })
      .filter((v): v is number => v !== null);

    if (numericValues.length > 0) {
      const min = Math.min(...numericValues);
      const max = Math.max(...numericValues);
      const avg =
        numericValues.reduce((a, b) => a + b, 0) / numericValues.length;

      // 時系列かどうかの簡易判定（値が増加傾向にあるか、または日付形式か）
      const isTimeSeries =
        numericValues.length > 1 &&
        (max - min > 1000000000 || // タイムスタンプの可能性（1970年からのミリ秒）
          numericValues.every((v, i) => i === 0 || v >= numericValues[i - 1]!));

      numericAttributes.push({
        name: key,
        min,
        max,
        avg,
        hasTimeSeries: isTimeSeries,
        sampleValues: numericValues.slice(0, 10),
      });
    } else {
      // カテゴリ属性として扱う
      const stringValues = values.map((v) => String(v));
      const uniqueValues = Array.from(new Set(stringValues));
      const distribution: Record<string, number> = {};
      stringValues.forEach((v) => {
        distribution[v] = (distribution[v] ?? 0) + 1;
      });

      categoricalAttributes.push({
        name: key,
        uniqueValues,
        distribution,
      });
    }
  });

  return {
    structure: {
      nodeCount: nodes.length,
      relationshipCount: relationships.length,
      nodeLabels,
      relationshipTypes,
      topDegreeNodes: stats.topDegreeNodes.map((n) => ({
        id: n.id,
        name: n.name,
        label: n.label,
        degree: n.degree,
      })),
      diameter: stats.diameter,
      avgPathLength: stats.avgPathLength,
      clusteringCoeff: stats.avgClusteringCoeff,
    },
    attributes: {
      numericAttributes,
      categoricalAttributes,
    },
    centrality: {
      degreeCentrality,
    },
  };
}

/**
 * LLMに渡すための分析データを準備（コンテキストウィンドウ最適化）
 * 重要な情報のみを抽出して、トークン数を削減
 */
export function prepareAnalysisForLLM(
  analysis: GraphAnalysisResult,
  maxNodes = 10,
  maxAttributes = 5,
): string {
  // 1. トップNノードのみ（重要度順）
  const topNodes = analysis.structure.topDegreeNodes.slice(0, maxNodes);

  // 2. 主要な属性のみ（分布が意味のあるもの）
  const significantAttributes = analysis.attributes.numericAttributes
    .filter((attr) => attr.hasTimeSeries || attr.max - attr.min > 0)
    .slice(0, maxAttributes);

  // 3. カテゴリ属性はユニーク値が少ないもののみ（過度に細分化されていない）
  const usefulCategories = analysis.attributes.categoricalAttributes
    .filter(
      (attr) => attr.uniqueValues.length >= 2 && attr.uniqueValues.length <= 10,
    )
    .slice(0, maxAttributes);

  return JSON.stringify(
    {
      summary: {
        nodeCount: analysis.structure.nodeCount,
        relationshipCount: analysis.structure.relationshipCount,
        nodeLabelDistribution: Object.entries(analysis.structure.nodeLabels)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .reduce((acc, [label, count]) => ({ ...acc, [label]: count }), {}),
        relationshipTypeDistribution: Object.entries(
          analysis.structure.relationshipTypes,
        )
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .reduce((acc, [type, count]) => ({ ...acc, [type]: count }), {}),
      },
      topCentralNodes: topNodes,
      usefulAttributes: {
        numeric: significantAttributes,
        categorical: usefulCategories,
      },
    },
    null,
    2,
  );
}

/**
 * 分析フォーカスに応じてデータ量を調整
 * 特定の分析目的に応じて、必要な情報のみを抽出
 */
export function getAnalysisDataByFocus(
  analysis: GraphAnalysisResult,
  focus:
    | "centrality"
    | "clustering"
    | "attributes"
    | "layout_suggestions"
    | "comprehensive",
): string {
  const base = {
    summary: {
      nodeCount: analysis.structure.nodeCount,
      relationshipCount: analysis.structure.relationshipCount,
    },
  };

  switch (focus) {
    case "centrality":
      return JSON.stringify(
        {
          ...base,
          topCentralNodes: analysis.structure.topDegreeNodes.slice(0, 20),
          centralityMetrics: {
            diameter: analysis.structure.diameter,
            avgPathLength: analysis.structure.avgPathLength,
          },
        },
        null,
        2,
      );

    case "attributes":
      return JSON.stringify(
        {
          ...base,
          attributes: {
            numeric: analysis.attributes.numericAttributes,
            categorical: analysis.attributes.categoricalAttributes,
          },
        },
        null,
        2,
      );

    case "clustering":
      return JSON.stringify(
        {
          ...base,
          nodeLabelDistribution: analysis.structure.nodeLabels,
          relationshipTypeDistribution: analysis.structure.relationshipTypes,
          clusteringCoeff: analysis.structure.clusteringCoeff,
        },
        null,
        2,
      );

    case "layout_suggestions":
      return JSON.stringify(
        {
          ...base,
          attributes: {
            numeric: analysis.attributes.numericAttributes,
            categorical: analysis.attributes.categoricalAttributes,
          },
          nodeLabelDistribution: analysis.structure.nodeLabels,
        },
        null,
        2,
      );

    case "comprehensive":
    default:
      return prepareAnalysisForLLM(analysis);
  }
}
