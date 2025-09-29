import type {
  SourceDocument,
  User,
  DocumentGraph,
  TopicSpace,
  Tag,
  Activity,
  Workspace,
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
};

export type RelationshipTypeForFrontend = {
  id: string;
  type: string;
  properties: PropertyTypeForFrontend;
  sourceId: string;
  targetId: string;
  topicSpaceId?: string;
  documentGraphId?: string;
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
