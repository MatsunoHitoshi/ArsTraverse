import { DocumentType, type PrismaClient } from "@prisma/client";

type ListScanSessionsCtx = {
  db: PrismaClient;
  session: { user: { id: string } };
};

export async function listScanSessions(
  ctx: ListScanSessionsCtx,
  input: { limit: number; page: number },
) {
  const skip = (input.page - 1) * input.limit;
  const where = {
    userId: ctx.session.user.id,
    isDeleted: false,
    documentType: DocumentType.INPUT_SCAN,
  };

  const [items, totalCount] = await Promise.all([
    ctx.db.sourceDocument.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        graph: {
          select: {
            id: true,
            graphNodes: { select: { id: true } },
          },
        },
      },
      take: input.limit,
      skip,
    }),
    ctx.db.sourceDocument.count({ where }),
  ]);

  return {
    items: items.map((item) => ({
      id: item.id,
      name: item.name,
      createdAt: item.createdAt,
      sourceImageUrl: item.sourceImageUrl,
      graphId: item.graph?.id ?? null,
      nodeCount: item.graph?.graphNodes.length ?? 0,
    })),
    totalCount,
    totalPages: Math.ceil(totalCount / input.limit),
    currentPage: input.page,
  };
}
