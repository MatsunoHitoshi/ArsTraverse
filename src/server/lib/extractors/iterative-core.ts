import { ChatOpenAI } from "@langchain/openai";
import { LLMGraphTransformer } from "@langchain/community/experimental/graph_transformers/llm";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { createId } from "@/app/_utils/cuid/cuid";
import { createExtraNode } from "@/app/_utils/kg/get-nodes-and-relationships-from-result";
import type {
  ExtractorOptions,
  NodesAndRelationships,
} from "./base";
import { buildLocalContextFromNodes } from "./build-local-context";
import { buildMappingPrompt, buildSystemPrompt } from "./base";
import type {
  NodeTypeForFrontend,
  RelationshipTypeForFrontend,
} from "@/app/const/types";
import type {
  GraphDocument,
  Node,
  Relationship,
} from "node_modules/@langchain/community/dist/graphs/document";
import type { Document } from "@langchain/core/documents";

// Phase1: 初期抽出。ノード/エッジの網羅性が品質を決める工程。
// Phase2: 取りこぼした関係の補完。大規模文書でも安価に回したい工程。
// gpt-4o / gpt-4o-mini は deprecated かつ、gpt-4o-mini は structured output で
// 空を返す不具合が確認されたため、コスト最適な GPT-5.4 mini/nano を既定とする。
// いずれも環境変数で上書き可能。
const PHASE1_MODEL = process.env.KG_PHASE1_MODEL ?? "gpt-5.4-mini";
const PHASE2_MODEL = process.env.KG_PHASE2_MODEL ?? "gpt-5.4-nano";
// reasoning 系モデルの推論強度。コスト・レイテンシ抑制のため既定は "low"。
// 有効値: none | low | medium | high | xhigh(モデル依存)。空文字ならモデル既定に委ねる。
// ※ GPT-5.4 系は "minimal" 非対応(none/low/medium/high/xhigh のみ)。
const PHASE1_REASONING_EFFORT = process.env.KG_PHASE1_REASONING_EFFORT ?? "low";
const PHASE2_REASONING_EFFORT = process.env.KG_PHASE2_REASONING_EFFORT ?? "low";
const FALLBACK_RELATIONSHIP_TYPE = "RELATED_TO";
const EMPTY_GRAPH: NodesAndRelationships = { nodes: [], relationships: [] };

/** reasoning 系(GPT-5 / o シリーズ)は temperature 固定(=1)かつ reasoning_effort を受け付ける。 */
function isReasoningModel(model: string): boolean {
  return /^(gpt-5|o\d)/i.test(model);
}

/**
 * モデル名に応じて ChatOpenAI を生成する。
 * reasoning 系は temperature=1 + reasoning_effort(modelKwargs 経由)を指定し、
 * 非 reasoning 系(gpt-4.1 等)は低 temperature で決定的に抽出する。
 * ※ reasoning_effort はコンストラクタの型に無いため modelKwargs で API へ直接渡す。
 */
function createChatModel(model: string, reasoningEffort: string): ChatOpenAI {
  if (isReasoningModel(model)) {
    const effort = reasoningEffort.trim();
    return new ChatOpenAI({
      model,
      temperature: 1,
      maxTokens: 16000,
      modelKwargs: effort ? { reasoning_effort: effort } : undefined,
    });
  }
  return new ChatOpenAI({
    model,
    temperature: 0.1,
    maxTokens: 16000,
  });
}

export class IterativeGraphExtractorCore {
  private phase1Llm: ChatOpenAI;
  private phase2Llm: ChatOpenAI;

  constructor() {
    this.phase1Llm = createChatModel(PHASE1_MODEL, PHASE1_REASONING_EFFORT);
    this.phase2Llm = createChatModel(PHASE2_MODEL, PHASE2_REASONING_EFFORT);
  }

  // Helper to build context string from frontend nodes
  buildContextFromNodes(nodes: NodeTypeForFrontend[]): string {
    return nodes
      .map((n) => {
        const ja = n.properties?.name_ja ? `(${n.properties.name_ja})` : "";
        return `- ${n.name} [${n.label}] ${ja}`;
      })
      .join("\n");
  }

  // Helper to merge two graph results
  mergeResults(
    r1: NodesAndRelationships,
    r2: NodesAndRelationships,
  ): NodesAndRelationships {
    const nodesMap = new Map<string, NodeTypeForFrontend>();
    const relsMap = new Map<string, RelationshipTypeForFrontend>();

    // Add r1
    r1.nodes.forEach((n) => nodesMap.set(n.name, n));
    r1.relationships.forEach((r) => relsMap.set(r.id, r));

    // Add r2 (new nodes if any, and new relationships)
    r2.nodes.forEach((n) => {
      if (!nodesMap.has(n.name)) nodesMap.set(n.name, n);
    });

    r2.relationships.forEach((r) => {
      // For relationships, we need to match source/target by name, not ID,
      // because IDs in r2 will be different from r1 even for the same logical node.
      // But r2 relationships already have IDs for source/target that point to r2 nodes.
      // And r2 nodes have names.

      const sourceNodeR2 = r2.nodes.find((n) => n.id === r.sourceId);
      const targetNodeR2 = r2.nodes.find((n) => n.id === r.targetId);

      if (!sourceNodeR2 || !targetNodeR2) return;

      // Find corresponding nodes in the merged map (from r1 or added from r2)
      const sourceNodeMerged = nodesMap.get(sourceNodeR2.name);
      const targetNodeMerged = nodesMap.get(targetNodeR2.name);

      if (!sourceNodeMerged || !targetNodeMerged) return;

      // Check if this relationship already exists in the merged set
      // We check by type and source/target names (implicitly via merged nodes)

      const newSourceId = sourceNodeMerged.id;
      const newTargetId = targetNodeMerged.id;

      const alreadyExists = Array.from(relsMap.values()).some(
        (existing) =>
          existing.type === r.type &&
          existing.sourceId === newSourceId &&
          existing.targetId === newTargetId,
      );

      if (!alreadyExists) {
        // Add new relationship with updated IDs pointing to merged nodes
        const newRel: RelationshipTypeForFrontend = {
          ...r,
          id: createId(), // New ID for the merged relationship
          sourceId: newSourceId,
          targetId: newTargetId,
        };
        relsMap.set(newRel.id, newRel);
      }
    });

    return {
      nodes: Array.from(nodesMap.values()),
      relationships: Array.from(relsMap.values()),
    };
  }

  // --- Public Methods for Granular Execution ---

  async extractPhase1(
    documents: Document[],
    options: ExtractorOptions,
  ): Promise<NodesAndRelationships> {
    const { schema, additionalPrompt, customMappingRules } = options;

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

    const transformer = new LLMGraphTransformer({
      llm: this.phase1Llm,
      allowedNodes: schema?.allowedNodes,
      allowedRelationships: schema?.allowedRelationships,
      prompt: customPrompt,
      fallbackRelationshipType: FALLBACK_RELATIONSHIP_TYPE,
    });

    const graphDocuments: GraphDocument[] = [];
    for (const document of documents) {
      try {
        const docs = await transformer.convertToGraphDocuments([document]);
        graphDocuments.push(...docs);
      } catch (error) {
        console.error("[KG Phase1] chunk extraction failed:", error);
      }
    }
    return this.convertToFrontendFormat(graphDocuments);
  }

  async extractPhase2(
    documents: Document[],
    phase1Nodes: NodeTypeForFrontend[],
    options: ExtractorOptions,
  ): Promise<NodesAndRelationships> {
    console.log("--- Starting Phase 2: Contextual Refinement ---");

    const chunkResults = await Promise.all(
      documents.map((document) => {
        const localContext = buildLocalContextFromNodes(
          document.pageContent,
          phase1Nodes,
        );
        return this.extractPhase2ForDocument(document, localContext, options);
      }),
    );

    let merged: NodesAndRelationships = { nodes: [], relationships: [] };
    for (const chunkResult of chunkResults) {
      merged = this.mergeResults(merged, chunkResult);
    }

    return merged;
  }

  private async extractPhase2ForDocument(
    document: Document,
    contextualInfo: string,
    options: ExtractorOptions,
  ): Promise<NodesAndRelationships> {
    const { schema, additionalPrompt, customMappingRules } = options;

    const mappingPrompt = buildMappingPrompt(customMappingRules);
    const fullContext = contextualInfo.trim()
      ? `The following entities were already identified in this text segment:
${contextualInfo}

Re-read the text and extract ALL relationships among these entities and any additional entities you find.
It is fine to include relationships that may already exist; duplicates are de-duplicated later.
Maximize correct relationship coverage.`
      : `Re-read the text and extract ALL relationships among the entities mentioned.
Maximize correct relationship coverage; duplicates are de-duplicated later.`;

    const systemPrompt = buildSystemPrompt({
      mappingPrompt,
      additionalPrompt,
      contextualInfo: fullContext,
    });

    const customPrompt = ChatPromptTemplate.fromMessages([
      ["system", systemPrompt],
      [
        "human",
        "Tip: Make sure to answer in the correct format and do not include any explanations. Use the given format to extract information from the following input: {input}",
      ],
    ]);

    const transformer = new LLMGraphTransformer({
      llm: this.phase2Llm,
      allowedNodes: schema?.allowedNodes,
      allowedRelationships: schema?.allowedRelationships,
      prompt: customPrompt,
      fallbackRelationshipType: FALLBACK_RELATIONSHIP_TYPE,
    });

    try {
      const graphDocuments = await transformer.convertToGraphDocuments([
        document,
      ]);
      return this.convertToFrontendFormat(graphDocuments);
    } catch (error) {
      console.error("[KG Phase2] chunk extraction failed:", error);
      return EMPTY_GRAPH;
    }
  }

  // Helper to convert LangChain GraphDocuments to Frontend format
  private convertToFrontendFormat(
    docs: GraphDocument[],
  ): NodesAndRelationships {
    const allNodesMap = new Map<string, Node>();
    const allRelationships: Relationship[] = [];

    for (const doc of docs) {
      for (const node of doc.nodes) {
        if (node.id === null || node.id === undefined) continue;
        const key = node.id.toString();
        if (key.trim() === "") continue;
        if (!allNodesMap.has(key)) {
          allNodesMap.set(key, node);
        }
      }
      allRelationships.push(...doc.relationships);
    }

    // LLM が稀に id(=ノード名)が空/undefined のノード・関係を返すため、
    // name を必ず非空文字列に正規化し、無効なものはスキップする(finalizeGraph の Zod 検証対策)。
    const toName = (value: unknown): string =>
      value === null || value === undefined ? "" : String(value).trim();

    const finalNodesRaw = Array.from(allNodesMap.values());
    const finalNodes: NodeTypeForFrontend[] = finalNodesRaw
      .map((n) => {
        const allProperties = n.properties || {};
        const properties: Record<string, string> = {};

        for (const [key, value] of Object.entries(allProperties)) {
          properties[key] = String(value ?? "");
        }

        if (!properties.name_ja) properties.name_ja = "";
        if (!properties.name_en) properties.name_en = "";

        return {
          id: createId(),
          name: toName(n.id),
          label: n.type,
          properties,
        };
      })
      .filter((n) => n.name !== "");

    const finalRelationships: RelationshipTypeForFrontend[] =
      allRelationships.flatMap((rel) => {
        const sourceName = toName(rel.source?.id);
        const targetName = toName(rel.target?.id);

        // 端点の名前が無い関係は有効なノードを特定できないためスキップ
        if (sourceName === "" || targetName === "") {
          return [];
        }

        const sourceNode =
          finalNodes.find((n) => n.name === sourceName) ??
          createExtraNode(sourceName, rel.source.type, finalNodes);

        // Ensure sourceNode exists and is added to finalNodes if created via createExtraNode
        if (!finalNodes.find((n) => n.id === sourceNode.id)) {
          finalNodes.push(sourceNode);
        }

        const targetNode =
          finalNodes.find((n) => n.name === targetName) ??
          createExtraNode(targetName, rel.target.type, finalNodes);

        // Ensure targetNode exists and is added to finalNodes if created via createExtraNode
        if (!finalNodes.find((n) => n.id === targetNode.id)) {
          finalNodes.push(targetNode);
        }

        const allRelProperties = rel.properties || {};
        const relProperties: Record<string, string> = {};

        for (const [key, value] of Object.entries(allRelProperties)) {
          relProperties[key] = String(value ?? "");
        }

        return [
          {
            id: createId(),
            sourceId: sourceNode.id,
            targetId: targetNode.id,
            type: rel.type,
            properties: relProperties,
          },
        ];
      });

    // Debug logging to check for data integrity
    console.log(`[DEBUG] Finalizing Graph Data:`);
    console.log(`- Total Nodes: ${finalNodes.length}`);
    console.log(`- Total Relationships: ${finalRelationships.length}`);

    const invalidRels = finalRelationships.filter((r) => {
      const src = finalNodes.find((n) => n.id === r.sourceId);
      const tgt = finalNodes.find((n) => n.id === r.targetId);
      return !src || !tgt;
    });

    if (invalidRels.length > 0) {
      console.error(
        `[ERROR] Found ${invalidRels.length} relationships with missing nodes!`,
      );
      invalidRels.forEach((r) => {
        console.error(
          `  - Rel ID: ${r.id}, Type: ${r.type}, Source: ${r.sourceId}, Target: ${r.targetId}`,
        );
      });
    } else {
      console.log(`[DEBUG] All relationships have valid source/target nodes.`);
    }

    return {
      nodes: finalNodes,
      relationships: finalRelationships,
    };
  }
}
