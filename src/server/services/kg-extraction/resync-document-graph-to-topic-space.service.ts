import type { PrismaClient } from "@prisma/client";
import { attachDocumentsToTopicSpace } from "@/server/services/kg/attach-documents.service";
import { detachDocumentsFromTopicSpace } from "@/server/services/kg/detach-documents.service";

/**
 * 非同期 KG 完了後、ドキュメントグラフをリポジトリに反映する。
 * 空グラフのままアタッチ済みの場合は detach → attach でマージし直す。
 */
export async function resyncDocumentGraphToTopicSpace(
  db: PrismaClient,
  input: {
    userId: string;
    topicSpaceId: string;
    sourceDocumentId: string;
  },
) {
  const topicSpace = await db.topicSpace.findFirst({
    where: { id: input.topicSpaceId, isDeleted: false },
    include: {
      sourceDocuments: { where: { id: input.sourceDocumentId, isDeleted: false } },
    },
  });

  if (!topicSpace) return;

  const ctx = { db, session: { user: { id: input.userId } } };
  const isAttached = topicSpace.sourceDocuments.length > 0;

  if (isAttached) {
    await detachDocumentsFromTopicSpace(ctx, {
      id: input.topicSpaceId,
      documentId: input.sourceDocumentId,
    });
    await attachDocumentsToTopicSpace(ctx, {
      id: input.topicSpaceId,
      documentIds: [input.sourceDocumentId],
    });
  }
}
