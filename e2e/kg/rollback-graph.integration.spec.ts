import { createId } from "@paralleldrive/cuid2";
import {
  GraphChangeEntityType,
  GraphChangeType,
} from "@prisma/client";
import { test, expect } from "@playwright/test";
import { applyGraphChanges, rollbackNodeLinkChanges } from "@/server/domain/kg";
import { isIntegrationDatabaseReady } from "../helpers/db-ready";
import {
  createTestTopicSpace,
  deleteTestTopicSpace,
  testDb,
} from "../helpers/test-db";

test.describe("rollbackNodeLinkChanges", () => {
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

  test("ADD のロールバックでノードとインシデントエッジを論理削除する", async () => {
    const nodeId = createId();
    const edgeId = createId();

    await applyGraphChanges(testDb, topicSpaceId, {
      nodeCreateData: [
        {
          id: nodeId,
          name: "RollbackTarget",
          label: "Entity",
          properties: {},
        },
      ],
      nodeUpdateData: [],
      nodeDeleteData: [],
      relationshipCreateData: [
        {
          id: edgeId,
          type: "LINK",
          properties: {},
          sourceId: nodeId,
          targetId: nodeId,
        },
      ],
      relationshipUpdateData: [],
      relationshipDeleteData: [],
    });

    await rollbackNodeLinkChanges(testDb, topicSpaceId, [
      {
        changeType: GraphChangeType.ADD,
        changeEntityType: GraphChangeEntityType.NODE,
        changeEntityId: nodeId,
        previousState: {},
        nextState: { id: nodeId, name: "RollbackTarget" },
      },
    ]);

    const node = await testDb.graphNode.findUnique({ where: { id: nodeId } });
    const edge = await testDb.graphRelationship.findUnique({
      where: { id: edgeId },
    });

    expect(node?.topicSpaceId).toBeNull();
    expect(node?.deletedAt).not.toBeNull();
    expect(edge?.topicSpaceId).toBeNull();
    expect(edge?.deletedAt).not.toBeNull();
  });

  test("REMOVE のロールバックで論理削除したノードを復元する", async () => {
    const nodeId = createId();

    await testDb.graphNode.create({
      data: {
        id: nodeId,
        name: "Restored",
        label: "Entity",
        properties: {},
        topicSpaceId,
      },
    });

    await applyGraphChanges(testDb, topicSpaceId, {
      nodeCreateData: [],
      nodeUpdateData: [],
      nodeDeleteData: [{ id: nodeId }],
      relationshipCreateData: [],
      relationshipUpdateData: [],
      relationshipDeleteData: [],
    });

    await rollbackNodeLinkChanges(testDb, topicSpaceId, [
      {
        changeType: GraphChangeType.REMOVE,
        changeEntityType: GraphChangeEntityType.NODE,
        changeEntityId: nodeId,
        previousState: {
          id: nodeId,
          name: "Restored",
          label: "Entity",
          properties: {},
        },
        nextState: {},
      },
    ]);

    const node = await testDb.graphNode.findUnique({ where: { id: nodeId } });
    expect(node?.topicSpaceId).toBe(topicSpaceId);
    expect(node?.deletedAt).toBeNull();
    expect(node?.name).toBe("Restored");
  });
});
