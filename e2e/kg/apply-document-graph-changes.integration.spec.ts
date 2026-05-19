import { createId } from "@paralleldrive/cuid2";
import { test, expect } from "@playwright/test";
import {
  applyScopedGraphChangesToDb,
  documentGraphScope,
} from "@/server/domain/kg";
import { isIntegrationDatabaseReady } from "../helpers/db-ready";
import {
  createTestDocumentGraph,
  deleteTestDocumentGraph,
  getOrCreateTestAdminUser,
  seedDocumentGraph,
  testDb,
} from "../helpers/test-db";

test.describe("applyScopedGraphChanges (documentGraph)", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(
    !isIntegrationDatabaseReady(),
    "DATABASE_URL が未設定、または DB に接続できません（supabase start 等を確認）",
  );

  let documentGraphId: string;
  let sourceDocumentId: string;
  let userId: string;

  test.beforeEach(async () => {
    const user = await getOrCreateTestAdminUser();
    userId = user.id;
    const { documentGraph, sourceDocument } =
      await createTestDocumentGraph(userId);
    documentGraphId = documentGraph.id;
    sourceDocumentId = sourceDocument.id;
  });

  test.afterEach(async () => {
    if (documentGraphId && sourceDocumentId) {
      await deleteTestDocumentGraph(documentGraphId, sourceDocumentId);
    }
  });

  test.afterAll(async () => {
    await testDb.$disconnect();
  });

  test("論理削除したノードのインシデントエッジも一括で論理削除する", async () => {
    const { nodeAId, nodeBId, edgeABId, edgeBCId } =
      await seedDocumentGraph(documentGraphId);

    await applyScopedGraphChangesToDb(
      testDb,
      documentGraphScope(documentGraphId),
      {
        nodeCreateData: [],
        nodeUpdateData: [],
        nodeDeleteData: [{ id: nodeBId }],
        relationshipCreateData: [],
        relationshipUpdateData: [],
        relationshipDeleteData: [],
      },
    );

    const deletedNode = await testDb.graphNode.findUnique({
      where: { id: nodeBId },
    });
    expect(deletedNode?.documentGraphId).toBeNull();
    expect(deletedNode?.deletedAt).not.toBeNull();

    const incidentAB = await testDb.graphRelationship.findUnique({
      where: { id: edgeABId },
    });
    const incidentBC = await testDb.graphRelationship.findUnique({
      where: { id: edgeBCId },
    });
    expect(incidentAB?.documentGraphId).toBeNull();
    expect(incidentBC?.documentGraphId).toBeNull();

    const activeNodeA = await testDb.graphNode.findUnique({
      where: { id: nodeAId },
    });
    expect(activeNodeA?.documentGraphId).toBe(documentGraphId);
  });

  test("別 DocumentGraph のノードは documentGraphId スコープで更新されない", async () => {
    const other = await createTestDocumentGraph(userId);
    const nodeId = createId();

    try {
      await testDb.graphNode.create({
        data: {
          id: nodeId,
          name: "ScopedDocNode",
          label: "Entity",
          properties: {},
          documentGraphId: other.documentGraph.id,
        },
      });

      await applyScopedGraphChangesToDb(
        testDb,
        documentGraphScope(documentGraphId),
        {
          nodeCreateData: [],
          nodeUpdateData: [
            {
              id: nodeId,
              name: "HijackedName",
              label: "Entity",
              properties: {},
            },
          ],
          nodeDeleteData: [],
          relationshipCreateData: [],
          relationshipUpdateData: [],
          relationshipDeleteData: [],
        },
      );

      const node = await testDb.graphNode.findUnique({ where: { id: nodeId } });
      expect(node?.name).toBe("ScopedDocNode");
      expect(node?.documentGraphId).toBe(other.documentGraph.id);
    } finally {
      await deleteTestDocumentGraph(
        other.documentGraph.id,
        other.sourceDocument.id,
      );
    }
  });
});
