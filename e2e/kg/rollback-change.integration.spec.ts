import { createId } from "@paralleldrive/cuid2";
import { test, expect } from "@playwright/test";
import { applyTopicSpaceGraphDiff } from "@/server/services/kg/apply-topic-space-graph-diff.service";
import { rollbackGraphChange } from "@/server/services/graph-edit-proposal/rollback-change.service";
import { isIntegrationDatabaseReady } from "../helpers/db-ready";
import {
  createTestTopicSpaceWithAdmin,
  deleteTestTopicSpace,
  testDb,
} from "../helpers/test-db";

test.describe("rollbackGraphChange", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(
    !isIntegrationDatabaseReady(),
    "DATABASE_URL が未設定、または DB に接続できません（supabase start 等を確認）",
  );

  test.afterAll(async () => {
    await testDb.$disconnect();
  });

  test("graphChangeHistory をロールバックすると追加ノードが論理削除される", async () => {
    const { topicSpace, userId } = await createTestTopicSpaceWithAdmin(
      "pw-kg-rollback-svc",
    );
    const newNodeId = createId();

    try {
      await applyTopicSpaceGraphDiff(testDb, {
        topicSpaceId: topicSpace.id,
        userId,
        description: "テスト: ノード追加",
        prevNodes: [],
        prevRelationships: [],
        nextNodes: [
          {
            id: newNodeId,
            name: "RollbackSvcNode",
            label: "Entity",
            properties: {},
            topicSpaceId: topicSpace.id,
            documentGraphId: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
          },
        ],
        nextRelationships: [],
      });

      const history = await testDb.graphChangeHistory.findFirst({
        where: { recordId: topicSpace.id },
        orderBy: { createdAt: "desc" },
      });
      expect(history).not.toBeNull();

      await rollbackGraphChange(testDb, {
        changeHistoryId: history!.id,
        userId,
        reason: "e2e test",
      });

      const node = await testDb.graphNode.findUnique({ where: { id: newNodeId } });
      expect(node?.topicSpaceId).toBeNull();
      expect(node?.deletedAt).not.toBeNull();

      const rollbackHistory = await testDb.graphChangeHistory.findFirst({
        where: { recordId: topicSpace.id },
        orderBy: { createdAt: "desc" },
      });
      expect(rollbackHistory?.description).toContain("ロールバック");
    } finally {
      await deleteTestTopicSpace(topicSpace.id);
    }
  });
});
