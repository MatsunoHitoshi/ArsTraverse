import { protectedProcedure, publicProcedure } from "../trpc";
import type {
  NodeDiffType,
  RelationshipDiffType,
} from "@/app/_utils/kg/get-nodes-and-relationships-from-result";
import {
  attachGraphProperties,
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
import { getNeighborNodes } from "@/app/_utils/kg/get-tree-layout-data";
import {
  formGraphDataForFrontend,
  formNodeDataForFrontend,
  formRelationshipDataForFrontend,
} from "@/app/_utils/kg/frontend-properties";
import type {
  NodeTypeForFrontend,
  RelationshipTypeForFrontend,
} from "@/app/const/types";
import {
  IntegrateGraphInputSchema,
  GetNodesByIdsInputSchema,
  GetRelatedNodesInputSchema,
} from "../schemas/knowledge-graph";

export const integrationProcedures = {
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
};
