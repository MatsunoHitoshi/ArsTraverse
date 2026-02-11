import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { MetaGraphStoryDataSchema } from "@/server/api/schemas/meta-graph-story";
import {
  convertToDatabase,
  convertFromDatabase,
  type StoryWithRelations,
} from "@/server/lib/meta-graph-converter";
import { checkTopicSpaceConsistency } from "@/server/lib/story-consistency-checker";
import type { Prisma } from "@prisma/client";

export const storyRouter = createTRPCRouter({
  /**
   * Storyを作成または更新
   */
  upsert: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        referencedTopicSpaceId: z.string(),
        data: MetaGraphStoryDataSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { workspaceId, referencedTopicSpaceId, data } = input;

      // ワークスペースへのアクセス権限を確認
      const workspace = await ctx.db.workspace.findFirst({
        where: {
          id: workspaceId,
          OR: [
            { userId: ctx.session.user.id },
            { collaborators: { some: { id: ctx.session.user.id } } },
          ],
        },
        include: {
          referencedTopicSpaces: true,
        },
      });

      if (!workspace) {
        throw new Error("Workspace not found or access denied");
      }

      // TopicSpaceの存在確認
      const topicSpace = await ctx.db.topicSpace.findUnique({
        where: { id: referencedTopicSpaceId },
      });

      if (!topicSpace) {
        throw new Error("TopicSpace not found");
      }

      // データをDB構造に変換
      const dbData = convertToDatabase(
        data,
        workspaceId,
        referencedTopicSpaceId,
      );

      // 既存のStoryを取得（同一workspaceIdのもの。削除済みも含む）
      // convertFromDatabase で履歴スナップショット用に relationshipsFrom も取得
      const existingStory = await ctx.db.story.findUnique({
        where: { workspaceId },
        include: {
          metaNodes: {
            include: {
              memberNodes: {
                include: {
                  relationshipsFrom: {
                    select: {
                      id: true,
                      type: true,
                      properties: true,
                      fromNodeId: true,
                      toNodeId: true,
                    },
                  },
                },
              },
              summary: true,
              storyContent: true,
            },
          },
          metaEdges: {
            include: {
              fromMetaNode: true,
              toMetaNode: true,
            },
          },
        },
      });

      // トランザクションで一括保存
      const result = await ctx.db.$transaction(async (tx) => {
        // 既存ストーリーがある場合は、上書き前に履歴としてスナップショットを保存
        if (existingStory) {
          const snapshotData = convertFromDatabase(
            existingStory as StoryWithRelations,
          );
          await tx.storyHistory.create({
            data: {
              storyId: existingStory.id,
              snapshotData: snapshotData as unknown as Prisma.InputJsonValue,
              savedById: ctx.session.user.id,
            },
          });
        }

        // Storyをupsert（同一workspaceIdの既存があればupdateで復元、なければcreate）
        const story = existingStory
          ? await tx.story.update({
              where: { id: existingStory.id },
              data: {
                referencedTopicSpaceId,
                updatedAt: new Date(),
                deletedAt: null, // 復元する場合に備えてnullに設定
                filter: data.filter
                  ? (data.filter as Prisma.InputJsonValue)
                  : undefined,
              },
            })
          : await tx.story.create({
              data: {
                workspaceId,
                referencedTopicSpaceId,
                filter: data.filter
                  ? (data.filter as Prisma.InputJsonValue)
                  : undefined,
              },
            });

        // 既存のMetaGraphNodeとMetaGraphRelationshipを削除
        if (existingStory) {
          await tx.metaGraphRelationship.deleteMany({
            where: { storyId: story.id },
          });
          await tx.communityStory.deleteMany({
            where: {
              metaNode: {
                storyId: story.id,
              },
            },
          });
          await tx.communitySummary.deleteMany({
            where: {
              metaNode: {
                storyId: story.id,
              },
            },
          });
          await tx.metaGraphNode.deleteMany({
            where: { storyId: story.id },
          });
        }

        // communityId -> MetaGraphNode.id のマッピング
        const communityIdToMetaNodeId = new Map<string, string>();

        // MetaGraphNodeを作成
        for (const metaNodeData of dbData.metaNodes) {
          const metaNode = await tx.metaGraphNode.create({
            data: {
              name: metaNodeData.name,
              label: metaNodeData.label,
              properties: metaNodeData.properties as Prisma.InputJsonValue,
              storyId: story.id,
              communityId: metaNodeData.communityId,
              size: metaNodeData.size,
              hasExternalConnections: metaNodeData.hasExternalConnections,
              memberNodes: {
                connect: metaNodeData.memberNodeIds.map((nodeId) => ({
                  id: nodeId,
                })),
              },
            },
          });
          communityIdToMetaNodeId.set(metaNodeData.communityId, metaNode.id);
        }

        // MetaGraphRelationshipを作成
        for (const edgeData of dbData.metaEdges) {
          const fromMetaNodeId =
            communityIdToMetaNodeId.get(edgeData.fromCommunityId);
          const toMetaNodeId =
            communityIdToMetaNodeId.get(edgeData.toCommunityId);

          if (!fromMetaNodeId || !toMetaNodeId) {
            throw new Error(
              `MetaNode not found for edge: ${edgeData.fromCommunityId} -> ${edgeData.toCommunityId}`,
            );
          }

          await tx.metaGraphRelationship.create({
            data: {
              type: edgeData.type,
              properties: edgeData.properties as Prisma.InputJsonValue,
              storyId: story.id,
              fromMetaNodeId,
              toMetaNodeId,
            },
          });
        }

        // CommunitySummaryを作成
        for (const summaryData of dbData.summaries) {
          const metaNodeId = communityIdToMetaNodeId.get(
            summaryData.communityId,
          );
          if (!metaNodeId) {
            throw new Error(
              `MetaNode not found for summary: ${summaryData.communityId}`,
            );
          }
          await tx.communitySummary.create({
            data: {
              metaNodeId,
              title: summaryData.title,
              summary: summaryData.summary,
              order: summaryData.order,
              transitionText: summaryData.transitionText,
            },
          });
        }

        // CommunityStoryを作成
        for (const storyData of dbData.stories) {
          const metaNodeId = communityIdToMetaNodeId.get(
            storyData.communityId,
          );
          if (!metaNodeId) {
            throw new Error(
              `MetaNode not found for story: ${storyData.communityId}`,
            );
          }
          await tx.communityStory.create({
            data: {
              metaNodeId,
              story: storyData.story,
            },
          });
        }

        return story;
      });

      return result;
    }),

  /**
   * Storyを取得
   */
  get: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { workspaceId } = input;

      // ワークスペースへのアクセス権限を確認
      const workspace = await ctx.db.workspace.findFirst({
        where: {
          id: workspaceId,
          OR: [
            { userId: ctx.session.user.id },
            { collaborators: { some: { id: ctx.session.user.id } } },
          ],
        },
        include: {
          referencedTopicSpaces: true,
        },
      });

      if (!workspace) {
        throw new Error("Workspace not found or access denied");
      }

      const story = await ctx.db.story.findFirst({
        where: {
          workspaceId,
          deletedAt: null,
        },
        include: {
          referencedTopicSpace: true,
          metaNodes: {
            include: {
              memberNodes: {
                include: {
                  // 内部エッジ情報を再構築するためにrelationshipsFromを含める
                  // convertFromDatabaseでコミュニティ内のエッジのみフィルタリングされる
                  relationshipsFrom: {
                    select: {
                      id: true,
                      type: true,
                      properties: true,
                      fromNodeId: true,
                      toNodeId: true,
                    },
                  },
                },
              },
              summary: true,
              storyContent: true,
            },
          },
          metaEdges: {
            include: {
              fromMetaNode: true,
              toMetaNode: true,
            },
          },
        },
      });

      if (!story) {
        return null;
      }

      // 整合性チェック
      const consistency = checkTopicSpaceConsistency(workspace, story);

      // データをMetaGraphStoryData形式に変換
      const metaGraphData = convertFromDatabase(
        story as StoryWithRelations,
      );

      return {
        story,
        metaGraphData,
        consistency,
      };
    }),

  /**
   * Storyを削除
   */
  delete: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { workspaceId } = input;

      const story = await ctx.db.story.findFirst({
        where: {
          workspaceId,
          deletedAt: null,
        },
        include: { workspace: true },
      });

      if (!story) {
        throw new Error("Story not found");
      }

      // 所有者または共同編集者のみが削除可能
      const hasAccess =
        story.workspace.userId === ctx.session.user.id ||
        (await ctx.db.workspace
          .findUnique({
            where: { id: workspaceId },
            include: { collaborators: true },
          })
          .then((ws) =>
            ws?.collaborators.some((c) => c.id === ctx.session.user.id),
          ));

      if (!hasAccess) {
        throw new Error("Access denied");
      }

      // Storyをソフトデリート（deletedAtにタイムスタンプを設定）
      return ctx.db.story.update({
        where: { workspaceId },
        data: {
          deletedAt: new Date(),
        },
      });
    }),

  /**
   * TopicSpace整合性チェック
   */
  checkConsistency: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { workspaceId } = input;

      const workspace = await ctx.db.workspace.findFirst({
        where: {
          id: workspaceId,
          OR: [
            { userId: ctx.session.user.id },
            { collaborators: { some: { id: ctx.session.user.id } } },
          ],
        },
        include: {
          referencedTopicSpaces: true,
          story: {
            where: { deletedAt: null },
            include: {
              referencedTopicSpace: true,
            },
          },
        },
      });

      if (!workspace) {
        throw new Error("Workspace not found or access denied");
      }

      return checkTopicSpaceConsistency(
        workspace,
        workspace.story
          ? {
              ...workspace.story,
              referencedTopicSpace: workspace.story.referencedTopicSpace,
            }
          : null,
      );
    }),

  /**
   * ストーリー保存履歴一覧を取得
   */
  listHistory: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const workspace = await ctx.db.workspace.findFirst({
        where: {
          id: input.workspaceId,
          OR: [
            { userId: ctx.session.user.id },
            { collaborators: { some: { id: ctx.session.user.id } } },
          ],
        },
      });
      if (!workspace) {
        throw new Error("Workspace not found or access denied");
      }

      const story = await ctx.db.story.findUnique({
        where: { workspaceId: input.workspaceId },
      });
      if (!story) {
        return [];
      }

      return ctx.db.storyHistory.findMany({
        where: { storyId: story.id },
        include: {
          savedBy: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });
    }),

  /**
   * ストーリー保存履歴の1件を取得（内容の振り返り用）
   */
  getHistoryEntry: protectedProcedure
    .input(z.object({ historyId: z.string() }))
    .query(async ({ ctx, input }) => {
      const entry = await ctx.db.storyHistory.findFirst({
        where: { id: input.historyId },
        include: { story: true },
      });
      if (!entry) {
        throw new Error("Story history not found");
      }

      const workspace = await ctx.db.workspace.findFirst({
        where: {
          id: entry.story.workspaceId,
          OR: [
            { userId: ctx.session.user.id },
            { collaborators: { some: { id: ctx.session.user.id } } },
          ],
        },
      });
      if (!workspace) {
        throw new Error("Access denied");
      }

      return {
        id: entry.id,
        snapshotData: entry.snapshotData,
        description: entry.description,
        savedById: entry.savedById,
        createdAt: entry.createdAt,
      };
    }),
});
