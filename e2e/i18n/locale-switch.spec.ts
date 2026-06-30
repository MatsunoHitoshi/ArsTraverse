import { test, expect } from "@playwright/test";

test.describe("locale routing", () => {
  test("shows English content on /en/about", async ({ page }) => {
    await page.goto("/en/about");

    await expect(page.getByText("Try ArsTraverse")).toBeVisible();
  });

  test("shows Japanese content on /about", async ({ page }) => {
    await page.goto("/about");

    await expect(page.getByText("ArsTraverseを試してみる")).toBeVisible();
  });

  test("shows English sign-in text on /en/dashboard", async ({ page }) => {
    await page.goto("/en/dashboard");

    await expect(page.getByText("Sign Up/Sign In")).toBeVisible();
  });
});
