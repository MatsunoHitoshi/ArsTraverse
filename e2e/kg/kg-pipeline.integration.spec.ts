import { createId } from "@paralleldrive/cuid2";
import { test, expect } from "@playwright/test";
import { formNodeDataForFrontend } from "@/app/_utils/kg/frontend-properties";
import { integrateGraph } from "@/server/services/kg/integrate-graph.service";
import { mergeGraphNodes } from "@/server/services/kg/merge-graph-nodes.service";
import { applyTopicSpaceGraphDiff } from "@/server/services/kg/apply-topic-space-graph-diff.service";
import { detachDocumentsFromTopicSpace } from "@/server/services/kg/detach-documents.service";
import { updateTopicSpaceGraphProperties } from "@/server/services/kg/update-topic-space-graph-properties.service";
import { isIntegrationDatabaseReady } from "../helpers/db-ready";
import {
  createTestTopicSpaceWithAdmin,
  deleteTestTopicSpace,
  seedTopicSpaceGraph,
  testDb,
} from "../helpers/test-db";
import { makeGraphNode } from "../helpers/graph-fixtures";

test.describe("KG pipeline services", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(
    !isIntegrationDatabaseReady(),
    "DATABASE_URL が未設定、または DB に接続できません（supabase start 等を確認）",
  );

  test.afterAll(async () => {
    await testDb.$disconnect();
  });

  test("integrateGraph は新規ノードを Topic Space に追加する", async () => {
    const { topicSpace, userId } = await createTestTopicSpaceWithAdmin(
      "pw-kg-integrate",
    );
    try {
      const newNodeId = createId();
      await integrateGraph(testDb, {
        topicSpaceId: topicSpace.id,
        userId,
        graphDocument: {
          nodes: [
            {
              id: newNodeId,
              name: "統合テストノード",
              label: "Entity",
              properties: {},
            },
          ],
          relationships: [],
        },
      });

      const created = await testDb.graphNode.findFirst({
        where: {
          topicSpaceId: topicSpace.id,
          name: "統合テストノード",
          deletedAt: null,
        },
      });
      expect(created).not.toBeNull();
      expect(created?.topicSpaceId).toBe(topicSpace.id);
    } finally {
      await deleteTestTopicSpace(topicSpace.id);
    }
  });

  test("mergeGraphNodes は重複ノード統合後に余剰ノードを論理削除する", async () => {
    const { topicSpace, userId } = await createTestTopicSpaceWithAdmin(
      "pw-kg-merge",
    );
    const duplicateName = `重複ノード-${createId()}`;
    const keepId = createId();
    const removeId = createId();

    try {
      await testDb.graphNode.createMany({
        data: [
          {
            id: keepId,
            name: duplicateName,
            label: "Entity",
            properties: {},
            topicSpaceId: topicSpace.id,
          },
          {
            id: removeId,
            name: duplicateName,
            label: "Entity",
            properties: {},
            topicSpaceId: topicSpace.id,
          },
        ],
      });

      await mergeGraphNodes(testDb, {
        topicSpaceId: topicSpace.id,
        userId,
        nodesToMerge: [
          formNodeDataForFrontend(
            makeGraphNode({
              id: keepId,
              name: duplicateName,
              label: "Entity",
              topicSpaceId: topicSpace.id,
            }),
          ),
          formNodeDataForFrontend(
            makeGraphNode({
              id: removeId,
              name: duplicateName,
              label: "Entity",
              topicSpaceId: topicSpace.id,
            }),
          ),
        ],
      });

      const removed = await testDb.graphNode.findUnique({
        where: { id: removeId },
      });
      expect(removed?.topicSpaceId).toBeNull();
      expect(removed?.deletedAt).not.toBeNull();

      const kept = await testDb.graphNode.findUnique({ where: { id: keepId } });
      expect(kept?.topicSpaceId).toBe(topicSpace.id);
    } finally {
      await deleteTestTopicSpace(topicSpace.id);
    }
  });

  test("applyTopicSpaceGraphDiff はノード削除時にインシデントエッジも論理削除する", async () => {
    const { topicSpace, userId } = await createTestTopicSpaceWithAdmin(
      "pw-kg-diff",
    );
    try {
      const { nodeAId, nodeBId, nodeCId, edgeABId } =
        await seedTopicSpaceGraph(topicSpace.id);

      const remainingNodes = await testDb.graphNode.findMany({
        where: { topicSpaceId: topicSpace.id, deletedAt: null },
      });
      const remainingRelationships = await testDb.graphRelationship.findMany({
        where: { topicSpaceId: topicSpace.id, deletedAt: null },
      });

      const nextNodes = remainingNodes.filter((n) => n.id !== nodeBId);
      const nextRelationships = remainingRelationships.filter(
        (r) => r.id !== edgeABId,
      );

      await testDb.$transaction(async (tx) => {
        await applyTopicSpaceGraphDiff(tx, {
          topicSpaceId: topicSpace.id,
          userId,
          description: "テスト: ノード削除",
          prevNodes: remainingNodes,
          prevRelationships: remainingRelationships,
          nextNodes,
          nextRelationships,
        });
      });

      const deletedNode = await testDb.graphNode.findUnique({
        where: { id: nodeBId },
      });
      expect(deletedNode?.topicSpaceId).toBeNull();

      const incidentEdge = await testDb.graphRelationship.findUnique({
        where: { id: edgeABId },
      });
      expect(incidentEdge?.topicSpaceId).toBeNull();

      const nodeA = await testDb.graphNode.findUnique({ where: { id: nodeAId } });
      const nodeC = await testDb.graphNode.findUnique({ where: { id: nodeCId } });
      expect(nodeA?.topicSpaceId).toBe(topicSpace.id);
      expect(nodeC?.topicSpaceId).toBe(topicSpace.id);
    } finally {
      await deleteTestTopicSpace(topicSpace.id);
    }
  });

  test("updateTopicSpaceGraphProperties は properties を更新し履歴を残す", async () => {
    const { topicSpace, userId } = await createTestTopicSpaceWithAdmin(
      "pw-kg-props",
    );
    const nodeId = createId();
    try {
      await testDb.graphNode.create({
        data: {
          id: nodeId,
          name: "PropNode",
          label: "Entity",
          properties: { foo: "old" },
          topicSpaceId: topicSpace.id,
        },
      });

      await updateTopicSpaceGraphProperties(testDb, {
        topicSpaceId: topicSpace.id,
        userId,
        nodes: [
          formNodeDataForFrontend(
            makeGraphNode({
              id: nodeId,
              name: "PropNode",
              label: "Entity",
              properties: { foo: "new" },
              topicSpaceId: topicSpace.id,
            }),
          ),
        ],
        relationships: [],
      });

      const node = await testDb.graphNode.findUnique({ where: { id: nodeId } });
      expect((node?.properties as { foo: string }).foo).toBe("new");
      expect(node?.topicSpaceId).toBe(topicSpace.id);

      const history = await testDb.graphChangeHistory.findFirst({
        where: { recordId: topicSpace.id },
        orderBy: { createdAt: "desc" },
      });
      expect(history?.description).toBe("プロパティを更新しました");
    } finally {
      await deleteTestTopicSpace(topicSpace.id);
    }
  });

  test("detachDocumentsFromTopicSpace はドキュメント切り離しでマッチングノードを論理削除する", async () => {
    const { topicSpace, userId } = await createTestTopicSpaceWithAdmin(
      "pw-kg-detach",
    );
    const nodeName = `DetachNode-${createId()}`;
    const tsNodeId = createId();
    let docId: string | undefined;

    try {
      const doc = await testDb.sourceDocument.create({
        data: {
          name: "detach-doc",
          url: "https://example.com/detach",
          userId,
        },
      });
      docId = doc.id;
      const dg = await testDb.documentGraph.create({
        data: { sourceDocumentId: doc.id, userId, dataJson: {} },
      });
      await testDb.graphNode.create({
        data: {
          id: createId(),
          name: nodeName,
          label: "Entity",
          properties: {},
          documentGraphId: dg.id,
        },
      });
      await testDb.graphNode.create({
        data: {
          id: tsNodeId,
          name: nodeName,
          label: "Entity",
          properties: {},
          topicSpaceId: topicSpace.id,
        },
      });
      await testDb.topicSpace.update({
        where: { id: topicSpace.id },
        data: { sourceDocuments: { connect: { id: doc.id } } },
      });

      await detachDocumentsFromTopicSpace(
        { db: testDb, session: { user: { id: userId } } },
        { id: topicSpace.id, documentId: doc.id },
      );

      const deleted = await testDb.graphNode.findUnique({
        where: { id: tsNodeId },
      });
      expect(deleted?.topicSpaceId).toBeNull();

      const history = await testDb.graphChangeHistory.findFirst({
        where: { recordId: topicSpace.id },
        orderBy: { createdAt: "desc" },
      });
      expect(history?.description).toBe("ドキュメントを削除しました");

      const stillConnected = await testDb.topicSpace.findFirst({
        where: { id: topicSpace.id },
        include: { sourceDocuments: true },
      });
      expect(
        stillConnected?.sourceDocuments.some((d) => d.id === doc.id),
      ).toBe(false);
    } finally {
      if (docId) {
        await testDb.sourceDocument
          .delete({ where: { id: docId } })
          .catch((e) =>
            console.warn(`Ignoring cleanup error for doc ${docId}:`, e),
          );
      }
      await deleteTestTopicSpace(topicSpace.id);
    }
  });
});
