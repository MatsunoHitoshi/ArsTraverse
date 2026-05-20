import { ChatOpenAI } from "@langchain/openai";
import type { PrismaClient } from "@prisma/client";
import type { EdgeMotionConfig } from "@/app/const/edge-cdt-animation";
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
};

async function classifyPredicateBatchWithLlm(
  llm: ChatOpenAI,
  batch: EdgeMotionClassificationInput[],
): Promise<LlmClassificationItem[]> {
  const userPrompt = buildClassifyEdgeMotionUserPrompt(batch);

  const response = await llm.invoke([
    { role: "system", content: CLASSIFY_EDGE_MOTION_SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ]);

  let jsonText = (response.content as string).trim();
  if (jsonText.includes("```json")) {
    jsonText =
      jsonText.split("```json")[1]?.split("```")[0]?.trim() ?? jsonText;
  } else if (jsonText.includes("```")) {
    jsonText = jsonText.split("```")[1]?.split("```")[0]?.trim() ?? jsonText;
  }

  const parsed = JSON.parse(jsonText) as {
    classifications?: LlmClassificationItem[];
  };

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

  const cachedMap = new Map<string, CachedAnnotation>(
    cached.map((c) => [
      c.edgeId,
      { edgeId: c.edgeId, motionConfig: c.motionConfig },
    ]),
  );

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
        const motionConfig = buildMotionConfigFromCategory(category);

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
      const motionConfig = buildMotionConfigFromCategory(category);

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
      return {
        edgeId: e.edgeId,
        motionConfig: annotation.motionConfig as EdgeMotionConfig,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r != null);

  return { results };
}
