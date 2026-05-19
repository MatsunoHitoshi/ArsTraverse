import { createId } from "@paralleldrive/cuid2";
import { GraphChangeType, ProposalStatus } from "@prisma/client";
import { test, expect } from "@playwright/test";
import { createGraphEditProposal } from "@/server/services/graph-edit-proposal/create-graph-edit-proposal.service";
import { isIntegrationDatabaseReady } from "../helpers/db-ready";
import {
  createTestTopicSpaceWithAdmin,
  deleteTestTopicSpace,
  seedTopicSpaceGraph,
  testDb,
} from "../helpers/test-db";

test.describe("createGraphEditProposal", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(
    !isIntegrationDatabaseReady(),
    "DATABASE_URL が未設定、または DB に接続できません（supabase start 等を確認）",
  );

  test.afterAll(async () => {
    await testDb.$disconnect();
  });

  test("差分に応じた graphEditChange を PENDING で作成する", async () => {
    const { topicSpace, userId } = await createTestTopicSpaceWithAdmin(
      "pw-kg-create-proposal",
    );
    const { nodeAId, nodeBId, edgeABId } = await seedTopicSpaceGraph(
      topicSpace.id,
    );
    const newNodeId = createId();

    try {
      const proposal = await createGraphEditProposal(testDb, {
        topicSpaceId: topicSpace.id,
        title: "新規ノード追加提案",
        description: "E2E create graph edit proposal test",
        proposerId: userId,
        newGraphData: {
          nodes: [
            {
              id: nodeAId,
              name: "NodeA",
              label: "Entity",
              properties: {},
            },
            {
              id: nodeBId,
              name: "NodeB",
              label: "Entity",
              properties: {},
            },
            {
              id: newNodeId,
              name: "ProposalNewNode",
              label: "Entity",
              properties: {},
            },
          ],
          relationships: [
            {
              id: edgeABId,
              type: "RELATED_TO",
              sourceId: nodeAId,
              targetId: nodeBId,
              properties: {},
            },
          ],
        },
      });

      expect(proposal.status).toBe(ProposalStatus.PENDING);

      const addChange = proposal.changes.find(
        (c) =>
          c.changeEntityId === newNodeId &&
          c.changeType === GraphChangeType.ADD,
      );
      expect(addChange).toBeDefined();
    } finally {
      await deleteTestTopicSpace(topicSpace.id);
    }
  });
});
