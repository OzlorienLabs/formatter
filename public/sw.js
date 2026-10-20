/* Formatter service worker — offline cache and the /mock-api/ bridge.
 *
 * Pages:          network first (3s), cached copy when offline.
 * /_next/static:  cache first (content-hashed, immutable).
 * /vendor:        cache first, refreshed in the background.
 * /mock-api/*:    answered by an open app tab (src/tools/lib/mockapi.ts), never the network.
 *
 * Nothing here talks to any origin but this one.
 */
const VERSION = "fmt-v2";
const PAGES = `${VERSION}-pages`;
const STATIC = `${VERSION}-static`;
const VENDOR = `${VERSION}-vendor`;
const CORE = ["/", "/tools", "/pipelines", "/recipes", "/workspaces", "/manifest.webmanifest", "/icon.svg", "/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGES)
      .then((c) => Promise.all(CORE.map((u) => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function pageKey(url) {
  const u = new URL(url);
  return u.origin + (u.pathname.replace(/\/$/, "") || "/");
}

async function networkFirst(request, key) {
  const cache = await caches.open(PAGES);
  try {
    const res = await Promise.race([
      fetch(request),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 3000)),
    ]);
    if (res && res.ok && res.type === "basic") cache.put(key, res.clone());
    return res;
  } catch (e) {
    const hit = (await cache.match(key)) || (await caches.match(key));
    if (hit) return hit;
    if (request.mode === "navigate") {
      const fallback = (await cache.match(pageKey(self.location.origin + "/tools"))) || (await cache.match(self.location.origin + "/"));
      if (fallback) return fallback;
    }
    throw e;
  }
}

async function cacheFirst(request, name, revalidate) {
  const cache = await caches.open(name);
  const hit = await cache.match(request);
  if (hit) {
    if (revalidate)
      fetch(request)
        .then((res) => res.ok && cache.put(request, res))
        .catch(() => {});
    return hit;
  }
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

/* ── vendor runtime CDN loader with fallback to origin server ─────────── */

const CDN_VENDOR_MAP = {
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

async function fetchVendorWithFallback(requestOrUrl) {
  const cache = await caches.open(VENDOR);
  const hit = await cache.match(requestOrUrl);
  if (hit) return hit;

  const urlStr = typeof requestOrUrl === "string" ? requestOrUrl : requestOrUrl.url;
  const pathname = new URL(urlStr, self.location.origin).pathname;
  const cdnUrl = CDN_VENDOR_MAP[pathname];

  if (cdnUrl) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const cdnRes = await fetch(cdnUrl, { mode: "cors", signal: controller.signal });
      clearTimeout(timer);
      if (cdnRes && cdnRes.ok) {
        await cache.put(requestOrUrl, cdnRes.clone());
        return cdnRes;
      }
    } catch {
      // CDN failed, timed out, or blocked — fall back to origin server
    }
  }

  const originRes = await fetch(requestOrUrl);
  if (originRes && originRes.ok) {
    await cache.put(requestOrUrl, originRes.clone());
  }
  return originRes;
}

/* ── mock API bridge ────────────────────────────────────────────────── */

async function mockResponse(request) {
  const body = request.method === "GET" || request.method === "HEAD" ? "" : await request.text();
  const headers = {};
  request.headers.forEach((v, k) => (headers[k] = v));
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const json = (status, obj) => new Response(JSON.stringify(obj, null, 2), { status, headers: { "content-type": "application/json" } });
  if (!clients.length) return json(503, { error: "The mock API is served by an open Formatter tab. Open the app and try again." });
  for (const client of clients) {
    const answer = await new Promise((resolve) => {
      const ch = new MessageChannel();
      const t = setTimeout(() => resolve(null), 4000);
      ch.port1.onmessage = (e) => {
        clearTimeout(t);
        resolve(e.data);
      };
      client.postMessage({ type: "mock-request", method: request.method, url: request.url, headers, body }, [ch.port2]);
    });
    if (answer && answer.type === "mock-response") {
      if (!answer.response) return json(404, { error: `No mock route matches ${request.method} ${new URL(request.url).pathname}` });
      const r = answer.response;
      // resolveMock has already waited out the route's delay in the page.
      return new Response(request.method === "HEAD" ? null : r.body, { status: r.status, headers: r.headers });
    }
  }
  return json(503, { error: "No open tab answered the mock request." });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/_vercel/")) return; // analytics, never cached

  if (url.pathname.startsWith("/mock-api/")) {
    event.respondWith(mockResponse(request));
    return;
  }
  if (request.method !== "GET") return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, STATIC, false));
    return;
  }
  if (url.pathname.startsWith("/vendor/")) {
    event.respondWith(fetchVendorWithFallback(request));
    return;
  }
  if (url.pathname.startsWith("/workers/")) {
    event.respondWith(cacheFirst(request, VENDOR, false));
    return;
  }
  if (url.pathname.startsWith("/_next/")) return; // HMR, image optimiser, data
  const isRsc = url.searchParams.has("_rsc") || request.headers.get("RSC") === "1";
  if (request.mode === "navigate" || request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(networkFirst(request, pageKey(request.url)));
    return;
  }
  if (isRsc) {
    // Client-side navigation payloads: cache per path + router state tree.
    event.respondWith(networkFirst(request, request.url));
    return;
  }
  event.respondWith(cacheFirst(request, STATIC, true));
});

/* ── warming: the app asks us to fetch pages and assets ahead of time ── */

async function warm(urls, port) {
  let done = 0;
  const queue = [...new Set(urls)];
  const pages = await caches.open(PAGES);
  const vendor = await caches.open(VENDOR);
  const statics = await caches.open(STATIC);
  const worker = async () => {
    while (queue.length) {
      const u = queue.shift();
      try {
        const isVendor = u.startsWith("/vendor/");
        const isWorker = u.startsWith("/workers/");
        if (isVendor) {
          await fetchVendorWithFallback(u);
        } else {
          const cache = isWorker ? vendor : u.startsWith("/_next/static/") ? statics : pages;
          const key = isWorker || u.startsWith("/_next/") ? u : pageKey(self.location.origin + u);
          if (!(await cache.match(key))) {
            const res = await fetch(u, { credentials: "same-origin" });
            if (res.ok) {
              if (!isWorker && !u.startsWith("/_next/") && res.headers.get("content-type")?.includes("text/html")) {
                const html = await res.clone().text();
                // Queue the page's own script and style chunks.
                for (const m of html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)) if (!queue.includes(m[1])) queue.push(m[1]);
              }
              await cache.put(key, res);
            }
          }
        }
      } catch {
        /* offline or gone; try again next time */
      }
      done++;
      if (port && done % 5 === 0) port.postMessage({ type: "warm-progress", done, total: done + queue.length });
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  if (port) port.postMessage({ type: "warm-done", done });
}

self.addEventListener("message", (event) => {
  const d = event.data || {};
  if (d.type === "warm" && Array.isArray(d.urls)) event.waitUntil(warm(d.urls, event.ports[0]));
  if (d.type === "clear") event.waitUntil(caches.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k)))));
});
