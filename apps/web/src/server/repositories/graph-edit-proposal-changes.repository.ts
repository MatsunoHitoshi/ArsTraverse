import type { Prisma, PrismaClient } from "@prisma/client";
import type { GraphEditChangeRow } from "@/server/domain/kg/proposal-change-rows";

type DbClient = PrismaClient | Prisma.TransactionClient;

export async function replaceProposalChanges(
  db: DbClient,
  proposalId: string,
  rows: GraphEditChangeRow[],
) {
  await db.graphEditChange.deleteMany({ where: { proposalId } });

  if (rows.length === 0) return;

  await db.graphEditChange.createMany({
    data: rows.map((row) => ({ ...row, proposalId })),
  });
}
