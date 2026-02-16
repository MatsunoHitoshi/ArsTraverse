import type {
  SourceDocument,
  User,
  DocumentGraph,
  TopicSpace,
  Tag,
  Activity,
  Workspace,
  Annotation,
  AnnotationHistory,
  DocumentType,
  Prisma,
  AnnotationDiscussion,
  GraphChangeType,
  GraphChangeEntityType,
} from "@prisma/client";
import type { SimulationNodeDatum, SimulationLinkDatum } from "d3";

export interface TopicSpaceResponse extends TopicSpace {
  sourceDocuments: DocumentResponseWithGraphData[] | null;
  admins?: User[];
  activities?: Activity[];
  tags?: Tag[];
}

export interface DocumentGraphResponse extends DocumentGraph {
  dataJson: GraphDocumentForFrontend;
}

export interface CreateSourceDocumentResponse {
  documentGraph: {
    id: string;
    dataJson: Prisma.JsonValue;
    createdAt: Date;
    updatedAt: Date;
    isDeleted: boolean;
    userId: string;
    sourceDocumentId: string;
  };
  sourceDocument: {
    id: string;
    name: string;
    url: string;
    createdAt: Date;
    updatedAt: Date;
    isDeleted: boolean;
    documentType: DocumentType;
    userId: string;
  };
}

export interface DocumentResponseWithGraphData extends SourceDocument {
  graph?: DocumentGraphResponse | null;
  topicSpaces?: TopicSpaceResponse[];
  tags?: Tag[];
}
export interface DocumentResponse extends SourceDocument {
  graph?: { id: string } | null;
  topicSpaces?: TopicSpaceResponse[];
  tags?: Tag[];
}

export interface WorkspaceResponse extends Workspace {
  referencedTopicSpaces?: TopicSpaceResponse[];
}

export interface AnnotationResponse extends Annotation {
  childAnnotations?: AnnotationResponse[];
  author: {
    id: string;
    name: string | null;
    image: string | null;
  };
  histories?: AnnotationHistory[];
  rootDiscussions?: AnnotationDiscussion[];
}

export interface CustomNodeType
  extends SimulationNodeDatum,
    NodeTypeForFrontend {}
export interface CustomLinkType
  extends SimulationLinkDatum<CustomNodeType>,
    RelationshipTypeForFrontend {}

export type TreeNode = {
  id: string;
  name: string;
  children?: TreeNode[];
  label?: string;
};

export type TopicGraphFilterOption = {
  type: "label" | "tag";
  value: string;
  cutOff?: number;
  withBetweenNodes?: boolean;
};

export const ChangeTypeMap = {
  ADD: "追加",
  REMOVE: "削除",
  UPDATE: "更新",
};

export const EntityTypeMap = {
  NODE: "ノード",
  EDGE: "エッジ",
};

export type GraphDocumentForFrontend = {
  nodes: NodeTypeForFrontend[];
  relationships: RelationshipTypeForFrontend[];
};

export type NodeTypeForFrontend = {
  id: string;
  name: string;
  label: string;
  properties: PropertyTypeForFrontend;
  topicSpaceId?: string;
  documentGraphId?: string;
  neighborLinkCount?: number;
  visible?: boolean;
  clustered?: { x: number; y: number };
  nodeColor?: string;
  isAdditional?: boolean;
  isMergeTarget?: boolean;
  isExistingContext?: boolean;
  isAddedInHistory?: boolean; // 変更履歴で追加されたノード
  isRemovedInHistory?: boolean; // 変更履歴で削除されたノード
};

export type RelationshipTypeForFrontend = {
  id: string;
  type: string;
  properties: PropertyTypeForFrontend;
  sourceId: string;
  targetId: string;
  topicSpaceId?: string;
  documentGraphId?: string;
  isAdditional?: boolean;
  isExistingContext?: boolean;
  isAddedInHistory?: boolean; // 変更履歴で追加されたエッジ
  isRemovedInHistory?: boolean; // 変更履歴で削除されたエッジ
};

export type PropertyTypeForFrontend = {
  [K in string]: string;
};

export type FocusedPosition = {
  x: number;
  y: number;
};

export type TiptapGraphFilterOption = {
  mode: "non-filtered" | "focused" | "filtered";
  entities: string[];
};

// クラスタリング関連の型定義
export interface AnnotationClusteringParams {
  featureExtraction: {
    maxFeatures: number;
    minDf: number;
    maxDf: number;
    includeMetadata: boolean;
    includeStructural: boolean;
  };
  dimensionalityReduction: {
    nNeighbors: number;
    minDist: number;
    spread: number;
    nComponents: number;
    randomSeed: number;
  };
  clustering: {
    algorithm: "KMEANS" | "DBSCAN" | "HIERARCHICAL";
    nClusters?: number;
    eps?: number;
    minSamples?: number;
    linkage?: "ward" | "complete" | "average" | "single";
  };
}

export interface AnnotationClusteringResult {
  features: {
    vectors: number[][];
    names: string[];
    annotationIds: string[];
  };
  dimensionalityReduction: {
    coordinates: Array<{ x: number; y: number; annotationId: string }>;
    annotationIds: string[];
    parameters: AnnotationClusteringParams["dimensionalityReduction"];
    qualityMetrics?: {
      trustworthiness?: number;
      continuity?: number;
    };
  };
  clustering: ClusteringResult;
  processingTime: {
    featureExtraction: number;
    dimensionalityReduction: number;
    clustering: number;
    total: number;
  };
  statistics: {
    totalAnnotations: number;
    totalClusters: number;
    averageClusterSize: number;
    largestClusterSize: number;
    smallestClusterSize: number;
    qualityScore: number;
  };
}

export interface ClusteringVisualizationData {
  annotations: Array<{
    id: string;
    x: number;
    y: number;
    clusterId: number;
    content: string;
    type: string;
    author: string;
    createdAt: Date;
  }>;
  clusters: Array<{
    id: number;
    centerX: number;
    centerY: number;
    size: number;
    color: string;
    label: string;
  }>;
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
}

export interface ClusterResult {
  clusterId: number;
  centerX: number;
  centerY: number;
  size: number;
  annotationIds: string[];
  title?: string;
  features?: {
    avgSentiment?: number;
    dominantType?: string;
    participants?: string[];
    timeRange?: { start: Date; end: Date };
  };
}

export interface ClusteringResult {
  clusters: ClusterResult[];
  algorithm: string;
  parameters: AnnotationClusteringParams["clustering"];
  qualityMetrics?: {
    silhouetteScore?: number;
    inertia?: number;
    calinskiHarabaszScore?: number;
  };
  coordinates?: Array<{
    x: number;
    y: number;
    annotationId: string;
  }>;
}

export type ReferenceSection = {
  relevantSections: string[];
  sourceDocument: SourceDocument;
};

export type LocaleEnum = "ja" | "en";

export type GraphEditChangeForFrontend = {
  id: string;
  proposalId: string;
  changeType: GraphChangeType;
  changeEntityType: GraphChangeEntityType;
  changeEntityId: string;
  previousState: Record<string, unknown>;
  nextState: Record<string, unknown>;
  createdAt: Date;
};

export type CuratorialContext = {
  stance?: string;
  extractionRules?: Record<string, unknown> | Array<unknown>;
  negativeArchive?: string[];
  [key: string]: unknown;
};

export type LayoutInstruction = {
  /** レイアウト戦略の種類（例: "force_simulation"） */
  layout_strategy?: string;
  forces?: {
    /** X軸方向の力の設定 */
    x_axis?: {
      /** レイアウトタイプ
       * - "timeline": 時系列配置（属性値に基づいて日付/数値順に配置）
       * - "category_separation": カテゴリ分離（属性値に基づいてグループごとに分離）
       * - "linear": 線形配置（属性に依存せず均等に分散）
       * - "none": 力を適用しない
       */
      type: "timeline" | "category_separation" | "linear" | "none";
      /** ノードのプロパティ名（timeline/category_separationタイプで使用） */
      attribute?: string;
      /** カテゴリごとの位置設定（category_separationタイプで使用）
       * 例: { "admin": "left", "artist": "right" } または { "group1": 0.2, "group2": 0.8 }
       */
      groups?: Record<string, string | number>;
      /** 力の強度（0.0-1.0）
       * - timeline/category_separationタイプ: 目標位置への引力の強さ
       * - linearタイプ: ノードをX軸方向に分散させる強度（値が大きいほど横方向に広がる）
       */
      strength?: number;
    };
    /** Y軸方向の力の設定 */
    y_axis?: {
      /** レイアウトタイプ
       * - "timeline": 時系列配置（属性値に基づいて日付/数値順に配置）
       * - "category_separation": カテゴリ分離（属性値に基づいてグループごとに分離）
       * - "linear": 線形配置（属性に依存せず均等に分散）
       * - "none": 力を適用しない
       */
      type: "timeline" | "category_separation" | "linear" | "none";
      /** ノードのプロパティ名（timeline/category_separationタイプで使用） */
      attribute?: string;
      /** カテゴリごとの位置設定（category_separationタイプで使用）
       * 例: { "top": "top", "bottom": "bottom" } または { "group1": 0.2, "group2": 0.8 }
       */
      groups?: Record<string, string | number>;
      /** 力の強度（0.0-1.0）
       * - timeline/category_separationタイプ: 目標位置への引力の強さ
       * - linearタイプ: ノードをY軸方向に分散させる強度（値が大きいほど縦方向に広がる）
       */
      strength?: number;
    };
    /** ノード間の反発力（charge force）の設定 */
    charge?: {
      /** 反発力の強度（通常は負の値、例: -100, -300）
       * 値が小さい（より負の値）ほどノード間の距離が広がる
       */
      strength?: number;
    };
    /** 特定のノードを強調する設定（反発力を調整） */
    focus_nodes?: {
      /** 対象となるノードIDの配列（ノード名も可、バックエンドでIDに解決される） */
      targetNodeIds: string[];
      /** 対象ノードの反発力の倍率（例: 2.0で2倍の反発力） */
      chargeMultiplier: number;
    };
    highlight_nodes?: {
      /** 対象となるノードIDの配列（ノード名も可、バックエンドでIDに解決される） */
      targetNodeIds: string[];
      /** 対象ノードの色 */
      color: string;
    };
    /** 特定のノードをグラフの中央に配置する設定 */
    center_nodes?: {
      /** 中央に配置するノードIDの配列（ノード名も可、バックエンドでIDに解決される） */
      targetNodeIds: string[];
    };
  };
  /** グラフのフィルタリング設定（レイアウト表示時の一時的な絞り込み） */
  filter?: {
    /** 中心ノード（絞り込みの起点となるノード）
     * ノード名も可（バックエンドでIDに解決される）
     * 例: ["村上隆"]
     */
    centerNodeIds?: string[];
    /** 中心ノードからの最大ホップ数（距離）
     * デフォルト: 2
     * 例: 2の場合、中心ノードから2ホップ以内のノードのみを表示
     */
    maxHops?: number;
    /** フィルタ条件（再帰的にネスト可能） */
    condition?: FilterCondition;
    /** 隣接ノードを含めるかどうか
     * true: フィルタ条件に一致するノードとその隣接ノードを表示
     * false: フィルタ条件に一致するノードのみを表示
     * デフォルト: true
     */
    includeNeighbors?: boolean;
    /** セグメントでハイライトされているノードを含めるかどうか（ストーリーテリング時）
     * true: フィルタで除外されても、セグメント参照ノードは残す
     * false: フィルタに従いセグメントノードも除外する
     * デフォルト: true
     */
    includeSegmentNodes?: boolean;
  };
};

/** 再帰的なフィルタ条件（ネスト可能） */
export type FilterCondition =
  | {
      type: "condition";
      /** フィールド名
       * - "label": ノードのラベル
       * - "name": ノードの名前
       * - string: ノードのプロパティキー名（例: "mentionedAt", "場所"）
       */
      field: string; // "label" | "name" | string の意図だが、stringが包含するためstringのみ
      /** 演算子 */
      operator:
        | "equals" // 完全一致
        | "in" // 値が配列に含まれる
        | "contains" // 部分一致（文字列の場合）
        | "date_equals" // 日付の完全一致
        | "date_after" // 日付が指定日以降
        | "date_before" // 日付が指定日以前
        | "date_range"; // 日付の範囲指定
      /** 値（演算子によって型が異なる）
       * - equals, contains, date_equals, date_after, date_before: string
       * - in: string[]
       * - date_range: { from: string; to: string }
       */
      value: string | string[] | { from: string; to: string };
    }
  | {
      type: "group";
      /** グループ内の条件の結合方法 */
      logic: "AND" | "OR";
      /** 条件の配列（再帰的にネスト可能） */
      conditions: FilterCondition[];
    };
