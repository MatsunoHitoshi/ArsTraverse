import type { Prisma, PrismaClient } from "@prisma/client";
import type { GraphNode, GraphRelationship } from "@prisma/client";
import { documentGraphScope } from "@/server/domain/kg/graph-scope";
import { applyScopedGraphChanges } from "@/server/domain/kg/graph-mutation";
import { createDocumentGraphChangeHistory } from "@/server/repositories/graph-change-history.repository";
import { computeTopicSpaceGraphDiff } from "./compute-graph-diff";

function isPrismaClient(
  db: PrismaClient | Prisma.TransactionClient,
): db is PrismaClient {
  return typeof (db as PrismaClient).$transaction === "function";
}

export async function applyDocumentGraphChangeData(
  db: PrismaClient | Prisma.TransactionClient,
  params: {
    documentGraphId: string;
    userId: string;
    description: string;
    nodeDiffs: Awaited<
      ReturnType<typeof computeTopicSpaceGraphDiff>
    >["nodeDiffs"];
    relationshipDiffs: Awaited<
      ReturnType<typeof computeTopicSpaceGraphDiff>
    >["relationshipDiffs"];
    changeData: Awaited<
      ReturnType<typeof computeTopicSpaceGraphDiff>
    >["changeData"];
  },
): Promise<void> {
  const run = async (tx: Prisma.TransactionClient) => {
    await applyScopedGraphChanges(
      tx,
      documentGraphScope(params.documentGraphId),
      params.changeData,
    );
    await createDocumentGraphChangeHistory(tx, {
      recordId: params.documentGraphId,
      description: params.description,
      userId: params.userId,
      nodeDiffs: params.nodeDiffs,
      relationshipDiffs: params.relationshipDiffs,
    });
  };

  if (isPrismaClient(db)) {
    await db.$transaction(run, { timeout: 30000 });
    return;
  }

  await run(db);
}

export async function applyDocumentGraphDiff(
  db: PrismaClient | Prisma.TransactionClient,
  params: {
    documentGraphId: string;
    userId: string;
    description: string;
    prevNodes: GraphNode[];
    prevRelationships: GraphRelationship[];
    nextNodes: GraphNode[];
    nextRelationships: GraphRelationship[];
  },
): Promise<void> {
  const { nodeDiffs, relationshipDiffs, changeData } = computeTopicSpaceGraphDiff(
    params.prevNodes,
    params.prevRelationships,
    params.nextNodes,
    params.nextRelationships,
  );

  await applyDocumentGraphChangeData(db, {
    documentGraphId: params.documentGraphId,
    userId: params.userId,
    description: params.description,
    nodeDiffs,
    relationshipDiffs,
    changeData,
  });
}
