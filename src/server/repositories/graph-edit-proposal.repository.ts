import type { PrismaClient } from "@prisma/client";
import { ProposalStatus } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { formGraphDataForFrontend } from "@/app/_utils/kg/frontend-properties";

export async function loadDraftEditableProposal(
  db: PrismaClient,
  proposalId: string,
  userId: string,
) {
  const proposal = await db.graphEditProposal.findUnique({
    where: { id: proposalId },
    include: {
      topicSpace: {
        include: {
          admins: true,
          graphNodes: { where: { deletedAt: null } },
          graphRelationships: { where: { deletedAt: null } },
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

  const isProposer = proposal.proposerId === userId;
  const isAdmin = proposal.topicSpace.admins.some(
    (admin) => admin.id === userId,
  );

  if (!isProposer && !isAdmin) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "この変更提案を編集する権限がありません",
    });
  }

  if (
    !(
      [ProposalStatus.DRAFT, ProposalStatus.PENDING] as ProposalStatus[]
    ).includes(proposal.status)
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "この状態の変更提案は編集できません",
    });
  }

  const baseGraphData = formGraphDataForFrontend({
    nodes: proposal.topicSpace.graphNodes,
    relationships: proposal.topicSpace.graphRelationships,
  });

  return { proposal, baseGraphData };
}

export async function findApprovedProposalForMerge(
  db: PrismaClient,
  proposalId: string,
  userId: string,
) {
  const proposal = await db.graphEditProposal.findUnique({
    where: { id: proposalId },
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

  const isAdmin = proposal.topicSpace.admins.some(
    (admin) => admin.id === userId,
  );
  if (!isAdmin) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "この変更提案をマージする権限がありません",
    });
  }

  if (proposal.status !== ProposalStatus.APPROVED) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "この状態の変更提案はマージできません",
    });
  }

  return proposal;
}
