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
import type {
  TopicGraphFilterOption,
  GraphDocumentForFrontend,
  NodeTypeForFrontend,
  RelationshipTypeForFrontend,
  PropertyTypeForFrontend,
  LayoutInstruction,
  FilterCondition,
  FocusedPosition,
  TiptapGraphFilterOption,
  ReferenceSection,
  AnnotationClusteringParams,
  AnnotationClusteringResult,
  ClusteringVisualizationData,
  ClusterResult,
  ClusteringResult,
} from "@repo/shared/types/graph";

export type {
  TopicGraphFilterOption,
  GraphDocumentForFrontend,
  NodeTypeForFrontend,
  RelationshipTypeForFrontend,
  PropertyTypeForFrontend,
  LayoutInstruction,
  FilterCondition,
  FocusedPosition,
  TiptapGraphFilterOption,
  ReferenceSection,
  AnnotationClusteringParams,
  AnnotationClusteringResult,
  ClusteringVisualizationData,
  ClusterResult,
  ClusteringResult,
};


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

export const ChangeTypeMap = {
  ADD: "追加",
  REMOVE: "削除",
  UPDATE: "更新",
};

export const EntityTypeMap = {
  NODE: "ノード",
  EDGE: "エッジ",
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
