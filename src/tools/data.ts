import { ToolError, bool, num, str, type Result, type SpecModule, type View } from "./types";
import type { Cell } from "./lib/D-tabular";

/* ── shared sample data ──────────────────────────────────────────────── */

const EMPLOYEES = `id,name,department,title,salary,hired,remote,rating,manager_id,email
1,Ada Lovelace,Engineering,CTO,245000,2016-03-14,false,4.9,,ada@example.com
2,Grace Hopper,Engineering,Principal Engineer,198000,2017-07-01,true,4.8,1,grace@example.com
3,Linus Torvalds,Engineering,Staff Engineer,176500,2018-01-22,true,4.4,2,linus@example.com
4,Margaret Hamilton,Engineering,Engineering Manager,182000,2016-11-30,false,4.7,1,margaret@example.com
5,Alan Turing,Research,Research Lead,191000,2019-05-06,true,4.6,1,alan@example.com
6,Katherine Johnson,Research,Data Scientist,149000,2020-02-17,false,4.5,5,
7,Dennis Ritchie,Engineering,Senior Engineer,158000,2019-09-09,true,4.2,4,dennis@example.com
8,Barbara Liskov,Engineering,Senior Engineer,161250,2021-04-12,false,4.3,4,barbara@example.com
9,Ken Thompson,Platform,SRE,139000,2021-10-04,true,,4,ken@example.com
10,Frances Allen,Research,Research Engineer,142500,2022-01-10,true,4.1,5,frances@example.com
11,Tim Berners-Lee,Product,Product Manager,151000,2020-08-24,false,3.9,1,tim@example.com
12,Radia Perlman,Platform,Network Engineer,147000,2022-06-13,true,4.4,4,radia@example.com
13,Guido van Rossum,Engineering,Senior Engineer,163000,2023-03-01,true,4.0,4,
14,Anita Borg,Product,Designer,118000,2023-07-17,false,4.2,11,anita@example.com
15,Hedy Lamarr,Research,Research Engineer,138750,2024-01-08,true,,5,hedy@example.com
16,John McCarthy,Research,Scientist,156000,2018-06-18,false,4.6,5,john@example.com
17,Sophie Wilson,Platform,Staff Engineer,172000,2019-11-25,true,4.7,4,sophie@example.com
18,Edsger Dijkstra,Engineering,Staff Engineer,169000,2017-12-04,false,4.5,2,edsger@example.com
19,Joan Clarke,Research,Cryptographer,151500,2024-09-02,true,3.8,5,joan@example.com
20,Niklaus Wirth,Engineering,Senior Engineer,157500,2025-02-03,false,,4,niklaus@example.com`;

const PRODUCTS_JSON = `[
  {"sku": "KB-01", "name": "Mechanical Keyboard", "category": "Peripherals", "price": 89.0, "stock": 142, "rating": 4.6, "launched": "2023-02-01", "tags": ["rgb", "usb-c"]},
  {"sku": "MS-02", "name": "Wireless Mouse", "category": "Peripherals", "price": 29.5, "stock": 380, "rating": 4.3, "launched": "2022-09-15", "tags": ["bluetooth"]},
  {"sku": "MN-27", "name": "27in 4K Monitor", "category": "Displays", "price": 349.0, "stock": 36, "rating": 4.7, "launched": "2024-01-20", "tags": ["4k", "hdr"]},
  {"sku": "MN-34", "name": "34in Ultrawide", "category": "Displays", "price": 529.0, "stock": 0, "rating": 4.5, "launched": "2024-06-03", "tags": []},
  {"sku": "HB-07", "name": "USB-C Hub", "category": "Accessories", "price": 45.0, "stock": 510, "rating": 4.1, "launched": "2021-11-11", "tags": ["usb-c"]},
  {"sku": "ST-11", "name": "Laptop Stand", "category": "Accessories", "price": 39.0, "stock": 205, "rating": null, "launched": "2022-03-30", "tags": []},
  {"sku": "HS-40", "name": "Noise-cancelling Headset", "category": "Audio", "price": 159.0, "stock": 64, "rating": 4.8, "launched": "2025-01-14", "tags": ["anc", "bluetooth"]},
  {"sku": "MC-05", "name": "Desk Microphone", "category": "Audio", "price": 119.0, "stock": 18, "rating": 4.4, "launched": "2023-08-08", "tags": ["usb-c"]},
  {"sku": "WC-09", "name": "HD Webcam", "category": "Video", "price": 79.0, "stock": 97, "rating": 3.9, "launched": "2021-04-19", "tags": ["1080p"]},
  {"sku": "DS-20", "name": "Standing Desk", "category": "Furniture", "price": 499.0, "stock": 12, "rating": 4.6, "launched": "2024-10-01", "tags": ["motorised"]}
]`;

const LOGS_NDJSON = `{"ts":"2026-09-24T08:00:01Z","level":"info","service":"api","route":"/v1/orders","status":200,"latency_ms":42,"user":"u_104"}
{"ts":"2026-09-24T08:00:03Z","level":"info","service":"api","route":"/v1/orders/9","status":200,"latency_ms":35,"user":"u_104"}
{"ts":"2026-09-24T08:00:04Z","level":"warn","service":"api","route":"/v1/search","status":429,"latency_ms":3,"user":"u_311"}
{"ts":"2026-09-24T08:00:09Z","level":"info","service":"auth","route":"/login","status":200,"latency_ms":188,"user":"u_020"}
{"ts":"2026-09-24T08:00:12Z","level":"error","service":"api","route":"/v1/payments","status":502,"latency_ms":3012,"user":"u_104"}
{"ts":"2026-09-24T08:00:15Z","level":"info","service":"api","route":"/v1/orders","status":201,"latency_ms":77,"user":"u_020"}
{"ts":"2026-09-24T08:00:16Z","level":"info","service":"web","route":"/","status":200,"latency_ms":12,"user":null}
{"ts":"2026-09-24T08:00:21Z","level":"debug","service":"worker","route":"job:email","status":0,"latency_ms":950,"user":null}
{"ts":"2026-09-24T08:00:22Z","level":"info","service":"api","route":"/v1/search","status":200,"latency_ms":64,"user":"u_311"}
{"ts":"2026-09-24T08:00:30Z","level":"error","service":"auth","route":"/token","status":500,"latency_ms":41,"user":"u_512"}
{"ts":"2026-09-24T08:00:31Z","level":"info","service":"api","route":"/v1/orders","status":200,"latency_ms":39,"user":"u_512"}
{"ts":"2026-09-24T08:00:40Z","level":"info","service":"web","route":"/pricing","status":200,"latency_ms":15,"user":null}`;

const WEATHER_TSV = `station\tdate\ttemp_max_c\ttemp_min_c\tprecip_mm\twind_kmh\tconditions
Helsinki\t2026-01-05\t-3.2\t-9.8\t0.0\t18\tclear
Helsinki\t2026-01-06\t-1.0\t-6.4\t2.4\t25\tsnow
Helsinki\t2026-01-07\t0.8\t-3.1\t5.1\t31\tsnow
Lisbon\t2026-01-05\t15.4\t8.9\t0.0\t12\tclear
Lisbon\t2026-01-06\t14.1\t9.6\t11.2\t29\train
Lisbon\t2026-01-07\t13.7\t8.2\t3.0\t22\tshowers
Osaka\t2026-01-05\t9.9\t2.1\t0.0\t9\tclear
Osaka\t2026-01-06\t8.2\t1.4\t0.4\t14\tcloudy
Osaka\t2026-01-07\t10.6\t3.3\t0.0\t11\tclear
Toronto\t2026-01-05\t-6.1\t-14.0\t1.1\t33\tsnow
Toronto\t2026-01-06\t-4.4\t-11.7\t\t27\tcloudy
Toronto\t2026-01-07\t-2.0\t-8.3\t6.7\t40\tsnow`;

const MESSY_CSV = `Customer ID;Signup;Plan;MRR;Active;Country;Seats
C-001;2025-01-14;Pro;$1,250.00;yes;GB;12
C-002;2025-02-03;Free;$0.00;yes;US;1
C-003;2025-02-19;Team;$480.00;no;DE;
C-004;N/A;Pro;$1,100.00;yes;;9
C-005;2025-04-22;Enterprise;$12,400.00;yes;US;150
C-006;2025-05-01;Team;$520.00;yes;FR;6
C-007;2025-05-30;Free;;no;US;1
C-008;2025-06-12;Pro;$990.00;yes;FI;8
C-009;2025-07-07;Team;$450.00;n/a;CA;5
C-010;2025-08-18;Enterprise;$9,800.00;yes;JP;96`;

const SALES_CSV = `order_id,order_date,region,rep,product,category,units,unit_price,revenue
1001,2026-01-04,North,Ada,Keyboard,Peripherals,3,89.00,267.00
1002,2026-01-06,South,Grace,Monitor,Displays,1,349.00,349.00
1003,2026-01-09,East,Linus,Headset,Audio,2,159.00,318.00
1004,2026-01-15,West,Margaret,Mouse,Peripherals,6,29.50,177.00
1005,2026-01-21,North,Ada,Monitor,Displays,2,349.00,698.00
1006,2026-02-02,South,Alan,Desk,Furniture,1,499.00,499.00
1007,2026-02-05,East,Linus,Keyboard,Peripherals,4,89.00,356.00
1008,2026-02-11,West,Katherine,Webcam,Video,5,79.00,395.00
1009,2026-02-18,North,Dennis,Headset,Audio,1,159.00,159.00
1010,2026-02-25,South,Grace,Mouse,Peripherals,10,29.50,295.00
1011,2026-03-03,East,Barbara,Desk,Furniture,2,499.00,998.00
1012,2026-03-08,West,Margaret,Monitor,Displays,3,349.00,1047.00
1013,2026-03-14,North,Ada,Webcam,Video,2,79.00,158.00
1014,2026-03-19,South,Alan,Headset,Audio,3,159.00,477.00
1015,2026-03-27,East,Linus,Mouse,Peripherals,8,29.50,236.00
1016,2026-04-02,West,Katherine,Keyboard,Peripherals,2,89.00,178.00
1017,2026-04-09,North,Dennis,Desk,Furniture,1,499.00,499.00
1018,2026-04-16,South,Grace,Webcam,Video,4,79.00,316.00
1019,2026-04-22,East,Barbara,Monitor,Displays,1,349.00,349.00
1020,2026-04-30,West,Margaret,Headset,Audio,2,159.00,318.00`;

/* ── helpers ─────────────────────────────────────────────────────────── */

const tab = () => import("./lib/D-tabular");
const sqlite = () => import("./lib/D-sqlite");

const DELIMS: [string, string][] = [["auto", "Auto"], [",", "Comma"], [";", "Semicolon"], ["\t", "Tab"], ["|", "Pipe"]];
const delimOpt = { id: "delimiter", label: "Delimiter", type: "select" as const, choices: DELIMS, default: "auto" };
const headerOpt = { id: "header", label: "Header row", type: "toggle" as const, default: true };

const fmtCell = (v: unknown): Cell => (v == null ? null : typeof v === "bigint" ? Number(v) : v instanceof Date ? v.toISOString().replace(".000Z", "Z") : typeof v === "object" ? JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? Number(x) : x)) : (v as Cell));

function b64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/^data:[^,]*,/, "").replace(/\s+/g, "");
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}


/* ── Data Explorer ───────────────────────────────────────────────────── */

const EXPLORER_CSS = `
.dx{display:grid;gap:14px;font-family:var(--font-mono);font-size:12.5px}
.dx-col{display:grid;grid-template-columns:minmax(120px,190px) 1fr;gap:12px;align-items:center;padding:10px 12px;border:1px solid rgba(32,30,29,.08);border-radius:10px;background:rgba(255,255,255,.5)}
.dx-col h4{margin:0;font-size:13.5px;font-family:var(--font-mono);font-weight:600;word-break:break-all}
.dx-col small{display:block;color:#78716c;font-size:11.5px;margin-top:2px}
.dx-axis{display:flex;justify-content:space-between;color:#78716c;font-size:11px;width:260px;max-width:100%}
.dx-bars{display:grid;gap:3px}
.dx-bar{display:grid;grid-template-columns:minmax(60px,160px) 1fr 44px;gap:8px;align-items:center}
.dx-bar span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dx-track{height:10px;border-radius:5px;background:rgba(0,136,176,.08);overflow:hidden}
.dx-fill{height:10px;border-radius:5px;background:#0088b0}
.dx-bar span:last-child{text-align:right;color:#57534e}
.dx-null{height:6px;border-radius:3px;background:rgba(214,0,108,.12);overflow:hidden;width:260px;max-width:100%;margin-top:6px}
.dx-null i{display:block;height:6px;background:#d6006c}
`;

async function explore(src: string, o: { format: string; header: boolean; bins: number; top: number; delimiter: string }) {
  const T = await tab();
  const t = await T.parseTabular(src, o.format as never, { header: o.header, delimiter: o.delimiter === "auto" ? "" : o.delimiter });
  const profiles = t.header.map((h, i) => T.profileColumn(h, t.rows.map((r) => r[i]), o.bins, Math.max(1, Math.min(10, o.top))));
  return { T, t, profiles };
}

/* ── Parquet ─────────────────────────────────────────────────────────── */

type PqSchemaEl = { name: string; type?: string; type_length?: number; repetition_type?: string; converted_type?: string; logical_type?: Record<string, unknown>; num_children?: number; scale?: number; precision?: number };

function logicalName(el: PqSchemaEl): string {
  const lt = el.logical_type;
  if (lt?.type) {
    const extra = Object.entries(lt).filter(([k]) => k !== "type").map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`);
    return extra.length ? `${lt.type}(${extra.join(", ")})` : String(lt.type);
  }
  if (el.converted_type) return el.converted_type + (el.converted_type === "DECIMAL" ? `(${el.precision},${el.scale})` : "");
  return "";
}

/* ── specs ───────────────────────────────────────────────────────────── */

const specs: SpecModule = {
  "data-explorer": {
    inputs: [{ id: "data", label: "CSV · TSV · JSON · NDJSON", lang: "text", placeholder: "Paste CSV, TSV, a JSON array of records or NDJSON — or drop a file" }],
    options: [
      { id: "format", label: "Format", type: "segment", choices: [["auto", "Auto"], ["csv", "CSV"], ["tsv", "TSV"], ["json", "JSON"], ["ndjson", "NDJSON"]], default: "auto" },
      headerOpt,
      { id: "bins", label: "Histogram bins", type: "number", default: 12, min: 3, max: 40 },
      { id: "top", label: "Top values", type: "number", default: 5, min: 1, max: 10 },
    ],
    layout: "stack",
    async run({ inputs, opts }) {
      const { T, t, profiles } = await explore(inputs.data, { format: str(opts.format), header: bool(opts.header), bins: num(opts.bins, 12), top: num(opts.top, 5), delimiter: "auto" });
      const f = T.fmtNum;
      const range = (p: (typeof profiles)[number]) =>
        p.type === "integer" || p.type === "float" ? `${f(p.min as number)} … ${f(p.max as number)}` : p.type === "date" ? `${p.min} → ${p.max}` : p.type === "boolean" ? `${p.trueCount} true / ${p.count - p.nulls - (p.trueCount ?? 0)} false` : p.minLen !== undefined ? `len ${p.minLen}–${p.maxLen}` : "";
      const topStr = (p: (typeof profiles)[number]) => p.top.map((x) => `${x.value.length > 18 ? x.value.slice(0, 17) + "…" : x.value} (${x.count})`).join(", ");
      const colsTable: View = {
        label: `Columns (${profiles.length})`,
        out: {
          kind: "table",
          columns: ["column", "type", "count", "nulls", "null %", "distinct", "min", "max", "mean", "median", "stddev", "p25", "p75", "min len", "max len", "top values"],
          rows: profiles.map((p) => [
            p.name, p.type, p.count, p.nulls, Number(p.nullPct.toFixed(1)), p.distinct,
            p.min === undefined ? null : typeof p.min === "number" ? Number(f(p.min)) : p.min,
            p.max === undefined ? null : typeof p.max === "number" ? Number(f(p.max)) : p.max,
            p.mean === undefined ? null : Number(f(p.mean)), p.median === undefined ? null : Number(f(p.median)), p.stddev === undefined ? null : Number(f(p.stddev)),
            p.p25 === undefined ? null : Number(f(p.p25)), p.p75 === undefined ? null : Number(f(p.p75)),
            p.minLen ?? null, p.maxLen ?? null, topStr(p),
          ]),
        },
      };
      // Markdown profile = pipeline text
      const md = [
        `| column | type | nulls | distinct | range | mean | median | stddev | top values |`,
        `| --- | --- | ---: | ---: | --- | ---: | ---: | ---: | --- |`,
        ...profiles.map((p) => `| ${p.name.replace(/\|/g, "\\|")} | ${p.type} | ${p.nulls} (${p.nullPct.toFixed(1)}%) | ${p.distinct} | ${range(p).replace(/\|/g, "\\|")} | ${f(p.mean)} | ${f(p.median)} | ${f(p.stddev)} | ${topStr(p).replace(/\|/g, "\\|")} |`),
      ].join("\n");
      const cells = t.rows.length * t.header.length;
      const missing = profiles.reduce((a, p) => a + p.nulls, 0);
      const seen = new Set<string>();
      let dupes = 0;
      for (const r of t.rows) {
        const k = JSON.stringify(r);
        if (seen.has(k)) dupes++;
        else seen.add(k);
      }
      const byType = (ty: string[]) => profiles.filter((p) => ty.includes(p.type)).length;
      const constant = profiles.filter((p) => p.distinct === 1).map((p) => p.name);
      const unique = profiles.filter((p) => p.distinct === p.count && p.count > 1).map((p) => p.name);
      const summary: View = {
        label: "Summary",
        out: {
          kind: "stats",
          items: [
            { label: "Rows", value: t.rows.length.toLocaleString(), tone: "info" },
            { label: "Columns", value: t.header.length },
            { label: "Format", value: t.format.toUpperCase() },
            { label: "Cells", value: cells.toLocaleString() },
            { label: "Missing cells", value: `${missing} (${cells ? ((missing / cells) * 100).toFixed(1) : 0}%)`, tone: missing ? "warn" : "ok" },
            { label: "Duplicate rows", value: dupes, tone: dupes ? "warn" : "ok" },
            { label: "Numeric columns", value: byType(["integer", "float"]) },
            { label: "Text columns", value: byType(["string"]) },
            { label: "Date columns", value: byType(["date"]) },
            { label: "Boolean columns", value: byType(["boolean"]) },
            { label: "Unique-key candidates", value: unique.join(", ") || "none", tone: unique.length ? "ok" : undefined },
            { label: "Constant columns", value: constant.join(", ") || "none", tone: constant.length ? "warn" : undefined },
          ],
        },
      };
      const e = T.escapeHtml;
      const dist = profiles
        .map((p) => {
          const nullBar = `<div class="dx-null" title="${p.nullPct.toFixed(1)}% missing"><i style="width:${p.nullPct.toFixed(1)}%"></i></div>`;
          const head = `<div><h4>${e(p.name)}</h4><small>${p.type} · ${p.distinct} distinct · ${p.nullPct.toFixed(1)}% null</small></div>`;
          if (p.hist && p.histRange) {
            return `<div class="dx-col">${head}<div>${T.sparkBars(p.hist, 260, 44)}<div class="dx-axis"><span>${f(p.histRange[0])}</span><span>μ ${f(p.mean)} · σ ${f(p.stddev)}</span><span>${f(p.histRange[1])}</span></div>${nullBar}</div></div>`;
          }
          const max = Math.max(1, ...p.top.map((x) => x.count));
          const bars = p.top
            .map((x) => `<div class="dx-bar"><span title="${e(x.value)}">${e(x.value)}</span><div class="dx-track"><div class="dx-fill" style="width:${((x.count / max) * 100).toFixed(1)}%"></div></div><span>${x.count}</span></div>`)
            .join("");
          return `<div class="dx-col">${head}<div><div class="dx-bars">${bars || "<small>no values</small>"}</div>${nullBar}</div></div>`;
        })
        .join("");
      return {
        text: md,
        lang: "markdown",
        filename: "profile.md",
        notes: t.notes.length ? t.notes : undefined,
        views: [
          colsTable,
          summary,
          { label: "Distribution", out: { kind: "html", html: `<div class="dx">${dist}</div>`, css: EXPLORER_CSS } },
          { label: `Data (${t.rows.length})`, out: { kind: "table", columns: t.header, rows: t.rows } },
          { label: "Markdown", out: { kind: "text", text: md, lang: "markdown" } },
        ],
      };
    },
    examples: [
      { label: "Employees CSV", inputs: { data: EMPLOYEES }, note: "Integers, floats, dates, booleans and emails — with a few missing ratings and emails." },
      { label: "Products JSON", inputs: { data: PRODUCTS_JSON }, note: "A JSON array of records; nested arrays (tags) are profiled as JSON text." },
      { label: "Logs NDJSON", inputs: { data: LOGS_NDJSON }, opts: { bins: 8 }, note: "One JSON object per line — look at the latency distribution and the level/status top values." },
      { label: "Weather TSV", inputs: { data: WEATHER_TSV }, note: "Tab-separated, negative floats and an empty precipitation cell." },
      { label: "Messy export", inputs: { data: MESSY_CSV }, opts: { top: 3 }, note: "Semicolons, $1,250.00 amounts, N/A and yes/no — still typed as float, date and boolean." },
      { label: "No header", inputs: { data: "12,4.5,red\n7,3.25,blue\n19,8.0,red\n3,1.5,green\n11,4.75,blue" }, opts: { header: false }, note: "Header off: columns are named column1, column2, …" },
      { label: "Broken JSON", inputs: { data: '[{"a": 1}, {"a": 2,}]' }, note: "Invalid JSON is reported with the parser's message.", error: true },
    ],
    steps: ["Paste or drop CSV, TSV, JSON or NDJSON — the format is detected automatically.", "Read the Columns tab for types, nulls, distinct counts and statistics.", "Open Distribution for histograms and top values, Data for the grid.", "Copy the Markdown profile into a README, issue or pipeline."],
  },

  "csv-viewer": {
    inputs: [{ id: "csv", label: "CSV", lang: "text", placeholder: "Paste CSV / TSV — or drop a file" }],
    options: [
      headerOpt,
      delimOpt,
      { id: "quote", label: "Quote", type: "segment", choices: [['"', '"'], ["'", "'"]], default: '"' },
      { id: "export", label: "Export as", type: "select", choices: [["json", "JSON"], ["markdown", "Markdown table"], ["html", "HTML table"], ["tsv", "TSV"], ["csv", "CSV (normalised)"], ["sql", "SQL INSERT"], ["text", "Aligned text"]], default: "json" },
      { id: "table", label: "Table", type: "text", default: "data", width: 100, show: (o) => o.export === "sql" },
      { id: "typed", label: "Typed values", type: "toggle", default: true, hint: "Numbers and booleans become JSON/SQL literals instead of strings" },
    ],
    layout: "stack",
    async run({ inputs, opts }) {
      const T = await tab();
      if (!inputs.csv.trim()) throw new ToolError("Paste CSV to view it as a table.");
      const t = await T.parseCsv(inputs.csv, { header: bool(opts.header), delimiter: str(opts.delimiter) === "auto" ? "" : str(opts.delimiter), quoteChar: str(opts.quote, '"') });
      const types = t.header.map((_, i) => (bool(opts.typed) ? T.inferColType(t.rows.map((r) => r[i])) : "string")) as import("./lib/D-tabular").ColType[];
      const ex = T.exportTable(t.header, t.rows, str(opts.export), { table: str(opts.table, "data") || "data", types });
      const profiles = t.header.map((h, i) => T.profileColumn(h, t.rows.map((r) => r[i])));
      const f = T.fmtNum;
      const delimName = ({ ",": "comma", ";": "semicolon", "\t": "tab", "|": "pipe" } as Record<string, string>)[t.delimiter] ?? JSON.stringify(t.delimiter);
      const issues = t.errors.map((e) => ({ level: "warning" as const, message: e.message, line: e.row }));
      const views: View[] = [
        { label: `Table (${t.rows.length} × ${t.header.length})`, out: { kind: "table", columns: t.header, rows: t.rows } },
        {
          label: "Column stats",
          out: {
            kind: "table",
            columns: ["column", "type", "filled", "empty", "distinct", "min", "max", "mean / top"],
            rows: profiles.map((p) => [p.name, p.type, p.count - p.nulls, p.nulls, p.distinct, p.min === undefined ? null : typeof p.min === "number" ? f(p.min) : String(p.min), p.max === undefined ? null : typeof p.max === "number" ? f(p.max) : String(p.max), p.mean !== undefined ? `μ ${f(p.mean)}  Σ ${f(p.sum)}` : p.top.slice(0, 3).map((x) => `${x.value} ×${x.count}`).join(", ")]),
          },
        },
        { label: `Export · ${str(opts.export).toUpperCase()}`, out: { kind: "text", text: ex.text, lang: ex.lang } },
        { label: "Summary", out: { kind: "stats", items: [{ label: "Rows", value: t.rows.length, tone: "info" }, { label: "Columns", value: t.header.length }, { label: "Delimiter", value: delimName }, { label: "Parse warnings", value: t.errors.length, tone: t.errors.length ? "warn" : "ok" }, { label: "Empty cells", value: profiles.reduce((a, p) => a + p.nulls, 0) }] } },
      ];
      if (issues.length) views.push({ label: `Issues (${issues.length})`, out: { kind: "issues", items: issues } });
      return { text: ex.text, lang: ex.lang === "markdown" ? "markdown" : ex.lang, filename: `data.${ex.ext}`, views, notes: t.notes.length ? t.notes : undefined };
    },
    examples: [
      { label: "Sales", inputs: { csv: SALES_CSV }, note: "Click headers to sort, type in the filter box, then Export as JSON." },
      { label: "Semicolon export", inputs: { csv: MESSY_CSV }, opts: { export: "markdown" }, note: "Auto-detects the ; delimiter (European Excel exports) and renders a Markdown table." },
      { label: "Quoted fields", inputs: { csv: 'id,company,address,notes\n1,"Acme, Inc.","12 Main St\nSpringfield",ok\n2,"Globex ""Intl""","5 Elm Rd",\n3,Initech,"9 Oak Ave","says ""hi"""' }, opts: { export: "json" }, note: "Commas, newlines and doubled quotes inside quoted fields." },
      { label: "TSV → SQL", inputs: { csv: WEATHER_TSV }, opts: { delimiter: "\t", export: "sql", table: "weather" }, note: "CREATE TABLE with inferred types plus one INSERT per row." },
      { label: "Pipe, no header", inputs: { csv: "ORD-1|2026-03-01|shipped|42.50\nORD-2|2026-03-02|pending|18.00\nORD-3|2026-03-02|shipped|99.99" }, opts: { delimiter: "|", header: false, export: "text" }, note: "Header off: generated column names; aligned plain-text export." },
      { label: "Single quotes", inputs: { csv: "name,motto\n'Ada','Numbers, poetically'\n'Grace','It''s easier to ask forgiveness'" }, opts: { quote: "'", export: "html" }, note: "Quote char ' for files that quote with apostrophes; HTML table export." },
    ],
  },

  "csv-query-sql": {
    inputs: [
      { id: "csv", label: "CSV / TSV / JSON data", lang: "text", placeholder: "Paste CSV (or TSV, JSON records, NDJSON) — it becomes a SQL table" },
      { id: "sql", label: "SQL query", lang: "sql", rows: 7, placeholder: "SELECT * FROM data LIMIT 100" },
    ],
    options: [
      { id: "table", label: "Table name", type: "text", default: "data", width: 100 },
      headerOpt,
      delimOpt,
      { id: "out", label: "Output", type: "segment", choices: [["csv", "CSV"], ["json", "JSON"], ["markdown", "Markdown"], ["text", "Text table"]], default: "csv" },
    ],
    outLang: "text",
    steps: ["Paste CSV (or TSV/JSON) — it is loaded into an in-memory SQLite table named data.", "Write any SQLite query: joins with itself, GROUP BY, window functions, CTEs.", "Results appear as a table; the text output is CSV (or JSON/Markdown) ready for the next step."],
    async run({ inputs, opts }) {
      const [T, S] = await Promise.all([tab(), sqlite()]);
      const name = S.sqlIdent(str(opts.table, "data") || "data", "data");
      const src = inputs.csv;
      const t = await T.parseTabular(src, "auto", { header: bool(opts.header), delimiter: str(opts.delimiter) === "auto" ? "" : str(opts.delimiter) });
      const SQL = await S.getSqlJs();
      const db = new SQL.Database();
      try {
        const loaded = S.loadTable(db, name, t.header, t.rows);
        const q = inputs.sql.trim() || `SELECT * FROM ${name} LIMIT 100`;
        const results = S.execScript(db, q);
        const last = [...results].reverse().find((r) => r.columns.length) ?? results[results.length - 1];
        const schema: View = { label: "CREATE TABLE", out: { kind: "text", text: loaded.ddl, lang: "sql" } };
        if (!last || !last.columns.length) {
          const text = results.map((r) => `${r.sql.split("\n")[0]} — ${r.changes ?? 0} row(s) affected`).join("\n");
          return { text, views: [{ label: "Log", out: { kind: "text", text } }, schema] };
        }
        const fmt = str(opts.out);
        const text =
          fmt === "json" ? JSON.stringify(S.toJsonRows(last.columns, last.rows), null, 2) : fmt === "markdown" ? T.exportTable(last.columns, last.rows, "markdown").text : fmt === "text" ? S.asciiTable(last.columns, last.rows, 1000) : S.toCsv(last.columns, last.rows);
        const views: View[] = [
          { label: `Result (${last.rows.length})`, out: { kind: "table", columns: last.columns, rows: last.rows } },
          { label: fmt === "csv" ? "CSV" : fmt === "json" ? "JSON" : fmt === "markdown" ? "Markdown" : "Text", out: { kind: "text", text, lang: fmt === "json" ? "json" : fmt === "markdown" ? "markdown" : "text" } },
          schema,
          { label: "Table", out: { kind: "table", columns: ["column", "type"], rows: loaded.columns.map((c) => [c.name, c.type]) } },
        ];
        const notes = [...t.notes];
        if (loaded.columns.some((c, i) => c.name !== t.header[i])) notes.push(`Column names were made SQL-safe: ${loaded.columns.filter((c, i) => c.name !== t.header[i]).map((c) => c.name).join(", ")}.`);
        return { text, lang: fmt === "json" ? "json" : fmt === "markdown" ? "markdown" : "text", filename: `result.${fmt === "markdown" ? "md" : fmt === "text" ? "txt" : fmt}`, views, notes: notes.length ? notes : undefined };
      } finally {
        db.close();
      }
    },
    examples: [
      {
        label: "GROUP BY",
        inputs: { csv: SALES_CSV, sql: "SELECT region,\n       COUNT(*)            AS orders,\n       SUM(units)          AS units,\n       ROUND(SUM(revenue), 2) AS revenue,\n       ROUND(AVG(revenue), 2) AS avg_order\nFROM data\nGROUP BY region\nORDER BY revenue DESC;" },
        note: "Aggregates per region — revenue is typed REAL, so SUM and AVG are numeric.",
      },
      { label: "WHERE + ORDER", inputs: { csv: SALES_CSV, sql: "SELECT order_id, order_date, rep, product, revenue\nFROM data\nWHERE category IN ('Displays', 'Furniture') AND revenue >= 400\nORDER BY revenue DESC, order_date;" } },
      {
        label: "Window RANK()",
        inputs: { csv: SALES_CSV, sql: "SELECT region, rep, SUM(revenue) AS revenue,\n       RANK() OVER (PARTITION BY region ORDER BY SUM(revenue) DESC) AS rank_in_region,\n       ROUND(100.0 * SUM(revenue) / SUM(SUM(revenue)) OVER (), 1) AS pct_of_total\nFROM data\nGROUP BY region, rep\nORDER BY region, rank_in_region;" },
        note: "Window functions over grouped rows: rank inside each region and share of the grand total.",
      },
      {
        label: "CTE + running total",
        inputs: { csv: SALES_CSV, sql: "WITH monthly AS (\n  SELECT strftime('%Y-%m', order_date) AS month, SUM(revenue) AS revenue\n  FROM data GROUP BY month\n)\nSELECT month, revenue,\n       SUM(revenue) OVER (ORDER BY month) AS running_total,\n       revenue - LAG(revenue) OVER (ORDER BY month) AS change\nFROM monthly;" },
        note: "A CTE with date bucketing, a running SUM and month-over-month change via LAG.",
      },
      {
        label: "CASE buckets",
        inputs: { csv: SALES_CSV, sql: "SELECT CASE\n         WHEN revenue >= 500 THEN 'large'\n         WHEN revenue >= 250 THEN 'medium'\n         ELSE 'small'\n       END AS size,\n       COUNT(*) AS orders,\n       GROUP_CONCAT(order_id, ' ') AS ids\nFROM data GROUP BY size ORDER BY MIN(revenue) DESC;" },
      },
      {
        label: "Dates",
        inputs: { csv: SALES_CSV, sql: "SELECT order_id, order_date,\n       strftime('%w', order_date) AS weekday_no,\n       CASE strftime('%w', order_date) WHEN '0' THEN 'Sun' WHEN '6' THEN 'Sat' ELSE 'weekday' END AS kind,\n       date(order_date, '+30 days') AS due,\n       julianday('2026-05-01') - julianday(order_date) AS days_ago\nFROM data ORDER BY order_date DESC LIMIT 8;" },
        opts: { out: "text" },
        note: "SQLite date functions: strftime, date modifiers and julianday arithmetic.",
      },
      {
        label: "Strings",
        inputs: { csv: EMPLOYEES, sql: "SELECT UPPER(substr(name, 1, instr(name, ' ') - 1)) AS first,\n       substr(name, instr(name, ' ') + 1) AS last,\n       COALESCE(email, lower(replace(name, ' ', '.')) || '@example.com') AS email,\n       length(title) AS title_len\nFROM people\nWHERE department = 'Research';" },
        opts: { table: "people", out: "json" },
        note: "Table renamed to people; substr/instr/replace/COALESCE fill in missing emails; JSON output.",
      },
      { label: "Unknown column", inputs: { csv: SALES_CSV, sql: "SELECT regoin, SUM(revenue) FROM data GROUP BY regoin;" }, note: "SQLite's error names the missing column.", error: true },
    ],
  },

  "duckdb-playground": {
    inputs: [
      { id: "datasets", label: "Datasets (JSON workspace, or CSV/JSON data loaded as table \"input\")", lang: "json", placeholder: '{"tables":[{"name":"sales","sample":"sales"}]}' },
      { id: "sql", label: "SQL", lang: "sql", rows: 8, placeholder: "SELECT * FROM sales LIMIT 20" },
    ],
    options: [{ id: "maxRows", label: "Max rows", type: "number", default: 1000, min: 10, max: 100000, step: 100 }],
    autorun: false,
    custom: () => import("./ui/D-SqlAnalytics"),
    action: "Run query",
    async run({ inputs, opts }) {
      const { runAnalytics, chartSvg } = await import("./lib/D-analytics");
      const S = await sqlite();
      const sql = inputs.sql.trim() || (inputs.datasets.trim() && !inputs.datasets.trim().startsWith("{\"tables\"") ? "SELECT * FROM input LIMIT 100" : "");
      if (!sql) throw new ToolError("Write a SQL query to run over your datasets.");
      const r = await runAnalytics(inputs.datasets, sql, { maxRows: num(opts.maxRows, 1000) });
      const last = [...r.results].reverse().find((x) => x.columns.length);
      const log = r.results.map((x, i) => `#${i + 1} (line ${x.line}) ${x.columns.length ? `${x.rows.length} row(s)` : `${x.changes ?? 0} row(s) affected`} · ${x.ms.toFixed(1)} ms`).join("\n");
      const views: View[] = [];
      let text = log;
      if (last) {
        text = S.toCsv(last.columns, last.rows);
        views.push({ label: `Result (${last.rows.length})`, out: { kind: "table", columns: last.columns, rows: last.rows } });
        const svg = chartSvg(last.columns, last.rows);
        if (svg) views.push({ label: "Chart", out: { kind: "svg", svg, name: "chart" } });
        views.push({ label: "JSON", out: { kind: "text", text: JSON.stringify(S.toJsonRows(last.columns, last.rows), null, 2), lang: "json" } });
      }
      views.push(
        { label: "Statements", out: { kind: "text", text: log || "No statements." } },
        { label: "Schema", out: { kind: "table", columns: ["table", "column", "type", "rows"], rows: r.tables.flatMap((t) => t.columns.map((c, i) => [t.name, c.name, c.type, i === 0 ? t.rows : null])) } }
      );
      return { text, views, filename: "result.csv", notes: r.notes.length ? r.notes : undefined };
    },
    examples: [
      {
        label: "Revenue by month",
        inputs: {
          datasets: '{"tables":[{"name":"sales","sample":"sales"},{"name":"products","sample":"products"}]}',
          sql: "SELECT strftime('%Y-%m', order_date) AS month,\n       ROUND(SUM(revenue), 2) AS revenue,\n       COUNT(*) AS orders\nFROM sales\nWHERE status = 'complete'\nGROUP BY month\nORDER BY month;",
        },
        note: "Monthly revenue from the built-in sales table — the Chart tab draws a line automatically.",
      },
      {
        label: "Top categories (join)",
        inputs: {
          datasets: '{"tables":[{"name":"sales","sample":"sales"},{"name":"products","sample":"products"}]}',
          sql: "SELECT p.category,\n       ROUND(SUM(s.revenue), 0) AS revenue,\n       ROUND(SUM(s.revenue - s.quantity * p.unit_cost), 0) AS margin\nFROM sales s JOIN products p USING (product_id)\nGROUP BY p.category\nORDER BY revenue DESC;",
        },
        note: "A join between two sample tables; the result is a bar chart with two series.",
      },
      {
        label: "Cohorts by plan",
        inputs: {
          datasets: '{"tables":[{"name":"sales","sample":"sales"},{"name":"customers","sample":"customers"}]}',
          sql: "WITH spend AS (\n  SELECT customer_id, SUM(revenue) AS total, COUNT(*) AS orders\n  FROM sales GROUP BY customer_id\n)\nSELECT c.plan, COUNT(*) AS customers,\n       ROUND(AVG(s.total), 2) AS avg_spend,\n       ROUND(AVG(s.orders), 1) AS avg_orders\nFROM customers c LEFT JOIN spend s USING (customer_id)\nGROUP BY c.plan ORDER BY avg_spend DESC;",
        },
      },
      {
        label: "Funnel (events)",
        inputs: {
          datasets: '{"tables":[{"name":"web_events","sample":"web_events"}]}',
          sql: "SELECT event_type, COUNT(*) AS events, COUNT(DISTINCT session_id) AS sessions\nFROM web_events\nGROUP BY event_type\nORDER BY sessions DESC;",
        },
        note: "NDJSON web analytics events, counted per event type.",
      },
      {
        label: "Pasted data",
        inputs: {
          datasets: JSON.stringify({ tables: [{ name: "team", format: "csv", data: "name,team,points\nAda,red,42\nGrace,blue,37\nLinus,red,29\nKen,blue,51\nBarbara,green,44" }] }),
          sql: "SELECT team, SUM(points) AS points, GROUP_CONCAT(name, ', ') AS members\nFROM team GROUP BY team ORDER BY points DESC;",
        },
        note: "Any CSV/JSON you paste becomes a named table.",
      },
      {
        label: "Sessions (window)",
        inputs: {
          datasets: '{"tables":[{"name":"web_events","sample":"web_events"}]}',
          sql: "SELECT session_id, device, country,\n       COUNT(*) AS pages,\n       ROUND((julianday(MAX(event_time)) - julianday(MIN(event_time))) * 1440, 1) AS minutes,\n       MAX(event_type = 'purchase') AS converted,\n       RANK() OVER (ORDER BY COUNT(*) DESC) AS depth_rank\nFROM web_events GROUP BY session_id ORDER BY pages DESC LIMIT 15;",
        },
      },
      { label: "Typo", inputs: { datasets: '{"tables":[{"name":"sales","sample":"sales"}]}', sql: "SELECT channel, SUM(revenue) FROM sale GROUP BY channel;" }, note: "Errors name the missing table and the statement's line.", error: true },
    ],
    steps: ["Add datasets: built-in samples, pasted CSV/JSON/NDJSON or a dropped file — each becomes a table.", "Click a table or column in the schema to insert its name.", "Write SQL and press Run (Ctrl/⌘+Enter); several statements run in order.", "Switch between the table, the automatic chart and JSON; export CSV or JSON."],
    tips: ["The engine is SQLite (sql.js), so window functions, CTEs, JSON functions and strftime all work — no DuckDB-specific syntax."],
  },

  "sql-playground": {
    inputs: [
      { id: "sql", label: "SQL script", lang: "sql", placeholder: "CREATE TABLE …; INSERT …; SELECT …;" },
      { id: "db", label: "Open a .sqlite / .db file (optional)", kind: "file", read: "base64", accept: ".sqlite,.sqlite3,.db,.db3,application/vnd.sqlite3,application/x-sqlite3" },
    ],
    options: [
      { id: "explain", label: "EXPLAIN QUERY PLAN", type: "toggle", default: false, hint: "Show SQLite's plan for every SELECT" },
      { id: "maxRows", label: "Max rows", type: "number", default: 500, min: 10, max: 50000, step: 50 },
      { id: "download", label: "Download", type: "segment", choices: [["text", "Results"], ["db", ".sqlite"]], default: "text", hint: "What the Download button saves" },
    ],
    autorun: false,
    action: "Execute",
    async run({ inputs, opts }) {
      const S = await sqlite();
      const SQL = await S.getSqlJs();
      let bytes: Uint8Array | undefined;
      const notes: string[] = [];
      if (inputs.db) {
        if (inputs.db.startsWith("@sample:")) bytes = b64ToBytes((await import("./lib/D-sqlite-sample")).SQLITE_INVENTORY);
        else bytes = b64ToBytes(inputs.db);
        const head = new TextDecoder().decode(bytes.slice(0, 15));
        if (head !== "SQLite format 3") throw new ToolError("That file is not a SQLite database (it lacks the \"SQLite format 3\" header).");
        notes.push(`Opened ${inputs["db:name"] || "the database file"} — ${bytes.length.toLocaleString()} bytes.`);
      }
      const db = bytes ? new SQL.Database(bytes) : new SQL.Database();
      try {
        const script = inputs.sql.trim();
        if (!script && !bytes) throw new ToolError("Write some SQL, pick a sample script, or open a .sqlite file.");
        const results = script ? S.execScript(db, script, { maxRows: num(opts.maxRows, 500) }) : [];
        const views: View[] = [];
        const log: string[] = [];
        let shown = 0;
        results.forEach((r, i) => {
          const head = `-- #${i + 1} · line ${r.line} · ${r.ms.toFixed(1)} ms\n${r.sql.length > 160 ? r.sql.slice(0, 157) + "…" : r.sql}`;
          if (r.columns.length) {
            log.push(`${head}\n${S.asciiTable(r.columns, r.rows, 50)}\n(${r.rows.length} row${r.rows.length === 1 ? "" : "s"}${r.changes ? ` of ${r.changes}, truncated` : ""})`);
            if (shown < 8) {
              const verb = r.sql.match(/^\s*(\w+)/)?.[1]?.toUpperCase() ?? "SELECT";
              views.push({ label: `#${i + 1} ${verb} (${r.rows.length})`, out: { kind: "table", columns: r.columns, rows: r.rows } });
              shown++;
            }
            if (bool(opts.explain) && /^\s*(SELECT|WITH)\b/i.test(r.sql)) {
              try {
                const plan = db.exec(`EXPLAIN QUERY PLAN ${r.sql}`)[0];
                if (plan) {
                  const byId = new Map<number, number>();
                  const lines = plan.values.map((row) => {
                    const [id, parent, , detail] = row as [number, number, number, string];
                    const depth = (byId.get(parent) ?? -1) + 1;
                    byId.set(id, depth);
                    return `${"  ".repeat(depth)}${depth ? "└─ " : ""}${detail}`;
                  });
                  log.push(`-- query plan for #${i + 1}\n${lines.join("\n")}`);
                  views.push({ label: `Plan #${i + 1}`, out: { kind: "text", text: `QUERY PLAN\n${lines.join("\n")}` } });
                }
              } catch {
                /* plan not available for this statement */
              }
            }
          } else log.push(`${head}\n→ ${r.changes ?? 0} row(s) affected`);
        });
        // schema browser
        const master = db.exec("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'view' THEN 1 WHEN 'index' THEN 2 ELSE 3 END, name")[0];
        const objects = (master?.values ?? []) as [string, string, string, string | null][];
        const schemaRows: Cell[][] = [];
        const tree: Record<string, unknown> = {};
        for (const [type, name, , sqlText] of objects) {
          if (type === "table" || type === "view") {
            const info = db.exec(`PRAGMA table_info(${JSON.stringify(name)})`)[0];
            const cols = (info?.values ?? []) as [number, string, string, number, string | null, number][];
            let count: number | null = null;
            try {
              count = Number(db.exec(`SELECT COUNT(*) FROM ${JSON.stringify(name)}`)[0]?.values[0][0] ?? 0);
            } catch {
              /* virtual tables may refuse */
            }
            const fks = type === "table" ? ((db.exec(`PRAGMA foreign_key_list(${JSON.stringify(name)})`)[0]?.values ?? []) as unknown[][]) : [];
            cols.forEach(([, cn, ct, nn, dflt, pk], i) => {
              const fk = fks.find((f) => f[3] === cn);
              schemaRows.push([i === 0 ? `${name}` : "", i === 0 ? type : "", cn, ct || "", nn ? "NOT NULL" : "", dflt, pk ? `PK${pk > 1 ? pk : ""}` : "", fk ? `→ ${fk[2]}(${fk[4]})` : "", i === 0 ? count : null]);
            });
            tree[`${type} ${name}${count != null ? ` (${count} rows)` : ""}`] = {
              columns: Object.fromEntries(cols.map(([, cn, ct, nn, , pk]) => [cn, `${ct || "ANY"}${pk ? " PRIMARY KEY" : ""}${nn ? " NOT NULL" : ""}`])),
              sql: sqlText,
            };
          } else tree[`${type} ${name}`] = { on: objects.find((o) => o[1] === name)?.[2], sql: sqlText };
        }
        views.push(
          { label: "Log", out: { kind: "text", text: log.join("\n\n") || "No statements executed.", lang: "sql" } },
          { label: `Schema (${objects.length})`, out: schemaRows.length ? { kind: "table", columns: ["table", "type", "column", "decl type", "null", "default", "key", "references", "rows"], rows: schemaRows } : { kind: "status", ok: true, title: "Empty database", detail: "Create a table to see it here." } },
          { label: "Schema tree", out: { kind: "tree", value: tree } },
          { label: "DDL", out: { kind: "text", text: objects.filter((o) => o[3]).map((o) => o[3] + ";").join("\n\n"), lang: "sql" } }
        );
        const selects = results.filter((r) => r.columns.length).length;
        const changes = results.reduce((a, r) => a + (r.columns.length ? 0 : r.changes ?? 0), 0);
        const exported = db.export();
        views.push({
          label: "Stats",
          out: {
            kind: "stats",
            items: [
              { label: "Statements", value: results.length, tone: "info" },
              { label: "Result sets", value: selects },
              { label: "Rows changed", value: changes },
              { label: "Tables", value: objects.filter((o) => o[0] === "table").length },
              { label: "Views / indexes / triggers", value: `${objects.filter((o) => o[0] === "view").length} / ${objects.filter((o) => o[0] === "index").length} / ${objects.filter((o) => o[0] === "trigger").length}` },
              { label: "Database size", value: `${(exported.length / 1024).toFixed(1)} KB` },
              { label: "Total time", value: `${results.reduce((a, r) => a + r.ms, 0).toFixed(1)} ms` },
            ],
          },
        });
        const text = log.join("\n\n") || `Database has ${objects.length} object(s): ${objects.map((o) => `${o[0]} ${o[1]}`).join(", ")}`;
        const wantDb = str(opts.download) === "db";
        return {
          text,
          lang: "sql",
          views,
          notes: notes.length ? notes : undefined,
          ...(wantDb ? { blob: new Blob([exported as BlobPart], { type: "application/vnd.sqlite3" }), filename: "database.sqlite" } : { filename: "results.txt" }),
        };
      } finally {
        db.close();
      }
    },
    examples: [], // filled below (kept next to the scripts)
    steps: ["Write a script — several statements separated by semicolons — or pick a sample.", "Press Execute: every statement runs in a fresh in-memory SQLite database.", "Each result set gets its own tab; Log shows everything in sqlite3-shell style.", "Browse Schema, toggle EXPLAIN QUERY PLAN, or set Download to .sqlite to save the database."],
    tips: ["Open an existing .sqlite/.db file with the file field, then query it — nothing leaves the browser.", "This SQLite build includes JSON1 and FTS3/FTS4 (not FTS5)."],
  },

  "parquet-viewer": {
    inputs: [{ id: "file", label: "Parquet file", kind: "file", read: "base64", accept: ".parquet,.parq,.pq,application/vnd.apache.parquet" }],
    options: [
      { id: "rows", label: "First rows", type: "number", default: 100, min: 1, max: 100000, step: 50 },
      { id: "columns", label: "Columns", type: "text", default: "", placeholder: "all (or a,b,c)", width: 140 },
      { id: "export", label: "Export", type: "segment", choices: [["csv", "CSV"], ["json", "JSON"], ["ndjson", "NDJSON"]], default: "csv" },
    ],
    pipe: false,
    async run({ inputs, opts }) {
      const src = inputs.file;
      if (!src) throw new ToolError("Drop a .parquet file (or pick an example) to inspect it.");
      let b64 = src;
      if (src.startsWith("@sample:")) {
        const m = await import("./lib/D-parquet-samples");
        b64 = (m as Record<string, string>)[`PQ_${src.slice(8).toUpperCase()}`] ?? "";
        if (src.endsWith(":truncated")) b64 = m.PQ_SALES.slice(0, 2400);
      }
      const bytes = b64ToBytes(b64);
      const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const tail = new TextDecoder().decode(bytes.slice(-4));
      if (bytes.length < 12 || tail !== "PAR1") throw new ToolError(`Not a complete Parquet file: it must end with the "PAR1" magic bytes (found ${JSON.stringify(tail)}). The file may be truncated or another format.`);
      const hp = await import("hyparquet");
      let md;
      try {
        md = hp.parquetMetadata(ab);
      } catch (e) {
        throw new ToolError(`Could not read the Parquet footer: ${(e as Error).message}`);
      }
      const schema = md.schema as PqSchemaEl[];
      // leaf columns with their dotted path
      const leaves: { path: string; el: PqSchemaEl; rep: string[] }[] = [];
      let idx = 1;
      const walk = (prefix: string[], reps: string[]) => {
        const el = schema[idx++];
        const path = [...prefix, el.name];
        const rr = [...reps, el.repetition_type ?? ""];
        if (el.num_children) for (let k = 0; k < el.num_children; k++) walk(path, rr);
        else leaves.push({ path: path.join("."), el, rep: rr });
      };
      while (idx < schema.length) walk([], []);
      const top = schema.slice(1).reduce<{ list: string[]; skip: number }>(
        (acc, el) => {
          if (acc.skip > 0) {
            acc.skip += (el.num_children ?? 0) - 1;
            return acc;
          }
          acc.list.push(el.name);
          acc.skip = el.num_children ?? 0;
          return acc;
        },
        { list: [], skip: 0 }
      ).list;
      const firstChunk = (path: string) => md.row_groups[0]?.columns.find((c) => c.meta_data?.path_in_schema.join(".") === path)?.meta_data;
      const schemaRows: Cell[][] = leaves.map(({ path, el, rep }) => {
        const cm = firstChunk(path);
        const repetition = rep.includes("REPEATED") ? "REPEATED (nested)" : el.repetition_type ?? "";
        return [path, el.type ?? "group", logicalName(el), repetition, cm?.codec ?? "", cm?.encodings?.join(", ") ?? "", el.type_length ?? null];
      });
      const want = str(opts.columns).split(",").map((s) => s.trim()).filter(Boolean);
      const unknown = want.filter((c) => !top.includes(c));
      if (unknown.length) throw new ToolError(`Unknown column(s): ${unknown.join(", ")}. Available: ${top.join(", ")}`);
      const limit = Math.max(1, num(opts.rows, 100));
      const totalRows = Number(md.num_rows);
      let rows: Record<string, unknown>[];
      try {
        rows = (await hp.parquetReadObjects({ file: ab, metadata: md, columns: want.length ? want : undefined, rowStart: 0, rowEnd: Math.min(limit, totalRows) })) as Record<string, unknown>[];
      } catch (e) {
        const msg = (e as Error).message;
        throw new ToolError(/compression|codec|unsupported/i.test(msg) ? `${msg}. This viewer decodes UNCOMPRESSED and SNAPPY files; re-save with snappy to view it.` : `Could not decode the data: ${msg}`);
      }
      const cols = want.length ? want : top;
      // Per top-level column: DATE columns print as YYYY-MM-DD, FLOAT (32-bit) at single precision.
      const leafOf = new Map(leaves.filter((l) => !l.path.includes(".")).map((l) => [l.path, l.el]));
      const norm = (c: string, v: unknown): unknown => {
        const el = leafOf.get(c);
        if (v instanceof Date) return el?.logical_type?.type === "DATE" || el?.converted_type === "DATE" ? v.toISOString().slice(0, 10) : v.toISOString().replace(".000Z", "Z");
        if (typeof v === "number" && el?.type === "FLOAT") return Number(v.toPrecision(7));
        if (typeof v === "bigint") return Number.isSafeInteger(Number(v)) ? Number(v) : String(v);
        return v;
      };
      const grid: Cell[][] = rows.map((r) => cols.map((c) => fmtCell(norm(c, r[c]) as Cell)));
      const plain = rows.map((r) => Object.fromEntries(cols.map((c) => [c, JSON.parse(JSON.stringify(norm(c, r[c]) ?? null, (_k, x) => (typeof x === "bigint" ? (Number.isSafeInteger(Number(x)) ? Number(x) : String(x)) : x)))])));
      const fmt = str(opts.export);
      const T = await tab();
      const text = fmt === "json" ? JSON.stringify(plain, null, 2) : fmt === "ndjson" ? plain.map((r) => JSON.stringify(r)).join("\n") : T.exportTable(cols, grid, "csv").text;
      const kv = (md.key_value_metadata ?? []) as { key: string; value?: string }[];
      const compressed = md.row_groups.reduce((a, g) => a + g.columns.reduce((b, c) => b + Number(c.meta_data?.total_compressed_size ?? 0), 0), 0);
      const uncompressed = md.row_groups.reduce((a, g) => a + g.columns.reduce((b, c) => b + Number(c.meta_data?.total_uncompressed_size ?? 0), 0), 0);
      const codecs = [...new Set(md.row_groups.flatMap((g) => g.columns.map((c) => c.meta_data?.codec ?? "")))].filter(Boolean);
      const statVal = (v: unknown) => (v == null ? null : fmtCell(v instanceof Uint8Array ? new TextDecoder().decode(v) : v));
      const chunks: Cell[][] = md.row_groups.flatMap((g, gi) =>
        g.columns.map((c) => {
          const m = c.meta_data;
          const st = m?.statistics;
          return [gi, m?.path_in_schema.join(".") ?? "", m?.codec ?? "", Number(m?.num_values ?? 0), Number(m?.total_compressed_size ?? 0), Number(m?.total_uncompressed_size ?? 0), statVal(st?.min_value ?? st?.min), statVal(st?.max_value ?? st?.max), st?.null_count == null ? null : Number(st.null_count)];
        })
      );
      const views: View[] = [
        { label: `Data (${rows.length}${rows.length < totalRows ? ` of ${totalRows}` : ""})`, out: { kind: "table", columns: cols, rows: grid } },
        { label: `Schema (${leaves.length})`, out: { kind: "table", columns: ["column", "physical type", "logical type", "repetition", "compression", "encodings", "type length"], rows: schemaRows } },
        {
          label: "File",
          out: {
            kind: "stats",
            items: [
              { label: "Rows", value: totalRows.toLocaleString(), tone: "info" },
              { label: "Row groups", value: md.row_groups.length },
              { label: "Columns (leaf)", value: leaves.length },
              { label: "File size", value: `${(bytes.length / 1024).toFixed(1)} KB` },
              { label: "Compression", value: codecs.join(", ") || "—" },
              { label: "Data compressed / raw", value: `${(compressed / 1024).toFixed(1)} / ${(uncompressed / 1024).toFixed(1)} KB` },
              { label: "Format version", value: md.version },
              { label: "Created by", value: md.created_by ?? "unknown" },
            ],
          },
        },
        { label: "Row groups", out: { kind: "table", columns: ["row group", "column", "codec", "values", "compressed B", "raw B", "min", "max", "nulls"], rows: chunks } },
        {
          label: `Key-value (${kv.length})`,
          out: kv.length ? { kind: "table", columns: ["key", "value"], rows: kv.map((k) => [k.key, (k.value ?? "").length > 300 ? (k.value ?? "").slice(0, 300) + `… (${(k.value ?? "").length} chars)` : k.value ?? ""]) } : { kind: "status", ok: true, title: "No key-value metadata", detail: "Writers such as pyarrow store the Arrow schema here." },
        },
        { label: `Export · ${fmt.toUpperCase()}`, out: { kind: "text", text, lang: fmt === "csv" ? "text" : "json" } },
        { label: "Tree", out: { kind: "tree", value: plain.slice(0, 50) } },
      ];
      return { text, views, filename: `data.${fmt}`, lang: fmt === "csv" ? "text" : "json" };
    },
    examples: [
      { label: "Sales (pyarrow)", inputs: { file: "@sample:sales", "file:name": "sales.parquet · 4.2 KB" }, note: "20 orders written by pyarrow: INT64, DATE, DECIMAL(10,2), DOUBLE, BOOLEAN, nullable strings and a UTC TIMESTAMP, snappy-compressed." },
      { label: "Nested events", inputs: { file: "@sample:events_nested", "file:name": "events_nested.parquet · 3.7 KB" }, note: "A struct column (user), a list of strings (tags) and a list of structs (items) — see the dotted leaf paths in Schema." },
      { label: "3 row groups", inputs: { file: "@sample:sensors", "file:name": "sensors.parquet · 3.9 KB" }, opts: { rows: 12 }, note: "30 uncompressed sensor readings split into three row groups; the Row groups tab shows per-chunk min/max statistics." },
      { label: "hyparquet-writer", inputs: { file: "@sample:cities", "file:name": "cities.parquet · 1.2 KB" }, opts: { export: "ndjson" }, note: "Written in JavaScript by hyparquet-writer, with a JSON logical-type column and custom key-value metadata." },
      { label: "Pick columns", inputs: { file: "@sample:sales", "file:name": "sales.parquet · 4.2 KB" }, opts: { columns: "order_date,customer,product,quantity,unit_price", rows: 10, export: "json" }, note: "Only the listed columns are decoded — the point of a columnar format." },
      { label: "Truncated file", inputs: { file: "@sample:sales:truncated", "file:name": "sales-partial.parquet · 1.7 KB" }, note: "A cut-off download: the footer and PAR1 magic are missing.", error: true },
    ],
    steps: ["Drop a .parquet file — it is decoded in the browser with hyparquet, never uploaded.", "Read Schema for physical/logical types and compression, File for row counts and the writer.", "Limit rows or list columns, then export as CSV, JSON or NDJSON."],
  },

  "ddl-to-diagram": {
    inputs: [{ id: "ddl", label: "CREATE TABLE statements", lang: "sql", placeholder: "CREATE TABLE users (id INT PRIMARY KEY, …);" }],
    options: [
      { id: "attrs", label: "Attributes", type: "segment", choices: [["all", "All"], ["keys", "Keys only"], ["none", "None"]], default: "all" },
      { id: "types", label: "Type params", type: "toggle", default: true, hint: "Keep lengths and precision, e.g. varchar(255) and numeric(12,2)" },
      { id: "notes", label: "Column notes", type: "toggle", default: false, hint: "NOT NULL, defaults, references and comments as attribute comments" },
      { id: "dotted", label: "Dotted non-identifying", type: "toggle", default: true, hint: "Draw relationships whose FK is not part of the child's primary key as dotted lines" },
      { id: "direction", label: "Direction", type: "segment", choices: [["TB", "Top-down"], ["LR", "Left-right"]], default: "TB" },
      { id: "theme", label: "Theme", type: "select", choices: [["default", "Default"], ["neutral", "Neutral"], ["forest", "Forest"], ["dark", "Dark"]], default: "neutral" },
    ],
    outLang: "mermaid",
    async run({ inputs, opts, pipeline }) {
      const D = await import("./lib/D-ddl");
      const { tables, warnings, skipped } = D.parseDdl(inputs.ddl);
      const code = D.toMermaid(tables, { attrs: str(opts.attrs) as "all", types: bool(opts.types), notes: bool(opts.notes), dotted: bool(opts.dotted), direction: str(opts.direction) });
      const rels = D.relationships(tables);
      const views: View[] = [];
      const { isNode } = await import("./lib/vendor");
      let renderErr = "";
      if (!pipeline && !isNode) {
        try {
          const { renderMermaid } = await import("./lib/mermaid");
          const svg = await renderMermaid(code, { theme: str(opts.theme) as "neutral" });
          views.push({ label: "Diagram", out: { kind: "svg", svg, name: "er-diagram" } });
        } catch (e) {
          renderErr = (e as Error).message;
        }
      }
      views.push(
        { label: "Mermaid", out: { kind: "text", text: code, lang: "mermaid" } },
        {
          label: `Columns (${tables.reduce((a, t) => a + t.columns.length, 0)})`,
          out: {
            kind: "table",
            columns: ["table", "column", "type", "key", "null", "default", "references", "check / comment"],
            rows: tables.flatMap((t) => t.columns.map((c) => [t.name, c.name, c.type, [c.pk ? "PK" : "", c.fk ? "FK" : "", c.unique && !c.pk ? "UK" : ""].filter(Boolean).join(" "), c.nullable ? "NULL" : "NOT NULL", c.auto ? "auto-increment" : c.default ?? null, c.fk ? `${c.fk.table}.${c.fk.column}` : null, [c.check, c.comment].filter(Boolean).join(" · ") || null])),
          },
        },
        {
          label: `Relationships (${rels.length})`,
          out: {
            kind: "table",
            columns: ["child", "columns", "parent", "parent columns", "cardinality", "kind", "on delete"],
            rows: rels.map((r) => [r.from, r.label, r.to, r.fk.refColumns.join(", "), r.oneToOne ? (r.optional ? "0..1 → 0..1" : "0..1 → 1") : r.optional ? "many → 0..1" : "many → 1", r.identifying ? "identifying" : "non-identifying", r.fk.onDelete ?? null]),
          },
        },
        { label: "Tables", out: { kind: "table", columns: ["table", "columns", "primary key", "unique", "foreign keys", "checks", "comment"], rows: tables.map((t) => [t.name, t.columns.length, t.pk.join(", ") || null, t.uniques.map((u) => `(${u.join(", ")})`).join(" ") || null, t.fks.length, t.checks.length, t.comment ?? null]) } }
      );
      const items: { level: "error" | "warning" | "info"; message: string; line?: number }[] = warnings.map((w) => ({ level: "warning", message: w.message, line: w.line }));
      if (skipped) items.push({ level: "info", message: `${skipped} non-table statement(s) skipped (indexes, inserts, views…).` });
      if (renderErr) items.unshift({ level: "error", message: `Diagram render failed: ${renderErr}` });
      if (items.length) views.push({ label: `Notes (${items.length})`, out: { kind: "issues", items } });
      return { text: code, lang: "mermaid", filename: "schema.mmd", views };
    },
    examples: [
      {
        label: "Blog",
        inputs: {
          ddl: `-- A classic blog schema (PostgreSQL)
CREATE TABLE users (
  id          BIGSERIAL PRIMARY KEY,
  email       VARCHAR(255) NOT NULL UNIQUE,
  username    VARCHAR(40)  NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE posts (
  id           BIGSERIAL PRIMARY KEY,
  author_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  slug         TEXT NOT NULL UNIQUE,
  body         TEXT,
  status       VARCHAR(12) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at TIMESTAMPTZ
);

CREATE TABLE comments (
  id         BIGSERIAL PRIMARY KEY,
  post_id    BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id  BIGINT REFERENCES users(id) ON DELETE SET NULL,
  parent_id  BIGINT REFERENCES comments(id),
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE tags (
  id   SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE
);

-- junction table: composite primary key made of two foreign keys
CREATE TABLE post_tags (
  post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  tag_id  INT    NOT NULL REFERENCES tags(id),
  PRIMARY KEY (post_id, tag_id)
);`,
        },
        note: "Inline REFERENCES, a self-reference (comment threads) and a junction table whose identifying relationships are drawn solid.",
      },
      {
        label: "E-commerce (MySQL)",
        inputs: {
          ddl: "CREATE TABLE `customers` (\n  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,\n  `email` VARCHAR(191) NOT NULL,\n  `name` VARCHAR(120) NOT NULL,\n  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `uq_email` (`email`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Registered shoppers';\n\nCREATE TABLE `products` (\n  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,\n  `sku` VARCHAR(32) NOT NULL,\n  `name` VARCHAR(200) NOT NULL,\n  `price` DECIMAL(10,2) NOT NULL COMMENT 'in EUR',\n  `stock` INT NOT NULL DEFAULT 0,\n  PRIMARY KEY (`id`),\n  UNIQUE KEY (`sku`),\n  KEY `idx_name` (`name`)\n);\n\nCREATE TABLE `orders` (\n  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,\n  `customer_id` INT UNSIGNED NOT NULL,\n  `status` ENUM('new','paid','shipped','cancelled') NOT NULL DEFAULT 'new',\n  `total` DECIMAL(12,2) NOT NULL,\n  `placed_at` DATETIME NOT NULL,\n  PRIMARY KEY (`id`),\n  CONSTRAINT `fk_orders_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`)\n);\n\nCREATE TABLE `order_items` (\n  `order_id` BIGINT UNSIGNED NOT NULL,\n  `line_no` SMALLINT NOT NULL,\n  `product_id` INT UNSIGNED NOT NULL,\n  `qty` INT NOT NULL,\n  `unit_price` DECIMAL(10,2) NOT NULL,\n  PRIMARY KEY (`order_id`, `line_no`),\n  FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE,\n  FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)\n);\n\nCREATE TABLE `shipments` (\n  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,\n  `order_id` BIGINT UNSIGNED NOT NULL UNIQUE,\n  `carrier` VARCHAR(40),\n  `tracking_no` VARCHAR(64),\n  FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`)\n);",
        },
        opts: { notes: true },
        note: "Backticks, AUTO_INCREMENT, ENUM, DECIMAL(10,2), table-level constraints and a one-to-one shipment (UNIQUE FK). Column notes on.",
      },
      {
        label: "SaaS multi-tenant",
        inputs: {
          ddl: `CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'free'
);
CREATE TABLE accounts (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  email CITEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','admin','member')),
  UNIQUE (tenant_id, email)
);
CREATE TABLE projects (
  tenant_id UUID NOT NULL,
  id UUID NOT NULL,
  name TEXT NOT NULL,
  owner_id UUID,
  PRIMARY KEY (tenant_id, id)
);
CREATE TABLE api_keys (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants,
  project_id UUID,
  prefix CHAR(8) NOT NULL,
  hashed_secret BYTEA NOT NULL,
  revoked_at TIMESTAMPTZ
);
CREATE TABLE subscriptions (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id),
  stripe_customer TEXT UNIQUE,
  seats INT NOT NULL DEFAULT 1 CHECK (seats > 0)
);
-- relationships added after the fact
ALTER TABLE accounts ADD CONSTRAINT fk_accounts_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE projects ADD CONSTRAINT fk_projects_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE projects ADD CONSTRAINT fk_projects_owner FOREIGN KEY (owner_id) REFERENCES accounts(id) ON DELETE SET NULL;
ALTER TABLE api_keys ADD FOREIGN KEY (tenant_id, project_id) REFERENCES projects (tenant_id, id);`,
        },
        opts: { direction: "LR" },
        note: "ALTER TABLE … ADD CONSTRAINT FOREIGN KEY, a composite foreign key, REFERENCES without a column (→ primary key) and a 1:1 subscription.",
      },
      {
        label: "Postgres schemas",
        inputs: {
          ddl: `CREATE SCHEMA auth;
CREATE SCHEMA billing;

CREATE TABLE auth.users (
  id        integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email     text NOT NULL UNIQUE,
  password  text NOT NULL
);
COMMENT ON TABLE auth.users IS 'Login identities';
COMMENT ON COLUMN auth.users.password IS 'argon2id hash';

CREATE TABLE billing.invoices (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     integer NOT NULL REFERENCES auth.users (id),
  amount      numeric(12,2) NOT NULL CHECK (amount >= 0),
  currency    char(3) NOT NULL DEFAULT 'EUR',
  lines       jsonb NOT NULL DEFAULT '[]'::jsonb,
  issued_on   date NOT NULL DEFAULT CURRENT_DATE
);

CREATE TABLE billing."Payment Methods" (
  id        integer PRIMARY KEY,
  user_id   integer REFERENCES auth.users,
  brand     text,
  last4     char(4)
);

CREATE UNIQUE INDEX ON billing."Payment Methods" (user_id, last4);`,
        },
        opts: { notes: true, attrs: "all" },
        note: "Schema-qualified names, quoted identifiers with spaces, identity columns, ::casts and COMMENT ON COLUMN.",
      },
      {
        label: "SQL Server",
        inputs: {
          ddl: "CREATE TABLE [dbo].[Departments] (\n  [DepartmentID] INT IDENTITY(1,1) NOT NULL,\n  [Name] NVARCHAR(100) NOT NULL,\n  CONSTRAINT [PK_Departments] PRIMARY KEY CLUSTERED ([DepartmentID] ASC)\n);\nGO\nCREATE TABLE [dbo].[Employees] (\n  [EmployeeID] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,\n  [DepartmentID] INT NULL,\n  [ManagerID] INT NULL,\n  [FullName] NVARCHAR(200) NOT NULL,\n  [HireDate] DATE NOT NULL DEFAULT (GETDATE()),\n  CONSTRAINT [FK_Emp_Dept] FOREIGN KEY ([DepartmentID]) REFERENCES [dbo].[Departments] ([DepartmentID]),\n  CONSTRAINT [FK_Emp_Mgr] FOREIGN KEY ([ManagerID]) REFERENCES [dbo].[Employees] ([EmployeeID])\n);\nGO",
        },
        opts: { attrs: "keys" },
        note: "Bracketed identifiers, IDENTITY(1,1), CLUSTERED keys and GO batch separators; Keys-only attributes.",
      },
      { label: "SQLite", inputs: { ddl: "CREATE TABLE artist (artistid INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);\nCREATE TABLE album (albumid INTEGER PRIMARY KEY, title TEXT, artistid INTEGER NOT NULL REFERENCES artist ON DELETE CASCADE);\nCREATE TABLE track (trackid INTEGER PRIMARY KEY, name TEXT, albumid INTEGER, milliseconds INTEGER CHECK (milliseconds > 0), FOREIGN KEY (albumid) REFERENCES album(albumid));" }, opts: { types: false }, note: "SQLite's AUTOINCREMENT, REFERENCES without a column and a table-level FOREIGN KEY; type params off." },
      { label: "Missing parenthesis", inputs: { ddl: "CREATE TABLE users (\n  id INT PRIMARY KEY,\n  name TEXT\n;\nCREATE TABLE posts (id INT);" }, note: "Unbalanced parentheses are reported.", error: true },
    ],
    steps: ["Paste CREATE TABLE (and ALTER TABLE … FOREIGN KEY) statements from any major database.", "The Diagram tab renders a Mermaid ER diagram; relationships come from foreign keys.", "Tune attributes, notes and direction; copy the Mermaid source into docs or a README."],
  },
};

/* ── SQLite sample scripts ───────────────────────────────────────────── */

const CHINOOK = `-- Chinook-lite: a tiny music store
PRAGMA foreign_keys = ON;

CREATE TABLE artists (artist_id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE genres  (genre_id  INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE);
CREATE TABLE albums  (album_id  INTEGER PRIMARY KEY, title TEXT NOT NULL,
                      artist_id INTEGER NOT NULL REFERENCES artists(artist_id));
CREATE TABLE tracks  (track_id  INTEGER PRIMARY KEY, name TEXT NOT NULL,
                      album_id  INTEGER REFERENCES albums(album_id),
                      genre_id  INTEGER REFERENCES genres(genre_id),
                      milliseconds INTEGER NOT NULL, unit_price REAL NOT NULL DEFAULT 0.99);
CREATE TABLE customers (customer_id INTEGER PRIMARY KEY, first_name TEXT, last_name TEXT, country TEXT, email TEXT UNIQUE);
CREATE TABLE invoices (invoice_id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL REFERENCES customers(customer_id),
                       invoice_date TEXT NOT NULL, total REAL NOT NULL);
CREATE TABLE invoice_items (invoice_line_id INTEGER PRIMARY KEY, invoice_id INTEGER NOT NULL REFERENCES invoices(invoice_id),
                            track_id INTEGER NOT NULL REFERENCES tracks(track_id), unit_price REAL NOT NULL, quantity INTEGER NOT NULL);
CREATE INDEX idx_tracks_album ON tracks(album_id);

INSERT INTO artists VALUES (1,'AC/DC'),(2,'Miles Davis'),(3,'Daft Punk'),(4,'Nina Simone'),(5,'Radiohead');
INSERT INTO genres VALUES (1,'Rock'),(2,'Jazz'),(3,'Electronic'),(4,'Soul');
INSERT INTO albums VALUES (1,'Back in Black',1),(2,'Kind of Blue',2),(3,'Discovery',3),(4,'Pastel Blues',4),(5,'OK Computer',5),(6,'Random Access Memories',3);
INSERT INTO tracks VALUES
 (1,'Hells Bells',1,1,312000,0.99),(2,'Back in Black',1,1,255000,0.99),(3,'So What',2,2,562000,1.29),
 (4,'Blue in Green',2,2,337000,1.29),(5,'One More Time',3,3,320000,0.99),(6,'Digital Love',3,3,301000,0.99),
 (7,'Sinnerman',4,4,622000,1.29),(8,'Paranoid Android',5,1,383000,0.99),(9,'Karma Police',5,1,264000,0.99),
 (10,'Get Lucky',6,3,369000,1.29),(11,'Instant Crush',6,3,337000,1.29);
INSERT INTO customers VALUES (1,'Ada','Lovelace','GB','ada@example.com'),(2,'Grace','Hopper','US','grace@example.com'),
 (3,'Linus','Torvalds','FI','linus@example.com'),(4,'Hedy','Lamarr','AT','hedy@example.com');
INSERT INTO invoices VALUES (1,1,'2026-01-10',3.27),(2,2,'2026-01-14',2.58),(3,1,'2026-02-02',1.98),(4,3,'2026-02-20',3.87),(5,4,'2026-03-05',2.28),(6,2,'2026-03-18',1.29);
INSERT INTO invoice_items (invoice_id, track_id, unit_price, quantity) VALUES
 (1,1,0.99,1),(1,3,1.29,1),(1,5,0.99,1),(2,3,1.29,2),(3,8,0.99,2),(4,10,1.29,3),(5,7,1.29,1),(5,9,0.99,1),(6,11,1.29,1);

-- Best-selling artists
SELECT ar.name AS artist, SUM(ii.quantity) AS units, ROUND(SUM(ii.unit_price * ii.quantity), 2) AS revenue
FROM invoice_items ii
JOIN tracks t   ON t.track_id = ii.track_id
JOIN albums al  ON al.album_id = t.album_id
JOIN artists ar ON ar.artist_id = al.artist_id
GROUP BY ar.artist_id ORDER BY revenue DESC;

-- Spend per customer and their favourite genre
SELECT c.first_name || ' ' || c.last_name AS customer, c.country,
       ROUND(SUM(i.total), 2) AS spent,
       (SELECT g.name FROM invoice_items x JOIN invoices y USING (invoice_id) JOIN tracks t USING (track_id) JOIN genres g USING (genre_id)
         WHERE y.customer_id = c.customer_id GROUP BY g.genre_id ORDER BY SUM(x.quantity) DESC LIMIT 1) AS top_genre
FROM customers c JOIN invoices i USING (customer_id)
GROUP BY c.customer_id ORDER BY spent DESC;

-- Album lengths
SELECT al.title, COUNT(*) AS tracks, printf('%d:%02d', SUM(milliseconds) / 60000, SUM(milliseconds) / 1000 % 60) AS length
FROM albums al JOIN tracks USING (album_id) GROUP BY al.album_id ORDER BY SUM(milliseconds) DESC;`;

const ORG = `-- Employees and a recursive org chart
CREATE TABLE employees (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  manager_id INTEGER REFERENCES employees(id),
  salary INTEGER NOT NULL
);
INSERT INTO employees VALUES
 (1,'Ada Lovelace','CEO',NULL,250000),
 (2,'Grace Hopper','CTO',1,210000),
 (3,'Katherine Johnson','CFO',1,205000),
 (4,'Margaret Hamilton','VP Engineering',2,180000),
 (5,'Linus Torvalds','Staff Engineer',4,165000),
 (6,'Barbara Liskov','Senior Engineer',4,150000),
 (7,'Dennis Ritchie','Senior Engineer',4,148000),
 (8,'Ken Thompson','SRE Lead',2,152000),
 (9,'Radia Perlman','Network Engineer',8,139000),
 (10,'Frances Allen','Controller',3,132000),
 (11,'Joan Clarke','Analyst',10,98000);

-- Walk the tree from the CEO down, building an indented chart and the chain of command
WITH RECURSIVE chart(id, name, title, depth, path, chain) AS (
  SELECT id, name, title, 0, printf('%03d', id), name FROM employees WHERE manager_id IS NULL
  UNION ALL
  SELECT e.id, e.name, e.title, c.depth + 1, c.path || '.' || printf('%03d', e.id), c.chain || ' › ' || e.name
  FROM employees e JOIN chart c ON e.manager_id = c.id
)
SELECT substr('                ', 1, depth * 3) || name AS org_chart, title, depth, chain
FROM chart ORDER BY path;

-- Head-count and total salary under each manager (all levels)
WITH RECURSIVE under(manager_id, id) AS (
  SELECT manager_id, id FROM employees WHERE manager_id IS NOT NULL
  UNION ALL
  SELECT u.manager_id, e.id FROM under u JOIN employees e ON e.manager_id = u.id
)
SELECT m.name AS manager, COUNT(*) AS reports_total, SUM(e.salary) AS payroll_below
FROM under u JOIN employees m ON m.id = u.manager_id JOIN employees e ON e.id = u.id
GROUP BY m.id ORDER BY reports_total DESC;`;

const JSON1 = `-- JSON1: store documents, query into them, build JSON back out
CREATE TABLE events (id INTEGER PRIMARY KEY, payload TEXT CHECK (json_valid(payload)));
INSERT INTO events (payload) VALUES
 ('{"type":"signup","user":{"id":7,"name":"Ada","plan":"pro"},"tags":["web","promo"]}'),
 ('{"type":"purchase","user":{"id":7,"name":"Ada"},"order":{"total":42.5,"items":[{"sku":"KB-01","qty":1},{"sku":"MS-02","qty":2}]}}'),
 ('{"type":"signup","user":{"id":9,"name":"Grace","plan":"free"},"tags":["mobile"]}'),
 ('{"type":"purchase","user":{"id":9,"name":"Grace"},"order":{"total":18.0,"items":[{"sku":"MS-02","qty":1}]}}');

-- Extract with json_extract and the ->> operator
SELECT id, payload ->> '$.type' AS type, json_extract(payload, '$.user.name') AS user,
       payload ->> '$.order.total' AS total, json_array_length(payload, '$.tags') AS tag_count
FROM events;

-- Unnest arrays with json_each
SELECT e.id, t.value AS tag FROM events e, json_each(e.payload, '$.tags') t;

-- Aggregate order lines per SKU across documents
SELECT item.value ->> '$.sku' AS sku, SUM(item.value ->> '$.qty') AS units
FROM events, json_each(events.payload, '$.order.items') AS item
GROUP BY sku;

-- Build JSON: one object per user with an array of event types
SELECT json_object('user', payload ->> '$.user.name',
                   'events', json_group_array(payload ->> '$.type')) AS doc
FROM events GROUP BY payload ->> '$.user.id';

-- Modify documents in place
UPDATE events SET payload = json_set(payload, '$.processed', json('true')) WHERE payload ->> '$.type' = 'purchase';
SELECT id, json_extract(payload, '$.processed') AS processed FROM events;`;

const WINDOWS = `-- Window functions over daily sales
CREATE TABLE daily (day TEXT, store TEXT, sales REAL);
INSERT INTO daily VALUES
 ('2026-03-01','north',120),('2026-03-02','north',135),('2026-03-03','north',90),('2026-03-04','north',160),('2026-03-05','north',155),
 ('2026-03-01','south',80),('2026-03-02','south',95),('2026-03-03','south',130),('2026-03-04','south',70),('2026-03-05','south',110);

SELECT day, store, sales,
       SUM(sales)  OVER (PARTITION BY store ORDER BY day)                         AS running_total,
       ROUND(AVG(sales) OVER (PARTITION BY store ORDER BY day ROWS BETWEEN 2 PRECEDING AND CURRENT ROW), 1) AS moving_avg_3,
       sales - LAG(sales) OVER (PARTITION BY store ORDER BY day)                  AS vs_prev_day,
       LEAD(sales) OVER (PARTITION BY store ORDER BY day)                         AS next_day,
       RANK()      OVER (PARTITION BY store ORDER BY sales DESC)                  AS rank_in_store,
       NTILE(2)    OVER (ORDER BY sales)                                          AS half,
       ROUND(100.0 * sales / SUM(sales) OVER (PARTITION BY day), 1)               AS pct_of_day
FROM daily ORDER BY store, day;

-- Best day per store with ROW_NUMBER + a filter
SELECT store, day, sales FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY store ORDER BY sales DESC) AS rn FROM daily
) WHERE rn = 1;`;

const FTS = `-- Full-text search with FTS4 (this sql.js build has FTS3/FTS4; FTS5 is not compiled in)
CREATE VIRTUAL TABLE docs USING fts4(title, body, tokenize=porter);
INSERT INTO docs (title, body) VALUES
 ('Getting started', 'Install the CLI, create a project and run your first build in under a minute.'),
 ('Caching builds', 'Remote caching shares build outputs between machines so repeated builds are fast.'),
 ('Offline mode', 'Every tool runs locally in the browser; nothing is uploaded and it keeps working offline.'),
 ('Pipelines', 'Chain tools together: the output of one step becomes the input of the next.'),
 ('Security model', 'User code runs in sandboxed iframes with an opaque origin and no network access.');

-- Porter stemming: "builds", "building" and "build" all match
SELECT title, snippet(docs, '[', ']', '…', -1, 8) AS match FROM docs WHERE docs MATCH 'build';

-- Boolean and phrase queries
SELECT title FROM docs WHERE docs MATCH 'offline OR sandboxed';
SELECT title FROM docs WHERE docs MATCH '"first build"';
SELECT title FROM docs WHERE body MATCH 'run*';

-- Triggers and a view on a normal table
CREATE TABLE notes (id INTEGER PRIMARY KEY, text TEXT, updated_at TEXT);
CREATE TRIGGER notes_touch AFTER UPDATE OF text ON notes
BEGIN
  UPDATE notes SET updated_at = datetime('now') WHERE id = NEW.id;
END;
INSERT INTO notes (text) VALUES ('draft'), ('todo');
UPDATE notes SET text = 'final' WHERE id = 1;
CREATE VIEW recent_notes AS SELECT id, text, updated_at IS NOT NULL AS touched FROM notes;
SELECT * FROM recent_notes;`;

specs["sql-playground"].examples = [
  { label: "Chinook-lite", inputs: { sql: CHINOOK }, note: "A music store: 7 tables with foreign keys, joins, a correlated subquery and printf formatting. See Schema." },
  { label: "Org chart (recursive)", inputs: { sql: ORG }, note: "WITH RECURSIVE walks the manager tree to indent an org chart and total the payroll under each manager." },
  { label: "JSON1", inputs: { sql: JSON1 }, note: "json_extract, the ->> operator, json_each to unnest, json_group_array/json_object to build, json_set to update." },
  { label: "Window functions", inputs: { sql: WINDOWS }, opts: { explain: true }, note: "Running totals, moving averages, LAG/LEAD, RANK, NTILE — with EXPLAIN QUERY PLAN on." },
  { label: "Full-text + triggers", inputs: { sql: FTS }, note: "FTS4 with porter stemming, snippet(), boolean/phrase/prefix queries, plus a trigger and a view." },
  { label: "Open a .sqlite file", inputs: { sql: "SELECT name, type FROM sqlite_master WHERE type IN ('table','view');\n\nSELECT w.name AS warehouse, i.sku, i.name, s.qty\nFROM stock s JOIN items i USING (sku) JOIN warehouses w USING (warehouse_id)\nWHERE s.qty < 20 ORDER BY s.qty;\n\nSELECT * FROM low_stock;", db: "@sample:inventory", "db:name": "inventory.sqlite · 7.0 KB" }, note: "A real SQLite file (inventory.sqlite) opened from the file field, then queried." },
  { label: "Syntax error", inputs: { sql: "CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT);\nINSERT INTO t VALUES (1, 'ok');\nSELEC name FROM t;" }, note: "The error names the failing statement's line.", error: true },
];

export default specs;

export type { Result };
