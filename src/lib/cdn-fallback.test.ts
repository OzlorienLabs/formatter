import { describe, it, expect, vi } from "vitest";
import { CDN_VENDOR_MAP, fetchVendorWithFallbackCore, type CacheLike } from "./vendor-cdn";
import { FILES } from "../../scripts/vendor.mjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("WebAssembly & Vendor CDN Fallback", () => {
  it("maps every vendor file in scripts/vendor.mjs to a valid public CDN URL", () => {
    for (const [, to] of FILES) {
      const vendorPath = `/vendor/${to}`;
      expect(CDN_VENDOR_MAP[vendorPath], `Missing CDN mapping for ${vendorPath}`).toBeDefined();
      const cdnUrl = CDN_VENDOR_MAP[vendorPath];
      expect(cdnUrl).toMatch(/^https:\/\/(cdn\.jsdelivr\.net|unpkg\.com)\//);
    }
  });

  it("does not have orphan mappings in CDN_VENDOR_MAP", () => {
    const known = new Set(FILES.map(([, to]) => `/vendor/${to}`));
    for (const key of Object.keys(CDN_VENDOR_MAP)) {
      expect(known.has(key), `Orphan CDN mapping: ${key}`).toBe(true);
    }
  });

  it("syncs exact CDN_VENDOR_MAP with public/sw.js", () => {
    const swContent = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");
    for (const [vendorPath, cdnUrl] of Object.entries(CDN_VENDOR_MAP)) {
      expect(swContent).toContain(`"${vendorPath}": "${cdnUrl}"`);
    }
  });

  describe("fetchVendorWithFallbackCore", () => {
    it("returns cached response immediately on cache hit without making any fetch", async () => {
      const cachedResponse = new Response("cached-data", { status: 200 });
      const cache: CacheLike = {
        match: vi.fn().mockResolvedValue(cachedResponse),
        put: vi.fn().mockResolvedValue(undefined),
      };
      const fetchFn = vi.fn();

      const res = await fetchVendorWithFallbackCore({
        cache,
        requestOrUrl: "/vendor/openscad/openscad.js",
        fetchFn,
      });

      expect(res).toBe(cachedResponse);
      expect(cache.match).toHaveBeenCalledWith("/vendor/openscad/openscad.js");
      expect(fetchFn).not.toHaveBeenCalled();
      expect(cache.put).not.toHaveBeenCalled();
    });

    it("fetches from CDN on cache miss, caches it, and does not hit origin server", async () => {
      const cdnResponse = new Response("cdn-wasm-data", {
        status: 200,
        headers: { "content-type": "application/javascript" },
      });
      const cache: CacheLike = {
        match: vi.fn().mockResolvedValue(undefined),
        put: vi.fn().mockResolvedValue(undefined),
      };
      const fetchFn = vi.fn().mockImplementation((url: string) => {
        if (url.startsWith("https://cdn.jsdelivr.net/")) {
          return Promise.resolve(cdnResponse);
        }
        return Promise.reject(new Error("Should not reach origin"));
      });

      const res = await fetchVendorWithFallbackCore({
        cache,
        requestOrUrl: "/vendor/openscad/openscad.js",
        fetchFn,
      });

      expect(res.status).toBe(200);
      expect(await res.text()).toBe("cdn-wasm-data");
      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(fetchFn).toHaveBeenCalledWith(
        "https://cdn.jsdelivr.net/npm/openscad-wasm-prebuilt@1.2.0/dist/openscad.js",
        expect.objectContaining({ mode: "cors" })
      );
      expect(cache.put).toHaveBeenCalledWith("/vendor/openscad/openscad.js", expect.any(Response));
    });

    it("falls back to origin server when CDN returns an HTTP error (e.g., 503 or 500)", async () => {
      const cdnFailResponse = new Response("CDN Service Unavailable", { status: 503 });
      const originResponse = new Response("origin-fallback-data", { status: 200 });

      const cache: CacheLike = {
        match: vi.fn().mockResolvedValue(undefined),
        put: vi.fn().mockResolvedValue(undefined),
      };

      const fetchFn = vi.fn().mockImplementation((url: string) => {
        if (url.startsWith("https://cdn.jsdelivr.net/")) {
          return Promise.resolve(cdnFailResponse);
        }
        if (url === "/vendor/openscad/openscad.js") {
          return Promise.resolve(originResponse);
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      const res = await fetchVendorWithFallbackCore({
        cache,
        requestOrUrl: "/vendor/openscad/openscad.js",
        fetchFn,
      });

      expect(res.status).toBe(200);
      expect(await res.text()).toBe("origin-fallback-data");
      expect(fetchFn).toHaveBeenCalledTimes(2);
      expect(cache.put).toHaveBeenCalledWith("/vendor/openscad/openscad.js", expect.any(Response));
    });

    it("falls back to origin server when CDN fetch throws a network error or times out", async () => {
      const originResponse = new Response("origin-fallback-data", { status: 200 });

      const cache: CacheLike = {
        match: vi.fn().mockResolvedValue(undefined),
        put: vi.fn().mockResolvedValue(undefined),
      };

      const fetchFn = vi.fn().mockImplementation((url: string) => {
        if (url.startsWith("https://cdn.jsdelivr.net/")) {
          return Promise.reject(new TypeError("Failed to fetch (DNS/Network error)"));
        }
        if (url === "/vendor/openscad/openscad.js") {
          return Promise.resolve(originResponse);
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      const res = await fetchVendorWithFallbackCore({
        cache,
        requestOrUrl: "/vendor/openscad/openscad.js",
        fetchFn,
      });

      expect(res.status).toBe(200);
      expect(await res.text()).toBe("origin-fallback-data");
      expect(fetchFn).toHaveBeenCalledTimes(2);
      expect(cache.put).toHaveBeenCalledWith("/vendor/openscad/openscad.js", expect.any(Response));
    });

    it("propagates origin response when both CDN and origin fail", async () => {
      const cdnFailResponse = new Response("CDN 500", { status: 500 });
      const originFailResponse = new Response("Origin 404", { status: 404 });

      const cache: CacheLike = {
        match: vi.fn().mockResolvedValue(undefined),
        put: vi.fn().mockResolvedValue(undefined),
      };

      const fetchFn = vi.fn().mockImplementation((url: string) => {
        if (url.startsWith("https://cdn.jsdelivr.net/")) {
          return Promise.resolve(cdnFailResponse);
        }
        return Promise.resolve(originFailResponse);
      });

      const res = await fetchVendorWithFallbackCore({
        cache,
        requestOrUrl: "/vendor/openscad/openscad.js",
        fetchFn,
      });

      expect(res.status).toBe(404);
      expect(await res.text()).toBe("Origin 404");
    });
  });
});
