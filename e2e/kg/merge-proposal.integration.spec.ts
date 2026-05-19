import { createId } from "@paralleldrive/cuid2";
import {
  GraphChangeEntityType,
  GraphChangeType,
  ProposalStatus,
} from "@prisma/client";
import { test, expect } from "@playwright/test";
import { mergeGraphEditProposal } from "@/server/services/graph-edit-proposal/merge-proposal.service";
import { isIntegrationDatabaseReady } from "../helpers/db-ready";
import {
  createTestTopicSpaceWithAdmin,
  deleteTestTopicSpace,
  testDb,
} from "../helpers/test-db";

test.describe("mergeGraphEditProposal", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(
    !isIntegrationDatabaseReady(),
    "DATABASE_URL が未設定、または DB に接続できません（supabase start 等を確認）",
  );

  test.afterAll(async () => {
    await testDb.$disconnect();
  });

  test("承認済み提案のマージでノードが Topic Space に追加され履歴が残る", async () => {
    const { topicSpace, userId } = await createTestTopicSpaceWithAdmin(
      "pw-kg-merge",
    );
    const newNodeId = createId();

    try {
      const proposal = await testDb.graphEditProposal.create({
        data: {
          title: "マージテスト提案",
          description: "E2E merge proposal test",
          status: ProposalStatus.APPROVED,
          topicSpaceId: topicSpace.id,
          proposerId: userId,
          changes: {
            create: [
              {
                changeType: GraphChangeType.ADD,
                changeEntityType: GraphChangeEntityType.NODE,
                changeEntityId: newNodeId,
                previousState: {},
                nextState: {
                  id: newNodeId,
                  name: "MergedFromProposal",
                  label: "Entity",
                  properties: {},
                },
              },
            ],
          },
        },
      });

      await mergeGraphEditProposal(testDb, {
        proposalId: proposal.id,
        userId,
      });

      const node = await testDb.graphNode.findUnique({ where: { id: newNodeId } });
      expect(node?.topicSpaceId).toBe(topicSpace.id);
      expect(node?.name).toBe("MergedFromProposal");

      const updatedProposal = await testDb.graphEditProposal.findUnique({
        where: { id: proposal.id },
      });
      expect(updatedProposal?.status).toBe(ProposalStatus.MERGED);

      const history = await testDb.graphChangeHistory.findFirst({
        where: { recordId: topicSpace.id },
        orderBy: { createdAt: "desc" },
      });
      expect(history?.description).toContain("マージしました");

      const linkRows = await testDb.nodeLinkChangeHistory.count({
        where: { graphChangeHistoryId: history?.id },
      });
      expect(linkRows).toBeGreaterThan(0);
    } finally {
      await deleteTestTopicSpace(topicSpace.id);
    }
  });
});
