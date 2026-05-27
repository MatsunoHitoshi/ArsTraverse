import { ChatOpenAI } from "@langchain/openai";
import type { PrismaClient } from "@prisma/client";
import type { EdgeMotionConfig } from "@/app/const/edge-cdt-animation";
import { GENERATIVE_MOTION_PLAN_RENDERER_VERSION } from "@/app/const/generative-motion-plan";
import {
  buildClassifyEdgeMotionUserPrompt,
  buildMotionConfigFromCategory,
  buildUniquePredicateBatches,
  CLASSIFY_EDGE_MOTION_SYSTEM_PROMPT,
  inferCdtCategoryFromPredicate,
  normalizeCdtCategory,
  type EdgeMotionClassificationInput,
} from "./edge-motion-classification";

export type ClassifyEdgeMotionInput = {
  topicSpaceId: string;
  edges: EdgeMotionClassificationInput[];
};

export type ClassifyEdgeMotionResult = {
  results: Array<{
    edgeId: string;
    motionConfig: EdgeMotionConfig;
  }>;
};

type CachedAnnotation = {
  edgeId: string;
  motionConfig: unknown;
};

type LlmClassificationItem = {
  edgeId?: string;
  cdtCategory?: string;
  motionPlan?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getCachedMotionPlanRendererVersion(
  motionConfig: unknown,
): number | null {
  if (!isRecord(motionConfig)) return null;
  const plan = motionConfig.generativeMotionPlan;
  if (!isRecord(plan)) return null;
  return typeof plan.rendererVersion === "number" ? plan.rendererVersion : null;
}

function isFreshMotionPlanCache(motionConfig: unknown): boolean {
  return (
    getCachedMotionPlanRendererVersion(motionConfig) ===
    GENERATIVE_MOTION_PLAN_RENDERER_VERSION
  );
}

function extractJsonObjectText(raw: string): string {
  let jsonText = raw.trim();
  if (jsonText.includes("```json")) {
    jsonText =
      jsonText.split("```json")[1]?.split("```")[0]?.trim() ?? jsonText;
  } else if (jsonText.includes("```")) {
    jsonText = jsonText.split("```")[1]?.split("```")[0]?.trim() ?? jsonText;
  }

  const firstBrace = jsonText.indexOf("{");
  const lastBrace = jsonText.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    jsonText = jsonText.slice(firstBrace, lastBrace + 1);
  }
  return jsonText;
}

function balanceJsonDelimiters(jsonText: string): string {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (const char of jsonText) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === "{") stack.push("}");
    if (char === "[") stack.push("]");
    if ((char === "}" || char === "]") && stack[stack.length - 1] === char) {
      stack.pop();
    }
  }

  return `${jsonText}${stack.reverse().join("")}`;
}

function repairMissingClassificationItemClosers(jsonText: string): string {
  return jsonText
    .replace(
      /("playback"\s*:\s*\{[^{}]*\}\s*\})(\s*),(?=\s*\{\s*"edgeId"\s*:)/g,
      "$1}$2,",
    )
    .replace(/("playback"\s*:\s*\{[^{}]*\}\s*\})(\s*)(?=\]\s*\}?$)/g, "$1}$2");
}

function repairLlmJsonText(jsonText: string): string {
  const repaired = jsonText
    .replace(/^\uFEFF/, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/([{,]\s*)([A-Za-z_$][\w$-]*)(\s*:)/g, '$1"$2"$3')
    .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_, value: string) =>
      JSON.stringify(value.replace(/\\"/g, '"')),
    );
  return balanceJsonDelimiters(
    repairMissingClassificationItemClosers(repaired),
  );
}

function parseJsonObject<T>(jsonText: string): T {
  return JSON.parse(jsonText) as T;
}

function extractBalancedJsonObjects(jsonText: string): string[] {
  const objects: string[] = [];
  const classificationsIndex = jsonText.indexOf('"classifications"');
  const arrayStart =
    classificationsIndex >= 0
      ? jsonText.indexOf("[", classificationsIndex)
      : jsonText.indexOf("[");
  if (arrayStart < 0) return objects;

  let index = arrayStart + 1;
  while (index < jsonText.length) {
    const objectStart = jsonText.indexOf("{", index);
    if (objectStart < 0) break;

    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let cursor = objectStart; cursor < jsonText.length; cursor += 1) {
      const char = jsonText[cursor];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;

      if (char === "{") depth += 1;
      if (char === "}") depth -= 1;
      if (depth === 0) {
        objects.push(jsonText.slice(objectStart, cursor + 1));
        index = cursor + 1;
        break;
      }
    }

    if (index <= objectStart) break;
  }

  return objects;
}

function parseRecoverableClassificationItems(
  jsonText: string,
): LlmClassificationItem[] {
  return extractBalancedJsonObjects(jsonText)
    .map((objectText) => {
      try {
        return parseJsonObject<LlmClassificationItem>(objectText);
      } catch {
        try {
          return parseJsonObject<LlmClassificationItem>(
            repairLlmJsonText(objectText),
          );
        } catch {
          return null;
        }
      }
    })
    .filter((item): item is LlmClassificationItem => item != null);
}

export function parseLlmClassificationJson(raw: string): {
  classifications?: LlmClassificationItem[];
} {
  const jsonText = extractJsonObjectText(raw);
  try {
    return parseJsonObject<{ classifications?: LlmClassificationItem[] }>(
      jsonText,
    );
  } catch (firstError) {
    const repaired = repairLlmJsonText(jsonText);
    try {
      const parsed = parseJsonObject<{
        classifications?: LlmClassificationItem[];
      }>(repaired);
      console.warn("[kg.classifyEdgeMotion.repairedLlmJson]", {
        reason:
          firstError instanceof Error ? firstError.message : String(firstError),
      });
      return parsed;
    } catch (repairError) {
      const recovered = parseRecoverableClassificationItems(repaired);
      if (recovered.length > 0) {
        console.warn(
          "[kg.classifyEdgeMotion.recoveredPartialLlmJson]",
          JSON.stringify({
            recoveredCount: recovered.length,
            reason:
              repairError instanceof Error
                ? repairError.message
                : String(repairError),
          }),
        );
        return { classifications: recovered };
      }

      console.error(
        "[kg.classifyEdgeMotion.unparseableLlmJson]",
        JSON.stringify({
          firstError:
            firstError instanceof Error
              ? firstError.message
              : String(firstError),
          repairError:
            repairError instanceof Error
              ? repairError.message
              : String(repairError),
          snippet: jsonText.slice(0, 1200),
        }),
      );
      throw firstError;
    }
  }
}

async function classifyPredicateBatchWithLlm(
  llm: ChatOpenAI,
  batch: EdgeMotionClassificationInput[],
): Promise<LlmClassificationItem[]> {
  const userPrompt = buildClassifyEdgeMotionUserPrompt(batch);

  const response = await llm.invoke([
    { role: "system", content: CLASSIFY_EDGE_MOTION_SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ]);

  const parsed = parseLlmClassificationJson(response.content as string);

  return parsed.classifications ?? [];
}

function resolveCategoryForEdge(
  edgeId: string,
  edgeType: string,
  llmItems: LlmClassificationItem[],
): ReturnType<typeof normalizeCdtCategory> {
  const llmItem = llmItems.find((item) => item.edgeId === edgeId);
  if (llmItem?.cdtCategory) {
    return normalizeCdtCategory(llmItem.cdtCategory, edgeType);
  }
  return (
    inferCdtCategoryFromPredicate(edgeType) ??
    normalizeCdtCategory(undefined, edgeType)
  );
}

function logGeneratedMotionPlan({
  source,
  topicSpaceId,
  edgeIds,
  representative,
  category,
  motionConfig,
  rawMotionPlanProvided,
}: {
  source: "llm" | "fallback";
  topicSpaceId: string;
  edgeIds: string[];
  representative: EdgeMotionClassificationInput;
  category: EdgeMotionConfig["category"];
  motionConfig: EdgeMotionConfig;
  rawMotionPlanProvided: boolean;
}) {
  const plan = motionConfig.generativeMotionPlan;
  if (!plan) return;

  console.info(
    "[kg.classifyEdgeMotion.motionPlan]",
    JSON.stringify(
      {
        source,
        topicSpaceId,
        edgeIds,
        representative: {
          edgeId: representative.edgeId,
          predicate: representative.edgeType,
          sourceName: representative.sourceName,
          sourceLabel: representative.sourceLabel,
          targetName: representative.targetName,
          targetLabel: representative.targetLabel,
        },
        cdtCategory: category,
        rendererVersion: plan.rendererVersion,
        rawMotionPlanProvided,
        preset: plan.recipe.preset,
        asset: plan.asset,
        participants: plan.participants,
        playback: plan.playback,
        operations: plan.recipe.operations,
      },
      null,
      2,
    ),
  );
}

/**
 * エッジ述語を CDT 8カテゴリに分類し、アニメーション設定を返す。
 * DB キャッシュを優先し、未キャッシュ分のみ LLM に問い合わせる（述語のみ送信）。
 * 同一述語は1回だけ LLM に送り、結果を全 edgeId に展開する。
 */
export async function classifyEdgeMotion(
  db: PrismaClient,
  input: ClassifyEdgeMotionInput,
): Promise<ClassifyEdgeMotionResult> {
  const { topicSpaceId, edges } = input;

  if (edges.length === 0) return { results: [] };

  const cached = await db.edgeMotionAnnotation.findMany({
    where: {
      topicSpaceId,
      edgeId: { in: edges.map((e) => e.edgeId) },
    },
  });

  const cachedMap = new Map<string, CachedAnnotation>();
  for (const annotation of cached) {
    if (isFreshMotionPlanCache(annotation.motionConfig)) {
      cachedMap.set(annotation.edgeId, {
        edgeId: annotation.edgeId,
        motionConfig: annotation.motionConfig,
      });
      continue;
    }

    console.info(
      "[kg.classifyEdgeMotion.motionPlanCacheStale]",
      JSON.stringify({
        topicSpaceId,
        edgeId: annotation.edgeId,
        cachedRendererVersion: getCachedMotionPlanRendererVersion(
          annotation.motionConfig,
        ),
        currentRendererVersion: GENERATIVE_MOTION_PLAN_RENDERER_VERSION,
      }),
    );
  }

  const uncachedEdges = edges.filter((e) => !cachedMap.has(e.edgeId));

  if (uncachedEdges.length > 0) {
    const llm = new ChatOpenAI({
      temperature: 0,
      model: "gpt-4o-mini",
    });

    const predicateBatches = buildUniquePredicateBatches(uncachedEdges);
    const edgeTypeById = new Map(
      uncachedEdges.map((e) => [e.edgeId, e.edgeType] as const),
    );

    for (const batch of predicateBatches) {
      const representatives = batch.map((g) => g.representative);

      let llmItems: LlmClassificationItem[] = [];
      try {
        llmItems = await classifyPredicateBatchWithLlm(llm, representatives);
      } catch (error) {
        console.error("Failed to parse CDT classification JSON", error);
      }

      for (const group of batch) {
        const { representative, edgeIds } = group;
        const category = resolveCategoryForEdge(
          representative.edgeId,
          representative.edgeType,
          llmItems,
        );
        const llmItem = llmItems.find(
          (item) => item.edgeId === representative.edgeId,
        );
        const rawMotionPlanProvided = llmItem?.motionPlan != null;
        const motionConfig = buildMotionConfigFromCategory(
          category,
          representative.edgeType,
          llmItem?.motionPlan,
          {
            sourceName: representative.sourceName,
            sourceLabel: representative.sourceLabel,
            targetName: representative.targetName,
            targetLabel: representative.targetLabel,
          },
        );
        logGeneratedMotionPlan({
          source: rawMotionPlanProvided ? "llm" : "fallback",
          topicSpaceId,
          edgeIds,
          representative,
          category,
          motionConfig,
          rawMotionPlanProvided,
        });

        for (const edgeId of edgeIds) {
          await db.edgeMotionAnnotation.upsert({
            where: {
              edgeId_topicSpaceId: {
                edgeId,
                topicSpaceId,
              },
            },
            create: {
              edgeId,
              topicSpaceId,
              cdtCategory: category,
              motionConfig,
            },
            update: {
              cdtCategory: category,
              motionConfig,
            },
          });

          cachedMap.set(edgeId, {
            edgeId,
            motionConfig,
          });
        }
      }
    }

    // LLM が返さなかった edgeId でも述語ヒューリスティックで保存
    for (const edge of uncachedEdges) {
      if (cachedMap.has(edge.edgeId)) continue;
      const edgeType = edgeTypeById.get(edge.edgeId) ?? edge.edgeType;
      const category = normalizeCdtCategory(undefined, edgeType);
      const motionConfig = buildMotionConfigFromCategory(
        category,
        edgeType,
        undefined,
        {
          sourceName: edge.sourceName,
          sourceLabel: edge.sourceLabel,
          targetName: edge.targetName,
          targetLabel: edge.targetLabel,
        },
      );
      logGeneratedMotionPlan({
        source: "fallback",
        topicSpaceId,
        edgeIds: [edge.edgeId],
        representative: edge,
        category,
        motionConfig,
        rawMotionPlanProvided: false,
      });

      await db.edgeMotionAnnotation.upsert({
        where: {
          edgeId_topicSpaceId: {
            edgeId: edge.edgeId,
            topicSpaceId,
          },
        },
        create: {
          edgeId: edge.edgeId,
          topicSpaceId,
          cdtCategory: category,
          motionConfig,
        },
        update: {
          cdtCategory: category,
          motionConfig,
        },
      });

      cachedMap.set(edge.edgeId, {
        edgeId: edge.edgeId,
        motionConfig,
      });
    }
  }

  const results = edges
    .map((e) => {
      const annotation = cachedMap.get(e.edgeId);
      if (!annotation) return null;
      const cachedMotionConfig = annotation.motionConfig as EdgeMotionConfig;
      const category = normalizeCdtCategory(
        cachedMotionConfig.category,
        e.edgeType,
      );
      const motionConfig = cachedMotionConfig.generativeMotionPlan
        ? cachedMotionConfig
        : buildMotionConfigFromCategory(category, e.edgeType, undefined, {
            sourceName: e.sourceName,
            sourceLabel: e.sourceLabel,
            targetName: e.targetName,
            targetLabel: e.targetLabel,
          });
      return {
        edgeId: e.edgeId,
        motionConfig,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r != null);

  return { results };
}
