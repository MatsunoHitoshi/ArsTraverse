import { test, expect } from "@playwright/test";
import { buildClassifyEdgeMotionUserPrompt } from "@/server/services/kg/edge-motion-classification";

test.describe("edge-motion-classification prompts", () => {
  test("ユーザープロンプトは述語のみを含みノード名は含まない", () => {
    const prompt = buildClassifyEdgeMotionUserPrompt([
      { edgeId: "edge-abc", edgeType: "戦った" },
      { edgeId: "edge-xyz", edgeType: "出資した" },
    ]);

    expect(prompt).toContain('"predicate":"戦った"');
    expect(prompt).toContain('"predicate":"出資した"');
    expect(prompt).toContain('"edgeId":"edge-abc"');

    // ノード関連フィールドはプロンプトに含めない
    expect(prompt).not.toMatch(/sourceNode|targetNode|nodeName|nodeLabel/i);
    expect(prompt).not.toContain("NodeA");
    expect(prompt).not.toContain("Person");
  });

  test("空配列のときも CDT 制約を含むヘッダを返す", () => {
    const prompt = buildClassifyEdgeMotionUserPrompt([]);
    expect(prompt).toContain("PTRANS, ATRANS");
    expect(prompt).not.toContain('"predicate"');
  });
});
