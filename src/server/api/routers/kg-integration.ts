import { protectedProcedure, publicProcedure } from "../trpc";
import { getNeighborNodes } from "@/app/_utils/kg/get-tree-layout-data";
import {
  formGraphDataForFrontend,
  formNodeDataForFrontend,
} from "@/app/_utils/kg/frontend-properties";
import type {
  NodeTypeForFrontend,
  RelationshipTypeForFrontend,
} from "@/app/const/types";
import { integrateGraph as integrateGraphService } from "@/server/services/kg/integrate-graph.service";
import {
  IntegrateGraphInputSchema,
  GetNodesByIdsInputSchema,
  GetRelatedNodesInputSchema,
} from "../schemas/knowledge-graph";

export const integrationProcedures = {
  integrateGraph: protectedProcedure
    .input(IntegrateGraphInputSchema)
    .mutation(async ({ ctx, input }) => {
      return integrateGraphService(ctx.db, {
        topicSpaceId: input.topicSpaceId,
        userId: ctx.session.user.id,
        graphDocument: {
          nodes: input.graphDocument.nodes as NodeTypeForFrontend[],
          relationships: input.graphDocument
            .relationships as RelationshipTypeForFrontend[],
        },
      });
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
          throw new Error("リポジトリが見つかりません");
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
