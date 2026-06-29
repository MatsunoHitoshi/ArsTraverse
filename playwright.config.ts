import { defineConfig } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, ".env") });

process.env.SKIP_ENV_VALIDATION ??= "true";
if (!process.env.NODE_ENV) {
  Object.assign(process.env, { NODE_ENV: "test" });
}

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

export default defineConfig({
  testMatch: /\.spec\.ts$/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  globalSetup: path.resolve(__dirname, "e2e/global-setup.ts"),
  ...(process.env.PLAYWRIGHT_BASE_URL
    ? {}
    : {
        webServer: {
          command: "npm run dev -- --port 3000",
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }),
  projects: [
    {
      name: "kg",
      testDir: "./e2e/kg",
    },
    {
      name: "i18n",
      testDir: "./e2e/i18n",
      use: {
        baseURL,
      },
    },
  ],
});
