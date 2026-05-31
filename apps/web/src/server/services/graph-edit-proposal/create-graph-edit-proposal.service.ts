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

export async function createGraphEditProposal(
  db: PrismaClient,
  params: {
    topicSpaceId: string;
    title: string;
    description: string;
    proposerId: string;
    newGraphData: {
      nodes: NodeTypeForFrontend[];
      relationships: RelationshipTypeForFrontend[];
    };
  },
) {
  const topicSpace = await db.topicSpace.findFirst({
    where: {
      id: params.topicSpaceId,
      isDeleted: false,
    },
    include: {
      graphNodes: { where: { deletedAt: null } },
      graphRelationships: { where: { deletedAt: null } },
    },
  });

  if (!topicSpace) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "TopicSpaceが見つかりません",
    });
  }

  if (!params.description || params.description.trim().length < 10) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "変更提案には10文字以上の説明が必要です",
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

  if (nodeDiffs.length === 0 && relationshipDiffs.length === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "変更が検出されませんでした",
    });
  }

  return db.graphEditProposal.create({
    data: {
      title: params.title,
      description: params.description,
      status: ProposalStatus.PENDING,
      topicSpaceId: params.topicSpaceId,
      proposerId: params.proposerId,
      changes: {
        create: buildGraphEditChangeRows(nodeDiffs, relationshipDiffs),
      },
    },
    include: PROPOSER_INCLUDE,
  });
}
