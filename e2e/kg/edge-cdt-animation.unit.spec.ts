import { test, expect } from "@playwright/test";
import {
  CDT_ANIMATION_MAP,
  CDT_CATEGORIES,
  type EdgeMotionType,
} from "@/app/const/edge-cdt-animation";
import {
  EDGE_STROKE_CLASS,
  EDGE_STROKE_DASHARRAY,
} from "@/app/_components/d3/force/storytelling-graph/components/edge-stroke-animation";
import {
  buildMotionConfigFromCategory,
  buildUniquePredicateBatches,
  inferCdtCategoryFromPredicate,
  normalizeCdtCategory,
} from "@/server/services/kg/edge-motion-classification";
import { parseLlmClassificationJson } from "@/server/services/kg/classify-edge-motion.service";
import {
  buildDefaultGenerativeMotionPlan,
  GENERATIVE_MOTION_PLAN_RENDERER_VERSION,
  normalizeGenerativeMotionPlan,
} from "@/app/const/generative-motion-plan";

test.describe("edge-cdt-animation", () => {
  test("CDT_CATEGORIES は8種類すべてマップに定義されている", () => {
    for (const category of CDT_CATEGORIES) {
      const config = CDT_ANIMATION_MAP[category];
      expect(config.category).toBe(category);
      expect(config.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(config.speed).toBeGreaterThan(0);
      expect(config.speed).toBeLessThanOrEqual(1);
      expect(config.durationMs).toBeGreaterThan(0);
      expect(config.iconName.length).toBeGreaterThan(0);
    }
  });

  test("normalizeCdtCategory は有効 CDT と述語名の誤返却を補正する", () => {
    expect(normalizeCdtCategory("PROPEL")).toBe("PROPEL");
    expect(normalizeCdtCategory("ATrans")).toBe("ATRANS");
    expect(normalizeCdtCategory("LOCATED_IN")).toBe("PTRANS");
    expect(normalizeCdtCategory("WORKS_AT")).toBe("ATRANS");
    expect(normalizeCdtCategory("ASSOCIATED_WITH")).toBe("MENTAL");
    expect(normalizeCdtCategory("VISITED", "VISITED")).toBe("PTRANS");
    expect(normalizeCdtCategory(undefined, "LOCATED_IN")).toBe("PTRANS");
    expect(normalizeCdtCategory("INVALID")).toBe("ATRANS");
    expect(normalizeCdtCategory(undefined)).toBe("ATRANS");
  });

  test("inferCdtCategoryFromPredicate は主要述語を分類する", () => {
    expect(inferCdtCategoryFromPredicate("LOCATED_IN")).toBe("PTRANS");
    expect(inferCdtCategoryFromPredicate("MEMBER_OF")).toBe("ATRANS");
    expect(inferCdtCategoryFromPredicate("HOSTED")).toBe("ATRANS");
    expect(inferCdtCategoryFromPredicate("FEATURED_IN")).toBe("ATRANS");
    expect(inferCdtCategoryFromPredicate("ASSOCIATED_WITH")).toBe("MENTAL");
    expect(inferCdtCategoryFromPredicate("PARTICIPATED_IN")).toBe("MOVE");
  });

  test("buildUniquePredicateBatches は同一述語を1グループにまとめる", () => {
    const batches = buildUniquePredicateBatches([
      { edgeId: "e1", edgeType: "LOCATED_IN" },
      { edgeId: "e2", edgeType: "LOCATED_IN" },
      { edgeId: "e3", edgeType: "VISITED" },
    ]);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(2);
    const located = batches[0]!.find(
      (g) => g.representative.edgeType === "LOCATED_IN",
    );
    expect(located?.edgeIds).toEqual(["e1", "e2"]);
  });

  test("parseLlmClassificationJson は分類itemの閉じ括弧欠落を修復する", () => {
    const parsed = parseLlmClassificationJson(
      `{"classifications":[{"edgeId":"e1","cdtCategory":"ATRANS","motionPlan":{"version":"motion-plan/v1","rendererVersion":4,"semantic":{"intent":"person works at organization","confidence":0.8},"participants":{"sourceRole":"actor","targetRole":"object","primaryTarget":"bothNodes","direction":"sourceToTarget"},"asset":{"kind":"human","assetId":"person_1"},"recipe":{"preset":"disappearReappear","operations":[{"type":"scale","target":"edgeGlyph","from":0.9,"to":1.1,"role":"action","timing":{"start":0.1,"duration":0.3},"repeat":"yoyo"}]},"playback":{"durationMs":1600,"loop":false,"yoyo":true,"easing":"easeInOut","intensity":0.6}},{"edgeId":"e2","cdtCategory":"PTRANS","motionPlan":{"version":"motion-plan/v1","rendererVersion":4,"semantic":{"intent":"event held at place","confidence":0.7},"participants":{"sourceRole":"actor","targetRole":"destination","primaryTarget":"edgeGlyph","direction":"sourceToTarget"},"asset":{"kind":"object","assetId":"event_1"},"recipe":{"preset":"path","operations":[{"type":"pathMovement","target":"edgeGlyph","role":"effect","timing":{"start":0,"duration":0.5},"repeat":"once","fromOffset":{"x":0,"y":0},"toOffset":{"x":0,"y":1}}]},"playback":{"durationMs":1500,"loop":false,"yoyo":false,"easing":"easeInOut","intensity":0.4}}]}`,
    );

    expect(parsed.classifications).toHaveLength(2);
    expect(parsed.classifications?.[0]?.edgeId).toBe("e1");
    expect(parsed.classifications?.[1]?.edgeId).toBe("e2");
  });

  test("EDGE_STROKE は全 motionType に定義がある", () => {
    const motionTypes: EdgeMotionType[] = [
      "flow",
      "extend",
      "pulse-impact",
      "wave",
      "converge",
      "diverge",
      "pop",
      "glow",
    ];
    for (const mt of motionTypes) {
      expect(EDGE_STROKE_CLASS[mt]).toContain("edge-stroke-");
      expect(
        EDGE_STROKE_DASHARRAY[mt] === undefined ||
          EDGE_STROKE_DASHARRAY[mt].length > 0,
      ).toBe(true);
    }
  });

  test("buildMotionConfigFromCategory は定数マップと一致する設定を返す", () => {
    const config = buildMotionConfigFromCategory("SPEAK");
    expect(config).toMatchObject(CDT_ANIMATION_MAP.SPEAK);
    expect(config.motionType).toBe("pop");
    expect(config.generativeMotionPlan?.recipe.preset).toBe("dialogueBubble");
    expect(config.generativeMotionPlan?.rendererVersion).toBe(
      GENERATIVE_MOTION_PLAN_RENDERER_VERSION,
    );
  });

  test("GenerativeMotionPlan は actor と edge glyph の両方を表現できる", () => {
    const plan = buildDefaultGenerativeMotionPlan("PROPEL", "ATTACKED", {
      sourceLabel: "Person",
      targetLabel: "Person",
    });
    expect(plan.asset.kind).toBe("human");
    expect(plan.participants.primaryTarget).toBe("source");
    expect(
      plan.recipe.operations.some((op) => op.target === "human.rightArm"),
    ).toBe(true);
    expect(plan.recipe.operations.some((op) => op.target === "edgeGlyph")).toBe(
      true,
    );
  });

  test("GenerativeMotionPlan は非human assetにhuman部位operationを混ぜない", () => {
    const plan = buildDefaultGenerativeMotionPlan("PTRANS", "LOCATED_IN", {
      sourceLabel: "Event",
      targetLabel: "Place",
    });
    expect(plan.asset.kind).toBe("object");
    expect(plan.asset.requiredParts).toBeUndefined();
    expect(
      plan.recipe.operations.some((op) => op.target.startsWith("human.")),
    ).toBe(false);
    expect(plan.recipe.operations.some((op) => op.target === "edgeGlyph")).toBe(
      true,
    );
  });

  test("GenerativeMotionPlan は非Person文脈のLLM human指定を補正する", () => {
    const plan = normalizeGenerativeMotionPlan(
      {
        asset: {
          kind: "human",
          assetId: "human-basic",
          requiredParts: ["human.leftArm"],
        },
        recipe: {
          preset: "bodyPartMotion",
          operations: [
            {
              type: "rotation",
              target: "human.leftArm",
              degrees: 18,
            },
            {
              type: "scale",
              target: "edgeGlyph",
              from: 0.9,
              to: 1.2,
            },
          ],
        },
      },
      "MOVE",
      "HOSTED",
      {
        sourceLabel: "Organization",
        targetLabel: "Event",
      },
    );
    expect(plan.asset.kind).not.toBe("human");
    expect(plan.asset.requiredParts).toBeUndefined();
    expect(
      plan.recipe.operations.some((op) => op.target.startsWith("human.")),
    ).toBe(false);
    expect(plan.recipe.operations.some((op) => op.target === "edgeGlyph")).toBe(
      true,
    );
  });

  test("GenerativeMotionPlan はLLMのoperations配置揺れと入れ子数値を補正する", () => {
    const plan = normalizeGenerativeMotionPlan(
      {
        asset: { kind: "human", assetId: "human-basic" },
        recipe: { preset: "bodyPartMotion" },
        operations: [
          {
            type: "pathMovement",
            target: "edgeGlyph",
            pathMovement: {
              fromOffset: { x: 0, y: 0 },
              toOffset: { x: 100, y: 0 },
            },
          },
          {
            type: "scale",
            target: "edgeGlyph",
            scale: { from: 0.8, to: 1.3 },
          },
        ],
      },
      "ATRANS",
      "FEATURED_IN",
      {
        sourceLabel: "Person",
        targetLabel: "Event",
      },
    );

    expect(plan.asset.kind).toBe("human");
    expect(plan.recipe.operations.some((op) => op.target === "edgeGlyph")).toBe(
      true,
    );
    expect(
      plan.recipe.operations.some((op) => op.target.startsWith("human.")),
    ).toBe(true);
    const scale = plan.recipe.operations.find(
      (op) => op.type === "scale" && op.target === "edgeGlyph",
    );
    expect(scale).toMatchObject({ from: 0.8, to: 1.3 });
    const path = plan.recipe.operations.find(
      (op) => op.type === "pathMovement",
    );
    expect(path).toMatchObject({ fromOffset: 0, toOffset: 48 });
  });

  test("GenerativeMotionPlan は小さすぎる正規化offsetとunknown roleを補正する", () => {
    const plan = normalizeGenerativeMotionPlan(
      {
        participants: {
          sourceRole: "unknown",
          targetRole: "destination",
          primaryTarget: "bothNodes",
          direction: "sourceToTarget",
        },
        recipe: {
          preset: "path",
          operations: [
            {
              type: "pathMovement",
              target: "edgeGlyph",
              fromOffset: 0,
              toOffset: 1,
            },
          ],
        },
      },
      "PTRANS",
      "LOCATED_IN",
      {
        sourceLabel: "Event",
        targetLabel: "Place",
      },
    );

    expect(plan.participants.sourceRole).toBe("actor");
    const path = plan.recipe.operations.find(
      (op) => op.type === "pathMovement",
    );
    expect(path).toMatchObject({ fromOffset: 0, toOffset: 12 });
  });

  test("GenerativeMotionPlan は非human assetのIDとrequiredPartsを整合させる", () => {
    const plan = normalizeGenerativeMotionPlan(
      {
        asset: {
          kind: "abstract",
          assetId: "human-basic",
        },
        recipe: {
          preset: "thoughtBubble",
          operations: [
            {
              type: "scale",
              target: "edgeGlyph",
              from: 0.9,
              to: 1.1,
            },
          ],
        },
      },
      "MENTAL",
      "ASSOCIATED_WITH",
      {
        sourceLabel: "Person",
        targetLabel: "Organization",
      },
    );

    expect(plan.asset.kind).toBe("abstract");
    expect(plan.asset.assetId).toBe("abstract-basic");
    expect(plan.asset.requiredParts).toBeUndefined();
    expect(
      plan.recipe.operations.some((op) => op.target.startsWith("human.")),
    ).toBe(false);
  });

  test("GenerativeMotionPlan は human asset の choreography を多関節に補完する", () => {
    const plan = normalizeGenerativeMotionPlan(
      {
        asset: { kind: "human", assetId: "human-basic" },
        recipe: {
          preset: "bodyPartMotion",
          operations: [
            {
              type: "pathMovement",
              target: "human.body",
              fromOffset: -2,
              toOffset: 2,
            },
          ],
        },
      },
      "MOVE",
      "PARTICIPATED_IN",
      { sourceLabel: "Person", targetLabel: "Event" },
    );

    const humanTargets = new Set(
      plan.recipe.operations
        .map((op) => op.target)
        .filter((target) => target.startsWith("human.")),
    );
    expect(humanTargets.size).toBeGreaterThanOrEqual(3);
    expect(humanTargets.has("human.leftLeg")).toBe(true);
    expect(humanTargets.has("human.rightLeg")).toBe(true);
    expect(plan.asset.requiredParts ?? []).toEqual(
      expect.arrayContaining([
        "human.leftLeg",
        "human.rightLeg",
        "human.body",
      ]),
    );
  });

  test("GenerativeMotionPlan は sparse な非human ops にdefault補完を加える", () => {
    const plan = normalizeGenerativeMotionPlan(
      {
        asset: { kind: "object", assetId: "object-basic" },
        recipe: {
          preset: "disappearReappear",
          operations: [
            {
              type: "appearance",
              target: "edgeGlyph",
              mode: "popIn",
            },
          ],
        },
      },
      "ATRANS",
      "HOSTED",
      { sourceLabel: "Organization", targetLabel: "Event" },
    );

    expect(plan.recipe.operations.length).toBeGreaterThanOrEqual(3);
    expect(
      plan.recipe.operations.some((op) => op.target === "transferredObject"),
    ).toBe(true);
    expect(
      plan.recipe.operations.some((op) => op.target.startsWith("human.")),
    ).toBe(false);
  });

  test("GenerativeMotionPlan は human asset で head 操作を必ず含む", () => {
    const plan = normalizeGenerativeMotionPlan(
      {
        asset: { kind: "human", assetId: "human-basic" },
        recipe: {
          preset: "bodyPartMotion",
          operations: [
            {
              type: "rotation",
              target: "human.leftLeg",
              fromDegrees: -22,
              toDegrees: 22,
            },
            {
              type: "rotation",
              target: "human.rightLeg",
              fromDegrees: 22,
              toDegrees: -22,
              phase: 0.5,
            },
            {
              type: "pathMovement",
              target: "human.body",
              fromOffset: -3,
              toOffset: 3,
            },
          ],
        },
      },
      "MOVE",
      "PARTICIPATED_IN",
      { sourceLabel: "Person", targetLabel: "Event" },
    );

    expect(
      plan.recipe.operations.some((op) => op.target === "human.head"),
    ).toBe(true);
  });

  test("GenerativeMotionPlan は MOVE で contralateral gait を強制する", () => {
    const plan = normalizeGenerativeMotionPlan(
      {
        asset: { kind: "human", assetId: "human-basic" },
        recipe: {
          preset: "bodyPartMotion",
          operations: [
            {
              type: "rotation",
              target: "human.leftLeg",
              fromDegrees: -22,
              toDegrees: 22,
              phase: 0,
            },
            {
              type: "rotation",
              target: "human.rightLeg",
              fromDegrees: 22,
              toDegrees: -22,
              phase: 0.5,
            },
            {
              type: "rotation",
              target: "human.leftArm",
              fromDegrees: 16,
              toDegrees: -16,
              phase: 0,
            },
            {
              type: "rotation",
              target: "human.rightArm",
              fromDegrees: -16,
              toDegrees: 16,
              phase: 0.5,
            },
          ],
        },
      },
      "MOVE",
      "PARTICIPATED_IN",
      { sourceLabel: "Person", targetLabel: "Event" },
    );

    const phaseOf = (target: string) =>
      plan.recipe.operations.find(
        (op) => op.type === "rotation" && op.target === target,
      )?.phase ?? 0;
    expect(phaseOf("human.leftLeg")).toBe(0);
    expect(phaseOf("human.rightArm")).toBe(0);
    expect(phaseOf("human.rightLeg")).toBe(0.5);
    expect(phaseOf("human.leftArm")).toBe(0.5);
  });

  test("GenerativeMotionPlan は非human の once 連鎖を loop に格上げする", () => {
    const plan = normalizeGenerativeMotionPlan(
      {
        asset: { kind: "object", assetId: "object-basic" },
        recipe: {
          preset: "path",
          operations: [
            {
              type: "appearance",
              target: "edgeGlyph",
              mode: "scaleIn",
              repeat: "once",
            },
            {
              type: "pathMovement",
              target: "edgeGlyph",
              path: "alongEdge",
              fromOffset: 0,
              toOffset: 10,
              repeat: "once",
            },
            {
              type: "disappearance",
              target: "edgeGlyph",
              mode: "fade",
              repeat: "once",
            },
          ],
        },
        playback: {
          durationMs: 2000,
          loop: false,
          yoyo: false,
          easing: "easeInOut",
          intensity: 0.5,
        },
      },
      "PTRANS",
      "LOCATED_IN",
      { sourceLabel: "Project", targetLabel: "Organization" },
    );

    const path = plan.recipe.operations.find(
      (op) => op.type === "pathMovement",
    );
    expect(path?.repeat).toBe("loop");
    expect(plan.playback.loop).toBe(true);
  });

  test("GenerativeMotionPlan は operation の具体指定を保持する", () => {
    const plan = normalizeGenerativeMotionPlan(
      {
        recipe: {
          preset: "impactMotion",
          operations: [
            {
              type: "rotation",
              target: "human.rightArm",
              role: "action",
              timing: { start: 0.1, duration: 0.45 },
              repeat: "yoyo",
              easing: "impact",
              degrees: 35,
              fromDegrees: -24,
              toDegrees: 42,
              origin: "shoulder",
            },
          ],
        },
      },
      "PROPEL",
      "ATTACKED",
      {
        sourceLabel: "Person",
        targetLabel: "Person",
      },
    );
    const op = plan.recipe.operations[0];
    expect(plan.rendererVersion).toBe(GENERATIVE_MOTION_PLAN_RENDERER_VERSION);
    expect(op?.type).toBe("rotation");
    expect(op?.role).toBe("action");
    expect(op?.timing).toEqual({ start: 0.1, duration: 0.45 });
    expect(op?.repeat).toBe("yoyo");
    if (op?.type === "rotation") {
      expect(op.fromDegrees).toBe(-24);
      expect(op.toDegrees).toBe(42);
    }
  });
});
