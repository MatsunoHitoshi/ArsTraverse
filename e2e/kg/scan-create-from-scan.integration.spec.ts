import { test, expect } from "@playwright/test";
import { createFromScan } from "@/server/services/scan/create-from-scan.service";
import { isIntegrationDatabaseReady } from "../helpers/db-ready";
import {
  deleteTestDocumentGraph,
  getOrCreateTestAdminUser,
  testDb,
} from "../helpers/test-db";

const hasOpenAiKey = Boolean(process.env.OPENAI_API_KEY);
const hasSupabase =
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

test.describe("createFromScan", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(
    !isIntegrationDatabaseReady(),
    "DATABASE_URL が未設定、または DB に接続できません（supabase start 等を確認）",
  );

  test.afterAll(async () => {
    await testDb.$disconnect();
  });

  test("OCR テキストから SourceDocument + Graph を作成する", async () => {
    test.skip(!hasOpenAiKey, "OPENAI_API_KEY が未設定のため LLM 抽出テストをスキップ");
    test.skip(!hasSupabase, "Supabase 環境変数が未設定のため upload テストをスキップ");

    const user = await getOrCreateTestAdminUser();
    const plainText =
      "村上隆は1962年に生まれ、当代美術の代表的なアーティストとして知られている。";

    const result = await createFromScan(
      { db: testDb, session: { user: { id: user.id } } },
      {
        name: `scan-create-from-scan-${Date.now()}`,
        plainText,
        ocrMetadata: {
          engine: "tesseract.js",
          language: "jpn",
        },
      },
    );

    try {
      expect(result.sourceDocument.documentType).toBe("INPUT_SCAN");
      expect(result.sourceDocument.url).toContain("http");
      expect(result.graph.dataJson.nodes.length).toBeGreaterThan(0);
      expect(Array.isArray(result.matchCandidates)).toBe(true);
    } finally {
      await deleteTestDocumentGraph(
        result.graph.id,
        result.sourceDocument.id,
      );
    }
  });
});
