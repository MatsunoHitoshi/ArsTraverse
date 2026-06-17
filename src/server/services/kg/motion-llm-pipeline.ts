import type { ChatOpenAI } from "@langchain/openai";
import type { CdtCategory } from "@/app/const/edge-cdt-animation";
import type { EdgeMotionConfig } from "@/app/const/edge-cdt-animation";
import {
  GENERATIVE_MOTION_PLAN_RENDERER_VERSION,
  type MotionPlanContext,
} from "@/app/const/generative-motion-plan";
import {
  inferMotionStyle,
  mergeRunTemplateIntoPlan,
  validateHumanMotionPlan,
  type MotionIntent,
  type MotionPlanValidationResult,
  type MotionStyle,
} from "@/app/const/motion-intent";
import {
  buildMotionConfigWithValidation,
  buildStageAUserPrompt,
  buildStageBUserPrompt,
  inferCdtCategoryFromPredicate,
  normalizeCdtCategory,
  STAGE_A_SYSTEM_PROMPT,
  STAGE_B_DANCE_SYSTEM_PROMPT,
  STAGE_B_FIGHT_SYSTEM_PROMPT,
  STAGE_B_GENERAL_SYSTEM_PROMPT,
  STAGE_B_NON_HUMAN_SYSTEM_PROMPT,
  type EdgeMotionClassificationInput,
} from "./edge-motion-classification";
import {
  apiMotionIntent,
  stripNulls,
  withStageAStructuredOutput,
  withStageBStructuredOutput,
  type MotionStoryboardItem,
  type StageBOutput,
  type StageBSource,
} from "./motion-llm-schema";

export type PipelineEdgeResult = {
  edgeId: string;
  category: CdtCategory;
  motionConfig: EdgeMotionConfig & { category: CdtCategory };
  validation: MotionPlanValidationResult;
  stageA?: MotionStoryboardItem;
  stageBSource: StageBSource;
  rawMotionPlanProvided: boolean;
};

function toMotionPlanContext(
  edge: EdgeMotionClassificationInput,
): MotionPlanContext {
  return {
    sourceName: edge.sourceName,
    sourceLabel: edge.sourceLabel,
    targetName: edge.targetName,
    targetLabel: edge.targetLabel,
    directionHint: edge.directionHint,
  };
}

function stageBSystemPromptForStyle(
  style: MotionStyle,
  assetKind: MotionStoryboardItem["assetHint"]["kind"],
): string {
  if (assetKind !== "human") return STAGE_B_NON_HUMAN_SYSTEM_PROMPT;
  if (style === "fight") return STAGE_B_FIGHT_SYSTEM_PROMPT;
  if (style === "dance") return STAGE_B_DANCE_SYSTEM_PROMPT;
  return STAGE_B_GENERAL_SYSTEM_PROMPT;
}

function buildFallbackStoryboard(
  edge: EdgeMotionClassificationInput,
): MotionStoryboardItem {
  const category =
    inferCdtCategoryFromPredicate(edge.edgeType) ??
    normalizeCdtCategory(undefined, edge.edgeType);
  const style = inferMotionStyle(category, edge.edgeType);
  const directionHint = edge.directionHint ?? "auto";
  const isHuman =
    /person|human|character|artist|creator/i.test(
      `${edge.sourceLabel ?? ""} ${edge.targetLabel ?? ""}`,
    );

  return {
    edgeId: edge.edgeId,
    cdtCategory: category,
    motionIntent: apiMotionIntent({
      style,
      energy: 0.7,
      dominantSide: directionHint === "left" ? "left" : "right",
      directionHint,
    }),
    storyboard: `${edge.sourceName ?? "source"} と ${edge.targetName ?? "target"} の関係 (${edge.edgeType}) を表現する`,
    requiredParts: isHuman
      ? ["head", "body", style === "fight" ? "rightArm" : "leftArm"]
      : ["edgeGlyph"],
    assetHint: {
      kind: isHuman ? "human" : "abstract",
      assetId: style === "run" && isHuman ? "human-runner-right" : null,
    },
  };
}

export async function generateMotionStoryboard(
  llm: ChatOpenAI,
  edges: EdgeMotionClassificationInput[],
): Promise<MotionStoryboardItem[]> {
  const structured = withStageAStructuredOutput(llm);
  try {
    const output = stripNulls(
      await structured.invoke([
        { role: "system", content: STAGE_A_SYSTEM_PROMPT },
        { role: "user", content: buildStageAUserPrompt(edges) },
      ]),
    );
    const byId = new Map(output.items.map((item) => [item.edgeId, item]));
    return edges.map(
      (edge) =>
        byId.get(edge.edgeId) ?? {
          ...buildFallbackStoryboard(edge),
          edgeId: edge.edgeId,
        },
    );
  } catch (error) {
    console.error("[motionLlmPipeline.stageA.failed]", error);
    return edges.map((edge) => buildFallbackStoryboard(edge));
  }
}

export async function generateMotionKinematics(
  llm: ChatOpenAI,
  storyboard: MotionStoryboardItem,
  edge: EdgeMotionClassificationInput,
): Promise<StageBOutput | null> {
  const style = storyboard.motionIntent.style;
  const systemPrompt = stageBSystemPromptForStyle(
    style,
    storyboard.assetHint.kind,
  );
  const structured = withStageBStructuredOutput(llm);

  try {
    const output = stripNulls(
      await structured.invoke([
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: buildStageBUserPrompt(storyboard, {
            edgeId: edge.edgeId,
            predicate: edge.edgeType,
            directionHint: edge.directionHint,
            sourceName: edge.sourceName,
            sourceLabel: edge.sourceLabel,
            targetName: edge.targetName,
            targetLabel: edge.targetLabel,
          }),
        },
      ]),
    );
    return { ...output, edgeId: edge.edgeId };
  } catch (error) {
    console.error("[motionLlmPipeline.stageB.failed]", {
      edgeId: edge.edgeId,
      style,
      error,
    });
    return null;
  }
}

export function buildMotionPlanFromPipeline(
  storyboard: MotionStoryboardItem,
  edge: EdgeMotionClassificationInput,
  stageB: StageBOutput | null,
  stageBSource: StageBSource,
): PipelineEdgeResult {
  const context = toMotionPlanContext(edge);
  const category = normalizeCdtCategory(
    storyboard.cdtCategory,
    edge.edgeType,
  );

  let rawMotionPlan: unknown;
  if (stageBSource === "template") {
    const templateMerged = mergeRunTemplateIntoPlan(
      {
        version: "motion-plan/v1",
        rendererVersion: GENERATIVE_MOTION_PLAN_RENDERER_VERSION,
        semantic: {
          cdtCategory: category,
          predicate: edge.edgeType,
          confidence: 0.8,
          intent: storyboard.storyboard,
        },
        participants: {
          sourceRole: "actor",
          targetRole: "recipient",
          primaryTarget: "target",
          direction: "sourceToTarget",
        },
        asset: {
          kind: "human",
          assetId: "human-runner-right",
        },
        recipe: { preset: "bodyPartMotion", operations: [] },
        playback: {
          durationMs: 600,
          loop: true,
          yoyo: false,
          easing: "linear",
          intensity: 1,
        },
        motionIntent: stripNulls(
          storyboard.motionIntent,
        ) as MotionIntent,
      },
      edge.edgeType,
      context,
    );
    rawMotionPlan = templateMerged;
  } else if (stageB?.motionPlan) {
    rawMotionPlan = {
      ...stageB.motionPlan,
      semantic: {
        ...stageB.motionPlan.semantic,
        intent: storyboard.storyboard,
      },
      motionIntent: {
        ...storyboard.motionIntent,
        ...stageB.motionPlan.motionIntent,
      },
    };
  } else {
    rawMotionPlan = {
      motionIntent: storyboard.motionIntent,
      semantic: { intent: storyboard.storyboard, confidence: 0.5 },
      asset: storyboard.assetHint,
    };
  }

  const { motionConfig, validation } = buildMotionConfigWithValidation(
    category,
    edge.edgeType,
    rawMotionPlan,
    context,
  );

  return {
    edgeId: edge.edgeId,
    category,
    motionConfig,
    validation,
    stageA: storyboard,
    stageBSource,
    rawMotionPlanProvided:
      stageBSource === "llm" || stageBSource === "template",
  };
}

function stageBGroupKey(item: MotionStoryboardItem): string {
  return [
    item.motionIntent.style,
    item.cdtCategory,
    item.motionIntent.directionHint ?? "auto",
    item.assetHint.kind,
    item.assetHint.assetId ?? "",
  ].join("|");
}

export async function classifyPredicateBatchWithPipeline(
  llm: ChatOpenAI,
  batch: EdgeMotionClassificationInput[],
): Promise<PipelineEdgeResult[]> {
  const storyboards = await generateMotionStoryboard(llm, batch);

  const stageBCache = new Map<string, StageBOutput | null>();
  const stageBSourceCache = new Map<string, StageBSource>();

  for (const storyboard of storyboards) {
    const key = stageBGroupKey(storyboard);
    if (stageBSourceCache.has(key)) continue;

    const edge = batch.find((e) => e.edgeId === storyboard.edgeId)!;
    if (storyboard.motionIntent.style === "run") {
      stageBCache.set(key, null);
      stageBSourceCache.set(key, "template");
      continue;
    }

    const stageB = await generateMotionKinematics(llm, storyboard, edge);
    stageBCache.set(key, stageB);
    stageBSourceCache.set(key, stageB ? "llm" : "fallback");
  }

  return storyboards.map((storyboard) => {
    const edge = batch.find((e) => e.edgeId === storyboard.edgeId)!;
    const key = stageBGroupKey(storyboard);
    const stageBSource = stageBSourceCache.get(key) ?? "fallback";
    const stageB = stageBCache.get(key) ?? null;
    return buildMotionPlanFromPipeline(storyboard, edge, stageB, stageBSource);
  });
}

export async function generateMotionPlanForEdge(
  llm: ChatOpenAI,
  edge: EdgeMotionClassificationInput,
): Promise<PipelineEdgeResult> {
  const [storyboard] = await generateMotionStoryboard(llm, [edge]);
  const item = storyboard ?? buildFallbackStoryboard(edge);

  let stageBSource: StageBSource;
  let stageB: StageBOutput | null = null;

  if (item.motionIntent.style === "run") {
    stageBSource = "template";
  } else {
    stageB = await generateMotionKinematics(llm, item, edge);
    stageBSource = stageB ? "llm" : "fallback";
  }

  return buildMotionPlanFromPipeline(item, edge, stageB, stageBSource);
}
