/**
 * Offline mock API. Routes live in localStorage ("fmt:mock-routes") and
 * stateful collections in "fmt:mock-db"; nothing here touches the network.
 *
 * Used in-page by API Workbench and Fake JSON API, and by the service-worker
 * bridge (so `fetch('/mock-api/users')` works anywhere in the app). A service
 * worker has no localStorage: it falls back to DEFAULT_ROUTES and an
 * in-memory store unless the host installs one with `setMockStorage`.
 *
 * `resolveMock` applies the route's delay itself (it awaits it) and reports
 * it in `MockResponse.delay` for display; callers should not wait again.
 *
 * Body templates:
 *   {{params.id}} {{query.page}} {{body.name}} {{headers.x-foo}}   request data
 *   {{query.page|1}}                                               fallback value
 *   {{uuid}} {{now}} {{timestamp}} {{int 1 100}} {{float 0 10}}    generated values
 *   {{name}} {{firstName}} {{lastName}} {{email}} {{word}} {{sentence}} {{bool}} {{pick a b c}}
 *   {{method}} {{path}} {{url}} {{json headers}} {{json query}} {{json body}} {{upper x}} {{lower x}}
 *   {{#repeat 5}} … {{@index}} … {{/repeat}}                       items joined with ","
 * Directives on the first lines of a body (all templated):
 *   @status 404        @delay 1500        @header X-Total: 3        @collection users
 * `@collection users` hands the request to a stateful collection: GET lists
 * (filter by any field, ?q= full text, ?_sort=, ?page=&limit= for an envelope),
 * GET /:id, POST creates, PUT/PATCH update, DELETE removes — persisted.
 */

export type MockRoute = {
  id: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "ANY";
  path: string;
  status: number;
  delay: number;
  headers: Record<string, string>;
  body: string;
  enabled: boolean;
  description?: string;
};

export type MockResponse = { status: number; headers: Record<string, string>; body: string; delay: number; route?: string };

export type MockStorage = { get(key: string): string | null; set(key: string, value: string): void };

export const ROUTES_KEY = "fmt:mock-routes";
export const DB_KEY = "fmt:mock-db";
export const MAX_DELAY = 10_000;

/* ── storage ─────────────────────────────────────────────────────────── */

const memory = new Map<string, string>();
const memoryStorage: MockStorage = { get: (k) => memory.get(k) ?? null, set: (k, v) => void memory.set(k, v) };
let custom: MockStorage | null = null;

function store(): MockStorage {
  if (custom) return custom;
  try {
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    if (ls) return { get: (k) => ls.getItem(k), set: (k, v) => ls.setItem(k, v) };
  } catch {
    /* blocked storage */
  }
  return memoryStorage;
}

/** Replace the storage backend (e.g. an in-memory map synced by postMessage inside a service worker). */
export function setMockStorage(s: MockStorage | null) {
  custom = s;
}

/* ── defaults ────────────────────────────────────────────────────────── */

const FIRST = ["Ada", "Grace", "Alan", "Linus", "Margaret", "Dennis", "Barbara", "Ken", "Frances", "Edsger", "Radia", "Tim", "Hedy", "Donald", "Katherine", "John"];
const LAST = ["Lovelace", "Hopper", "Turing", "Torvalds", "Hamilton", "Ritchie", "Liskov", "Thompson", "Allen", "Dijkstra", "Perlman", "Berners-Lee", "Lamarr", "Knuth", "Johnson", "McCarthy"];
const WORDS = ["lorem", "ipsum", "dolor", "sit", "amet", "offline", "mock", "request", "payload", "cache", "vector", "signal", "orbit", "delta", "river", "copper", "quartz", "harbor", "meadow", "lantern"];
const CITIES = ["London", "Arlington", "Helsinki", "Boston", "Berkeley", "Rotterdam", "Vienna", "Stanford"];

function seedUsers() {
  return [0, 1, 2, 3, 4].map((i) => ({
    id: i + 1,
    name: `${FIRST[i]} ${LAST[i]}`,
    username: FIRST[i].toLowerCase(),
    email: `${FIRST[i].toLowerCase()}@example.com`,
    role: ["admin", "editor", "viewer", "editor", "viewer"][i],
    city: CITIES[i],
    active: i !== 3,
  }));
}

function seedPosts() {
  const titles = [
    "Notes on the Analytical Engine",
    "Why compilers matter",
    "On computable numbers, revisited",
    "Just for fun: a kernel",
    "Software engineering is engineering",
    "Unix philosophy in 2026",
    "Data abstraction and hierarchy",
    "Offline-first web apps",
  ];
  return titles.map((title, i) => ({ id: i + 1, userId: (i % 5) + 1, title, body: `${title}. ${WORDS.slice(i, i + 8).join(" ")}.`, likes: (i * 37) % 120 }));
}

function seedProducts() {
  const kinds = ["Keyboard", "Mouse", "Monitor", "Cable", "Dock", "Webcam", "Headset", "Stand"];
  const adj = ["Compact", "Pro", "Silent", "Wireless", "Ultra", "Travel"];
  return Array.from({ length: 24 }, (_, i) => ({
    id: i + 1,
    sku: `SKU-${String(1001 + i)}`,
    name: `${adj[i % adj.length]} ${kinds[i % kinds.length]}`,
    category: kinds[i % kinds.length].toLowerCase(),
    price: Math.round((9.5 + ((i * 7919) % 230) + (i % 3) * 0.49) * 100) / 100,
    stock: (i * 13) % 40,
  }));
}

export const DEFAULT_COLLECTIONS: Record<string, Record<string, unknown>[]> = {
  users: seedUsers(),
  posts: seedPosts(),
  products: seedProducts(),
};

const J = { "Content-Type": "application/json" };

export const DEFAULT_ROUTES: MockRoute[] = [
  { id: "users-list", method: "ANY", path: "/mock-api/users", status: 200, delay: 0, headers: J, body: "@collection users", enabled: true, description: "Users collection: GET lists (?role=editor, ?q=, ?page=&limit=), POST creates." },
  { id: "users-item", method: "ANY", path: "/mock-api/users/:id", status: 200, delay: 0, headers: J, body: "@collection users", enabled: true, description: "GET, PUT, PATCH or DELETE one user; 404 when it does not exist." },
  { id: "posts-list", method: "ANY", path: "/mock-api/posts", status: 200, delay: 0, headers: J, body: "@collection posts", enabled: true, description: "Posts; filter by author with ?userId=2." },
  { id: "posts-item", method: "ANY", path: "/mock-api/posts/:id", status: 200, delay: 0, headers: J, body: "@collection posts", enabled: true, description: "One post by id." },
  { id: "products-list", method: "GET", path: "/mock-api/products", status: 200, delay: 0, headers: J, body: "@collection products", enabled: true, description: "24 products; ?page=2&limit=5 returns a paginated envelope with links." },
  { id: "products-item", method: "GET", path: "/mock-api/products/:id", status: 200, delay: 0, headers: J, body: "@collection products", enabled: true, description: "One product by id." },
  {
    id: "echo",
    method: "ANY",
    path: "/mock-api/echo",
    status: 200,
    delay: 0,
    headers: J,
    body: `{
  "method": "{{method}}",
  "path": "{{path}}",
  "query": {{json query}},
  "headers": {{json headers}},
  "body": {{json body}},
  "receivedAt": "{{now}}"
}`,
    enabled: true,
    description: "Echoes the method, query, headers and body back.",
  },
  {
    id: "status",
    method: "ANY",
    path: "/mock-api/status/:code",
    status: 200,
    delay: 0,
    headers: J,
    body: `@status {{params.code}}
{
  "status": {{params.code}},
  "message": "{{statusText params.code}}"
}`,
    enabled: true,
    description: "Responds with any status code, e.g. /mock-api/status/418.",
  },
  {
    id: "slow",
    method: "GET",
    path: "/mock-api/slow",
    status: 200,
    delay: 0,
    headers: J,
    body: `@delay {{query.ms|1500}}
{
  "ok": true,
  "delayedMs": {{query.ms|1500}}
}`,
    enabled: true,
    description: "Waits ?ms= milliseconds (default 1500, max 10000) before answering.",
  },
  {
    id: "random-people",
    method: "GET",
    path: "/mock-api/people",
    status: 200,
    delay: 0,
    headers: J,
    body: `[
{{#repeat query.count|3}}  {
    "id": "{{uuid}}",
    "index": {{@index}},
    "name": "{{name}}",
    "email": "{{email}}",
    "age": {{int 18 90}},
    "tags": ["{{word}}", "{{word}}"]
  }{{/repeat}}
]`,
    enabled: true,
    description: "Template demo: ?count=5 people with deterministic fake data.",
  },
];

/* ── routes ──────────────────────────────────────────────────────────── */

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export function loadRoutes(): MockRoute[] {
  try {
    const raw = store().get(ROUTES_KEY);
    if (raw) {
      const v = JSON.parse(raw);
      if (Array.isArray(v)) return v.map(normaliseRoute);
    }
  } catch {
    /* corrupt — fall back */
  }
  return clone(DEFAULT_ROUTES);
}

export function saveRoutes(r: MockRoute[]): void {
  try {
    store().set(ROUTES_KEY, JSON.stringify(r));
  } catch {
    /* quota or blocked */
  }
}

export function resetRoutes(): MockRoute[] {
  const r = clone(DEFAULT_ROUTES);
  saveRoutes(r);
  resetCollections();
  return r;
}

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "ANY"] as const;

export function normaliseRoute(x: unknown, i = 0): MockRoute {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const m = String(o.method ?? "GET").toUpperCase();
  let path = String(o.path ?? "/mock-api/route");
  if (!path.startsWith("/")) path = "/" + path;
  return {
    id: String(o.id ?? `route-${Date.now().toString(36)}-${i}`),
    method: (METHODS as readonly string[]).includes(m) ? (m as MockRoute["method"]) : "GET",
    path,
    status: Number.isFinite(Number(o.status)) ? Number(o.status) : 200,
    delay: Math.max(0, Math.min(MAX_DELAY, Number(o.delay) || 0)),
    headers: o.headers && typeof o.headers === "object" ? Object.fromEntries(Object.entries(o.headers as object).map(([k, v]) => [k, String(v)])) : {},
    body: typeof o.body === "string" ? o.body : o.body === undefined ? "" : JSON.stringify(o.body, null, 2),
    enabled: o.enabled !== false,
    description: o.description ? String(o.description) : undefined,
  };
}

/* ── collections ─────────────────────────────────────────────────────── */

type Db = Record<string, Record<string, unknown>[]>;

export function loadCollections(): Db {
  try {
    const raw = store().get(DB_KEY);
    if (raw) {
      const v = JSON.parse(raw);
      if (v && typeof v === "object") return { ...clone(DEFAULT_COLLECTIONS), ...v };
    }
  } catch {
    /* corrupt */
  }
  return clone(DEFAULT_COLLECTIONS);
}

export function saveCollections(db: Db) {
  try {
    store().set(DB_KEY, JSON.stringify(db));
  } catch {
    /* quota */
  }
}

export function resetCollections() {
  saveCollections(clone(DEFAULT_COLLECTIONS));
}

/**
 * Create (or replace) a stateful collection and the two routes that serve it:
 * `ANY /mock-api/<name>` and `ANY /mock-api/<name>/:id`. Returns the new route list.
 */
export function createCollection(name: string, seed: Record<string, unknown>[], routes = loadRoutes()): MockRoute[] {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "");
  if (!slug) throw new Error("Give the collection a name, e.g. todos.");
  const db = loadCollections();
  db[slug] = seed.map((r, i) => ("id" in r ? r : { id: i + 1, ...r }));
  saveCollections(db);
  const keep = routes.filter((r) => r.path !== `/mock-api/${slug}` && r.path !== `/mock-api/${slug}/:id`);
  const next: MockRoute[] = [
    ...keep,
    { id: `${slug}-list`, method: "ANY", path: `/mock-api/${slug}`, status: 200, delay: 0, headers: { ...J }, body: `@collection ${slug}`, enabled: true, description: `${slug} collection — GET lists, POST creates.` },
    { id: `${slug}-item`, method: "ANY", path: `/mock-api/${slug}/:id`, status: 200, delay: 0, headers: { ...J }, body: `@collection ${slug}`, enabled: true, description: `One ${slug} item — GET, PUT, PATCH, DELETE.` },
  ];
  saveRoutes(next);
  return next;
}

/* ── matching ────────────────────────────────────────────────────────── */

export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const a = pattern.replace(/\/+$/, "").split("/");
  const b = path.replace(/\/+$/, "").split("/");
  const params: Record<string, string> = {};
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const p = a[i];
    const s = b[i];
    if (p === "*") return params;
    if (p === undefined) return null;
    if (p.startsWith(":")) {
      const optional = p.endsWith("?");
      const key = p.slice(1).replace(/\?$/, "");
      if (s === undefined || s === "") {
        if (optional) continue;
        return null;
      }
      try {
        params[key] = decodeURIComponent(s);
      } catch {
        params[key] = s;
      }
      continue;
    }
    if (s === undefined || p.toLowerCase() !== s.toLowerCase()) return null;
  }
  return params;
}

/** Literal segments beat params, so /users/me wins over /users/:id. */
function specificity(r: MockRoute) {
  return r.path.split("/").reduce((n, s) => n + (s.startsWith(":") || s === "*" ? 1 : 3), 0) + (r.method === "ANY" ? 0 : 1);
}

export function findRoute(routes: MockRoute[], method: string, path: string): { route: MockRoute; params: Record<string, string> } | null {
  const m = method.toUpperCase();
  let best: { route: MockRoute; params: Record<string, string> } | null = null;
  for (const r of routes) {
    if (!r.enabled) continue;
    if (r.method !== "ANY" && r.method !== m && !(m === "HEAD" && r.method === "GET")) continue;
    const params = matchPath(r.path, path);
    if (params && (!best || specificity(r) > specificity(best.route))) best = { route: r, params };
  }
  return best;
}

/* ── template engine ─────────────────────────────────────────────────── */

const STATUS_TEXT: Record<number, string> = {
  200: "OK", 201: "Created", 202: "Accepted", 204: "No Content", 301: "Moved Permanently", 302: "Found", 304: "Not Modified",
  400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found", 405: "Method Not Allowed", 409: "Conflict",
  410: "Gone", 415: "Unsupported Media Type", 418: "I'm a teapot", 422: "Unprocessable Entity", 429: "Too Many Requests",
  500: "Internal Server Error", 501: "Not Implemented", 502: "Bad Gateway", 503: "Service Unavailable", 504: "Gateway Timeout",
};
export const statusText = (n: number) => STATUS_TEXT[n] ?? (n >= 500 ? "Server Error" : n >= 400 ? "Client Error" : n >= 300 ? "Redirect" : "OK");

export type TemplateCtx = {
  method: string;
  path: string;
  url: string;
  params: Record<string, string>;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: unknown;
  rawBody: string;
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Small deterministic PRNG (mulberry32) — identical requests give identical fake data. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function lookup(ctx: TemplateCtx, path: string, index: number): unknown {
  if (path === "@index") return index;
  const [root, ...rest] = path.split(".");
  let cur: unknown;
  if (root === "headers") {
    const key = rest.join(".").toLowerCase();
    return key ? ctx.headers[key] : ctx.headers;
  }
  if (root === "params") cur = ctx.params;
  else if (root === "query") cur = ctx.query;
  else if (root === "body") cur = ctx.body;
  else if (root === "method") return ctx.method;
  else if (root === "path") return ctx.path;
  else if (root === "url") return ctx.url;
  else return undefined;
  for (const k of rest) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

function jsonEscape(s: string) {
  return JSON.stringify(s).slice(1, -1);
}

export function renderTemplate(tpl: string, ctx: TemplateCtx, jsonMode = true): string {
  const seed = hash(`${ctx.method} ${ctx.url} ${ctx.rawBody}`);
  let counter = 0;
  const next = () => rng(seed + counter++ * 7919)();

  const value = (arg: string, index: number): unknown => {
    const [p, fallback] = arg.split("|");
    const t = p.trim();
    if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
    if (/^".*"$/.test(t)) return t.slice(1, -1);
    const v = lookup(ctx, t, index);
    if ((v === undefined || v === "") && fallback !== undefined) {
      const f = fallback.trim();
      return /^-?\d+(\.\d+)?$/.test(f) ? Number(f) : f.replace(/^"|"$/g, "");
    }
    return v;
  };

  const scalar = (v: unknown) => {
    if (v === undefined || v === null) return "";
    if (typeof v === "object") return JSON.stringify(v);
    return jsonMode ? jsonEscape(String(v)) : String(v);
  };

  const expr = (src: string, index: number): string => {
    const parts = src.trim().split(/\s+/);
    const [head, ...args] = parts;
    const r = () => next();
    switch (head) {
      case "uuid": {
        const h = Array.from({ length: 32 }, () => Math.floor(r() * 16).toString(16));
        h[12] = "4";
        h[16] = "89ab"[Math.floor(r() * 4)];
        const s = h.join("");
        return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
      }
      case "now":
        return new Date().toISOString();
      case "timestamp":
        return String(Date.now());
      case "int": {
        const lo = Number(value(args[0] ?? "0", index)) || 0, hi = Number(value(args[1] ?? "100", index)) || 100;
        return String(lo + Math.floor(r() * (hi - lo + 1)));
      }
      case "float": {
        const lo = Number(value(args[0] ?? "0", index)) || 0, hi = Number(value(args[1] ?? "1", index)) || 1;
        return (lo + r() * (hi - lo)).toFixed(2);
      }
      case "firstName":
        return FIRST[Math.floor(r() * FIRST.length)];
      case "lastName":
        return LAST[Math.floor(r() * LAST.length)];
      case "name":
        return `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`;
      case "email":
        return `${FIRST[Math.floor(r() * FIRST.length)].toLowerCase()}.${LAST[Math.floor(r() * LAST.length)].toLowerCase().replace(/[^a-z]/g, "")}@example.com`;
      case "word":
        return WORDS[Math.floor(r() * WORDS.length)];
      case "sentence": {
        const n = 5 + Math.floor(r() * 6);
        const w = Array.from({ length: n }, () => WORDS[Math.floor(r() * WORDS.length)]).join(" ");
        return w[0].toUpperCase() + w.slice(1) + ".";
      }
      case "bool":
        return r() < 0.5 ? "true" : "false";
      case "city":
        return CITIES[Math.floor(r() * CITIES.length)];
      case "pick":
        return args.length ? String(value(args[Math.floor(r() * args.length)], index) ?? args[0]) : "";
      case "json": {
        const v = value(args.join(" ") || "body", index);
        return v === undefined ? "null" : JSON.stringify(v);
      }
      case "upper":
        return scalar(value(args.join(" "), index)).toUpperCase();
      case "lower":
        return scalar(value(args.join(" "), index)).toLowerCase();
      case "statusText":
        return statusText(Number(value(args.join(" "), index)));
      default:
        return scalar(value(src, index));
    }
  };

  const renderFlat = (s: string, index: number) => s.replace(/\{\{\s*([^#/{}][^{}]*?)\s*\}\}/g, (_, e: string) => expr(e, index));

  const renderBlocks = (s: string, index: number): string => {
    let out = "";
    let i = 0;
    while (i < s.length) {
      const open = s.indexOf("{{#repeat", i);
      if (open < 0) {
        out += renderFlat(s.slice(i), index);
        break;
      }
      out += renderFlat(s.slice(i, open), index);
      const headEnd = s.indexOf("}}", open);
      if (headEnd < 0) throw new Error("Unclosed {{#repeat …}} tag.");
      const countExpr = s.slice(open + 9, headEnd).trim();
      // Find the matching {{/repeat}}, allowing nesting.
      let depth = 1;
      let j = headEnd + 2;
      let close = -1;
      while (j < s.length) {
        const no = s.indexOf("{{#repeat", j);
        const nc = s.indexOf("{{/repeat}}", j);
        if (nc < 0) break;
        if (no >= 0 && no < nc) {
          depth++;
          j = no + 9;
        } else {
          depth--;
          if (depth === 0) {
            close = nc;
            break;
          }
          j = nc + 11;
        }
      }
      if (close < 0) throw new Error("{{#repeat}} has no matching {{/repeat}}.");
      const inner = s.slice(headEnd + 2, close);
      const n = Math.max(0, Math.min(500, Math.floor(Number(value(countExpr || "1", index)) || 0)));
      const items: string[] = [];
      for (let k = 0; k < n; k++) items.push(renderBlocks(inner, k));
      out += items.join(",\n");
      i = close + 11;
    }
    return out;
  };

  return renderBlocks(tpl, 0);
}

/* ── collections engine ──────────────────────────────────────────────── */

function jsonResponse(status: number, v: unknown, extra: Record<string, string> = {}): { status: number; headers: Record<string, string>; body: string } {
  return { status, headers: { "Content-Type": "application/json", ...extra }, body: status === 204 ? "" : JSON.stringify(v, null, 2) };
}

function handleCollection(name: string, ctx: TemplateCtx): { status: number; headers: Record<string, string>; body: string } {
  const db = loadCollections();
  if (!db[name]) db[name] = [];
  const rows = db[name];
  const id = ctx.params.id;
  const m = ctx.method.toUpperCase();
  const sameId = (r: Record<string, unknown>) => String(r.id) === String(id);
  const input = ctx.body && typeof ctx.body === "object" && !Array.isArray(ctx.body) ? (ctx.body as Record<string, unknown>) : null;

  if (id === undefined) {
    if (m === "GET" || m === "HEAD") {
      let list = rows.slice();
      const q = ctx.query;
      for (const [k, v] of Object.entries(q)) {
        if (["q", "_sort", "_order", "page", "limit", "_page", "_limit"].includes(k)) continue;
        list = list.filter((r) => String(r[k]) === v);
      }
      if (q.q) {
        const needle = q.q.toLowerCase();
        list = list.filter((r) => JSON.stringify(r).toLowerCase().includes(needle));
      }
      if (q._sort) {
        const key = q._sort, dir = q._order === "desc" ? -1 : 1;
        list.sort((a, b) => (a[key] as number) > (b[key] as number) ? dir : (a[key] as number) < (b[key] as number) ? -dir : 0);
      }
      const total = list.length;
      const pageQ = q.page ?? q._page;
      if (pageQ !== undefined) {
        const limit = Math.max(1, Math.min(100, Number(q.limit ?? q._limit) || 10));
        const pages = Math.max(1, Math.ceil(total / limit));
        const page = Math.max(1, Math.min(pages, Number(pageQ) || 1));
        const link = (p: number) => `${ctx.path}?page=${p}&limit=${limit}`;
        return jsonResponse(
          200,
          { data: list.slice((page - 1) * limit, page * limit), meta: { page, limit, total, pages }, links: { self: link(page), first: link(1), last: link(pages), prev: page > 1 ? link(page - 1) : null, next: page < pages ? link(page + 1) : null } },
          { "X-Total-Count": String(total) }
        );
      }
      return jsonResponse(200, list, { "X-Total-Count": String(total) });
    }
    if (m === "POST") {
      if (!input) return jsonResponse(400, { error: "Send a JSON object body to create an item." });
      const nextId = rows.reduce((n, r) => Math.max(n, Number(r.id) || 0), 0) + 1;
      const item = { id: nextId, ...input, ...(input.id !== undefined ? { id: input.id } : {}) };
      rows.push(item);
      saveCollections(db);
      return jsonResponse(201, item, { Location: `${ctx.path.replace(/\/$/, "")}/${item.id}` });
    }
    if (m === "DELETE") {
      db[name] = [];
      saveCollections(db);
      return jsonResponse(204, null);
    }
    return jsonResponse(405, { error: `${m} is not supported on a collection. Use GET or POST.` }, { Allow: "GET, POST, DELETE" });
  }

  const idx = rows.findIndex(sameId);
  if (idx < 0 && m !== "PUT") return jsonResponse(404, { error: `No ${name} item with id ${id}.` });
  if (m === "GET" || m === "HEAD") return jsonResponse(200, rows[idx]);
  if (m === "PUT") {
    if (!input) return jsonResponse(400, { error: "Send a JSON object body to replace the item." });
    const item = { ...input, id: /^\d+$/.test(id) ? Number(id) : id };
    if (idx < 0) rows.push(item);
    else rows[idx] = item;
    saveCollections(db);
    return jsonResponse(idx < 0 ? 201 : 200, item);
  }
  if (m === "PATCH") {
    if (!input) return jsonResponse(400, { error: "Send a JSON object body with the fields to change." });
    rows[idx] = { ...rows[idx], ...input, id: rows[idx].id };
    saveCollections(db);
    return jsonResponse(200, rows[idx]);
  }
  if (m === "DELETE") {
    rows.splice(idx, 1);
    saveCollections(db);
    return jsonResponse(204, null);
  }
  return jsonResponse(405, { error: `${m} is not supported on an item.` }, { Allow: "GET, PUT, PATCH, DELETE" });
}

/* ── resolve ─────────────────────────────────────────────────────────── */

export function parseUrl(url: string): { path: string; query: Record<string, string>; search: string } {
  let u: URL;
  try {
    u = new URL(url, "http://mock.local");
  } catch {
    return { path: url.split("?")[0], query: {}, search: "" };
  }
  const query: Record<string, string> = {};
  u.searchParams.forEach((v, k) => (query[k] = v));
  return { path: decodeURI(u.pathname), query, search: u.search };
}

export function isMockUrl(url: string): boolean {
  return parseUrl(url.trim()).path.startsWith("/mock-api/") && (!/^[a-z]+:\/\//i.test(url.trim()) || /^https?:\/\/(localhost|127\.0\.0\.1|mock\.local)(:\d+)?\//i.test(url.trim()) || (typeof location !== "undefined" && url.trim().startsWith(location.origin)));
}

function parseBody(body: string, headers: Record<string, string>): unknown {
  if (!body) return null;
  const ct = headers["content-type"] ?? "";
  if (/json/i.test(ct) || /^\s*[[{]/.test(body)) {
    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  }
  if (/x-www-form-urlencoded/i.test(ct)) {
    const o: Record<string, string> = {};
    new URLSearchParams(body).forEach((v, k) => (o[k] = v));
    return o;
  }
  return body;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Resolve a request against the mock routes. Returns null when no enabled /mock-api/ route matches. */
export async function resolveMock(method: string, url: string, headers: Record<string, string>, body: string, routes?: MockRoute[]): Promise<MockResponse | null> {
  const { path, query } = parseUrl(url);
  if (!path.startsWith("/mock-api/") && path !== "/mock-api") return null;
  const hit = findRoute(routes ?? loadRoutes(), method, path);
  if (!hit) return null;
  const { route, params } = hit;
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  const ctx: TemplateCtx = { method: method.toUpperCase(), path, url, params, query, headers: lower, body: parseBody(body, lower), rawBody: body };

  // Split directives from the body.
  const lines = route.body.split("\n");
  let status = route.status;
  let delay = route.delay;
  const outHeaders: Record<string, string> = { ...route.headers };
  let collection: string | null = null;
  let k = 0;
  const jsonMode = /json/i.test(Object.entries(outHeaders).find(([h]) => h.toLowerCase() === "content-type")?.[1] ?? "application/json");
  for (; k < lines.length; k++) {
    const m = /^@(status|delay|header|collection)\s+(.*)$/.exec(lines[k].trim());
    if (!m) break;
    const v = renderTemplate(m[2], ctx, false).trim();
    if (m[1] === "status") status = Number(v) || status;
    else if (m[1] === "delay") delay = Math.max(0, Math.min(MAX_DELAY, Number(v) || 0));
    else if (m[1] === "collection") collection = v;
    else {
      const c = v.indexOf(":");
      if (c > 0) outHeaders[v.slice(0, c).trim()] = v.slice(c + 1).trim();
    }
  }
  let out: { status: number; headers: Record<string, string>; body: string };
  if (collection) {
    const r = handleCollection(collection, ctx);
    out = { status: r.status, headers: { ...outHeaders, ...r.headers }, body: r.body };
  } else {
    let text: string;
    try {
      text = renderTemplate(lines.slice(k).join("\n"), ctx, jsonMode);
    } catch (e) {
      text = JSON.stringify({ error: `Template error in route ${route.path}: ${(e as Error).message}` });
      status = 500;
    }
    if (jsonMode && /^\s*[[{]/.test(text)) {
      try {
        text = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        /* leave the template output as written */
      }
    }
    out = { status, headers: outHeaders, body: text };
  }
  if (status < 100 || status > 599) out.status = 500;
  out.headers["X-Mock-Route"] = `${route.method} ${route.path}`;
  if (delay > 0) await sleep(delay);
  if (method.toUpperCase() === "HEAD") out.body = "";
  return { status: out.status, headers: out.headers, body: out.body, delay, route: route.id };
}
