import { createId } from "@paralleldrive/cuid2";
import { test, expect } from "@playwright/test";
import { createSourceDocumentWithGraph } from "@/server/services/kg/create-source-document-with-graph.service";
import { isIntegrationDatabaseReady } from "../helpers/db-ready";
import {
  deleteTestDocumentGraph,
  getOrCreateTestAdminUser,
  testDb,
} from "../helpers/test-db";

test.describe("createSourceDocumentWithGraph", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(
    !isIntegrationDatabaseReady(),
    "DATABASE_URL が未設定、または DB に接続できません（supabase start 等を確認）",
  );

  test.afterAll(async () => {
    await testDb.$disconnect();
  });

  test("作成したノードに documentGraphId が付与される", async () => {
    const user = await getOrCreateTestAdminUser();
    const nodeId = createId();

    const { documentGraph, sourceDocument } =
      await createSourceDocumentWithGraph(
        { db: testDb, session: { user: { id: user.id } } },
        {
          name: "create-with-graph-test",
          url: "https://example.com/create-with-graph",
          dataJson: {
            nodes: [
              {
                id: nodeId,
                name: "SeedNode",
                label: "Entity",
                properties: {},
              },
            ],
            relationships: [],
          },
        },
      );

    try {
      const node = await testDb.graphNode.findUnique({ where: { id: nodeId } });
      expect(node?.documentGraphId).toBe(documentGraph.id);
      expect(node?.topicSpaceId).toBeNull();
    } finally {
      await deleteTestDocumentGraph(documentGraph.id, sourceDocument.id);
    }
  });
});
