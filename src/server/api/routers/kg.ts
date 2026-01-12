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
} from "@prisma/client";
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
  topicSpaceId: z.string(),
});

export type NodeSchema = {
  entity: string;
  type: string;
};

export const kgRouter = createTRPCRouter({
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

      const labelCheck = false;
      const updatedGraphData = await fuseGraphs({
        sourceGraph: prevGraphData,
        targetGraph: input.graphDocument,
        labelCheck,
      });

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
      await ctx.db.graphRelationship.createMany({
        data: addedRelationshipsData,
      });

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
      const { nodeId, topicSpaceId } = input;

      const topicSpace = await ctx.db.topicSpace.findFirst({
        where: { id: topicSpaceId, isDeleted: false },
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

      const graphData = {
        nodes: topicSpace.graphNodes,
        relationships: topicSpace.graphRelationships,
      };
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

  // graphFusion: publicProcedure.mutation(async ({ ctx }) => {
  //   const updateFusionStatus = async (id: string, status: GraphDataStatus) => {
  //     await ctx.db.graphFusionQueue.update({
  //       where: { id: id },
  //       data: { status: status },
  //     });
  //   };
  //   const updateTopicGraph = async (
  //     id: string,
  //     graphData: Prisma.JsonObject,
  //   ) => {
  //     await ctx.db.topicSpace.update({
  //       where: { id: id },
  //       data: { graphData: stripGraphData(graphData as GraphDocument) },
  //     });
  //   };
  //   const createCompleteCheck = async (topicId: string) => {
  //     const topicSpace = await ctx.db.topicSpace.findFirst({
  //       where: { id: topicId, isDeleted: false },
  //       include: { graphFusionQueue: true },
  //     });
  //     if (
  //       !topicSpace?.graphFusionQueue.some((fusion) => {
  //         return (
  //           fusion.status ===
  //           (GraphDataStatus.QUEUED || GraphDataStatus.PROCESSING)
  //         );
  //       })
  //     ) {
  //       await ctx.db.topicSpace.update({
  //         where: { id: topicId },
  //         data: { graphDataStatus: GraphDataStatus.CREATED },
  //       });
  //     }
  //   };
  //   const fetchTopicSpace = async (id: string) => {
  //     const topicSpace = await ctx.db.topicSpace.findFirst({
  //       where: { id: id, isDeleted: false },
  //       include: { graphFusionQueue: true },
  //     });
  //     return topicSpace;
  //   };

  //   const graphFusionQueue = await ctx.db.graphFusionQueue.findMany({
  //     where: { status: GraphDataStatus.QUEUED },
  //     include: { topicSpace: true, additionalGraph: true },
  //     orderBy: { createdAt: "asc" },
  //   });

  //   for (const fusion of graphFusionQueue) {
  //     await updateFusionStatus(fusion.id, GraphDataStatus.PROCESSING);
  //     const topicSpace = await fetchTopicSpace(fusion.topicSpace.id);
  //     if (!topicSpace?.graphData) {
  //       await updateTopicGraph(
  //         fusion.topicSpace.id,
  //         fusion.additionalGraph.dataJson as GraphDocument,
  //       );
  //       await updateFusionStatus(fusion.id, GraphDataStatus.CREATED);
  //     } else {
  //       const graphData = await fuseGraphs(
  //         topicSpace.graphData as GraphDocument,
  //         fusion.additionalGraph.dataJson as GraphDocument,
  //       );
  //       if (!graphData) {
  //         await updateFusionStatus(fusion.id, GraphDataStatus.CREATION_FAILED);
  //       } else {
  //         await updateTopicGraph(fusion.topicSpace.id, graphData);
  //         await updateFusionStatus(fusion.id, GraphDataStatus.CREATED);
  //       }
  //     }

  //     await createCompleteCheck(fusion.topicSpace.id);
  //   }

  //   return {
  //     message: "complete",
  //     numberOfRecords: graphFusionQueue.length,
  //   };
  // }),
});
