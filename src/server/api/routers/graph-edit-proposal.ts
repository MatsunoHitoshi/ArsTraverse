import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { PUBLIC_USER_SELECT } from "@/server/lib/user-select";
import { ProposalStatus, GraphChangeRecordType } from "@prisma/client";
import { KnowledgeGraphInputSchema } from "../schemas/knowledge-graph";
import { TiptapContentSchema } from "./workspace";
import type {
  NodeTypeForFrontend,
  RelationshipTypeForFrontend,
} from "@/app/const/types";
import { createGraphEditProposal } from "@/server/services/graph-edit-proposal/create-graph-edit-proposal.service";
import { updateGraphEditProposal } from "@/server/services/graph-edit-proposal/update-graph-edit-proposal.service";
import { mergeGraphEditProposal } from "@/server/services/graph-edit-proposal/merge-proposal.service";
import { rollbackGraphChange } from "@/server/services/graph-edit-proposal/rollback-change.service";
import { createDraftProposal as createDraftProposalRecord } from "@/server/services/graph-edit-proposal/draft-proposal.service";
import { getGraphEditProposalMessage } from "@/server/lib/i18n/prompts/graph-edit-proposal";
import {
  deleteNodeInDraft,
  deleteRelationshipInDraft,
  getProposalDraftDiff,
  getProposalDraftGraph,
  deduplicateEdgesInDraft,
  mergeNodesInDraft,
  setNodePropertyInDraft,
  setRelationshipPropertyInDraft,
  unsetNodePropertyInDraft,
  unsetRelationshipPropertyInDraft,
  upsertNodeInDraft,
  upsertRelationshipInDraft,
} from "@/server/services/graph-edit-proposal/draft-edit.service";
// 変更提案作成スキーマ
const CreateProposalSchema = z.object({
  topicSpaceId: z.string(),
  title: z.string().min(1, "タイトルは必須です"),
  description: z.string().min(10, "説明は10文字以上必要です"),
  newGraphData: KnowledgeGraphInputSchema,
});

// 変更提案更新スキーマ
const UpdateProposalSchema = z.object({
  proposalId: z.string(),
  title: z.string().min(1, "タイトルは必須です").optional(),
  description: z.string().optional(),
  newGraphData: KnowledgeGraphInputSchema.optional(),
});

// コメント追加スキーマ
const AddCommentSchema = z.object({
  proposalId: z.string(),
  content: TiptapContentSchema,
  parentCommentId: z.string().optional(),
});

const PropertyValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

const PropertiesRecordSchema = z
  .record(PropertyValueSchema)
  .optional()
  .default({});

// ===== ドラフト編集（MCP/LLM向け）入力スキーマ =====
const CreateDraftProposalSchema = z.object({
  topicSpaceId: z.string(),
  title: z.string().min(1, "タイトルは必須です"),
  description: z.string().min(10, "説明は10文字以上必要です"),
});

const UpsertNodeInDraftSchema = z.object({
  proposalId: z.string(),
  node: z.object({
    id: z.string(),
    name: z.string(),
    label: z.string(),
    properties: PropertiesRecordSchema,
  }),
});

const DeleteNodeInDraftSchema = z.object({
  proposalId: z.string(),
  nodeId: z.string(),
});

const SetNodePropertyInDraftSchema = z.object({
  proposalId: z.string(),
  nodeId: z.string(),
  key: z.string(),
  value: PropertyValueSchema,
});

const UnsetNodePropertyInDraftSchema = z.object({
  proposalId: z.string(),
  nodeId: z.string(),
  key: z.string(),
});

const UpsertRelationshipInDraftSchema = z.object({
  proposalId: z.string(),
  relationship: z.object({
    id: z.string(),
    type: z.string(),
    sourceId: z.string(),
    targetId: z.string(),
    properties: PropertiesRecordSchema,
  }),
});

const DeleteRelationshipInDraftSchema = z.object({
  proposalId: z.string(),
  relationshipId: z.string(),
});

const SetRelationshipPropertyInDraftSchema = z.object({
  proposalId: z.string(),
  relationshipId: z.string(),
  key: z.string(),
  value: PropertyValueSchema,
});

const UnsetRelationshipPropertyInDraftSchema = z.object({
  proposalId: z.string(),
  relationshipId: z.string(),
  key: z.string(),
});

const MergeNodesInDraftSchema = z.object({
  proposalId: z.string(),
  canonicalNodeId: z.string(),
  duplicateNodeIds: z.array(z.string()).min(1),
  canonicalName: z.string().optional(),
  canonicalLabel: z.string().optional(),
  canonicalProperties: PropertiesRecordSchema.optional(),
});

const DeduplicateEdgesInDraftSchema = z.object({
  proposalId: z.string(),
  edgeGroups: z
    .array(
      z.object({
        keepEdgeId: z.string(),
        removeEdgeIds: z.array(z.string()),
      }),
    )
    .optional(),
});

export const graphEditProposalRouter = createTRPCRouter({
  // 変更提案を作成
  createProposal: protectedProcedure
    .input(CreateProposalSchema)
    .mutation(({ ctx, input }) =>
      createGraphEditProposal(ctx.db, {
        topicSpaceId: input.topicSpaceId,
        title: input.title,
        description: input.description,
        proposerId: ctx.session.user.id,
        newGraphData: {
          nodes: input.newGraphData.nodes as NodeTypeForFrontend[],
          relationships: input.newGraphData
            .relationships as RelationshipTypeForFrontend[],
        },
      }),
    ),

  // 変更提案を更新（DRAFT/PENDING状態のみ）
  updateProposal: protectedProcedure
    .input(UpdateProposalSchema)
    .mutation(({ ctx, input }) =>
      updateGraphEditProposal(ctx.db, {
        proposalId: input.proposalId,
        userId: ctx.session.user.id,
        title: input.title,
        description: input.description,
        newGraphData: input.newGraphData
          ? {
              nodes: input.newGraphData.nodes as NodeTypeForFrontend[],
              relationships: input.newGraphData
                .relationships as RelationshipTypeForFrontend[],
            }
          : undefined,
      }),
    ),

  // =========================================================
  // ドラフト編集（LLM/MCP向け: proposal.changes を段階的に更新）
  // =========================================================
  createDraftProposal: protectedProcedure
    .input(CreateDraftProposalSchema)
    .mutation(async ({ ctx, input }) =>
      createDraftProposalRecord(ctx.db, {
        ...input,
        proposerId: ctx.session.user.id,
      }),
    ),

  upsertNodeInDraft: protectedProcedure
    .input(UpsertNodeInDraftSchema)
    .mutation(({ ctx, input }) =>
      upsertNodeInDraft(ctx.db, ctx.session.user.id, input),
    ),

  deleteNodeInDraft: protectedProcedure
    .input(DeleteNodeInDraftSchema)
    .mutation(({ ctx, input }) =>
      deleteNodeInDraft(ctx.db, ctx.session.user.id, input),
    ),

  setNodePropertyInDraft: protectedProcedure
    .input(SetNodePropertyInDraftSchema)
    .mutation(({ ctx, input }) =>
      setNodePropertyInDraft(ctx.db, ctx.session.user.id, input),
    ),

  unsetNodePropertyInDraft: protectedProcedure
    .input(UnsetNodePropertyInDraftSchema)
    .mutation(({ ctx, input }) =>
      unsetNodePropertyInDraft(ctx.db, ctx.session.user.id, input),
    ),

  upsertRelationshipInDraft: protectedProcedure
    .input(UpsertRelationshipInDraftSchema)
    .mutation(({ ctx, input }) =>
      upsertRelationshipInDraft(ctx.db, ctx.session.user.id, input),
    ),

  deleteRelationshipInDraft: protectedProcedure
    .input(DeleteRelationshipInDraftSchema)
    .mutation(({ ctx, input }) =>
      deleteRelationshipInDraft(ctx.db, ctx.session.user.id, input),
    ),

  setRelationshipPropertyInDraft: protectedProcedure
    .input(SetRelationshipPropertyInDraftSchema)
    .mutation(({ ctx, input }) =>
      setRelationshipPropertyInDraft(ctx.db, ctx.session.user.id, input),
    ),

  unsetRelationshipPropertyInDraft: protectedProcedure
    .input(UnsetRelationshipPropertyInDraftSchema)
    .mutation(({ ctx, input }) =>
      unsetRelationshipPropertyInDraft(ctx.db, ctx.session.user.id, input),
    ),

  mergeNodesInDraft: protectedProcedure
    .input(MergeNodesInDraftSchema)
    .mutation(({ ctx, input }) =>
      mergeNodesInDraft(ctx.db, ctx.session.user.id, {
        proposalId: input.proposalId,
        canonicalNodeId: input.canonicalNodeId,
        duplicateNodeIds: input.duplicateNodeIds,
        canonicalName: input.canonicalName,
        canonicalLabel: input.canonicalLabel,
        canonicalProperties: input.canonicalProperties
          ? Object.fromEntries(
              Object.entries(input.canonicalProperties).map(([k, v]) => [
                k,
                String(v),
              ]),
            )
          : undefined,
      }),
    ),

  deduplicateEdgesInDraft: protectedProcedure
    .input(DeduplicateEdgesInDraftSchema)
    .mutation(({ ctx, input }) =>
      deduplicateEdgesInDraft(ctx.db, ctx.session.user.id, input),
    ),

  // =========================================================
  // ドラフト確認（LLM向け：必要なら呼び出して下書き状態を確認）
  // =========================================================
  getProposalDraftDiff: protectedProcedure
    .input(z.object({ proposalId: z.string() }))
    .query(({ ctx, input }) =>
      getProposalDraftDiff(ctx.db, ctx.session.user.id, input.proposalId),
    ),

  getProposalDraftGraph: protectedProcedure
    .input(z.object({ proposalId: z.string() }))
    .query(({ ctx, input }) =>
      getProposalDraftGraph(ctx.db, ctx.session.user.id, input.proposalId),
    ),

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
          message: getGraphEditProposalMessage(ctx.locale, "notFound"),
        });
      }

      // 提案者のみ提出可能
      if (proposal.proposerId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: getGraphEditProposalMessage(ctx.locale, "submitForbidden"),
        });
      }

      // DRAFT状態のみ提出可能
      if (proposal.status !== ProposalStatus.DRAFT) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: getGraphEditProposalMessage(ctx.locale, "submitInvalidState"),
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
            select: PUBLIC_USER_SELECT,
          },
          reviewer: {
            select: PUBLIC_USER_SELECT,
          },
          lockedBy: {
            select: PUBLIC_USER_SELECT,
          },
          changes: true,
          comments: {
            where: { isDeleted: false },
            include: {
              author: {
                select: PUBLIC_USER_SELECT,
              },
              childComments: {
                where: { isDeleted: false },
                include: {
                  author: {
                    select: PUBLIC_USER_SELECT,
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
          message: getGraphEditProposalMessage(ctx.locale, "notFound"),
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
          message: getGraphEditProposalMessage(ctx.locale, "viewForbidden"),
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
          message: getGraphEditProposalMessage(ctx.locale, "repositoryNotFound"),
        });
      }

      // TopicSpaceのadminのみアクセス可能
      const isAdmin = topicSpace.admins.some(
        (admin) => admin.id === ctx.session.user.id,
      );
      if (!isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: getGraphEditProposalMessage(
            ctx.locale,
            "repositoryViewForbidden",
          ),
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
          message: getGraphEditProposalMessage(ctx.locale, "notFound"),
        });
      }

      // TopicSpaceのadminのみロック可能
      const isAdmin = proposal.topicSpace.admins.some(
        (admin) => admin.id === ctx.session.user.id,
      );
      if (!isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: getGraphEditProposalMessage(ctx.locale, "lockForbidden"),
        });
      }

      // 既にロックされている場合はエラー
      if (proposal.lockedById && proposal.lockedById !== ctx.session.user.id) {
        throw new TRPCError({
          code: "CONFLICT",
          message: getGraphEditProposalMessage(ctx.locale, "lockedByOther"),
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
          message: getGraphEditProposalMessage(ctx.locale, "notFound"),
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
          message: getGraphEditProposalMessage(ctx.locale, "unlockForbidden"),
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
          message: getGraphEditProposalMessage(ctx.locale, "notFound"),
        });
      }

      // TopicSpaceのadminのみレビュー可能
      const isAdmin = proposal.topicSpace.admins.some(
        (admin) => admin.id === ctx.session.user.id,
      );
      if (!isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: getGraphEditProposalMessage(ctx.locale, "reviewForbidden"),
        });
      }

      // PENDING状態のみレビュー可能
      if (proposal.status !== ProposalStatus.PENDING) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: getGraphEditProposalMessage(ctx.locale, "reviewInvalidState"),
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
          message: getGraphEditProposalMessage(ctx.locale, "notFound"),
        });
      }

      // TopicSpaceのadminのみ承認可能
      const isAdmin = proposal.topicSpace.admins.some(
        (admin) => admin.id === ctx.session.user.id,
      );
      if (!isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: getGraphEditProposalMessage(ctx.locale, "approveForbidden"),
        });
      }

      // IN_REVIEW状態のみ承認可能
      if (proposal.status !== ProposalStatus.IN_REVIEW) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: getGraphEditProposalMessage(ctx.locale, "approveInvalidState"),
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
          message: getGraphEditProposalMessage(ctx.locale, "notFound"),
        });
      }

      // TopicSpaceのadminのみ却下可能
      const isAdmin = proposal.topicSpace.admins.some(
        (admin) => admin.id === ctx.session.user.id,
      );
      if (!isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: getGraphEditProposalMessage(ctx.locale, "rejectForbidden"),
        });
      }

      // IN_REVIEW状態のみ却下可能
      if (proposal.status !== ProposalStatus.IN_REVIEW) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: getGraphEditProposalMessage(ctx.locale, "rejectInvalidState"),
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
      return mergeGraphEditProposal(ctx.db, {
        proposalId: input.proposalId,
        userId: ctx.session.user.id,
      });
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
          message: getGraphEditProposalMessage(ctx.locale, "notFound"),
        });
      }

      // 提案者のみ取り下げ可能
      if (proposal.proposerId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: getGraphEditProposalMessage(ctx.locale, "withdrawForbidden"),
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
          message: getGraphEditProposalMessage(ctx.locale, "withdrawInvalidState"),
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
          message: getGraphEditProposalMessage(ctx.locale, "notFound"),
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
          message: getGraphEditProposalMessage(ctx.locale, "commentForbidden"),
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
          message: getGraphEditProposalMessage(ctx.locale, "notFound"),
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
          message: getGraphEditProposalMessage(
            ctx.locale,
            "commentsViewForbidden",
          ),
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
    .mutation(({ ctx, input }) =>
      rollbackGraphChange(ctx.db, {
        changeHistoryId: input.changeHistoryId,
        userId: ctx.session.user.id,
        reason: input.reason,
      }),
    ),

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
          message: getGraphEditProposalMessage(ctx.locale, "repositoryNotFound"),
        });
      }

      // TopicSpaceのadminのみアクセス可能
      const isAdmin = topicSpace.admins.some(
        (admin) => admin.id === ctx.session.user.id,
      );
      if (!isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: getGraphEditProposalMessage(
            ctx.locale,
            "historyViewForbidden",
          ),
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

  // 自分の変更提案一覧を取得
  listMyProposals: protectedProcedure
    .input(
      z.object({
        status: z.nativeEnum(ProposalStatus).optional(),
        limit: z.number().optional().default(10),
      }),
    )
    .query(async ({ ctx, input }) => {
      const proposals = await ctx.db.graphEditProposal.findMany({
        where: {
          proposerId: ctx.session.user.id,
          ...(input.status && { status: input.status }),
        },
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
          topicSpace: {
            select: {
              id: true,
              name: true,
            },
          },
          changes: true,
          _count: {
            select: {
              comments: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: input.limit,
      });

      return proposals;
    }),
});
