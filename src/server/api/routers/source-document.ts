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
import { BUCKETS } from "@/app/_utils/supabase/const";
import { storageUtils } from "@/app/_utils/supabase/supabase";
import { env } from "@/env";
import { getTextFromDocumentFile } from "@/app/_utils/text/text";
import { inspectFileTypeFromUrl } from "@/app/_utils/sys/file";
import { DocumentType, type PrismaClient } from "@prisma/client";
import { formDocumentGraphForFrontend } from "@/app/_utils/kg/frontend-properties";
import { extractRelevantSections } from "@/app/_utils/text/extract-relevant-sections";
import { KnowledgeGraphInputSchema } from "../schemas/knowledge-graph";

const SourceDocumentSchema = z.object({
  name: z.string(),
  url: z.string().url(),
});

const SourceDocumentWithGraphSchema = z.object({
  name: z.string(),
  url: z.string().url(),
  dataJson: KnowledgeGraphInputSchema,
});

export type CreateSourceDocumentWithGraphInput = z.infer<
  typeof SourceDocumentWithGraphSchema
>;

type CreateWithGraphCtx = {
  db: PrismaClient;
  session: { user: { id: string } };
};

/**
 * SourceDocument + DocumentGraph + nodes/relationships を1トランザクションで作成。
 * kg-copilot の本文KG統合など、ルーター外から呼ぶ用。
 */
export async function runCreateSourceDocumentWithGraphData(
  ctx: CreateWithGraphCtx,
  input: CreateSourceDocumentWithGraphInput,
) {
  const docFileType = await inspectFileTypeFromUrl(input.url);
  if (!docFileType) {
    throw new Error("ファイルタイプを判定できませんでした");
  }

  const nodes = input.dataJson.nodes as NodeTypeForFrontend[];
  const existingNodeIds = await ctx.db.graphNode.findMany({
    where: { id: { in: nodes.map((n) => n.id) } },
    select: { id: true },
  });
  const existingNodeIdSet = new Set(existingNodeIds.map((n) => n.id));
  const nodesToCreate = nodes.filter((node) => !existingNodeIdSet.has(node.id));

  if (nodesToCreate.length !== nodes.length) {
    const skippedCount = nodes.length - nodesToCreate.length;
    const skippedIds = nodes
      .filter((node) => existingNodeIdSet.has(node.id))
      .map((node) => node.id);
    console.warn(
      `Skipping ${skippedCount} node(s) that already exist in database:`,
      skippedIds.slice(0, 10),
    );
  }

  const relationships = input.dataJson
    .relationships as RelationshipTypeForFrontend[];
  const existingRelationshipIds = await ctx.db.graphRelationship.findMany({
    where: { id: { in: relationships.map((r) => r.id) } },
    select: { id: true },
  });
  const existingRelationshipIdSet = new Set(
    existingRelationshipIds.map((r) => r.id),
  );
  const relationshipsToCreate = relationships.filter(
    (relationship) => !existingRelationshipIdSet.has(relationship.id),
  );

  if (relationshipsToCreate.length !== relationships.length) {
    const skippedCount = relationships.length - relationshipsToCreate.length;
    const skippedIds = relationships
      .filter((relationship) =>
        existingRelationshipIdSet.has(relationship.id),
      )
      .map((relationship) => relationship.id);
    console.warn(
      `Skipping ${skippedCount} relationship(s) that already exist in database:`,
      skippedIds.slice(0, 10),
    );
  }

  return ctx.db.$transaction(async (tx) => {
    const document = await tx.sourceDocument.create({
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

    const documentGraph = await tx.documentGraph.create({
      data: {
        user: { connect: { id: ctx.session.user.id } },
        sourceDocument: { connect: { id: document.id } },
        dataJson: {},
      },
    });

    if (nodesToCreate.length > 0) {
      await tx.graphNode.createMany({
        data: nodesToCreate.map((node: NodeTypeForFrontend) => ({
          id: node.id,
          name: node.name,
          label: node.label,
          properties: node.properties ?? {},
          documentGraphId: documentGraph.id,
        })),
      });
    }

    if (relationshipsToCreate.length > 0) {
      await tx.graphRelationship.createMany({
        data: relationshipsToCreate.map(
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
    }

    return { documentGraph, sourceDocument: document };
  });
}

export const getTextReference = async (
  ctx: { db: PrismaClient },
  documentId: string,
  searchTerms: string[],
  contextLength = 250,
) => {
  const document = await ctx.db.sourceDocument.findFirst({
    where: { id: documentId },
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
    searchTerms,
    contextLength,
  );
  console.log("======= relevantSections ========", relevantSections);

  return relevantSections;
};

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
        graph: formDocumentGraphForFrontend(
          document.graph,
          ctx.session?.user.preferredLocale as LocaleEnum,
        ),
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
          user: {
            select: PUBLIC_USER_SELECT,
          },
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
        graph: formDocumentGraphForFrontend(
          document.graph,
          ctx.session?.user.preferredLocale as LocaleEnum,
        ),
      };
    }),

  getListBySession: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().min(1).max(100).default(30),
          page: z.number().min(1).default(1),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const limit = input?.limit ?? 30;
      const page = input?.page ?? 1;
      const skip = (page - 1) * limit;

      const [items, totalCount] = await Promise.all([
        ctx.db.sourceDocument.findMany({
          where: { userId: userId, isDeleted: false },
          orderBy: { createdAt: "desc" },
          include: { graph: { select: { id: true } } },
          take: limit,
          skip: skip,
        }),
        ctx.db.sourceDocument.count({
          where: { userId: userId, isDeleted: false },
        }),
      ]);

      return {
        items,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
      };
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
      return runCreateSourceDocumentWithGraphData(ctx, input);
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
      const relevantSections = await getTextReference(
        ctx,
        input.id,
        input.searchTerms,
      );

      return relevantSections;
    }),

  sendToUser: protectedProcedure
    .input(
      z.object({
        documentId: z.string(),
        recipientUserId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const senderId = ctx.session.user.id;
      if (input.recipientUserId === senderId) {
        throw new Error("自分自身には送信できません");
      }

      const document = await ctx.db.sourceDocument.findFirst({
        where: {
          id: input.documentId,
          isDeleted: false,
          userId: senderId,
        },
        include: {
          graph: {
            include: {
              graphNodes: true,
              graphRelationships: true,
            },
          },
        },
      });

      if (!document) {
        throw new Error("Document not found");
      }

      const recipient = await ctx.db.user.findUnique({
        where: { id: input.recipientUserId },
      });
      if (!recipient) {
        throw new Error("受信者が見つかりません");
      }

      const result = await ctx.db.$transaction(async (tx) => {
        const newDocument = await tx.sourceDocument.create({
          data: {
            name: document.name,
            url: document.url,
            documentType: document.documentType,
            user: { connect: { id: input.recipientUserId } },
          },
        });

        if (!document.graph) {
          return { sourceDocument: newDocument };
        }

        const newGraph = await tx.documentGraph.create({
          data: {
            dataJson: {},
            user: { connect: { id: input.recipientUserId } },
            sourceDocument: { connect: { id: newDocument.id } },
          },
        });

        const oldToNewNodeId = new Map<string, string>();
        for (const node of document.graph.graphNodes) {
          const created = await tx.graphNode.create({
            data: {
              name: node.name,
              label: node.label,
              properties: node.properties ?? {},
              documentGraphId: newGraph.id,
            },
          });
          oldToNewNodeId.set(node.id, created.id);
        }

        const relationshipsToCreate = document.graph.graphRelationships
          .map((rel) => {
            const fromId = oldToNewNodeId.get(rel.fromNodeId);
            const toId = oldToNewNodeId.get(rel.toNodeId);
            if (!fromId || !toId) return null;
            return {
              type: rel.type,
              properties: rel.properties ?? {},
              fromNodeId: fromId,
              toNodeId: toId,
              documentGraphId: newGraph.id,
            };
          })
          .filter((r): r is NonNullable<typeof r> => r !== null);

        if (relationshipsToCreate.length > 0) {
          await tx.graphRelationship.createMany({
            data: relationshipsToCreate,
          });
        }

        return {
          sourceDocument: newDocument,
          documentGraph: newGraph,
        };
      });

      return result;
    }),
});
