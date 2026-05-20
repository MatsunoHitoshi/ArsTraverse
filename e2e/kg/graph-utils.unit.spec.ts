import { test, expect } from "@playwright/test";
import { calcEdgeLabelPos } from "@/app/_components/d3/force/storytelling-graph/utils/graph-utils";

test.describe("storytelling graph utils", () => {
  test("calcEdgeLabelPos: 水平エッジで中点上側にラベルを配置する", () => {
    const pos = calcEdgeLabelPos(0, 0, 10, 0, false, false);

    expect(pos.x).toBe(5);
    expect(pos.y).toBeCloseTo(-4, 5);
    expect(pos.angle).toBe(0);
  });

  test("calcEdgeLabelPos: 明示エッジかつ focus edge のときオフセットが大きくなる", () => {
    const normal = calcEdgeLabelPos(0, 0, 10, 0, false, false);
    const focused = calcEdgeLabelPos(0, 0, 10, 0, true, true);

    expect(Math.abs(focused.y)).toBeGreaterThan(Math.abs(normal.y));
    expect(focused.y).toBeCloseTo(-8, 5);
  });

  test("calcEdgeLabelPos: 角度が 90 度を超える場合でも可読向きに正規化される", () => {
    // raw angle は約 174.3° -> 正規化後は約 -5.7°
    const pos = calcEdgeLabelPos(10, 0, 0, 1, false, false);

    expect(pos.angle).toBeGreaterThanOrEqual(-90);
    expect(pos.angle).toBeLessThanOrEqual(90);
    expect(pos.angle).toBeCloseTo(-5.7105, 3);
  });
});
