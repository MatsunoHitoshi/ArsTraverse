import type { PrismaClient } from "@prisma/client";
import { ProposalStatus } from "@prisma/client";
import { TRPCError } from "@trpc/server";

export async function createDraftProposal(
  db: PrismaClient,
  input: {
    topicSpaceId: string;
    title: string;
    description: string;
    proposerId: string;
  },
) {
  const topicSpace = await db.topicSpace.findFirst({
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

  return db.graphEditProposal.create({
    data: {
      title: input.title,
      description: input.description,
      status: ProposalStatus.DRAFT,
      topicSpaceId: input.topicSpaceId,
      proposerId: input.proposerId,
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
}
