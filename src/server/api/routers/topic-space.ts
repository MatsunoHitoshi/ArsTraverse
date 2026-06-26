import { z } from "zod";

import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "@/server/api/trpc";

import { mergerNodes } from "@/server/domain/kg/data-disambiguation";
import type {
  LocaleEnum,
  NodeTypeForFrontend,
  ReferenceSection,
  RelationshipTypeForFrontend,
  TopicGraphFilterOption,
} from "@/app/const/types";
import { nodePathSearch } from "@/app/_utils/kg/bfs";
import { getNeighborNodes } from "@/app/_utils/kg/get-tree-layout-data";
import type { Prisma } from "@prisma/client";
import { type PrismaClient } from "@prisma/client";
import {
  formGraphDataForFrontend,
  formNodeDataForFrontend,
  formRelationshipDataForFrontend,
  formTopicSpaceForFrontendPrivate,
  formTopicSpaceForFrontendPublic,
} from "@/app/_utils/kg/frontend-properties";
import { createTopicSpaceFromDocument } from "@/server/services/kg/create-topic-space-from-document.service";
import {
  assertTopicSpaceAdmin,
  findTopicSpaceWithGraph,
} from "@/server/repositories/topic-space-graph.repository";
import { attachDocumentsToTopicSpace } from "@/server/services/kg/attach-documents.service";
import { detachDocumentsFromTopicSpace } from "@/server/services/kg/detach-documents.service";
import { mergeGraphNodes as mergeGraphNodesService } from "@/server/services/kg/merge-graph-nodes.service";
import { syncTopicSpaceDriveFolder } from "@/server/services/kg/sync-topic-space-drive.service";
import { updateTopicSpaceGraph } from "@/server/services/kg/update-topic-space-graph.service";
import { updateTopicSpaceGraphProperties } from "@/server/services/kg/update-topic-space-graph-properties.service";
import { getTextReference } from "./source-document";
import { KnowledgeGraphInputSchema } from "../schemas/knowledge-graph";
import { BUCKETS } from "@/app/_utils/supabase/const";
import { storageUtils } from "@/app/_utils/supabase/supabase";
import { TRPCError } from "@trpc/server";
import { buildDriveFolderUrl } from "@/server/lib/google-drive/urls";
import { hasUserGoogleDriveConnection } from "@/server/lib/google-drive/user-oauth";
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

const NODE_IMAGE_MAX_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_IMAGE_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

const UploadNodeImageSchema = z.object({
  dataUrl: z
    .string()
    .refine(
      (s) => s.startsWith("data:image/") && s.includes(";base64,"),
      "dataUrl must be a data URL with image/* and base64",
    ),
  topicSpaceId: z.string(),
});

type TopicSpaceMutationCtx = {
  db: PrismaClient;
  session: { user: { id: string } };
};

/** attachDocuments と同じ処理をルーター外から実行（kg-copilot の本文KG統合など） */
export async function runAttachDocuments(
  ctx: TopicSpaceMutationCtx,
  input: { id: string; documentIds: string[] },
) {
  return attachDocumentsToTopicSpace(ctx, input);
}

/** detachDocument と同じ処理をルーター外から実行（kg-copilot の本文KG統合など） */
export async function runDetachDocument(
  ctx: TopicSpaceMutationCtx,
  input: { id: string; documentId: string },
) {
  return detachDocumentsFromTopicSpace(ctx, input);
}

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

      if (!topicSpace) {
        throw new Error("リポジトリが見つかりません");
      }
      assertTopicSpaceAdmin(topicSpace, ctx.session.user.id);

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
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "リポジトリが見つかりません",
        });
      }

      return topicSpace;
    }),

  getByIdPublic: publicProcedure
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
      if (!topicSpace) throw new Error("リポジトリが見つかりません");

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
      if (!topicSpace) throw new Error("リポジトリが見つかりません");

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
    .mutation(({ ctx, input }) =>
      createTopicSpaceFromDocument(ctx.db, {
        userId: ctx.session.user.id,
        documentId: input.documentId,
        name: input.name,
        image: input.image,
        description: input.description,
      }),
    ),

  update: protectedProcedure
    .input(z.object({ id: z.string(), name: z.string().min(1) }))
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

      if (!topicSpace) {
        throw new Error("リポジトリが見つかりません");
      }
      assertTopicSpaceAdmin(topicSpace, ctx.session.user.id);

      return ctx.db.topicSpace.update({
        where: { id: input.id },
        data: { name: input.name },
      });
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

      if (!topicSpace) {
        throw new Error("リポジトリが見つかりません");
      }
      assertTopicSpaceAdmin(topicSpace, ctx.session.user.id);

      const updatedTopicSpace = ctx.db.topicSpace.update({
        where: { id: input.id },
        data: { isDeleted: true },
      });

      return updatedTopicSpace;
    }),

  addAdmin: protectedProcedure
    .input(z.object({ topicSpaceId: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const topicSpace = await ctx.db.topicSpace.findFirst({
        where: {
          id: input.topicSpaceId,
          isDeleted: false,
        },
        include: { admins: true },
      });

      if (!topicSpace) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "リポジトリが見つかりません",
        });
      }
      assertTopicSpaceAdmin(topicSpace, ctx.session.user.id);

      const isAlreadyAdmin = topicSpace.admins.some(
        (admin) => admin.id === input.userId,
      );
      if (isAlreadyAdmin) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "既にメンバーに追加されています",
        });
      }

      const targetUser = await ctx.db.user.findUnique({
        where: { id: input.userId },
      });
      if (!targetUser) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "ユーザーが見つかりません",
        });
      }

      return ctx.db.topicSpace.update({
        where: { id: input.topicSpaceId },
        data: {
          admins: { connect: { id: input.userId } },
        },
        include: { admins: true },
      });
    }),

  removeAdmin: protectedProcedure
    .input(z.object({ topicSpaceId: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const topicSpace = await ctx.db.topicSpace.findFirst({
        where: {
          id: input.topicSpaceId,
          isDeleted: false,
        },
        include: { admins: true },
      });

      if (!topicSpace) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "リポジトリが見つかりません",
        });
      }
      assertTopicSpaceAdmin(topicSpace, ctx.session.user.id);

      if (input.userId === ctx.session.user.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "自分自身を外すことはできません",
        });
      }

      const isAdmin = topicSpace.admins.some(
        (admin) => admin.id === input.userId,
      );
      if (!isAdmin) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "対象のユーザーはメンバーに含まれていません",
        });
      }

      return ctx.db.topicSpace.update({
        where: { id: input.topicSpaceId },
        data: {
          admins: { disconnect: { id: input.userId } },
        },
        include: { admins: true },
      });
    }),

  attachDocuments: protectedProcedure
    .input(AttachDocumentSchema)
    .mutation(async ({ ctx, input }) => {
      return runAttachDocuments(ctx, input);
    }),

  detachDocument: protectedProcedure
    .input(DetachDocumentSchema)
    .mutation(async ({ ctx, input }) => {
      return runDetachDocument(ctx, input);
    }),

  updateGraphProperties: protectedProcedure
    .input(UpdateGraphSchema)
    .mutation(async ({ ctx, input }) => {
      return updateTopicSpaceGraphProperties(ctx.db, {
        topicSpaceId: input.id,
        userId: ctx.session.user.id,
        nodes: input.dataJson.nodes as NodeTypeForFrontend[],
        relationships: input.dataJson
          .relationships as RelationshipTypeForFrontend[],
      });
    }),

  uploadNodeImage: protectedProcedure
    .input(UploadNodeImageSchema)
    .mutation(async ({ ctx, input }) => {
      const topicSpace = await findTopicSpaceWithGraph(
        ctx.db,
        input.topicSpaceId,
      );
      if (!topicSpace) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "リポジトリが見つかりません",
        });
      }
      assertTopicSpaceAdmin(topicSpace, ctx.session.user.id);

      const [header, base64Data] = input.dataUrl.split(",", 2);
      if (!base64Data) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid data URL",
        });
      }
      const mimeMatch = header?.match(/^data:(image\/[a-zA-Z+.-]+);base64$/);
      const mime = mimeMatch?.[1];
      if (
        !mime ||
        !ALLOWED_IMAGE_MIMES.includes(
          mime as (typeof ALLOWED_IMAGE_MIMES)[number],
        )
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Only image/jpeg, image/png, image/webp, image/gif are allowed",
        });
      }

      let buffer: Buffer;
      try {
        buffer = Buffer.from(base64Data, "base64");
      } catch {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid base64 in data URL",
        });
      }
      if (buffer.length > NODE_IMAGE_MAX_BYTES) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Image size must be at most ${NODE_IMAGE_MAX_BYTES / (1024 * 1024)}MB`,
        });
      }

      const url = await storageUtils.uploadFromDataURL(
        input.dataUrl,
        BUCKETS.PATH_TO_NODE_IMAGES,
      );
      return { url };
    }),

  mergeGraphNodes: protectedProcedure
    .input(MergeGraphNodesSchema)
    .mutation(async ({ ctx, input }) => {
      return mergeGraphNodesService(ctx.db, {
        topicSpaceId: input.id,
        userId: ctx.session.user.id,
        nodesToMerge: input.nodes as NodeTypeForFrontend[],
      });
    }),

  updateGraph: protectedProcedure
    .input(UpdateGraphSchema)
    .mutation(async ({ ctx, input }) => {
      return updateTopicSpaceGraph(ctx.db, {
        topicSpaceId: input.id,
        userId: ctx.session.user.id,
        nodes: input.dataJson.nodes as NodeTypeForFrontend[],
        relationships: input.dataJson
          .relationships as RelationshipTypeForFrontend[],
      });
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
        throw new Error("リポジトリが見つかりません");
      }
      assertTopicSpaceAdmin(topicSpace, ctx.session.user.id);

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
        throw new Error("リポジトリが見つかりません");
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

  getDriveSyncStatus: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const topicSpace = await ctx.db.topicSpace.findFirst({
        where: { id: input.id, isDeleted: false },
        include: { admins: true, driveSync: true },
      });
      if (!topicSpace) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "リポジトリが見つかりません",
        });
      }
      assertTopicSpaceAdmin(topicSpace, ctx.session.user.id);

      const driveSync = topicSpace.driveSync;
      const userDriveConnected = await hasUserGoogleDriveConnection(
        ctx.db,
        ctx.session.user.id,
      );

      return {
        configured: Boolean(driveSync),
        enabled: driveSync?.enabled ?? false,
        driveFolderId: driveSync?.driveFolderId ?? null,
        driveFolderName: driveSync?.driveFolderName ?? null,
        driveFolderUrl: driveSync?.driveFolderId
          ? buildDriveFolderUrl(driveSync.driveFolderId)
          : null,
        configuredByUserId: driveSync?.configuredByUserId ?? null,
        recursive: driveSync?.recursive ?? true,
        lastSyncedAt: driveSync?.lastSyncedAt?.toISOString() ?? null,
        lastSyncStatus: driveSync?.lastSyncStatus ?? null,
        lastSyncError: driveSync?.lastSyncError ?? null,
        userDriveConnected,
        canUsePicker: userDriveConnected,
      };
    }),

  upsertDriveSyncConfig: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        driveFolderId: z.string().min(1),
        driveFolderName: z.string().optional(),
        enabled: z.boolean().default(true),
        recursive: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const topicSpace = await findTopicSpaceWithGraph(ctx.db, input.id);
      if (!topicSpace) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "リポジトリが見つかりません",
        });
      }
      assertTopicSpaceAdmin(topicSpace, ctx.session.user.id);

      const connected = await hasUserGoogleDriveConnection(
        ctx.db,
        ctx.session.user.id,
      );
      if (!connected) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Google Drive が未連携です。先に Drive を連携してください。",
        });
      }

      const driveSync = await ctx.db.topicSpaceDriveSync.upsert({
        where: { topicSpaceId: input.id },
        create: {
          topicSpaceId: input.id,
          driveFolderId: input.driveFolderId.trim(),
          driveFolderName: input.driveFolderName?.trim() ?? null,
          authMode: "user_oauth",
          configuredByUserId: ctx.session.user.id,
          enabled: input.enabled,
          recursive: input.recursive,
        },
        update: {
          driveFolderId: input.driveFolderId.trim(),
          driveFolderName: input.driveFolderName?.trim() ?? null,
          authMode: "user_oauth",
          configuredByUserId: ctx.session.user.id,
          enabled: input.enabled,
          recursive: input.recursive,
        },
      });

      return {
        driveFolderId: driveSync.driveFolderId,
        driveFolderName: driveSync.driveFolderName,
        driveFolderUrl: buildDriveFolderUrl(driveSync.driveFolderId),
        enabled: driveSync.enabled,
        recursive: driveSync.recursive,
      };
    }),

  syncDriveFolder: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return syncTopicSpaceDriveFolder(ctx, { topicSpaceId: input.id });
    }),
});
