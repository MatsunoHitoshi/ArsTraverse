import { createId } from "@paralleldrive/cuid2";
import { test, expect } from "@playwright/test";
import { attachDocumentsToTopicSpace } from "@/server/services/kg/attach-documents.service";
import { isIntegrationDatabaseReady } from "../helpers/db-ready";
import {
  createTestTopicSpaceWithAdmin,
  deleteTestDocumentGraph,
  deleteTestTopicSpace,
  testDb,
} from "../helpers/test-db";

test.describe("attachDocumentsToTopicSpace", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(
    !isIntegrationDatabaseReady(),
    "DATABASE_URL が未設定、または DB に接続できません（supabase start 等を確認）",
  );

  test.afterAll(async () => {
    await testDb.$disconnect();
  });

  test("ドキュメント接続で同名ノードが Topic Space に融合される", async () => {
    const { topicSpace, userId } = await createTestTopicSpaceWithAdmin(
      "pw-kg-attach",
    );
    const sharedName = `AttachShared-${createId()}`;

    const doc = await testDb.sourceDocument.create({
      data: {
        name: "attach-doc",
        url: "https://example.com/attach",
        userId,
      },
    });
    const documentGraph = await testDb.documentGraph.create({
      data: { sourceDocumentId: doc.id, userId, dataJson: {} },
    });

    try {
      await testDb.graphNode.create({
        data: {
          name: sharedName,
          label: "Entity",
          properties: {},
          documentGraphId: documentGraph.id,
        },
      });
      await testDb.graphNode.create({
        data: {
          name: sharedName,
          label: "Entity",
          properties: {},
          topicSpaceId: topicSpace.id,
        },
      });

      await attachDocumentsToTopicSpace(
        { db: testDb, session: { user: { id: userId } } },
        { id: topicSpace.id, documentIds: [doc.id] },
      );

      const linked = await testDb.topicSpace.findFirst({
        where: { id: topicSpace.id },
        include: { sourceDocuments: true },
      });
      expect(linked?.sourceDocuments.some((d) => d.id === doc.id)).toBe(true);

      const history = await testDb.graphChangeHistory.findFirst({
        where: { recordId: topicSpace.id },
        orderBy: { createdAt: "desc" },
      });
      expect(history?.description).toBe("ドキュメントを追加しました");
    } finally {
      await deleteTestDocumentGraph(documentGraph.id, doc.id);
      await deleteTestTopicSpace(topicSpace.id);
    }
  });
});
