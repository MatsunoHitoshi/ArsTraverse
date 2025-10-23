import { ChatOpenAI } from "@langchain/openai";
import { LLMGraphTransformer } from "@langchain/community/experimental/graph_transformers/llm";
import { textInspect } from "@/app/_utils/text/text-inspector";
import { createExtraNode } from "@/app/_utils/kg/get-nodes-and-relationships-from-result";
import type {
  Extractor,
  ExtractorOptions,
  NodesAndRelationships,
  TransformerSchema,
} from "./base";
import { createId } from "@/app/_utils/cuid/cuid";
import type {
  Relationship,
  Node,
} from "node_modules/@langchain/community/dist/graphs/document";

const additionalInstruction = `
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

export class LangChainExtractor implements Extractor {
  async extract(
    options: ExtractorOptions,
  ): Promise<NodesAndRelationships | null> {
    const { localFilePath, isPlaneTextMode, schema, additionalPrompt } =
      options;
    try {
      console.log(`Starting extraction for file: ${localFilePath}`);
      const llm = new ChatOpenAI({
        temperature: 0.1, // より低い温度で一貫性を向上
        model: "gpt-4o-mini",
        maxTokens: 4000, // より多くのトークンで詳細な抽出を可能にする
      });
      const transformerOptions = schema
        ? {
            llm: llm,
            allowedNodes: schema.allowedNodes,
            allowedRelationships: schema.allowedRelationships,
            nodeProperties: ["name_ja", "name_en"],
            additionalInstructions: `${additionalInstruction}\n${additionalPrompt}`,
          }
        : {
            llm,
            nodeProperties: ["name_ja", "name_en"],
            additionalInstructions: `${additionalInstruction}\n${additionalPrompt}`,
          };
      const llmTransformer = new LLMGraphTransformer(transformerOptions);

      const documents = await textInspect(localFilePath, isPlaneTextMode);
      console.log("documents: ", documents);

      const llmGraphDocuments =
        await llmTransformer.convertToGraphDocuments(documents);

      const nodes: Node[] = [];
      const relationships: Relationship[] = [];
      llmGraphDocuments.map((graphDocument) => {
        console.log(
          "nodes from llm properties: ",
          graphDocument.nodes?.map((node) => node.properties),
        );
        nodes.push(...graphDocument.nodes);
        relationships.push(...graphDocument.relationships);
      });
      console.log(
        `Processing ${nodes.length} nodes (no translation in extractor)...`,
      );

      const newNodes = nodes.map((n) => ({
        id: createId(),
        name: n.id as string,
        label: n.type,
        properties: n.properties || {},
      }));

      console.log(`Completed processing ${newNodes.length} nodes`);
      const nodesAndRelationships = {
        nodes: newNodes,
        relationships: relationships.map((relationship) => {
          const source =
            newNodes.find((newNode) => {
              return newNode.name === relationship.source.id;
            }) ?? createExtraNode(relationship.source.id as string, newNodes);
          const target =
            newNodes.find((newNode) => {
              return newNode.name === relationship.target.id;
            }) ?? createExtraNode(relationship.target.id as string, newNodes);
          return {
            id: createId(),
            sourceName: relationship.source.id as string,
            sourceId: source.id,
            type: relationship.type,
            targetName: relationship.target.id as string,
            targetId: target.id,
            properties: relationship.properties,
          };
        }),
      };

      console.log(
        `Extraction completed successfully: ${nodesAndRelationships.nodes.length} nodes, ${nodesAndRelationships.relationships.length} relationships`,
      );
      return nodesAndRelationships;
    } catch (error) {
      console.error("Graph extraction error:", error);
      console.error("Error details:", {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        localFilePath,
        isPlaneTextMode,
        schema: schema ? "provided" : "not provided",
      });
      throw error;
    }
  }
}
