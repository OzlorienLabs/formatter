/* Formatter service worker — offline cache and the /mock-api/ bridge.
 *
 * Pages:          network first (3s), cached copy when offline.
 * /_next/static:  cache first (content-hashed, immutable).
 * /vendor:        cache first, refreshed in the background.
 * /mock-api/*:    answered by an open app tab (src/tools/lib/mockapi.ts), never the network.
 *
 * Nothing here talks to any origin but this one.
 */
const VERSION = "fmt-v1";
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

  if (url.pathname.startsWith("/mock-api/")) {
    event.respondWith(mockResponse(request));
    return;
  }
  if (request.method !== "GET") return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, STATIC, false));
    return;
  }
  if (url.pathname.startsWith("/vendor/") || url.pathname.startsWith("/workers/")) {
    event.respondWith(cacheFirst(request, VENDOR, true));
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
        const isVendor = u.startsWith("/vendor/") || u.startsWith("/workers/");
        const cache = isVendor ? vendor : u.startsWith("/_next/static/") ? statics : pages;
        const key = isVendor || u.startsWith("/_next/") ? u : pageKey(self.location.origin + u);
        if (!(await cache.match(key))) {
          const res = await fetch(u, { credentials: "same-origin" });
          if (res.ok) {
            if (!isVendor && !u.startsWith("/_next/") && res.headers.get("content-type")?.includes("text/html")) {
              const html = await res.clone().text();
              // Queue the page's own script and style chunks.
              for (const m of html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)) if (!queue.includes(m[1])) queue.push(m[1]);
            }
            await cache.put(key, res);
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
