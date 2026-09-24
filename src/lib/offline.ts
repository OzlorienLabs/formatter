"use client";

/**
 * Service worker registration, cache warming and the /mock-api/ bridge.
 * The worker (public/sw.js) forwards mock requests here because the mock
 * routes live in this tab's localStorage.
 */
import { useEffect, useState } from "react";
import { TOOLS } from "./tools-registry";
import { CATEGORY_MODULES, loadCategory } from "@/src/tools";

const VENDOR_FILES = [
  "/vendor/jq/jq.wasm",
  "/vendor/sqljs/sql-wasm.js",
  "/vendor/sqljs/sql-wasm-browser.wasm",
  "/vendor/pyodide/pyodide.mjs",
  "/vendor/pyodide/pyodide.asm.mjs",
  "/vendor/pyodide/pyodide.asm.wasm",
  "/vendor/pyodide/python_stdlib.zip",
  "/vendor/pyodide/pyodide-lock.json",
  "/vendor/openscad/openscad.js",
  "/vendor/three/three.module.js",
  "/vendor/three/three.core.js",
  "/vendor/three/addons/controls/OrbitControls.js",
  "/vendor/three/addons/loaders/STLLoader.js",
  "/workers/python.js",
  "/workers/openscad.js",
];

export const PAGE_URLS = ["/", "/tools", "/pipelines", "/recipes", "/workspaces", "/about/privacy", ...TOOLS.map((t) => `/tools/${t.slug}`)];

const swSupported = () => typeof navigator !== "undefined" && "serviceWorker" in navigator;

function shouldRegister() {
  if (!swSupported()) return false;
  if (process.env.NODE_ENV === "production") return true;
  try {
    return localStorage.getItem("fmt:sw-dev") === "1";
  } catch {
    return false;
  }
}

async function answerMock(e: MessageEvent) {
  const d = e.data;
  if (!d || d.type !== "mock-request" || !e.ports[0]) return;
  try {
    const { resolveMock } = await import("@/src/tools/lib/mockapi");
    const response = await resolveMock(d.method, d.url, d.headers ?? {}, d.body ?? "");
    e.ports[0].postMessage({ type: "mock-response", response });
  } catch (err) {
    e.ports[0].postMessage({
      type: "mock-response",
      response: { status: 500, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: String(err) }), delay: 0 },
    });
  }
}

/** Posts URLs to the worker to cache; resolves when done. */
export function warm(urls: string[], onProgress?: (done: number, total: number) => void): Promise<number> {
  return new Promise(async (resolve) => {
    if (!swSupported()) return resolve(0);
    const reg = await navigator.serviceWorker.ready;
    const sw = reg.active;
    if (!sw) return resolve(0);
    const ch = new MessageChannel();
    ch.port1.onmessage = (e) => {
      if (e.data?.type === "warm-progress") onProgress?.(e.data.done, e.data.total);
      if (e.data?.type === "warm-done") resolve(e.data.done);
    };
    sw.postMessage({ type: "warm", urls }, [ch.port2]);
  });
}

/** Loads every tool module so their chunks pass through (and into) the cache. */
export async function warmModules() {
  for (const c of CATEGORY_MODULES) {
    await loadCategory(c).catch(() => {});
  }
}

export async function makeEverythingOffline(onProgress?: (done: number, total: number) => void) {
  await warmModules();
  return warm([...PAGE_URLS, ...VENDOR_FILES], onProgress);
}

export async function clearOfflineCache() {
  if (!swSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  reg?.active?.postMessage({ type: "clear" });
}

/** Mounted once in the shell. */
export function useOfflineBridge() {
  useEffect(() => {
    if (!swSupported()) return;
    navigator.serviceWorker.addEventListener("message", answerMock);
    if (shouldRegister()) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then(() => {
          // Once idle, cache every page and tool module so the whole app works offline.
          const go = () => {
            void warmModules().then(() => warm(PAGE_URLS));
          };
          const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
          setTimeout(() => (w.requestIdleCallback ? w.requestIdleCallback(go, { timeout: 10000 }) : go()), 4000);
        })
        .catch(() => {});
    }
    return () => navigator.serviceWorker.removeEventListener("message", answerMock);
  }, []);
}

export function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}
