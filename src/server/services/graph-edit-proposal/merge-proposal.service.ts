import type { PrismaClient } from "@prisma/client";
import { ProposalStatus } from "@prisma/client";
import { generateProposalChangeData } from "@/server/domain/kg";
import { applyScopedGraphChanges } from "@/server/domain/kg/graph-mutation";
import { topicSpaceScope } from "@/server/domain/kg/graph-scope";
import { createTopicSpaceGraphChangeHistoryFromProposalChanges } from "@/server/repositories/graph-change-history.repository";
import { findApprovedProposalForMerge } from "@/server/repositories/graph-edit-proposal.repository";

export async function mergeGraphEditProposal(
  db: PrismaClient,
  params: {
    proposalId: string;
    userId: string;
  },
) {
  const proposal = await findApprovedProposalForMerge(
    db,
    params.proposalId,
    params.userId,
  );

  const changeData = generateProposalChangeData(
    proposal.changes.map((change) => ({
      ...change,
      previousState: change.previousState as Record<string, unknown>,
      nextState: change.nextState as Record<string, unknown>,
    })),
    proposal.topicSpaceId,
  );

  return await db.$transaction(
    async (tx) => {
      await applyScopedGraphChanges(
        tx,
        topicSpaceScope(proposal.topicSpaceId),
        changeData,
      );

      await createTopicSpaceGraphChangeHistoryFromProposalChanges(tx, {
        recordId: proposal.topicSpaceId,
        description: `変更提案「${proposal.title}」をマージしました`,
        userId: params.userId,
        changes: proposal.changes,
      });

      return await tx.graphEditProposal.update({
        where: { id: params.proposalId },
        data: { status: ProposalStatus.MERGED },
      });
    },
    { timeout: 30000 },
  );
}
