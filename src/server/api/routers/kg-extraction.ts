import { publicProcedure } from "../trpc";
import { writeLocalFileFromUrl } from "@/app/_utils/sys/file";
import { textInspect } from "@/app/_utils/text/text-inspector";
import { dataDisambiguation } from "@/app/_utils/kg/data-disambiguation";
import type { Extractor } from "@/server/lib/extractors/base";
import { AssistantsApiExtractor } from "@/server/lib/extractors/assistants";
import { LangChainExtractor } from "@/server/lib/extractors/langchain";
import { IterativeGraphExtractor } from "@/server/lib/extractors/iterative";
import { formGraphDataForFrontend } from "@/app/_utils/kg/frontend-properties";
import { completeTranslateProperties } from "@/app/_utils/kg/node-name-translation";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage } from "@langchain/core/messages";
import type { TextChunk } from "@/server/lib/extractors/base";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import {
  ExtractInputSchema,
  AnalyzeTextStructureInputSchema,
  ConvertToEdgeTypeInputSchema,
  TestInspectInputSchema,
  ExtractPhase1InputSchema,
  ExtractPhase2InputSchema,
  FinalizeGraphInputSchema,
  PerformOCRInputSchema,
} from "../schemas/knowledge-graph";

export const extractionProcedures = {
  performOCR: publicProcedure
    .input(PerformOCRInputSchema)
    .mutation(async ({ input }) => {
      const { fileUrl } = input;

      const localFilePath = await writeLocalFileFromUrl(fileUrl, "input.pdf");
      let tempDir: string | null = null;

      try {
        const { createWorker } = await import("tesseract.js");

        tempDir = await fs.promises.mkdtemp(
          path.join(os.tmpdir(), "ocr-"),
        );

        const execFileAsync = promisify(execFile);
        try {
          await execFileAsync(
            "pdftocairo",
            ["-png", "-scale-to", "1024", localFilePath, "page"],
            { cwd: tempDir },
          );
        } catch (pdftocairoErr) {
          const msg =
            (pdftocairoErr as NodeJS.ErrnoException).code === "ENOENT"
              ? "pdftocairo が見つかりません。Poppler をインストールしてください（例: brew install poppler）"
              : String(pdftocairoErr);
          throw new Error(msg);
        }

        const entries = await fs.promises.readdir(tempDir);
        const pageFiles = entries
          .filter((f) => f.startsWith("page-") && f.endsWith(".png"))
          .sort(
            (a, b) =>
              parseInt(a.replace("page-", "").replace(".png", ""), 10) -
              parseInt(b.replace("page-", "").replace(".png", ""), 10),
          );

        const extractedDocs: { pageContent: string; metadata: { source: string; page: number } }[] = [];
        const worker = await createWorker("jpn+eng");

        for (let i = 0; i < pageFiles.length; i++) {
          const name = pageFiles[i];
          if (!name) continue;
          const filePath = path.join(tempDir, name);
          const buffer = await fs.promises.readFile(filePath);
          const {
            data: { text },
          } = await worker.recognize(buffer);

          if (text.trim()) {
            extractedDocs.push({
              pageContent: text,
              metadata: { source: fileUrl, page: i + 1 },
            });
          }
        }

        await worker.terminate();

        return {
          data: { documents: extractedDocs },
        };
      } catch (error) {
        console.error("OCR Error:", error);
        return {
          data: { documents: [], error: String(error) },
        };
      } finally {
        if (tempDir) {
          await fs.promises.rm(tempDir, { recursive: true }).catch((err: unknown) => { console.error("OCR temp cleanup:", err); });
        }
      }
    }),

  finalizeGraph: publicProcedure
    .input(FinalizeGraphInputSchema)
    .mutation(async ({ input }) => {
      const { nodes, relationships } = input;

      try {
        const normalizedNodesAndRelationships = {
          nodes: nodes.map((n) => ({
            id: n.id,
            name: n.name,
            label: n.label,
            properties: n.properties ?? {},
            documentGraphId: null,
            topicSpaceId: null,
            createdAt: null,
            updatedAt: null,
            deletedAt: null,
          })),
          relationships: relationships.map((r) => ({
            id: r.id,
            type: r.type,
            properties: r.properties ?? {},
            fromNodeId: r.sourceId,
            toNodeId: r.targetId,
            documentGraphId: null,
            topicSpaceId: null,
            createdAt: null,
            updatedAt: null,
            deletedAt: null,
          })),
        };

        const disambiguatedNodesAndRelationships = dataDisambiguation(
          normalizedNodesAndRelationships,
        );
        const graphDocument = await completeTranslateProperties(
          disambiguatedNodesAndRelationships,
        );
        return {
          data: {
            graph: formGraphDataForFrontend(graphDocument),
          },
        };
      } catch (error) {
        console.error("Graph finalization failed:", error);
        return {
          data: { graph: null, error: "グラフ構築エラー" },
        };
      }
    }),

  extractPhase1: publicProcedure
    .input(ExtractPhase1InputSchema)
    .mutation(async ({ input }) => {
      const { documents, schema, additionalPrompt, customMappingRules } = input;

      try {
        const extractor = new IterativeGraphExtractor();
        const nodesAndRelationships = await extractor.extractPhase1(documents, {
          localFilePath: "", // Not used in phase 1 direct call
          isPlaneTextMode: false, // Not used
          schema,
          additionalPrompt,
          customMappingRules,
        });

        return {
          data: {
            nodes: nodesAndRelationships.nodes,
            relationships: nodesAndRelationships.relationships,
          },
        };
      } catch (error) {
        console.error("Phase 1 extraction failed:", error);
        return {
          data: {
            nodes: [],
            relationships: [],
            error: "Phase 1 extraction failed",
          },
        };
      }
    }),

  extractPhase2: publicProcedure
    .input(ExtractPhase2InputSchema)
    .mutation(async ({ input }) => {
      const {
        documents,
        contextualInfo,
        schema,
        additionalPrompt,
        customMappingRules,
      } = input;

      try {
        const extractor = new IterativeGraphExtractor();
        const nodesAndRelationships = await extractor.extractPhase2(
          documents,
          contextualInfo,
          {
            localFilePath: "",
            isPlaneTextMode: false,
            schema,
            additionalPrompt,
            customMappingRules,
          },
        );

        return {
          data: {
            nodes: nodesAndRelationships.nodes,
            relationships: nodesAndRelationships.relationships,
          },
        };
      } catch (error) {
        console.error("Phase 2 extraction failed:", error);
        return {
          data: {
            nodes: [],
            relationships: [],
            error: "Phase 2 extraction failed",
          },
        };
      }
    }),

  analyzeTextStructure: publicProcedure
    .input(AnalyzeTextStructureInputSchema)
    .mutation(async ({ input }) => {
      const { sampleText } = input;

      try {
        const llm = new ChatOpenAI({
          temperature: 0.0,
          model: "gpt-4o-mini",
          maxTokens: 2000,
        });

        const prompt = `Break down the following text into semantic chunks (segments). For each chunk, provide the text content, position information, and a recommended role in the knowledge graph (node, node property, edge property, or ignore).

Text: "${sampleText}"

Output format (JSON):
{
  "chunks": [
    {
      "text": "chunk text",
      "type": "chunk type (e.g., date, category, event, location, description, etc.)",
      "startIndex": start position (character count),
      "endIndex": end position (character count),
      "suggestedRole": "node" | "node_property" | "edge_property" | "edge" | "ignore"
    }
  ]
}

Important formatting rules:
- Node labels MUST always be in English PascalCase (e.g., Person, Event, Location, Organization)
- Edge types MUST always be in UPPER_SNAKE_CASE (e.g., HAS_ROOMMATE, WORKS_AT, OCCURRED_ON, LOCATED_IN)
- The "type" field should reflect the semantic category of the chunk, not the formatting

Guidelines:
- Split the text into semantically meaningful units
- Separate different types of information (dates, locations, categories, event names, etc.) into different chunks
- suggestedRole should indicate how the information should be treated in the knowledge graph:
  - "node": Information that should be treated as an independent node (e.g., event names, location names, subjects or objects in sentences). The type should be in PascalCase English.
  - "node_property": Information that should be treated as a node property (e.g., descriptions, details)
  - "edge_property": Information that should be treated as a relationship (edge) property (e.g., dates, occurrence times, durations)
  - "edge": Information that determines the relationship type (e.g., categories, keywords indicating relationship types, predicates in sentences). The type should be in UPPER_SNAKE_CASE English.
  - "ignore": Information that should not be included in the graph`;

        const response = await llm.invoke([new HumanMessage(prompt)]);
        const responseText = response.content as string;

        // JSONを抽出（マークダウンコードブロックからも抽出可能）
        let jsonText = responseText.trim();
        if (jsonText.includes("```json")) {
          jsonText =
            jsonText.split("```json")[1]?.split("```")[0]?.trim() ?? jsonText;
        } else if (jsonText.includes("```")) {
          jsonText =
            jsonText.split("```")[1]?.split("```")[0]?.trim() ?? jsonText;
        }

        const parsed = JSON.parse(jsonText) as { chunks: TextChunk[] };

        return {
          data: {
            chunks: parsed.chunks,
          },
        };
      } catch (error) {
        console.error("Text structure analysis error:", error);
        return {
          data: {
            chunks: [],
            error: `テキスト解析エラー: ${String(error)}`,
          },
        };
      }
    }),

  convertToEdgeType: publicProcedure
    .input(ConvertToEdgeTypeInputSchema)
    .mutation(async ({ input }) => {
      const { text } = input;

      try {
        const llm = new ChatOpenAI({
          temperature: 0.0,
          model: "gpt-4o-mini",
          maxTokens: 500,
        });

        const prompt = `Convert the following text to an English UPPER_SNAKE_CASE relationship type for a knowledge graph.

Input text: "${text}"

Requirements:
1. If the text is in Japanese or any other non-English language, translate it to English first
2. Convert the English text to UPPER_SNAKE_CASE format
3. Use clear, descriptive relationship type names (e.g., HAS_ROOMMATE, WORKS_AT, OCCURRED_ON, LOCATED_IN)
4. Remove any special characters, spaces, or punctuation
5. Use underscores to separate words
6. Return ONLY the converted text in UPPER_SNAKE_CASE format, without any explanation or additional text

Examples:
- "ルームメイト" → "HAS_ROOMMATE"
- "音楽" → "MUSIC" or "IN_CATEGORY"
- "happened on" → "HAPPENED_ON"
- "works at" → "WORKS_AT"
- "カテゴリ" → "IN_CATEGORY" or "HAS_CATEGORY"

Output:`;

        const response = await llm.invoke([new HumanMessage(prompt)]);
        const responseText = (response.content as string).trim();

        // 余分な説明やマークダウンを除去
        let edgeType = responseText
          .replace(/```[\s\S]*?```/g, "") // コードブロックを除去
          .replace(/^[^A-Z_]*/, "") // 最初の非大文字・アンダースコア文字を除去
          .replace(/[^A-Z_]*$/, "") // 最後の非大文字・アンダースコア文字を除去
          .trim();

        // 行の最初のUPPER_SNAKE_CASEを抽出
        const match = edgeType.match(/^[A-Z][A-Z0-9_]*/);
        if (match) {
          edgeType = match[0];
        }

        // 空の場合は元のテキストを大文字に変換して返す（フォールバック）
        if (!edgeType || edgeType.length === 0) {
          edgeType = text
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, "_")
            .replace(/_+/g, "_")
            .replace(/^_|_$/g, "");
        }

        return {
          data: {
            edgeType,
          },
        };
      } catch (error) {
        console.error("Edge type conversion error:", error);
        // エラー時はフォールバック処理
        const fallbackEdgeType = text
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, "_")
          .replace(/_+/g, "_")
          .replace(/^_|_$/g, "");
        return {
          data: {
            edgeType: fallbackEdgeType || "RELATED_TO",
          },
        };
      }
    }),

  extractKG: publicProcedure
    .input(ExtractInputSchema)
    .mutation(async ({ input }) => {
      const {
        fileUrl,
        extractMode,
        isPlaneTextMode,
        additionalPrompt,
        customMappingRules,
      } = input;

      const localFilePath = await writeLocalFileFromUrl(
        fileUrl,
        `input.${isPlaneTextMode ? "txt" : "pdf"}`,
      );

      // SchemaExample: Nodes: [Person {age: integer, name: string}] Relationships: [Person, roommate, Person]
      // const schema = `
      // Nodes: [Artist {name: string, birthYear: integer}], [Museum {name: string, builtAt: integer}], [Curator {name: string, birthYear: integer}], [Exhibition {title: string, heldAt: integer}], [Critic {name: string, birthYear: integer}]
      // Relationships: [Artist, join, Exhibition], [Curator, direction, Exhibition], [Museum, host, Exhibition], [Critic, mention ,Artist]
      // `;
      const schema = {
        allowedNodes: [],
        allowedRelationships: [],
      };

      try {
        console.log("type: ", extractMode);
        let extractor: Extractor;
        if (extractMode === "iterative") {
          extractor = new IterativeGraphExtractor();
        } else if (extractMode === "langChain") {
          extractor = new LangChainExtractor();
        } else {
          extractor = new AssistantsApiExtractor();
        }

        const nodesAndRelationships = await extractor.extract({
          localFilePath,
          isPlaneTextMode,
          schema,
          additionalPrompt,
          customMappingRules,
        });

        if (!nodesAndRelationships) {
          return {
            data: { graph: null, error: "グラフ抽出エラー" },
          };
        }

        const normalizedNodesAndRelationships = {
          ...nodesAndRelationships,
          nodes: nodesAndRelationships.nodes.map((n) => ({
            id: n.id,
            name: n.name,
            label: n.label,
            properties: n.properties ?? {},
            documentGraphId: null,
            topicSpaceId: null,
            createdAt: null,
            updatedAt: null,
            deletedAt: null,
          })),
          relationships: nodesAndRelationships.relationships.map((r) => ({
            id: r.id,
            type: r.type,
            properties: r.properties ?? {},
            fromNodeId: r.sourceId,
            toNodeId: r.targetId,
            documentGraphId: null,
            topicSpaceId: null,
            createdAt: null,
            updatedAt: null,
            deletedAt: null,
          })),
        };
        const disambiguatedNodesAndRelationships = dataDisambiguation(
          normalizedNodesAndRelationships,
        );
        const graphDocument = await completeTranslateProperties(
          disambiguatedNodesAndRelationships,
        );
        return {
          data: {
            graph: formGraphDataForFrontend(graphDocument),
          },
        };
      } catch (error) {
        return {
          data: { graph: null, error: "グラフ抽出エラー" },
        };
      }
    }),

  textInspect: publicProcedure
    .input(TestInspectInputSchema)
    .mutation(async ({ input }) => {
      const { fileUrl, isPlaneTextMode } = input;

      const localFilePath = await writeLocalFileFromUrl(
        fileUrl,
        `input.${isPlaneTextMode ? "txt" : "pdf"}`,
      );

      try {
        const documents = await textInspect(localFilePath, isPlaneTextMode);
        console.log("documents: ", documents);
        return {
          data: { documents: documents },
        };
      } catch (error) {
        return {
          data: {
            documents: null,
            error: `テキスト検査エラー: ${String(error)}`,
          },
        };
      }
    }),
};
