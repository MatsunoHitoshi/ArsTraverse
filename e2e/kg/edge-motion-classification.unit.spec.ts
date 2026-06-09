import { test, expect } from "@playwright/test";
import {
  buildClassifyEdgeMotionUserPrompt,
  buildStageAUserPrompt,
  STAGE_A_SYSTEM_PROMPT,
} from "@/server/services/kg/edge-motion-classification";

test.describe("edge-motion-classification prompts", () => {
  test("ユーザープロンプトは述語のみを含みノード名は含まない", () => {
    const prompt = buildClassifyEdgeMotionUserPrompt([
      { edgeId: "edge-abc", edgeType: "戦った" },
      { edgeId: "edge-xyz", edgeType: "出資した" },
    ]);

    expect(prompt).toContain('"predicate":"戦った"');
    expect(prompt).toContain('"predicate":"出資した"');
    expect(prompt).toContain('"edgeId":"edge-abc"');

    const inputSection = prompt.split("Input edges:")[1] ?? "";
    expect(inputSection).not.toMatch(/nodeName|nodeLabel/i);
    expect(inputSection).not.toContain("NodeA");
    expect(inputSection).not.toContain("Person");
  });

  test("空配列のときも CDT 制約を含むヘッダを返す", () => {
    const prompt = buildClassifyEdgeMotionUserPrompt([]);
    expect(prompt).toContain("PTRANS, ATRANS");
    expect(prompt).not.toContain('"predicate"');
  });

  test("Stage A prompt includes directionHint without motionPlan rules", () => {
    const prompt = buildStageAUserPrompt([
      {
        edgeId: "e1",
        edgeType: "PARTICIPATED_IN",
        directionHint: "right",
        sourceLabel: "Person",
        targetLabel: "Event",
      },
    ]);
    expect(prompt).toContain('"directionHint":"right"');
    expect(prompt).not.toContain("recipe.operations");
    expect(STAGE_A_SYSTEM_PROMPT).toContain("storyboard");
  });

  test("directionHint をプロンプトに含める", () => {
    const prompt = buildClassifyEdgeMotionUserPrompt([
      {
        edgeId: "e1",
        edgeType: "ATTACKED",
        directionHint: "left",
        sourceLabel: "Person",
        targetLabel: "Person",
      },
    ]);
    expect(prompt).toContain('"directionHint":"left"');
    expect(prompt).toContain("motionPlan.motionIntent");
  });
});
