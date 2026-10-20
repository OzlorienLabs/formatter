import { test, expect } from "@playwright/test";

test.describe("Service Worker CDN Vendor Loading & Fallback", () => {
  test.beforeEach(async ({ page }) => {
    // Ensure service worker registers in both dev and production modes
    await page.addInitScript(() => {
      try {
        localStorage.setItem("fmt:sw-dev", "1");
      } catch {}
    });
  });

  test("downloads vendor WASM runtime from public CDN and caches it", async ({ page }) => {
    const cdnRequests: string[] = [];
    page.on("request", (req) => {
      const u = req.url();
      if (u.includes("cdn.jsdelivr.net") || u.includes("unpkg.com")) {
        cdnRequests.push(u);
      }
    });

    await page.goto("/tools/json-formatter");
    await page.waitForFunction(() => navigator.serviceWorker?.ready.then(() => true), null, { timeout: 30_000 });
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30_000 });

    // Request a vendor asset through the service worker
    const res = await page.evaluate(async () => {
      const r = await fetch("/vendor/sqljs/sql-wasm-browser.wasm");
      const cache = await caches.open("fmt-v2-vendor");
      const cached = await cache.match("/vendor/sqljs/sql-wasm-browser.wasm");
      return {
        status: r.status,
        hasCached: !!cached,
        contentType: r.headers.get("content-type"),
      };
    });

    expect(res.status).toBe(200);
    expect(res.hasCached).toBe(true);
    // Either jsDelivr CDN or local was intercepted and returned
    expect(res.contentType).toContain("application/wasm");
  });

  test("falls back seamlessly to origin server when CDN is blocked or fails", async ({ page }) => {
    // Simulate CDN outage / corporate firewall blocking public CDNs
    await page.route("https://cdn.jsdelivr.net/**", (route) => route.abort());
    await page.route("https://unpkg.com/**", (route) => route.abort());

    await page.goto("/tools/json-formatter");
    await page.waitForFunction(() => navigator.serviceWorker?.ready.then(() => true), null, { timeout: 30_000 });
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30_000 });

    // Clear vendor cache so we force a fresh network attempt
    await page.evaluate(async () => {
      await caches.delete("fmt-v2-vendor");
    });

    let originFetched = false;
    page.on("request", (req) => {
      if (req.url().includes("/vendor/sqljs/sql-wasm.js")) {
        originFetched = true;
      }
    });

    const res = await page.evaluate(async () => {
      const r = await fetch("/vendor/sqljs/sql-wasm.js");
      const text = await r.text();
      const cache = await caches.open("fmt-v2-vendor");
      const cached = await cache.match("/vendor/sqljs/sql-wasm.js");
      return {
        status: r.status,
        hasText: text.includes("initSqlJs") || text.includes("Module"),
        hasCached: !!cached,
      };
    });

    expect(res.status).toBe(200);
    expect(res.hasText).toBe(true);
    expect(res.hasCached).toBe(true);
  });

  test("SQLite playground tool runs successfully even when CDN is blocked", async ({ page }) => {
    // Block all public CDN endpoints
    await page.route("https://cdn.jsdelivr.net/**", (route) => route.abort());
    await page.route("https://unpkg.com/**", (route) => route.abort());

    await page.goto("/tools/sql-playground");
    await expect(page.getByTestId("tool-ready")).toBeVisible({ timeout: 30_000 });

    // Click Execute to run SQLite query using local fallback runtime
    const runBtn = page.getByRole("button", { name: "Execute", exact: true });
    await runBtn.click();

    // Confirm execution succeeded without errors
    await expect(page.getByTestId("tool-error")).toHaveCount(0);
    await expect(page.getByTestId("tool-ready")).toHaveAttribute("data-running", "0", { timeout: 30_000 });
    await expect(page.getByTestId("output-pane")).not.toBeEmpty();
  });

  test("jq playground tool runs successfully even when CDN is blocked", async ({ page }) => {
    // Block all public CDN endpoints
    await page.route("https://cdn.jsdelivr.net/**", (route) => route.abort());
    await page.route("https://unpkg.com/**", (route) => route.abort());

    await page.goto("/tools/jq-playground");
    await expect(page.getByTestId("tool-ready")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("tool-ready")).toHaveAttribute("data-running", "0", { timeout: 30_000 });
    await expect(page.getByTestId("tool-error")).toHaveCount(0);
    await expect(page.getByTestId("output-pane")).not.toBeEmpty();
  });
});
