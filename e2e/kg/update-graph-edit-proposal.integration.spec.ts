import { createId } from "@paralleldrive/cuid2";
import { GraphChangeType, ProposalStatus } from "@prisma/client";
import { test, expect } from "@playwright/test";
import { createGraphEditProposal } from "@/server/services/graph-edit-proposal/create-graph-edit-proposal.service";
import { updateGraphEditProposal } from "@/server/services/graph-edit-proposal/update-graph-edit-proposal.service";
import { isIntegrationDatabaseReady } from "../helpers/db-ready";
import {
  createTestTopicSpaceWithAdmin,
  deleteTestTopicSpace,
  seedTopicSpaceGraph,
  testDb,
} from "../helpers/test-db";

test.describe("updateGraphEditProposal", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(
    !isIntegrationDatabaseReady(),
    "DATABASE_URL が未設定、または DB に接続できません（supabase start 等を確認）",
  );

  test.afterAll(async () => {
    await testDb.$disconnect();
  });

  test("newGraphData 更新で changes が差し替わる", async () => {
    const { topicSpace, userId } = await createTestTopicSpaceWithAdmin(
      "pw-kg-update-proposal",
    );
    const { nodeAId, nodeBId, edgeABId } = await seedTopicSpaceGraph(
      topicSpace.id,
    );
    const newNodeId = createId();

    try {
      const created = await createGraphEditProposal(testDb, {
        topicSpaceId: topicSpace.id,
        title: "更新前",
        description: "E2E update graph edit proposal test",
        proposerId: userId,
        newGraphData: {
          nodes: [
            { id: nodeAId, name: "NodeA", label: "Entity", properties: {} },
            { id: nodeBId, name: "NodeB", label: "Entity", properties: {} },
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

      const updated = await updateGraphEditProposal(testDb, {
        proposalId: created.id,
        userId,
        title: "更新後",
        newGraphData: {
          nodes: [
            { id: nodeAId, name: "NodeA", label: "Entity", properties: {} },
            { id: nodeBId, name: "NodeB", label: "Entity", properties: {} },
            {
              id: newNodeId,
              name: "UpdatedProposalNode",
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

      expect(updated.title).toBe("更新後");
      expect(updated.status).toBe(ProposalStatus.PENDING);

      const changes = await testDb.graphEditChange.findMany({
        where: { proposalId: created.id },
      });
      expect(
        changes.some(
          (c) =>
            c.changeEntityId === newNodeId &&
            c.changeType === GraphChangeType.ADD,
        ),
      ).toBe(true);
    } finally {
      await deleteTestTopicSpace(topicSpace.id);
    }
  });
});
