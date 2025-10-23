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
import { getNeighborNodes } from "@/app/_utils/kg/get-tree-layout-data";
import {
  formGraphDataForFrontend,
  formNodeDataForFrontend,
  formRelationshipDataForFrontend,
} from "@/app/_utils/kg/frontend-properties";
import { KnowledgeGraphInputSchema } from "../schemas/knowledge-graph";
import { completeTranslateProperties } from "@/app/_utils/kg/node-name-translation";
// import type { Prisma } from "@prisma/client";
// import { GraphDataStatus } from "@prisma/client";
// import { stripGraphData } from "@/app/_utils/kg/data-strip";

const ExtractInputSchema = z.object({
  fileUrl: z.string().url(),
  extractMode: z.string().optional(),
  isPlaneTextMode: z.boolean(),
  additionalPrompt: z.string().optional(),
});

const TestInspectInputSchema = z.object({
  fileUrl: z.string().url(),
  isPlaneTextMode: z.boolean(),
});

const IntegrateGraphInputSchema = z.object({
  topicSpaceId: z.string(),
  graphDocument: KnowledgeGraphInputSchema,
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
  extractKG: publicProcedure
    .input(ExtractInputSchema)
    .mutation(async ({ input }) => {
      const { fileUrl, extractMode, isPlaneTextMode, additionalPrompt } = input;

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
        const extractor: Extractor =
          extractMode === "langChain"
            ? new LangChainExtractor()
            : new AssistantsApiExtractor();
        const nodesAndRelationships = await extractor.extract({
          localFilePath,
          isPlaneTextMode,
          schema,
          additionalPrompt,
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
          graphNodes: true,
          graphRelationships: true,
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
          graphNodes: true,
          graphRelationships: true,
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

      const unifiedGraphData = {
        nodes: [sourceNode, ...neighborNodes],
        relationships: [...sourceLinks, ...neighborLinks],
      };

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
