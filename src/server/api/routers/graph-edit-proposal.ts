import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { PUBLIC_USER_SELECT } from "@/server/lib/user-select";
import {
  ProposalStatus,
  GraphChangeType,
  GraphChangeEntityType,
  GraphChangeRecordType,
  type GraphEditChange,
} from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { KnowledgeGraphInputSchema } from "../schemas/knowledge-graph";
import { TiptapContentSchema } from "./workspace";
import { diffNodes, diffRelationships } from "@/app/_utils/kg/diff";
import type {
  NodeDiffType,
  RelationshipDiffType,
} from "@/app/_utils/kg/get-nodes-and-relationships-from-result";
import { formGraphDataForFrontend } from "@/app/_utils/kg/frontend-properties";
import type {
  NodeTypeForFrontend,
  RelationshipTypeForFrontend,
} from "@/app/const/types";
import {
  applyGraphChanges,
  generateProposalChangeData,
} from "@/server/lib/graph-update-utils";
import { rollbackNodeLinkChanges } from "@/server/lib/graph-rollback-utils";

type DraftGraphData = {
  nodes: NodeTypeForFrontend[];
  relationships: RelationshipTypeForFrontend[];
};

function normalizePropertiesToStringRecord(
  properties: unknown,
): Record<string, string> {
  if (
    properties === null ||
    properties === undefined ||
    typeof properties !== "object" ||
    Array.isArray(properties)
  ) {
    return {};
  }
  const obj = properties as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = String(v);
  }
  return out;
}

function normalizeNodeForDiff(node: NodeTypeForFrontend): NodeTypeForFrontend {
  return {
    ...node,
    name: String(node.name ?? ""),
    label: String(node.label ?? ""),
    properties: normalizePropertiesToStringRecord(node.properties),
  };
}

function normalizeRelationshipForDiff(
  relationship: RelationshipTypeForFrontend,
): RelationshipTypeForFrontend {
  return {
    ...relationship,
    type: String(relationship.type ?? ""),
    properties: normalizePropertiesToStringRecord(relationship.properties),
    sourceId: String(relationship.sourceId ?? ""),
    targetId: String(relationship.targetId ?? ""),
  };
}

function normalizeGraphDataForDiff(graphData: DraftGraphData): DraftGraphData {
  return {
    nodes: graphData.nodes.map(normalizeNodeForDiff),
    relationships: graphData.relationships.map(normalizeRelationshipForDiff),
  };
}

function parseNodeFromChangeState(
  state: unknown,
  fallbackId: string,
): NodeTypeForFrontend {
  type NodeChangeState = {
    id?: unknown;
    name?: unknown;
    label?: unknown;
    properties?: unknown;
  };

  const obj =
    typeof state === "object" && state !== null && !Array.isArray(state)
      ? (state as NodeChangeState)
      : null;

  const id = String(obj?.id ?? fallbackId);
  return {
    id,
    name: String(obj?.name ?? ""),
    label: String(obj?.label ?? ""),
    properties: normalizePropertiesToStringRecord(
      obj?.properties ?? {},
    ),
  };
}

function parseRelationshipFromChangeState(
  state: unknown,
  fallbackId: string,
): RelationshipTypeForFrontend {
  type RelationshipChangeState = {
    id?: unknown;
    type?: unknown;
    properties?: unknown;
    sourceId?: unknown;
    targetId?: unknown;
  };

  const obj =
    typeof state === "object" && state !== null && !Array.isArray(state)
      ? (state as RelationshipChangeState)
      : null;

  const id = String(obj?.id ?? fallbackId);
  return {
    id,
    type: String(obj?.type ?? ""),
    properties: normalizePropertiesToStringRecord(
      obj?.properties ?? {},
    ),
    sourceId: String(obj?.sourceId ?? ""),
    targetId: String(obj?.targetId ?? ""),
  };
}

/**
 * proposal.changes を「ベースグラフ」に適用して、ドラフト状態のグラフを復元します。
 * ※ ベースは TopicSpace の現在スナップショットを使い、changes は差分として適用されます。
 */
function reconstructDraftGraphData(
  baseGraphData: DraftGraphData,
  changes: GraphEditChange[],
): DraftGraphData {
  const normalizedBase = normalizeGraphDataForDiff(baseGraphData);

  const nodeMap = new Map<string, NodeTypeForFrontend>(
    normalizedBase.nodes.map((n) => [n.id, n]),
  );
  const relationshipMap = new Map<string, RelationshipTypeForFrontend>(
    normalizedBase.relationships.map((r) => [r.id, r]),
  );

  for (const change of changes) {
    const entityId = String(change.changeEntityId);

    if (change.changeEntityType === GraphChangeEntityType.NODE) {
      if (change.changeType === GraphChangeType.REMOVE) {
        nodeMap.delete(entityId);
      } else if (
        change.changeType === GraphChangeType.ADD ||
        change.changeType === GraphChangeType.UPDATE
      ) {
        const nextNode = parseNodeFromChangeState(change.nextState, entityId);
        nodeMap.set(nextNode.id, nextNode);
      }
    } else if (change.changeEntityType === GraphChangeEntityType.EDGE) {
      if (change.changeType === GraphChangeType.REMOVE) {
        relationshipMap.delete(entityId);
      } else if (
        change.changeType === GraphChangeType.ADD ||
        change.changeType === GraphChangeType.UPDATE
      ) {
        const nextRel = parseRelationshipFromChangeState(change.nextState, entityId);
        relationshipMap.set(nextRel.id, nextRel);
      }
    }
  }

  // ノードが削除された場合、入出辺も整合性のため削除します。
  const nodeIds = new Set(nodeMap.keys());
  const draftRelationships = Array.from(relationshipMap.values()).filter(
    (r) => nodeIds.has(r.sourceId) && nodeIds.has(r.targetId),
  );

  return {
    nodes: Array.from(nodeMap.values()),
    relationships: draftRelationships,
  };
}

/**
 * ドラフト状態のグラフを、proposalId に紐づく graphEditChange へ「差分」として上書きします。
 */
async function overwriteProposalChangesFromDraft(
  db: PrismaClient,
  proposalId: string,
  baseGraphData: DraftGraphData,
  draftGraphData: DraftGraphData,
) {
  const normalizedBase = normalizeGraphDataForDiff(baseGraphData);
  const normalizedDraft = normalizeGraphDataForDiff(draftGraphData);

  const nodeDiffs = diffNodes(normalizedBase.nodes, normalizedDraft.nodes);
  const relationshipDiffs = diffRelationships(
    normalizedBase.relationships,
    normalizedDraft.relationships,
  );

  await db.graphEditChange.deleteMany({ where: { proposalId } });

  const createData = [
    ...nodeDiffs.map((diff) => ({
      proposalId,
      changeType: diff.type,
      changeEntityType: GraphChangeEntityType.NODE,
      changeEntityId: String(diff.original?.id ?? diff.updated?.id),
      previousState: diff.original ?? {},
      nextState: diff.updated ?? {},
    })),
    ...relationshipDiffs.map((diff) => ({
      proposalId,
      changeType: diff.type,
      changeEntityType: GraphChangeEntityType.EDGE,
      changeEntityId: String(diff.original?.id ?? diff.updated?.id),
      previousState: diff.original ?? {},
      nextState: diff.updated ?? {},
    })),
  ];

  if (createData.length === 0) return;
  await db.graphEditChange.createMany({ data: createData });
}

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

function relationshipEndpointKey(rel: RelationshipTypeForFrontend): string {
  return `${rel.type}\0${rel.sourceId}\0${rel.targetId}`;
}

function mergeNodesInDraftGraph(
  draftGraphData: DraftGraphData,
  input: {
    canonicalNodeId: string;
    duplicateNodeIds: string[];
    canonicalName?: string;
    canonicalLabel?: string;
    canonicalProperties?: Record<string, string>;
  },
): {
  nextDraftGraphData: DraftGraphData;
  removedDuplicateNodeCount: number;
  rewiredEdgeCount: number;
  deduplicatedEdgeCount: number;
  skippedDuplicateNodeIds: string[];
} {
  const duplicateIdSet = new Set(
    input.duplicateNodeIds.filter((id) => id !== input.canonicalNodeId),
  );

  const nodeMap = new Map(
    draftGraphData.nodes.map((n) => [n.id, n] as const),
  );

  const canonicalNode = nodeMap.get(input.canonicalNodeId);
  if (!canonicalNode) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "指定された正規ノードがドラフトに存在しません",
    });
  }

  const skippedDuplicateNodeIds: string[] = [];
  for (const duplicateId of duplicateIdSet) {
    if (!nodeMap.has(duplicateId)) {
      skippedDuplicateNodeIds.push(duplicateId);
      duplicateIdSet.delete(duplicateId);
    }
  }

  if (duplicateIdSet.size === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "統合対象の重複ノードがドラフトに存在しません",
    });
  }

  const normalizedCanonicalProperties =
    input.canonicalProperties !== undefined
      ? Object.fromEntries(
          Object.entries(input.canonicalProperties).map(([k, v]) => [
            k,
            String(v),
          ]),
        )
      : canonicalNode.properties;

  nodeMap.set(input.canonicalNodeId, {
    ...canonicalNode,
    name: input.canonicalName ?? canonicalNode.name,
    label: input.canonicalLabel ?? canonicalNode.label,
    properties: normalizedCanonicalProperties,
  });

  let rewiredEdgeCount = 0;
  const remappedRelationships = draftGraphData.relationships
    .map((rel) => {
      const sourceIsDuplicate = duplicateIdSet.has(rel.sourceId);
      const targetIsDuplicate = duplicateIdSet.has(rel.targetId);

      if (sourceIsDuplicate && targetIsDuplicate) {
        return null;
      }

      const nextSourceId = sourceIsDuplicate
        ? input.canonicalNodeId
        : rel.sourceId;
      const nextTargetId = targetIsDuplicate
        ? input.canonicalNodeId
        : rel.targetId;

      if (
        nextSourceId === rel.sourceId &&
        nextTargetId === rel.targetId
      ) {
        return rel;
      }

      rewiredEdgeCount++;

      return {
        ...rel,
        sourceId: nextSourceId,
        targetId: nextTargetId,
      };
    })
    .filter((rel): rel is RelationshipTypeForFrontend => rel !== null);

  const seenRelationshipKeys = new Set<string>();
  const deduplicatedRelationships: RelationshipTypeForFrontend[] = [];
  let deduplicatedEdgeCount = 0;

  for (const rel of remappedRelationships) {
    const key = relationshipEndpointKey(rel);
    if (seenRelationshipKeys.has(key)) {
      deduplicatedEdgeCount++;
      continue;
    }
    seenRelationshipKeys.add(key);
    deduplicatedRelationships.push(rel);
  }

  for (const duplicateId of duplicateIdSet) {
    nodeMap.delete(duplicateId);
  }

  const nextDraftGraphData: DraftGraphData = {
    nodes: Array.from(nodeMap.values()),
    relationships: deduplicatedRelationships.filter(
      (r) => nodeMap.has(r.sourceId) && nodeMap.has(r.targetId),
    ),
  };

  return {
    nextDraftGraphData,
    removedDuplicateNodeCount: duplicateIdSet.size,
    rewiredEdgeCount,
    deduplicatedEdgeCount,
    skippedDuplicateNodeIds,
  };
}

type DraftEditCtx = {
  db: PrismaClient;
  session: { user: { id: string } };
};

async function loadDraftEditableProposal(
  ctx: DraftEditCtx,
  proposalId: string,
) {
  const proposal = await ctx.db.graphEditProposal.findUnique({
    where: { id: proposalId },
    include: {
      topicSpace: {
        include: {
          admins: true,
          graphNodes: true,
          graphRelationships: true,
        },
      },
      changes: true,
    },
  });

  if (!proposal) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "変更提案が見つかりません",
    });
  }

  const isProposer = proposal.proposerId === ctx.session.user.id;
  const isAdmin = proposal.topicSpace.admins.some(
    (admin) => admin.id === ctx.session.user.id,
  );

  if (!isProposer && !isAdmin) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "この変更提案を編集する権限がありません",
    });
  }

  // DRAFT/PENDING 状態のみ編集可能（既存 updateProposal と整合）
  if (!([ProposalStatus.DRAFT, ProposalStatus.PENDING] as ProposalStatus[]).includes(proposal.status)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "この状態の変更提案は編集できません",
    });
  }

  // ロックされている場合は編集不可
  if (
    proposal.lockedById &&
    proposal.lockedById !== ctx.session.user.id
  ) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "この変更提案は他のユーザーによってロックされています",
    });
  }

  const baseGraphData = formGraphDataForFrontend({
    nodes: proposal.topicSpace.graphNodes,
    relationships: proposal.topicSpace.graphRelationships,
  });

  return { proposal, baseGraphData };
}

function buildNodeNameMap(graphs: DraftGraphData[]): Map<string, string> {
  const nameById = new Map<string, string>();
  for (const graph of graphs) {
    for (const node of graph.nodes) {
      nameById.set(node.id, node.name);
    }
  }
  return nameById;
}

function formatNodeSnapshot(node: NodeTypeForFrontend) {
  return {
    name: node.name,
    label: node.label,
    properties: node.properties,
  };
}

function formatNodeDiffsForReview(nodeDiffs: NodeDiffType[]) {
  return nodeDiffs.map((diff) => ({
    changeType: diff.type,
    entityId: String(diff.original?.id ?? diff.updated?.id),
    before: diff.original ? formatNodeSnapshot(diff.original) : null,
    after: diff.updated ? formatNodeSnapshot(diff.updated) : null,
  }));
}

function formatRelationshipDiffsForReview(
  relationshipDiffs: RelationshipDiffType[],
  nameById: Map<string, string>,
) {
  const resolveName = (id: string) => nameById.get(id) ?? `(unknown:${id})`;

  const formatEdgeSnapshot = (rel: RelationshipTypeForFrontend) => ({
    type: rel.type,
    sourceId: rel.sourceId,
    targetId: rel.targetId,
    sourceName: resolveName(rel.sourceId),
    targetName: resolveName(rel.targetId),
    properties: rel.properties,
  });

  return relationshipDiffs.map((diff) => ({
    changeType: diff.type,
    entityId: String(diff.original?.id ?? diff.updated?.id),
    before: diff.original ? formatEdgeSnapshot(diff.original) : null,
    after: diff.updated ? formatEdgeSnapshot(diff.updated) : null,
  }));
}

function summarizeDiffCounts(
  nodeDiffs: NodeDiffType[],
  relationshipDiffs: RelationshipDiffType[],
) {
  const countByType = (diffs: Array<{ type: GraphChangeType }>) => ({
    added: diffs.filter((d) => d.type === GraphChangeType.ADD).length,
    updated: diffs.filter((d) => d.type === GraphChangeType.UPDATE).length,
    removed: diffs.filter((d) => d.type === GraphChangeType.REMOVE).length,
  });

  return {
    nodes: countByType(nodeDiffs),
    edges: countByType(relationshipDiffs),
    totalChanges: nodeDiffs.length + relationshipDiffs.length,
  };
}

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
          graphNodes: true,
          graphRelationships: true,
        },
      });

      if (!topicSpace) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "TopicSpaceが見つかりません",
        });
      }

      // ログインユーザーであれば誰でも変更提案を作成可能
      // ただし、説明は必須とする（品質向上のため）
      if (!input.description || input.description.trim().length < 10) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "変更提案には10文字以上の説明が必要です",
        });
      }

      // 現在のグラフデータを取得
      const currentGraphData = formGraphDataForFrontend({
        nodes: topicSpace.graphNodes,
        relationships: topicSpace.graphRelationships,
      });

      // 新しいグラフデータ
      const newGraphData = {
        nodes: input.newGraphData.nodes as NodeTypeForFrontend[],
        relationships: input.newGraphData
          .relationships as RelationshipTypeForFrontend[],
      };

      // 差分を計算
      const nodeDiffs = diffNodes(currentGraphData.nodes, newGraphData.nodes);
      const relationshipDiffs = diffRelationships(
        currentGraphData.relationships,
        newGraphData.relationships,
      );

      // 変更がない場合はエラー
      if (nodeDiffs.length === 0 && relationshipDiffs.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "変更が検出されませんでした",
        });
      }

      // 変更提案を作成
      const proposal = await ctx.db.graphEditProposal.create({
        data: {
          title: input.title,
          description: input.description,
          // 下書き状態をスキップするが、今後下書き状態からの動線をする
          status: ProposalStatus.PENDING,
          topicSpaceId: input.topicSpaceId,
          proposerId: ctx.session.user.id,
          changes: {
            create: [
              // ノードの変更
              ...nodeDiffs.map((diff) => ({
                changeType: diff.type,
                changeEntityType: GraphChangeEntityType.NODE,
                changeEntityId: String(diff.original?.id ?? diff.updated?.id),
                previousState: diff.original ?? {},
                nextState: diff.updated ?? {},
              })),
              // リレーションシップの変更
              ...relationshipDiffs.map((diff) => ({
                changeType: diff.type,
                changeEntityType: GraphChangeEntityType.EDGE,
                changeEntityId: String(diff.original?.id ?? diff.updated?.id),
                previousState: diff.original ?? {},
                nextState: diff.updated ?? {},
              })),
            ],
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

      // グラフデータも更新する場合
      if (input.newGraphData) {
        // TopicSpaceの現在のグラフデータを取得
        const topicSpace = await ctx.db.topicSpace.findFirst({
          where: { id: existingProposal.topicSpaceId },
          include: {
            graphNodes: true,
            graphRelationships: true,
          },
        });

        if (topicSpace) {
          // 現在のグラフデータ
          const currentGraphData = formGraphDataForFrontend({
            nodes: topicSpace.graphNodes,
            relationships: topicSpace.graphRelationships,
          });

          // 新しいグラフデータ
          const newGraphData = {
            nodes: input.newGraphData.nodes as NodeTypeForFrontend[],
            relationships: input.newGraphData
              .relationships as RelationshipTypeForFrontend[],
          };

          // 差分を計算
          const nodeDiffs = diffNodes(
            currentGraphData.nodes,
            newGraphData.nodes,
          );
          const relationshipDiffs = diffRelationships(
            currentGraphData.relationships,
            newGraphData.relationships,
          );

          // 既存の変更を削除
          await ctx.db.graphEditChange.deleteMany({
            where: { proposalId: input.proposalId },
          });

          // 新しい変更を追加
          await ctx.db.graphEditChange.createMany({
            data: [
              // ノードの変更
              ...nodeDiffs.map((diff) => ({
                proposalId: input.proposalId,
                changeType: diff.type,
                changeEntityType: GraphChangeEntityType.NODE,
                changeEntityId: String(diff.original?.id ?? diff.updated?.id),
                previousState: diff.original ?? {},
                nextState: diff.updated ?? {},
              })),
              // リレーションシップの変更
              ...relationshipDiffs.map((diff) => ({
                proposalId: input.proposalId,
                changeType: diff.type,
                changeEntityType: GraphChangeEntityType.EDGE,
                changeEntityId: String(diff.original?.id ?? diff.updated?.id),
                previousState: diff.original ?? {},
                nextState: diff.updated ?? {},
              })),
            ],
          });
        }
      }

      return proposal;
    }),

  // =========================================================
  // ドラフト編集（LLM/MCP向け: proposal.changes を段階的に更新）
  // =========================================================
  createDraftProposal: protectedProcedure
    .input(CreateDraftProposalSchema)
    .mutation(async ({ ctx, input }) => {
      const topicSpace = await ctx.db.topicSpace.findFirst({
        where: {
          id: input.topicSpaceId,
          isDeleted: false,
        },
        select: { id: true },
      });

      if (!topicSpace) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "TopicSpaceが見つかりません",
        });
      }

      const proposal = await ctx.db.graphEditProposal.create({
        data: {
          title: input.title,
          description: input.description,
          status: ProposalStatus.DRAFT,
          topicSpaceId: input.topicSpaceId,
          proposerId: ctx.session.user.id,
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

  upsertNodeInDraft: protectedProcedure
    .input(UpsertNodeInDraftSchema)
    .mutation(async ({ ctx, input }) => {
      const { proposal, baseGraphData } = await loadDraftEditableProposal(
        ctx,
        input.proposalId,
      );

      const draftGraphData = reconstructDraftGraphData(
        baseGraphData,
        proposal.changes,
      );

      const nodeMap = new Map(
        draftGraphData.nodes.map((n) => [n.id, n] as const),
      );

      const normalizedProperties: Record<string, string> = Object.fromEntries(
        Object.entries(input.node.properties ?? {}).map(([k, v]) => [
          k,
          String(v),
        ]),
      );

      nodeMap.set(input.node.id, {
        id: input.node.id,
        name: input.node.name,
        label: input.node.label,
        properties: normalizedProperties,
      });

      const nextDraftGraphData: DraftGraphData = {
        nodes: Array.from(nodeMap.values()),
        relationships: draftGraphData.relationships.filter(
          (r) => nodeMap.has(r.sourceId) && nodeMap.has(r.targetId),
        ),
      };

      await overwriteProposalChangesFromDraft(
        ctx.db,
        input.proposalId,
        baseGraphData,
        nextDraftGraphData,
      );

      return { proposalId: input.proposalId };
    }),

  deleteNodeInDraft: protectedProcedure
    .input(DeleteNodeInDraftSchema)
    .mutation(async ({ ctx, input }) => {
      const { proposal, baseGraphData } = await loadDraftEditableProposal(
        ctx,
        input.proposalId,
      );

      const draftGraphData = reconstructDraftGraphData(
        baseGraphData,
        proposal.changes,
      );

      const nodeMap = new Map(
        draftGraphData.nodes.map((n) => [n.id, n] as const),
      );
      const relMap = new Map(
        draftGraphData.relationships.map((r) => [r.id, r] as const),
      );

      if (!nodeMap.has(input.nodeId)) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "指定されたノードがドラフトに存在しません",
        });
      }

      nodeMap.delete(input.nodeId);

      // incident edges を落とす
      for (const [relId, rel] of Array.from(relMap.entries())) {
        if (rel.sourceId === input.nodeId || rel.targetId === input.nodeId) {
          relMap.delete(relId);
        }
      }

      const nextDraftGraphData: DraftGraphData = {
        nodes: Array.from(nodeMap.values()),
        relationships: Array.from(relMap.values()),
      };

      await overwriteProposalChangesFromDraft(
        ctx.db,
        input.proposalId,
        baseGraphData,
        nextDraftGraphData,
      );

      return { proposalId: input.proposalId };
    }),

  setNodePropertyInDraft: protectedProcedure
    .input(SetNodePropertyInDraftSchema)
    .mutation(async ({ ctx, input }) => {
      const { proposal, baseGraphData } = await loadDraftEditableProposal(
        ctx,
        input.proposalId,
      );

      const draftGraphData = reconstructDraftGraphData(
        baseGraphData,
        proposal.changes,
      );

      const nodeMap = new Map(
        draftGraphData.nodes.map((n) => [n.id, n] as const),
      );

      const node = nodeMap.get(input.nodeId);
      if (!node) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "指定されたノードがドラフトに存在しません",
        });
      }

      const nextProperties = {
        ...node.properties,
        [input.key]: String(input.value),
      };

      nodeMap.set(input.nodeId, { ...node, properties: nextProperties });

      const nextDraftGraphData: DraftGraphData = {
        nodes: Array.from(nodeMap.values()),
        relationships: draftGraphData.relationships.filter(
          (r) => nodeMap.has(r.sourceId) && nodeMap.has(r.targetId),
        ),
      };

      await overwriteProposalChangesFromDraft(
        ctx.db,
        input.proposalId,
        baseGraphData,
        nextDraftGraphData,
      );

      return { proposalId: input.proposalId };
    }),

  unsetNodePropertyInDraft: protectedProcedure
    .input(UnsetNodePropertyInDraftSchema)
    .mutation(async ({ ctx, input }) => {
      const { proposal, baseGraphData } = await loadDraftEditableProposal(
        ctx,
        input.proposalId,
      );

      const draftGraphData = reconstructDraftGraphData(
        baseGraphData,
        proposal.changes,
      );

      const nodeMap = new Map(
        draftGraphData.nodes.map((n) => [n.id, n] as const),
      );

      const node = nodeMap.get(input.nodeId);
      if (!node) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "指定されたノードがドラフトに存在しません",
        });
      }

      const nextProperties = { ...node.properties };
      delete nextProperties[input.key];

      nodeMap.set(input.nodeId, { ...node, properties: nextProperties });

      const nextDraftGraphData: DraftGraphData = {
        nodes: Array.from(nodeMap.values()),
        relationships: draftGraphData.relationships.filter(
          (r) => nodeMap.has(r.sourceId) && nodeMap.has(r.targetId),
        ),
      };

      await overwriteProposalChangesFromDraft(
        ctx.db,
        input.proposalId,
        baseGraphData,
        nextDraftGraphData,
      );

      return { proposalId: input.proposalId };
    }),

  upsertRelationshipInDraft: protectedProcedure
    .input(UpsertRelationshipInDraftSchema)
    .mutation(async ({ ctx, input }) => {
      const { proposal, baseGraphData } = await loadDraftEditableProposal(
        ctx,
        input.proposalId,
      );

      const draftGraphData = reconstructDraftGraphData(
        baseGraphData,
        proposal.changes,
      );

      const nodeMap = new Map(
        draftGraphData.nodes.map((n) => [n.id, n] as const),
      );
      const relMap = new Map(
        draftGraphData.relationships.map((r) => [r.id, r] as const),
      );

      const { relationship } = input;
      if (!nodeMap.has(relationship.sourceId) || !nodeMap.has(relationship.targetId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "エッジの両端ノードがドラフトに存在しません",
        });
      }

      const normalizedProperties: Record<string, string> = Object.fromEntries(
        Object.entries(relationship.properties ?? {}).map(([k, v]) => [
          k,
          String(v),
        ]),
      );

      relMap.set(relationship.id, {
        id: relationship.id,
        type: relationship.type,
        sourceId: relationship.sourceId,
        targetId: relationship.targetId,
        properties: normalizedProperties,
      });

      const nextDraftGraphData: DraftGraphData = {
        nodes: Array.from(nodeMap.values()),
        relationships: Array.from(relMap.values()).filter(
          (r) => nodeMap.has(r.sourceId) && nodeMap.has(r.targetId),
        ),
      };

      await overwriteProposalChangesFromDraft(
        ctx.db,
        input.proposalId,
        baseGraphData,
        nextDraftGraphData,
      );

      return { proposalId: input.proposalId };
    }),

  deleteRelationshipInDraft: protectedProcedure
    .input(DeleteRelationshipInDraftSchema)
    .mutation(async ({ ctx, input }) => {
      const { proposal, baseGraphData } = await loadDraftEditableProposal(
        ctx,
        input.proposalId,
      );

      const draftGraphData = reconstructDraftGraphData(
        baseGraphData,
        proposal.changes,
      );

      const relMap = new Map(
        draftGraphData.relationships.map((r) => [r.id, r] as const),
      );

      if (!relMap.has(input.relationshipId)) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "指定されたエッジがドラフトに存在しません",
        });
      }

      relMap.delete(input.relationshipId);

      const nextDraftGraphData: DraftGraphData = {
        nodes: draftGraphData.nodes,
        relationships: Array.from(relMap.values()),
      };

      await overwriteProposalChangesFromDraft(
        ctx.db,
        input.proposalId,
        baseGraphData,
        nextDraftGraphData,
      );

      return { proposalId: input.proposalId };
    }),

  setRelationshipPropertyInDraft: protectedProcedure
    .input(SetRelationshipPropertyInDraftSchema)
    .mutation(async ({ ctx, input }) => {
      const { proposal, baseGraphData } = await loadDraftEditableProposal(
        ctx,
        input.proposalId,
      );

      const draftGraphData = reconstructDraftGraphData(
        baseGraphData,
        proposal.changes,
      );

      const relMap = new Map(
        draftGraphData.relationships.map((r) => [r.id, r] as const),
      );

      const rel = relMap.get(input.relationshipId);
      if (!rel) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "指定されたエッジがドラフトに存在しません",
        });
      }

      const nextProperties = {
        ...rel.properties,
        [input.key]: String(input.value),
      };

      relMap.set(input.relationshipId, { ...rel, properties: nextProperties });

      const nextDraftGraphData: DraftGraphData = {
        nodes: draftGraphData.nodes,
        relationships: Array.from(relMap.values()),
      };

      await overwriteProposalChangesFromDraft(
        ctx.db,
        input.proposalId,
        baseGraphData,
        nextDraftGraphData,
      );

      return { proposalId: input.proposalId };
    }),

  unsetRelationshipPropertyInDraft: protectedProcedure
    .input(UnsetRelationshipPropertyInDraftSchema)
    .mutation(async ({ ctx, input }) => {
      const { proposal, baseGraphData } = await loadDraftEditableProposal(
        ctx,
        input.proposalId,
      );

      const draftGraphData = reconstructDraftGraphData(
        baseGraphData,
        proposal.changes,
      );

      const relMap = new Map(
        draftGraphData.relationships.map((r) => [r.id, r] as const),
      );

      const rel = relMap.get(input.relationshipId);
      if (!rel) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "指定されたエッジがドラフトに存在しません",
        });
      }

      const nextProperties = { ...rel.properties };
      delete nextProperties[input.key];

      relMap.set(input.relationshipId, { ...rel, properties: nextProperties });

      const nextDraftGraphData: DraftGraphData = {
        nodes: draftGraphData.nodes,
        relationships: Array.from(relMap.values()),
      };

      await overwriteProposalChangesFromDraft(
        ctx.db,
        input.proposalId,
        baseGraphData,
        nextDraftGraphData,
      );

      return { proposalId: input.proposalId };
    }),

  mergeNodesInDraft: protectedProcedure
    .input(MergeNodesInDraftSchema)
    .mutation(async ({ ctx, input }) => {
      const { proposal, baseGraphData } = await loadDraftEditableProposal(
        ctx,
        input.proposalId,
      );

      const draftGraphData = reconstructDraftGraphData(
        baseGraphData,
        proposal.changes,
      );

      const {
        nextDraftGraphData,
        removedDuplicateNodeCount,
        rewiredEdgeCount,
        deduplicatedEdgeCount,
        skippedDuplicateNodeIds,
      } = mergeNodesInDraftGraph(draftGraphData, {
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
      });

      await overwriteProposalChangesFromDraft(
        ctx.db,
        input.proposalId,
        baseGraphData,
        nextDraftGraphData,
      );

      return {
        proposalId: input.proposalId,
        removedDuplicateNodeCount,
        rewiredEdgeCount,
        deduplicatedEdgeCount,
        skippedDuplicateNodeIds,
      };
    }),

  // =========================================================
  // ドラフト確認（LLM向け：必要なら呼び出して下書き状態を確認）
  // =========================================================
  getProposalDraftDiff: protectedProcedure
    .input(z.object({ proposalId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { proposal, baseGraphData } = await loadDraftEditableProposal(
        ctx,
        input.proposalId,
      );

      const draftGraphData = reconstructDraftGraphData(
        baseGraphData,
        proposal.changes,
      );

      const nodeDiffs = diffNodes(baseGraphData.nodes, draftGraphData.nodes);
      const relationshipDiffs = diffRelationships(
        baseGraphData.relationships,
        draftGraphData.relationships,
      );

      const nameById = buildNodeNameMap([baseGraphData, draftGraphData]);

      return {
        proposal: {
          id: proposal.id,
          title: proposal.title,
          status: proposal.status,
          description: proposal.description,
        },
        summary: summarizeDiffCounts(nodeDiffs, relationshipDiffs),
        nodeChanges: formatNodeDiffsForReview(nodeDiffs),
        edgeChanges: formatRelationshipDiffsForReview(
          relationshipDiffs,
          nameById,
        ),
        hasChanges: nodeDiffs.length + relationshipDiffs.length > 0,
      };
    }),

  getProposalDraftGraph: protectedProcedure
    .input(z.object({ proposalId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { proposal, baseGraphData } = await loadDraftEditableProposal(
        ctx,
        input.proposalId,
      );

      const draft = reconstructDraftGraphData(
        baseGraphData,
        proposal.changes,
      );

      return {
        proposal: {
          id: proposal.id,
          status: proposal.status,
        },
        draftGraph: draft,
      };
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

      const changeData = generateProposalChangeData(
        proposal.changes.map((change) => ({
          ...change,
          previousState: change.previousState as Record<string, unknown>,
          nextState: change.nextState as Record<string, unknown>,
        })),
        proposal.topicSpaceId,
      );

      const updatedProposal = await ctx.db.$transaction(
        async (tx) => {
          const graphChangeHistory = await tx.graphChangeHistory.create({
            data: {
              recordType: GraphChangeRecordType.TOPIC_SPACE,
              recordId: proposal.topicSpaceId,
              description: `変更提案「${proposal.title}」をマージしました`,
              userId: ctx.session.user.id,
            },
          });

          await applyGraphChanges(tx, proposal.topicSpaceId, changeData);

          await tx.nodeLinkChangeHistory.createMany({
            data: proposal.changes.map((change) => ({
              changeType: change.changeType,
              changeEntityType: change.changeEntityType,
              changeEntityId: change.changeEntityId,
              previousState: change.previousState ?? {},
              nextState: change.nextState ?? {},
              graphChangeHistoryId: graphChangeHistory.id,
            })),
          });

          return await tx.graphEditProposal.update({
            where: { id: input.proposalId },
            data: {
              status: ProposalStatus.MERGED,
            },
          });
        },
        { timeout: 30000 },
      );

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

      const topicSpaceId = changeHistory.recordId;

      await rollbackNodeLinkChanges(
        ctx.db,
        topicSpaceId,
        changeHistory.nodeLinkChangeHistories,
      );

      for (const change of changeHistory.nodeLinkChangeHistories) {
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
