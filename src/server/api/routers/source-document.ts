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
import { BUCKETS } from "@/app/_utils/supabase/const";
import { storageUtils } from "@/app/_utils/supabase/supabase";
import { env } from "@/env";
import { getTextFromDocumentFile } from "@/app/_utils/text/text";
import { inspectFileTypeFromUrl } from "@/app/_utils/sys/file";
import { DocumentType } from "@prisma/client";
import { formDocumentGraphForFrontend } from "@/app/_utils/kg/frontend-properties";
import { extractRelevantSections } from "@/app/_utils/text/extract-relevant-sections";
import { KnowledgeGraphInputSchema } from "./topic-space";

const SourceDocumentSchema = z.object({
  name: z.string(),
  url: z.string().url(),
});

const SourceDocumentWithGraphSchema = z.object({
  name: z.string(),
  url: z.string().url(),
  dataJson: KnowledgeGraphInputSchema,
});

export const sourceDocumentRouter = createTRPCRouter({
  cleaningInputFiles: publicProcedure
    .input(
      z.object({
        type: z.enum(["input-pdf", "input-txt"]),
        key: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const documents = await ctx.db.sourceDocument.findMany();

      if (input.key !== env.DELETE_KEY) {
        throw new Error("Invalid key");
      }

      const filePaths = documents.map(
        (document) => document.url.split("/").pop() ?? "",
      );
      console.log("filePaths: ", filePaths);
      console.log("filePaths-length: ", filePaths.length);
      const res = await storageUtils.cleaning(
        filePaths,
        input.type === "input-pdf"
          ? BUCKETS.PATH_TO_INPUT_PDF
          : BUCKETS.PATH_TO_INPUT_TXT,
        input.key,
      );

      return res;
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const document = await ctx.db.sourceDocument.findFirst({
        where: { id: input.id, isDeleted: false },
        include: {
          user: true,
          graph: { include: { graphNodes: true, graphRelationships: true } },
        },
      });
      if (document?.user.id !== ctx.session?.user.id) {
        throw new Error("Document not found");
      }

      if (!document?.graph) {
        throw new Error("Graph not found");
      }

      return {
        ...document,
        graph: formDocumentGraphForFrontend(document.graph),
        text: await getTextFromDocumentFile(
          document.url,
          document.documentType,
        ),
      };
    }),

  getByIdPublic: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const document = await ctx.db.sourceDocument.findFirst({
        where: { id: input.id, isDeleted: false },
        include: {
          user: true,
          graph: { include: { graphNodes: true, graphRelationships: true } },
        },
      });
      if (!document) {
        throw new Error("Document not found");
      }

      if (!document.graph) {
        throw new Error("Graph not found");
      }

      return {
        ...document,
        graph: formDocumentGraphForFrontend(document.graph),
      };
    }),

  getListBySession: protectedProcedure.query(({ ctx }) => {
    const userId = ctx.session.user.id;
    return ctx.db.sourceDocument.findMany({
      where: { userId: userId, isDeleted: false },
      orderBy: { createdAt: "desc" },
      include: { graph: { select: { id: true } } },
    });
  }),

  create: protectedProcedure
    .input(SourceDocumentSchema)
    .mutation(async ({ ctx, input }) => {
      const document = ctx.db.sourceDocument.create({
        data: {
          name: input.name,
          url: input.url,
          user: { connect: { id: ctx.session.user.id } },
        },
      });
      return document;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const topicSpace = ctx.db.sourceDocument.update({
        where: { id: input.id },
        data: { isDeleted: true },
      });

      return topicSpace;
    }),

  createWithGraphData: protectedProcedure
    .input(SourceDocumentWithGraphSchema)
    .mutation(async ({ ctx, input }) => {
      const docFileType = await inspectFileTypeFromUrl(input.url);

      if (!docFileType) {
        throw new Error("ファイルタイプを判定できませんでした");
      }

      const document = await ctx.db.sourceDocument.create({
        data: {
          name: input.name,
          url: input.url,
          documentType:
            docFileType === "pdf"
              ? DocumentType.INPUT_PDF
              : DocumentType.INPUT_TXT,
          user: { connect: { id: ctx.session.user.id } },
        },
      });
      // const sanitizedGraphData = shapeGraphData({
      //   nodes: input.dataJson.nodes as NodeType[],
      //   relationships: input.dataJson.relationships as RelationshipType[],
      // });

      const documentGraph = await ctx.db.documentGraph.create({
        data: {
          user: { connect: { id: ctx.session.user.id } },
          sourceDocument: { connect: { id: document.id } },
          // 後ほどカラムが消える
          dataJson: {},
        },
      });

      await ctx.db.graphNode.createMany({
        data: input.dataJson.nodes.map((node: NodeTypeForFrontend) => ({
          id: node.id,
          name: node.name,
          label: node.label,
          properties: node.properties ?? {},
          documentGraphId: documentGraph.id,
        })),
      });
      await ctx.db.graphRelationship.createMany({
        data: input.dataJson.relationships.map(
          (relationship: RelationshipTypeForFrontend) => ({
            id: relationship.id,
            fromNodeId: relationship.sourceId,
            toNodeId: relationship.targetId,
            type: relationship.type,
            properties: relationship.properties ?? {},
            documentGraphId: documentGraph.id,
          }),
        ),
      });

      return {
        documentGraph,
        sourceDocument: document,
      };
    }),

  update: protectedProcedure
    .input(z.object({ id: z.string(), name: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const document = await ctx.db.sourceDocument.update({
        where: { id: input.id },
        data: { name: input.name },
      });

      return document;
    }),

  getReferenceSectionsById: publicProcedure
    .input(z.object({ id: z.string(), searchTerms: z.array(z.string()) }))
    .query(async ({ ctx, input }) => {
      const document = await ctx.db.sourceDocument.findFirst({
        where: { id: input.id },
      });

      if (!document) {
        throw new Error("Document not found");
      }

      const fullText = await getTextFromDocumentFile(
        document.url,
        document.documentType,
      );

      console.log("fullText: ", fullText.slice(0, 20));

      const relevantSections = extractRelevantSections(
        fullText,
        input.searchTerms,
        250,
      );

      return relevantSections;
    }),
});
