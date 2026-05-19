import { z } from "zod";

import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "@/server/api/trpc";
import { PUBLIC_USER_SELECT } from "@/server/lib/user-select";
import type {
  LocaleEnum,
  NodeTypeForFrontend,
  RelationshipTypeForFrontend,
} from "@/app/const/types";
import { getTextFromDocumentFile } from "@/app/_utils/text/text";
import { formGraphDataForFrontend } from "@/app/_utils/kg/frontend-properties";
import { KnowledgeGraphInputSchema } from "../schemas/knowledge-graph";
import { updateDocumentGraph } from "@/server/services/kg/update-document-graph.service";

const UpdateDocumentGraphSchema = z.object({
  id: z.string(),
  dataJson: KnowledgeGraphInputSchema,
});

export const documentGraphRouter = createTRPCRouter({
  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const graph = await ctx.db.documentGraph.findFirst({
        where: { id: input.id, sourceDocument: { isDeleted: false } },
        include: {
          sourceDocument: {
            include: {
              user: {
                select: PUBLIC_USER_SELECT,
              },
            },
          },
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
          preferredLocale: ctx.session?.user.preferredLocale as LocaleEnum,
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

  updateGraph: protectedProcedure
    .input(UpdateDocumentGraphSchema)
    .mutation(async ({ ctx, input }) => {
      return updateDocumentGraph(ctx.db, {
        documentGraphId: input.id,
        userId: ctx.session.user.id,
        nodes: input.dataJson.nodes as NodeTypeForFrontend[],
        relationships: input.dataJson
          .relationships as RelationshipTypeForFrontend[],
      });
    }),
});
