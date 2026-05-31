import type { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";

type DocumentGraphWithGraph = NonNullable<
  Awaited<ReturnType<typeof findDocumentGraphWithGraph>>
>;

export async function findDocumentGraphWithGraph(
  db: PrismaClient,
  documentGraphId: string,
  options?: { includeDeletedNodes?: boolean },
) {
  return db.documentGraph.findFirst({
    where: {
      id: documentGraphId,
      sourceDocument: { isDeleted: false },
    },
    include: {
      graphNodes: options?.includeDeletedNodes
        ? true
        : { where: { deletedAt: null } },
      graphRelationships: options?.includeDeletedNodes
        ? true
        : { where: { deletedAt: null } },
    },
  });
}

export function assertDocumentGraphOwner(
  documentGraph: { userId: string },
  userId: string,
): void {
  if (documentGraph.userId !== userId) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "DocumentGraph not found",
    });
  }
}

export async function findDocumentGraphWithGraphAndAssertOwner(
  db: PrismaClient,
  documentGraphId: string,
  userId: string,
) {
  const documentGraph = await findDocumentGraphWithGraph(db, documentGraphId);
  if (!documentGraph) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "DocumentGraph not found",
    });
  }
  assertDocumentGraphOwner(documentGraph, userId);
  return documentGraph;
}

export type { DocumentGraphWithGraph };
