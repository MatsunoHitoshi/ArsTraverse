import { createId } from "@paralleldrive/cuid2";
import { test, expect } from "@playwright/test";
import { DocumentType } from "@prisma/client";
import { createSourceDocumentWithGraph } from "@/server/services/kg/create-source-document-with-graph.service";
import { isIntegrationDatabaseReady } from "../helpers/db-ready";
import {
  deleteTestDocumentGraph,
  getOrCreateTestAdminUser,
  testDb,
} from "../helpers/test-db";

test.describe("scan SourceDocument fields", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(
    !isIntegrationDatabaseReady(),
    "DATABASE_URL が未設定、または DB に接続できません（supabase start 等を確認）",
  );

  test.afterAll(async () => {
    await testDb.$disconnect();
  });

  test("INPUT_SCAN と ocrMetadata / sourceImageUrl を保存できる", async () => {
    const user = await getOrCreateTestAdminUser();
    const nodeId = createId();
    const ocrMetadata = {
      engine: "tesseract.js",
      language: "jpn",
      confidence: 0.91,
      processedAt: new Date().toISOString(),
    };

    const { documentGraph, sourceDocument } =
      await createSourceDocumentWithGraph(
        { db: testDb, session: { user: { id: user.id } } },
        {
          name: "scan-source-document-test",
          url: "https://example.com/scan-text.txt",
          documentType: DocumentType.INPUT_SCAN,
          sourceImageUrl: "https://example.com/scan-image.jpg",
          ocrMetadata,
          dataJson: {
            nodes: [
              {
                id: nodeId,
                name: "ScanSeedNode",
                label: "Entity",
                properties: {},
              },
            ],
            relationships: [],
          },
        },
      );

    try {
      const saved = await testDb.sourceDocument.findUniqueOrThrow({
        where: { id: sourceDocument.id },
      });
      expect(saved.documentType).toBe(DocumentType.INPUT_SCAN);
      expect(saved.sourceImageUrl).toBe("https://example.com/scan-image.jpg");
      expect(saved.ocrMetadata).toEqual(ocrMetadata);
    } finally {
      await deleteTestDocumentGraph(documentGraph.id, sourceDocument.id);
    }
  });
});
