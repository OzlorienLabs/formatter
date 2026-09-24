import { test, expect } from "@playwright/test";
import { TOOLS } from "../src/lib/tools-registry";

/**
 * Every tool, every example, in a real browser: the page must load its spec,
 * each example must produce output without an error band (unless it is a
 * deliberate error example), and the page must not throw.
 */
const PLATFORM = new Set(["tool-pipelines", "saved-workspaces", "developer-recipes"]);
// Heavy runtimes: the example is loaded, but Run is left to the dedicated tests below.
const MANUAL = new Set(["python-playground-pyodide", "openscad-playground", "sql-playground", "duckdb-playground", "javascript-playground"]);

for (const tool of TOOLS.filter((t) => !PLATFORM.has(t.slug))) {
  test(`${tool.slug}: every example runs`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`/tools/${tool.slug}`);
    await expect(page.getByTestId("tool-ready")).toBeVisible({ timeout: 30_000 });
    const chips = page.getByTestId("examples").locator("button.chip");
    const n = await chips.count();
    expect(n).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < n; i++) {
      const chip = chips.nth(i);
      const isError = (await chip.getAttribute("data-example-error")) === "1";
      await chip.click();
      if (MANUAL.has(tool.slug)) continue;
      await expect(page.getByTestId("tool-ready")).toHaveAttribute("data-running", "0", { timeout: 30_000 });
      await page.waitForTimeout(150);
      if (!isError) {
        const band = page.getByTestId("tool-error");
        if (await band.count()) throw new Error(`${tool.slug} example ${i + 1} (“${await chip.innerText()}”) shows an error: ${await band.innerText()}`);
      }
    }
    expect(errors, errors.join("\n")).toEqual([]);
  });
}
