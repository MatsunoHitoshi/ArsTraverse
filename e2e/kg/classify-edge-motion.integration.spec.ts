import { createId } from "@paralleldrive/cuid2";
import { test, expect } from "@playwright/test";
import { CDT_ANIMATION_MAP } from "@/app/const/edge-cdt-animation";
import { classifyEdgeMotion } from "@/server/services/kg/classify-edge-motion.service";
import { isIntegrationDatabaseReady } from "../helpers/db-ready";
import {
  createTestTopicSpaceWithAdmin,
  deleteTestTopicSpace,
  testDb,
} from "../helpers/test-db";

const hasOpenAiKey = Boolean(process.env.OPENAI_API_KEY);

test.describe("classifyEdgeMotion", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(
    !isIntegrationDatabaseReady(),
    "DATABASE_URL が未設定、または DB に接続できません（supabase start 等を確認）",
  );

  test.afterAll(async () => {
    await testDb.$disconnect();
  });

  test("DBキャッシュ済みエッジはLLMを呼ばず即座に motionConfig を返す", async () => {
    const { topicSpace } = await createTestTopicSpaceWithAdmin(
      "pw-edge-motion-cache",
    );
    const edgeId = createId();

    try {
      await testDb.edgeMotionAnnotation.create({
        data: {
          edgeId,
          topicSpaceId: topicSpace.id,
          cdtCategory: "PROPEL",
          motionConfig: {
            ...CDT_ANIMATION_MAP.PROPEL,
            category: "PROPEL",
          },
        },
      });

      const start = Date.now();
      const result = await classifyEdgeMotion(testDb, {
        topicSpaceId: topicSpace.id,
        edges: [{ edgeId, edgeType: "戦った" }],
      });
      const elapsed = Date.now() - start;

      expect(result.results).toHaveLength(1);
      const item = result.results[0];
      expect(item?.edgeId).toBe(edgeId);
      expect(item?.motionConfig.category).toBe("PROPEL");
      expect(item?.motionConfig.motionType).toBe("pulse-impact");
      expect(item?.motionConfig.color).toBe("#ef4444");

      // キャッシュヒットなら LLM 往復なしで数百 ms 以内に完了する想定
      expect(elapsed).toBeLessThan(3000);

      const rowCount = await testDb.edgeMotionAnnotation.count({
        where: { topicSpaceId: topicSpace.id, edgeId },
      });
      expect(rowCount).toBe(1);
    } finally {
      await deleteTestTopicSpace(topicSpace.id);
    }
  });

  test("複数エッジのうちキャッシュ済みと未キャッシュを混在させても結果をマージする", async () => {
    const { topicSpace } = await createTestTopicSpaceWithAdmin(
      "pw-edge-motion-mixed",
    );
    const cachedEdgeId = createId();
    const uncachedEdgeId = createId();

    try {
      await testDb.edgeMotionAnnotation.create({
        data: {
          edgeId: cachedEdgeId,
          topicSpaceId: topicSpace.id,
          cdtCategory: "SPEAK",
          motionConfig: {
            ...CDT_ANIMATION_MAP.SPEAK,
            category: "SPEAK",
          },
        },
      });

      if (!hasOpenAiKey) {
        const partial = await classifyEdgeMotion(testDb, {
          topicSpaceId: topicSpace.id,
          edges: [{ edgeId: cachedEdgeId, edgeType: "宣言した" }],
        });
        expect(partial.results).toHaveLength(1);
        expect(partial.results[0]?.motionConfig.category).toBe("SPEAK");
        return;
      }

      const result = await classifyEdgeMotion(testDb, {
        topicSpaceId: topicSpace.id,
        edges: [
          { edgeId: cachedEdgeId, edgeType: "宣言した" },
          { edgeId: uncachedEdgeId, edgeType: "移動した" },
        ],
      });

      expect(result.results.length).toBeGreaterThanOrEqual(1);
      const cached = result.results.find((r) => r.edgeId === cachedEdgeId);
      expect(cached?.motionConfig.category).toBe("SPEAK");

      const uncachedRow = await testDb.edgeMotionAnnotation.findUnique({
        where: {
          edgeId_topicSpaceId: {
            edgeId: uncachedEdgeId,
            topicSpaceId: topicSpace.id,
          },
        },
      });
      if (uncachedRow) {
        expect(
          CDT_ANIMATION_MAP[
            uncachedRow.cdtCategory as keyof typeof CDT_ANIMATION_MAP
          ],
        ).toBeDefined();
      }
    } finally {
      await deleteTestTopicSpace(topicSpace.id);
    }
  });

  test("未キャッシュの述語をLLMで分類してDBに保存する", async () => {
    test.skip(!hasOpenAiKey, "OPENAI_API_KEY が未設定のため LLM 分類テストをスキップ");

    const { topicSpace } = await createTestTopicSpaceWithAdmin(
      "pw-edge-motion-llm",
    );
    const edgeId = createId();

    try {
      const result = await classifyEdgeMotion(testDb, {
        topicSpaceId: topicSpace.id,
        edges: [{ edgeId, edgeType: "攻撃した" }],
      });

      expect(result.results).toHaveLength(1);
      const item = result.results[0];
      expect(item?.edgeId).toBe(edgeId);
      expect(
        ["PTRANS", "ATRANS", "PROPEL", "MOVE", "INGEST", "EXPEL", "SPEAK", "MENTAL"],
      ).toContain(item?.motionConfig.category);

      const saved = await testDb.edgeMotionAnnotation.findUnique({
        where: {
          edgeId_topicSpaceId: { edgeId, topicSpaceId: topicSpace.id },
        },
      });
      expect(saved).not.toBeNull();
      expect(saved?.cdtCategory).toBe(item?.motionConfig.category);
    } finally {
      await deleteTestTopicSpace(topicSpace.id);
    }
  });
});
