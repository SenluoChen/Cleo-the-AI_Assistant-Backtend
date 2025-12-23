import { test, expect } from "@playwright/test";

test("bubble window loads", async ({ page }) => {
  await page.goto("file:src/renderer/bubble.html");
  await expect(page.locator(".bubble")).toBeVisible();
});
