import { test, expect, type Page } from "@playwright/test";

const CMD = process.platform === "darwin" ? "Meta" : "Control";

async function openTool(page: Page, slug: string) {
  await page.goto(`/tools/${slug}`);
  await expect(page.locator("#tool-input")).toBeVisible();
}

test("landing loads with the hero and the ledger", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Paste it in\./ })).toBeVisible();
  await expect(page.getByText("bytes uploaded")).toBeVisible();
});

test("json formatter runs", async ({ page }) => {
  await openTool(page, "json-formatter");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.locator("#tool-output")).not.toBeEmpty();
});

test("base64 roundtrip", async ({ page }) => {
  await openTool(page, "base64-encoder");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.locator("#tool-output")).toContainText("SGVsbG8");
});

test("an error is a band above the last good output", async ({ page }) => {
  await openTool(page, "json-formatter");
  await expect(page.locator("#tool-output")).toContainText("ada");
  await page.locator("#tool-input").fill("{ not json");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByTestId("tool-error")).toBeVisible();
  // The previous output survives — the pane is not replaced.
  await expect(page.locator("#tool-output")).toContainText("ada");
});

test("⌘K opens the palette and enter lands on the tool", async ({ page }) => {
  await page.goto("/tools");
  await page.keyboard.press(`${CMD}+k`);
  const input = page.getByTestId("palette-input");
  await expect(input).toBeFocused();
  await input.fill("jwt");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/tools\/jwt-decoder$/);
});

test("escape closes the palette", async ({ page }) => {
  await page.goto("/tools");
  await page.keyboard.press(`${CMD}+k`);
  await expect(page.getByTestId("palette-input")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("palette-input")).toHaveCount(0);
});

test("starring a tool pins it to the rail and survives a reload", async ({ page }) => {
  await openTool(page, "json-minifier");
  await page.getByRole("button", { name: "Star JSON Minifier" }).click();
  const rail = page.locator("aside.rail");
  await expect(rail.getByText("Favourites")).toBeVisible();
  // It shows under Favourites as well as under Recent.
  await expect(rail.getByRole("link", { name: "JSON Minifier" })).toHaveCount(2);

  await page.reload();
  await expect(page.locator("aside.rail").getByText("Favourites")).toBeVisible();
  await expect(page.locator("aside.rail").getByRole("link", { name: "JSON Minifier" }).first()).toBeVisible();
});

test("a run is recorded and Restore brings the input back", async ({ page }) => {
  await openTool(page, "text-to-hex");
  await page.locator("#tool-input").fill("restore me");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.locator("#tool-output")).toContainText("72");

  // Navigate away, then restore from the drawer.
  await openTool(page, "json-minifier");
  await page.getByRole("button", { name: /^History/ }).click();
  const entry = page.locator('[data-testid="history-entry"][data-slug="text-to-hex"]').first();
  await entry.getByRole("button", { name: "Restore" }).click();

  await expect(page).toHaveURL(/\/tools\/text-to-hex$/);
  await expect(page.locator("#tool-input")).toHaveValue("restore me");
  await expect(page.locator("#tool-output")).toContainText("72");
});

test("the Encoding chip narrows the grid to ten cards", async ({ page }) => {
  await page.goto("/tools");
  await expect(page.getByTestId("tool-card")).toHaveCount(125);
  await page.getByRole("button", { name: /^Encoding/ }).click();
  await expect(page.getByTestId("tool-card")).toHaveCount(10);
});

test("the category route preselects its chip", async ({ page }) => {
  await page.goto("/categories/time");
  await expect(page.getByRole("heading", { name: "Time", exact: true })).toBeVisible();
  await expect(page.getByTestId("tool-card")).toHaveCount(2);
});

test("the rail is off-canvas at 900px", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 800 });
  await openTool(page, "json-formatter");
  const rail = page.locator("aside.rail");
  await expect(rail).toHaveAttribute("data-open", "0");
  const offscreen = await rail.evaluate((el) => el.getBoundingClientRect().right <= 0);
  expect(offscreen).toBe(true);

  await page.getByRole("button", { name: "Menu" }).click();
  await expect(rail).toHaveAttribute("data-open", "1");
  // The slide-in takes 280ms.
  await expect.poll(() => rail.evaluate((el) => el.getBoundingClientRect().right)).toBeGreaterThan(0);
});

test("the split pane stacks at 1100px", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await openTool(page, "json-formatter");
  const columns = await page.locator("div.split").evaluate((el) => getComputedStyle(el).gridTemplateColumns);
  expect(columns.split(" ")).toHaveLength(1);
});

test("mobile does not overflow", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await openTool(page, "json-to-csv");
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(w).toBeLessThanOrEqual(361);
});
