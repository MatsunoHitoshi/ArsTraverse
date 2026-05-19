import { createId } from "@paralleldrive/cuid2";
import { test, expect } from "@playwright/test";
import { applyGraphChanges } from "@/server/domain/kg";
import { isIntegrationDatabaseReady } from "../helpers/db-ready";
import {
  createTestTopicSpace,
  deleteTestTopicSpace,
  seedTopicSpaceGraph,
  testDb,
} from "../helpers/test-db";

test.describe("applyGraphChanges", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(
    !isIntegrationDatabaseReady(),
    "DATABASE_URL が未設定、または DB に接続できません（supabase start 等を確認）",
  );

  let topicSpaceId: string;

  test.beforeEach(async () => {
    const topicSpace = await createTestTopicSpace();
    topicSpaceId = topicSpace.id;
  });

  test.afterEach(async () => {
    if (topicSpaceId) {
      await deleteTestTopicSpace(topicSpaceId);
    }
  });

  test.afterAll(async () => {
    await testDb.$disconnect();
  });

  test("論理削除したノードのインシデントエッジも一括で論理削除する", async () => {
    const { nodeAId, nodeBId, edgeABId, edgeBCId } =
      await seedTopicSpaceGraph(topicSpaceId);

    await applyGraphChanges(testDb, topicSpaceId, {
      nodeCreateData: [],
      nodeUpdateData: [],
      nodeDeleteData: [{ id: nodeBId }],
      relationshipCreateData: [],
      relationshipUpdateData: [],
      relationshipDeleteData: [],
    });

    const deletedNode = await testDb.graphNode.findUnique({
      where: { id: nodeBId },
    });
    expect(deletedNode?.topicSpaceId).toBeNull();
    expect(deletedNode?.deletedAt).not.toBeNull();

    const incidentAB = await testDb.graphRelationship.findUnique({
      where: { id: edgeABId },
    });
    const incidentBC = await testDb.graphRelationship.findUnique({
      where: { id: edgeBCId },
    });
    expect(incidentAB?.topicSpaceId).toBeNull();
    expect(incidentAB?.deletedAt).not.toBeNull();
    expect(incidentBC?.topicSpaceId).toBeNull();
    expect(incidentBC?.deletedAt).not.toBeNull();

    const activeNodeA = await testDb.graphNode.findUnique({
      where: { id: nodeAId },
    });
    expect(activeNodeA?.topicSpaceId).toBe(topicSpaceId);
    expect(activeNodeA?.deletedAt).toBeNull();
  });

  test("別 TopicSpace のノードは topicSpaceId スコープで更新されない", async () => {
    const otherTopicSpace = await createTestTopicSpace("pw-kg-other");
    const nodeId = createId();

    try {
      await testDb.graphNode.create({
        data: {
          id: nodeId,
          name: "ScopedNode",
          label: "Entity",
          properties: {},
          topicSpaceId: otherTopicSpace.id,
        },
      });

      await applyGraphChanges(testDb, topicSpaceId, {
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
      });

      const node = await testDb.graphNode.findUnique({ where: { id: nodeId } });
      expect(node?.name).toBe("ScopedNode");
      expect(node?.topicSpaceId).toBe(otherTopicSpace.id);
    } finally {
      await deleteTestTopicSpace(otherTopicSpace.id);
    }
  });

  test("端点 ID が欠けたリレーションは作成しない", async () => {
    const nodeId = createId();
    const validEdgeId = createId();
    const invalidEdgeId = createId();

    await testDb.graphNode.create({
      data: {
        id: nodeId,
        name: "Lonely",
        label: "Entity",
        properties: {},
        topicSpaceId,
      },
    });

    await applyGraphChanges(testDb, topicSpaceId, {
      nodeCreateData: [],
      nodeUpdateData: [],
      nodeDeleteData: [],
      relationshipCreateData: [
        {
          id: validEdgeId,
          type: "SELF",
          properties: {},
          sourceId: nodeId,
          targetId: nodeId,
        },
        {
          id: invalidEdgeId,
          type: "BROKEN",
          properties: {},
          sourceId: "",
          targetId: nodeId,
        },
      ],
      relationshipUpdateData: [],
      relationshipDeleteData: [],
    });

    const validEdge = await testDb.graphRelationship.findUnique({
      where: { id: validEdgeId },
    });
    const invalidEdge = await testDb.graphRelationship.findUnique({
      where: { id: invalidEdgeId },
    });

    expect(validEdge).not.toBeNull();
    expect(validEdge?.topicSpaceId).toBe(topicSpaceId);
    expect(invalidEdge).toBeNull();
  });

  test("skipDuplicates により同一 ID のノード再作成は無視される", async () => {
    const nodeId = createId();

    await applyGraphChanges(testDb, topicSpaceId, {
      nodeCreateData: [
        {
          id: nodeId,
          name: "First",
          label: "Entity",
          properties: {},
        },
      ],
      nodeUpdateData: [],
      nodeDeleteData: [],
      relationshipCreateData: [],
      relationshipUpdateData: [],
      relationshipDeleteData: [],
    });

    await applyGraphChanges(testDb, topicSpaceId, {
      nodeCreateData: [
        {
          id: nodeId,
          name: "Second",
          label: "Entity",
          properties: {},
        },
      ],
      nodeUpdateData: [],
      nodeDeleteData: [],
      relationshipCreateData: [],
      relationshipUpdateData: [],
      relationshipDeleteData: [],
    });

    const node = await testDb.graphNode.findUnique({ where: { id: nodeId } });
    expect(node?.name).toBe("First");
  });
});
