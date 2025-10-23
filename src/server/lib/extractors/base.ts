import type {
  NodeTypeForFrontend,
  RelationshipTypeForFrontend,
} from "@/app/const/types";

export type NodesAndRelationships = {
  nodes: NodeTypeForFrontend[];
  relationships: RelationshipTypeForFrontend[];
};

export interface Extractor {
  extract({
    localFilePath,
    isPlaneTextMode,
    schema,
    additionalPrompt,
  }: ExtractorOptions): Promise<NodesAndRelationships | null>;
}

export type ExtractorOptions = {
  localFilePath: string;
  isPlaneTextMode: boolean;
  schema?: TransformerSchema;
  additionalPrompt?: string;
};

export type TransformerSchema = {
  allowedNodes: string[];
  allowedRelationships: string[];
};
