import { test, expect } from "@playwright/test";

test("pipeline: example loads, runs, saves and reloads", async ({ page }) => {
  await page.goto("/pipelines");
  await page.getByTestId("pipeline-example").first().click();
  await expect(page.getByTestId("pipeline-step")).toHaveCount(2);
  await page.getByTestId("run-chain").click();
  await expect(page.getByTestId("step-status").first()).toHaveAttribute("data-status", "ok");
  await expect(page.getByTestId("pipeline-result")).toContainText('"billing-api"');
  await page.getByTestId("pipeline-name").fill("My tidy chain");
  await page.getByTestId("pipeline-save").click();
  await page.reload();
  await expect(page.getByTestId("saved-pipeline")).toContainText("My tidy chain");
});

test("pipeline: add steps from the picker and chain them", async ({ page }) => {
  await page.goto("/pipelines");
  await page.locator("#pipe-source").fill('{"b":2,"a":1}');
  await page.getByTestId("add-step").click();
  await page.getByTestId("step-search").fill("json formatter");
  await page.getByTestId("pick-json-formatter").click();
  await page.getByTestId("add-step").click();
  await page.getByTestId("step-search").fill("base64 encode");
  await page.getByTestId("pick-base64-encoder").click();
  await page.getByTestId("run-chain").click();
  await expect(page.getByTestId("step-status")).toHaveCount(2);
  await expect(page.getByTestId("step-status").nth(1)).toHaveAttribute("data-status", "ok");
});

test("pipeline: the Pipeline button on a tool page adds a configured step", async ({ page }) => {
  await page.goto("/tools/json-formatter");
  await expect(page.getByTestId("tool-ready")).toBeVisible();
  await page.getByRole("button", { name: "Pipeline" }).click();
  await expect(page).toHaveURL(/\/pipelines$/);
  await expect(page.getByTestId("pipeline-step")).toHaveCount(1);
  await expect(page.locator("#pipe-source")).not.toHaveValue("");
});

test("workspaces: save a tool state and restore it", async ({ page }) => {
  await page.goto("/tools/json-minifier");
  await expect(page.getByTestId("tool-ready")).toBeVisible();
  await page.locator("#tool-input").fill('{"saved": "in a workspace"}');
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByLabel("New workspace name").fill("E2E space");
  await page.getByRole("button", { name: "Create" }).click();
  await page.goto("/workspaces");
  await page.getByTestId("workspace").filter({ hasText: "E2E space" }).click();
  await page.getByTestId("open-item").first().click();
  await expect(page).toHaveURL(/json-minifier/);
  await expect(page.locator("#tool-input")).toHaveValue('{"saved": "in a workspace"}');
});

test("recipes: run one in place", async ({ page }) => {
  await page.goto("/recipes");
  const first = page.getByTestId("recipe").first();
  await first.getByTestId("recipe-run").click();
  await expect(first.getByTestId("recipe-output")).toBeVisible({ timeout: 20_000 });
});

test("history: runs are recorded per tool, restorable and deletable", async ({ page }) => {
  await page.goto("/tools/base64-encoder");
  await expect(page.getByTestId("tool-ready")).toBeVisible();
  await page.locator("#tool-input").fill("remember me");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await page.getByRole("button", { name: /history for this tool/ }).click();
  const entry = page.getByTestId("tool-history-entry").first();
  await expect(entry).toContainText("remember me");
  await page.locator("#tool-input").fill("something else");
  await entry.getByRole("button", { name: "Restore" }).click();
  await expect(page.locator("#tool-input")).toHaveValue("remember me");
  await entry.getByRole("button", { name: "Delete this run" }).click();
  await expect(page.getByTestId("tool-history-entry")).toHaveCount(0);
});

test("share link round-trips inputs and options", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/tools/json-formatter");
  await expect(page.getByTestId("tool-ready")).toBeVisible();
  await page.locator("#tool-input").fill('{"shared":true}');
  await page.getByRole("button", { name: "Share" }).click();
  const url = page.url();
  expect(url).toContain("#s=");
  const p2 = await context.newPage();
  await p2.goto(url);
  await expect(p2.locator("#tool-input")).toHaveValue('{"shared":true}');
});
