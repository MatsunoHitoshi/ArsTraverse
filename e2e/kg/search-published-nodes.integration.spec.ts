import { createId } from "@paralleldrive/cuid2";
import { test, expect } from "@playwright/test";
import { WorkspaceStatus } from "@prisma/client";
import { searchPublishedNodes } from "@/server/services/workspace/search-published-nodes.service";
import { isIntegrationDatabaseReady } from "../helpers/db-ready";
import {
  createTestTopicSpaceWithAdmin,
  deleteTestTopicSpace,
  getOrCreateTestAdminUser,
  testDb,
} from "../helpers/test-db";

test.describe("searchPublishedNodes", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(
    !isIntegrationDatabaseReady(),
    "DATABASE_URL が未設定、または DB に接続できません（supabase start 等を確認）",
  );

  test.afterAll(async () => {
    await testDb.$disconnect();
  });

  test("公開 Workspace 内ノードを部分一致検索できる", async () => {
    const user = await getOrCreateTestAdminUser();
    const { topicSpace } = await createTestTopicSpaceWithAdmin(
      "pw-search-published",
    );
    const nodeId = createId();
    const uniqueName = `PublishedSearchTarget-${createId()}`;

    const workspace = await testDb.workspace.create({
      data: {
        name: `Published WS ${createId()}`,
        status: WorkspaceStatus.PUBLISHED,
        userId: user.id,
        referencedTopicSpaces: { connect: { id: topicSpace.id } },
      },
    });

    await testDb.graphNode.create({
      data: {
        id: nodeId,
        name: uniqueName,
        label: "Artist",
        properties: {},
        topicSpaceId: topicSpace.id,
      },
    });

    try {
      const matches = await searchPublishedNodes(
        { db: testDb },
        { query: "PublishedSearchTarget", limit: 10 },
      );

      expect(
        matches.some(
          (match) =>
            match.nodeId === nodeId &&
            match.workspaceId === workspace.id &&
            match.topicSpaceId === topicSpace.id,
        ),
      ).toBe(true);
    } finally {
      await testDb.graphNode.deleteMany({ where: { id: nodeId } });
      await testDb.workspace.delete({ where: { id: workspace.id } });
      await deleteTestTopicSpace(topicSpace.id);
    }
  });
});
