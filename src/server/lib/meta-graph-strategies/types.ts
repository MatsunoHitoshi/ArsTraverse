/**
 * メタグラフ（テキストモード）のコミュニティ割当: 第1層クラスタリング + 第2層セクション対応。
 * compareMode / 複数戦略一括レスポンスは将来拡張（別 procedure 等）。
 */

/**
 * `parse-content-sections` の SectionWithSegments / ParsedSegment と構造一致。
 * サーバの `ClusterStrategyContext` が `@/app` に依存しないようにする。
 */
export interface ClusterStrategySegment {
  paragraphIndex: number;
  text: string;
  entityNames: string[];
  nodeIds?: string[];
  edgeIds?: string[];
}

export interface ClusterStrategySection {
  sectionIndex: number;
  title: string;
  segments: ClusterStrategySegment[];
  entityNames: string[];
}

/** 第1層: トポロジ（Louvain / Leiden）・意味（k-means）・シード LP */
export const CLUSTER_STRATEGY_IDS = [
  "louvain-unweighted",
  "leiden-unweighted",
  "embedding-kmeans-name",
  "label-propagation-seeded",
] as const;
export type ClusterStrategyId = (typeof CLUSTER_STRATEGY_IDS)[number];

/** 第2層: シード最大（現行） / 埋め込みハイブリッド */
export const SECTION_MAP_STRATEGY_IDS = [
  "seed-max-count",
  "hybrid-seed-embedding",
] as const;
export type SectionMapStrategyId = (typeof SECTION_MAP_STRATEGY_IDS)[number];

export interface MetaGraphStrategiesInput {
  clusterStrategy?: ClusterStrategyId;
  sectionMapStrategy?: SectionMapStrategyId;
  /** 第1層オプション（k-means の k 上限、LP 反復など） */
  clusterOptions?: {
    maxK?: number;
    labelPropagationIterations?: number;
    randomSeed?: number;
  };
}

/** `runTopologyCluster` に渡す実行時コンテキスト */
export interface ClusterStrategyContext {
  sections: ClusterStrategySection[];
  nodeNameEmbeddings?: Map<string, number[]>;
  maxK?: number;
  labelPropagationIterations?: number;
  randomSeed?: number;
}

export const DEFAULT_META_GRAPH_STRATEGIES = {
  clusterStrategy: "louvain-unweighted" satisfies ClusterStrategyId,
  sectionMapStrategy: "seed-max-count" satisfies SectionMapStrategyId,
} as const;

export type MetaGraphGraphNode = {
  id: string;
  name: string;
  label: string;
  properties?: Record<string, unknown>;
};

export type MetaGraphGraphRelationship = {
  id: string;
  sourceId: string;
  targetId: string;
  type: string;
  properties?: Record<string, unknown>;
};

export type MetaGraphGraphDoc = {
  nodes: MetaGraphGraphNode[];
  relationships: MetaGraphGraphRelationship[];
};

/** 第1層の出力: ノード→整数クラスタ ID、および ID ごとのメンバー */
export interface TopologyClusterResult {
  nodeClusterLabel: Record<string, number>;
  labelToNodeIds: Map<number, string[]>;
}

export interface CommunityAssignmentResult {
  nodeToCommunity: Map<string, string>;
  communityGroups: Map<string, string[]>;
  communityInternalEdges: Map<
    string,
    Array<{ sourceName: string; targetName: string; type: string }>
  >;
  communityExternalConnections: Map<
    string,
    Map<string, { count: number; types: Set<string> }>
  >;
}

export interface HybridSectionMappingContext {
  sectionEmbeddingVectors: number[][];
  nodeNameEmbeddings: Map<string, number[]>;
  weights: { seed: number; semantic: number };
  /** セマンティクス最大がこれ未満かつシードも全ゼロなら louvain-* */
  semanticThreshold: number;
}
