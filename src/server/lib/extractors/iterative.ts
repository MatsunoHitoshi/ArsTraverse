import { ChatOpenAI } from "@langchain/openai";
import { LLMGraphTransformer } from "@langchain/community/experimental/graph_transformers/llm";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { textInspect } from "@/app/_utils/text/text-inspector";
import { createId } from "@/app/_utils/cuid/cuid";
import { createExtraNode } from "@/app/_utils/kg/get-nodes-and-relationships-from-result";
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
  GraphDocument,
  Node,
  Relationship,
} from "node_modules/@langchain/community/dist/graphs/document";
import type { Document } from "@langchain/core/documents";

export class IterativeGraphExtractor implements Extractor {
  private llm: ChatOpenAI;

  constructor() {
    this.llm = new ChatOpenAI({
      temperature: 0.1,
      model: "gpt-4o", // Using a cost-effective but capable model
      maxTokens: 16000,
    });
  }

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

      // 1. Prepare Documents
      const documents = await textInspect(localFilePath, isPlaneTextMode);
      console.log(`Loaded ${documents.length} document chunks.`);

      // 2. Phase 1: Initial Discovery
      const phase1Result = await this.extractPhase1(documents, options);

      const allNodesMap = new Map<string, Node>();
      const allRelationships: Relationship[] = [];

      // Collect results from Phase 1
      for (const node of phase1Result.nodes) {
        // We need to convert back to internal Node structure or keep it as intermediate
        // For simplicity in this wrapper, let's just reuse the internal types if possible
        // But extractPhase1 returns NodesAndRelationships (frontend types).
        // This makes the wrapper a bit inefficient if we convert back and forth.
        // So I will implement extractPhase1Internal that returns internal types.
      }

      // Actually, to avoid breaking changes and double conversion,
      // let's keep the logic inside `extract` using the new public methods logic
      // but maybe just call them directly if we want to support the "monolithic" execution.

      // Let's reimplement `extract` to orchestrate Phase 1 and Phase 2 using the same logic
      // but without the network overhead of splitting.

      // However, the internal methods `extractPhase1` and `extractPhase2` will need to return
      // internal structures (LangChain Node/Relationship) to be useful for the second phase context building.
      // But the Requirement says "Add extractPhase1 procedure... Output: nodes and relationships".
      // The tRPC procedure needs to return frontend types.

      // Let's implement `extractPhase1` and `extractPhase2` to return `NodesAndRelationships` (Frontend types).
      // And `extract` will just call them sequentially.
      // But wait, Phase 2 needs "context" which is derived from Phase 1.
      // If Phase 1 returns frontend types, we can construct the context from them.

      // Phase 1 execution
      const phase1Data = await this.extractPhase1(documents, options);
      if (!phase1Data) return null;

      // Build context from Phase 1
      const context = this.buildContextFromNodes(phase1Data.nodes);

      // Phase 2 execution
      const phase2Data = await this.extractPhase2(documents, context, options);
      if (!phase2Data) return phase1Data;

      // Merge results
      return this.mergeResults(phase1Data, phase2Data);
    } catch (error) {
      console.error("Iterative extraction failed:", error);
      throw error;
    }
  }

  // Helper to build context string from frontend nodes
  private buildContextFromNodes(nodes: NodeTypeForFrontend[]): string {
    return nodes
      .map((n) => {
        const ja = n.properties?.name_ja ? `(${n.properties.name_ja})` : "";
        return `- ${n.name} [${n.label}] ${ja}`;
      })
      .join("\n");
  }

  // Helper to merge two graph results
  private mergeResults(
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
      llm: this.llm,
      allowedNodes: schema?.allowedNodes,
      allowedRelationships: schema?.allowedRelationships,
      prompt: customPrompt,
    });

    const graphDocuments = await transformer.convertToGraphDocuments(documents);
    return this.convertToFrontendFormat(graphDocuments);
  }

  async extractPhase2(
    documents: Document[],
    contextualInfo: string,
    options: ExtractorOptions,
  ): Promise<NodesAndRelationships> {
    const { schema, additionalPrompt, customMappingRules } = options;

    console.log("--- Starting Phase 2: Contextual Refinement ---");

    const mappingPrompt = buildMappingPrompt(customMappingRules);
    const fullContext = `IMPORTANT: The following entities have already been identified in the document set. 
Focus on finding relationships involving these entities that might have been missed in the first pass.

EXISTING ENTITIES:
${contextualInfo}`;

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
      llm: this.llm,
      allowedNodes: schema?.allowedNodes,
      allowedRelationships: schema?.allowedRelationships,
      prompt: customPrompt,
    });

    const graphDocuments = await transformer.convertToGraphDocuments(documents);
    return this.convertToFrontendFormat(graphDocuments);
  }

  // Helper to convert LangChain GraphDocuments to Frontend format
  private convertToFrontendFormat(
    docs: GraphDocument[],
  ): NodesAndRelationships {
    const allNodesMap = new Map<string, Node>();
    const allRelationships: Relationship[] = [];

    for (const doc of docs) {
      for (const node of doc.nodes) {
        if (!allNodesMap.has(node.id.toString())) {
          allNodesMap.set(node.id.toString(), node);
        }
      }
      allRelationships.push(...doc.relationships);
    }

    const finalNodesRaw = Array.from(allNodesMap.values());
    const finalNodes: NodeTypeForFrontend[] = finalNodesRaw.map((n) => {
      const allProperties = n.properties || {};
      const properties: Record<string, string> = {};

      for (const [key, value] of Object.entries(allProperties)) {
        properties[key] = String(value ?? "");
      }

      if (!properties.name_ja) properties.name_ja = "";
      if (!properties.name_en) properties.name_en = "";

      return {
        id: createId(),
        name: n.id as string,
        label: n.type,
        properties,
      };
    });

    const finalRelationships: RelationshipTypeForFrontend[] =
      allRelationships.map((rel) => {
        const sourceNode =
          finalNodes.find((n) => n.name === rel.source.id) ??
          createExtraNode(rel.source.id as string, rel.source.type, finalNodes);

        // Ensure sourceNode exists and is added to finalNodes if created via createExtraNode
        if (!finalNodes.find((n) => n.id === sourceNode.id)) {
          finalNodes.push(sourceNode);
        }

        const targetNode =
          finalNodes.find((n) => n.name === rel.target.id) ??
          createExtraNode(rel.target.id as string, rel.target.type, finalNodes);

        // Ensure targetNode exists and is added to finalNodes if created via createExtraNode
        if (!finalNodes.find((n) => n.id === targetNode.id)) {
          finalNodes.push(targetNode);
        }

        const allRelProperties = rel.properties || {};
        const relProperties: Record<string, string> = {};

        for (const [key, value] of Object.entries(allRelProperties)) {
          relProperties[key] = String(value ?? "");
        }

        return {
          id: createId(),
          sourceId: sourceNode.id,
          targetId: targetNode.id,
          type: rel.type,
          properties: relProperties,
        };
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
