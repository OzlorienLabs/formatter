import { createElement as h, type ReactNode } from "react";
import { readJson, caret, sortKeysDeep } from "./lib/jsonparse";
import { isNode } from "./lib/vendor";
import { ToolError, bool, num, str, type OptionSpec, type Opts, type Result, type SpecModule, type View } from "./types";

/* ── shared example data ──────────────────────────────────────────────── */

const ORDERS = `[
  {
    "id": 1001,
    "customer": {"name": "Ada Lovelace", "email": "ada@example.com", "address": {"city": "London", "zip": "NW1 6XE"}},
    "items": [{"sku": "KB-01", "qty": 1, "price": 49.5}, {"sku": "MS-02", "qty": 2, "price": 19.99}],
    "tags": ["priority", "gift"],
    "paid": true,
    "placedAt": "2026-03-14T09:26:53Z",
    "note": null
  },
  {
    "id": 1002,
    "customer": {"name": "Grace Hopper", "email": "grace@example.com", "address": {"city": "New York", "zip": "10001"}},
    "items": [{"sku": "MN-27", "qty": 1, "price": 229}],
    "tags": [],
    "paid": false,
    "placedAt": "2026-03-15T17:02:11Z",
    "note": "Leave at the door, \\"back\\" entrance"
  }
]`;

const PEOPLE_JSON = `[
  {"id": 1, "name": "Ada Lovelace", "email": "ada@example.com", "born": "1815-12-10", "active": true, "score": 98.5},
  {"id": 2, "name": "Alan Turing", "email": "alan@example.com", "born": "1912-06-23", "active": false, "score": 91.25},
  {"id": 3, "name": "Grace O'Hopper", "email": "grace@example.com", "born": "1906-12-09", "active": true, "score": null},
  {"id": 4, "name": "Linus Torvalds", "email": "linus@example.com", "born": "1969-12-28", "active": true, "score": 87}
]`;

const EMPLOYEES_CSV = `id,name,department,salary,start_date,remote,manager.name,manager.email
101,"Hopper, Grace",Engineering,142000,2019-04-01,true,Ada Lovelace,ada@example.com
102,Alan Turing,Research,128500.50,2020-11-15,false,Ada Lovelace,ada@example.com
103,"Katherine ""Kay"" Johnson",Research,131000,2018-02-12,true,Alan Turing,alan@example.com
104,Linus Torvalds,Engineering,,2021-07-19,true,Grace Hopper,grace@example.com
105,Margaret Hamilton,Engineering,150000,2017-09-05,false,,`;

const K8S_JSON = `{
  "apiVersion": "apps/v1",
  "kind": "Deployment",
  "metadata": {"name": "billing-api", "labels": {"app": "billing", "tier": "backend"}},
  "spec": {
    "replicas": 3,
    "selector": {"matchLabels": {"app": "billing"}},
    "template": {
      "metadata": {"labels": {"app": "billing"}},
      "spec": {
        "containers": [
          {
            "name": "api",
            "image": "registry.example.com/billing-api:2.4.1",
            "ports": [{"containerPort": 8080}],
            "env": [{"name": "LOG_LEVEL", "value": "info"}, {"name": "FEATURE_FLAGS", "value": "yes"}],
            "args": ["--port=8080", "--workers=4"],
            "resources": {"limits": {"cpu": "500m", "memory": "256Mi"}}
          }
        ]
      }
    }
  }
}`;

const COMPOSE_YAML = `# docker-compose.yml — anchors, aliases and merge keys
x-defaults: &defaults
  restart: unless-stopped
  logging:
    driver: json-file
    options: { max-size: "10m" }

services:
  web:
    <<: *defaults
    image: nginx:1.27
    ports:
      - "8080:80"
    depends_on: [api]
  api:
    <<: *defaults
    image: registry.example.com/api:2.4.1
    environment:
      LOG_LEVEL: info
      RETRIES: 3
      DEBUG: false
    command: >
      node server.js
      --port 3000
`;

const MULTI_DOC_YAML = `---
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  LOG_LEVEL: debug
  started: 2026-01-15
---
apiVersion: v1
kind: Service
metadata:
  name: app
spec:
  ports:
    - port: 80
      targetPort: 8080
`;

const CATALOG_XML = `<?xml version="1.0" encoding="UTF-8"?>
<catalog xmlns:dc="http://purl.org/dc/elements/1.1/" updated="2026-09-01">
  <!-- Two books and a magazine -->
  <book id="bk101" available="true">
    <dc:title>XML Developer's Guide</dc:title>
    <author>Gambardella, Matthew</author>
    <price currency="USD">44.95</price>
    <tags><tag>xml</tag><tag>reference</tag></tags>
  </book>
  <book id="bk102" available="false">
    <dc:title>Midnight Rain</dc:title>
    <author>Ralls, Kim</author>
    <price currency="EUR">5.95</price>
    <tags><tag>fantasy</tag></tags>
  </book>
  <magazine id="mg001">
    <dc:title>Offline Monthly</dc:title>
    <issue>0042</issue>
    <summary><![CDATA[Tips & tricks for <offline> apps]]></summary>
  </magazine>
</catalog>`;

const CARGO_TOML = `# Cargo.toml
[package]
name = "formatter-cli"
version = "0.4.2"
edition = "2021"
authors = ["Ada Lovelace <ada@example.com>"]
keywords = ["json", "yaml", "cli"]

[dependencies]
serde = { version = "1.0", features = ["derive"] }
tokio = { version = "1", features = ["rt-multi-thread", "macros"] }

[profile.release]
lto = true
opt-level = 3

[[bin]]
name = "fmt"
path = "src/main.rs"

[[bin]]
name = "fmt-server"
path = "src/server.rs"
`;

const SERVER_TOML = `title = "Service config"
released = 2026-09-24
started_at = 2026-09-24T08:30:00Z
local_time = 07:32:00

[server]
host = "0.0.0.0"
port = 8080
timeouts = { read = 30, write = 30 }
allowed = [ "10.0.0.0/8", "192.168.0.0/16" ]

[database]
url = """
postgres://app@db.internal:5432/
billing?sslmode=require"""
pool = 12
ratio = 0.75
hex = 0xDEAD_BEEF
big = 1_000_000

[[users]]
name = "ada"
roles = ["admin"]

[[users]]
name = "grace"
roles = ["editor", "billing"]
`;

/* ── shared helpers ──────────────────────────────────────────────────── */

function parseJsonInput(src: string, what = "JSON"): unknown {
  if (!src.trim()) throw new ToolError(`Paste some ${what} to convert.`);
  return readJson(src, true);
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Find the list of records in a JSON value: an array, or the only array-of-objects property of an object. */
function recordsOf(v: unknown, notes: string[]): unknown[] {
  if (Array.isArray(v)) return v;
  if (isObj(v)) {
    const arrays = Object.entries(v).filter(([, x]) => Array.isArray(x) && x.length && x.every(isObj));
    if (arrays.length === 1 && Object.keys(v).length <= 3) {
      notes.push(`Used the "${arrays[0][0]}" array (${(arrays[0][1] as unknown[]).length} records) inside the object.`);
      return arrays[0][1] as unknown[];
    }
    return [v];
  }
  return [v];
}

type YamlErr = { name?: string; reason?: string; mark?: { line: number; column: number }; message?: string };
function yamlError(e: unknown, src: string): ToolError {
  const y = e as YamlErr;
  if (y?.name === "YAMLException" && y.mark) {
    const line = y.mark.line + 1, col = y.mark.column + 1;
    return new ToolError(`${y.reason ?? "Invalid YAML"} at line ${line}, column ${col}\n${caret(src, { line, col })}`);
  }
  return new ToolError((e as Error)?.message ?? String(e));
}

const cellOf = (x: unknown): string | number | boolean | null =>
  x === undefined || x === null ? null : typeof x === "object" ? JSON.stringify(x) : (x as string | number | boolean);

function tableView(label: string, cols: string[], rows: Record<string, unknown>[], max = 5000): View {
  return { label, out: { kind: "table", columns: cols, rows: rows.slice(0, max).map((r) => cols.map((c) => cellOf(r[c]))), caption: rows.length > max ? `first ${max} rows` : undefined } };
}

const indentOf = (o: Opts) => (str(o.indent) === "tab" ? "\t" : str(o.indent) === "0" ? undefined : Number(o.indent) || 2);
const unescapeOpt = (s: string) => s.replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\r/g, "\r");

const DELIMS: [string, string][] = [[",", "Comma"], [";", "Semicolon"], ["tab", "Tab"], ["|", "Pipe"]];
const delimOf = (v: unknown) => (str(v) === "tab" ? "\t" : str(v, ","));

const SQL_OPTIONS: OptionSpec[] = [
  { id: "dialect", label: "Dialect", type: "select" as const, choices: [["postgres", "PostgreSQL"], ["mysql", "MySQL"], ["sqlite", "SQLite"], ["mssql", "SQL Server"], ["oracle", "Oracle"]] as [string, string][], default: "postgres" },
  { id: "table", label: "Table", type: "text" as const, default: "people", width: 120 },
  { id: "create", label: "CREATE TABLE", type: "toggle" as const, default: true },
  { id: "drop", label: "DROP IF EXISTS", type: "toggle" as const, default: false },
  { id: "pk", label: "id → PRIMARY KEY", type: "toggle" as const, default: true },
  { id: "batch", label: "Rows per INSERT", type: "number" as const, default: 100, min: 1, max: 5000, hint: "1 writes one INSERT statement per row" },
  { id: "emptyNull", label: "Empty → NULL", type: "toggle" as const, default: true },
  { id: "notNull", label: "NOT NULL", type: "toggle" as const, default: false, hint: "Add NOT NULL to columns with no missing values" },
  { id: "varchar", label: "Sized VARCHAR", type: "toggle" as const, default: false, hint: "VARCHAR(n) sized to the longest value instead of TEXT" },
  { id: "snake", label: "snake_case names", type: "toggle" as const, default: false },
];

async function sqlResult(rows: Record<string, unknown>[], cols: string[], opts: Opts, fromText: boolean, notes: string[]): Promise<Result> {
  const { buildSql } = await import("./lib/B-sql");
  if (!rows.length) throw new ToolError("No rows to insert.");
  if (!cols.length) throw new ToolError("No columns found.");
  const r = buildSql(rows, cols, {
    dialect: str(opts.dialect, "postgres") as "postgres",
    table: str(opts.table, "data"),
    create: bool(opts.create),
    drop: bool(opts.drop),
    pk: bool(opts.pk),
    batch: num(opts.batch, 100),
    notNull: bool(opts.notNull),
    varchar: bool(opts.varchar),
    emptyNull: bool(opts.emptyNull),
    snake: bool(opts.snake),
    fromText,
  });
  const schemaRows = r.columns.map((c) => [c.name, c.sqlName, c.sqlType + (c.pk ? " PK" : ""), c.logical === "NULL" ? "unknown (all null)" : c.logical.toLowerCase(), c.nullable ? "yes" : "no", c.nonNull, c.distinct, c.sample]);
  return {
    text: r.sql,
    lang: "sql",
    filename: `${str(opts.table, "data")}.sql`,
    notes: [...notes, ...r.notes],
    views: [
      { label: "SQL", out: { kind: "text", text: r.sql, lang: "sql" } },
      { label: "Schema", out: { kind: "table", columns: ["field", "column", "SQL type", "inferred", "nullable", "values", "distinct", "sample"], rows: schemaRows } },
      tableView(`Rows (${rows.length})`, cols, rows),
    ],
  };
}

/* ── cURL parsed-request view ─────────────────────────────────────────── */

type ReqT = import("./lib/B-curl").Req;

function requestView(r: ReqT): ReactNode {
  const row = (k: string, v: ReactNode) => h("tr", { key: k }, h("th", { style: { width: 150, cursor: "default" } }, k), h("td", { style: { whiteSpace: "pre-wrap", wordBreak: "break-all" } }, v));
  const table = (title: string, cols: [string, string], rows: [string, string][]) =>
    h(
      "section",
      { key: title, style: { marginTop: 14 } },
      h("div", { className: "lbl", style: { marginBottom: 6 } }, `${title} (${rows.length})`),
      rows.length
        ? h("table", { className: "dt" }, h("thead", null, h("tr", null, h("th", null, cols[0]), h("th", null, cols[1]))), h("tbody", null, rows.map(([k, v], i) => h("tr", { key: i }, h("td", null, k), h("td", { style: { whiteSpace: "pre-wrap", wordBreak: "break-all" } }, v)))))
        : h("p", { style: { color: "var(--color-neutral-600)", fontSize: 13, margin: 0 } }, "None")
    );
  const b = r.body;
  const bodyText =
    b.kind === "none" ? "—" : b.kind === "json" ? JSON.stringify(b.value, null, 2) : b.kind === "form" ? b.fields.map(([k, v]) => `${k} = ${v}`).join("\n") : b.kind === "raw" ? b.text : b.parts.map((p) => `${p.name}: ${p.file ? `${p.fromFile ? "<" : "@"}${p.file}` : p.value}${p.type ? ` (${p.type})` : ""}`).join("\n");
  const flags = [r.follow && "follow redirects (-L)", r.insecure && "skip TLS verify (-k)", r.compressed && "compressed", r.timeout && `timeout ${r.timeout}s`, r.connectTimeout && `connect timeout ${r.connectTimeout}s`, r.output && `save to ${r.output}`, r.proxy && `proxy ${r.proxy}`].filter(Boolean).join(" · ");
  return h(
    "div",
    { style: { padding: 14 }, className: "scroll" },
    h(
      "table",
      { className: "dt", style: { minWidth: "100%" } },
      h(
        "tbody",
        null,
        row("Method", h("strong", { style: { color: "var(--color-accent-700)" } }, r.method)),
        row("URL", r.url),
        r.auth ? row("Auth", `${r.auth.type} — ${r.auth.user}:${"•".repeat(Math.min(8, r.auth.pass.length))}`) : null,
        r.bearer ? row("Bearer token", r.bearer.slice(0, 12) + (r.bearer.length > 12 ? "…" : "")) : null,
        row("Body", `${b.kind === "none" ? "none" : b.kind === "form" ? "form (urlencoded)" : b.kind}`),
        flags ? row("Options", flags) : null
      )
    ),
    table("Query parameters", ["name", "value"], r.query),
    table("Headers", ["name", "value"], r.headers),
    h("section", { style: { marginTop: 14 } }, h("div", { className: "lbl", style: { marginBottom: 6 } }, "Body"), h("pre", { className: "mono", style: { margin: 0, fontSize: 12.5, whiteSpace: "pre-wrap", wordBreak: "break-all", background: "rgba(32,30,29,.04)", padding: 10, borderRadius: 8 } }, bodyText))
  );
}

/* ── specs ───────────────────────────────────────────────────────────── */

const specs: SpecModule = {
  "json-to-csv": {
    inputs: [{ id: "json", label: "JSON", lang: "json", placeholder: "An array of objects — nested objects and arrays are fine" }],
    options: [
      { id: "flatten", label: "Flatten nested", type: "toggle", default: true, hint: "customer.address.city columns instead of JSON strings" },
      { id: "arrays", label: "Arrays", type: "select", choices: [["join", "Join values"], ["json", "JSON string"], ["explode", "Explode into rows"], ["columns", "Index columns (tags.0)"]], default: "join" },
      { id: "joiner", label: "Join with", type: "text", default: "; ", width: 60, show: (o) => o.arrays === "join" },
      { id: "delimiter", label: "Delimiter", type: "segment", choices: DELIMS, default: "," },
      { id: "header", label: "Header row", type: "toggle", default: true },
      { id: "quoteAll", label: "Quote all", type: "toggle", default: false },
      { id: "crlf", label: "CRLF", type: "toggle", default: false, hint: "Windows / RFC 4180 line endings" },
      { id: "order", label: "Columns", type: "segment", choices: [["first", "First seen"], ["sorted", "Sorted"]], default: "first" },
    ],
    async run({ inputs, opts }) {
      const notes: string[] = [];
      const v = parseJsonInput(inputs.json);
      const { flattenRecord, explodeRecord, columnsOf, toCsv, csvCell } = await import("./lib/B-tabular");
      const recs = recordsOf(v, notes);
      const delim = delimOf(opts.delimiter);
      const eol = bool(opts.crlf) ? "\r\n" : "\n";
      if (recs.length && recs.every(Array.isArray)) {
        const text = (recs as unknown[][]).map((r) => r.map((c) => csvCell(c, delim, bool(opts.quoteAll))).join(delim)).join(eol);
        const width = Math.max(...(recs as unknown[][]).map((r) => r.length));
        const cols = Array.from({ length: width }, (_, i) => `col${i + 1}`);
        notes.push("Array of arrays: each inner array is written as one row (no header is generated).");
        return { text, filename: "data.csv", notes, views: [{ label: "CSV", out: { kind: "text", text } }, { label: "Table", out: { kind: "table", columns: cols, rows: (recs as unknown[][]).map((r) => cols.map((_, i) => cellOf(r[i]))) } }] };
      }
      const flatten = bool(opts.flatten);
      const arrays = str(opts.arrays, "join") as "join";
      const exploded = arrays === ("explode" as string) ? recs.flatMap((r) => explodeRecord(r, flatten)) : recs;
      if (exploded.length > recs.length) notes.push(`Exploding arrays turned ${recs.length} records into ${exploded.length} rows.`);
      const rows = exploded.map((r) => flattenRecord(r, { flatten, arrays, sep: unescapeOpt(str(opts.joiner, "; ")) }));
      const cols = columnsOf(rows, str(opts.order) === "sorted" ? "sorted" : "first");
      const text = toCsv(cols, rows, { delim, quoteAll: bool(opts.quoteAll), header: bool(opts.header), eol });
      return {
        text,
        filename: "data.csv",
        notes,
        views: [
          { label: "CSV", out: { kind: "text", text } },
          tableView(`Table (${rows.length} × ${cols.length})`, cols, rows),
        ],
      };
    },
    examples: [
      { label: "Nested orders", inputs: { json: ORDERS }, note: "Nested objects become dot-path columns (customer.address.city); arrays of objects are joined as JSON." },
      { label: "Explode line items", inputs: { json: ORDERS }, opts: { arrays: "explode" }, note: "One row per order item — the order fields repeat on each row, items.sku / items.qty become columns." },
      { label: "Index columns", inputs: { json: '[{"user":"ada","tags":["admin","ops"]},{"user":"alan","tags":["dev"]},{"user":"grace","tags":["dev","qa","ops"]}]' }, opts: { arrays: "columns" }, note: "Each array position gets its own column: tags.0, tags.1, tags.2." },
      { label: "Excel (semicolon, CRLF)", inputs: { json: PEOPLE_JSON }, opts: { delimiter: ";", crlf: true, quoteAll: true }, note: "European Excel expects ; with Windows line endings; Quote all wraps every cell." },
      { label: "API envelope", inputs: { json: '{"page": 1, "results": [{"id": "u1", "name": "Ada", "plan": {"tier": "pro", "seats": 5}}, {"id": "u2", "name": "Alan", "plan": {"tier": "free", "seats": 1}}]}' }, note: "The records array inside the response object is found automatically." },
      { label: "No flattening, sorted", inputs: { json: ORDERS }, opts: { flatten: false, arrays: "json", order: "sorted" }, note: "Nested values kept as JSON strings; columns in alphabetical order." },
      { label: "Invalid JSON", inputs: { json: '[{"a": 1}, {"a": 2]' }, error: true, note: "Parse errors point at the exact line and column." },
    ],
    steps: ["Paste a JSON array (or an object wrapping one).", "Choose how nested objects and arrays are laid out.", "Pick the delimiter and line endings your spreadsheet expects.", "Check the Table tab, then copy or download data.csv."],
  },

  "csv-to-json": {
    inputs: [{ id: "csv", label: "CSV", lang: "text", placeholder: "id,name\n1,Ada" }],
    options: [
      { id: "delimiter", label: "Delimiter", type: "select", choices: [["auto", "Auto-detect"], ...DELIMS], default: "auto" },
      { id: "header", label: "Header row", type: "toggle", default: true },
      { id: "typed", label: "Dynamic typing", type: "toggle", default: true, hint: "Numbers, true/false and null become JSON types (leading zeros stay strings)" },
      { id: "skipEmpty", label: "Skip empty lines", type: "toggle", default: true },
      { id: "trim", label: "Trim", type: "toggle", default: false, hint: "Trim spaces around every value and header" },
      { id: "empty", label: "Empty cells", type: "segment", choices: [["string", '""'], ["null", "null"], ["omit", "Omit"]], default: "string" },
      { id: "shape", label: "Output", type: "select", choices: [["objects", "Array of objects"], ["arrays", "Array of arrays"], ["keyed", "Object keyed by column"], ["ndjson", "NDJSON (one per line)"]], default: "objects" },
      { id: "key", label: "Key column", type: "text", default: "", placeholder: "first column", width: 110, show: (o) => o.shape === "keyed" },
      { id: "unflatten", label: "Unflatten a.b headers", type: "toggle", default: true },
      { id: "indent", label: "Indent", type: "segment", choices: [["2", "2"], ["4", "4"], ["0", "Min"]], default: "2" },
    ],
    outLang: "json",
    async run({ inputs, opts }) {
      const src = inputs.csv;
      if (!src.trim()) throw new ToolError("Paste some CSV to convert.");
      const Papa = (await import("papaparse")).default;
      const { typeCell, unflattenRecord } = await import("./lib/B-tabular");
      const d = str(opts.delimiter, "auto");
      const res = Papa.parse<string[]>(src.replace(/^\uFEFF/, ""), { delimiter: d === "auto" ? "" : delimOf(d), skipEmptyLines: bool(opts.skipEmpty) ? "greedy" : false });
      const notes: string[] = [];
      const issues: { level: "error" | "warning" | "info"; message: string; line?: number }[] = [];
      const fatal = res.errors.find((e) => e.code === "MissingQuotes");
      if (fatal) throw new ToolError(`Unclosed quote in row ${(fatal.row ?? 0) + 1} — a field starting with " never ends, so the rest of the file is swallowed. Close the quote or escape inner quotes as "".`);
      for (const e of res.errors) if (e.code !== "UndetectableDelimiter") issues.push({ level: "warning", message: `Row ${(e.row ?? 0) + 1}: ${e.message}` });
      let data = res.data as string[][];
      if (!bool(opts.skipEmpty) && data.length && data[data.length - 1].length === 1 && data[data.length - 1][0] === "" && /\r?\n$/.test(src)) data = data.slice(0, -1);
      if (bool(opts.trim)) data = data.map((r) => r.map((c) => c.trim()));
      if (d === "auto") notes.push(`Detected delimiter: ${res.meta.delimiter === "\t" ? "Tab" : JSON.stringify(res.meta.delimiter)}`);
      const typed = bool(opts.typed);
      const emptyMode = str(opts.empty, "string");
      const conv = (s: string, col = -1) => (typed && !textCols.has(col) ? typeCell(s, emptyMode === "null" ? "null" : "string") : s === "" && emptyMode === "null" ? null : s);
      const shape = str(opts.shape, "objects");
      const ind = indentOf(opts);
      let out: unknown;
      let header: string[] = [];
      let body = data;
      if (bool(opts.header) && data.length) {
        const seen = new Map<string, number>();
        header = data[0].map((hd, i) => {
          let name = hd.trim() === "" ? `column_${i + 1}` : hd;
          if (hd.trim() === "") issues.push({ level: "warning", message: `Header ${i + 1} is empty; named it ${name}` });
          const n = seen.get(name) ?? 0;
          seen.set(name, n + 1);
          if (n) { issues.push({ level: "warning", message: `Duplicate header "${name}" renamed to "${name}_${n + 1}"` }); name = `${name}_${n + 1}`; }
          return name;
        });
        body = data.slice(1);
        body.forEach((r, i) => {
          if (r.length !== header.length) issues.push({ level: "warning", message: `Row ${i + 2}: expected ${header.length} fields, found ${r.length}` });
        });
      }
      const width = header.length || Math.max(0, ...body.map((r) => r.length));
      // A column with any zero-padded number (zip codes, IDs) stays text in every row.
      const textCols = new Set<number>();
      if (typed) for (let c = 0; c < Math.max(width, ...body.map((r) => r.length)); c++) if (body.some((r) => /^[-+]?0\d/.test(r[c] ?? ""))) textCols.add(c);
      const cols = header.length ? header : Array.from({ length: width }, (_, i) => `col${i + 1}`);
      const objects = () =>
        body.map((r) => {
          const o: Record<string, unknown> = {};
          cols.forEach((c, i) => {
            const raw = r[i];
            if ((raw === "" || raw === undefined) && emptyMode === "omit") return;
            o[c] = raw === undefined ? null : conv(raw, i);
          });
          r.slice(cols.length).forEach((x, j) => (o[`_extra${j + 1}`] = conv(x, cols.length + j)));
          return bool(opts.unflatten) ? unflattenRecord(o) : o;
        });
      if (shape === "arrays") out = (bool(opts.header) ? [header, ...body] : body).map((r, i) => (i === 0 && bool(opts.header) ? r : r.map((x, c) => conv(x, c))));
      else if (!bool(opts.header) && shape !== "keyed") out = body.map((r) => r.map((x, c) => conv(x, c)));
      else if (shape === "keyed") {
        const keyCol = str(opts.key).trim() || cols[0];
        const ki = cols.indexOf(keyCol);
        if (ki < 0) throw new ToolError(`Key column "${keyCol}" is not a header. Columns: ${cols.join(", ")}`);
        const obj: Record<string, unknown> = {};
        const objs = objects();
        objs.forEach((o, i) => {
          const k = String(body[i][ki] ?? "");
          if (k in obj) issues.push({ level: "warning", message: `Duplicate key "${k}" in row ${i + 2}; the later row wins` });
          const { [keyCol]: _drop, ...rest } = o;
          obj[k] = rest;
        });
        out = obj;
      } else out = objects();
      let text: string;
      if (shape === "ndjson") text = (Array.isArray(out) ? out : [out]).map((x) => JSON.stringify(x)).join("\n");
      else if (Array.isArray(out) && out.every(Array.isArray) && ind) text = out.length ? `[\n${out.map((r) => (typeof ind === "string" ? ind : " ".repeat(ind)) + JSON.stringify(r)).join(",\n")}\n]` : "[]";
      else text = JSON.stringify(out, null, ind);
      const flat = body.map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i] ?? ""])));
      const views: View[] = [
        { label: "JSON", out: { kind: "text", text, lang: "json" } },
        tableView(`Table (${body.length} × ${cols.length})`, cols, flat),
        { label: "Tree", out: { kind: "tree", value: out } },
      ];
      if (issues.length) views.push({ label: `Issues (${issues.length})`, out: { kind: "issues", items: issues } });
      return { text, views, notes: [...notes, ...issues.slice(0, 3).map((i) => i.message)], filename: shape === "ndjson" ? "data.ndjson" : "data.json", lang: "json" };
    },
    examples: [
      { label: "Employees", inputs: { csv: EMPLOYEES_CSV }, note: "Quoted commas and doubled quotes are handled; manager.name / manager.email are unflattened into a nested object." },
      { label: "Keyed by id", inputs: { csv: EMPLOYEES_CSV }, opts: { shape: "keyed", key: "id", empty: "null" }, note: "An object keyed by the id column — handy for lookups. Empty salary becomes null." },
      { label: "Semicolons (Excel EU)", inputs: { csv: "Produkt;Preis;Menge;Lager\nKaffee;4,50;12;ja\nTee;3,20;0;nein\nKakao;5,10;7;ja" }, note: "The ; delimiter is detected automatically. 4,50 stays a string because the decimal comma is not a JSON number." },
      { label: "Leading zeros kept", inputs: { csv: "zip,code,amount,flag\n02134,007,19.90,true\n10001,042,-3.5,false" }, note: "Dynamic typing converts numbers and booleans, but a column containing zero-padded values like 02134 stays text in every row." },
      { label: "Tab-separated → NDJSON", inputs: { csv: "ts\tlevel\tmessage\n2026-09-24T10:00:01Z\tINFO\tstarted\n2026-09-24T10:00:03Z\tWARN\tslow query (1.2s)\n2026-09-24T10:00:09Z\tERROR\tconnection reset" }, opts: { shape: "ndjson" }, note: "TSV logs become newline-delimited JSON, one record per line." },
      { label: "No header → arrays", inputs: { csv: "1,2,3\n4,5,6\n7,8,9" }, opts: { header: false, shape: "arrays" } },
      { label: "Ragged rows", inputs: { csv: "a,b,c\n1,2,3\n4,5\n6,7,8,9" }, note: "Rows with the wrong number of fields are listed in Issues; extra fields go to _extra1." },
      { label: "Unclosed quote", inputs: { csv: 'name,comment\nada,"great work\nalan,ok' }, error: true, note: "An unterminated quoted field is reported with its row." },
    ],
  },

  "json-to-yaml": {
    inputs: [{ id: "json", label: "JSON", lang: "json" }],
    options: [
      { id: "indent", label: "Indent", type: "segment", choices: [["2", "2"], ["4", "4"]], default: "2" },
      { id: "seqIndent", label: "Indent lists", type: "toggle", default: true, hint: "Off: '- item' sits at the parent key's column (Kubernetes style)" },
      { id: "quotes", label: "Quotes", type: "select", choices: [["single", "Single, when needed"], ["double", "Double, when needed"], ["force-single", "Always single"], ["force-double", "Always double"]], default: "single" },
      { id: "width", label: "Line width", type: "number", default: 80, min: 0, max: 400, hint: "0 = never fold long strings" },
      { id: "flow", label: "Flow level", type: "number", default: -1, min: -1, max: 20, hint: "Nesting depth from which collections are written inline as [a, b] / {k: v}; -1 = never" },
      { id: "sort", label: "Sort keys", type: "toggle", default: false },
      { id: "multi", label: "Array → documents", type: "toggle", default: false, hint: "A top-level array becomes several --- separated YAML documents" },
    ],
    outLang: "yaml",
    async run({ inputs, opts }) {
      let v = parseJsonInput(inputs.json);
      const yaml = (await import("js-yaml")).default;
      if (bool(opts.sort)) v = sortKeysDeep(v);
      const q = str(opts.quotes, "single");
      const dumpOpts = {
        indent: num(opts.indent, 2),
        noArrayIndent: !bool(opts.seqIndent),
        lineWidth: num(opts.width, 80) <= 0 ? -1 : num(opts.width, 80),
        flowLevel: num(opts.flow, -1),
        quotingType: (q.endsWith("double") ? '"' : "'") as '"' | "'",
        forceQuotes: q.startsWith("force"),
        noRefs: true,
      };
      const notes: string[] = [];
      let text: string;
      if (bool(opts.multi) && Array.isArray(v)) {
        text = v.map((d) => "---\n" + yaml.dump(d, dumpOpts)).join("");
        notes.push(`${v.length} documents.`);
      } else {
        text = yaml.dump(v, dumpOpts);
        if (bool(opts.multi)) notes.push("Array → documents applies only when the top level is an array.");
      }
      return { text, filename: "data.yaml", notes, views: [{ label: "YAML", out: { kind: "text", text, lang: "yaml" } }, { label: "Tree", out: { kind: "tree", value: v } }] };
    },
    examples: [
      { label: "Kubernetes Deployment", inputs: { json: K8S_JSON }, opts: { seqIndent: false }, note: "Lists sit at their key's column like kubectl output. The \"yes\" string stays quoted so YAML 1.1 parsers don't read it as true." },
      { label: "Orders, sorted keys", inputs: { json: ORDERS }, opts: { sort: true }, note: "Keys sorted at every level; the note with inner quotes is quoted safely." },
      { label: "Flow style", inputs: { json: K8S_JSON }, opts: { flow: 3 }, note: "Collections nested three or more levels deep are written inline." },
      { label: "Array → documents", inputs: { json: '[{"kind":"Namespace","metadata":{"name":"billing"}},{"kind":"ServiceAccount","metadata":{"name":"api","namespace":"billing"}}]' }, opts: { multi: true }, note: "Each array item becomes its own --- document, ready for kubectl apply -f." },
      { label: "Always double quotes", inputs: { json: '{"name":"api","version":"2.10","port":"8080","enabled":"on","path":"C:\\\\data","multiline":"line one\\nline two"}' }, opts: { quotes: "force-double" }, note: "Every string is double-quoted — including values like \"on\" and \"2.10\" that other YAML parsers would otherwise turn into a boolean or a number." },
      { label: "JSON5 input", inputs: { json: "{\n  // comments and trailing commas are fine\n  name: 'billing',\n  replicas: 3,\n  ports: [80, 443,],\n}" } },
      { label: "Broken JSON", inputs: { json: '{"a": 1,, "b": 2}' }, error: true },
    ],
  },

  "yaml-to-json": {
    inputs: [{ id: "yaml", label: "YAML", lang: "yaml" }],
    options: [
      { id: "docs", label: "Multiple docs", type: "segment", choices: [["array", "Array"], ["first", "First only"], ["ndjson", "NDJSON"]], default: "array", hint: "How to output a file with several --- documents" },
      { id: "schema", label: "Schema", type: "select", choices: [["default", "Default (dates, merge keys)"], ["core", "YAML 1.2 core"], ["json", "JSON schema"], ["failsafe", "Failsafe (all strings)"]], default: "default" },
      { id: "indent", label: "Indent", type: "segment", choices: [["2", "2"], ["4", "4"], ["0", "Min"]], default: "2" },
      { id: "sort", label: "Sort keys", type: "toggle", default: false },
    ],
    outLang: "json",
    async run({ inputs, opts }) {
      const src = inputs.yaml;
      if (!src.trim()) throw new ToolError("Paste some YAML to convert.");
      const yaml = (await import("js-yaml")).default;
      const schema = { default: yaml.DEFAULT_SCHEMA, core: yaml.CORE_SCHEMA, json: yaml.JSON_SCHEMA, failsafe: yaml.FAILSAFE_SCHEMA }[str(opts.schema, "default")] ?? yaml.DEFAULT_SCHEMA;
      let docs: unknown[];
      try {
        docs = yaml.loadAll(src, undefined, { schema });
      } catch (e) {
        throw yamlError(e, src);
      }
      docs = docs.filter((d, i) => !(d === null && i === docs.length - 1 && docs.length > 1));
      if (bool(opts.sort)) docs = docs.map(sortKeysDeep);
      const mode = str(opts.docs, "array");
      const notes: string[] = [];
      let value: unknown;
      let text: string;
      if (docs.length === 0) { value = null; text = "null"; }
      else if (mode === "ndjson") { value = docs; text = docs.map((d) => JSON.stringify(d)).join("\n"); }
      else if (docs.length === 1 || mode === "first") {
        value = docs[0];
        text = JSON.stringify(value, null, indentOf(opts));
        if (docs.length > 1) notes.push(`Showing the first of ${docs.length} documents.`);
      } else {
        value = docs;
        text = JSON.stringify(docs, null, indentOf(opts));
        notes.push(`${docs.length} documents → a JSON array.`);
      }
      if (/(^|[\s:])[&*][A-Za-z0-9_-]+/m.test(src)) notes.push("Anchors and aliases were resolved (aliased values are copied).");
      if (str(opts.schema, "default") === "default" && /:\s+\d{4}-\d{2}-\d{2}(\s|$|T)/.test(src)) notes.push("Unquoted dates were read as timestamps (ISO strings in UTC); switch Schema to YAML 1.2 core to keep them as written.");
      return { text, filename: mode === "ndjson" ? "data.ndjson" : "data.json", notes, views: [{ label: "JSON", out: { kind: "text", text, lang: "json" } }, { label: "Tree", out: { kind: "tree", value } }] };
    },
    examples: [
      { label: "docker-compose", inputs: { yaml: COMPOSE_YAML }, note: "Anchors (&defaults), aliases (*defaults) and << merge keys are expanded; the folded > block becomes one line." },
      { label: "Multi-document", inputs: { yaml: MULTI_DOC_YAML }, note: "Two --- documents become a JSON array; the date is read as a timestamp by the default schema." },
      { label: "Keep dates as text", inputs: { yaml: MULTI_DOC_YAML }, opts: { schema: "core", docs: "ndjson" }, note: "YAML 1.2 core keeps 2026-01-15 as a string; NDJSON puts each document on one line." },
      { label: "Block scalars", inputs: { yaml: "script: |\n  set -e\n  npm ci\n  npm test\nsummary: >\n  Folded text joins\n  lines with spaces.\nkeep: |+\n  trailing newline kept\n\nstrip: >-\n  no newline at end\n" }, note: "| keeps newlines, > folds them, + keeps trailing ones, - strips." },
      { label: "Failsafe schema", inputs: { yaml: "port: 8080\nenabled: true\nratio: 0.5\nempty: ~" }, opts: { schema: "failsafe" }, note: "Failsafe reads every scalar as a string — no type guessing." },
      { label: "Bad indentation", inputs: { yaml: "server:\n  host: localhost\n   port: 8080\n" }, error: true, note: "Errors show line, column and a caret." },
    ],
  },

  "json-to-xml": {
    inputs: [{ id: "json", label: "JSON", lang: "json" }],
    options: [
      { id: "root", label: "Root element", type: "text", default: "", placeholder: "auto", width: 110, hint: "Empty: use the single top-level key, otherwise <root>" },
      { id: "attr", label: "Attribute prefix", type: "select", choices: [["@", "@name"], ["@_", "@_name"], ["-", "-name"], ["$", "$name"], ["", "None"]], default: "@", hint: "Keys starting with this prefix become attributes" },
      { id: "textKey", label: "Text key", type: "text", default: "#text", width: 80 },
      { id: "arrays", label: "Arrays", type: "segment", choices: [["repeat", "Repeat tag"], ["wrap", "Wrap items"]], default: "repeat" },
      { id: "item", label: "Item tag", type: "text", default: "item", width: 80, hint: "Element name for top-level array items, and for wrapped items whose key has no singular (items → item, tags → tag)" },
      { id: "indent", label: "Indent", type: "segment", choices: [["2", "2"], ["4", "4"], ["tab", "Tab"], ["0", "None"]], default: "2" },
      { id: "nulls", label: "null", type: "segment", choices: [["empty", "<a/>"], ["nil", "xsi:nil"], ["omit", "Omit"]], default: "empty" },
      { id: "decl", label: "XML declaration", type: "toggle", default: true },
      { id: "cdata", label: "CDATA for < &", type: "toggle", default: false, hint: "Wrap text containing < or & in CDATA instead of escaping it" },
    ],
    outLang: "xml",
    async run({ inputs, opts }) {
      const v = parseJsonInput(inputs.json);
      const { jsonToXml } = await import("./lib/B-xml");
      const ind = str(opts.indent, "2");
      const { xml, notes } = jsonToXml(v, {
        root: str(opts.root).trim(),
        attrPrefix: str(opts.attr),
        textKey: str(opts.textKey, "#text") || "#text",
        arrays: str(opts.arrays) === "wrap" ? "wrap" : "repeat",
        itemName: str(opts.item, "item") || "item",
        indent: ind === "tab" ? "\t" : ind === "0" ? "" : " ".repeat(Number(ind)),
        decl: bool(opts.decl),
        cdata: bool(opts.cdata),
        nulls: str(opts.nulls, "empty") as "empty",
      });
      return { text: xml, filename: "data.xml", notes, views: [{ label: "XML", out: { kind: "text", text: xml, lang: "xml" } }, { label: "Tree", out: { kind: "xmltree", xml } }] };
    },
    examples: [
      { label: "Attributes & text", inputs: { json: '{\n  "book": {\n    "@id": "bk101",\n    "@lang": "en",\n    "title": "XML Developer\'s Guide",\n    "price": {"@currency": "USD", "#text": 44.95},\n    "authors": {"author": ["Gambardella", "Ralls"]}\n  }\n}' }, note: "@keys become attributes, #text the element text; the author array repeats the <author> tag." },
      { label: "Orders, wrapped arrays", inputs: { json: ORDERS }, opts: { arrays: "wrap", root: "orders", item: "order" }, note: "A top-level array under <orders>, each item an <order>; inner arrays are wrapped and named in the singular: <items><item>, <tags><tag>." },
      { label: "CDATA for markup", inputs: { json: '{"post":{"@id":7,"title":"Tips & tricks","body":"<p>Use <code>&lt;br&gt;</code> sparingly</p>"}}' }, opts: { cdata: true }, note: "Text containing < or & goes into CDATA instead of being escaped." },
      { label: "Nulls as xsi:nil", inputs: { json: '{"customer":{"id":42,"middleName":null,"email":"ada@example.com","fax":null}}' }, opts: { nulls: "nil" }, note: "null values become xsi:nil=\"true\" and the xsi namespace is declared on the root." },
      { label: "Invalid names fixed", inputs: { json: '{"2024 report": {"total sales": 1200, "q1-growth": "4%", "@class": "summary"}}' }, opts: { decl: false, indent: "4" }, note: "Keys with spaces or a leading digit are renamed to valid XML names." },
      { label: "Compact", inputs: { json: '{"note":{"to":"Tove","from":"Jani","heading":"Reminder","body":"Don\'t forget me this weekend!"}}' }, opts: { indent: "0", decl: false } },
    ],
  },

  "xml-to-json": {
    inputs: [{ id: "xml", label: "XML", lang: "xml" }],
    options: [
      { id: "noAttrs", label: "Ignore attributes", type: "toggle", default: false },
      { id: "attr", label: "Attribute prefix", type: "text", default: "@", width: 60, show: (o) => !o.noAttrs },
      { id: "textKey", label: "Text key", type: "text", default: "#text", width: 80 },
      { id: "parse", label: "Parse numbers & booleans", type: "toggle", default: true },
      { id: "arrays", label: "Always array", type: "text", default: "", placeholder: "tag, tag2", width: 140, hint: "Comma-separated tag names that are always arrays, even with one element" },
      { id: "stripNs", label: "Remove ns prefixes", type: "toggle", default: false },
      { id: "comments", label: "Keep comments", type: "toggle", default: false },
      { id: "mode", label: "Structure", type: "segment", choices: [["compact", "Compact"], ["order", "Preserve order"]], default: "compact", hint: "Preserve order keeps mixed content and sibling order as arrays" },
      { id: "indent", label: "Indent", type: "segment", choices: [["2", "2"], ["4", "4"], ["0", "Min"]], default: "2" },
    ],
    outLang: "json",
    async run({ inputs, opts }) {
      const src = inputs.xml;
      if (!src.trim()) throw new ToolError("Paste some XML to convert.");
      const { XMLParser, XMLValidator } = await import("fast-xml-parser");
      const ok = XMLValidator.validate(src, { allowBooleanAttributes: true });
      if (ok !== true) {
        const { line, col, msg } = ok.err;
        throw new ToolError(`${msg} at line ${line}, column ${col}\n${caret(src, { line, col })}`);
      }
      const always = new Set(str(opts.arrays).split(",").map((s) => s.trim()).filter(Boolean));
      const parse = bool(opts.parse);
      const parser = new XMLParser({
        ignoreAttributes: bool(opts.noAttrs),
        attributeNamePrefix: str(opts.attr, "@"),
        textNodeName: str(opts.textKey, "#text") || "#text",
        parseTagValue: parse,
        parseAttributeValue: parse,
        numberParseOptions: { leadingZeros: false, hex: true, eNotation: true },
        removeNSPrefix: bool(opts.stripNs),
        preserveOrder: str(opts.mode) === "order",
        commentPropName: bool(opts.comments) ? "#comment" : undefined,
        ignoreDeclaration: true,
        ignorePiTags: true,
        trimValues: true,
        allowBooleanAttributes: true,
        isArray: (name: string, _jpath: string, _leaf: boolean, isAttr: boolean) => !isAttr && always.has(name),
      });
      let value = parser.parse(src);
      if (str(opts.mode) !== "order" && !bool(opts.noAttrs)) {
        // Put attributes before child elements, the way they appear in the markup.
        const pre = str(opts.attr, "@");
        const attrsFirst = (x: unknown): unknown => {
          if (Array.isArray(x)) return x.map(attrsFirst);
          if (!isObj(x)) return x;
          const keys = Object.keys(x);
          const ordered = [...keys.filter((k) => k.startsWith(pre)), ...keys.filter((k) => !k.startsWith(pre))];
          return Object.fromEntries(ordered.map((k) => [k, attrsFirst(x[k])]));
        };
        if (pre) value = attrsFirst(value);
      }
      const text = JSON.stringify(value, null, indentOf(opts));
      const notes: string[] = [];
      if (always.size) {
        const found = [...always].filter((t) => new RegExp(`<(\\w+:)?${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s/>]`).test(src));
        if (found.length < always.size) notes.push(`Not found in the document: ${[...always].filter((t) => !found.includes(t)).join(", ")}`);
      }
      return { text, filename: "data.json", notes, views: [{ label: "JSON", out: { kind: "text", text, lang: "json" } }, { label: "Tree", out: { kind: "tree", value } }, { label: "XML tree", out: { kind: "xmltree", xml: src } }] };
    },
    examples: [
      { label: "Catalog", inputs: { xml: CATALOG_XML }, note: "Attributes become @keys, repeated <book> elements an array, and prices numbers. Note issue 0042 keeps its leading zeros." },
      { label: "Always-array tags", inputs: { xml: CATALOG_XML }, opts: { arrays: "tag, book", stripNs: true }, note: "<tag> is an array even when a book has one tag; dc: prefixes are removed." },
      { label: "No attributes, strings only", inputs: { xml: CATALOG_XML }, opts: { noAttrs: true, parse: false }, note: "Attributes dropped and every value kept as a string." },
      { label: "RSS feed", inputs: { xml: '<?xml version="1.0"?>\n<rss version="2.0">\n  <channel>\n    <title>Formatter blog</title>\n    <link>https://example.com</link>\n    <item>\n      <title>Offline first</title>\n      <pubDate>Tue, 01 Sep 2026 09:00:00 GMT</pubDate>\n      <guid isPermaLink="false">post-41</guid>\n    </item>\n    <item>\n      <title>Validators, explained</title>\n      <pubDate>Thu, 17 Sep 2026 09:00:00 GMT</pubDate>\n      <guid isPermaLink="false">post-42</guid>\n    </item>\n  </channel>\n</rss>' }, opts: { attr: "_" } },
      { label: "Mixed content, ordered", inputs: { xml: "<p>Hello <b>bold</b> and <i>italic</i> world<!-- note --></p>" }, opts: { mode: "order", comments: true }, note: "Preserve order keeps text and elements in sequence — needed for document-style XML." },
      { label: "Mismatched tag", inputs: { xml: "<order>\n  <id>7</id>\n  <total>9.99</totl>\n</order>" }, error: true, note: "Well-formedness errors show line and column." },
    ],
  },

  "toml-to-json": {
    inputs: [{ id: "toml", label: "TOML", lang: "toml" }],
    options: [
      { id: "indent", label: "Indent", type: "segment", choices: [["2", "2"], ["4", "4"], ["0", "Min"]], default: "2" },
      { id: "sort", label: "Sort keys", type: "toggle", default: false },
      { id: "bigint", label: "Big integers as strings", type: "toggle", default: true, hint: "Integers beyond 2^53 are output as strings so no digits are lost" },
    ],
    outLang: "json",
    async run({ inputs, opts }) {
      const src = inputs.toml;
      if (!src.trim()) throw new ToolError("Paste some TOML to convert.");
      const { parse } = await import("smol-toml");
      let v: unknown;
      try {
        v = parse(src, { integersAsBigInt: bool(opts.bigint) ? "asNeeded" : false });
      } catch (e) {
        const t = e as { line?: number; column?: number; message: string };
        const first = t.message.split("\n")[0].replace(/^Invalid TOML document:\s*/, "");
        if (t.line) throw new ToolError(`${first} at line ${t.line}, column ${t.column}\n${caret(src, { line: t.line, col: t.column ?? 1 })}`);
        throw new ToolError(first);
      }
      let big = 0;
      const plain = JSON.parse(
        JSON.stringify(v, function (this: Record<string, unknown>, k, x) {
          const orig = this[k];
          if (orig instanceof Date) return orig.toISOString().replace(/\.000(?=Z|[+-]|$)/, "");
          return typeof x === "bigint" ? (big++, x.toString()) : x;
        })
      );
      const value = bool(opts.sort) ? sortKeysDeep(plain) : plain;
      const text = JSON.stringify(value, null, indentOf(opts));
      const notes: string[] = [];
      if (big) notes.push(`${big} integer(s) too large for JavaScript numbers were written as strings.`);
      if (/=\s*\d{4}-\d{2}-\d{2}|=\s*\d{2}:\d{2}:\d{2}/.test(src)) notes.push("TOML dates and times became ISO-8601 strings (JSON has no date type).");
      return { text, filename: "data.json", notes, views: [{ label: "JSON", out: { kind: "text", text, lang: "json" } }, { label: "Tree", out: { kind: "tree", value } }] };
    },
    examples: [
      { label: "Cargo.toml", inputs: { toml: CARGO_TOML }, note: "Inline tables, nested [profile.release] and [[bin]] arrays of tables." },
      { label: "Service config", inputs: { toml: SERVER_TOML }, note: "Dates, times, multi-line strings, hex and underscore numbers." },
      { label: "pyproject.toml", inputs: { toml: '[project]\nname = "formatter"\nversion = "1.2.0"\nrequires-python = ">=3.10"\ndependencies = [\n  "httpx>=0.27",\n  "pydantic>=2",\n]\n\n[project.optional-dependencies]\ndev = ["pytest", "ruff"]\n\n[tool.ruff]\nline-length = 100\nselect = ["E", "F", "I"]\n\n[tool.pytest.ini_options]\naddopts = "-q"' }, opts: { sort: true } },
      { label: "Huge integer", inputs: { toml: "id = 9007199254740993\nsmall = 42" }, note: "2^53 + 1 cannot be a JavaScript number; it is kept exactly as a string." },
      { label: "Duplicate table", inputs: { toml: '[server]\nport = 80\n\n[server]\nhost = "x"' }, error: true, note: "TOML forbids defining a table twice." },
    ],
  },

  "json-to-toml": {
    inputs: [{ id: "json", label: "JSON", lang: "json" }],
    options: [
      { id: "sort", label: "Sort keys", type: "toggle", default: false },
      { id: "dates", label: "ISO strings → TOML dates", type: "toggle", default: true, hint: "\"2026-01-15\" becomes the TOML date 2026-01-15" },
      { id: "rootKey", label: "Key for a root array", type: "text", default: "items", width: 90 },
    ],
    outLang: "toml",
    async run({ inputs, opts }) {
      let v = parseJsonInput(inputs.json);
      const { stringify, TomlDate } = await import("smol-toml");
      const notes: string[] = [];
      if (!isObj(v)) {
        const k = str(opts.rootKey, "items") || "items";
        v = { [k]: v };
        notes.push(`TOML's top level must be a table, so the value was put under "${k}".`);
      }
      if (bool(opts.sort)) v = sortKeysDeep(v);
      const dropped: string[] = [];
      let dates = 0;
      const clean = (x: unknown, path: string): unknown => {
        if (Array.isArray(x)) {
          const out: unknown[] = [];
          x.forEach((y, i) => {
            if (y === null) dropped.push(`${path}[${i}]`);
            else out.push(clean(y, `${path}[${i}]`));
          });
          return out;
        }
        if (isObj(x)) {
          const out: Record<string, unknown> = {};
          for (const [k, y] of Object.entries(x)) {
            const p = path ? `${path}.${/^[A-Za-z0-9_-]+$/.test(k) ? k : JSON.stringify(k)}` : k;
            if (y === null) dropped.push(p);
            else out[k] = clean(y, p);
          }
          return out;
        }
        if (typeof x === "string" && bool(opts.dates) && /^(\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?|\d{2}:\d{2}:\d{2}(\.\d+)?)$/.test(x)) {
          try {
            const d = new TomlDate(x);
            if (!Number.isNaN(d.getTime())) { dates++; return d; }
          } catch { /* keep string */ }
        }
        return x;
      };
      const cleaned = clean(v, "") as Record<string, unknown>;
      let text: string;
      try {
        text = stringify(cleaned);
      } catch (e) {
        throw new ToolError(`Cannot express this in TOML: ${(e as Error).message}`);
      }
      text = text.replace(/(=\s*|[[,]\s*)(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}|\d{2}:\d{2}:\d{2})\.000(?=Z|[+-]\d{2}:\d{2}|\s|,|\]|$)/gm, "$1$2");
      if (dropped.length) notes.push(`TOML has no null — dropped ${dropped.length}: ${dropped.slice(0, 12).join(", ")}${dropped.length > 12 ? "…" : ""}`);
      if (dates) notes.push(`${dates} ISO date/time string(s) written as TOML dates.`);
      return { text: text.trim() + "\n", filename: "data.toml", notes, views: [{ label: "TOML", out: { kind: "text", text: text.trim() + "\n", lang: "toml" } }, { label: "Tree", out: { kind: "tree", value: JSON.parse(JSON.stringify(cleaned)) } }] };
    },
    examples: [
      { label: "App config", inputs: { json: '{\n  "title": "Billing service",\n  "owner": {"name": "Ada", "since": "2024-02-01", "email": null},\n  "server": {"host": "0.0.0.0", "port": 8080, "tls": {"enabled": true, "cert": "/etc/ssl/app.pem"}},\n  "database": {"url": "postgres://db/billing", "pool": 12, "replicas": ["db-a", "db-b"], "timeout": null},\n  "deployedAt": "2026-09-24T08:30:00Z"\n}' }, note: "Nested objects become [tables]; nulls are dropped and listed; ISO strings become TOML dates." },
      { label: "Arrays of tables", inputs: { json: '{"package":{"name":"formatter-cli","version":"0.4.2"},"bin":[{"name":"fmt","path":"src/main.rs"},{"name":"fmt-server","path":"src/server.rs"}],"dependencies":{"serde":{"version":"1.0","features":["derive"]}}}' }, note: "An array of objects becomes repeated [[bin]] sections." },
      { label: "Root array", inputs: { json: PEOPLE_JSON }, opts: { rootKey: "people", dates: false }, note: "A top-level array is wrapped in a key; dates stay strings with the toggle off." },
      { label: "Sorted", inputs: { json: K8S_JSON }, opts: { sort: true } },
      { label: "Invalid JSON", inputs: { json: '{"a": }' }, error: true },
    ],
  },

  "json-to-sql": {
    inputs: [{ id: "json", label: "JSON rows", lang: "json", placeholder: '[{"id": 1, "name": "Ada"}]' }],
    options: SQL_OPTIONS,
    outLang: "sql",
    async run({ inputs, opts }) {
      const notes: string[] = [];
      const v = parseJsonInput(inputs.json);
      const recs = recordsOf(v, notes);
      const rows = recs.map((r) => (isObj(r) ? r : { value: r }));
      const { columnsOf } = await import("./lib/B-tabular");
      return sqlResult(rows, columnsOf(rows), opts, false, notes);
    },
    examples: [
      { label: "People (PostgreSQL)", inputs: { json: PEOPLE_JSON }, note: "INTEGER id as PRIMARY KEY, dates as DATE, booleans as BOOLEAN, decimals as NUMERIC(p,s); the apostrophe in O'Hopper is escaped." },
      { label: "Orders → JSONB", inputs: { json: ORDERS }, opts: { table: "orders", drop: true }, note: "Nested objects and arrays go into JSONB columns; the ISO timestamps become TIMESTAMPTZ." },
      { label: "MySQL, one row per INSERT", inputs: { json: PEOPLE_JSON }, opts: { dialect: "mysql", batch: 1, varchar: true }, note: "Backtick identifiers, sized VARCHARs and a separate INSERT per row." },
      { label: "SQL Server", inputs: { json: PEOPLE_JSON }, opts: { dialect: "mssql", notNull: true }, note: "[bracket] identifiers, BIT for booleans (1/0), NVARCHAR, and NOT NULL where no values are missing." },
      { label: "Oracle INSERT ALL", inputs: { json: ORDERS }, opts: { dialect: "oracle", table: "orders", drop: true }, note: "Oracle has no multi-row VALUES: rows are batched with INSERT ALL … SELECT 1 FROM DUAL, dates use DATE/TIMESTAMP literals." },
      { label: "SQLite, snake_case", inputs: { json: '[{"userId": 7, "displayName": "Ada", "lastSeenAt": "2026-09-23 18:04:00", "isAdmin": true}, {"userId": 8, "displayName": "Alan", "lastSeenAt": null, "isAdmin": false}]' }, opts: { dialect: "sqlite", snake: true, table: "users" }, note: "camelCase keys become snake_case columns; SQLite stores booleans as 0/1 and dates as TEXT." },
    ],
  },

  "csv-to-sql": {
    inputs: [{ id: "csv", label: "CSV", lang: "text" }],
    options: [{ id: "delimiter", label: "Delimiter", type: "select", choices: [["auto", "Auto-detect"], ...DELIMS], default: "auto" }, ...SQL_OPTIONS.map((o): OptionSpec => (o.id === "table" && o.type === "text" ? { ...o, default: "employees" } : o))],
    outLang: "sql",
    async run({ inputs, opts }) {
      const src = inputs.csv;
      if (!src.trim()) throw new ToolError("Paste some CSV with a header row.");
      const Papa = (await import("papaparse")).default;
      const d = str(opts.delimiter, "auto");
      const res = Papa.parse<string[]>(src.replace(/^\uFEFF/, ""), { delimiter: d === "auto" ? "" : delimOf(d), skipEmptyLines: "greedy" });
      const fatal = res.errors.find((e) => e.code === "MissingQuotes");
      if (fatal) throw new ToolError(`Unclosed quote in row ${(fatal.row ?? 0) + 1}.`);
      const [head, ...body] = res.data as string[][];
      if (!head) throw new ToolError("The CSV has no header row.");
      const seen = new Map<string, number>();
      const cols = head.map((c, i) => {
        let n = c.trim() || `column_${i + 1}`;
        const k = seen.get(n.toLowerCase()) ?? 0;
        seen.set(n.toLowerCase(), k + 1);
        if (k) n = `${n}_${k + 1}`;
        return n;
      });
      const notes: string[] = [];
      if (d === "auto" && res.meta.delimiter !== ",") notes.push(`Detected delimiter: ${res.meta.delimiter === "\t" ? "Tab" : res.meta.delimiter}`);
      const ragged = body.filter((r) => r.length !== cols.length).length;
      if (ragged) notes.push(`${ragged} row(s) have a different number of fields than the header; missing values are NULL.`);
      const rows = body.map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i] === undefined ? null : r[i]])));
      return sqlResult(rows, cols, opts, true, notes);
    },
    examples: [
      { label: "Employees", inputs: { csv: EMPLOYEES_CSV }, note: "Types are inferred from the text: INTEGER, NUMERIC(p,s), DATE, BOOLEAN; empty salary → NULL." },
      { label: "MySQL with DROP", inputs: { csv: EMPLOYEES_CSV }, opts: { dialect: "mysql", drop: true, snake: true }, note: "manager.name becomes manager_name; backslashes and quotes are escaped the MySQL way." },
      { label: "Big IDs → BIGINT", inputs: { csv: "id,event,occurred_at,amount\n9007199254740000,signup,2026-09-01T10:00:00Z,0\n9007199254740001,purchase,2026-09-01T10:05:12Z,49.95\n9007199254740002,refund,2026-09-02T08:00:00Z,-49.95" }, opts: { table: "events", batch: 2 }, note: "IDs beyond 32 bits become BIGINT; two rows per INSERT." },
      { label: "Tab-separated, SQLite", inputs: { csv: "sku\tname\tprice\tin_stock\nKB-01\tKeyboard\t49.50\ttrue\nMS-02\tMouse \"Pro\"\t19.99\tfalse\nMN-27\tMonitor 27\"\t229.00\ttrue" }, opts: { dialect: "sqlite", table: "products", pk: false } },
      { label: "SQL Server", inputs: { csv: "Id,Name,City\n1,Zoë,Zürich\n2,Åsa,Malmö\n3,Renée,Montréal" }, opts: { dialect: "mssql", table: "dbo.Customers", varchar: true }, note: "Schema-qualified table, [brackets], and N'…' literals for Unicode text." },
    ],
  },

  "graphviz-to-mermaid": {
    inputs: [{ id: "dot", label: "Graphviz DOT", lang: "dot", placeholder: "digraph { a -> b -> c; }" }],
    options: [
      { id: "direction", label: "Direction", type: "segment", choices: [["auto", "From rankdir"], ["TD", "TD"], ["LR", "LR"], ["BT", "BT"], ["RL", "RL"]], default: "auto" },
      { id: "shape", label: "Default shape", type: "segment", choices: [["dot", "Ellipse (DOT)"], ["box", "Rectangle"]], default: "dot", hint: "Graphviz draws nodes as ellipses unless told otherwise" },
      { id: "colors", label: "Colors & styles", type: "toggle", default: true },
      { id: "title", label: "Graph label → title", type: "toggle", default: true },
    ],
    outLang: "mermaid",
    layout: "split",
    async run({ inputs, opts, pipeline }) {
      if (!inputs.dot.trim()) throw new ToolError("Paste a Graphviz DOT graph, e.g. digraph { a -> b }");
      const { parseDot, dotToMermaid } = await import("./lib/B-dot");
      const g = parseDot(inputs.dot);
      const { text, notes } = dotToMermaid(g, { direction: str(opts.direction, "auto"), defaultShape: str(opts.shape) === "box" ? "box" : "dot", colors: bool(opts.colors), title: bool(opts.title) });
      const views: View[] = [{ label: "Mermaid", out: { kind: "text", text, lang: "mermaid" } }];
      if (!isNode && !pipeline) {
        try {
          const { renderMermaid } = await import("./lib/mermaid");
          views.push({ label: "Preview", out: { kind: "svg", svg: await renderMermaid(text), name: "graph" } });
        } catch (e) {
          notes.push(`Preview unavailable: ${(e as Error).message}`);
        }
      }
      views.push({
        label: `Graph (${g.nodes.size} nodes, ${g.edges.length} edges)`,
        out: {
          kind: "table",
          columns: ["from", "to", "label", "style"],
          rows: g.edges.map((e) => [e.from, e.to, e.attrs.label ?? null, [e.attrs.style, e.attrs.color].filter(Boolean).join(" ") || null]),
        },
      });
      return { text, notes, filename: "graph.mmd", views };
    },
    examples: [
      { label: "Build pipeline", inputs: { dot: 'digraph pipeline {\n  rankdir=LR;\n  node [shape=box, style=rounded];\n  checkout -> install -> lint;\n  install -> test -> build -> deploy;\n  lint -> build [style=dashed, label="must pass"];\n  deploy [shape=cylinder, label="Deploy\\nto prod", style=filled, fillcolor=lightgreen];\n}' }, note: "rankdir=LR → flowchart LR, edge chains expand, the dashed labelled edge becomes -.->, the cylinder a [( )] node." },
      { label: "Clusters", inputs: { dot: 'digraph G {\n  label="Web architecture";\n  subgraph cluster_front {\n    label="Frontend"; style=filled; color=lightgrey;\n    browser [shape=ellipse]; cdn [label="CDN"];\n  }\n  subgraph cluster_back {\n    label="Backend";\n    api [shape=box]; worker [shape=box];\n    db [shape=cylinder, label="Postgres"];\n  }\n  browser -> cdn -> api;\n  api -> db;\n  api -> worker [label="jobs", color=blue];\n  worker -> db;\n}' }, note: "Clusters become Mermaid subgraphs with their labels; the graph label becomes the title." },
      { label: "State machine", inputs: { dot: '// order lifecycle\ndigraph order {\n  node [shape=circle];\n  start [shape=point];\n  done [shape=doublecircle];\n  start -> created;\n  created -> paid [label="pay"];\n  created -> cancelled [label="cancel"];\n  paid -> shipped [label="ship", penwidth=2];\n  shipped -> done;\n  cancelled -> done;\n}' }, note: "circle → (( )), doublecircle → ((( ))), penwidth ≥ 2 → a thick ==> edge." },
      { label: "Undirected + groups", inputs: { dot: 'strict graph network {\n  "Core Switch" [shape=box3d];\n  "Core Switch" -- {r1 r2 r3};\n  r1 -- r2 -- r3;\n  r1 -- r2; /* duplicate, merged by strict */\n  r3 -- "NAS #1" [label="10G"];\n}' }, note: "{r1 r2 r3} fans out to three edges; -- becomes ---; quoted IDs are made Mermaid-safe." },
      { label: "Decision tree", inputs: { dot: 'digraph {\n  q1 [shape=diamond, label="Tests pass?"];\n  q2 [shape=diamond, label="Reviewed?"];\n  fix [label="Fix tests"]; ask [label="Request review"]; merge [shape=hexagon, label="Merge"];\n  q1 -> q2 [label="yes"]; q1 -> fix [label="no", color=red];\n  q2 -> merge [label="yes"]; q2 -> ask [label="no"];\n  fix -> q1 [style=dotted];\n}' }, opts: { direction: "TD" } },
      { label: "Syntax error", inputs: { dot: "digraph {\n  a -> b\n  b -> [label=x]\n}" }, error: true, note: "Parse errors name the line, column and token." },
    ],
  },

  "curl-to-code": {
    inputs: [{ id: "curl", label: "cURL command", lang: "shell", wrap: true, placeholder: "curl -X POST https://api.example.com/users -H 'Content-Type: application/json' -d '{\"name\":\"Ada\"}'" }],
    options: [{ id: "target", label: "Target", type: "select", choices: [["fetch", "JavaScript fetch"], ["axios", "Node.js axios"], ["requests", "Python requests"], ["httpx", "Python httpx"], ["go", "Go net/http"], ["php", "PHP cURL"], ["ruby", "Ruby Net::HTTP"], ["java", "Java HttpClient"], ["csharp", "C# HttpClient"], ["rust", "Rust reqwest"], ["powershell", "PowerShell"], ["httpie", "HTTPie"], ["wget", "wget"]], default: "fetch" }],
    async run({ inputs, opts, pipeline }) {
      const { parseCurl, generate, TARGET_LANG } = await import("./lib/B-curl");
      const req = parseCurl(inputs.curl);
      const target = str(opts.target, "fetch");
      const text = generate(target, req);
      const lang = TARGET_LANG[target] ?? "text";
      const ext: Record<string, string> = { fetch: "js", axios: "mjs", requests: "py", httpx: "py", go: "go", php: "php", ruby: "rb", java: "java", csharp: "cs", rust: "rs", powershell: "ps1", httpie: "sh", wget: "sh" };
      const views: View[] = [{ label: "Code", out: { kind: "text", text, lang } }];
      if (!pipeline) views.push({ label: "Parsed request", out: { kind: "react", node: requestView(req) } });
      return { text, lang, notes: req.notes, filename: `request.${ext[target] ?? "txt"}`, views };
    },
    examples: [
      { label: "POST JSON", inputs: { curl: `curl -X POST 'https://api.example.com/v1/users?notify=true' \\\n  -H 'Content-Type: application/json' \\\n  -H 'Authorization: Bearer ' \\\n  -H "Accept: application/json" \\\n  -d '{"name": "Ada Lovelace", "email": "ada@example.com", "roles": ["admin"], "active": true}'`.replace("Bearer ", "Bearer " + "tok_" + "x".repeat(20)) }, note: "Headers, query string and a JSON body; open Parsed request to see how the command was read." },
      { label: "Python requests", inputs: { curl: "curl 'https://api.example.com/search?q=offline+tools&page=2' -u ada:s3cret --compressed -L -m 15" }, opts: { target: "requests" }, note: "-u becomes auth=(), query parameters a params dict, -m a timeout." },
      { label: "Multipart upload → Go", inputs: { curl: "curl -F 'title=Quarterly report' -F 'file=@report.pdf;type=application/pdf' -F 'tags=finance' https://files.example.com/upload" }, opts: { target: "go" }, note: "-F builds multipart/form-data; @file uploads a file with its content type." },
      { label: "Form + cookies → PHP", inputs: { curl: "curl https://shop.example.com/cart --data-urlencode 'note=gift wrap & card' -d qty=2 -d sku=KB-01 -b 'session=abc123; theme=dark' -A 'Mozilla/5.0' -e https://shop.example.com/ -k" }, opts: { target: "php" }, note: "Data joined with &, --data-urlencode encodes its value, -b sets cookies, -k skips TLS checks." },
      { label: "--json → Rust", inputs: { curl: `curl --json '{"query":"{ viewer { login } }"}' https://api.example.com/graphql` }, opts: { target: "rust" }, note: "--json sets both Content-Type and Accept to application/json." },
      { label: "-G query → HTTPie", inputs: { curl: "curl -G https://api.example.com/items -d limit=20 -d 'sort=-created' --data-urlencode 'filter=status eq \"open\"'" }, opts: { target: "httpie" }, note: "-G moves the -d data into the query string; HTTPie gets name==value items." },
      { label: "Chrome (Windows cmd)", inputs: { curl: 'curl ^"https://example.com/api/v2/orders?limit=5^" ^\n  -H ^"accept: application/json^" ^\n  -H ^"x-requested-with: XMLHttpRequest^" ^\n  --compressed' }, opts: { target: "csharp" }, note: "Copy as cURL (cmd) uses ^ escapes and ^ line continuations." },
      { label: "$'…' body → PowerShell", inputs: { curl: "curl -X PUT https://api.example.com/notes/7 -H 'Content-Type: text/plain' --data-binary $'line one\\nline two\\ttabbed'" }, opts: { target: "powershell" }, note: "ANSI-C quoting turns \\n and \\t into real newlines and tabs." },
      { label: "Download → wget", inputs: { curl: "curl -L -o release.tar.gz --max-time 120 https://github.com/example/app/releases/download/v1.2.0/app.tar.gz" }, opts: { target: "wget" } },
      { label: "Not curl", inputs: { curl: "wget https://example.com" }, error: true },
    ],
    tips: ["Paste straight from DevTools: Copy → Copy as cURL (bash or cmd).", "Every generated snippet is plain text — nothing is sent anywhere."],
  },

  "template-string-merger": {
    inputs: [
      { id: "template", label: "Template", lang: "text", placeholder: "Hello {{name | title}}!", wrap: true },
      { id: "data", label: "Data (JSON)", lang: "json", rows: 9, placeholder: '{"name": "ada"}' },
    ],
    options: [
      { id: "escape", label: "HTML escape", type: "toggle", default: false, hint: "Escape <, >, &, quotes in {{var}}; {{{var}}} stays raw" },
      { id: "missing", label: "Missing vars", type: "segment", choices: [["blank", "Blank"], ["keep", "Keep {{tag}}"], ["mark", "[missing]"]], default: "blank" },
      { id: "merge", label: "Mail merge", type: "toggle", default: true, hint: "When the data is an array, render once per record" },
      { id: "sep", label: "Separator", type: "text", default: "\\n\\n---\\n\\n", width: 110, show: (o) => !!o.merge, hint: "Between merged records; \\n = newline" },
    ],
    async run({ inputs, opts }) {
      const tpl = inputs.template;
      if (!tpl.trim()) throw new ToolError("Write a template, e.g. Hello {{name}}!");
      let data: unknown = {};
      if (inputs.data.trim()) {
        try {
          data = readJson(inputs.data, true);
        } catch (e) {
          throw new ToolError(`Data JSON: ${(e as Error).message}`);
        }
      }
      const { compileTemplate, renderTemplate, referencedRoots } = await import("./lib/B-template");
      const nodes = compileTemplate(tpl);
      const ro = { escape: bool(opts.escape), missing: str(opts.missing, "blank") as "blank" };
      const warnings: { line: number; message: string }[] = [];
      let text: string;
      const perRecord: [number, number, string][] = [];
      const merge = bool(opts.merge) && Array.isArray(data);
      if (merge) {
        const outs = (data as unknown[]).map((rec, i) => {
          const w0 = warnings.length;
          const o = renderTemplate(nodes, rec, ro, warnings, `Record ${i + 1}: `);
          perRecord.push([i + 1, warnings.length - w0, o.split("\n")[0].slice(0, 80)]);
          return o;
        });
        text = outs.join(unescapeOpt(str(opts.sep, "\n\n---\n\n")));
      } else text = renderTemplate(nodes, data, ro, warnings);
      const sample = merge ? (data as unknown[])[0] : data;
      const refs = referencedRoots(nodes);
      const unused = isObj(sample) ? Object.keys(sample).filter((k) => !refs.has(k)) : [];
      const issues = [
        ...warnings.map((w) => ({ level: "warning" as const, message: w.message, line: w.line })),
        ...(unused.length ? [{ level: "info" as const, message: `Data fields not used by the template: ${unused.join(", ")}` }] : []),
      ];
      const views: View[] = [
        { label: "Output", out: { kind: "text", text, wrap: true } },
        { label: `Warnings (${warnings.length})`, out: { kind: "issues", items: issues } },
      ];
      if (/<(p|div|h[1-6]|table|ul|ol|li|br|strong|em|a|span|b|i)\b/i.test(text)) views.splice(1, 0, { label: "HTML preview", out: { kind: "html", html: text } });
      if (merge) views.push({ label: `Records (${perRecord.length})`, out: { kind: "table", columns: ["#", "warnings", "first line"], rows: perRecord } });
      const notes = warnings.length ? [`${warnings.length} missing variable${warnings.length === 1 ? "" : "s"} — see Warnings.`] : [];
      if (merge) notes.unshift(`Mail merge: ${(data as unknown[]).length} records.`);
      return { text, views, notes };
    },
    examples: [
      {
        label: "Order email",
        inputs: {
          template: "Hi {{customer.name | title}},\n\nThanks for order #{{id}} placed on {{placedAt | date:\"D MMMM YYYY\"}}.\n\n{{#each items}}\n{{@number}}. {{sku}} × {{qty}} — ${{price | number:2}}\n{{/each}}\n\n{{#if paid}}Payment received — we'll ship soon.{{else}}Payment is still pending.{{/if}}\n{{#if note}}Delivery note: {{note}}{{/if}}\n{{! internal: signature below }}\n— The {{shop | default:\"Formatter\"}} team",
          data: '{\n  "id": 1001,\n  "customer": {"name": "ada lovelace", "email": "ada@example.com"},\n  "items": [{"sku": "KB-01", "qty": 1, "price": 49.5}, {"sku": "MS-02", "qty": 2, "price": 19.99}],\n  "paid": false,\n  "placedAt": "2026-03-14T09:26:53Z",\n  "note": "Leave at the back door"\n}',
        },
        note: "Nested paths, a date filter, #each with @number, #if/else, a comment and a default value.",
      },
      {
        label: "Mail merge",
        inputs: {
          template: "To: {{email}}\nSubject: {{name | upper}}, your {{plan}} plan renews {{renews | date:\"MMM D\"}}\n\nHello {{name | capitalize}},\nyour {{plan}} plan ({{seats | plural:\"seat\"}}) renews on {{renews | date:\"dddd, D MMMM YYYY\"}}.{{#if discount}} You keep your {{discount}}% discount.{{/if}}",
          data: '[\n  {"name": "ada", "email": "ada@example.com", "plan": "Pro", "seats": 5, "renews": "2026-10-01", "discount": 20},\n  {"name": "alan", "email": "alan@example.com", "plan": "Team", "seats": 1, "renews": "2026-10-15"},\n  {"name": "grace", "email": "grace@example.com", "plan": "Pro", "seats": 12, "renews": "2026-11-02"}\n]',
        },
        note: "An array of records renders the template once per record, joined by the separator.",
      },
      {
        label: "HTML list (escaped)",
        inputs: {
          template: '<h2>{{title}}</h2>\n<ul>\n{{#each products}}\n  <li class="{{#if @first}}first{{/if}}">{{name}} — {{price | number:2}} {{@root.currency}}{{#unless inStock}} <em>(sold out)</em>{{/unless}}</li>\n{{else}}\n  <li>No products</li>\n{{/each}}\n</ul>\n<p>{{{footer}}}</p>',
          data: '{\n  "title": "Tools & <Gadgets>",\n  "currency": "EUR",\n  "products": [\n    {"name": "Keyboard", "price": 49.5, "inStock": true},\n    {"name": "Mouse \\"Pro\\"", "price": 19.99, "inStock": false},\n    {"name": "Monitor", "price": 229, "inStock": true}\n  ],\n  "footer": "Prices incl. <strong>VAT</strong>"\n}',
        },
        opts: { escape: true, merge: false },
        note: "{{title}} is HTML-escaped, {{{footer}}} is inserted raw. @first, @root and #unless inside #each; see the HTML preview.",
      },
      {
        label: "Config file",
        inputs: {
          template: "# generated for {{env | upper}}\nserver {\n  listen {{port | default:80}};\n  server_name {{hosts | join:\" \"}};\n{{#each upstreams}}\n  location /{{@key}}/ { proxy_pass http://{{this}}; }\n{{/each}}\n{{#if tls.enabled}}\n  ssl_certificate {{tls.cert}};\n{{/if}}\n}",
          data: '{"env": "staging", "hosts": ["staging.example.com", "www.staging.example.com"], "upstreams": {"api": "10.0.0.5:8080", "auth": "10.0.0.6:9000"}, "tls": {"enabled": true, "cert": "/etc/ssl/staging.pem"}}',
        },
        note: "#each over an object exposes @key; join, default and upper filters; standalone block lines leave no blank lines.",
      },
      {
        label: "Comparisons & filters",
        inputs: {
          template: "{{#each tasks}}\n- [{{#if done}}x{{else}} {{/if}}] {{title | truncate:24}}{{#if priority == \"high\"}} (!){{/if}}{{#if hours > 8}} — big{{/if}}\n{{/each}}\n\nOpen: {{open}} · Slug: {{project | slug}} · JSON: {{meta | json}}",
          data: '{"project": "Formatter — Release 2.0!", "open": 2, "meta": {"sprint": 14, "owner": "ada"}, "tasks": [{"title": "Ship the converters and validators", "done": true, "priority": "high", "hours": 12}, {"title": "Write docs", "done": false, "priority": "low", "hours": 3}, {"title": "Fix Safari layout", "done": false, "priority": "high", "hours": 5}]}',
        },
        note: "#if supports ==, !=, >, <, and / or; truncate, slug and json filters.",
      },
      {
        label: "Missing variables",
        inputs: { template: "Dear {{title}} {{lastName}},\nyour ticket {{ticket.id}} is {{ticket.status}}.\nAgent: {{agent.name | default:\"unassigned\"}}", data: '{"lastName": "Hopper", "ticket": {"id": "T-1042"}}' },
        opts: { missing: "keep" },
        note: "Missing values are listed with line numbers in Warnings; Keep leaves the {{tag}} in place. default: suppresses the warning.",
      },
      { label: "Unclosed block", inputs: { template: "{{#each items}}\n- {{name}}\n", data: '{"items": []}' }, error: true, note: "Block structure errors name the opening line." },
    ],
    steps: ["Write the template with {{placeholders}}.", "Paste the data as JSON — an object, or an array for mail merge.", "Filters: {{name | upper}}, {{date | date:\"YYYY-MM-DD\"}}, {{x | default:\"n/a\"}}.", "Check Warnings for missing variables."],
    tips: ["Filters: upper, lower, title, capitalize, trim, json, length, default, date, truncate, escape, urlencode, slug, join, first, last, reverse, sort, number, round, replace, keys, plural.", "Blocks: {{#each}}, {{#if}}, {{#unless}}, {{#with}}, {{else}}; inside #each use {{this}}, {{@index}}, {{@number}}, {{@key}}, {{@first}}, {{@last}}, {{../parent}}, {{@root.x}}.", "{{! comments }} are removed; {{~ and ~}} trim surrounding whitespace; \\{{ writes a literal {{."],
  },
};

export default specs;
