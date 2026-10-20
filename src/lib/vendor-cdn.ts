/**
 * Public CDN mappings for self-hosted WebAssembly and runtime assets.
 * Allows client browsers to download heavy binaries (OpenSCAD 11MB, Pyodide 13MB)
 * from global free CDNs (jsDelivr / unpkg) instead of burning Vercel server bandwidth,
 * with automatic fallback to the origin server if the CDN fails.
 */

export const CDN_VENDOR_MAP: Record<string, string> = {
  "/vendor/jq/jq.wasm": "https://unpkg.com/jq-wasm@3.0.0-jq-1.8.2/dist/build/jq.wasm",
  "/vendor/sqljs/sql-wasm.js": "https://cdn.jsdelivr.net/npm/sql.js@1.14.2/dist/sql-wasm-browser.js",
  "/vendor/sqljs/sql-wasm-browser.wasm": "https://cdn.jsdelivr.net/npm/sql.js@1.14.2/dist/sql-wasm-browser.wasm",
  "/vendor/pyodide/pyodide.mjs": "https://cdn.jsdelivr.net/npm/pyodide@314.0.7/pyodide.mjs",
  "/vendor/pyodide/pyodide.asm.mjs": "https://cdn.jsdelivr.net/npm/pyodide@314.0.7/pyodide.asm.mjs",
  "/vendor/pyodide/pyodide.asm.wasm": "https://cdn.jsdelivr.net/npm/pyodide@314.0.7/pyodide.asm.wasm",
  "/vendor/pyodide/python_stdlib.zip": "https://cdn.jsdelivr.net/npm/pyodide@314.0.7/python_stdlib.zip",
  "/vendor/pyodide/pyodide-lock.json": "https://cdn.jsdelivr.net/npm/pyodide@314.0.7/pyodide-lock.json",
  "/vendor/openscad/openscad.js": "https://cdn.jsdelivr.net/npm/openscad-wasm-prebuilt@1.2.0/dist/openscad.js",
  "/vendor/three/three.module.js": "https://cdn.jsdelivr.net/npm/three@0.186.0/build/three.module.js",
  "/vendor/three/three.core.js": "https://cdn.jsdelivr.net/npm/three@0.186.0/build/three.core.js",
  "/vendor/three/addons/controls/OrbitControls.js": "https://cdn.jsdelivr.net/npm/three@0.186.0/examples/jsm/controls/OrbitControls.js",
  "/vendor/three/addons/loaders/STLLoader.js": "https://cdn.jsdelivr.net/npm/three@0.186.0/examples/jsm/loaders/STLLoader.js",
};

export interface CacheLike {
  match(request: any): Promise<Response | undefined>;
  put(request: any, response: Response): Promise<void>;
}

export interface FetchVendorOptions {
  cache: CacheLike;
  requestOrUrl: string | { url: string };
  originBase?: string;
  cdnMap?: Record<string, string>;
  timeoutMs?: number;
  fetchFn?: (input: any, init?: any) => Promise<Response>;
}

/**
 * Fetch vendor asset: Cache -> CDN -> Origin Server fallback.
 */
export async function fetchVendorWithFallbackCore({
  cache,
  requestOrUrl,
  originBase = "http://localhost",
  cdnMap = CDN_VENDOR_MAP,
  timeoutMs = 6000,
  fetchFn = globalThis.fetch,
}: FetchVendorOptions): Promise<Response> {
  const hit = await cache.match(requestOrUrl);
  if (hit) return hit;

  const urlStr = typeof requestOrUrl === "string" ? requestOrUrl : requestOrUrl.url;
  const pathname = new URL(urlStr, originBase).pathname;
  const cdnUrl = cdnMap[pathname];

  if (cdnUrl) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const cdnRes = await fetchFn(cdnUrl, { mode: "cors", signal: controller.signal });
      clearTimeout(timer);
      if (cdnRes && cdnRes.ok) {
        await cache.put(requestOrUrl, cdnRes.clone());
        return cdnRes;
      }
    } catch {
      // CDN timed out, network error, or blocked -> fallback to origin server
    }
  }

  const originRes = await fetchFn(requestOrUrl as any);
  if (originRes && originRes.ok) {
    await cache.put(requestOrUrl, originRes.clone());
  }
  return originRes;
}
