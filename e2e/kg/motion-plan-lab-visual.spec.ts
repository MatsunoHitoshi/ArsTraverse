import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  RUN_CYCLE_PHASES,
  RUN_CYCLE_PHASE_SEEK,
  buildPhaseMeasurements,
  evaluateCrossPhaseRules,
  evaluatePhaseRules,
  type RunCyclePhase,
} from "./run-cycle-rules";

type BoxMetric = {
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
};

type BrowserBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const BASE_URL = process.env.MOTION_LAB_BASE_URL ?? "http://localhost:3000";
const VIRTUAL_GROUND_Y = 616;
const VIRTUAL_GROUND_TOLERANCE_PX = 12;
const PART_TEST_IDS = [
  "motion-human-svg",
  "motion-figure-bob",
  "motion-part-human-body",
  "motion-part-human-head",
  "motion-part-human-leftArm",
  "motion-part-human-rightArm",
  "motion-part-human-leftLeg",
  "motion-part-human-rightLeg",
  "motion-joint-leftElbow",
  "motion-joint-rightElbow",
  "motion-joint-leftKnee",
  "motion-joint-rightKnee",
] as const;

const END_EFFECTOR_TEST_IDS = [
  "motion-foot-left",
  "motion-foot-right",
  "motion-hand-left",
  "motion-hand-right",
] as const;

function toMetric(box: BrowserBox | null): BoxMetric | null {
  if (!box) return null;
  return {
    x: Number(box.x.toFixed(2)),
    y: Number(box.y.toFixed(2)),
    width: Number(box.width.toFixed(2)),
    height: Number(box.height.toFixed(2)),
    centerX: Number((box.x + box.width / 2).toFixed(2)),
    centerY: Number((box.y + box.height / 2).toFixed(2)),
  };
}

function isInside(inner: BoxMetric | null, outer: BoxMetric | null, tolerance = 2) {
  if (!inner || !outer) return false;
  return (
    inner.x >= outer.x - tolerance &&
    inner.y >= outer.y - tolerance &&
    inner.x + inner.width <= outer.x + outer.width + tolerance &&
    inner.y + inner.height <= outer.y + outer.height + tolerance
  );
}

async function collectParts(page: Page) {
  const parts: Record<string, BoxMetric | null> = {};
  for (const testId of PART_TEST_IDS) {
    parts[testId] = toMetric(await page.getByTestId(testId).boundingBox());
  }
  return parts;
}

async function collectEndEffectors(page: Page) {
  const endEffectors: Record<string, BoxMetric | null> = {};
  for (const testId of END_EFFECTOR_TEST_IDS) {
    endEffectors[testId] = toMetric(await page.getByTestId(testId).boundingBox());
  }
  return endEffectors;
}

async function waitForPhaseSeek(page: Page) {
  await expect(page.getByTestId("motion-preview-actor")).toHaveAttribute(
    "data-motion-phase-seek-ready",
    "1",
    { timeout: 10_000 },
  );
}

async function collectPhaseSnapshot(page: Page, phase: RunCyclePhase) {
  const preview = toMetric(await page.getByTestId("motion-preview-actor").boundingBox());
  const parts = await collectParts(page);
  const endEffectors = await collectEndEffectors(page);
  const figureBobTranslateY = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="motion-figure-bob"]');
    if (!el) return null;
    const transform = getComputedStyle(el).transform;
    if (!transform || transform === "none") return 0;
    const matrix = new DOMMatrix(transform);
    return Number(matrix.m42.toFixed(2));
  });
  const simplified = Object.fromEntries(
    Object.entries({ ...parts, ...endEffectors }).map(([k, v]) => [
      k,
      v ? { centerX: v.centerX, centerY: v.centerY } : null,
    ]),
  ) as Record<string, { centerX: number; centerY: number } | null>;
  const measurements = {
    ...buildPhaseMeasurements(simplified),
    figureBobTranslateY,
  };
  const checks = evaluatePhaseRules(phase, measurements);
  const noObviousClipping =
    PART_TEST_IDS.every((testId) => isInside(parts[testId] ?? null, preview, 12)) &&
    END_EFFECTOR_TEST_IDS.every((testId) =>
      isInside(endEffectors[testId] ?? null, preview, 12),
    );
  return {
    phase,
    preview,
    parts,
    endEffectors,
    measurements,
    checks,
    noObviousClipping,
  };
}

function bottom(box: BoxMetric | null) {
  return box ? Number((box.y + box.height).toFixed(2)) : null;
}

function requireMetric(value: number | null, label: string) {
  expect(value, label).not.toBeNull();
  return value as number;
}

function expectNearGround(value: number | null, label: string) {
  expect(
    Math.abs(requireMetric(value, label) - VIRTUAL_GROUND_Y),
    `${label} が仮想地面に近い`,
  ).toBeLessThanOrEqual(VIRTUAL_GROUND_TOLERANCE_PX);
}

async function writePhaseArtifacts(
  testInfo: TestInfo,
  preset: string,
  phase: RunCyclePhase,
  snapshot: Awaited<ReturnType<typeof collectPhaseSnapshot>>,
  screenshot: Buffer,
) {
  const outputDir = testInfo.outputPath("motion-lab");
  await mkdir(outputDir, { recursive: true });
  const base = `${preset}-${phase}`;
  const metricsPath = path.join(outputDir, `${base}.metrics.json`);
  const screenshotPath = path.join(outputDir, `${base}.png`);
  await writeFile(metricsPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  await writeFile(screenshotPath, screenshot);
  await testInfo.attach(`${base}.metrics.json`, {
    path: metricsPath,
    contentType: "application/json",
  });
  await testInfo.attach(`${base}.png`, {
    path: screenshotPath,
    contentType: "image/png",
  });
}

async function gotoRunCyclePhase(page: Page, phase: RunCyclePhase) {
  const url = `${BASE_URL}/dev/motion-plan-lab?preset=run-right&paused=1&phase=${phase}`;
  const response = await page.goto(url, { waitUntil: "networkidle" }).catch(() => null);
  if (!response?.ok()) {
    return null;
  }
  await expect(page.getByTestId("motion-preview-actor")).toBeVisible();
  await expect(page.getByTestId("motion-human-svg")).toBeVisible();
  await waitForPhaseSeek(page);
  return url;
}

test.describe("motion-plan-lab visual evaluation", () => {
  test("run-right preset の 4 フェーズ骨格ルールを検証する", async ({ page }, testInfo) => {
    const preset = "run-right";
    const byPhase = {} as Record<
      RunCyclePhase,
      Awaited<ReturnType<typeof collectPhaseSnapshot>>
    >;

    for (const phase of RUN_CYCLE_PHASES) {
      const url = await gotoRunCyclePhase(page, phase);
      test.skip(!url, `Motion Plan Lab is not reachable. Start dev server or set MOTION_LAB_BASE_URL.`);

      const screenshot = await page.getByTestId("motion-preview-actor").screenshot();
      const snapshot = await collectPhaseSnapshot(page, phase);
      byPhase[phase] = snapshot;
      await writePhaseArtifacts(testInfo, preset, phase, snapshot, screenshot);

      expect(snapshot.noObviousClipping, `${phase}: clipping`).toBe(true);
      expect(snapshot.checks.bodyLeansRight, `${phase}: body lean`).toBe(true);
      expect(snapshot.checks.phaseRulesOk, `${phase}: phase rules`).toBe(true);
    }

    const measurementsByPhase = Object.fromEntries(
      RUN_CYCLE_PHASES.map((p) => [p, byPhase[p].measurements]),
    ) as Record<RunCyclePhase, (typeof byPhase)["contact"]["measurements"]>;
    const checksByPhase = Object.fromEntries(
      RUN_CYCLE_PHASES.map((p) => [p, byPhase[p].checks]),
    ) as Record<RunCyclePhase, (typeof byPhase)["contact"]["checks"]>;

    const cross = evaluateCrossPhaseRules(measurementsByPhase, checksByPhase);

    const crossPath = testInfo.outputPath("motion-lab/run-right-cross-phase.json");
    await mkdir(path.dirname(crossPath), { recursive: true });
    await writeFile(
      crossPath,
      `${JSON.stringify({ cross, measurementsByPhase, phaseSeek: RUN_CYCLE_PHASE_SEEK }, null, 2)}\n`,
      "utf8",
    );
    await testInfo.attach("run-right-cross-phase.json", {
      path: crossPath,
      contentType: "application/json",
    });

    expect(cross.bobHighestAtLanding, "Contact/Pass で body bob が最高").toBe(true);
    expect(cross.bobLowestAtSupport, "Down/Up で body bob が最低").toBe(true);
    expect(cross.headBobAmplitudeOk, "上下動は穏やか").toBe(true);
    expect(cross.armAlternates, "腕が Contact↔Pass で交互").toBe(true);
    expect(cross.rightArmMoves, "右腕(画面左)が 15px 以上動く").toBe(true);
    expect(cross.strideMirrors, "Contact/Pass で歩幅が左右対称").toBe(true);
    expect(cross.allPhasesOk, "全フェーズ OK").toBe(true);

    const contactRightFoot = byPhase.contact.endEffectors["motion-foot-right"];
    const contactLeftFoot = byPhase.contact.endEffectors["motion-foot-left"];
    const downRightFoot = byPhase.down.endEffectors["motion-foot-right"];
    const downLeftFoot = byPhase.down.endEffectors["motion-foot-left"];
    const passRightFoot = byPhase.pass.endEffectors["motion-foot-right"];
    const passLeftFoot = byPhase.pass.endEffectors["motion-foot-left"];

    expect(
      requireMetric(contactRightFoot?.centerX ?? null, "Contact 右足先 X") -
      requireMetric(contactLeftFoot?.centerX ?? null, "Contact 左足先 X"),
      "Contact で右足先が左足先より前",
    ).toBeGreaterThan(60);
    expect(
      requireMetric(passLeftFoot?.centerX ?? null, "Pass 左足先 X") -
      requireMetric(passRightFoot?.centerX ?? null, "Pass 右足先 X"),
      "Pass で左足先が右足先より前",
    ).toBeGreaterThan(30);
    const downLowestFootBottom = Math.max(
      requireMetric(bottom(downRightFoot), "Down 右足先 bottom"),
      requireMetric(bottom(downLeftFoot), "Down 左足先 bottom"),
    );
    expectNearGround(downLowestFootBottom, "Down 支持脚側の足先 bottom");
    expect(
      requireMetric(bottom(passLeftFoot), "Pass 左足先 bottom") -
      requireMetric(bottom(passRightFoot), "Pass 右足先 bottom"),
      "Pass で着地脚の左足先が右足先より低い",
    ).toBeGreaterThan(12);
    const upRightFoot = byPhase.up.endEffectors["motion-foot-right"];
    const upLeftFoot = byPhase.up.endEffectors["motion-foot-left"];
    const upLowestFootBottom = Math.max(
      requireMetric(bottom(upRightFoot), "Up 右足先 bottom"),
      requireMetric(bottom(upLeftFoot), "Up 左足先 bottom"),
    );
    expectNearGround(upLowestFootBottom, "Up 支持脚側の足先 bottom");
    expect(
      Math.abs(
        requireMetric(contactRightFoot?.centerX ?? null, "Contact 右足先 X") -
        requireMetric(passRightFoot?.centerX ?? null, "Pass 右足先 X"),
      ),
      "右足先が Contact↔Pass で十分に移動する",
    ).toBeGreaterThan(100);
  });

  test("run-right contact フェーズのスクリーンショットを保存する", async ({ page }, testInfo) => {
    const preset = "run-right";
    const phase: RunCyclePhase = "contact";
    const url = await gotoRunCyclePhase(page, phase);
    test.skip(!url, `Motion Plan Lab is not reachable at ${BASE_URL}.`);

    const screenshot = await page.getByTestId("motion-preview-actor").screenshot();
    const snapshot = await collectPhaseSnapshot(page, phase);
    await writePhaseArtifacts(testInfo, preset, phase, snapshot, screenshot);

    expect(snapshot.checks.contralateral).toBe(true);
    expect(snapshot.checks.bodyLeansRight).toBe(true);
  });
});
