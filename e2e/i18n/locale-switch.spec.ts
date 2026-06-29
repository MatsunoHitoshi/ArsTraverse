import { test, expect } from "@playwright/test";

test.describe("locale switch", () => {
  test("shows English header text on /en/dashboard", async ({ page }) => {
    await page.goto("/en/dashboard");

    await expect(page.getByText("Sign Up/Sign In")).toBeVisible();
    await expect(page.getByRole("button", { name: "Japanese" })).toBeVisible();
    await expect(page.getByRole("button", { name: "English" })).toBeVisible();
    await expect(page.getByText("JA", { exact: true })).toBeVisible();
    await expect(page.getByText("EN", { exact: true })).toBeVisible();
  });

  test("locale switcher toggles between JA and EN", async ({ page }) => {
    await page.goto("/en/dashboard");

    await page.getByRole("button", { name: "Japanese" }).click();
    await expect(page.getByText("サインアップ/サインイン")).toBeVisible();

    await page.getByRole("button", { name: "English" }).click();
    await expect(page.getByText("Sign Up/Sign In")).toBeVisible();
  });
});
