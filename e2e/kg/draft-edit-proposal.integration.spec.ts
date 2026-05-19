import { createId } from "@paralleldrive/cuid2";
import { GraphChangeType } from "@prisma/client";
import { test, expect } from "@playwright/test";
import { createDraftProposal } from "@/server/services/graph-edit-proposal/draft-proposal.service";
import { upsertNodeInDraft } from "@/server/services/graph-edit-proposal/draft-edit.service";
import { isIntegrationDatabaseReady } from "../helpers/db-ready";
import {
  createTestTopicSpaceWithAdmin,
  deleteTestTopicSpace,
  testDb,
} from "../helpers/test-db";

test.describe("draft graph edit proposal", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(
    !isIntegrationDatabaseReady(),
    "DATABASE_URL が未設定、または DB に接続できません（supabase start 等を確認）",
  );

  test.afterAll(async () => {
    await testDb.$disconnect();
  });

  test("upsertNodeInDraft は graphEditChange にノード追加を記録する", async () => {
    const { topicSpace, userId } = await createTestTopicSpaceWithAdmin(
      "pw-kg-draft-edit",
    );
    const newNodeId = createId();

    try {
      const proposal = await createDraftProposal(testDb, {
        topicSpaceId: topicSpace.id,
        title: "ドラフト編集テスト",
        description: "E2E draft edit proposal test",
        proposerId: userId,
      });

      await upsertNodeInDraft(testDb, userId, {
        proposalId: proposal.id,
        node: {
          id: newNodeId,
          name: "DraftAddedNode",
          label: "Entity",
          properties: {},
        },
      });

      const changes = await testDb.graphEditChange.findMany({
        where: { proposalId: proposal.id },
      });
      const addChange = changes.find(
        (c) =>
          c.changeEntityId === newNodeId &&
          c.changeType === GraphChangeType.ADD,
      );
      expect(addChange).toBeDefined();
      expect((addChange?.nextState as { name?: string }).name).toBe(
        "DraftAddedNode",
      );
    } finally {
      await deleteTestTopicSpace(topicSpace.id);
    }
  });
});
