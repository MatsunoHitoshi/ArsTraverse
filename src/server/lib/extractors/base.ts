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
  customMappingRules?: CustomMappingRules;
};

export type TransformerSchema = {
  allowedNodes: string[];
  allowedRelationships: string[];
};

export type TextChunk = {
  text: string;
  type: string;
  startIndex: number;
  endIndex: number;
  suggestedRole: "node" | "node_property" | "edge_property" | "edge" | "ignore";
};

export type MappingRule = {
  chunkIndex: number;
  role: "node" | "node_property" | "edge_property" | "edge" | "ignore";
  nodeLabel?: string;
  propertyName?: string;
  edgePropertyName?: string;
  relationshipType?: string;
};

export type CustomMappingRules = {
  sampleText: string;
  chunks: TextChunk[];
  mappings: MappingRule[];
};

const BASE_SYSTEM_PROMPT = `# Knowledge Graph Extraction Instructions
## 1. Overview
You are a top-tier algorithm for extracting a knowledge graph from text.
Capture as much information as possible WITHOUT sacrificing accuracy. Do not add information that is not explicitly stated or clearly implied by the text.
- **Nodes** represent entities and concepts. Aim for a coherent and densely connected graph.

## 2. Labeling Nodes
- Use basic, general labels (e.g., Person, Organization, Place, Event, Concept, Publication). Avoid overly specific labels such as 'Mathematician' or 'Scientist'.
- **Node IDs**: Node IDs must be the human-readable name found in the text. For Japanese source text, use the original Japanese surface form as the node ID. Never use integers as node IDs.

## 3. Relationships (IMPORTANT)
- Be EXHAUSTIVE: extract ALL meaningful relationships that are stated or clearly implied between entities. Do NOT leave entities isolated when the text connects them.
- If two entities appear together in an interaction, affiliation, location, participation, founding, influence, authorship, or similar, create a relationship between them.
- Use general and timeless relationship types in UPPER_SNAKE_CASE English (e.g., LOCATED_IN, FOUNDED, PARTICIPATED_IN, COLLABORATES_WITH). Avoid specific and momentary types such as 'BECAME_PROFESSOR'.

## 4. Coreference Resolution
- **Maintain Entity Consistency**: If an entity is mentioned multiple times but referred to by different names or pronouns (e.g., "Joe", "he"), always use its most complete identifier as the node ID throughout the graph (e.g., "John Doe").`;

/**
 * LangChainのプロンプトテンプレートで中括弧をエスケープする
 * {variable} を {{variable}} に変換して、変数として解釈されないようにする
 */
export function escapeBraces(text: string): string {
  return text.replace(/\{/g, "{{").replace(/\}/g, "}}");
}

export function buildSystemPrompt(options: {
  mappingPrompt?: string;
  additionalPrompt?: string;
  contextualInfo?: string;
}): string {
  const { mappingPrompt, additionalPrompt, contextualInfo } = options;

  let systemPrompt = BASE_SYSTEM_PROMPT;

  if (mappingPrompt) {
    systemPrompt += `\n${mappingPrompt}`;
  }

  if (additionalPrompt) {
    systemPrompt += `\n${escapeBraces(additionalPrompt)}`;
  }

  if (contextualInfo) {
    systemPrompt += `\n\n## 5. Contextual Refinement
${escapeBraces(contextualInfo)}`;
  }

  return systemPrompt;
}

export function buildMappingPrompt(
  customMappingRules?: CustomMappingRules,
): string {
  if (!customMappingRules || customMappingRules.mappings.length === 0) {
    return "";
  }

  const mappingInstructions: string[] = [];
  mappingInstructions.push(
    "\n=== CUSTOM MAPPING RULES (CRITICAL: YOU MUST FOLLOW THESE RULES) ===\n",
  );

  // サンプルテキストとチャンクの情報を提供
  mappingInstructions.push(
    `Sample Text Context: "${escapeBraces(customMappingRules.sampleText)}"\n`,
  );
  mappingInstructions.push(
    "Apply the following rules to text patterns matching the sample structure:\n",
  );

  // 各マッピングルールを説明
  for (const mapping of customMappingRules.mappings) {
    const chunk = customMappingRules.chunks[mapping.chunkIndex];
    if (!chunk) continue;

    // LangChainのプロンプトテンプレートで中括弧をエスケープ
    const escapedChunkText = escapeBraces(chunk.text);
    const escapedNodeLabel = escapeBraces(mapping.nodeLabel ?? chunk.type);
    const escapedPropertyName = escapeBraces(
      mapping.propertyName ?? chunk.type,
    );
    const escapedEdgePropertyName = escapeBraces(
      mapping.edgePropertyName ?? chunk.type,
    );
    const escapedRelationshipType = escapeBraces(
      mapping.relationshipType ?? chunk.text,
    );

    if (mapping.role === "node") {
      mappingInstructions.push(
        `- Text segment "${escapedChunkText}" MUST be extracted as a NODE with label "${escapedNodeLabel}".`,
      );
    } else if (mapping.role === "node_property") {
      mappingInstructions.push(
        `- Text segment "${escapedChunkText}" MUST be extracted as a property named "${escapedPropertyName}" of the associated node. Do NOT create a separate node for this. You MUST include this property in the node's properties object in your response.`,
      );
    } else if (mapping.role === "edge_property") {
      mappingInstructions.push(
        `- Text segment "${escapedChunkText}" MUST be extracted as a property named "${escapedEdgePropertyName}" of the relationship (edge). Do NOT create a node or node property from this. You MUST include this property in the relationship's properties object in your response.`,
      );
    } else if (mapping.role === "edge") {
      mappingInstructions.push(
        `- Text segment "${escapedChunkText}" determines the RELATIONSHIP TYPE. The relationship type MUST be "${escapedRelationshipType}". Use this to define the edge connection, do not extract as a node.`,
      );
    } else if (mapping.role === "ignore") {
      mappingInstructions.push(
        `- Text segment "${escapedChunkText}" MUST be IGNORED. Do not extract any data from this part.`,
      );
    }
  }

  mappingInstructions.push(
    "\nSTRICTLY follow these mapping rules for all similar text structures found in the document.",
  );

  // プロパティの出力を強調
  const hasNodeProperties = customMappingRules.mappings.some(
    (m) => m.role === "node_property",
  );
  const hasEdgeProperties = customMappingRules.mappings.some(
    (m) => m.role === "edge_property",
  );

  if (hasNodeProperties || hasEdgeProperties) {
    mappingInstructions.push(
      "\nCRITICAL: When extracting properties, you MUST include them in the properties object of the corresponding node or relationship. Properties are NOT optional - they MUST appear in your output.",
    );
  }

  return mappingInstructions.join("\n");
}
