import type { PrismaClient } from "@prisma/client";
import {
  createDraftProposal as createDraftProposalRecord,
} from "@/server/services/graph-edit-proposal/draft-proposal.service";
import {
  deleteNodeInDraft,
  deleteRelationshipInDraft,
  getProposalDraftDiff,
  getProposalDraftGraph,
  mergeNodesInDraft,
  setNodePropertyInDraft,
  setRelationshipPropertyInDraft,
  unsetNodePropertyInDraft,
  unsetRelationshipPropertyInDraft,
  upsertNodeInDraft,
  upsertRelationshipInDraft,
} from "@/server/services/graph-edit-proposal/draft-edit.service";

export type McpDraftHandlerCtx = {
  db: PrismaClient;
  userId: string;
};

export async function mcpCreateDraftProposal(
  ctx: McpDraftHandlerCtx,
  input: { topicSpaceId: string; title: string; description: string },
) {
  return createDraftProposalRecord(ctx.db, {
    ...input,
    proposerId: ctx.userId,
  });
}

export async function mcpUpsertNodeInDraft(
  ctx: McpDraftHandlerCtx,
  input: Parameters<typeof upsertNodeInDraft>[2],
) {
  return upsertNodeInDraft(ctx.db, ctx.userId, input);
}

export async function mcpDeleteNodeInDraft(
  ctx: McpDraftHandlerCtx,
  input: Parameters<typeof deleteNodeInDraft>[2],
) {
  return deleteNodeInDraft(ctx.db, ctx.userId, input);
}

export async function mcpSetNodePropertyInDraft(
  ctx: McpDraftHandlerCtx,
  input: Parameters<typeof setNodePropertyInDraft>[2],
) {
  return setNodePropertyInDraft(ctx.db, ctx.userId, input);
}

export async function mcpUnsetNodePropertyInDraft(
  ctx: McpDraftHandlerCtx,
  input: Parameters<typeof unsetNodePropertyInDraft>[2],
) {
  return unsetNodePropertyInDraft(ctx.db, ctx.userId, input);
}

export async function mcpUpsertRelationshipInDraft(
  ctx: McpDraftHandlerCtx,
  input: Parameters<typeof upsertRelationshipInDraft>[2],
) {
  return upsertRelationshipInDraft(ctx.db, ctx.userId, input);
}

export async function mcpDeleteRelationshipInDraft(
  ctx: McpDraftHandlerCtx,
  input: Parameters<typeof deleteRelationshipInDraft>[2],
) {
  return deleteRelationshipInDraft(ctx.db, ctx.userId, input);
}

export async function mcpSetRelationshipPropertyInDraft(
  ctx: McpDraftHandlerCtx,
  input: Parameters<typeof setRelationshipPropertyInDraft>[2],
) {
  return setRelationshipPropertyInDraft(ctx.db, ctx.userId, input);
}

export async function mcpUnsetRelationshipPropertyInDraft(
  ctx: McpDraftHandlerCtx,
  input: Parameters<typeof unsetRelationshipPropertyInDraft>[2],
) {
  return unsetRelationshipPropertyInDraft(ctx.db, ctx.userId, input);
}

export async function mcpMergeNodesInDraft(
  ctx: McpDraftHandlerCtx,
  input: Parameters<typeof mergeNodesInDraft>[2],
) {
  return mergeNodesInDraft(ctx.db, ctx.userId, input);
}

export async function mcpGetProposalDraftGraph(
  ctx: McpDraftHandlerCtx,
  proposalId: string,
) {
  return getProposalDraftGraph(ctx.db, ctx.userId, proposalId);
}

export async function mcpGetProposalDraftDiff(
  ctx: McpDraftHandlerCtx,
  proposalId: string,
) {
  return getProposalDraftDiff(ctx.db, ctx.userId, proposalId);
}
