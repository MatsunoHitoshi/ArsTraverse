import { z } from "zod";

import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "@/server/api/trpc";
import type {
  NodeTypeForFrontend,
  RelationshipTypeForFrontend,
} from "@/app/const/types";
import { getTextFromDocumentFile } from "@/app/_utils/text/text";
import { formGraphDataForFrontend } from "@/app/_utils/kg/frontend-properties";
import { diffNodes, diffRelationships } from "@/app/_utils/kg/diff";
import {
  GraphChangeEntityType,
  GraphChangeRecordType,
  GraphChangeType,
} from "@prisma/client";
import { KnowledgeGraphInputSchema } from "./topic-space";

// const CreateDocumentGraphSchema = z.object({
//   dataJson: z.object({
//     nodes: z.array(z.any()),
//     relationships: z.array(z.any()),
//   }),
//   sourceDocumentId: z.string(),
// });

const UpdateDocumentGraphSchema = z.object({
  id: z.string(),
  dataJson: KnowledgeGraphInputSchema,
});

export const documentGraphRouter = createTRPCRouter({
  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      console.log(input.id);
      const graph = await ctx.db.documentGraph.findFirst({
        where: { id: input.id, sourceDocument: { isDeleted: false } },
        include: {
          sourceDocument: true,
          graphNodes: true,
          graphRelationships: true,
        },
      });

      if (!graph) {
        throw new Error("DocumentGraph not found");
      }

      return {
        ...graph,
        dataJson: formGraphDataForFrontend({
          nodes: graph.graphNodes,
          relationships: graph.graphRelationships,
        }),
        sourceDocument: {
          ...graph.sourceDocument,
          text: await getTextFromDocumentFile(
            graph.sourceDocument.url,
            graph.sourceDocument.documentType,
          ),
        },
      };
    }),

  // 使ってない？
  // create: protectedProcedure
  //   .input(CreateDocumentGraphSchema)
  //   .mutation(async ({ ctx, input }) => {
  //     const sanitizedGraphData = {
  //       nodes: input.dataJson.nodes as NodeTypeForFrontend[],
  //       relationships: input.dataJson
  //         .relationships as RelationshipTypeForFrontend[],
  //     };
  //     const graph = await ctx.db.documentGraph.create({
  //       data: {
  //         dataJson: {},
  //         user: { connect: { id: ctx.session.user.id } },
  //         sourceDocument: { connect: { id: input.sourceDocumentId } },
  //       },
  //     });

  //     if (!graph) {
  //       throw new Error("Graph not found");
  //     }

  //     await ctx.db.graphNode.createMany({
  //       data: sanitizedGraphData.nodes.map((node) => ({
  //         ...node,
  //         documentGraphId: graph.id,
  //       })),
  //     });
  //     await ctx.db.graphRelationship.createMany({
  //       data: sanitizedGraphData.relationships.map((relationship) => ({
  //         ...relationship,
  //         fromNodeId: relationship.sourceId,
  //         toNodeId: relationship.targetId,
  //         documentGraphId: graph.id,
  //       })),
  //     });
  //     return graph;
  //   }),

  updateGraph: protectedProcedure
    .input(UpdateDocumentGraphSchema)
    .mutation(async ({ ctx, input }) => {
      const documentGraph = await ctx.db.documentGraph.findFirst({
        where: { id: input.id, sourceDocument: { isDeleted: false } },
        include: {
          graphNodes: true,
          graphRelationships: true,
        },
      });

      if (!documentGraph || documentGraph.userId !== ctx.session.user.id) {
        throw new Error("DocumentGraph not found");
      }

      const prevGraphData = formGraphDataForFrontend({
        nodes: documentGraph.graphNodes,
        relationships: documentGraph.graphRelationships,
      });

      const sanitizedGraphData = {
        nodes: input.dataJson.nodes as NodeTypeForFrontend[],
        relationships: input.dataJson
          .relationships as RelationshipTypeForFrontend[],
      };
      const nodeDiffs = diffNodes(
        prevGraphData.nodes,
        sanitizedGraphData.nodes,
      );
      const relationshipDiffs = diffRelationships(
        prevGraphData.relationships,
        sanitizedGraphData.relationships,
      );

      const nodeCreateData = nodeDiffs
        .filter((diff) => diff.type === GraphChangeType.ADD)
        .map((diff) => diff.updated)
        .filter((node) => node !== null);
      const relationshipCreateData = relationshipDiffs
        .filter((diff) => diff.type === GraphChangeType.ADD)
        .map((diff) => diff.updated)
        .filter((relationship) => relationship !== null);

      const nodeDeleteData = nodeDiffs
        .filter((diff) => diff.type === GraphChangeType.REMOVE)
        .map((diff) => diff.original)
        .filter((node) => node !== null);
      const relationshipDeleteData = relationshipDiffs
        .filter((diff) => diff.type === GraphChangeType.REMOVE)
        .map((diff) => diff.original)
        .filter((relationship) => relationship !== null);

      const nodeUpdateData = nodeDiffs
        .filter((diff) => diff.type === GraphChangeType.UPDATE)
        .map((diff) => diff.updated)
        .filter((node) => node !== null);
      const relationshipUpdateData = relationshipDiffs
        .filter((diff) => diff.type === GraphChangeType.UPDATE)
        .map((diff) => diff.updated)
        .filter((relationship) => relationship !== null);

      await ctx.db.graphNode.createMany({
        data: nodeCreateData.map((node) => ({
          ...node,
          documentGraphId: documentGraph.id,
        })),
      });
      await ctx.db.graphRelationship.createMany({
        data: relationshipCreateData.map((relationship) => ({
          id: relationship.id,
          type: relationship.type,
          properties: relationship.properties,
          fromNodeId: relationship.sourceId,
          toNodeId: relationship.targetId,
          documentGraphId: documentGraph.id,
        })),
      });

      await ctx.db.graphNode.updateMany({
        where: { id: { in: nodeUpdateData.map((node) => node.id) } },
        data: { properties: nodeUpdateData.map((node) => node.properties) },
      });
      for (const relationship of relationshipUpdateData) {
        await ctx.db.graphRelationship.update({
          where: { id: relationship.id },
          data: {
            type: relationship.type,
            properties: relationship.properties,
            fromNodeId: relationship.sourceId,
            toNodeId: relationship.targetId,
            documentGraphId: documentGraph.id,
          },
        });
      }

      await ctx.db.graphNode.updateMany({
        where: { id: { in: nodeDeleteData.map((node) => node.id) } },
        data: {
          documentGraphId: null,
          deletedAt: new Date(),
        },
      });
      await ctx.db.graphRelationship.updateMany({
        where: {
          id: {
            in: relationshipDeleteData.map((relationship) => relationship.id),
          },
        },
        data: {
          documentGraphId: null,
          deletedAt: new Date(),
        },
      });

      const graphChangeHistory = await ctx.db.graphChangeHistory.create({
        data: {
          recordType: GraphChangeRecordType.DOCUMENT_GRAPH,
          recordId: documentGraph.id,
          description: "グラフを更新しました",
          user: { connect: { id: ctx.session.user.id } },
        },
      });

      await ctx.db.nodeLinkChangeHistory.createMany({
        data: nodeDiffs.map((diff) => ({
          changeType: diff.type,
          changeEntityType: GraphChangeEntityType.NODE,
          changeEntityId: String(diff.original?.id ?? diff.updated?.id),
          previousState: diff.original ?? {},
          nextState: diff.updated ?? {},
          graphChangeHistoryId: graphChangeHistory.id,
        })),
      });

      await ctx.db.nodeLinkChangeHistory.createMany({
        data: relationshipDiffs.map((diff) => ({
          changeType: diff.type,
          changeEntityType: GraphChangeEntityType.EDGE,
          changeEntityId: String(diff.original?.id ?? diff.updated?.id),
          previousState: diff.original ?? {},
          nextState: diff.updated ?? {},
          graphChangeHistoryId: graphChangeHistory.id,
        })),
      });

      return {
        nodes: nodeCreateData,
        relationships: relationshipCreateData,
      };
    }),
});
