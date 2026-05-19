import { createId } from "@paralleldrive/cuid2";
import { test, expect } from "@playwright/test";
import { formNodeDataForFrontend } from "@/app/_utils/kg/frontend-properties";
import { updateDocumentGraph } from "@/server/services/kg/update-document-graph.service";
import { isIntegrationDatabaseReady } from "../helpers/db-ready";
import { makeGraphNode } from "../helpers/graph-fixtures";
import {
  createTestDocumentGraph,
  deleteTestDocumentGraph,
  getOrCreateTestAdminUser,
  seedDocumentGraph,
  testDb,
} from "../helpers/test-db";

test.describe("updateDocumentGraph", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(
    !isIntegrationDatabaseReady(),
    "DATABASE_URL が未設定、または DB に接続できません（supabase start 等を確認）",
  );

  test.afterAll(async () => {
    await testDb.$disconnect();
  });

  test("プロパティ更新が documentGraphId スコープで反映され履歴を残す", async () => {
    const user = await getOrCreateTestAdminUser();
    const { documentGraph, sourceDocument } =
      await createTestDocumentGraph(user.id);
    const { nodeAId } = await seedDocumentGraph(documentGraph.id);

    try {
      const node = await testDb.graphNode.findUnique({ where: { id: nodeAId } });
      expect(node).not.toBeNull();

      await updateDocumentGraph(testDb, {
        documentGraphId: documentGraph.id,
        userId: user.id,
        nodes: [
          formNodeDataForFrontend(
            makeGraphNode({
              id: nodeAId,
              name: "DocNodeA",
              label: "Entity",
              properties: { score: "99" },
              documentGraphId: documentGraph.id,
            }),
          ),
        ],
        relationships: [],
      });

      const updated = await testDb.graphNode.findUnique({
        where: { id: nodeAId },
      });
      expect((updated?.properties as { score: string }).score).toBe("99");
      expect(updated?.documentGraphId).toBe(documentGraph.id);

      const history = await testDb.graphChangeHistory.findFirst({
        where: { recordId: documentGraph.id },
        orderBy: { createdAt: "desc" },
      });
      expect(history?.description).toBe("グラフを更新しました");
    } finally {
      await deleteTestDocumentGraph(documentGraph.id, sourceDocument.id);
    }
  });

  test("別 DocumentGraph のノードは更新されない", async () => {
    const user = await getOrCreateTestAdminUser();
    const primary = await createTestDocumentGraph(user.id);
    const other = await createTestDocumentGraph(user.id);
    const foreignNodeId = createId();

    try {
      await testDb.graphNode.create({
        data: {
          id: foreignNodeId,
          name: "ForeignNode",
          label: "Entity",
          properties: { score: "1" },
          documentGraphId: other.documentGraph.id,
        },
      });

      const primaryNodeId = createId();
      await testDb.graphNode.create({
        data: {
          id: primaryNodeId,
          name: "PrimaryOnly",
          label: "Entity",
          properties: {},
          documentGraphId: primary.documentGraph.id,
        },
      });

      await updateDocumentGraph(testDb, {
        documentGraphId: primary.documentGraph.id,
        userId: user.id,
        nodes: [
          formNodeDataForFrontend(
            makeGraphNode({
              id: primaryNodeId,
              name: "PrimaryOnly",
              label: "Entity",
              properties: {},
              documentGraphId: primary.documentGraph.id,
            }),
          ),
        ],
        relationships: [],
      });

      const foreign = await testDb.graphNode.findUnique({
        where: { id: foreignNodeId },
      });
      expect((foreign?.properties as { score: string }).score).toBe("1");
    } finally {
      await deleteTestDocumentGraph(
        primary.documentGraph.id,
        primary.sourceDocument.id,
      );
      await deleteTestDocumentGraph(
        other.documentGraph.id,
        other.sourceDocument.id,
      );
    }
  });
});
