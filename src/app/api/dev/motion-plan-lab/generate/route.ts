import { ChatOpenAI } from "@langchain/openai";
import { NextResponse } from "next/server";
import {
  buildClassifyEdgeMotionUserPrompt,
  buildMotionConfigFromCategory,
  CLASSIFY_EDGE_MOTION_SYSTEM_PROMPT,
  normalizeCdtCategory,
  type EdgeMotionClassificationInput,
} from "@/server/services/kg/edge-motion-classification";

type GenerateMotionPlanRequest = {
  edgeType?: string;
  sourceName?: string;
  sourceLabel?: string;
  targetName?: string;
  targetLabel?: string;
};

type LlmClassificationItem = {
  edgeId?: string;
  cdtCategory?: string;
  motionPlan?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim().slice(0, 160) : fallback;
}

function isClassificationItem(value: unknown): value is LlmClassificationItem {
  if (!isRecord(value)) return false;
  return (
    (value.edgeId == null || typeof value.edgeId === "string") &&
    (value.cdtCategory == null || typeof value.cdtCategory === "string")
  );
}

function extractJsonObjectText(raw: string): string {
  const fenced = raw.includes("```json")
    ? raw.split("```json")[1]?.split("```")[0]
    : raw.includes("```")
      ? raw.split("```")[1]?.split("```")[0]
      : raw;
  const text = (fenced ?? raw).trim();
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  return firstBrace >= 0 && lastBrace > firstBrace
    ? text.slice(firstBrace, lastBrace + 1)
    : text;
}

function parseMotionPlanLabLlmJson(raw: string): LlmClassificationItem[] {
  try {
    const parsed = JSON.parse(extractJsonObjectText(raw)) as unknown;
    if (!isRecord(parsed) || !Array.isArray(parsed.classifications)) {
      return [];
    }
    return parsed.classifications.filter(isClassificationItem);
  } catch {
    return [];
  }
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured." },
      { status: 400 },
    );
  }

  const body = (await request
    .json()
    .catch(() => ({}))) as GenerateMotionPlanRequest;
  const edge: EdgeMotionClassificationInput = {
    edgeId: "motion-plan-lab-edge",
    edgeType: cleanText(body.edgeType, "PARTICIPATED_IN").toUpperCase(),
    sourceName: cleanText(body.sourceName, "作家A"),
    sourceLabel: cleanText(body.sourceLabel, "Person"),
    targetName: cleanText(body.targetName, "イベントB"),
    targetLabel: cleanText(body.targetLabel, "Event"),
  };

  const llm = new ChatOpenAI({
    temperature: 0,
    model: "gpt-4o-mini",
  });

  const response = await llm.invoke([
    { role: "system", content: CLASSIFY_EDGE_MOTION_SYSTEM_PROMPT },
    { role: "user", content: buildClassifyEdgeMotionUserPrompt([edge]) },
  ]);

  const rawText = String(response.content ?? "");
  const item = parseMotionPlanLabLlmJson(rawText).find(
    (entry) => entry.edgeId === edge.edgeId,
  );
  const category = normalizeCdtCategory(item?.cdtCategory, edge.edgeType);
  const motionConfig = buildMotionConfigFromCategory(
    category,
    edge.edgeType,
    item?.motionPlan,
    {
      sourceName: edge.sourceName,
      sourceLabel: edge.sourceLabel,
      targetName: edge.targetName,
      targetLabel: edge.targetLabel,
    },
  );

  return NextResponse.json({
    edge,
    cdtCategory: category,
    rawText,
    rawMotionPlanProvided: item?.motionPlan != null,
    motionConfig,
    motionPlan: motionConfig.generativeMotionPlan,
  });
}
