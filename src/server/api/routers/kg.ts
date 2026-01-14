import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { z } from "zod";
import { writeLocalFileFromUrl } from "@/app/_utils/sys/file";
import type {
  NodeDiffType,
  RelationshipDiffType,
} from "@/app/_utils/kg/get-nodes-and-relationships-from-result";
import { textInspect } from "@/app/_utils/text/text-inspector";
import {
  attachGraphProperties,
  dataDisambiguation,
  fuseGraphs,
} from "@/app/_utils/kg/data-disambiguation";
import {
  GraphChangeEntityType,
  GraphChangeRecordType,
  GraphChangeType,
  type GraphNode,
  type GraphRelationship,
} from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { diffNodes, diffRelationships } from "@/app/_utils/kg/diff";
import type { Extractor } from "@/server/lib/extractors/base";
import { AssistantsApiExtractor } from "@/server/lib/extractors/assistants";
import { LangChainExtractor } from "@/server/lib/extractors/langchain";
import { IterativeGraphExtractor } from "@/server/lib/extractors/iterative";
import { getNeighborNodes } from "@/app/_utils/kg/get-tree-layout-data";
import {
  formGraphDataForFrontend,
  formNodeDataForFrontend,
  formRelationshipDataForFrontend,
} from "@/app/_utils/kg/frontend-properties";
import { KnowledgeGraphInputSchema } from "../schemas/knowledge-graph";
import { completeTranslateProperties } from "@/app/_utils/kg/node-name-translation";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage } from "@langchain/core/messages";
import type { TextChunk } from "@/server/lib/extractors/base";
import type {
  NodeTypeForFrontend,
  RelationshipTypeForFrontend,
} from "@/app/const/types";
// import type { Prisma } from "@prisma/client";
// import { GraphDataStatus } from "@prisma/client";
// import { stripGraphData } from "@/app/_utils/kg/data-strip";

const ExtractInputSchema = z.object({
  fileUrl: z.string().url(),
  extractMode: z.string().optional(),
  isPlaneTextMode: z.boolean(),
  additionalPrompt: z.string().optional(),
  customMappingRules: z
    .object({
      sampleText: z.string(),
      chunks: z.array(
        z.object({
          text: z.string(),
          type: z.string(),
          startIndex: z.number(),
          endIndex: z.number(),
          suggestedRole: z.enum([
            "node",
            "node_property",
            "edge_property",
            "edge",
            "ignore",
          ]),
        }),
      ),
      mappings: z.array(
        z.object({
          chunkIndex: z.number(),
          role: z.enum([
            "node",
            "node_property",
            "edge_property",
            "edge",
            "ignore",
          ]),
          nodeLabel: z.string().optional(),
          propertyName: z.string().optional(),
          edgePropertyName: z.string().optional(),
          relationshipType: z.string().optional(),
        }),
      ),
    })
    .optional(),
});

const AnalyzeTextStructureInputSchema = z.object({
  sampleText: z.string(),
});

const ConvertToEdgeTypeInputSchema = z.object({
  text: z.string(),
});

const TestInspectInputSchema = z.object({
  fileUrl: z.string().url(),
  isPlaneTextMode: z.boolean(),
});

const IntegrateGraphInputSchema = z.object({
  topicSpaceId: z.string(),
  graphDocument: KnowledgeGraphInputSchema,
});

const GetNodesByIdsInputSchema = z.object({
  nodeIds: z.array(z.string()),
});

const GetRelatedNodesInputSchema = z.object({
  nodeId: z.string(),
  contextId: z.string(),
  contextType: z.enum(["topicSpace", "document"]),
});

const DocumentSchema = z.object({
  pageContent: z.string(),
  metadata: z.record(z.any()),
});

const ExtractPhase1InputSchema = z.object({
  documents: z.array(DocumentSchema),
  schema: z
    .object({
      allowedNodes: z.array(z.string()),
      allowedRelationships: z.array(z.string()),
    })
    .optional(),
  additionalPrompt: z.string().optional(),
  customMappingRules: ExtractInputSchema.shape.customMappingRules,
});

const ExtractPhase2InputSchema = ExtractPhase1InputSchema.extend({
  contextualInfo: z.string(),
});

const NodeInputSchema = z.object({
  id: z.string(),
  name: z.string(),
  label: z.string(),
  properties: z.record(z.string()),
});

const RelationshipInputSchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  targetId: z.string(),
  type: z.string(),
  properties: z.record(z.string()),
});

const FinalizeGraphInputSchema = z.object({
  nodes: z.array(NodeInputSchema),
  relationships: z.array(RelationshipInputSchema),
});

export type NodeSchema = {
  entity: string;
  type: string;
};

export const kgRouter = createTRPCRouter({
  finalizeGraph: publicProcedure
    .input(FinalizeGraphInputSchema)
    .mutation(async ({ input }) => {
      const { nodes, relationships } = input;

      try {
        const normalizedNodesAndRelationships = {
          nodes: nodes.map((n) => ({
            id: n.id,
            name: n.name,
            label: n.label,
            properties: n.properties ?? {},
            documentGraphId: null,
            topicSpaceId: null,
            createdAt: null,
            updatedAt: null,
            deletedAt: null,
          })),
          relationships: relationships.map((r) => ({
            id: r.id,
            type: r.type,
            properties: r.properties ?? {},
            fromNodeId: r.sourceId,
            toNodeId: r.targetId,
            documentGraphId: null,
            topicSpaceId: null,
            createdAt: null,
            updatedAt: null,
            deletedAt: null,
          })),
        };

        const disambiguatedNodesAndRelationships = dataDisambiguation(
          normalizedNodesAndRelationships,
        );
        const graphDocument = await completeTranslateProperties(
          disambiguatedNodesAndRelationships,
        );
        return {
          data: {
            graph: formGraphDataForFrontend(graphDocument),
          },
        };
      } catch (error) {
        console.error("Graph finalization failed:", error);
        return {
          data: { graph: null, error: "グラフ構築エラー" },
        };
      }
    }),

  extractPhase1: publicProcedure
    .input(ExtractPhase1InputSchema)
    .mutation(async ({ input }) => {
      const { documents, schema, additionalPrompt, customMappingRules } = input;

      try {
        const extractor = new IterativeGraphExtractor();
        const nodesAndRelationships = await extractor.extractPhase1(documents, {
          localFilePath: "", // Not used in phase 1 direct call
          isPlaneTextMode: false, // Not used
          schema,
          additionalPrompt,
          customMappingRules,
        });

        return {
          data: {
            nodes: nodesAndRelationships.nodes,
            relationships: nodesAndRelationships.relationships,
          },
        };
      } catch (error) {
        console.error("Phase 1 extraction failed:", error);
        return {
          data: {
            nodes: [],
            relationships: [],
            error: "Phase 1 extraction failed",
          },
        };
      }
    }),

  extractPhase2: publicProcedure
    .input(ExtractPhase2InputSchema)
    .mutation(async ({ input }) => {
      const {
        documents,
        contextualInfo,
        schema,
        additionalPrompt,
        customMappingRules,
      } = input;

      try {
        const extractor = new IterativeGraphExtractor();
        const nodesAndRelationships = await extractor.extractPhase2(
          documents,
          contextualInfo,
          {
            localFilePath: "",
            isPlaneTextMode: false,
            schema,
            additionalPrompt,
            customMappingRules,
          },
        );

        return {
          data: {
            nodes: nodesAndRelationships.nodes,
            relationships: nodesAndRelationships.relationships,
          },
        };
      } catch (error) {
        console.error("Phase 2 extraction failed:", error);
        return {
          data: {
            nodes: [],
            relationships: [],
            error: "Phase 2 extraction failed",
          },
        };
      }
    }),

  getNodesByIds: protectedProcedure
    .input(GetNodesByIdsInputSchema)
    .query(async ({ ctx, input }) => {
      const nodes = await ctx.db.graphNode.findMany({
        where: {
          id: {
            in: input.nodeIds,
          },
          deletedAt: null,
        },
      });

      return nodes.map((node) => formNodeDataForFrontend(node));
    }),

  analyzeTextStructure: publicProcedure
    .input(AnalyzeTextStructureInputSchema)
    .mutation(async ({ input }) => {
      const { sampleText } = input;

      try {
        const llm = new ChatOpenAI({
          temperature: 0.0,
          model: "gpt-4o-mini",
          maxTokens: 2000,
        });

        const prompt = `Break down the following text into semantic chunks (segments). For each chunk, provide the text content, position information, and a recommended role in the knowledge graph (node, node property, edge property, or ignore).

Text: "${sampleText}"

Output format (JSON):
{
  "chunks": [
    {
      "text": "chunk text",
      "type": "chunk type (e.g., date, category, event, location, description, etc.)",
      "startIndex": start position (character count),
      "endIndex": end position (character count),
      "suggestedRole": "node" | "node_property" | "edge_property" | "edge" | "ignore"
    }
  ]
}

Important formatting rules:
- Node labels MUST always be in English PascalCase (e.g., Person, Event, Location, Organization)
- Edge types MUST always be in UPPER_SNAKE_CASE (e.g., HAS_ROOMMATE, WORKS_AT, OCCURRED_ON, LOCATED_IN)
- The "type" field should reflect the semantic category of the chunk, not the formatting

Guidelines:
- Split the text into semantically meaningful units
- Separate different types of information (dates, locations, categories, event names, etc.) into different chunks
- suggestedRole should indicate how the information should be treated in the knowledge graph:
  - "node": Information that should be treated as an independent node (e.g., event names, location names, subjects or objects in sentences). The type should be in PascalCase English.
  - "node_property": Information that should be treated as a node property (e.g., descriptions, details)
  - "edge_property": Information that should be treated as a relationship (edge) property (e.g., dates, occurrence times, durations)
  - "edge": Information that determines the relationship type (e.g., categories, keywords indicating relationship types, predicates in sentences). The type should be in UPPER_SNAKE_CASE English.
  - "ignore": Information that should not be included in the graph`;

        const response = await llm.invoke([new HumanMessage(prompt)]);
        const responseText = response.content as string;

        // JSONを抽出（マークダウンコードブロックからも抽出可能）
        let jsonText = responseText.trim();
        if (jsonText.includes("```json")) {
          jsonText =
            jsonText.split("```json")[1]?.split("```")[0]?.trim() ?? jsonText;
        } else if (jsonText.includes("```")) {
          jsonText =
            jsonText.split("```")[1]?.split("```")[0]?.trim() ?? jsonText;
        }

        const parsed = JSON.parse(jsonText) as { chunks: TextChunk[] };

        return {
          data: {
            chunks: parsed.chunks,
          },
        };
      } catch (error) {
        console.error("Text structure analysis error:", error);
        return {
          data: {
            chunks: [],
            error: `テキスト解析エラー: ${String(error)}`,
          },
        };
      }
    }),

  convertToEdgeType: publicProcedure
    .input(ConvertToEdgeTypeInputSchema)
    .mutation(async ({ input }) => {
      const { text } = input;

      try {
        const llm = new ChatOpenAI({
          temperature: 0.0,
          model: "gpt-4o-mini",
          maxTokens: 500,
        });

        const prompt = `Convert the following text to an English UPPER_SNAKE_CASE relationship type for a knowledge graph.

Input text: "${text}"

Requirements:
1. If the text is in Japanese or any other non-English language, translate it to English first
2. Convert the English text to UPPER_SNAKE_CASE format
3. Use clear, descriptive relationship type names (e.g., HAS_ROOMMATE, WORKS_AT, OCCURRED_ON, LOCATED_IN)
4. Remove any special characters, spaces, or punctuation
5. Use underscores to separate words
6. Return ONLY the converted text in UPPER_SNAKE_CASE format, without any explanation or additional text

Examples:
- "ルームメイト" → "HAS_ROOMMATE"
- "音楽" → "MUSIC" or "IN_CATEGORY"
- "happened on" → "HAPPENED_ON"
- "works at" → "WORKS_AT"
- "カテゴリ" → "IN_CATEGORY" or "HAS_CATEGORY"

Output:`;

        const response = await llm.invoke([new HumanMessage(prompt)]);
        const responseText = (response.content as string).trim();

        // 余分な説明やマークダウンを除去
        let edgeType = responseText
          .replace(/```[\s\S]*?```/g, "") // コードブロックを除去
          .replace(/^[^A-Z_]*/, "") // 最初の非大文字・アンダースコア文字を除去
          .replace(/[^A-Z_]*$/, "") // 最後の非大文字・アンダースコア文字を除去
          .trim();

        // 行の最初のUPPER_SNAKE_CASEを抽出
        const match = edgeType.match(/^[A-Z][A-Z0-9_]*/);
        if (match) {
          edgeType = match[0];
        }

        // 空の場合は元のテキストを大文字に変換して返す（フォールバック）
        if (!edgeType || edgeType.length === 0) {
          edgeType = text
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, "_")
            .replace(/_+/g, "_")
            .replace(/^_|_$/g, "");
        }

        return {
          data: {
            edgeType,
          },
        };
      } catch (error) {
        console.error("Edge type conversion error:", error);
        // エラー時はフォールバック処理
        const fallbackEdgeType = text
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, "_")
          .replace(/_+/g, "_")
          .replace(/^_|_$/g, "");
        return {
          data: {
            edgeType: fallbackEdgeType || "RELATED_TO",
          },
        };
      }
    }),

  extractKG: publicProcedure
    .input(ExtractInputSchema)
    .mutation(async ({ input }) => {
      const {
        fileUrl,
        extractMode,
        isPlaneTextMode,
        additionalPrompt,
        customMappingRules,
      } = input;

      const localFilePath = await writeLocalFileFromUrl(
        fileUrl,
        `input.${isPlaneTextMode ? "txt" : "pdf"}`,
      );

      // SchemaExample: Nodes: [Person {age: integer, name: string}] Relationships: [Person, roommate, Person]
      // const schema = `
      // Nodes: [Artist {name: string, birthYear: integer}], [Museum {name: string, builtAt: integer}], [Curator {name: string, birthYear: integer}], [Exhibition {title: string, heldAt: integer}], [Critic {name: string, birthYear: integer}]
      // Relationships: [Artist, join, Exhibition], [Curator, direction, Exhibition], [Museum, host, Exhibition], [Critic, mention ,Artist]
      // `;
      const schema = {
        allowedNodes: [],
        allowedRelationships: [],
      };

      try {
        console.log("type: ", extractMode);
        let extractor: Extractor;
        if (extractMode === "iterative") {
          extractor = new IterativeGraphExtractor();
        } else if (extractMode === "langChain") {
          extractor = new LangChainExtractor();
        } else {
          extractor = new AssistantsApiExtractor();
        }

        const nodesAndRelationships = await extractor.extract({
          localFilePath,
          isPlaneTextMode,
          schema,
          additionalPrompt,
          customMappingRules,
        });

        if (!nodesAndRelationships) {
          return {
            data: { graph: null, error: "グラフ抽出エラー" },
          };
        }

        const normalizedNodesAndRelationships = {
          ...nodesAndRelationships,
          nodes: nodesAndRelationships.nodes.map((n) => ({
            id: n.id,
            name: n.name,
            label: n.label,
            properties: n.properties ?? {},
            documentGraphId: null,
            topicSpaceId: null,
            createdAt: null,
            updatedAt: null,
            deletedAt: null,
          })),
          relationships: nodesAndRelationships.relationships.map((r) => ({
            id: r.id,
            type: r.type,
            properties: r.properties ?? {},
            fromNodeId: r.sourceId,
            toNodeId: r.targetId,
            documentGraphId: null,
            topicSpaceId: null,
            createdAt: null,
            updatedAt: null,
            deletedAt: null,
          })),
        };
        const disambiguatedNodesAndRelationships = dataDisambiguation(
          normalizedNodesAndRelationships,
        );
        const graphDocument = await completeTranslateProperties(
          disambiguatedNodesAndRelationships,
        );
        return {
          data: {
            graph: formGraphDataForFrontend(graphDocument),
          },
        };
      } catch (error) {
        return {
          data: { graph: null, error: "グラフ抽出エラー" },
        };
      }
    }),

  textInspect: publicProcedure
    .input(TestInspectInputSchema)
    .mutation(async ({ input }) => {
      const { fileUrl, isPlaneTextMode } = input;

      const localFilePath = await writeLocalFileFromUrl(
        fileUrl,
        `input.${isPlaneTextMode ? "txt" : "pdf"}`,
      );

      try {
        const documents = await textInspect(localFilePath, isPlaneTextMode);
        console.log("documents: ", documents);
        return {
          data: { documents: documents },
        };
      } catch (error) {
        return {
          data: {
            documents: null,
            error: `テキスト検査エラー: ${String(error)}`,
          },
        };
      }
    }),

  integrateGraph: protectedProcedure
    .input(IntegrateGraphInputSchema)
    .mutation(async ({ ctx, input }) => {
      const topicSpace = await ctx.db.topicSpace.findFirst({
        where: { id: input.topicSpaceId, isDeleted: false },
        include: {
          admins: true,
          graphNodes: {
            where: {
              deletedAt: null,
            },
          },
          graphRelationships: {
            where: {
              deletedAt: null,
            },
          },
        },
      });

      if (
        !topicSpace?.admins.some((admin) => {
          return admin.id === ctx.session.user.id;
        })
      ) {
        throw new Error("TopicSpace not found");
      }

      const prevGraphData = {
        nodes: topicSpace.graphNodes,
        relationships: topicSpace.graphRelationships,
      };

      console.log("=== バックエンド統合処理開始 ===");
      console.log("既存グラフ - ノード数:", prevGraphData.nodes.length);
      console.log("既存グラフ - エッジ数:", prevGraphData.relationships.length);
      // 型アサーションを適用
      const nodes = input.graphDocument.nodes as NodeTypeForFrontend[];
      const relationships = input.graphDocument
        .relationships as RelationshipTypeForFrontend[];

      console.log("受信データ - ノード数:", nodes.length);
      console.log("受信データ - エッジ数:", relationships.length);
      console.log(
        "受信エッジ詳細（sourceId/targetId形式）:",
        relationships.map((rel) => ({
          id: rel.id,
          type: rel.type,
          sourceId: rel.sourceId,
          targetId: rel.targetId,
        })),
      );

      // フロントエンドから送信されるグラフデータ（sourceId/targetId形式）を
      // fuseGraphsが期待する形式（fromNodeId/toNodeId形式）に変換
      const targetGraphForFusion: {
        nodes: GraphNode[];
        relationships: GraphRelationship[];
      } = {
        nodes: nodes.map(
          (node): GraphNode => ({
            id: node.id,
            name: node.name,
            label: node.label,
            properties: (node.properties ?? {}) as Prisma.JsonValue,
            topicSpaceId: node.topicSpaceId ?? null,
            documentGraphId: node.documentGraphId ?? null,
            createdAt: null,
            updatedAt: null,
            deletedAt: null,
          }),
        ),
        relationships: relationships.map(
          (rel): GraphRelationship => ({
            id: rel.id,
            type: rel.type,
            properties: (rel.properties ?? {}) as Prisma.JsonValue,
            fromNodeId: rel.sourceId,
            toNodeId: rel.targetId,
            topicSpaceId: rel.topicSpaceId ?? null,
            documentGraphId: rel.documentGraphId ?? null,
            createdAt: null,
            updatedAt: null,
            deletedAt: null,
          }),
        ),
      };

      console.log(
        "変換後グラフ - ノード数:",
        targetGraphForFusion.nodes.length,
      );
      console.log(
        "変換後グラフ - エッジ数:",
        targetGraphForFusion.relationships.length,
      );
      console.log(
        "変換後エッジ詳細（fromNodeId/toNodeId形式）:",
        targetGraphForFusion.relationships.map((rel) => ({
          id: rel.id,
          type: rel.type,
          fromNodeId: rel.fromNodeId,
          toNodeId: rel.toNodeId,
        })),
      );

      const labelCheck = false;
      const updatedGraphData = await fuseGraphs({
        sourceGraph: prevGraphData,
        targetGraph: targetGraphForFusion,
        labelCheck,
      });

      console.log("fuseGraphs後 - ノード数:", updatedGraphData.nodes.length);
      console.log(
        "fuseGraphs後 - エッジ数:",
        updatedGraphData.relationships.length,
      );
      console.log(
        "fuseGraphs後エッジ詳細:",
        updatedGraphData.relationships.map((rel) => ({
          id: rel.id,
          type: rel.type,
          fromNodeId: rel.fromNodeId,
          toNodeId: rel.toNodeId,
        })),
      );

      const newGraphWithProperties = attachGraphProperties(
        updatedGraphData,
        prevGraphData,
        labelCheck,
      );
      // const shapedGraphData = shapeGraphData(newGraphWithProperties);

      if (!newGraphWithProperties) {
        throw new Error("Graph fusion failed");
      }

      const graphChangeHistory = await ctx.db.graphChangeHistory.create({
        data: {
          recordType: GraphChangeRecordType.TOPIC_SPACE,
          recordId: topicSpace.id,
          description: "グラフを追加しました",
          user: { connect: { id: ctx.session.user.id } },
        },
      });

      // ノードの差分から追加されたノードを作成
      const nodeDiffs = diffNodes(
        prevGraphData.nodes.map((node) => formNodeDataForFrontend(node)),
        newGraphWithProperties.nodes.map((node) =>
          formNodeDataForFrontend(node),
        ),
      );
      const addedNodesData = nodeDiffs
        .filter((diff) => diff.type === GraphChangeType.ADD)
        .map((node) => ({
          id: node.updated?.id,
          name: node.updated?.name ?? "",
          label: node.updated?.label ?? "",
          properties: node.updated?.properties ?? {},
          topicSpaceId: topicSpace.id,
        }));
      await ctx.db.graphNode.createMany({
        data: addedNodesData,
      });

      // リレーションシップの差分から追加されたリレーションシップを作成
      const relationshipDiffs = diffRelationships(
        prevGraphData.relationships.map((r) =>
          formRelationshipDataForFrontend(r),
        ),
        newGraphWithProperties.relationships.map((r) =>
          formRelationshipDataForFrontend(r),
        ),
      );
      console.log("エッジ差分計算結果 - 総数:", relationshipDiffs.length);
      console.log(
        "エッジ差分詳細:",
        relationshipDiffs.map((diff) => ({
          type: diff.type,
          originalId: diff.original?.id,
          updatedId: diff.updated?.id,
          originalSourceId: diff.original?.sourceId,
          originalTargetId: diff.original?.targetId,
          updatedSourceId: diff.updated?.sourceId,
          updatedTargetId: diff.updated?.targetId,
        })),
      );

      const addedRelationshipsData = relationshipDiffs
        .filter((diff) => diff.type === GraphChangeType.ADD)
        .map((relationship) => ({
          id: relationship.updated?.id,
          type: relationship.updated?.type ?? "",
          properties: relationship.updated?.properties ?? {},
          fromNodeId: relationship.updated?.sourceId ?? "",
          toNodeId: relationship.updated?.targetId ?? "",
          topicSpaceId: topicSpace.id,
        }));

      console.log("追加されるエッジ数:", addedRelationshipsData.length);
      console.log(
        "追加されるエッジ詳細:",
        addedRelationshipsData.map((rel) => ({
          id: rel.id,
          type: rel.type,
          fromNodeId: rel.fromNodeId,
          toNodeId: rel.toNodeId,
        })),
      );

      if (addedRelationshipsData.length > 0) {
        await ctx.db.graphRelationship.createMany({
          data: addedRelationshipsData,
        });
        console.log("エッジをデータベースに追加しました");
      } else {
        console.log("追加するエッジがありません");
      }

      // 詳細な変更差分の履歴保存
      const nodeChangeHistories = nodeDiffs.map((diff: NodeDiffType) => {
        return {
          changeType: diff.type,
          changeEntityType: GraphChangeEntityType.NODE,
          changeEntityId: String(diff.original?.id ?? diff.updated?.id),
          previousState: diff.original ?? {},
          nextState: diff.updated ?? {},
          graphChangeHistoryId: graphChangeHistory.id,
        };
      });
      const relationshipChangeHistories = relationshipDiffs.map(
        (diff: RelationshipDiffType) => {
          return {
            changeType: diff.type,
            changeEntityType: GraphChangeEntityType.EDGE,
            changeEntityId: String(diff.original?.id ?? diff.updated?.id),
            previousState: diff.original ?? {},
            nextState: diff.updated ?? {},
            graphChangeHistoryId: graphChangeHistory.id,
          };
        },
      );
      await ctx.db.nodeLinkChangeHistory.createMany({
        data: [...nodeChangeHistories, ...relationshipChangeHistories],
      });

      // 古い処理なので、ここでは更新しない
      // const updatedTopicSpace = await ctx.db.topicSpace.update({
      //   where: { id: input.topicSpaceId },
      //   data: { graphData: newGraphWithProperties },
      // });

      return {
        data: topicSpace,
      };
    }),

  getRelatedNodes: publicProcedure
    .input(GetRelatedNodesInputSchema)
    .query(async ({ ctx, input }) => {
      const { nodeId, contextId, contextType } = input;

      let graphData;

      if (contextType === "topicSpace") {
        const topicSpace = await ctx.db.topicSpace.findFirst({
          where: { id: contextId, isDeleted: false },
          include: {
            graphNodes: {
              where: {
                deletedAt: null,
              },
            },
            graphRelationships: {
              where: {
                deletedAt: null,
              },
            },
          },
        });
        if (!topicSpace) {
          throw new Error("TopicSpace not found");
        }

        graphData = {
          nodes: topicSpace.graphNodes,
          relationships: topicSpace.graphRelationships,
        };
      } else {
        // Document context
        const documentGraph = await ctx.db.documentGraph.findFirst({
          where: { id: contextId },
          include: {
            graphNodes: {
              where: {
                deletedAt: null,
              },
            },
            graphRelationships: {
              where: {
                deletedAt: null,
              },
            },
          },
        });

        if (!documentGraph) {
          throw new Error("DocumentGraph not found");
        }

        graphData = {
          nodes: documentGraph.graphNodes,
          relationships: documentGraph.graphRelationships,
        };
      }

      const sourceNode = graphData.nodes.find((node) => node.id === nodeId) ?? {
        id: nodeId,
        name: "",
        label: "",
        properties: {},
      };
      const neighborNodes = getNeighborNodes(
        formGraphDataForFrontend(graphData),
        nodeId,
        "BOTH",
      );
      const sourceLinks = graphData.relationships.filter(
        (l) => l.fromNodeId === nodeId || l.toNodeId === nodeId,
      );
      const neighborLinks = graphData.relationships.filter(
        (l) =>
          neighborNodes.some((node) => l.fromNodeId === node.id) &&
          neighborNodes.some((node) => l.toNodeId === node.id),
      );

      // ノードの重複を除去
      const allNodes = [sourceNode, ...neighborNodes];
      const uniqueNodes = allNodes.filter(
        (node, index, self) =>
          index === self.findIndex((n) => n.id === node.id),
      );

      // リレーションシップの重複を除去
      const allRelationships = [...sourceLinks, ...neighborLinks];
      const uniqueRelationships = allRelationships.filter(
        (rel, index, self) => index === self.findIndex((r) => r.id === rel.id),
      );

      console.log(`ソースノード: ${sourceNode.id}`);
      console.log(`隣接ノード数: ${neighborNodes.length}`);
      console.log(`ソースリンク数: ${sourceLinks.length}`);
      console.log(`隣接リンク数: ${neighborLinks.length}`);
      console.log(`重複除去前ノード数: ${allNodes.length}`);
      console.log(`重複除去後ノード数: ${uniqueNodes.length}`);
      console.log(`重複除去後リレーション数: ${uniqueRelationships.length}`);

      const unifiedGraphData = {
        nodes: uniqueNodes,
        relationships: uniqueRelationships,
      };

      console.log(
        "data: ",
        JSON.stringify({
          ...unifiedGraphData,
          nodes: unifiedGraphData.nodes.map((node) => ({
            documentGraphId: null,
            topicSpaceId: null,
            createdAt: null,
            updatedAt: null,
            deletedAt: null,
            ...node,
          })),
        }),
      );

      return formGraphDataForFrontend({
        ...unifiedGraphData,
        nodes: unifiedGraphData.nodes.map((node) => ({
          documentGraphId: null,
          topicSpaceId: null,
          createdAt: null,
          updatedAt: null,
          deletedAt: null,
          ...node,
        })),
      });
    }),
});
