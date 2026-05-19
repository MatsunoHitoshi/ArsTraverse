import type { Prisma, PrismaClient } from "@prisma/client";
import type { GraphEditChange } from "@prisma/client";
import { GraphChangeRecordType } from "@prisma/client";
import { buildNodeLinkChangeHistoryRows } from "@/server/domain/kg/graph-history";
import type {
  NodeDiffType,
  RelationshipDiffType,
} from "@/app/_utils/kg/get-nodes-and-relationships-from-result";

export async function createTopicSpaceGraphChangeHistory(
  db: PrismaClient | Prisma.TransactionClient,
  params: {
    recordId: string;
    description: string;
    userId: string;
    nodeDiffs: NodeDiffType[];
    relationshipDiffs: RelationshipDiffType[];
  },
) {
  const graphChangeHistory = await db.graphChangeHistory.create({
    data: {
      recordType: GraphChangeRecordType.TOPIC_SPACE,
      recordId: params.recordId,
      description: params.description,
      user: { connect: { id: params.userId } },
    },
  });

  const rows = buildNodeLinkChangeHistoryRows(
    params.nodeDiffs,
    params.relationshipDiffs,
    graphChangeHistory.id,
  );

  if (rows.length > 0) {
    await db.nodeLinkChangeHistory.createMany({ data: rows });
  }

  return graphChangeHistory;
}

export async function createDocumentGraphChangeHistory(
  db: PrismaClient | Prisma.TransactionClient,
  params: {
    recordId: string;
    description: string;
    userId: string;
    nodeDiffs: NodeDiffType[];
    relationshipDiffs: RelationshipDiffType[];
  },
) {
  const graphChangeHistory = await db.graphChangeHistory.create({
    data: {
      recordType: GraphChangeRecordType.DOCUMENT_GRAPH,
      recordId: params.recordId,
      description: params.description,
      user: { connect: { id: params.userId } },
    },
  });

  const rows = buildNodeLinkChangeHistoryRows(
    params.nodeDiffs,
    params.relationshipDiffs,
    graphChangeHistory.id,
  );

  if (rows.length > 0) {
    await db.nodeLinkChangeHistory.createMany({ data: rows });
  }

  return graphChangeHistory;
}

/** 変更提案マージ時: proposal.changes をそのまま nodeLinkChangeHistory に記録 */
export async function createTopicSpaceGraphChangeHistoryFromProposalChanges(
  db: PrismaClient | Prisma.TransactionClient,
  params: {
    recordId: string;
    description: string;
    userId: string;
    changes: Pick<
      GraphEditChange,
      | "changeType"
      | "changeEntityType"
      | "changeEntityId"
      | "previousState"
      | "nextState"
    >[];
  },
) {
  const graphChangeHistory = await db.graphChangeHistory.create({
    data: {
      recordType: GraphChangeRecordType.TOPIC_SPACE,
      recordId: params.recordId,
      description: params.description,
      user: { connect: { id: params.userId } },
    },
  });

  const historyRows = params.changes.map((change) => ({
    changeType: change.changeType,
    changeEntityType: change.changeEntityType,
    changeEntityId: change.changeEntityId,
    previousState: (change.previousState ?? {}) as object,
    nextState: (change.nextState ?? {}) as object,
    graphChangeHistoryId: graphChangeHistory.id,
  }));

  if (historyRows.length > 0) {
    await db.nodeLinkChangeHistory.createMany({ data: historyRows });
  }

  return graphChangeHistory;
}
