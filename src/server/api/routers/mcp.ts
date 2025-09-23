import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "../trpc";
import OpenAI from "openai";
import type { GraphDocumentForFrontend } from "@/app/const/types";
import type {
  NodeTypeForFrontend,
  RelationshipTypeForFrontend,
} from "@/app/const/types";
import {
  formGraphDataForFrontend,
  formNodeDataForFrontend,
  formRelationshipDataForFrontend,
} from "@/app/_utils/kg/frontend-properties";
import { getTextFromDocumentFile } from "@/app/_utils/text/text";
import { extractRelevantSections } from "@/app/_utils/text/extract-relevant-sections";

function isGraphDocument(data: unknown): data is GraphDocumentForFrontend {
  return (
    typeof data === "object" &&
    data !== null &&
    "nodes" in data &&
    "relationships" in data &&
    Array.isArray((data as GraphDocumentForFrontend).nodes) &&
    Array.isArray((data as GraphDocumentForFrontend).relationships)
  );
}

// 出力データ構造のイメージ
interface ContextKnowledge {
  summary: string;
  nodeDetails: NodeTypeForFrontend;
  relatedNodes: {
    relationship: RelationshipTypeForFrontend;
    node: NodeTypeForFrontend;
  }[];
  graphSubset: GraphDocumentForFrontend;
}

export const mcpRouter = createTRPCRouter({
  searchTopicSpacePublic: publicProcedure
    .input(
      z.object({
        topicSpaceId: z.string(),
        query: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { topicSpaceId, query } = input;
      const lowerCaseQuery = query.toLowerCase();

      const topicSpace = await ctx.db.topicSpace.findFirst({
        where: {
          id: topicSpaceId,
          isDeleted: false,
        },
        include: {
          graphNodes: true,
          graphRelationships: true,
        },
      });

      if (!topicSpace) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "TopicSpace not found or you don't have access.",
        });
      }

      const graphData = {
        nodes: topicSpace.graphNodes,
        relationships: topicSpace.graphRelationships,
      };

      if (!isGraphDocument(graphData)) {
        return []; // グラフデータがない場合は空配列を返す
      }

      const matchedNodes = graphData.nodes.filter((node) => {
        // 名前の一致をチェック
        if (node.name.toLowerCase().includes(lowerCaseQuery)) {
          return true;
        }
        // ラベルの一致をチェック
        if (node.label.toLowerCase().includes(lowerCaseQuery)) {
          return true;
        }
        // プロパティの一致をチェック
        if (node.properties) {
          const propertiesString = JSON.stringify(
            node.properties,
          ).toLowerCase();
          if (propertiesString.includes(lowerCaseQuery)) {
            return true;
          }
        }
        return false;
      });

      return matchedNodes;
    }),

  getContextKnowledgeForNodePublic: publicProcedure
    .input(
      z.object({
        topicSpaceId: z.string(),
        nodeId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { topicSpaceId, nodeId } = input;

      // 1. 認可チェック と 2. DBからグラフデータを取得
      const topicSpace = await ctx.db.topicSpace.findFirst({
        where: {
          id: topicSpaceId,
          isDeleted: false,
        },
        include: {
          graphNodes: true,
          graphRelationships: true,
          sourceDocuments: true,
        },
      });

      if (!topicSpace) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "TopicSpace not found or you don't have access.",
        });
      }

      const graphData = {
        nodes: topicSpace.graphNodes,
        relationships: topicSpace.graphRelationships,
      };

      if (!isGraphDocument(graphData)) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Graph data is missing or invalid in the TopicSpace.",
        });
      }

      // 3. グラフデータを処理
      const mainNode = graphData.nodes.find((n) => String(n.id) === nodeId);
      if (!mainNode) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Node not found in the graph.",
        });
      }

      const relatedRelationships = graphData.relationships.filter(
        (l) => String(l.fromNodeId) === nodeId || String(l.toNodeId) === nodeId,
      );

      const relatedNodeIds = new Set(
        relatedRelationships.map((l) =>
          String(l.fromNodeId) === nodeId ? l.toNodeId : l.fromNodeId,
        ),
      );

      const relatedNodesWithDetails = Array.from(relatedNodeIds).map((id) => {
        const node = graphData.nodes.find((n) => n.id === id);
        const relationship = relatedRelationships.find(
          (l) => l.fromNodeId === id || l.toNodeId === id,
        );
        return { node, relationship };
      });

      const responseData = {
        nodeDetails: mainNode,
        relatedNodes: relatedNodesWithDetails.map(({ node, relationship }) => ({
          node,
          relationship,
        })),
        graphSubset: {
          nodes: [mainNode, ...relatedNodesWithDetails.map(({ node }) => node)],
          relationships: relatedRelationships,
        },
      };

      const sourceDocuments = topicSpace.sourceDocuments.map(
        (document) => document,
      );

      // 4. LLMで要約を生成
      const openai = new OpenAI();

      let context = `主題: (name: ${mainNode.name}, label: ${mainNode.label}, properties: ${JSON.stringify(
        mainNode.properties,
      )})\n`;
      context += "関連情報:\n";
      responseData.relatedNodes.forEach(({ relationship }) => {
        const sourceNode = responseData.graphSubset.nodes.find(
          (n) => n?.id === relationship?.fromNodeId,
        );
        const targetNode = responseData.graphSubset.nodes.find(
          (n) => n?.id === relationship?.toNodeId,
        );
        context += `- (${sourceNode?.name})-[${relationship?.type}]->(${targetNode?.name})\n`;
      });

      // 検索キーワードを抽出（主題名と関連ノード名）
      const searchKeywords = [
        mainNode.name,
        mainNode.label,
        ...responseData.relatedNodes
          .map(({ node }) => node?.name)
          .filter(Boolean),
        ...responseData.relatedNodes
          .map(({ node }) => node?.label)
          .filter(Boolean),
      ].filter(Boolean) as string[];

      console.log("searchKeywords: ", searchKeywords);

      // 各文書から関連部分のみを抽出
      const sourceDocumentsTexts = await Promise.all(
        sourceDocuments.map(async (document) => {
          const fullText = await getTextFromDocumentFile(
            document.url,
            document.documentType,
          );
          const relevantSections = extractRelevantSections(
            fullText,
            searchKeywords,
            300,
          );
          return relevantSections.length > 0
            ? relevantSections.join("\n\n---\n\n")
            : "";
        }),
      );

      console.log("sourceDocumentsTexts: ", sourceDocumentsTexts);

      const relevantTexts = sourceDocumentsTexts.filter(
        (text) => text.length > 0,
      );

      if (relevantTexts.length > 0) {
        context += "元となったテキスト記述（関連部分のみ）:\n";
        context += relevantTexts.join("\n\n");
      }

      const response = await openai.responses.create({
        model: "gpt-4o-mini",
        temperature: 0.7,
        tools: [],
        input: `あなたは芸術文化の専門家です。与えられた主題と関連情報に基づいて、簡潔で分かりやすい解説文を生成してください。以下の情報について、200字程度で解説してください。\n\n${context}`,
      });

      const summary = response.output_text ?? "要約を生成できませんでした。";

      // 5. 指定された形式で返却
      const result: ContextKnowledge = {
        summary,
        nodeDetails: formNodeDataForFrontend(responseData.nodeDetails),
        relatedNodes: responseData.relatedNodes
          .filter(({ node, relationship }) => node && relationship)
          .map(({ node, relationship }) => ({
            node: formNodeDataForFrontend(node!),
            relationship: formRelationshipDataForFrontend(relationship!),
          })),
        graphSubset: formGraphDataForFrontend({
          ...responseData.graphSubset,
          nodes: responseData.graphSubset.nodes.filter(
            (node): node is NonNullable<typeof node> => node !== undefined,
          ),
        }),
      };

      return result;
    }),
});
