/* eslint-disable @typescript-eslint/no-explicit-any */
import { ChatOpenAI } from "@langchain/openai";
import nextEnv from "@next/env";
import {
  buildClassifyEdgeMotionUserPrompt,
  CLASSIFY_EDGE_MOTION_SYSTEM_PROMPT,
  buildMotionConfigFromCategory,
  EDGE_MOTION_LLM_MODEL,
  type EdgeMotionClassificationInput,
} from "../src/server/services/kg/edge-motion-classification";
import { normalizeCdtCategory } from "../src/server/services/kg/edge-motion-classification";
import { parseLlmClassificationJson } from "../src/server/services/kg/classify-edge-motion.service";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const SCENARIOS: EdgeMotionClassificationInput[] = [
  {
    edgeId: "e1",
    edgeType: "PARTICIPATED_IN",
    sourceName: "Hiroshi Sugimoto",
    sourceLabel: "Person",
    targetName: "Aichi Triennale 2025",
    targetLabel: "Event",
  },
  {
    edgeId: "e2",
    edgeType: "FEATURED_IN",
    sourceName: "Taku Hisamura",
    sourceLabel: "Person",
    targetName: "Aichi Triennale 2025",
    targetLabel: "Event",
  },
  {
    edgeId: "e3",
    edgeType: "ATTACKED",
    sourceName: "Soldier",
    sourceLabel: "Person",
    targetName: "Castle",
    targetLabel: "Place",
  },
  {
    edgeId: "e4",
    edgeType: "SAID",
    sourceName: "Yayoi Kusama",
    sourceLabel: "Person",
    targetName: "Press",
    targetLabel: "Person",
  },
  {
    edgeId: "e5",
    edgeType: "HOSTED",
    sourceName: "Aichi Arts Center",
    sourceLabel: "Organization",
    targetName: "Aichi Triennale 2025",
    targetLabel: "Event",
  },
  {
    edgeId: "e6",
    edgeType: "WALKED_TO",
    sourceName: "Naoki",
    sourceLabel: "Person",
    targetName: "Studio",
    targetLabel: "Place",
  },
  {
    edgeId: "e7",
    edgeType: "GAVE",
    sourceName: "Curator",
    sourceLabel: "Person",
    targetName: "Visitor",
    targetLabel: "Person",
  },
];

type Op = { type?: string; target?: string; role?: string; origin?: string };

function summarize(plan: any, predicate: string, sourceLabel?: string) {
  const ops = (plan?.recipe?.operations ?? []) as any[];
  const targets = new Set(ops.map((o) => o.target));
  const humanTargets = [...targets].filter((t) => t?.startsWith("human."));
  const rotations = ops.filter((o) => o.type === "rotation");
  const origins = new Set(rotations.map((o) => o.origin ?? "(none)"));
  const phaseOf = (target: string) =>
    rotations.find((o) => o.target === target)?.phase ?? 0;
  const gaitContralateral =
    humanTargets.includes("human.leftLeg") &&
    humanTargets.includes("human.rightArm")
      ? phaseOf("human.leftLeg") === phaseOf("human.rightArm") &&
        phaseOf("human.rightLeg") === phaseOf("human.leftArm") &&
        phaseOf("human.leftLeg") !== phaseOf("human.rightLeg")
      : null;
  const continuousOnceCount = ops.filter(
    (o) =>
      (o.type === "pathMovement" || o.type === "scale") &&
      o.repeat === "once" &&
      o.target?.startsWith("edge") === false &&
      !o.target?.startsWith("human."),
  ).length;
  return {
    predicate,
    sourceLabel,
    assetKind: plan?.asset?.kind,
    operationCount: ops.length,
    distinctTargets: targets.size,
    humanTargetCount: humanTargets.length,
    rotationOrigins: [...origins],
    playbackLoop: plan?.playback?.loop,
    playbackYoyo: plan?.playback?.yoyo,
    gaitContralateral,
    continuousOnceCount,
  };
}

function isRich(summary: ReturnType<typeof summarize>): boolean {
  if (summary.assetKind !== "human") return summary.operationCount >= 2;
  return summary.humanTargetCount >= 3 && summary.operationCount >= 3;
}

(async () => {
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY missing");
    process.exit(1);
  }
  const llm = new ChatOpenAI({ temperature: 0, model: EDGE_MOTION_LLM_MODEL });

  const userPrompt = buildClassifyEdgeMotionUserPrompt(SCENARIOS);
  const response = await llm.invoke([
    { role: "system", content: CLASSIFY_EDGE_MOTION_SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ]);
  const raw = response.content as string;
  console.log("===== LLM RAW =====\n", raw, "\n===== END =====");

  const parsed = parseLlmClassificationJson(raw);
  const items: any[] = parsed.classifications ?? [];
  for (const scenario of SCENARIOS) {
    const item = items.find((i) => i.edgeId === scenario.edgeId);
    if (!item) {
      console.warn(`[skip] no item for ${scenario.edgeId}`);
      continue;
    }
    const category = normalizeCdtCategory(item.cdtCategory, scenario.edgeType);
    const motionConfig = buildMotionConfigFromCategory(
      category,
      scenario.edgeType,
      item.motionPlan,
      {
        sourceLabel: scenario.sourceLabel,
        targetLabel: scenario.targetLabel,
        sourceName: scenario.sourceName,
        targetName: scenario.targetName,
      },
    );
    const plan = motionConfig.generativeMotionPlan;
    const summary = summarize(plan, scenario.edgeType, scenario.sourceLabel);
    const verdict = isRich(summary) ? "OK" : "POOR";
    console.log(
      `\n[${verdict}] ${scenario.edgeType} (${scenario.sourceLabel} -> ${scenario.targetLabel}) cat=${category}`,
    );
    console.log(JSON.stringify(summary, null, 2));
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
