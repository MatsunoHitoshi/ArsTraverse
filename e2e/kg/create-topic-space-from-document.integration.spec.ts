import { createId } from "@paralleldrive/cuid2";
import { test, expect } from "@playwright/test";
import { createTopicSpaceFromDocument } from "@/server/services/kg/create-topic-space-from-document.service";
import { isIntegrationDatabaseReady } from "../helpers/db-ready";
import {
  deleteTestDocumentGraph,
  deleteTestTopicSpace,
  getOrCreateTestAdminUser,
  testDb,
} from "../helpers/test-db";

test.describe("createTopicSpaceFromDocument", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(
    !isIntegrationDatabaseReady(),
    "DATABASE_URL が未設定、または DB に接続できません（supabase start 等を確認）",
  );

  test.afterAll(async () => {
    await testDb.$disconnect();
  });

  test("ドキュメントグラフが Topic Space に複製される", async () => {
    const user = await getOrCreateTestAdminUser();
    const nodeName = `TsSeed-${createId()}`;
    const edgeType = "RELATED_TO";

    const doc = await testDb.sourceDocument.create({
      data: {
        name: `pw-ts-create-${createId()}`,
        url: "https://example.com/ts-create",
        userId: user.id,
      },
    });
    const documentGraph = await testDb.documentGraph.create({
      data: { sourceDocumentId: doc.id, userId: user.id, dataJson: {} },
    });
    const nodeAId = createId();
    const nodeBId = createId();

    await testDb.graphNode.createMany({
      data: [
        {
          id: nodeAId,
          name: nodeName,
          label: "Entity",
          properties: {},
          documentGraphId: documentGraph.id,
        },
        {
          id: nodeBId,
          name: `Other-${createId()}`,
          label: "Entity",
          properties: {},
          documentGraphId: documentGraph.id,
        },
      ],
    });
    await testDb.graphRelationship.create({
      data: {
        type: edgeType,
        properties: {},
        fromNodeId: nodeAId,
        toNodeId: nodeBId,
        documentGraphId: documentGraph.id,
      },
    });

    let topicSpaceId: string | undefined;

    try {
      const topicSpace = await createTopicSpaceFromDocument(testDb, {
        userId: user.id,
        documentId: doc.id,
        name: `TopicFromDoc-${createId()}`,
        description: "E2E create topic space from document",
      });
      topicSpaceId = topicSpace.id;

      const nodes = await testDb.graphNode.findMany({
        where: { topicSpaceId: topicSpace.id, deletedAt: null },
      });
      expect(nodes.some((n) => n.name === nodeName)).toBe(true);

      const relationships = await testDb.graphRelationship.findMany({
        where: { topicSpaceId: topicSpace.id, deletedAt: null },
      });
      expect(relationships.length).toBeGreaterThan(0);
      expect(relationships[0]?.type).toBe(edgeType);

      const linked = await testDb.topicSpace.findFirst({
        where: { id: topicSpace.id },
        include: { sourceDocuments: true },
      });
      expect(linked?.sourceDocuments.some((d) => d.id === doc.id)).toBe(true);
    } finally {
      if (topicSpaceId) {
        await deleteTestTopicSpace(topicSpaceId);
      }
      await deleteTestDocumentGraph(documentGraph.id, doc.id);
    }
  });
});
