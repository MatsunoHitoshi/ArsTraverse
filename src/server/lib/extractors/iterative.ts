import { ChatOpenAI } from "@langchain/openai";
import { LLMGraphTransformer } from "@langchain/community/experimental/graph_transformers/llm";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { textInspect } from "@/app/_utils/text/text-inspector";
import { createId } from "@/app/_utils/cuid/cuid";
import { createExtraNode } from "@/app/_utils/kg/get-nodes-and-relationships-from-result";
import util from "util";
import type {
  Extractor,
  ExtractorOptions,
  NodesAndRelationships,
} from "./base";
import { buildMappingPrompt, buildSystemPrompt } from "./base";
import type {
  NodeTypeForFrontend,
  RelationshipTypeForFrontend,
} from "@/app/const/types";
import type {
  Node,
  Relationship,
} from "node_modules/@langchain/community/dist/graphs/document";

export class IterativeGraphExtractor implements Extractor {
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
      console.log(
        `Starting Iterative Extraction (Enhanced with LangChain) for file: ${localFilePath}`,
      );

      const llm = new ChatOpenAI({
        temperature: 0.1,
        model: "gpt-4o-mini", // Using a cost-effective but capable model
        maxTokens: 16000,
      });

      // 1. Prepare Documents
      const documents = await textInspect(localFilePath, isPlaneTextMode);
      console.log(`Loaded ${documents.length} document chunks.`);

      // 2. Phase 1: Initial Discovery (Entities & Direct Relationships)
      console.log("--- Starting Phase 1: Initial Discovery ---");

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

      const transformer1 = new LLMGraphTransformer({
        llm,
        allowedNodes: schema?.allowedNodes,
        allowedRelationships: schema?.allowedRelationships,
        prompt: customPrompt,
      });

      const docsPhase1 = await transformer1.convertToGraphDocuments(documents);

      console.log(
        "docsPhase1 relationships: ",
        util.inspect(
          docsPhase1.map((doc) => doc.relationships),
          {
            depth: null,
            colors: true,
            maxArrayLength: null,
          },
        ),
      );

      console.log(
        "docsPhase1 nodes: ",
        util.inspect(
          docsPhase1.map((doc) => doc.nodes),
          {
            depth: null,
            colors: true,
            maxArrayLength: null,
          },
        ),
      );

      const allNodesMap = new Map<string, Node>();
      const allRelationships: Relationship[] = [];

      // Collect results from Phase 1
      for (const doc of docsPhase1) {
        for (const node of doc.nodes) {
          // Use id (name) as key for deduplication
          if (!allNodesMap.has(node.id.toString())) {
            allNodesMap.set(node.id.toString(), node);
          }
        }
        allRelationships.push(...doc.relationships);
      }

      console.log(
        `Phase 1 complete. Found ${allNodesMap.size} unique nodes and ${allRelationships.length} relationships.`,
      );

      // 3. Phase 2: Contextual Refinement (The "Iterative" Part)
      // We use the discovered entities as context to find missed relationships
      if (allNodesMap.size > 0) {
        console.log("--- Starting Phase 2: Contextual Refinement ---");

        // Construct Entity Context List
        const uniqueNodes = Array.from(allNodesMap.values());
        const entityListString = uniqueNodes
          .map((n) => {
            const ja = n.properties?.name_ja ? `(${n.properties.name_ja})` : "";
            return `- ${n.id} [${n.type}] ${ja}`;
          })
          .join("\n");

        const contextualInfo = `IMPORTANT: The following entities have already been identified in the document set. 
Focus on finding relationships involving these entities that might have been missed in the first pass.

EXISTING ENTITIES:
${entityListString}`;

        const systemPrompt2 = buildSystemPrompt({
          mappingPrompt,
          additionalPrompt,
          contextualInfo,
        });

        const customPrompt2 = ChatPromptTemplate.fromMessages([
          ["system", systemPrompt2],
          [
            "human",
            "Tip: Make sure to answer in the correct format and do not include any explanations. Use the given format to extract information from the following input: {input}",
          ],
        ]);

        const transformer2 = new LLMGraphTransformer({
          llm,
          allowedNodes: schema?.allowedNodes,
          allowedRelationships: schema?.allowedRelationships,
          prompt: customPrompt2,
        });

        // Run extraction again with the global context
        const docsPhase2 =
          await transformer2.convertToGraphDocuments(documents);

        let newRelationsCount = 0;
        for (const doc of docsPhase2) {
          // We primarily care about relationships here, but we also collect nodes in case new ones are found
          // (though we asked to focus on existing ones)
          for (const node of doc.nodes) {
            if (!allNodesMap.has(node.id.toString())) {
              allNodesMap.set(node.id.toString(), node);
            }
          }

          for (const rel of doc.relationships) {
            // Simple deduplication check based on source-type-target
            // This assumes strict string matching, which LLMGraphTransformer usually maintains
            const exists = allRelationships.some(
              (existing) =>
                existing.source.id === rel.source.id &&
                existing.target.id === rel.target.id &&
                existing.type === rel.type,
            );

            if (!exists) {
              allRelationships.push(rel);
              newRelationsCount++;
            }
          }
        }
        console.log(
          `Phase 2 complete. Found ${newRelationsCount} new relationships.`,
        );
      }

      // 4. Construct Final Graph
      const finalNodesRaw = Array.from(allNodesMap.values());
      console.log(
        `Final processing: ${finalNodesRaw.length} nodes, ${allRelationships.length} relationships`,
      );

      const finalNodes: NodeTypeForFrontend[] = finalNodesRaw.map((n) => {
        // すべてのプロパティを保持しつつ、必須プロパティのデフォルト値を設定
        const allProperties = n.properties || {};
        const properties: Record<string, string> = {};

        // 既存のプロパティをすべて文字列としてコピー
        for (const [key, value] of Object.entries(allProperties)) {
          properties[key] = String(value ?? "");
        }

        // 必須プロパティのデフォルト値を設定（既に存在する場合は上書きしない）
        // name_jaとname_enはADDITIONAL_INSTRUCTIONで必須とされているため、デフォルト値を設定
        if (!properties.name_ja) properties.name_ja = "";
        if (!properties.name_en) properties.name_en = "";
        // descriptionは必須ではないため、存在しない場合は追加しない

        return {
          id: createId(),
          name: n.id as string,
          label: n.type,
          properties,
        };
      });

      const finalRelationships: RelationshipTypeForFrontend[] =
        allRelationships.map((rel) => {
          // Map source/target to the new IDs
          const sourceNode =
            finalNodes.find((n) => n.name === rel.source.id) ??
            createExtraNode(
              rel.source.id as string,
              rel.source.type,
              finalNodes,
            ); // Should be rare given we collected all nodes

          const targetNode =
            finalNodes.find((n) => n.name === rel.target.id) ??
            createExtraNode(
              rel.target.id as string,
              rel.target.type,
              finalNodes,
            );

          // すべてのプロパティを保持（descriptionは必須ではないため、存在しない場合は追加しない）
          const allRelProperties = rel.properties || {};
          const relProperties: Record<string, string> = {};

          // 既存のプロパティをすべて文字列としてコピー
          for (const [key, value] of Object.entries(allRelProperties)) {
            relProperties[key] = String(value ?? "");
          }

          // エッジのプロパティには必須プロパティはないため、デフォルト値は設定しない

          return {
            id: createId(),
            sourceId: sourceNode.id,
            targetId: targetNode.id,
            type: rel.type,
            properties: relProperties,
          };
        });

      return {
        nodes: finalNodes,
        relationships: finalRelationships,
      };
    } catch (error) {
      console.error("Iterative extraction failed:", error);
      throw error;
    }
  }
}
