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

export const ADDITIONAL_INSTRUCTION = `
CRITICAL REQUIREMENT: For EVERY node extracted, you MUST provide BOTH name_ja and name_en properties.

RULES:
1. If a name appears in Japanese text, extract it as name_ja and translate it to English for name_en
2. If a name appears in English text, extract it as name_en and translate it to Japanese for name_ja
3. If a name appears in both languages, use the original text for the appropriate property
4. For proper nouns (people, places, organizations), use official translations when available
5. For concepts and terms, provide accurate translations that maintain meaning
6. NEVER leave name_ja or name_en empty - always provide both properties
7. Use consistent naming conventions (e.g., "ヨーゼフ・ボイス" for name_ja, "Joseph Beuys" for name_en)

EXAMPLE:
- Input: "ヨーゼフ・ボイスはドイツの芸術家です"
- Output: { name_ja: "ヨーゼフ・ボイス", name_en: "Joseph Beuys" }

- Input: "Joseph Beuys was a German artist"
- Output: { name_ja: "ヨーゼフ・ボイス", name_en: "Joseph Beuys" }

Relationships must be expressed in uppercase English (e.g., HAS_ROOMMATE, WORKS_AT, LOCATED_IN).
`;

const BASE_SYSTEM_PROMPT = `# Knowledge Graph Instructions for GPT-4
## 1. Overview
You are a top-tier algorithm designed for extracting information in structured formats to build a knowledge graph.
Try to capture as much information from the text as possible without sacrificing accuracy. Do not add any information that is not explicitly mentioned in the text
- **Nodes** represent entities and concepts.
- The aim is to achieve simplicity and clarity in the knowledge graph, making it accessible for a vast audience.

## 2. Labeling Nodes
- **Consistency**: Ensure you use available types for node labels.
Ensure you use basic or elementary types for node labels.
- For example, when you identify an entity representing a person, always label it as **'person'**. Avoid using more specific terms like 'mathematician' or 'scientist'
- **Node IDs**: Never utilize integers as node IDs. Node IDs should be names or human-readable identifiers found in the text.
- **Relationships** represent connections between entities or concepts.
Ensure consistency and generality in relationship types when constructing knowledge graphs. Instead of using specific and momentary types such as 'BECAME_PROFESSOR', use more general and timeless relationship types like 'PROFESSOR'. Make sure to use general and timeless relationship types!

## 3. Properties Format
- **CRITICAL**: When returning node or relationship properties, you MUST format them as an array of objects with "key" and "value" fields.
- Example: properties must be an array like: [{{key: "name", value: "Alice"}}, {{key: "age", value: "25"}}]
- DO NOT use object notation like {{name: "Alice", age: "25"}} - this will cause errors.
- All property values must be strings.

## 4. Coreference Resolution
- **Maintain Entity Consistency**: When extracting entities, it's vital to ensure consistency.
If an entity, such as "John Doe", is mentioned multiple times in the text but is referred to by different names or pronouns (e.g., "Joe", "he"), always use the most complete identifier for that entity throughout the knowledge graph. In this example, use "John Doe" as the entity ID.
Remember, the knowledge graph should be coherent and easily understandable, so maintaining consistency in entity references is crucial.`;

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

  systemPrompt += `\n\n## ${contextualInfo ? "5" : "4"}. Additional Requirements
${escapeBraces(ADDITIONAL_INSTRUCTION)}`;

  if (mappingPrompt) {
    systemPrompt += `\n${mappingPrompt}`;
  }

  if (additionalPrompt) {
    systemPrompt += `\n${escapeBraces(additionalPrompt)}`;
  }

  if (contextualInfo) {
    systemPrompt += `\n\n## 6. Contextual Refinement
${escapeBraces(contextualInfo)}`;
  }

  systemPrompt += `\n\n## ${contextualInfo ? "7" : "6"}. Strict Compliance
Adhere to the rules strictly. Non-compliance will result in termination.`;

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
