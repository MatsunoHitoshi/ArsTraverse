import { test, expect } from "@playwright/test";
import {
  buildStageAUserPrompt,
  buildStageBUserPrompt,
  STAGE_A_SYSTEM_PROMPT,
  STAGE_B_FIGHT_SYSTEM_PROMPT,
} from "@/server/services/kg/edge-motion-classification";
import { buildMotionPlanFromPipeline } from "@/server/services/kg/motion-llm-pipeline";
import {
  MotionStoryboardItemSchema,
  NULLABLE_OPERATION_FIELDS,
  StageAOutputSchema,
  StageBOutputSchema,
  apiMotionIntent,
  getEdgeMotionPipelineVersion,
} from "@/server/services/kg/motion-llm-schema";

test.describe("motion-llm-pipeline unit", () => {
  test("Stage A prompt contains storyboard instruction, not operations", () => {
    const prompt = buildStageAUserPrompt([
      {
        edgeId: "e1",
        edgeType: "ATTACKED",
        directionHint: "right",
        sourceName: "武士A",
        sourceLabel: "Person",
        targetName: "武士B",
        targetLabel: "Person",
      },
    ]);
    expect(prompt).toContain("storyboard");
    expect(prompt).not.toContain("fromDegrees");
    expect(STAGE_A_SYSTEM_PROMPT).toContain("Do NOT output numeric angles");
  });

  test("Stage B fight prompt forbids keyframes", () => {
    expect(STAGE_B_FIGHT_SYSTEM_PROMPT).toContain("Do NOT use keyframes");
    const storyboard = MotionStoryboardItemSchema.parse({
      edgeId: "e1",
      cdtCategory: "PROPEL",
      motionIntent: apiMotionIntent({
        style: "fight",
        energy: 0.9,
        dominantSide: "right",
        directionHint: "right",
      }),
      storyboard: "武士Aが正拳突きで武士Bを攻撃する",
      requiredParts: ["rightArm", "body", "head", "edgeGlyph"],
      assetHint: { kind: "human", assetId: "human-fighter-right" },
    });
    const userPrompt = buildStageBUserPrompt(storyboard, {
      edgeId: "e1",
      predicate: "ATTACKED",
      directionHint: "right",
      sourceName: "武士A",
      sourceLabel: "Person",
      targetName: "武士B",
      targetLabel: "Person",
    });
    expect(userPrompt).toContain("武士Aが正拳突き");
    expect(userPrompt).toContain('"style":"fight"');
  });

  test("Stage A schema parses minimal valid output", () => {
    const parsed = StageAOutputSchema.parse({
      items: [
        {
          edgeId: "e1",
          cdtCategory: "MOVE",
          motionIntent: apiMotionIntent({
            style: "run",
            directionHint: "right",
          }),
          storyboard: "作家がイベントへ走る",
          requiredParts: ["leftLeg", "rightLeg", "body"],
          assetHint: { kind: "human", assetId: "human-runner-right" },
        },
      ],
    });
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]?.motionIntent.style).toBe("run");
  });

  test("run style routes to template merge with keyframes", () => {
    const storyboard = MotionStoryboardItemSchema.parse({
      edgeId: "run-edge",
      cdtCategory: "MOVE",
      motionIntent: apiMotionIntent({
        style: "run",
        directionHint: "right",
      }),
      storyboard: "右向きに走る",
      requiredParts: ["leftLeg", "rightLeg"],
      assetHint: { kind: "human", assetId: "human-runner-right" },
    });
    const edge = {
      edgeId: "run-edge",
      edgeType: "PARTICIPATED_IN",
      sourceName: "作家A",
      sourceLabel: "Person",
      targetName: "イベントB",
      targetLabel: "Event",
      directionHint: "right" as const,
    };
    const result = buildMotionPlanFromPipeline(storyboard, edge, null, "template");
    expect(result.stageBSource).toBe("template");
    expect(result.validation.ok).toBe(true);
    expect(result.motionConfig.generativeMotionPlan?.asset.assetId).toBe(
      "human-runner-right",
    );
    const hasKeyframes = result.motionConfig.generativeMotionPlan?.recipe.operations.some(
      (op) => op.type === "rotation" && op.keyframes != null,
    );
    expect(hasKeyframes).toBe(true);
  });

  test("fight Stage B failure falls back with validation ok", () => {
    const storyboard = MotionStoryboardItemSchema.parse({
      edgeId: "fight-edge",
      cdtCategory: "PROPEL",
      motionIntent: apiMotionIntent({
        style: "fight",
        dominantSide: "right",
        directionHint: "right",
      }),
      storyboard: "突きを繰り出す",
      requiredParts: ["rightArm", "body"],
      assetHint: { kind: "human", assetId: null },
    });
    const edge = {
      edgeId: "fight-edge",
      edgeType: "ATTACKED",
      sourceName: "武士A",
      sourceLabel: "Person",
      targetName: "武士B",
      targetLabel: "Person",
      directionHint: "right" as const,
    };
    const result = buildMotionPlanFromPipeline(storyboard, edge, null, "fallback");
    expect(result.stageBSource).toBe("fallback");
    expect(result.validation.ok).toBe(true);
    expect(
      result.motionConfig.generativeMotionPlan?.recipe.operations.length,
    ).toBeGreaterThanOrEqual(3);
  });

  test("Stage B schema accepts fight operations with timing", () => {
    const parsed = StageBOutputSchema.parse({
      edgeId: "e1",
      motionPlan: {
        version: "motion-plan/v1",
        rendererVersion: 8,
        semantic: { intent: "punch", confidence: 0.9 },
        participants: {
          sourceRole: "actor",
          targetRole: "recipient",
          primaryTarget: "target",
          direction: "sourceToTarget",
        },
        asset: { kind: "human", assetId: "human-fighter-right", requiredParts: null },
        recipe: {
          preset: "impactMotion",
          operations: [
            {
              type: "rotation",
              target: "human.head",
              degrees: 6,
              fromDegrees: -5,
              toDegrees: 7,
              origin: "neck",
              role: "anticipation",
              timing: { start: 0, duration: 0.18 },
              repeat: "yoyo",
              easing: null,
              phase: null,
            },
            {
              type: "rotation",
              target: "human.rightArm",
              degrees: 52,
              fromDegrees: -30,
              toDegrees: 52,
              origin: "shoulder",
              role: "action",
              timing: { start: 0.16, duration: 0.24 },
              repeat: "yoyo",
              easing: "impact",
              phase: null,
            },
            {
              type: "scale",
              target: "edgeGlyph",
              from: 0.78,
              to: 1.42,
              role: "effect",
              timing: { start: 0.22, duration: 0.2 },
              repeat: "yoyo",
              easing: "impact",
              phase: null,
            },
          ],
        },
        playback: {
          durationMs: 1400,
          delayMs: null,
          loop: true,
          yoyo: true,
          easing: "easeInOut",
          intensity: 0.88,
        },
        motionIntent: apiMotionIntent({ style: "fight" }),
      },
    });
    expect(parsed.motionPlan.recipe.operations).toHaveLength(3);
    expect(NULLABLE_OPERATION_FIELDS.role).toBeNull();
  });

  test("getEdgeMotionPipelineVersion respects env override", () => {
    const prev = process.env.EDGE_MOTION_PIPELINE_VERSION;
    process.env.EDGE_MOTION_PIPELINE_VERSION = "1";
    expect(getEdgeMotionPipelineVersion()).toBe(1);
    process.env.EDGE_MOTION_PIPELINE_VERSION = "2";
    expect(getEdgeMotionPipelineVersion()).toBe(2);
    process.env.EDGE_MOTION_PIPELINE_VERSION = prev;
  });
});
