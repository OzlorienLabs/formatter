import { test, expect } from "@playwright/test";
test("home loads", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /125 developer tools/i })).toBeVisible();
});
test("json formatter example", async ({ page }) => {
  await page.goto("/tools/json-formatter");
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.locator("#tool-output")).not.toBeEmpty();
});
test("base64 roundtrip", async ({ page }) => {
  await page.goto("/tools/base64-encoder");
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.locator("#tool-output")).toContainText("SGVsbG8");
});
test("mobile no overflow", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/tools/json-to-csv");
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(w).toBeLessThanOrEqual(361);
});
