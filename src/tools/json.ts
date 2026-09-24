import { parseJson, readJson, sortKeysDeep, stringify, jsonStats, utf8Len, lineCol, caret, JsonSyntaxError } from "./lib/jsonparse";
import { lineDiff } from "./lib/diff";
import { isNode, vendorBytes } from "./lib/vendor";
import { ToolError, bool, str, type Result, type SpecModule, type View } from "./types";

/* ── shared examples ─────────────────────────────────────────────────── */

const USER = `{
  "id": 1024,
  "name": "Ada Lovelace",
  "email": "ada@example.com",
  "active": true,
  "roles": ["admin", "editor"],
  "profile": {
    "born": "1815-12-10",
    "languages": ["en", "fr"],
    "website": "https://example.com/ada"
  },
  "lastLogin": null
}`;

const ORDERS = `[
  {"order": "A-1001", "customer": "Ada", "total": 42.5, "status": "shipped", "items": [{"sku": "KB-01", "qty": 1}]},
  {"order": "A-1002", "customer": "Grace", "total": 18.0, "status": "pending", "items": [{"sku": "MS-02", "qty": 2}]},
  {"order": "A-1003", "customer": "Linus", "total": 99.99, "status": "shipped", "items": [{"sku": "MN-27", "qty": 1}, {"sku": "CB-10", "qty": 3}]},
  {"order": "A-1004", "customer": "Ada", "total": 7.25, "status": "cancelled", "items": []}
]`;

const API = `{"data":{"repository":{"name":"formatter","stars":1280,"topics":["json","devtools","offline"],"owner":{"login":"ozlorienlabs","type":"Organization"},"releases":{"totalCount":14,"latest":{"tag":"v2.3.0","publishedAt":"2026-08-30T10:12:00Z"}}}},"meta":{"requestId":"b7f3c2","took_ms":42}}`;

const CONFIG_JSON5 = `// Service config — comments, single quotes and trailing commas
{
  name: 'billing-api',
  port: 8080,
  features: {
    retries: 3,
    timeouts: [100, 250, 1000,],   // ms
  },
  /* disabled for now */
  debug: false,
}`;

const STORE = `{
  "store": {
    "book": [
      {"category": "reference", "author": "Nigel Rees", "title": "Sayings of the Century", "price": 8.95},
      {"category": "fiction", "author": "Evelyn Waugh", "title": "Sword of Honour", "price": 12.99},
      {"category": "fiction", "author": "Herman Melville", "title": "Moby Dick", "isbn": "0-553-21311-3", "price": 8.99},
      {"category": "fiction", "author": "J. R. R. Tolkien", "title": "The Lord of the Rings", "isbn": "0-395-19395-8", "price": 22.99}
    ],
    "bicycle": {"color": "red", "price": 19.95}
  },
  "expensive": 10
}`;

/* ── helpers ─────────────────────────────────────────────────────────── */

const indentOpt = {
  id: "indent",
  label: "Indent",
  type: "segment" as const,
  choices: [["2", "2"], ["4", "4"], ["tab", "Tab"]] as [string, string][],
  default: "2",
};

function parse(src: string, tolerant: boolean) {
  if (!src.trim()) throw new ToolError("Paste some JSON to begin.");
  return readJson(src, tolerant);
}

function tableOf(v: unknown): View | null {
  if (!Array.isArray(v) || !v.length || !v.every((r) => r && typeof r === "object" && !Array.isArray(r))) return null;
  const cols = [...new Set(v.flatMap((r) => Object.keys(r as object)))];
  const rows = v.map((r) =>
    cols.map((c) => {
      const x = (r as Record<string, unknown>)[c];
      return x === undefined ? null : x !== null && typeof x === "object" ? JSON.stringify(x) : (x as string | number | boolean | null);
    })
  );
  return { label: "Table", out: { kind: "table", columns: cols, rows } };
}

function statsView(v: unknown, src: string, out?: string): View {
  const s = jsonStats(v);
  const items: { label: string; value: string | number; tone?: "ok" | "warn" | "bad" | "info" }[] = [
    { label: "Input bytes", value: utf8Len(src) },
  ];
  if (out !== undefined) items.push({ label: "Output bytes", value: utf8Len(out), tone: "info" });
  items.push(
    { label: "Max depth", value: s.maxDepth },
    { label: "Objects", value: s.objects },
    { label: "Arrays", value: s.arrays },
    { label: "Keys", value: s.keys },
    { label: "Strings", value: s.strings },
    { label: "Numbers", value: s.numbers },
    { label: "Booleans", value: s.bools },
    { label: "Nulls", value: s.nulls }
  );
  return { label: "Stats", out: { kind: "stats", items } };
}

/* ── schema inference ────────────────────────────────────────────────── */

type Schema = Record<string, unknown>;

function detectFormat(s: string): string | undefined {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/.test(s)) return "date-time";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return "date";
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(s)) return "time";
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return "email";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return "uuid";
  if (/^https?:\/\/\S+$/.test(s)) return "uri";
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(s)) return "ipv4";
  return undefined;
}

function inferSchema(v: unknown, o: { formats: boolean; required: boolean; strict: boolean; examples: boolean }): Schema {
  if (v === null) return { type: "null" };
  if (Array.isArray(v)) {
    if (!v.length) return { type: "array", items: {} };
    const merged = v.map((x) => inferSchema(x, o)).reduce((a, b) => mergeSchemas(a, b, o));
    return { type: "array", items: merged };
  }
  switch (typeof v) {
    case "string": {
      const s: Schema = { type: "string" };
      const f = o.formats ? detectFormat(v) : undefined;
      if (f) s.format = f;
      if (o.examples) s.examples = [v];
      return s;
    }
    case "number":
      return { type: Number.isInteger(v) ? "integer" : "number", ...(o.examples ? { examples: [v] } : {}) };
    case "boolean":
      return { type: "boolean" };
    case "object": {
      const props: Record<string, Schema> = {};
      for (const [k, x] of Object.entries(v as object)) props[k] = inferSchema(x, o);
      const s: Schema = { type: "object", properties: props };
      if (o.required) s.required = Object.keys(props);
      if (o.strict) s.additionalProperties = false;
      return s;
    }
  }
  return {};
}

function typesOf(s: Schema): string[] {
  return Array.isArray(s.type) ? (s.type as string[]) : s.type ? [s.type as string] : [];
}

function mergeSchemas(a: Schema, b: Schema, o: { required: boolean }): Schema {
  const ta = typesOf(a), tb = typesOf(b);
  if (ta.length === 1 && tb.length === 1 && ta[0] === tb[0]) {
    if (ta[0] === "object") {
      const pa = (a.properties ?? {}) as Record<string, Schema>;
      const pb = (b.properties ?? {}) as Record<string, Schema>;
      const props: Record<string, Schema> = {};
      for (const k of new Set([...Object.keys(pa), ...Object.keys(pb)])) props[k] = pa[k] && pb[k] ? mergeSchemas(pa[k], pb[k], o) : pa[k] ?? pb[k];
      const out: Schema = { ...a, properties: props };
      if (o.required) out.required = ((a.required as string[]) ?? []).filter((k) => ((b.required as string[]) ?? []).includes(k));
      return out;
    }
    if (ta[0] === "array") return { type: "array", items: mergeSchemas((a.items ?? {}) as Schema, (b.items ?? {}) as Schema, o) };
    if (ta[0] === "string" && a.format !== b.format) {
      const { format: _f, ...rest } = a;
      return rest;
    }
    if (a.examples && b.examples) return { ...a, examples: [...new Set([...(a.examples as unknown[]), ...(b.examples as unknown[])])].slice(0, 3) };
    return a;
  }
  if (!ta.length) return b;
  if (!tb.length) return a;
  const both = [...new Set([...ta, ...tb])];
  // integer ∪ number = number
  const types = both.includes("number") ? both.filter((t) => t !== "integer") : both;
  return { type: types.length === 1 ? types[0] : types };
}

/* ── JSON diff ───────────────────────────────────────────────────────── */

type Change = { op: "add" | "remove" | "replace"; path: string; from?: unknown; to?: unknown };

const ptr = (p: string[]) => (p.length ? "/" + p.map((s) => s.replace(/~/g, "~0").replace(/\//g, "~1")).join("/") : "");
const dotted = (p: string[]) => "$" + p.map((s) => (/^\d+$/.test(s) ? `[${s}]` : /^[A-Za-z_$][\w$]*$/.test(s) ? `.${s}` : `[${JSON.stringify(s)}]`)).join("");

function canonical(v: unknown): string {
  return JSON.stringify(sortKeysDeep(v));
}

function deepDiff(a: unknown, b: unknown, path: string[], out: Change[], ignoreOrder: boolean) {
  if (a === b) return;
  const bothObj = a && b && typeof a === "object" && typeof b === "object";
  if (bothObj && Array.isArray(a) === Array.isArray(b)) {
    if (Array.isArray(a) && Array.isArray(b)) {
      if (ignoreOrder) {
        const cb = b.map(canonical);
        const used = new Set<number>();
        const unmatched: number[] = [];
        a.forEach((x, i) => {
          const c = canonical(x);
          const j = cb.findIndex((y, k) => !used.has(k) && y === c);
          if (j >= 0) used.add(j);
          else unmatched.push(i);
        });
        unmatched.forEach((i) => out.push({ op: "remove", path: ptr([...path, String(i)]), from: a[i] }));
        b.forEach((y, j) => { if (!used.has(j)) out.push({ op: "add", path: ptr([...path, String(j)]), to: y }); });
        return;
      }
      const n = Math.max(a.length, b.length);
      for (let i = 0; i < n; i++) {
        if (i >= a.length) out.push({ op: "add", path: ptr([...path, String(i)]), to: b[i] });
        else if (i >= b.length) out.push({ op: "remove", path: ptr([...path, String(i)]), from: a[i] });
        else deepDiff(a[i], b[i], [...path, String(i)], out, ignoreOrder);
      }
      return;
    }
    const ao = a as Record<string, unknown>, bo = b as Record<string, unknown>;
    for (const k of Object.keys(ao)) if (!(k in bo)) out.push({ op: "remove", path: ptr([...path, k]), from: ao[k] });
    for (const k of Object.keys(bo)) {
      if (!(k in ao)) out.push({ op: "add", path: ptr([...path, k]), to: bo[k] });
      else deepDiff(ao[k], bo[k], [...path, k], out, ignoreOrder);
    }
    return;
  }
  if (typeof a === "number" && typeof b === "number" && Number.isNaN(a) && Number.isNaN(b)) return;
  out.push({ op: "replace", path: ptr(path), from: a, to: b });
}

const short = (v: unknown) => {
  const s = JSON.stringify(v);
  return s === undefined ? "undefined" : s.length > 80 ? s.slice(0, 77) + "…" : s;
};

/* ── jq ──────────────────────────────────────────────────────────────── */

type JqMod = typeof import("jq-wasm");
type Jq = Awaited<ReturnType<JqMod["loadJq"]>>;
let jqP: Promise<Jq> | null = null;
function jq(): Promise<Jq> {
  if (!jqP) {
    jqP = (async () => {
      const mod: JqMod = await import("jq-wasm");
      if (isNode) return mod.loadJq({ wasmBinary: await vendorBytes("", "jq-wasm/dist/build/jq.wasm") });
      return mod.loadJq({ wasmURL: "/vendor/jq/jq.wasm" });
    })();
    jqP.catch(() => (jqP = null));
  }
  return jqP;
}

/* ── specs ───────────────────────────────────────────────────────────── */

const specs: SpecModule = {
  "json-formatter": {
    inputs: [{ id: "json", label: "JSON", lang: "json", placeholder: "Paste JSON — or JSON5 with Tolerant on" }],
    options: [
      indentOpt,
      { id: "sort", label: "Sort keys", type: "toggle", default: false },
      { id: "tolerant", label: "Tolerant", type: "toggle", default: false, hint: "Accept comments, trailing commas, single quotes and unquoted keys" },
      { id: "ascii", label: "Escape non-ASCII", type: "toggle", default: false },
    ],
    outLang: "json",
    run({ inputs, opts }) {
      let v = parse(inputs.json, bool(opts.tolerant));
      if (bool(opts.sort)) v = sortKeysDeep(v);
      let text = stringify(v, str(opts.indent));
      if (bool(opts.ascii)) text = text.replace(/[\u007f-\uffff]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
      const views: View[] = [{ label: "Formatted", out: { kind: "text", text, lang: "json" } }, { label: "Tree", out: { kind: "tree", value: v } }];
      const t = tableOf(v);
      if (t) views.push(t);
      views.push(statsView(v, inputs.json, text));
      return { text, views, filename: "formatted.json" };
    },
    examples: [
      { label: "User record", inputs: { json: USER.replace(/\n\s*/g, "") }, note: "A minified object pretty-printed with two-space indent." },
      { label: "API response", inputs: { json: API }, opts: { indent: "4" }, note: "A GraphQL-style response, four-space indent." },
      { label: "Orders array", inputs: { json: ORDERS }, opts: { sort: true }, note: "Keys sorted alphabetically; open the Table tab." },
      { label: "JSON5 config", inputs: { json: CONFIG_JSON5 }, opts: { tolerant: true }, note: "Tolerant mode strips comments, trailing commas and quotes keys." },
      { label: "Unicode", inputs: { json: '{"city":"Zürich","greeting":"こんにちは","emoji":"🚀"}' }, opts: { ascii: true }, note: "Escape non-ASCII turns every character outside ASCII into \\uXXXX." },
      { label: "Broken JSON", inputs: { json: '{\n  "name": "ada",\n  "tags": ["a", "b",],\n}' }, note: "Errors show the exact line and column with a caret.", error: true },
    ],
    steps: ["Paste JSON, drop a .json file, or pick an example.", "Choose indent, sort keys, or Tolerant for JSON5-style input.", "Switch between Formatted, Tree, Table and Stats tabs.", "Copy, download, or send the result to a pipeline."],
  },

  "json-validator": {
    inputs: [{ id: "json", label: "JSON", lang: "json" }],
    options: [
      { id: "dupes", label: "Flag duplicate keys", type: "toggle", default: true },
      { id: "strict", label: "Strict RFC 8259", type: "toggle", default: true, hint: "Off: accept JSON5-style input and report what would need fixing" },
    ],
    run({ inputs, opts }) {
      const src = inputs.json;
      if (!src.trim()) throw new ToolError("Paste some JSON to validate.");
      const issues: { level: "error" | "warning" | "info" | "ok"; message: string; line?: number; col?: number }[] = [];
      const dupes: { key: string; pos: number }[] = [];
      let value: unknown;
      let ok = true;
      try {
        value = parseJson(src, { tolerant: !bool(opts.strict), onDuplicate: (key, pos) => dupes.push({ key, pos }) });
      } catch (e) {
        ok = false;
        if (e instanceof JsonSyntaxError) {
          issues.push({ level: "error", message: e.issue.message, line: e.issue.line, col: e.issue.col });
          const detail = `${e.issue.message}\nLine ${e.issue.line}, column ${e.issue.col}\n\n${caret(src, e.issue)}`;
          return {
            text: `Invalid JSON: ${e.issue.message} (line ${e.issue.line}, column ${e.issue.col})`,
            views: [
              { label: "Result", out: { kind: "status", ok: false, title: "Invalid JSON", detail } },
              { label: "Issues", out: { kind: "issues", items: issues } },
            ],
          };
        }
        throw e;
      }
      if (!bool(opts.strict)) {
        try {
          JSON.parse(src);
        } catch {
          issues.push({ level: "warning", message: "Parses only in tolerant mode — standard JSON.parse would reject it." });
        }
      }
      if (bool(opts.dupes))
        for (const d of dupes) {
          const { line, col } = lineCol(src, d.pos);
          issues.push({ level: "warning", message: `Duplicate key ${JSON.stringify(d.key)} — the last value wins`, line, col });
        }
      const s = jsonStats(value);
      if (s.maxDepth > 20) issues.push({ level: "info", message: `Deeply nested (${s.maxDepth} levels)` });
      if (/^\uFEFF/.test(src)) issues.push({ level: "info", message: "Starts with a byte-order mark" });
      const title = issues.some((i) => i.level === "warning") ? "Valid JSON, with warnings" : "Valid JSON";
      return {
        text: `${title}\n${issues.map((i) => `${i.level}: ${i.message}${i.line ? ` (line ${i.line})` : ""}`).join("\n")}`.trim(),
        views: [
          { label: "Result", out: { kind: "status", ok, title, detail: `${typeof value === "object" && value !== null ? (Array.isArray(value) ? `Array of ${(value as unknown[]).length}` : `Object with ${Object.keys(value as object).length} keys`) : `A ${typeof value}`} · depth ${s.maxDepth} · ${utf8Len(src).toLocaleString()} bytes` } },
          { label: `Issues (${issues.length})`, out: { kind: "issues", items: issues } },
          statsView(value, src),
        ],
      };
    },
    examples: [
      { label: "Valid", inputs: { json: USER } },
      { label: "Trailing comma", inputs: { json: '{\n  "a": 1,\n  "b": 2,\n}' }, note: "JSON forbids a comma before the closing brace." },
      { label: "Single quotes", inputs: { json: "{'name': 'ada'}" } },
      { label: "Unquoted key", inputs: { json: '{\n  name: "ada"\n}' } },
      { label: "Duplicate keys", inputs: { json: '{\n  "id": 1,\n  "name": "a",\n  "id": 2\n}' }, note: "Valid syntax, but the second id silently overwrites the first." },
      { label: "Missing bracket", inputs: { json: '[\n  {"a": 1},\n  {"b": 2}\n' } },
      { label: "JSON5 (lenient)", inputs: { json: CONFIG_JSON5 }, opts: { strict: false } },
    ],
  },

  "json-minifier": {
    inputs: [{ id: "json", label: "JSON", lang: "json" }],
    options: [
      { id: "tolerant", label: "Tolerant", type: "toggle", default: true, hint: "Strip comments and trailing commas while minifying" },
      { id: "sort", label: "Sort keys", type: "toggle", default: false },
    ],
    outLang: "json",
    run({ inputs, opts }) {
      let v = parse(inputs.json, bool(opts.tolerant));
      if (bool(opts.sort)) v = sortKeysDeep(v);
      const text = JSON.stringify(v);
      const before = utf8Len(inputs.json), after = utf8Len(text);
      return {
        text,
        filename: "minified.json",
        views: [
          { label: "Minified", out: { kind: "text", text, lang: "json", wrap: true } },
          {
            label: "Savings",
            out: {
              kind: "stats",
              items: [
                { label: "Before (bytes)", value: before },
                { label: "After (bytes)", value: after, tone: "info" },
                { label: "Saved", value: `${before ? Math.round((1 - after / before) * 100) : 0}%`, tone: "ok" },
                { label: "Saved (bytes)", value: before - after, tone: "ok" },
              ],
            },
          },
        ],
      };
    },
    examples: [
      { label: "Pretty object", inputs: { json: USER } },
      { label: "Orders", inputs: { json: ORDERS } },
      { label: "With comments", inputs: { json: CONFIG_JSON5 }, note: "Tolerant mode drops the comments along with the whitespace." },
    ],
  },

  "json-viewer": {
    inputs: [{ id: "json", label: "JSON", lang: "json" }],
    options: [{ id: "tolerant", label: "Tolerant", type: "toggle", default: true }],
    run({ inputs, opts }) {
      const v = parse(inputs.json, bool(opts.tolerant));
      const views: View[] = [{ label: "Tree", out: { kind: "tree", value: v } }];
      const t = tableOf(v);
      if (t) views.push(t);
      const text = JSON.stringify(v, null, 2);
      views.push({ label: "Formatted", out: { kind: "text", text, lang: "json" } }, statsView(v, inputs.json));
      return { text, views };
    },
    examples: [
      { label: "Nested store", inputs: { json: STORE }, note: "Expand nodes, search keys and values, hover a row to copy its JSONPath." },
      { label: "API response", inputs: { json: API } },
      { label: "Array → table", inputs: { json: ORDERS }, note: "Arrays of objects also open as a sortable table." },
      { label: "Big numbers", inputs: { json: '{"ids":[' + Array.from({ length: 60 }, (_, i) => 1000 + i * 7).join(",") + '],"ok":true}' } },
    ],
  },

  "json-diff": {
    inputs: [
      { id: "left", label: "Original (A)", lang: "json" },
      { id: "right", label: "Changed (B)", lang: "json", rows: 10 },
    ],
    options: [
      { id: "order", label: "Ignore array order", type: "toggle", default: false },
      { id: "tolerant", label: "Tolerant", type: "toggle", default: true },
    ],
    run({ inputs, opts }) {
      const a = parse(inputs.left, bool(opts.tolerant));
      if (!inputs.right.trim()) throw new ToolError("Paste the second document into Changed (B).");
      const b = parse(inputs.right, bool(opts.tolerant));
      const changes: Change[] = [];
      deepDiff(a, b, [], changes, bool(opts.order));
      const pathOf = (p: string) => dotted(p ? p.slice(1).split("/").map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~")) : []);
      const rows = changes.map((c) => [c.op, pathOf(c.path), c.from === undefined ? null : short(c.from), c.to === undefined ? null : short(c.to)]);
      const patch = changes.map((c) => (c.op === "remove" ? { op: c.op, path: c.path } : { op: c.op, path: c.path, value: c.to }));
      const d = lineDiff(JSON.stringify(sortKeysDeep(a), null, 2), JSON.stringify(sortKeysDeep(b), null, 2), { context: 3 });
      const counts = { add: 0, remove: 0, replace: 0 };
      changes.forEach((c) => counts[c.op]++);
      const summary = changes.length
        ? `${changes.length} difference(s): ${counts.add} added, ${counts.remove} removed, ${counts.replace} changed\n\n` +
          changes.map((c) => `${c.op === "add" ? "+" : c.op === "remove" ? "-" : "~"} ${pathOf(c.path)}${c.op === "replace" ? `: ${short(c.from)} → ${short(c.to)}` : c.op === "add" ? ` = ${short(c.to)}` : ""}`).join("\n")
        : "The documents are semantically identical.";
      return {
        text: summary,
        views: [
          {
            label: `Changes (${changes.length})`,
            out: changes.length
              ? { kind: "table", columns: ["op", "path", "A", "B"], rows }
              : { kind: "status", ok: true, title: "No differences", detail: "Key order and whitespace are ignored." },
          },
          { label: "Side by side", out: { kind: "diff", hunks: d.hunks, mode: "split" } },
          { label: "Unified", out: { kind: "diff", hunks: d.hunks, mode: "unified" } },
          { label: "JSON Patch", out: { kind: "text", text: JSON.stringify(patch, null, 2), lang: "json" } },
          { label: "Summary", out: { kind: "text", text: summary } },
        ],
      };
    },
    examples: [
      {
        label: "Config change",
        inputs: {
          left: '{\n  "name": "api",\n  "port": 8080,\n  "features": {"cache": true, "beta": false},\n  "hosts": ["a.example.com", "b.example.com"]\n}',
          right: '{\n  "name": "api",\n  "port": 9090,\n  "features": {"cache": true, "beta": true, "tracing": "otel"},\n  "hosts": ["a.example.com"]\n}',
        },
        note: "Changed, added and removed paths, plus an RFC 6902 JSON Patch.",
      },
      {
        label: "Key order only",
        inputs: { left: '{"a":1,"b":{"x":1,"y":2}}', right: '{"b":{"y":2,"x":1},"a":1}' },
        note: "Semantic diff: reordering keys is not a change.",
      },
      {
        label: "Array order",
        inputs: { left: '{"tags":["red","green","blue"]}', right: '{"tags":["blue","red","green"]}' },
        opts: { order: true },
        note: "With Ignore array order on, the same members in a new order match.",
      },
      {
        label: "API versions",
        inputs: {
          left: '{"user":{"id":7,"name":"Grace","email":"grace@example.com","plan":"free"}}',
          right: '{"user":{"id":7,"fullName":"Grace Hopper","email":"grace@example.com","plan":"pro","seats":5}}',
        },
      },
    ],
  },

  "json-escape": {
    inputs: [{ id: "text", label: "Text or JSON", lang: "text", wrap: true }],
    options: [
      { id: "quotes", label: "Wrap in quotes", type: "toggle", default: false },
      { id: "minify", label: "Minify JSON first", type: "toggle", default: true, hint: "When the input is valid JSON, compact it before escaping" },
      { id: "unicode", label: "Escape non-ASCII", type: "toggle", default: false },
    ],
    run({ inputs, opts }) {
      let s = inputs.text;
      if (bool(opts.minify)) {
        try {
          s = JSON.stringify(JSON.parse(s));
        } catch {
          /* not JSON — escape as text */
        }
      }
      let out = JSON.stringify(s);
      if (bool(opts.unicode)) out = out.replace(/[\u007f-\uffff]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
      return bool(opts.quotes) ? out : out.slice(1, -1);
    },
    examples: [
      { label: "JSON document", inputs: { text: '{\n  "q": "say \\"hi\\"",\n  "path": "C:\\\\temp"\n}' }, note: "Ready to paste inside another JSON string or a source file." },
      { label: "Multi-line text", inputs: { text: "Line one\nLine two\twith a tab\n\"quoted\"" }, opts: { quotes: true } },
      { label: "Unicode", inputs: { text: "naïve café — ✓" }, opts: { unicode: true } },
    ],
  },

  "json-unescape": {
    inputs: [{ id: "text", label: "Escaped string", lang: "text", wrap: true }],
    options: [
      { id: "pretty", label: "Pretty-print JSON result", type: "toggle", default: true },
      { id: "repeat", label: "Unwrap repeatedly", type: "toggle", default: true, hint: "Keep unescaping double-encoded strings" },
    ],
    run({ inputs, opts }) {
      let s = inputs.text.trim();
      if (!s) throw new ToolError("Paste an escaped string, with or without its surrounding quotes.");
      let rounds = 0;
      const once = (x: string): string => {
        const quoted = /^".*"$/s.test(x) ? x : `"${x.replace(/(^|[^\\])"/g, '$1\\"')}"`;
        const v = JSON.parse(quoted);
        if (typeof v !== "string") throw new ToolError("That is not an escaped string.");
        return v;
      };
      try {
        s = once(s);
        rounds++;
        while (bool(opts.repeat) && /^".*"$/s.test(s.trim()) && rounds < 10) {
          s = once(s.trim());
          rounds++;
        }
      } catch (e) {
        if (e instanceof ToolError) throw e;
        throw new ToolError(`Could not unescape: ${(e as Error).message}`);
      }
      let lang: "json" | undefined;
      if (bool(opts.pretty)) {
        try {
          s = JSON.stringify(JSON.parse(s), null, 2);
          lang = "json";
        } catch {
          /* plain text */
        }
      }
      return { text: s, lang, notes: rounds > 1 ? [`Unwrapped ${rounds} levels of escaping.`] : undefined };
    },
    examples: [
      { label: "Escaped JSON", inputs: { text: '"{\\"user\\":\\"ada\\",\\"roles\\":[\\"admin\\"]}"' } },
      { label: "No quotes", inputs: { text: "Line one\\nLine two\\t(tabbed)" } },
      { label: "Double-escaped", inputs: { text: '"\\"{\\\\\\"a\\\\\\":1}\\""' }, note: "Common in logs: a JSON string inside a JSON string." },
      { label: "Unicode escapes", inputs: { text: "caf\\u00e9 \\u2713 \\ud83d\\ude80" } },
    ],
  },

  "json-to-base64": {
    inputs: [{ id: "json", label: "JSON", lang: "json" }],
    options: [
      { id: "minify", label: "Minify first", type: "toggle", default: true },
      { id: "variant", label: "Alphabet", type: "segment", choices: [["std", "Standard"], ["url", "URL-safe"]], default: "std" },
      { id: "dataurl", label: "Data URL", type: "toggle", default: false },
    ],
    run({ inputs, opts }) {
      const v = parse(inputs.json, true);
      const s = bool(opts.minify) ? JSON.stringify(v) : JSON.stringify(v, null, 2);
      const bytes = new TextEncoder().encode(s);
      let bin = "";
      bytes.forEach((b) => (bin += String.fromCharCode(b)));
      let b64 = btoa(bin);
      if (opts.variant === "url") b64 = b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      const text = bool(opts.dataurl) ? `data:application/json;base64,${b64}` : b64;
      return { text, views: [{ label: "Base64", out: { kind: "text", text, wrap: true } }], notes: [`${bytes.length} bytes of JSON → ${text.length} characters`] };
    },
    examples: [
      { label: "Object", inputs: { json: '{"hello":"world","n":42}' } },
      { label: "JWT-style payload", inputs: { json: '{"sub":"1234567890","name":"Ada","iat":1716239022}' }, opts: { variant: "url" }, note: "URL-safe, unpadded — the encoding JWT segments use." },
      { label: "Data URL", inputs: { json: USER }, opts: { dataurl: true } },
    ],
  },

  "json-to-json-schema": {
    inputs: [{ id: "json", label: "Sample JSON", lang: "json" }],
    options: [
      { id: "draft", label: "Draft", type: "select", choices: [["2020-12", "2020-12"], ["2019-09", "2019-09"], ["07", "Draft 07"], ["04", "Draft 04"]], default: "2020-12" },
      { id: "required", label: "All required", type: "toggle", default: true },
      { id: "formats", label: "Detect formats", type: "toggle", default: true },
      { id: "strict", label: "No extra props", type: "toggle", default: false },
      { id: "examples", label: "Examples", type: "toggle", default: false },
      { id: "title", label: "Title", type: "text", default: "Root", width: 110 },
    ],
    outLang: "json",
    run({ inputs, opts }) {
      const v = parse(inputs.json, true);
      const uri = {
        "2020-12": "https://json-schema.org/draft/2020-12/schema",
        "2019-09": "https://json-schema.org/draft/2019-09/schema",
        "07": "http://json-schema.org/draft-07/schema#",
        "04": "http://json-schema.org/draft-04/schema#",
      }[str(opts.draft)] ?? "https://json-schema.org/draft/2020-12/schema";
      const schema = {
        $schema: uri,
        ...(str(opts.title) ? { title: str(opts.title) } : {}),
        ...inferSchema(v, { formats: bool(opts.formats), required: bool(opts.required), strict: bool(opts.strict), examples: bool(opts.examples) }),
      };
      const text = JSON.stringify(schema, null, 2);
      return { text, filename: "schema.json", views: [{ label: "Schema", out: { kind: "text", text, lang: "json" } }, { label: "Tree", out: { kind: "tree", value: schema } }] };
    },
    examples: [
      { label: "User", inputs: { json: USER }, note: "Formats (email, date, uri) are detected from the values." },
      { label: "Array of orders", inputs: { json: ORDERS }, note: "Array items are merged: keys missing from some items become optional." },
      { label: "Mixed types", inputs: { json: '[{"id":1,"score":9.5,"tag":null},{"id":2,"score":7,"tag":"x"}]' }, note: "Merged items widen to type unions." },
      { label: "Strict draft-07", inputs: { json: '{"host":"db.local","port":5432,"ssl":true}' }, opts: { draft: "07", strict: true, examples: true } },
    ],
  },

  "jq-playground": {
    inputs: [
      { id: "json", label: "JSON input", lang: "json" },
      { id: "filter", label: "jq filter", kind: "code", lang: "text", rows: 3, placeholder: ".users[] | select(.active) | .name" },
    ],
    options: [
      { id: "raw", label: "Raw output (-r)", type: "toggle", default: false },
      { id: "compact", label: "Compact (-c)", type: "toggle", default: false },
      { id: "slurp", label: "Slurp (-s)", type: "toggle", default: false },
      { id: "sort", label: "Sort keys (-S)", type: "toggle", default: false },
      { id: "nullin", label: "Null input (-n)", type: "toggle", default: false },
    ],
    outLang: "json",
    steps: ["Paste JSON (several documents are fine with Slurp).", "Write a jq filter — this is the real jq 1.8 compiled to WebAssembly.", "Toggle -r, -c, -s, -S or -n as you would on the command line."],
    async run({ inputs, opts }) {
      const filter = inputs.filter.trim() || ".";
      if (!inputs.json.trim() && !bool(opts.nullin)) throw new ToolError("Paste some JSON input (or turn on Null input).");
      const flags: string[] = [];
      if (bool(opts.raw)) flags.push("-r");
      if (bool(opts.compact)) flags.push("-c");
      if (bool(opts.slurp)) flags.push("-s");
      if (bool(opts.sort)) flags.push("-S");
      if (bool(opts.nullin)) flags.push("-n");
      const j = await jq();
      const input = bool(opts.nullin) ? null : bool(opts.slurp) ? inputs.json : (() => {
        try {
          return JSON.parse(inputs.json);
        } catch {
          return inputs.json; // multiple documents: hand jq the raw text
        }
      })();
      const r = j.raw(input as never, filter, flags);
      if (r.exitCode !== 0 && r.stderr) throw new ToolError(r.stderr.replace(/^jq: (error: )?/gm, "").trim());
      const text = r.stdout.replace(/\n$/, "");
      return { text, lang: bool(opts.raw) ? "text" : "json", notes: r.stderr ? [r.stderr.trim()] : undefined };
    },
    examples: [
      { label: "Pick fields", inputs: { json: ORDERS, filter: ".[] | {order, customer, total}" }, opts: { compact: true } },
      { label: "Select + map", inputs: { json: ORDERS, filter: '[.[] | select(.status == "shipped") | .total] | add' }, note: "Sum the totals of shipped orders." },
      { label: "Group by", inputs: { json: ORDERS, filter: "group_by(.customer) | map({customer: .[0].customer, orders: length, spent: (map(.total) | add)})" } },
      { label: "String interpolation", inputs: { json: ORDERS, filter: '.[] | "\\(.order): \\(.customer) paid $\\(.total)"' }, opts: { raw: true } },
      { label: "Keys & paths", inputs: { json: STORE, filter: '[paths(scalars) | map(tostring) | join(".")]' } },
      { label: "to_entries", inputs: { json: '{"a":1,"b":2,"c":3}', filter: "to_entries | map(select(.value > 1)) | from_entries" } },
      { label: "reduce", inputs: { json: ORDERS, filter: "reduce .[].items[] as $i ({}; .[$i.sku] += $i.qty)" } },
      { label: "Null input", inputs: { json: "", filter: "[range(1; 6) | {n: ., square: (. * .)}]" }, opts: { nullin: true, compact: true } },
    ],
  },

  "jsonpath-playground": {
    inputs: [
      { id: "json", label: "JSON", lang: "json" },
      { id: "path", label: "JSONPath", kind: "text", placeholder: "$.store.book[?(@.price < 10)].title" },
    ],
    options: [
      { id: "result", label: "Return", type: "segment", choices: [["value", "Values"], ["path", "Paths"], ["pointer", "Pointers"], ["both", "Both"]], default: "value" },
      { id: "flatten", label: "Flatten", type: "toggle", default: false },
    ],
    outLang: "json",
    async run({ inputs, opts }) {
      const v = parse(inputs.json, true);
      const path = inputs.path.trim() || "$";
      const { JSONPath } = await import("jsonpath-plus");
      const all = JSONPath({ path, json: v as object, resultType: "all", flatten: bool(opts.flatten), eval: "safe" }) as { value: unknown; path: string; pointer: string }[];
      const pick = str(opts.result);
      const out =
        pick === "path" ? all.map((r) => r.path) : pick === "pointer" ? all.map((r) => r.pointer) : pick === "both" ? all.map((r) => ({ path: r.path, value: r.value })) : all.map((r) => r.value);
      const text = JSON.stringify(out, null, 2);
      return {
        text,
        views: [
          { label: `Result (${all.length})`, out: { kind: "text", text, lang: "json" } },
          { label: "Matches", out: { kind: "table", columns: ["path", "pointer", "value"], rows: all.map((r) => [r.path, r.pointer, short(r.value)]) } },
        ],
      };
    },
    examples: [
      { label: "All authors", inputs: { json: STORE, path: "$.store.book[*].author" } },
      { label: "Filter by price", inputs: { json: STORE, path: "$.store.book[?(@.price < 10)].title" } },
      { label: "Recursive", inputs: { json: STORE, path: "$..price" }, opts: { result: "both" }, note: "`..` descends into every level." },
      { label: "Has property", inputs: { json: STORE, path: "$..book[?(@.isbn)]" } },
      { label: "Slice", inputs: { json: STORE, path: "$.store.book[-2:]" }, note: "The last two books." },
      { label: "Paths only", inputs: { json: ORDERS, path: "$[*].items[*].sku" }, opts: { result: "path" } },
    ],
  },
};

export default specs;

export type { Result };
