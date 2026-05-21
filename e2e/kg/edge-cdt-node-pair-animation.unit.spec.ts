import { test, expect } from "@playwright/test";
import {
  CDT_CATEGORIES,
} from "@/app/const/edge-cdt-animation";
import {
  CDT_NODE_PAIR_MAP,
  NODE_PAIR_MOTION_MODES,
  computeNodePairOffset,
  getNodePairDurationMs,
  layoutPosWithNodePair,
  nodePairOffsetLayoutScale,
  type NodePairMotionSpec,
} from "@/app/const/edge-cdt-node-pair-animation";

const UNIT_VEC_RIGHT = { ux: 1, uy: 0 };
const UNIT_VEC_DIAG = { ux: Math.SQRT1_2, uy: Math.SQRT1_2 };

test.describe("edge-cdt-node-pair-animation", () => {
  test("CDT_NODE_PAIR_MAP は8カテゴリすべてにエントリがある", () => {
    for (const category of CDT_CATEGORIES) {
      const spec = CDT_NODE_PAIR_MAP[category];
      expect(spec).toBeDefined();
      expect(NODE_PAIR_MOTION_MODES).toContain(spec.mode);
      expect(spec.amplitudePx).toBeGreaterThanOrEqual(0);
    }
  });

  test("getNodePairDurationMs は正の値を返す", () => {
    for (const category of CDT_CATEGORIES) {
      expect(getNodePairDurationMs(category)).toBeGreaterThan(0);
    }
  });

  test("t=0 のとき全モードで dx=0, dy=0 (sin(0)=0 ベース)", () => {
    for (const category of CDT_CATEGORIES) {
      const spec = CDT_NODE_PAIR_MAP[category];
      const src = computeNodePairOffset(spec, "source", 0, UNIT_VEC_RIGHT);
      expect(src.dx).toBeCloseTo(0, 5);
      expect(src.dy).toBeCloseTo(0, 5);
      const tgt = computeNodePairOffset(spec, "target", 0, UNIT_VEC_RIGHT);
      expect(tgt.dx).toBeCloseTo(0, 5);
      expect(tgt.dy).toBeCloseTo(0, 5);
    }
  });

  test("scale は常に正値", () => {
    for (const category of CDT_CATEGORIES) {
      const spec = CDT_NODE_PAIR_MAP[category];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        const src = computeNodePairOffset(spec, "source", t, UNIT_VEC_RIGHT);
        const tgt = computeNodePairOffset(spec, "target", t, UNIT_VEC_RIGHT);
        expect(src.scale).toBeGreaterThan(0);
        expect(tgt.scale).toBeGreaterThan(0);
      }
    }
  });

  test("PTRANS (slideAlong, driveSourceOnly) は target が静止", () => {
    const spec = CDT_NODE_PAIR_MAP.PTRANS;
    expect(spec.driveSourceOnly).toBe(true);
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const tgt = computeNodePairOffset(spec, "target", t, UNIT_VEC_RIGHT);
      expect(tgt.dx).toBe(0);
      expect(tgt.dy).toBe(0);
      expect(tgt.scale).toBe(1);
    }
  });

  test("PROPEL (repel) の source と target は逆方向に変位する", () => {
    const spec = CDT_NODE_PAIR_MAP.PROPEL;
    const t = 0.25; // sin(pi/2) = 1 → peak
    const src = computeNodePairOffset(spec, "source", t, UNIT_VEC_RIGHT);
    const tgt = computeNodePairOffset(spec, "target", t, UNIT_VEC_RIGHT);
    // source は正方向（sign=-1 * -sign → 正）、target は負方向に弾く
    expect(src.dx * tgt.dx).toBeLessThanOrEqual(0);
  });

  test("SPEAK (scalePulse) は位置変化なし", () => {
    const spec = CDT_NODE_PAIR_MAP.SPEAK;
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const src = computeNodePairOffset(spec, "source", t, UNIT_VEC_DIAG);
      expect(src.dx).toBe(0);
      expect(src.dy).toBe(0);
      expect(src.scale).toBeGreaterThanOrEqual(1);
    }
  });

  test("attract 系は source・target が互いに接近する方向に変位", () => {
    for (const category of ["ATRANS", "INGEST"] as const) {
      const spec = CDT_NODE_PAIR_MAP[category];
      const t = 0.5; // (1-cos(pi))/2 = 1 → peak
      const src = computeNodePairOffset(spec, "source", t, UNIT_VEC_RIGHT);
      const tgt = computeNodePairOffset(spec, "target", t, UNIT_VEC_RIGHT);
      // source moves in +x (toward target), target in -x (toward source)
      expect(src.dx).toBeGreaterThan(0);
      expect(tgt.dx).toBeLessThan(0);
    }
  });

  test("amplitudePx=0 のモードは常に dx=dy=0", () => {
    const zeroAmpSpec: NodePairMotionSpec = { mode: "scalePulse", amplitudePx: 0 };
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const r = computeNodePairOffset(zeroAmpSpec, "source", t, UNIT_VEC_RIGHT);
      expect(r.dx).toBe(0);
      expect(r.dy).toBe(0);
    }
  });

  test("nodePairOffsetLayoutScale は zoom の逆数を返す", () => {
    expect(nodePairOffsetLayoutScale(2)).toBe(0.5);
    expect(nodePairOffsetLayoutScale(0)).toBe(1);
  });

  test("layoutPosWithNodePair は viewScale でオフセットをレイアウト座標に換算する", () => {
    const pos = layoutPosWithNodePair(10, 20, { dx: 8, dy: 0, scale: 1 }, 0.5);
    expect(pos.x).toBe(14);
    expect(pos.y).toBe(20);
  });

  test("斜め方向の edgeVec でもオフセットが計算される", () => {
    const spec = CDT_NODE_PAIR_MAP.PTRANS;
    const src = computeNodePairOffset(spec, "source", 0.25, UNIT_VEC_DIAG);
    expect(Math.abs(src.dx)).toBeGreaterThan(0);
    expect(Math.abs(src.dy)).toBeGreaterThan(0);
    expect(Math.abs(src.dx - src.dy)).toBeLessThan(0.001);
  });
});
