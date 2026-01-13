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
