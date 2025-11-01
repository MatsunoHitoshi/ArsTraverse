import { z } from "zod";

import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "@/server/api/trpc";

import {
  attachGraphProperties,
  fuseGraphs,
  mergerNodes,
} from "@/app/_utils/kg/data-disambiguation";
import type {
  LocaleEnum,
  NodeTypeForFrontend,
  ReferenceSection,
  RelationshipTypeForFrontend,
  TopicGraphFilterOption,
} from "@/app/const/types";
import { nodePathSearch } from "@/app/_utils/kg/bfs";
import { getNeighborNodes } from "@/app/_utils/kg/get-tree-layout-data";
import type {
  NodeDiffType,
  RelationshipDiffType,
} from "@/app/_utils/kg/get-nodes-and-relationships-from-result";
import { updateKgProperties } from "@/app/_utils/kg/filter";
import {
  GraphChangeEntityType,
  GraphChangeRecordType,
  GraphChangeType,
  type User,
  type GraphNode,
  type GraphRelationship,
  type PrismaClient,
  type TopicSpace,
} from "@prisma/client";
import { diffNodes, diffRelationships } from "@/app/_utils/kg/diff";
import {
  formGraphDataForFrontend,
  formNodeDataForFrontend,
  formRelationshipDataForFrontend,
  formTopicSpaceForFrontendPrivate,
  formTopicSpaceForFrontendPublic,
} from "@/app/_utils/kg/frontend-properties";
import {
  applyGraphChanges,
  generateGraphChangeData,
  recordGraphChangeHistory,
} from "@/server/lib/graph-update-utils";
import { getTextReference } from "./source-document";
import { KnowledgeGraphInputSchema } from "../schemas/knowledge-graph";
import OpenAI from "openai";

const TopicSpaceCreateSchema = z.object({
  name: z.string(),
  image: z.string().url().optional(),
  description: z.string().optional(),
  documentId: z.string().optional(),
});

const TopicSpaceGetSchema = z.object({
  id: z.string(),
  filterOption: z
    .object({
      type: z.string(),
      value: z.string(),
      cutOff: z.string().optional(),
      withBetweenNodes: z.boolean().optional(),
    })
    .optional(),
  withDocumentGraph: z.boolean().optional(),
});

const AttachDocumentSchema = z.object({
  documentIds: z.array(z.string()),
  id: z.string(),
});
const DetachDocumentSchema = z.object({
  documentId: z.string(),
  id: z.string(),
});

const UpdateGraphSchema = z.object({
  dataJson: KnowledgeGraphInputSchema,
  id: z.string(),
});

const MergeGraphNodesSchema = z.object({
  nodes: z.array(z.any()),
  id: z.string(),
});
const attachTopicSpaceGraphData = async (
  topicSpace: TopicSpace & {
    graphNodes: GraphNode[];
    graphRelationships: GraphRelationship[];
  },
  additionalGraphIds: (string | undefined)[],
  ctx: { db: PrismaClient },
) => {
  let newGraphNodes: GraphNode[] = topicSpace.graphNodes;
  let newGraphRelationships: GraphRelationship[] =
    topicSpace.graphRelationships;
  const labelCheck = true;

  if (additionalGraphIds.length > 0) {
    for (const graphId of additionalGraphIds) {
      const documentNodes = await ctx.db.graphNode.findMany({
        where: { documentGraphId: graphId },
      });
      const documentRelationships = await ctx.db.graphRelationship.findMany({
        where: { documentGraphId: graphId },
      });

      const fusedGraph = await fuseGraphs({
        sourceGraph: {
          nodes: newGraphNodes,
          relationships: newGraphRelationships,
        },
        targetGraph: {
          nodes: documentNodes.map((node) => {
            return {
              ...node,
              documentGraphId: null,
              topicSpaceId: topicSpace.id,
            };
          }),
          relationships: documentRelationships.map((r) => {
            return {
              ...r,
              documentGraphId: null,
              topicSpaceId: topicSpace.id,
            };
          }),
        },
        labelCheck,
      });
      newGraphNodes = fusedGraph.nodes;
      newGraphRelationships = fusedGraph.relationships;
    }
  }

  const topicSpaceNodes = await ctx.db.graphNode.findMany({
    where: { topicSpaceId: topicSpace.id },
  });
  const topicSpaceRelationships = await ctx.db.graphRelationship.findMany({
    where: { topicSpaceId: topicSpace.id },
  });

  const newGraphWithProperties = attachGraphProperties(
    { nodes: newGraphNodes, relationships: newGraphRelationships },
    { nodes: topicSpaceNodes, relationships: topicSpaceRelationships },
    labelCheck,
  );

  return newGraphWithProperties;
};

const detachTopicSpaceGraphData = async (
  topicSpace: TopicSpace,
  documentGraphId: string,
  leftGraphIds: string[],
  ctx: { db: PrismaClient },
) => {
  const documentGraph = await ctx.db.documentGraph.findFirst({
    where: { id: documentGraphId },
    include: {
      graphNodes: true,
      graphRelationships: true,
    },
  });

  if (!documentGraph) {
    throw new Error("DocumentGraph not found");
  }

  const topicSpaceNodes = await ctx.db.graphNode.findMany({
    where: { topicSpaceId: topicSpace.id },
  });
  const topicSpaceRelationships = await ctx.db.graphRelationship.findMany({
    where: { topicSpaceId: topicSpace.id },
  });

  const otherDocumentGraphNodes = await ctx.db.graphNode.findMany({
    where: { documentGraphId: { in: leftGraphIds } },
  });

  const deletedNodes = topicSpaceNodes.filter((topicSpaceNode) => {
    return (
      documentGraph.graphNodes.some(
        (documentGraphNode) =>
          documentGraphNode.name === topicSpaceNode.name &&
          documentGraphNode.label === topicSpaceNode.label,
      ) &&
      !otherDocumentGraphNodes.some(
        (otherDocumentGraphNode) =>
          otherDocumentGraphNode.name === topicSpaceNode.name &&
          otherDocumentGraphNode.label === topicSpaceNode.label,
      )
    );
  });

  const deletedRelationships = topicSpaceRelationships.filter(
    (topicSpaceRelationship) => {
      return deletedNodes.some(
        (deletedNode) =>
          deletedNode.id === topicSpaceRelationship.fromNodeId ||
          deletedNode.id === topicSpaceRelationship.toNodeId,
      );
    },
  );

  return {
    deletedNodes: deletedNodes,
    deletedRelationships: deletedRelationships,
  };
};

const adminGuard = (
  topicSpace: (TopicSpace & { admins: User[] }) | null,
  ctx: { session: { user: { id: string } } },
) => {
  if (!topicSpace?.admins.some((admin) => admin.id === ctx.session.user.id)) {
    throw new Error("You are not authorized to update this topic space");
  }
};

export const topicSpaceRouter = createTRPCRouter({
  getById: protectedProcedure
    .input(TopicSpaceGetSchema)
    .query(async ({ ctx, input }) => {
      const topicSpace = await ctx.db.topicSpace.findFirst({
        where: {
          id: input.id,
          isDeleted: false,
        },
        include: {
          sourceDocuments: {
            where: { isDeleted: false },
            include: {
              graph: {
                include: {
                  graphNodes: input.withDocumentGraph,
                  graphRelationships: input.withDocumentGraph,
                },
              },
            },
            orderBy: { createdAt: "desc" },
          },
          admins: true,
          tags: true,
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

      return formTopicSpaceForFrontendPrivate({
        topicSpace: {
          ...topicSpace,
          nodes: topicSpace.graphNodes,
          relationships: topicSpace.graphRelationships,
        },
        filterOption: input.filterOption as TopicGraphFilterOption,
        preferredLocale: ctx.session.user.preferredLocale as LocaleEnum,
      });
    }),

  getSummaryByIdPublic: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const topicSpace = await ctx.db.topicSpace.findFirst({
        where: { id: input.id, isDeleted: false },
        select: {
          id: true,
          name: true,
          description: true,
          tags: true,
          mcpToolIdentifier: true,
        },
      });

      if (!topicSpace) {
        throw new Error("TopicSpace not found");
      }

      return topicSpace;
    }),

  getByIdPublic: publicProcedure
    .input(TopicSpaceGetSchema)
    .query(async ({ ctx, input }) => {
      console.log("input.id--------- ", input.id);
      const topicSpace = await ctx.db.topicSpace.findFirst({
        where: {
          id: input.id,
          isDeleted: false,
        },
        include: {
          sourceDocuments: {
            where: { isDeleted: false },
            include: {
              graph: {
                include: { graphNodes: true, graphRelationships: true },
              },
            },
          },
          graphNodes: true,
          graphRelationships: true,
          admins: {
            select: {
              id: true,
            },
          },
          tags: true,
        },
      });
      if (!topicSpace) throw new Error("TopicSpace not found");

      return formTopicSpaceForFrontendPublic(
        {
          ...topicSpace,
          nodes: topicSpace.graphNodes,
          relationships: topicSpace.graphRelationships,
          admins: topicSpace.admins,
        },
        input.filterOption as TopicGraphFilterOption,
        ctx.session?.user.preferredLocale as LocaleEnum,
      );
    }),

  getPath: publicProcedure
    .input(z.object({ id: z.string(), startId: z.string(), endId: z.string() }))
    .query(async ({ ctx, input }) => {
      const topicSpace = await ctx.db.topicSpace.findFirst({
        where: {
          id: input.id,
          isDeleted: false,
        },
        include: {
          sourceDocuments: {
            where: { isDeleted: false },
            include: { graph: true },
          },
          graphNodes: true,
          graphRelationships: true,
          admins: true,
          tags: true,
        },
      });
      if (!topicSpace) throw new Error("TopicSpace not found");

      const graphData = {
        nodes: topicSpace.graphNodes,
        relationships: topicSpace.graphRelationships,
      };

      const pathData = nodePathSearch(
        formGraphDataForFrontend(graphData),
        input.startId,
        input.endId,
      );

      const newLinks: RelationshipTypeForFrontend[] = [];
      const nodesWithNeighbors = pathData.nodes
        .map((node) => {
          const neighbors = getNeighborNodes(
            formGraphDataForFrontend(graphData),
            node.id,
            "BOTH",
          );
          neighbors.forEach((neighbor) => {
            const additionalLinks = graphData.relationships.filter((link) => {
              return (
                (link.toNodeId === node.id &&
                  link.fromNodeId === neighbor.id) ||
                (link.toNodeId === neighbor.id && link.fromNodeId === node.id)
              );
            });
            newLinks.push(
              ...additionalLinks.map((link) =>
                formRelationshipDataForFrontend(link),
              ),
            );
          });

          return [...neighbors, node];
        })
        .flat();

      const uniqueNodes = [
        ...new Set(nodesWithNeighbors.map((node) => node.id)),
      ].map((id) => nodesWithNeighbors.find((node) => node.id === id));
      const uniqueLinks = [...new Set(newLinks.map((link) => link.id))].map(
        (id) => newLinks.find((link) => link.id === id),
      );

      return {
        ...topicSpace,
        graphData: {
          nodes: uniqueNodes.filter((node) => node !== undefined),
          relationships: uniqueLinks.filter((link) => link !== undefined),
        },
      };
    }),

  getListBySession: protectedProcedure.query(({ ctx }) => {
    const userId = ctx.session.user.id;
    return ctx.db.topicSpace.findMany({
      where: { admins: { some: { id: userId } }, isDeleted: false },
      select: {
        id: true,
        name: true,
        image: true,
        description: true,
        sourceDocuments: { where: { isDeleted: false } },
        admins: true,
        tags: true,
        activities: true,
        createdAt: true,
        updatedAt: true,
        isDeleted: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }),

  create: protectedProcedure
    .input(TopicSpaceCreateSchema)
    .mutation(async ({ ctx, input }) => {
      const document = await ctx.db.sourceDocument.findFirst({
        where: { id: input.documentId, isDeleted: false },
        include: {
          graph: { include: { graphNodes: true, graphRelationships: true } },
        },
      });

      const topicSpace = await ctx.db.topicSpace.create({
        data: {
          name: input.name,
          image: input.image,
          description: input.description,
          sourceDocuments: { connect: { id: input.documentId } },
          admins: { connect: { id: ctx.session.user.id } },
        },
      });

      if (document?.graph) {
        const graphData = {
          nodes: document.graph.graphNodes,
          relationships: document.graph.graphRelationships,
        };

        await ctx.db.graphNode.createMany({
          data: graphData.nodes.map((node) => ({
            name: node.name,
            label: node.label,
            properties: node.properties ?? {},
            topicSpaceId: topicSpace.id,
          })),
        });
        const createdNodes = await ctx.db.graphNode.findMany({
          where: { topicSpaceId: topicSpace.id },
        });

        const oldToNewNodeIdMap = new Map(
          graphData.nodes.map((node) => [
            node.id,
            createdNodes.find(
              (n) => n.name === node.name && n.label === node.label,
            )?.id,
          ]),
        );
        const relationshipCreateData = graphData.relationships.map(
          (relationship) => ({
            type: relationship.type,
            properties: relationship.properties ?? {},
            fromNodeId: oldToNewNodeIdMap.get(relationship.fromNodeId) ?? "",
            toNodeId: oldToNewNodeIdMap.get(relationship.toNodeId) ?? "",
            topicSpaceId: topicSpace.id,
          }),
        );
        await ctx.db.graphRelationship.createMany({
          data: relationshipCreateData,
        });
      }

      return topicSpace;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const topicSpace = await ctx.db.topicSpace.findFirst({
        where: {
          id: input.id,
          isDeleted: false,
        },
        include: {
          admins: true,
        },
      });

      if (
        !topicSpace?.admins.some((admin) => {
          return admin.id === ctx.session.user.id;
        })
      ) {
        throw new Error("TopicSpace not found");
      }

      const updatedTopicSpace = ctx.db.topicSpace.update({
        where: { id: input.id },
        data: { isDeleted: true },
      });

      return updatedTopicSpace;
    }),

  attachDocuments: protectedProcedure
    .input(AttachDocumentSchema)
    .mutation(async ({ ctx, input }) => {
      const topicSpace = await ctx.db.topicSpace.findFirst({
        where: {
          id: input.id,
          isDeleted: false,
        },
        include: {
          admins: true,
          graphNodes: true,
          graphRelationships: true,
          sourceDocuments: { include: { graph: true } },
        },
      });

      if (
        !topicSpace?.admins.some((admin) => {
          return admin.id === ctx.session.user.id;
        })
      ) {
        throw new Error("TopicSpace not found");
      }

      const attachDocuments = await ctx.db.sourceDocument.findMany({
        where: { id: { in: input.documentIds }, isDeleted: false },
        include: { graph: true },
      });
      const additionalGraphIds = attachDocuments
        .filter((doc) => doc.graph !== null)
        .filter(
          (doc) =>
            !topicSpace.sourceDocuments.some(
              (d) => d.graph?.id === doc.graph?.id,
            ),
        )
        .map((doc) => doc.graph?.id);

      const prevNodes = topicSpace.graphNodes;
      const prevRelationships = topicSpace.graphRelationships;

      const updatedGraphData = await attachTopicSpaceGraphData(
        topicSpace,
        additionalGraphIds,
        ctx,
      );

      const documentAttachedTopicSpace = await ctx.db.topicSpace.update({
        where: { id: input.id },
        data: {
          sourceDocuments: {
            connect: attachDocuments.map((doc) => ({ id: doc.id })),
          },
        },
        include: { sourceDocuments: { include: { graph: true } } },
      });

      const graphChangeHistory = await ctx.db.graphChangeHistory.create({
        data: {
          recordType: GraphChangeRecordType.TOPIC_SPACE,
          recordId: documentAttachedTopicSpace.id,
          description: "ドキュメントを追加しました",
          user: { connect: { id: ctx.session.user.id } },
        },
      });

      // ノードの差分から追加されたノードを作成
      const nodeDiffs = diffNodes(
        prevNodes.map((node) => formNodeDataForFrontend(node)),
        updatedGraphData.nodes.map((n) => formNodeDataForFrontend(n)),
      );
      const addedNodesData = nodeDiffs
        .filter((diff) => diff.type === GraphChangeType.ADD)
        .map((node) => ({
          id: node.updated?.id,
          name: node.updated?.name ?? "",
          label: node.updated?.label ?? "",
          properties: node.updated?.properties ?? {},
          topicSpaceId: input.id,
        }));
      await ctx.db.graphNode.createMany({
        data: addedNodesData,
      });

      // リレーションシップの差分から追加されたリレーションシップを作成
      const relationshipDiffs = diffRelationships(
        prevRelationships.map((r) => formRelationshipDataForFrontend(r)),
        updatedGraphData.relationships.map((r) =>
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
          topicSpaceId: input.id,
        }));

      await ctx.db.graphRelationship.createMany({
        data: addedRelationshipsData,
      });

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

      return documentAttachedTopicSpace;
    }),

  detachDocument: protectedProcedure
    .input(DetachDocumentSchema)
    .mutation(async ({ ctx, input }) => {
      const topicSpace = await ctx.db.topicSpace.findFirst({
        where: {
          id: input.id,
          isDeleted: false,
        },
        include: {
          admins: true,
          sourceDocuments: {
            include: { graph: true },
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

      const documentDetachedTopicSpace = await ctx.db.topicSpace.update({
        where: { id: input.id },
        data: {
          sourceDocuments: {
            disconnect: { id: input.documentId },
          },
        },
        include: { sourceDocuments: { include: { graph: true } } },
      });

      const prevNodes = await ctx.db.graphNode.findMany({
        where: { topicSpaceId: input.id },
      });
      const prevRelationships = await ctx.db.graphRelationship.findMany({
        where: { topicSpaceId: input.id },
      });

      const leftGraphIds = topicSpace.sourceDocuments
        .filter(
          (sourceDocument) =>
            sourceDocument.graph !== null &&
            sourceDocument.id !== input.documentId,
        )
        .map((sourceDocument) => sourceDocument.graph?.id);

      const documentGraphId = topicSpace.sourceDocuments.find(
        (sourceDocument) => sourceDocument.id === input.documentId,
      )?.graph?.id;
      if (!documentGraphId) {
        throw new Error("Document graph not found");
      }

      const detachedGraphData = await detachTopicSpaceGraphData(
        topicSpace,
        documentGraphId,
        leftGraphIds.filter((id): id is string => id !== undefined),
        ctx,
      );

      // 削除されたノードを更新
      await ctx.db.graphNode.updateMany({
        where: {
          id: { in: detachedGraphData.deletedNodes.map((node) => node.id) },
        },
        data: {
          topicSpaceId: null,
          deletedAt: new Date(),
        },
      });
      await ctx.db.graphRelationship.updateMany({
        where: {
          id: {
            in: detachedGraphData.deletedRelationships.map((rel) => rel.id),
          },
        },
        data: {
          topicSpaceId: null,
          deletedAt: new Date(),
        },
      });

      const updatedGraphData = {
        nodes: await ctx.db.graphNode.findMany({
          where: { topicSpaceId: input.id },
        }),
        relationships: await ctx.db.graphRelationship.findMany({
          where: { topicSpaceId: input.id },
        }),
      };

      const graphChangeHistory = await ctx.db.graphChangeHistory.create({
        data: {
          recordType: GraphChangeRecordType.TOPIC_SPACE,
          recordId: documentDetachedTopicSpace.id,
          description: "ドキュメントを削除しました",
          user: { connect: { id: ctx.session.user.id } },
        },
      });

      const nodeDiffs = diffNodes(
        prevNodes.map((node) => formNodeDataForFrontend(node)),
        updatedGraphData.nodes.map((node) => formNodeDataForFrontend(node)),
      );
      const relationshipDiffs = diffRelationships(
        prevRelationships.map((r) => formRelationshipDataForFrontend(r)),
        updatedGraphData.relationships.map((r) =>
          formRelationshipDataForFrontend(r),
        ),
      );
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

      return documentDetachedTopicSpace;
    }),

  updateGraphProperties: protectedProcedure
    .input(UpdateGraphSchema)
    .mutation(async ({ ctx, input }) => {
      const topicSpace = await ctx.db.topicSpace.findFirst({
        where: {
          id: input.id,
          isDeleted: false,
        },
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

      const prevNodes = topicSpace.graphNodes;
      const prevRelationships = topicSpace.graphRelationships;

      const updatedGraphData = updateKgProperties(input.dataJson, {
        nodes: prevNodes,
        relationships: prevRelationships,
      });

      const graphChangeHistory = await ctx.db.graphChangeHistory.create({
        data: {
          recordType: GraphChangeRecordType.TOPIC_SPACE,
          recordId: topicSpace.id,
          description: "プロパティを更新しました",
          user: { connect: { id: ctx.session.user.id } },
        },
      });

      const nodeDiffs = diffNodes(
        prevNodes.map((node) => formNodeDataForFrontend(node)),
        updatedGraphData.nodes.map((node) => formNodeDataForFrontend(node)),
      );
      const relationshipDiffs = diffRelationships(
        prevRelationships.map((r) => formRelationshipDataForFrontend(r)),
        updatedGraphData.relationships.map((r) =>
          formRelationshipDataForFrontend(r),
        ),
      );

      const nodeUpdateData = nodeDiffs
        .filter((diff: NodeDiffType) => diff.type === GraphChangeType.UPDATE)
        .map((diff: NodeDiffType) => {
          return {
            id: diff.updated?.id,
            properties: diff.updated?.properties ?? {},
          };
        });
      const relationshipUpdateData = relationshipDiffs
        .filter(
          (diff: RelationshipDiffType) => diff.type === GraphChangeType.UPDATE,
        )
        .map((diff: RelationshipDiffType) => {
          return {
            id: diff.updated?.id,
            properties: diff.updated?.properties ?? {},
          };
        });

      for (const node of nodeUpdateData) {
        if (node.id) {
          await ctx.db.graphNode.update({
            where: { id: node.id },
            data: { properties: node.properties },
          });
        }
      }

      for (const rel of relationshipUpdateData) {
        if (rel.id) {
          await ctx.db.graphRelationship.update({
            where: { id: rel.id },
            data: { properties: rel.properties },
          });
        }
      }

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

      const updatedTopicSpace = await ctx.db.topicSpace.findFirst({
        where: { id: input.id },
      });

      return updatedTopicSpace;
    }),

  mergeGraphNodes: protectedProcedure
    .input(MergeGraphNodesSchema)
    .mutation(async ({ ctx, input }) => {
      const topicSpace = await ctx.db.topicSpace.findFirst({
        where: {
          id: input.id,
          isDeleted: false,
        },
        include: {
          admins: true,
          graphNodes: true,
          graphRelationships: true,
        },
      });

      if (!topicSpace) {
        throw new Error("TopicSpace not found");
      }
      adminGuard(topicSpace, ctx);

      const prevNodes = topicSpace.graphNodes;
      const prevRelationships = topicSpace.graphRelationships;

      const updatedGraphData = mergerNodes(
        {
          nodes: prevNodes,
          relationships: prevRelationships,
        },
        input.nodes as NodeTypeForFrontend[],
      );

      const graphChangeHistory = await ctx.db.graphChangeHistory.create({
        data: {
          recordType: GraphChangeRecordType.TOPIC_SPACE,
          recordId: topicSpace.id,
          description: "ノードを統合しました",
          user: { connect: { id: ctx.session.user.id } },
        },
      });

      const nodeDiffs = diffNodes(
        prevNodes.map((node) => formNodeDataForFrontend(node)),
        updatedGraphData.nodes.map((node) => formNodeDataForFrontend(node)),
      );
      const relationshipDiffs = diffRelationships(
        prevRelationships.map((r) => formRelationshipDataForFrontend(r)),
        updatedGraphData.relationships.map((r) =>
          formRelationshipDataForFrontend(r),
        ),
      );

      // 更新されたノード
      const nodeUpdateData = nodeDiffs
        .filter((diff: NodeDiffType) => diff.type === GraphChangeType.UPDATE)
        .map((diff: NodeDiffType) => {
          return {
            id: diff.updated?.id,
            properties: diff.updated?.properties ?? {},
          };
        });
      // 削除されたノード
      const deletedNodeData = nodeDiffs
        .filter((diff: NodeDiffType) => diff.type === GraphChangeType.REMOVE)
        .map((diff: NodeDiffType) => {
          return {
            id: diff.original?.id,
          };
        });

      // 更新されたリレーションシップ
      const relationshipUpdateData = relationshipDiffs
        .filter(
          (diff: RelationshipDiffType) => diff.type === GraphChangeType.UPDATE,
        )
        .map((diff: RelationshipDiffType) => {
          return {
            id: diff.updated?.id,
            properties: diff.updated?.properties ?? {},
            toNodeId: diff.updated?.targetId,
            fromNodeId: diff.updated?.sourceId,
          };
        });
      // 削除されたリレーションシップ
      const deletedRelationshipData = relationshipDiffs
        .filter(
          (diff: RelationshipDiffType) => diff.type === GraphChangeType.REMOVE,
        )
        .map((diff: RelationshipDiffType) => {
          return {
            id: diff.original?.id,
          };
        });

      // レコードの更新と削除（論理）
      for (const node of nodeUpdateData) {
        if (node.id) {
          await ctx.db.graphNode.update({
            where: { id: node.id },
            data: { properties: node.properties },
          });
        }
      }
      for (const rel of relationshipUpdateData) {
        if (rel.id) {
          await ctx.db.graphRelationship.update({
            where: { id: rel.id },
            data: {
              properties: rel.properties,
              toNodeId: rel.toNodeId,
              fromNodeId: rel.fromNodeId,
            },
          });
        }
      }
      // 削除されたノードを個別に更新
      for (const node of deletedNodeData) {
        if (node.id) {
          await ctx.db.graphNode.update({
            where: { id: node.id },
            data: {
              topicSpaceId: null,
              deletedAt: new Date(),
            },
          });
        }
      }
      // 削除されたリレーションシップを個別に更新
      for (const rel of deletedRelationshipData) {
        if (rel.id) {
          await ctx.db.graphRelationship.update({
            where: { id: rel.id },
            data: {
              topicSpaceId: null,
              deletedAt: new Date(),
            },
          });
        }
      }

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

      const updatedTopicSpace = await ctx.db.topicSpace.findFirst({
        where: { id: input.id },
      });

      return updatedTopicSpace;
    }),

  updateGraph: protectedProcedure
    .input(UpdateGraphSchema)
    .mutation(async ({ ctx, input }) => {
      const topicSpace = await ctx.db.topicSpace.findFirst({
        where: { id: input.id },
        include: {
          admins: true,
          graphNodes: true,
          graphRelationships: true,
        },
      });
      if (!topicSpace) {
        throw new Error("TopicSpace not found");
      }
      adminGuard(topicSpace, ctx);

      const sanitizedGraphData = {
        nodes: input.dataJson.nodes as NodeTypeForFrontend[],
        relationships: input.dataJson
          .relationships as RelationshipTypeForFrontend[],
      };

      const changeData = generateGraphChangeData(
        topicSpace.graphNodes.map((node) => formNodeDataForFrontend(node)),
        topicSpace.graphRelationships.map((rel) =>
          formRelationshipDataForFrontend(rel),
        ),
        sanitizedGraphData.nodes,
        sanitizedGraphData.relationships,
      );

      await applyGraphChanges(ctx.db, topicSpace.id, changeData);

      const prevGraphData = formGraphDataForFrontend({
        nodes: topicSpace.graphNodes,
        relationships: topicSpace.graphRelationships,
      });

      const nodeDiffs = diffNodes(
        prevGraphData.nodes,
        sanitizedGraphData.nodes,
      );
      const relationshipDiffs = diffRelationships(
        prevGraphData.relationships,
        sanitizedGraphData.relationships,
      );

      await recordGraphChangeHistory(
        ctx.db,
        topicSpace.id,
        "グラフを更新しました",
        ctx.session.user.id,
        nodeDiffs,
        relationshipDiffs,
      );

      const updatedTopicSpace = await ctx.db.topicSpace.findFirst({
        where: { id: input.id },
      });

      return updatedTopicSpace;
    }),

  getNodeReference: protectedProcedure
    .input(z.object({ id: z.string(), nodeId: z.string() }))
    .query(async ({ ctx, input }) => {
      console.log("======= getNodeReference ========", input);
      const topicSpace = await ctx.db.topicSpace.findFirst({
        where: { id: input.id },
        include: {
          admins: true,
          sourceDocuments: true,
        },
      });
      if (!topicSpace) {
        throw new Error("TopicSpace not found");
      }
      adminGuard(topicSpace, ctx);

      const node = await ctx.db.graphNode.findFirst({
        where: { id: input.nodeId },
      });
      if (!node) {
        throw new Error("Node not found");
      }

      const referenceSections: ReferenceSection[] = [];

      console.log("======= node.name ========", node.name);

      for (const sourceDocument of topicSpace.sourceDocuments) {
        const relevantSections = await getTextReference(
          ctx,
          sourceDocument.id,
          [node.name],
          200,
        );
        console.log("======= relevantSections ========", relevantSections);
        referenceSections.push({
          sourceDocument: sourceDocument,
          relevantSections: relevantSections.map((section) => section + "..."),
        });
      }

      return referenceSections;
    }),
  generateNodeDescriptionFromDocument: protectedProcedure
    .input(z.object({ id: z.string(), nodeId: z.string() }))
    .mutation(async function* ({ ctx, input }) {
      const topicSpace = await ctx.db.topicSpace.findFirst({
        where: { id: input.id },
        include: {
          admins: true,
          sourceDocuments: true,
        },
      });

      if (!topicSpace) {
        throw new Error("TopicSpace not found");
      }
      // ログインユーザーであれば誰でもノード説明生成が可能

      const node = await ctx.db.graphNode.findFirst({
        where: { id: input.nodeId },
      });

      if (!node) {
        throw new Error("Node not found");
      }

      let referenceText = "";

      for (const sourceDocument of topicSpace.sourceDocuments) {
        const relevantSections = await getTextReference(
          ctx,
          sourceDocument.id,
          [node.name],
          800,
        );
        referenceText += relevantSections.join("\n---\n");
      }

      // OpenAIを使用して解説文をストリーミング生成
      if (referenceText.trim()) {
        try {
          const openai = new OpenAI();
          const stream = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: `あなたは専門的な知識を分かりやすく解説するエキスパートです。与えられた文書から、指定されたノード（概念）について、簡潔で分かりやすい解説文を作成してください。

解説文の要件：
- 200-300文字程度の簡潔な説明
- 専門用語は適切に説明する
- 文書の内容を基にした正確な情報
- 読み手が理解しやすい構成
- 日本語で記述`,
              },
              {
                role: "user",
                content: `ノード名: ${node.name}
ノードラベル: ${node.label}

関連文書:
${referenceText}

上記の文書を基に、「${node.name}」についての解説文を作成してください。`,
              },
            ],
            max_tokens: 500,
            temperature: 0.7,
            stream: true,
          });

          let accumulatedText = "";
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content ?? "";
            if (content) {
              accumulatedText += content;
              yield {
                node: node,
                description: accumulatedText,
                isComplete: false,
              };
            }
          }

          yield {
            node: node,
            description: accumulatedText,
            isComplete: true,
          };
        } catch (error) {
          console.error("OpenAI API error:", error);
          yield {
            node: node,
            description: "解説文の生成に失敗しました。",
            isComplete: true,
          };
        }
      } else {
        yield {
          node: node,
          description: "関連する文書が見つかりませんでした。",
          isComplete: true,
        };
      }
    }),
});
