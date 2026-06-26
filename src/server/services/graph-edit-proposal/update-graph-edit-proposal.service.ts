import type { PrismaClient } from "@prisma/client";
import { ProposalStatus } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { diffNodes, diffRelationships } from "@/app/_utils/kg/diff";
import { formGraphDataForFrontend } from "@/app/_utils/kg/frontend-properties";
import type {
  NodeTypeForFrontend,
  RelationshipTypeForFrontend,
} from "@/app/const/types";
import { buildGraphEditChangeRows } from "@/server/domain/kg/proposal-change-rows";
import { replaceProposalChanges } from "@/server/repositories/graph-edit-proposal-changes.repository";

const PROPOSER_INCLUDE = {
  proposer: {
    select: {
      id: true,
      name: true,
      image: true,
    },
  },
  changes: true,
} as const;

export async function updateGraphEditProposal(
  db: PrismaClient,
  params: {
    proposalId: string;
    userId: string;
    title?: string;
    description?: string;
    newGraphData?: {
      nodes: NodeTypeForFrontend[];
      relationships: RelationshipTypeForFrontend[];
    };
  },
) {
  const existingProposal = await db.graphEditProposal.findUnique({
    where: { id: params.proposalId },
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

  const isProposer = existingProposal.proposerId === params.userId;
  const isAdmin = existingProposal.topicSpace.admins.some(
    (admin) => admin.id === params.userId,
  );

  if (!isProposer && !isAdmin) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "この変更提案を更新する権限がありません",
    });
  }

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

  if (
    existingProposal.lockedById &&
    existingProposal.lockedById !== params.userId
  ) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "この変更提案は他のユーザーによってロックされています",
    });
  }

  const updateData: { title?: string; description?: string } = {};
  if (params.title !== undefined) updateData.title = params.title;
  if (params.description !== undefined) {
    updateData.description = params.description;
  }

  let changeRows: ReturnType<typeof buildGraphEditChangeRows> | undefined;

  if (params.newGraphData) {
    const topicSpace = await db.topicSpace.findFirst({
      where: { id: existingProposal.topicSpaceId },
      include: {
        graphNodes: { where: { deletedAt: null } },
        graphRelationships: { where: { deletedAt: null } },
      },
    });

    if (!topicSpace) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "リポジトリが見つかりません",
      });
    }

    const currentGraphData = formGraphDataForFrontend({
      nodes: topicSpace.graphNodes,
      relationships: topicSpace.graphRelationships,
    });

    const nodeDiffs = diffNodes(
      currentGraphData.nodes,
      params.newGraphData.nodes,
    );
    const relationshipDiffs = diffRelationships(
      currentGraphData.relationships,
      params.newGraphData.relationships,
    );

    changeRows = buildGraphEditChangeRows(nodeDiffs, relationshipDiffs);
  }

  return db.$transaction(async (tx) => {
    const proposal = await tx.graphEditProposal.update({
      where: { id: params.proposalId },
      data: updateData,
      include: PROPOSER_INCLUDE,
    });

    if (changeRows) {
      await replaceProposalChanges(tx, params.proposalId, changeRows);
    }

    if (changeRows) {
      return tx.graphEditProposal.findUniqueOrThrow({
        where: { id: params.proposalId },
        include: PROPOSER_INCLUDE,
      });
    }

    return proposal;
  });
}
