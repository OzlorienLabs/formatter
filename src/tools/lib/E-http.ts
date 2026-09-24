/**
 * API Workbench request model: state (stored as JSON in the tool's input),
 * sending (offline /mock-api/ routes resolve in-page; anything else uses
 * fetch() only on an explicit Send), code export and history.
 */
import { isMockUrl, resolveMock, statusText } from "./mockapi";

export type Row = { k: string; v: string; on: boolean };
export type BodyType = "none" | "json" | "form" | "multipart" | "raw" | "text";
export type AuthType = "none" | "bearer" | "basic" | "apikey";
export type ReqState = {
  method: string;
  url: string;
  params: Row[];
  headers: Row[];
  bodyType: BodyType;
  body: string;
  form: Row[];
  rawType: string;
  auth: { type: AuthType; token: string; user: string; pass: string; key: string; value: string; in: "header" | "query" };
};

export const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

export function defaultState(): ReqState {
  return {
    method: "GET",
    url: "/mock-api/users",
    params: [],
    headers: [{ k: "Accept", v: "application/json", on: true }],
    bodyType: "none",
    body: "",
    form: [],
    rawType: "application/xml",
    auth: { type: "none", token: "", user: "", pass: "", key: "X-API-Key", value: "", in: "header" },
  };
}

export function parseState(s: string): ReqState {
  const d = defaultState();
  if (!s?.trim()) return d;
  try {
    const v = JSON.parse(s) as Partial<ReqState>;
    const st: ReqState = { ...d, ...v, auth: { ...d.auth, ...(v.auth ?? {}) } };
    st.params = Array.isArray(v.params) ? v.params : paramsFromUrl(st.url);
    st.headers = Array.isArray(v.headers) ? v.headers : d.headers;
    st.form = Array.isArray(v.form) ? v.form : [];
    return st;
  } catch {
    // A bare URL or "METHOD URL" also works.
    const m = /^([A-Z]+)\s+(\S+)/.exec(s.trim());
    if (m) return { ...d, method: m[1], url: m[2], params: paramsFromUrl(m[2]) };
    return { ...d, url: s.trim(), params: paramsFromUrl(s.trim()) };
  }
}

export const stateJson = (s: ReqState) => JSON.stringify(s);

export function splitUrl(url: string): { base: string; query: string; hash: string } {
  const h = url.indexOf("#");
  const hash = h >= 0 ? url.slice(h) : "";
  const rest = h >= 0 ? url.slice(0, h) : url;
  const q = rest.indexOf("?");
  return { base: q >= 0 ? rest.slice(0, q) : rest, query: q >= 0 ? rest.slice(q + 1) : "", hash };
}

function dec(s: string) {
  try {
    return decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    return s;
  }
}

export function paramsFromUrl(url: string): Row[] {
  const { query } = splitUrl(url);
  if (!query) return [];
  return query.split("&").filter(Boolean).map((p) => {
    const i = p.indexOf("=");
    return { k: dec(i >= 0 ? p.slice(0, i) : p), v: i >= 0 ? dec(p.slice(i + 1)) : "", on: true };
  });
}

const enc = (s: string) => encodeURIComponent(s).replace(/%20/g, "+");

export function urlWithParams(url: string, params: Row[]): string {
  const { base, hash } = splitUrl(url);
  const q = params.filter((p) => p.on && p.k).map((p) => `${enc(p.k)}=${enc(p.v)}`).join("&");
  return base + (q ? "?" + q : "") + hash;
}

/** Keep disabled rows when the URL is edited by hand. */
export function syncParamsFromUrl(url: string, params: Row[]): Row[] {
  return [...paramsFromUrl(url), ...params.filter((p) => !p.on)];
}

const b64 = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
};

export type Built = { method: string; url: string; headers: [string, string][]; body: string | null; multipart: Row[] | null; notes: string[] };

export function build(st: ReqState): Built {
  const notes: string[] = [];
  const headers: [string, string][] = st.headers.filter((h) => h.on && h.k.trim()).map((h) => [h.k.trim(), h.v]);
  const has = (name: string) => headers.some(([k]) => k.toLowerCase() === name.toLowerCase());
  let url = st.url.trim();
  const a = st.auth;
  if (a.type === "bearer" && a.token) headers.push(["Authorization", `Bearer ${a.token}`]);
  if (a.type === "basic" && (a.user || a.pass)) headers.push(["Authorization", `Basic ${b64(`${a.user}:${a.pass}`)}`]);
  if (a.type === "apikey" && a.key && a.value) {
    if (a.in === "header") headers.push([a.key, a.value]);
    else url = urlWithParams(url, [...paramsFromUrl(url), { k: a.key, v: a.value, on: true }]);
  }
  let body: string | null = null;
  let multipart: Row[] | null = null;
  const noBody = st.method === "GET" || st.method === "HEAD";
  if (!noBody) {
    switch (st.bodyType) {
      case "json":
        body = st.body;
        if (st.body.trim()) {
          try {
            JSON.parse(st.body);
          } catch (e) {
            notes.push(`The JSON body does not parse: ${(e as Error).message}`);
          }
        }
        if (!has("content-type")) headers.push(["Content-Type", "application/json"]);
        break;
      case "form":
        body = st.form.filter((r) => r.on && r.k).map((r) => `${enc(r.k)}=${enc(r.v)}`).join("&");
        if (!has("content-type")) headers.push(["Content-Type", "application/x-www-form-urlencoded"]);
        break;
      case "multipart":
        multipart = st.form.filter((r) => r.on && r.k);
        break;
      case "raw":
        body = st.body;
        if (!has("content-type") && st.rawType) headers.push(["Content-Type", st.rawType]);
        break;
      case "text":
        body = st.body;
        if (!has("content-type")) headers.push(["Content-Type", "text/plain; charset=utf-8"]);
        break;
    }
  } else if (st.bodyType !== "none" && st.body) notes.push(`${st.method} requests cannot carry a body — it was not sent.`);
  return { method: st.method, url, headers, body, multipart, notes };
}

export type Resp = {
  ok: boolean;
  status: number;
  statusText: string;
  ms: number;
  size: number;
  headers: [string, string][];
  body: string;
  contentType: string;
  url: string;
  method: string;
  mock: boolean;
  route?: string;
  delay?: number;
  notes: string[];
};

function multipartText(rows: Row[], boundary: string): string {
  return rows.map((r) => `--${boundary}\r\nContent-Disposition: form-data; name="${r.k}"\r\n\r\n${r.v}\r\n`).join("") + `--${boundary}--\r\n`;
}

export class NetworkError extends Error {}

export async function send(st: ReqState, signal?: AbortSignal): Promise<Resp> {
  const b = build(st);
  if (!b.url) throw new NetworkError("Enter a URL — try /mock-api/users, which works offline.");
  const t0 = performance.now();
  if (isMockUrl(b.url)) {
    const boundary = "----formatter" + "0".repeat(8);
    const headers = Object.fromEntries(b.headers);
    let body = b.body ?? "";
    if (b.multipart) {
      body = multipartText(b.multipart, boundary);
      headers["Content-Type"] = `multipart/form-data; boundary=${boundary}`;
    }
    const path = b.url.replace(/^https?:\/\/[^/]+/i, "");
    const r = await resolveMock(b.method, path, headers, body);
    const ms = performance.now() - t0;
    if (!r) {
      const text = JSON.stringify({ error: `No mock route matches ${b.method} ${path.split("?")[0]}`, hint: "Add one in Fake JSON API, or try /mock-api/users, /mock-api/echo, /mock-api/status/418." }, null, 2);
      return { ok: false, status: 404, statusText: "Not Found", ms, size: new TextEncoder().encode(text).length, headers: [["Content-Type", "application/json"]], body: text, contentType: "application/json", url: b.url, method: b.method, mock: true, notes: b.notes };
    }
    const hdrs = Object.entries(r.headers);
    const ct = hdrs.find(([k]) => k.toLowerCase() === "content-type")?.[1] ?? "";
    return { ok: r.status < 400, status: r.status, statusText: statusText(r.status), ms, size: new TextEncoder().encode(r.body).length, headers: hdrs, body: r.body, contentType: ct, url: b.url, method: b.method, mock: true, route: r.route, delay: r.delay, notes: b.notes };
  }
  if (!/^https?:\/\//i.test(b.url)) throw new NetworkError(`"${b.url}" is not an absolute http(s) URL. Use https://… for a real API, or a /mock-api/ path for the offline mock.`);
  const init: RequestInit = { method: b.method, headers: b.headers, signal, redirect: "follow" };
  if (b.multipart) {
    const fd = new FormData();
    b.multipart.forEach((r) => fd.append(r.k, r.v));
    init.body = fd;
    init.headers = b.headers.filter(([k]) => k.toLowerCase() !== "content-type");
  } else if (b.body !== null) init.body = b.body;
  let res: Response;
  try {
    res = await fetch(b.url, init);
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new NetworkError("Request cancelled.");
    const u = new URL(b.url);
    const reasons = [
      `The browser refused or could not complete the request to ${u.origin}, and hides the exact reason from pages.`,
      "Most likely: CORS — the server did not answer with an Access-Control-Allow-Origin header allowing this page" + (b.headers.some(([k]) => !/^(accept|accept-language|content-language|content-type)$/i.test(k)) || !["GET", "HEAD", "POST"].includes(b.method) ? " (custom headers or this method trigger a preflight OPTIONS request the server must also allow)." : "."),
      typeof location !== "undefined" && location.protocol === "https:" && u.protocol === "http:" ? "Mixed content — an https page cannot call an http:// URL." : "Other causes: you are offline, DNS failed, the certificate is invalid, or an extension blocked it.",
      "Workarounds: copy the request as curl from Export (no CORS outside browsers), use the API's CORS-enabled endpoint, or mock it under /mock-api/ with Fake JSON API.",
    ];
    throw new NetworkError(reasons.join("\n"));
  }
  const buf = await res.arrayBuffer();
  const ms = performance.now() - t0;
  const ct = res.headers.get("content-type") ?? "";
  const body = new TextDecoder().decode(buf);
  const headers: [string, string][] = [];
  res.headers.forEach((v, k) => headers.push([k, v]));
  const notes = [...b.notes];
  if (res.type === "opaque" || res.type === "cors") {
    if (headers.length <= 1) notes.push("Only CORS-safelisted response headers are visible to pages unless the server sends Access-Control-Expose-Headers.");
  }
  return { ok: res.ok, status: res.status, statusText: res.statusText || statusText(res.status), ms, size: buf.byteLength, headers, body, contentType: ct, url: res.url || b.url, method: b.method, mock: false, notes };
}

/* ── export ──────────────────────────────────────────────────────────── */

const shq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
const pyq = (s: string) => JSON.stringify(s);

function absolute(url: string) {
  if (/^https?:\/\//i.test(url)) return url;
  const origin = typeof location !== "undefined" && location.origin && location.origin !== "null" ? location.origin : "http://localhost:3100";
  return origin + (url.startsWith("/") ? "" : "/") + url;
}

export function toCurl(st: ReqState): string {
  const b = build(st);
  const parts = [`curl${b.method === "GET" ? "" : ` -X ${b.method}`} ${shq(absolute(b.url))}`];
  for (const [k, v] of b.headers) parts.push(`-H ${shq(`${k}: ${v}`)}`);
  if (b.multipart) for (const r of b.multipart) parts.push(`-F ${shq(`${r.k}=${r.v}`)}`);
  else if (b.body !== null && b.body !== "") parts.push(`--data-raw ${shq(b.body)}`);
  return parts.join(" \\\n  ");
}

export function toFetch(st: ReqState): string {
  const b = build(st);
  const lines: string[] = [];
  if (b.multipart) {
    lines.push("const form = new FormData();");
    for (const r of b.multipart) lines.push(`form.append(${JSON.stringify(r.k)}, ${JSON.stringify(r.v)});`);
    lines.push("");
  }
  const opts: string[] = [`  method: ${JSON.stringify(b.method)}`];
  const hdrs = b.headers.filter(([k]) => !(b.multipart && k.toLowerCase() === "content-type"));
  if (hdrs.length) opts.push(`  headers: {\n${hdrs.map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(",\n")}\n  }`);
  if (b.multipart) opts.push("  body: form");
  else if (b.body !== null && b.body !== "") {
    let bodyExpr = JSON.stringify(b.body);
    if (st.bodyType === "json") {
      try {
        bodyExpr = `JSON.stringify(${JSON.stringify(JSON.parse(b.body), null, 2).replace(/\n/g, "\n  ")})`;
      } catch {
        /* keep raw */
      }
    }
    opts.push(`  body: ${bodyExpr}`);
  }
  lines.push(`const res = await fetch(${JSON.stringify(b.url)}, {\n${opts.join(",\n")}\n});`);
  lines.push("console.log(res.status, res.statusText);");
  lines.push(/json/i.test(b.headers.find(([k]) => k.toLowerCase() === "accept")?.[1] ?? "json") ? "const data = await res.json();\nconsole.log(data);" : "console.log(await res.text());");
  return lines.join("\n");
}

function pyDict(o: [string, string][], indent = "    "): string {
  return `{\n${o.map(([k, v]) => `${indent}${pyq(k)}: ${pyq(v)},`).join("\n")}\n}`;
}

function pyValue(v: unknown, ind = ""): string {
  if (v === null) return "None";
  if (v === true) return "True";
  if (v === false) return "False";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return pyq(v);
  if (Array.isArray(v)) return v.length ? `[\n${v.map((x) => `${ind}    ${pyValue(x, ind + "    ")},`).join("\n")}\n${ind}]` : "[]";
  const e = Object.entries(v as object);
  return e.length ? `{\n${e.map(([k, x]) => `${ind}    ${pyq(k)}: ${pyValue(x, ind + "    ")},`).join("\n")}\n${ind}}` : "{}";
}

export function toPython(st: ReqState): string {
  const b = build(st);
  const lines = ["import requests", ""];
  const { base } = splitUrl(b.url);
  const q = paramsFromUrl(b.url);
  lines.push(`url = ${pyq(absolute(base))}`);
  const args = ["url"];
  if (q.length) {
    lines.push(`params = ${pyDict(q.map((r) => [r.k, r.v]))}`);
    args.push("params=params");
  }
  let hdrs = b.headers;
  if (st.bodyType === "json" && b.body) hdrs = hdrs.filter(([k]) => k.toLowerCase() !== "content-type");
  if (b.multipart) hdrs = hdrs.filter(([k]) => k.toLowerCase() !== "content-type");
  if (hdrs.length) {
    lines.push(`headers = ${pyDict(hdrs)}`);
    args.push("headers=headers");
  }
  if (b.multipart) {
    lines.push(`files = ${pyDict(b.multipart.map((r) => [r.k, r.v]))}`);
    lines.push("files = {k: (None, v) for k, v in files.items()}  # plain form fields as multipart");
    args.push("files=files");
  } else if (b.body !== null && b.body !== "") {
    if (st.bodyType === "json") {
      try {
        lines.push(`payload = ${pyValue(JSON.parse(b.body))}`);
        args.push("json=payload");
      } catch {
        lines.push(`data = ${pyq(b.body)}`);
        args.push("data=data");
      }
    } else if (st.bodyType === "form") {
      lines.push(`data = ${pyDict(st.form.filter((r) => r.on && r.k).map((r) => [r.k, r.v]))}`);
      args.push("data=data");
    } else {
      lines.push(`data = ${pyq(b.body)}`);
      args.push("data=data");
    }
  }
  lines.push("", `response = requests.request(${pyq(b.method)}, ${args.join(", ")}, timeout=30)`);
  lines.push("print(response.status_code, response.reason)");
  lines.push("print(response.json() if 'json' in response.headers.get('content-type', '') else response.text)");
  return lines.join("\n");
}

/* ── history ─────────────────────────────────────────────────────────── */

export const HISTORY_KEY = "fmt:api-history";
export type HistItem = { id: string; at: number; state: ReqState; status: number; ms: number; size: number; mock: boolean };

export function loadHistory(): HistItem[] {
  try {
    const v = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function saveHistory(h: HistItem[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, 50)));
  } catch {
    /* quota */
  }
}

export function pushHistory(st: ReqState, r: Resp) {
  const item: HistItem = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), at: Date.now(), state: st, status: r.status, ms: Math.round(r.ms), size: r.size, mock: r.mock };
  saveHistory([item, ...loadHistory()].slice(0, 50));
}

/** Structured response for the custom UI, keyed by the Result `run` returned. */
export const responseMeta = new WeakMap<object, Resp>();

export function prettyBody(r: Resp): { text: string; json: unknown | undefined } {
  if (/json/i.test(r.contentType) || /^\s*[[{]/.test(r.body)) {
    try {
      const v = JSON.parse(r.body);
      return { text: JSON.stringify(v, null, 2), json: v };
    } catch {
      /* not JSON */
    }
  }
  return { text: r.body, json: undefined };
}

export function fmtBytes(n: number) {
  return n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`;
}
