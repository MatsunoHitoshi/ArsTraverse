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
    expect(config).toEqual(CDT_ANIMATION_MAP.SPEAK);
    expect(config.motionType).toBe("pop");
  });
});
