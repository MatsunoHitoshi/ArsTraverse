import { ChatOpenAI } from "@langchain/openai";
import { LLMGraphTransformer } from "@langchain/community/experimental/graph_transformers/llm";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { textInspect } from "@/app/_utils/text/text-inspector";
import { createExtraNode } from "@/app/_utils/kg/get-nodes-and-relationships-from-result";
import type {
  Extractor,
  ExtractorOptions,
  NodesAndRelationships,
} from "./base";
import { buildMappingPrompt, buildSystemPrompt } from "./base";
import { createId } from "@/app/_utils/cuid/cuid";
import type {
  Relationship,
  Node,
} from "node_modules/@langchain/community/dist/graphs/document";

export class LangChainExtractor implements Extractor {
  async extract(
    options: ExtractorOptions,
  ): Promise<NodesAndRelationships | null> {
    const {
      localFilePath,
      isPlaneTextMode,
      schema,
      additionalPrompt,
      customMappingRules,
    } = options;
    try {
      console.log(`Starting extraction for file: ${localFilePath}`);
      const llm = new ChatOpenAI({
        temperature: 0.1, // より低い温度で一貫性を向上
        model: "gpt-4o-mini",
        maxTokens: 16000, // より多くのトークンで詳細な抽出を可能にする
      });

      const mappingPrompt = buildMappingPrompt(customMappingRules);
      const systemPrompt = buildSystemPrompt({
        mappingPrompt,
        additionalPrompt,
      });

      const customPrompt = ChatPromptTemplate.fromMessages([
        ["system", systemPrompt],
        [
          "human",
          "Tip: Make sure to answer in the correct format and do not include any explanations. Use the given format to extract information from the following input: {input}",
        ],
      ]);

      const transformerOptions = schema
        ? {
            llm: llm,
            allowedNodes: schema.allowedNodes,
            allowedRelationships: schema.allowedRelationships,
            prompt: customPrompt,
          }
        : {
            llm,
            prompt: customPrompt,
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
            }) ??
            createExtraNode(
              relationship.source.id as string,
              relationship.source.type,
              newNodes,
            );
          const target =
            newNodes.find((newNode) => {
              return newNode.name === relationship.target.id;
            }) ??
            createExtraNode(
              relationship.target.id as string,
              relationship.target.type,
              newNodes,
            );
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
