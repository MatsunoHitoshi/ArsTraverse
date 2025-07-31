import type {
  SourceDocument,
  User,
  DocumentGraph,
  TopicSpace,
  Tag,
  Activity,
} from "@prisma/client";
import type { SimulationNodeDatum, SimulationLinkDatum } from "d3";
import type {
  NodeType,
  RelationshipType,
} from "@/app/_utils/kg/get-nodes-and-relationships-from-result";

export interface TopicSpaceResponse extends TopicSpace {
  sourceDocuments: DocumentResponseWithGraphData[] | null;
  admins?: User[];
  activities?: Activity[];
  tags?: Tag[];
}

export interface DocumentResponseWithGraphData extends SourceDocument {
  graph?: DocumentGraph | null;
  topicSpaces?: TopicSpaceResponse[];
  tags?: Tag[];
}
export interface DocumentResponse extends SourceDocument {
  graph?: { id: string } | null;
  topicSpaces?: TopicSpaceResponse[];
  tags?: Tag[];
}

export interface CustomNodeType extends SimulationNodeDatum, NodeType {}
export interface CustomLinkType
  extends SimulationLinkDatum<CustomNodeType>,
    RelationshipType {}

export type TreeNode = {
  id: number;
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
