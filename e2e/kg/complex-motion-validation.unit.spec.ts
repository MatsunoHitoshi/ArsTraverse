import { test, expect } from "@playwright/test";
import { normalizeGenerativeMotionPlan } from "@/app/const/generative-motion-plan";
import {
  inferMotionStyle,
  normalizeDirectionHint,
  resolveMotionIntent,
  validateHumanMotionPlan,
} from "@/app/const/motion-intent";
import { MOTION_LAB_SCENARIOS } from "./motion-scenarios";

test.describe("complex motion validation", () => {
  test("normalizeDirectionHint maps aliases", () => {
    expect(normalizeDirectionHint("right")).toBe("right");
    expect(normalizeDirectionHint("sourceToTargetLeft")).toBe("left");
    expect(normalizeDirectionHint("")).toBe("auto");
  });

  test("inferMotionStyle maps predicates", () => {
    expect(inferMotionStyle("PROPEL", "ATTACKED")).toBe("fight");
    expect(inferMotionStyle("MOVE", "DANCED_WITH")).toBe("dance");
    expect(inferMotionStyle("MOVE", "WAVED_TO")).toBe("wave");
    expect(inferMotionStyle("MOVE", "PARTICIPATED_IN")).toBe("run");
  });

  for (const scenario of MOTION_LAB_SCENARIOS) {
    test(`fallback plan for ${scenario.id} passes structural validation`, () => {
      const plan = normalizeGenerativeMotionPlan(
        undefined,
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
      const intent = resolveMotionIntent(
        plan,
        scenario.expectedCategory,
        scenario.predicate,
        { directionHint: scenario.directionHint },
      );
      const validation = validateHumanMotionPlan(plan, {
        directionHint: scenario.directionHint,
      });

      expect(plan.version).toBe("motion-plan/v1");
      expect(plan.motionIntent?.style ?? intent.style).toBeTruthy();
      if (plan.asset.kind === "human") {
        expect(
          plan.recipe.operations.some((op) => op.target === "human.head"),
        ).toBe(true);
        expect(plan.recipe.operations.length).toBeGreaterThanOrEqual(3);
      }
      expect(validation.ok).toBe(true);
    });
  }

  test("sparse human plan fails validation before normalization enriches it", () => {
    const sparseOnlyBody = normalizeGenerativeMotionPlan(
      {
        version: "motion-plan/v1",
        rendererVersion: 8,
        semantic: { cdtCategory: "MOVE", predicate: "TEST", confidence: 0.5 },
        participants: {
          sourceRole: "actor",
          targetRole: "object",
          primaryTarget: "source",
          direction: "sourceToTarget",
        },
        asset: { kind: "human", assetId: "human-basic" },
        recipe: {
          preset: "bodyPartMotion",
          operations: [
            {
              type: "scale",
              target: "human.body",
              from: 0.95,
              to: 1.05,
              repeat: "yoyo",
            },
          ],
        },
        playback: {
          durationMs: 1200,
          loop: true,
          yoyo: true,
          easing: "easeInOut",
          intensity: 0.5,
        },
      },
      "MOVE",
      "TEST",
      { sourceLabel: "Person", targetLabel: "Event" },
    );
    expect(
      sparseOnlyBody.recipe.operations.filter((op) =>
        op.target.startsWith("human."),
      ).length,
    ).toBeGreaterThanOrEqual(3);

    const rawSparseValidation = validateHumanMotionPlan({
      version: "motion-plan/v1",
      rendererVersion: 8,
      semantic: { cdtCategory: "MOVE", predicate: "TEST", confidence: 0.5 },
      participants: {
        sourceRole: "actor",
        targetRole: "object",
        primaryTarget: "source",
        direction: "sourceToTarget",
      },
      asset: { kind: "human", assetId: "human-basic" },
      recipe: {
        preset: "bodyPartMotion",
        operations: [
          {
            type: "scale",
            target: "human.body",
            from: 0.95,
            to: 1.05,
            repeat: "yoyo",
          },
        ],
      },
      playback: {
        durationMs: 1200,
        loop: true,
        yoyo: true,
        easing: "easeInOut",
        intensity: 0.5,
      },
    });
    expect(rawSparseValidation.ok).toBe(false);
    expect(
      rawSparseValidation.errors.some((e) => e.code === "sparse_human_parts"),
    ).toBe(true);
  });
});
