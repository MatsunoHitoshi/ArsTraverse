import type {
  NodeTypeForFrontend,
  RelationshipTypeForFrontend,
} from "@/app/const/types";

export type NodesAndRelationships = {
  nodes: NodeTypeForFrontend[];
  relationships: RelationshipTypeForFrontend[];
};

export interface Extractor {
  extract(
    localFilePath: string,
    isPlaneTextMode: boolean,
    schema?: TransformerSchema,
  ): Promise<NodesAndRelationships | null>;
}

export type TransformerSchema = {
  allowedNodes: string[];
  allowedRelationships: string[];
};
