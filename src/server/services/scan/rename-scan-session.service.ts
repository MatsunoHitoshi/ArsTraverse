import { DocumentType, type PrismaClient } from "@prisma/client";

type RenameScanSessionCtx = {
  db: PrismaClient;
  session: { user: { id: string } };
};

export async function renameScanSession(
  ctx: RenameScanSessionCtx,
  sourceDocumentId: string,
  name: string,
) {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error("名前を入力してください");
  }

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

  const updated = await ctx.db.sourceDocument.update({
    where: { id: document.id },
    data: { name: trimmedName },
    select: { id: true, name: true },
  });

  return updated;
}
