import { test, expect } from "@playwright/test";

/**
 * The whole app must work with the network gone: pages, lazily loaded tool
 * code, self-hosted wasm runtimes and the /mock-api bridge.
 */
test("everything works offline once cached", async ({ page, context }) => {
  test.setTimeout(240_000);
  await page.goto("/tools/json-formatter");
  await expect(page.getByTestId("tool-ready")).toBeVisible();
  // First visit registers the worker; a reload puts the page under its control.
  await page.waitForFunction(() => navigator.serviceWorker?.ready.then(() => true), null, { timeout: 30_000 });
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30_000 });

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Make every tool available offline" }).click();
  await expect(page.getByText(/Done — \d+ files cached/)).toBeVisible({ timeout: 180_000 });
  await page.keyboard.press("Escape");

  await context.setOffline(true);

  for (const [slug, expectText] of [
    ["jq-playground", "Ada"],
    ["js-formatter", "const"],
    ["sql-formatter", "SELECT"],
    ["hash-generator", ""],
    ["csv-query-sql", ""],
  ] as const) {
    await page.goto(`/tools/${slug}`);
    await expect(page.getByTestId("tool-ready")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("tool-ready")).toHaveAttribute("data-running", "0", { timeout: 30_000 });
    await expect(page.getByTestId("tool-error")).toHaveCount(0);
    if (expectText) await expect(page.getByTestId("output-pane")).toContainText(expectText);
  }

  await page.goto("/pipelines");
  await page.getByTestId("pipeline-example").first().click();
  await page.getByTestId("run-chain").click();
  await expect(page.getByTestId("step-status").last()).toHaveAttribute("data-status", "ok");

  // Real CPython, from the cache, inside a worker.
  await page.goto("/tools/python-playground-pyodide");
  await expect(page.getByTestId("tool-ready")).toBeVisible();
  await page.getByRole("button", { name: "Run", exact: true }).first().click();
  await expect(page.getByText("Sum of squares 1..10 = 385")).toBeVisible({ timeout: 90_000 });

  const res = await page.evaluate(async () => {
    const r = await fetch("/mock-api/users/2");
    return { status: r.status, body: await r.json() };
  });
  expect(res.status).toBe(200);
  expect(res.body.name).toBeTruthy();
});
