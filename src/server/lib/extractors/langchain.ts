import { ChatOpenAI } from "@langchain/openai";
import { LLMGraphTransformer } from "@langchain/community/experimental/graph_transformers/llm";
import { textInspect } from "@/app/_utils/text/text-inspector";
import type {
  Node,
  Relationship,
} from "node_modules/@langchain/community/dist/graphs/graph_document";
import { createExtraNode } from "@/app/_utils/kg/get-nodes-and-relationships-from-result";
import type {
  Extractor,
  NodesAndRelationships,
  TransformerSchema,
} from "./base";
import { createId } from "@/app/_utils/cuid/cuid";

export class LangChainExtractor implements Extractor {
  async extract(
    localFilePath: string,
    isPlaneTextMode: boolean,
    schema?: TransformerSchema,
  ): Promise<NodesAndRelationships | null> {
    const llm = new ChatOpenAI({ temperature: 0.3, model: "gpt-4o-mini" });
    const transformerOptions = schema
      ? {
          llm: llm,
          allowedNodes: schema.allowedNodes,
          allowedRelationships: schema.allowedRelationships,
        }
      : { llm };
    const llmTransformer = new LLMGraphTransformer(transformerOptions);

    const documents = await textInspect(localFilePath, isPlaneTextMode);
    console.log("documents: ", documents);

    const llmGraphDocuments =
      await llmTransformer.convertToGraphDocuments(documents);

    const nodes: Node[] = [];
    const relationships: Relationship[] = [];
    llmGraphDocuments.map((graphDocument) => {
      console.log("nodes from llm: ", graphDocument.nodes);
      console.log("links from llm: ", graphDocument.relationships);
      nodes.push(...graphDocument.nodes);
      relationships.push(...graphDocument.relationships);
    });
    const newNodes = nodes.map((node) => {
      console.log("id: ", node.id);
      console.log("type: ", node.type);
      console.log("lc_attributes: ", node.lc_attributes);
      console.log("lc_aliases: ", node.lc_aliases);
      console.log("lc_kwargs: ", node.lc_kwargs);
      console.log("lc_namespace: ", node.lc_namespace);
      console.log("lc_secrets: ", node.lc_secrets);
      console.log("properties: ", node.properties);
      console.log("---");
      return {
        id: createId(),
        name: node.id as string,
        label: node.type,
        properties: node.properties,
      };
    });
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

    return nodesAndRelationships;
  }
}
