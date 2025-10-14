import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { TRPCError } from "@trpc/server";
import {
  ProposalStatus,
  GraphChangeType,
  GraphChangeEntityType,
  GraphChangeRecordType,
} from "@prisma/client";
import { KnowledgeGraphInputSchema } from "./topic-space";
import { TiptapContentSchema } from "./workspace";

// 変更提案作成スキーマ
const CreateProposalSchema = z.object({
  topicSpaceId: z.string(),
  title: z.string().min(1, "タイトルは必須です"),
  description: z.string().optional(),
  changes: z.array(
    z.object({
      changeType: z.nativeEnum(GraphChangeType),
      changeEntityType: z.nativeEnum(GraphChangeEntityType),
      changeEntityId: z.string(),
      previousState: KnowledgeGraphInputSchema,
      nextState: KnowledgeGraphInputSchema,
    }),
  ),
});

// 変更提案更新スキーマ
const UpdateProposalSchema = z.object({
  proposalId: z.string(),
  title: z.string().min(1, "タイトルは必須です").optional(),
  description: z.string().optional(),
  changes: z
    .array(
      z.object({
        changeType: z.nativeEnum(GraphChangeType),
        changeEntityType: z.nativeEnum(GraphChangeEntityType),
        changeEntityId: z.string(),
        previousState: KnowledgeGraphInputSchema,
        nextState: KnowledgeGraphInputSchema,
      }),
    )
    .optional(),
});

// コメント追加スキーマ
const AddCommentSchema = z.object({
  proposalId: z.string(),
  content: TiptapContentSchema,
  parentCommentId: z.string().optional(),
});

export const graphEditProposalRouter = createTRPCRouter({
  // 変更提案を作成
  createProposal: protectedProcedure
    .input(CreateProposalSchema)
    .mutation(async ({ ctx, input }) => {
      // TopicSpaceが存在するかチェック
      const topicSpace = await ctx.db.topicSpace.findFirst({
        where: {
          id: input.topicSpaceId,
          isDeleted: false,
        },
        include: {
          admins: true,
        },
      });

      if (!topicSpace) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "TopicSpaceが見つかりません",
        });
      }

      // 提案者をTopicSpaceのadminに追加（権限チェック）
      const isAdmin = topicSpace.admins.some(
        (admin) => admin.id === ctx.session.user.id,
      );
      if (!isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "このTopicSpaceに変更提案を作成する権限がありません",
        });
      }

      const proposal = await ctx.db.graphEditProposal.create({
        data: {
          title: input.title,
          description: input.description,
          status: ProposalStatus.DRAFT,
          topicSpaceId: input.topicSpaceId,
          proposerId: ctx.session.user.id,
          changes: {
            create: input.changes.map((change) => ({
              changeType: change.changeType,
              changeEntityType: change.changeEntityType,
              changeEntityId: change.changeEntityId,
              previousState: change.previousState,
              nextState: change.nextState,
            })),
          },
        },
        include: {
          proposer: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
          changes: true,
        },
      });

      return proposal;
    }),

  // 変更提案を更新（DRAFT/PENDING状態のみ）
  updateProposal: protectedProcedure
    .input(UpdateProposalSchema)
    .mutation(async ({ ctx, input }) => {
      const existingProposal = await ctx.db.graphEditProposal.findUnique({
        where: { id: input.proposalId },
        include: {
          proposer: true,
          topicSpace: {
            include: {
              admins: true,
            },
          },
        },
      });

      if (!existingProposal) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "変更提案が見つかりません",
        });
      }

      // 提案者またはTopicSpaceのadminのみ更新可能
      const isProposer = existingProposal.proposerId === ctx.session.user.id;
      const isAdmin = existingProposal.topicSpace.admins.some(
        (admin) => admin.id === ctx.session.user.id,
      );

      if (!isProposer && !isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "この変更提案を更新する権限がありません",
        });
      }

      // DRAFT/PENDING状態のみ更新可能
      if (
        !(
          [ProposalStatus.DRAFT, ProposalStatus.PENDING] as ProposalStatus[]
        ).includes(existingProposal.status)
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "この状態の変更提案は更新できません",
        });
      }

      // ロックされている場合は更新不可
      if (
        existingProposal.lockedById &&
        existingProposal.lockedById !== ctx.session.user.id
      ) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "この変更提案は他のユーザーによってロックされています",
        });
      }

      const updateData: {
        title?: string;
        description?: string;
      } = {};
      if (input.title !== undefined) updateData.title = input.title;
      if (input.description !== undefined)
        updateData.description = input.description;

      const proposal = await ctx.db.graphEditProposal.update({
        where: { id: input.proposalId },
        data: updateData,
        include: {
          proposer: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
          changes: true,
        },
      });

      // 変更内容も更新する場合
      if (input.changes) {
        // 既存の変更を削除
        await ctx.db.graphEditChange.deleteMany({
          where: { proposalId: input.proposalId },
        });

        // 新しい変更を追加
        await ctx.db.graphEditChange.createMany({
          data: input.changes.map((change) => ({
            proposalId: input.proposalId,
            changeType: change.changeType,
            changeEntityType: change.changeEntityType,
            changeEntityId: change.changeEntityId,
            previousState: change.previousState,
            nextState: change.nextState,
          })),
        });
      }

      return proposal;
    }),

  // 提案を提出（DRAFT → PENDING）
  submitProposal: protectedProcedure
    .input(z.object({ proposalId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const proposal = await ctx.db.graphEditProposal.findUnique({
        where: { id: input.proposalId },
        include: {
          proposer: true,
        },
      });

      if (!proposal) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "変更提案が見つかりません",
        });
      }

      // 提案者のみ提出可能
      if (proposal.proposerId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "この変更提案を提出する権限がありません",
        });
      }

      // DRAFT状態のみ提出可能
      if (proposal.status !== ProposalStatus.DRAFT) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "この状態の変更提案は提出できません",
        });
      }

      const updatedProposal = await ctx.db.graphEditProposal.update({
        where: { id: input.proposalId },
        data: {
          status: ProposalStatus.PENDING,
        },
        include: {
          proposer: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
          changes: true,
        },
      });

      return updatedProposal;
    }),

  // 変更提案詳細取得
  getProposalById: protectedProcedure
    .input(z.object({ proposalId: z.string() }))
    .query(async ({ ctx, input }) => {
      const proposal = await ctx.db.graphEditProposal.findUnique({
        where: { id: input.proposalId },
        include: {
          proposer: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
          reviewer: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
          lockedBy: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
          changes: true,
          comments: {
            where: { isDeleted: false },
            include: {
              author: {
                select: {
                  id: true,
                  name: true,
                  image: true,
                },
              },
              childComments: {
                where: { isDeleted: false },
                include: {
                  author: {
                    select: {
                      id: true,
                      name: true,
                      image: true,
                    },
                  },
                },
                orderBy: { createdAt: "asc" },
              },
            },
            orderBy: { createdAt: "asc" },
          },
          topicSpace: {
            include: {
              admins: true,
            },
          },
        },
      });

      if (!proposal) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "変更提案が見つかりません",
        });
      }

      // TopicSpaceのadminまたは提案者のみアクセス可能
      const isAdmin = proposal.topicSpace.admins.some(
        (admin) => admin.id === ctx.session.user.id,
      );
      const isProposer = proposal.proposerId === ctx.session.user.id;

      if (!isAdmin && !isProposer) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "この変更提案を閲覧する権限がありません",
        });
      }

      return proposal;
    }),

  // TopicSpace別の提案一覧
  listProposalsByTopicSpace: protectedProcedure
    .input(
      z.object({
        topicSpaceId: z.string(),
        status: z.nativeEnum(ProposalStatus).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // TopicSpaceが存在するかチェック
      const topicSpace = await ctx.db.topicSpace.findFirst({
        where: {
          id: input.topicSpaceId,
          isDeleted: false,
        },
        include: {
          admins: true,
        },
      });

      if (!topicSpace) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "TopicSpaceが見つかりません",
        });
      }

      // TopicSpaceのadminのみアクセス可能
      const isAdmin = topicSpace.admins.some(
        (admin) => admin.id === ctx.session.user.id,
      );
      if (!isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "このTopicSpaceの変更提案を閲覧する権限がありません",
        });
      }

      const whereClause: {
        topicSpaceId: string;
        status?: ProposalStatus;
      } = {
        topicSpaceId: input.topicSpaceId,
      };

      if (input.status) {
        whereClause.status = input.status;
      }

      const proposals = await ctx.db.graphEditProposal.findMany({
        where: whereClause,
        include: {
          proposer: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
          reviewer: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
          lockedBy: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
          changes: true,
          _count: {
            select: {
              comments: {
                where: { isDeleted: false },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      return proposals;
    }),

  // 変更提案をロック（悲観的ロック）
  lockProposal: protectedProcedure
    .input(z.object({ proposalId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const proposal = await ctx.db.graphEditProposal.findUnique({
        where: { id: input.proposalId },
        include: {
          topicSpace: {
            include: {
              admins: true,
            },
          },
        },
      });

      if (!proposal) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "変更提案が見つかりません",
        });
      }

      // TopicSpaceのadminのみロック可能
      const isAdmin = proposal.topicSpace.admins.some(
        (admin) => admin.id === ctx.session.user.id,
      );
      if (!isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "この変更提案をロックする権限がありません",
        });
      }

      // 既にロックされている場合はエラー
      if (proposal.lockedById && proposal.lockedById !== ctx.session.user.id) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "この変更提案は他のユーザーによってロックされています",
        });
      }

      const updatedProposal = await ctx.db.graphEditProposal.update({
        where: { id: input.proposalId },
        data: {
          status: ProposalStatus.LOCKED,
          lockedAt: new Date(),
          lockedById: ctx.session.user.id,
        },
        include: {
          lockedBy: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
        },
      });

      return updatedProposal;
    }),

  // ロック解除
  unlockProposal: protectedProcedure
    .input(z.object({ proposalId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const proposal = await ctx.db.graphEditProposal.findUnique({
        where: { id: input.proposalId },
        include: {
          topicSpace: {
            include: {
              admins: true,
            },
          },
        },
      });

      if (!proposal) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "変更提案が見つかりません",
        });
      }

      // TopicSpaceのadminまたはロックしたユーザーのみ解除可能
      const isAdmin = proposal.topicSpace.admins.some(
        (admin) => admin.id === ctx.session.user.id,
      );
      const isLockedBy = proposal.lockedById === ctx.session.user.id;

      if (!isAdmin && !isLockedBy) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "この変更提案のロックを解除する権限がありません",
        });
      }

      const updatedProposal = await ctx.db.graphEditProposal.update({
        where: { id: input.proposalId },
        data: {
          status: ProposalStatus.PENDING,
          lockedAt: null,
          lockedById: null,
        },
      });

      return updatedProposal;
    }),

  // レビュー開始（PENDING → IN_REVIEW）
  reviewProposal: protectedProcedure
    .input(z.object({ proposalId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const proposal = await ctx.db.graphEditProposal.findUnique({
        where: { id: input.proposalId },
        include: {
          topicSpace: {
            include: {
              admins: true,
            },
          },
        },
      });

      if (!proposal) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "変更提案が見つかりません",
        });
      }

      // TopicSpaceのadminのみレビュー可能
      const isAdmin = proposal.topicSpace.admins.some(
        (admin) => admin.id === ctx.session.user.id,
      );
      if (!isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "この変更提案をレビューする権限がありません",
        });
      }

      // PENDING状態のみレビュー可能
      if (proposal.status !== ProposalStatus.PENDING) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "この状態の変更提案はレビューできません",
        });
      }

      const updatedProposal = await ctx.db.graphEditProposal.update({
        where: { id: input.proposalId },
        data: {
          status: ProposalStatus.IN_REVIEW,
          reviewerId: ctx.session.user.id,
          reviewedAt: new Date(),
        },
        include: {
          reviewer: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
        },
      });

      return updatedProposal;
    }),

  // 提案を承認
  approveProposal: protectedProcedure
    .input(z.object({ proposalId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const proposal = await ctx.db.graphEditProposal.findUnique({
        where: { id: input.proposalId },
        include: {
          topicSpace: {
            include: {
              admins: true,
            },
          },
        },
      });

      if (!proposal) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "変更提案が見つかりません",
        });
      }

      // TopicSpaceのadminのみ承認可能
      const isAdmin = proposal.topicSpace.admins.some(
        (admin) => admin.id === ctx.session.user.id,
      );
      if (!isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "この変更提案を承認する権限がありません",
        });
      }

      // IN_REVIEW状態のみ承認可能
      if (proposal.status !== ProposalStatus.IN_REVIEW) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "この状態の変更提案は承認できません",
        });
      }

      const updatedProposal = await ctx.db.graphEditProposal.update({
        where: { id: input.proposalId },
        data: {
          status: ProposalStatus.APPROVED,
          approvedAt: new Date(),
        },
      });

      return updatedProposal;
    }),

  // 提案を却下
  rejectProposal: protectedProcedure
    .input(
      z.object({
        proposalId: z.string(),
        rejectionReason: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const proposal = await ctx.db.graphEditProposal.findUnique({
        where: { id: input.proposalId },
        include: {
          topicSpace: {
            include: {
              admins: true,
            },
          },
        },
      });

      if (!proposal) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "変更提案が見つかりません",
        });
      }

      // TopicSpaceのadminのみ却下可能
      const isAdmin = proposal.topicSpace.admins.some(
        (admin) => admin.id === ctx.session.user.id,
      );
      if (!isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "この変更提案を却下する権限がありません",
        });
      }

      // IN_REVIEW状態のみ却下可能
      if (proposal.status !== ProposalStatus.IN_REVIEW) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "この状態の変更提案は却下できません",
        });
      }

      const updatedProposal = await ctx.db.graphEditProposal.update({
        where: { id: input.proposalId },
        data: {
          status: ProposalStatus.REJECTED,
          rejectedAt: new Date(),
          rejectionReason: input.rejectionReason,
        },
      });

      return updatedProposal;
    }),

  // 承認済み提案をマージ
  mergeProposal: protectedProcedure
    .input(z.object({ proposalId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const proposal = await ctx.db.graphEditProposal.findUnique({
        where: { id: input.proposalId },
        include: {
          changes: true,
          topicSpace: {
            include: {
              admins: true,
              graphNodes: true,
              graphRelationships: true,
            },
          },
        },
      });

      if (!proposal) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "変更提案が見つかりません",
        });
      }

      // TopicSpaceのadminのみマージ可能
      const isAdmin = proposal.topicSpace.admins.some(
        (admin) => admin.id === ctx.session.user.id,
      );
      if (!isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "この変更提案をマージする権限がありません",
        });
      }

      // APPROVED状態のみマージ可能
      if (proposal.status !== ProposalStatus.APPROVED) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "この状態の変更提案はマージできません",
        });
      }

      // 変更履歴を作成
      const graphChangeHistory = await ctx.db.graphChangeHistory.create({
        data: {
          recordType: GraphChangeRecordType.TOPIC_SPACE,
          recordId: proposal.topicSpaceId,
          description: `変更提案「${proposal.title}」をマージしました`,
          userId: ctx.session.user.id,
        },
      });

      // 各変更を適用
      for (const change of proposal.changes) {
        if (change.changeEntityType === GraphChangeEntityType.NODE) {
          if (change.changeType === GraphChangeType.UPDATE) {
            await ctx.db.graphNode.update({
              where: { id: change.changeEntityId },
              data: { properties: change.nextState ?? {} },
            });
          }
        } else if (change.changeEntityType === GraphChangeEntityType.EDGE) {
          if (change.changeType === GraphChangeType.UPDATE) {
            await ctx.db.graphRelationship.update({
              where: { id: change.changeEntityId },
              data: { properties: change.nextState ?? {} },
            });
          }
        }

        // 変更履歴を記録
        await ctx.db.nodeLinkChangeHistory.create({
          data: {
            changeType: change.changeType,
            changeEntityType: change.changeEntityType,
            changeEntityId: change.changeEntityId,
            previousState: change.previousState ?? {},
            nextState: change.nextState ?? {},
            graphChangeHistoryId: graphChangeHistory.id,
          },
        });
      }

      // 提案をマージ済みに更新
      const updatedProposal = await ctx.db.graphEditProposal.update({
        where: { id: input.proposalId },
        data: {
          status: ProposalStatus.MERGED,
        },
      });

      return updatedProposal;
    }),

  // 提案を取り下げ
  cancelProposal: protectedProcedure
    .input(z.object({ proposalId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const proposal = await ctx.db.graphEditProposal.findUnique({
        where: { id: input.proposalId },
        include: {
          proposer: true,
        },
      });

      if (!proposal) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "変更提案が見つかりません",
        });
      }

      // 提案者のみ取り下げ可能
      if (proposal.proposerId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "この変更提案を取り下げる権限がありません",
        });
      }

      // DRAFT/PENDING状態のみ取り下げ可能
      if (
        !(
          [ProposalStatus.DRAFT, ProposalStatus.PENDING] as ProposalStatus[]
        ).includes(proposal.status)
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "この状態の変更提案は取り下げできません",
        });
      }

      const updatedProposal = await ctx.db.graphEditProposal.update({
        where: { id: input.proposalId },
        data: {
          status: ProposalStatus.CANCELLED,
        },
      });

      return updatedProposal;
    }),

  // コメント追加
  addComment: protectedProcedure
    .input(AddCommentSchema)
    .mutation(async ({ ctx, input }) => {
      // 提案が存在するかチェック
      const proposal = await ctx.db.graphEditProposal.findUnique({
        where: { id: input.proposalId },
        include: {
          topicSpace: {
            include: {
              admins: true,
            },
          },
        },
      });

      if (!proposal) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "変更提案が見つかりません",
        });
      }

      // TopicSpaceのadminまたは提案者のみコメント可能
      const isAdmin = proposal.topicSpace.admins.some(
        (admin) => admin.id === ctx.session.user.id,
      );
      const isProposer = proposal.proposerId === ctx.session.user.id;

      if (!isAdmin && !isProposer) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "この変更提案にコメントする権限がありません",
        });
      }

      const comment = await ctx.db.proposalComment.create({
        data: {
          proposalId: input.proposalId,
          authorId: ctx.session.user.id,
          content: input.content,
          parentCommentId: input.parentCommentId,
        },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
        },
      });

      return comment;
    }),

  // コメント取得
  getComments: protectedProcedure
    .input(z.object({ proposalId: z.string() }))
    .query(async ({ ctx, input }) => {
      const proposal = await ctx.db.graphEditProposal.findUnique({
        where: { id: input.proposalId },
        include: {
          topicSpace: {
            include: {
              admins: true,
            },
          },
        },
      });

      if (!proposal) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "変更提案が見つかりません",
        });
      }

      // TopicSpaceのadminまたは提案者のみコメント閲覧可能
      const isAdmin = proposal.topicSpace.admins.some(
        (admin) => admin.id === ctx.session.user.id,
      );
      const isProposer = proposal.proposerId === ctx.session.user.id;

      if (!isAdmin && !isProposer) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "この変更提案のコメントを閲覧する権限がありません",
        });
      }

      const comments = await ctx.db.proposalComment.findMany({
        where: {
          proposalId: input.proposalId,
          isDeleted: false,
          parentCommentId: null, // 親コメントのみ取得
        },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
          childComments: {
            where: { isDeleted: false },
            include: {
              author: {
                select: {
                  id: true,
                  name: true,
                  image: true,
                },
              },
            },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: { createdAt: "asc" },
      });

      return comments;
    }),

  // 変更をロールバック
  rollbackChange: protectedProcedure
    .input(
      z.object({
        changeHistoryId: z.string(),
        reason: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // 変更履歴を取得
      const changeHistory = await ctx.db.graphChangeHistory.findUnique({
        where: { id: input.changeHistoryId },
        include: {
          nodeLinkChangeHistories: true,
          user: true,
        },
      });

      if (!changeHistory) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "変更履歴が見つかりません",
        });
      }

      // TopicSpaceを取得してadmin権限をチェック
      const topicSpace = await ctx.db.topicSpace.findFirst({
        where: {
          id: changeHistory.recordId,
          isDeleted: false,
        },
        include: {
          admins: true,
        },
      });

      if (!topicSpace) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "TopicSpaceが見つかりません",
        });
      }

      // TopicSpaceのadminのみロールバック可能
      const isAdmin = topicSpace.admins.some(
        (admin) => admin.id === ctx.session.user.id,
      );
      if (!isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "この変更をロールバックする権限がありません",
        });
      }

      // ロールバック用の変更履歴を作成
      const rollbackHistory = await ctx.db.graphChangeHistory.create({
        data: {
          recordType: GraphChangeRecordType.TOPIC_SPACE,
          recordId: changeHistory.recordId,
          description: `変更をロールバックしました${input.reason ? `: ${input.reason}` : ""}`,
          userId: ctx.session.user.id,
        },
      });

      // 各変更を逆順で適用（ロールバック）
      for (const change of changeHistory.nodeLinkChangeHistories) {
        if (change.changeEntityType === GraphChangeEntityType.NODE) {
          if (change.changeType === GraphChangeType.UPDATE) {
            await ctx.db.graphNode.update({
              where: { id: change.changeEntityId },
              data: { properties: change.previousState ?? {} },
            });
          }
        } else if (change.changeEntityType === GraphChangeEntityType.EDGE) {
          if (change.changeType === GraphChangeType.UPDATE) {
            await ctx.db.graphRelationship.update({
              where: { id: change.changeEntityId },
              data: { properties: change.previousState ?? {} },
            });
          }
        }

        // ロールバック履歴を記録
        await ctx.db.nodeLinkChangeHistory.create({
          data: {
            changeType: change.changeType,
            changeEntityType: change.changeEntityType,
            changeEntityId: change.changeEntityId,
            previousState: change.nextState ?? {}, // 現在の状態
            nextState: change.previousState ?? {}, // ロールバック後の状態
            graphChangeHistoryId: rollbackHistory.id,
          },
        });
      }

      return {
        message: "ロールバックが完了しました",
        rollbackHistoryId: rollbackHistory.id,
      };
    }),

  // 変更履歴一覧取得（ロールバック用）
  getChangeHistoryForRollback: protectedProcedure
    .input(z.object({ topicSpaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      // TopicSpaceが存在するかチェック
      const topicSpace = await ctx.db.topicSpace.findFirst({
        where: {
          id: input.topicSpaceId,
          isDeleted: false,
        },
        include: {
          admins: true,
        },
      });

      if (!topicSpace) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "TopicSpaceが見つかりません",
        });
      }

      // TopicSpaceのadminのみアクセス可能
      const isAdmin = topicSpace.admins.some(
        (admin) => admin.id === ctx.session.user.id,
      );
      if (!isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "このTopicSpaceの変更履歴を閲覧する権限がありません",
        });
      }

      const changeHistories = await ctx.db.graphChangeHistory.findMany({
        where: {
          recordId: input.topicSpaceId,
          recordType: GraphChangeRecordType.TOPIC_SPACE,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
          nodeLinkChangeHistories: {
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      return changeHistories;
    }),
});
