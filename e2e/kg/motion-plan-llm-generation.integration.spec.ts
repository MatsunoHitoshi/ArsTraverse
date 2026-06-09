import { test, expect } from "@playwright/test";
import { normalizeGenerativeMotionPlan } from "@/app/const/generative-motion-plan";
import { validateHumanMotionPlan } from "@/app/const/motion-intent";
import { MOTION_LAB_SCENARIOS } from "./motion-scenarios";

const hasOpenAiKey = Boolean(process.env.OPENAI_API_KEY);
const BASE_URL = process.env.MOTION_LAB_BASE_URL ?? "http://localhost:3000";

type LlmApiResponse = {
  pipelineVersion?: number;
  stageA?: { storyboard?: string; motionIntent?: { style?: string } };
  stageB?: { source?: string; rawMotionPlanProvided?: boolean };
  cdtCategory?: string;
  motionPlan?: unknown;
  validation?: { ok: boolean; errors: unknown[]; warnings: unknown[] };
  rawMotionPlanProvided?: boolean;
};

test.describe("motion-plan-lab LLM generation API", () => {
  test.skip(!hasOpenAiKey, "OPENAI_API_KEY が未設定のためスキップ");

  for (const scenario of MOTION_LAB_SCENARIOS) {
    test(`generates valid plan for ${scenario.id}`, async ({ request }, testInfo) => {
      const response = await request.post(`${BASE_URL}/api/dev/motion-plan-lab/generate`, {
        data: {
          edgeType: scenario.predicate,
          sourceName: scenario.sourceName,
          sourceLabel: scenario.sourceLabel,
          targetName: scenario.targetName,
          targetLabel: scenario.targetLabel,
          directionHint: scenario.directionHint,
        },
        timeout: 120_000,
      });

      test.skip(
        response.status() === 404,
        "dev server or API route not available",
      );

      expect(response.ok()).toBeTruthy();
      const json = (await response.json()) as LlmApiResponse;

      await testInfo.attach(`${scenario.id}-response.json`, {
        body: JSON.stringify(json, null, 2),
        contentType: "application/json",
      });

      expect(json.motionPlan).toBeTruthy();

      if (json.pipelineVersion === 2) {
        expect(json.stageA?.storyboard?.length).toBeGreaterThan(0);
        expect(json.stageB?.source).toBeTruthy();
      }

      const plan = normalizeGenerativeMotionPlan(
        json.motionPlan,
        scenario.expectedCategory,
        scenario.predicate,
        {
          sourceName: scenario.sourceName,
          sourceLabel: scenario.sourceLabel,
          targetName: scenario.targetName,
          targetLabel: scenario.targetLabel,
          directionHint: scenario.directionHint,
        },
      );

      expect(plan.version).toBe("motion-plan/v1");
      expect(plan.recipe.operations.length).toBeGreaterThanOrEqual(3);
      expect(plan.recipe.operations.length).toBeLessThanOrEqual(16);

      const validation =
        json.validation ?? validateHumanMotionPlan(plan, {
          directionHint: scenario.directionHint,
        });
      expect(validation.ok).toBe(true);

      if (scenario.expectedStyle === "run" && plan.asset.kind === "human") {
        expect(
          plan.recipe.operations.some((op) => op.target.startsWith("human.")),
        ).toBe(true);
        if (json.pipelineVersion === 2) {
          expect(json.stageB?.source).toBe("template");
          const hasRunKeyframes = plan.recipe.operations.some(
            (op) => op.type === "rotation" && op.keyframes != null,
          );
          expect(hasRunKeyframes).toBe(true);
        }
      }

      if (scenario.expectedStyle === "fight" && plan.asset.kind === "human") {
        const armOps = plan.recipe.operations.filter(
          (op) =>
            op.type === "rotation" &&
            (op.target === "human.leftArm" || op.target === "human.rightArm"),
        );
        expect(armOps.length).toBeGreaterThan(0);

        const effectOps = plan.recipe.operations.filter(
          (op) =>
            op.role === "effect" ||
            op.target === "edgeGlyph" ||
            op.type === "scale",
        );
        expect(effectOps.length).toBeGreaterThan(0);

        if (json.pipelineVersion === 2) {
          const anticipation = plan.recipe.operations.find(
            (op) => op.role === "anticipation",
          );
          const action = plan.recipe.operations.find(
            (op) => op.role === "action",
          );
          if (anticipation?.timing && action?.timing) {
            expect(anticipation.timing.start).toBeLessThanOrEqual(
              action.timing.start,
            );
          }
        }
      }

      if (scenario.expectedStyle === "dance" && plan.asset.kind === "human") {
        const phased = plan.recipe.operations.filter(
          (op) => op.phase != null && op.phase > 0,
        );
        expect(phased.length).toBeGreaterThanOrEqual(1);
      }
    });
  }
});
