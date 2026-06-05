import { DocumentType, type PrismaClient } from "@prisma/client";

type DeleteScanSessionCtx = {
  db: PrismaClient;
  session: { user: { id: string } };
};

export async function deleteScanSession(
  ctx: DeleteScanSessionCtx,
  sourceDocumentId: string,
) {
  const document = await ctx.db.sourceDocument.findFirst({
    where: {
      id: sourceDocumentId,
      userId: ctx.session.user.id,
      isDeleted: false,
      documentType: DocumentType.INPUT_SCAN,
    },
    select: { id: true },
  });

  if (!document) {
    throw new Error("スキャンセッションが見つかりません");
  }

  await ctx.db.sourceDocument.update({
    where: { id: document.id },
    data: { isDeleted: true },
  });

  return { id: document.id };
}
