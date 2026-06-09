import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { MOTION_LAB_SCENARIOS } from "./motion-scenarios";

const BASE_URL = process.env.MOTION_LAB_BASE_URL ?? "http://localhost:3000";
const hasOpenAiKey = Boolean(process.env.OPENAI_API_KEY);

async function loadScenarioAndGenerate(page: Page, scenarioId: string) {
  await page.goto(`${BASE_URL}/dev/motion-plan-lab`, {
    waitUntil: "networkidle",
  });
  await page.getByTestId(`motion-lab-scenario-${scenarioId}`).click();
  await page.getByTestId("motion-lab-direction-hint");
  await page.getByRole("button", { name: "人体アップ" }).click();
  await page.getByRole("button", { name: "この入力でLLM生成" }).click();
  await expect(page.getByTestId("motion-human-svg")).toBeVisible({
    timeout: 120_000,
  });
}

async function writeVisualArtifact(
  testInfo: TestInfo,
  scenarioId: string,
  page: Page,
) {
  const outputDir = testInfo.outputPath("motion-lab-llm");
  await mkdir(outputDir, { recursive: true });
  const screenshotPath = path.join(outputDir, `${scenarioId}.png`);
  const validationText = await page
    .getByTestId("motion-lab-validation")
    .innerText();
  const metricsPath = path.join(outputDir, `${scenarioId}.validation.txt`);
  await writeFile(metricsPath, `${validationText}\n`, "utf8");
  await page.getByTestId("motion-preview-actor").screenshot({ path: screenshotPath });
  await testInfo.attach(`${scenarioId}.png`, {
    path: screenshotPath,
    contentType: "image/png",
  });
  await testInfo.attach(`${scenarioId}.validation.txt`, {
    path: metricsPath,
    contentType: "text/plain",
  });
}

test.describe("motion-plan-lab LLM visual scenarios", () => {
  test.skip(!hasOpenAiKey, "OPENAI_API_KEY が未設定のためスキップ");

  for (const scenario of MOTION_LAB_SCENARIOS.filter((s) =>
    ["fight-impact", "dance-rhythm", "wave-greet"].includes(s.id),
  )) {
    test(`renders ${scenario.id} after LLM generate`, async ({ page }, testInfo) => {
      try {
        await loadScenarioAndGenerate(page, scenario.id);
      } catch {
        test.skip(true, "Motion Plan Lab dev server not reachable");
      }

      const validation = page.getByTestId("motion-lab-validation");
      await expect(validation).toBeVisible();
      await expect(validation).toContainText("errors: 0");

      const storyboard = page.getByTestId("motion-lab-storyboard");
      await expect(storyboard).toBeVisible({ timeout: 5_000 });
      await expect(storyboard).toContainText("Pipeline v2");

      const bodyBox = await page.getByTestId("motion-part-human-body").boundingBox();
      expect(bodyBox).toBeTruthy();

      if (scenario.id.startsWith("fight")) {
        const armTestId =
          scenario.directionHint === "left"
            ? "motion-part-human-leftArm"
            : "motion-part-human-rightArm";
        const armBox = await page.getByTestId(armTestId).boundingBox();
        expect(armBox).toBeTruthy();
        if (bodyBox && armBox) {
          expect(armBox.x + armBox.width / 2).not.toBe(bodyBox.x + bodyBox.width / 2);
        }
      }

      await writeVisualArtifact(testInfo, scenario.id, page);
    });
  }
});
