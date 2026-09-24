/**
 * Tabular data helpers for the SQL & Data tools: format detection, CSV/TSV/
 * JSON/NDJSON parsing into a header + rows shape, column profiling and export
 * to other text formats. PapaParse is imported lazily.
 */
import { ToolError } from "../types";

export type Cell = string | number | boolean | null;
export type Table = { header: string[]; rows: Cell[][]; format: string; notes: string[] };

export type TabFormat = "auto" | "csv" | "tsv" | "json" | "ndjson";

export function detectFormat(src: string): Exclude<TabFormat, "auto"> {
  const s = src.trimStart();
  if (s.startsWith("[")) return "json";
  if (s.startsWith("{")) {
    const lines = s.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length > 1 && lines.every((l) => l.trim().startsWith("{") && l.trim().endsWith("}"))) return "ndjson";
    return "json";
  }
  const first = s.split(/\r?\n/, 1)[0] ?? "";
  const tabs = (first.match(/\t/g) ?? []).length;
  const commas = (first.match(/,/g) ?? []).length;
  const semis = (first.match(/;/g) ?? []).length;
  return tabs > commas && tabs >= semis ? "tsv" : "csv";
}

const scalar = (v: unknown): Cell => (v == null ? null : typeof v === "object" ? JSON.stringify(v) : (v as Cell));

function fromObjects(arr: unknown[], format: string): Table {
  const notes: string[] = [];
  if (!arr.length) throw new ToolError("The JSON array is empty.");
  if (arr.every((r) => Array.isArray(r))) {
    const [h, ...rest] = arr as unknown[][];
    return { header: h.map((x) => String(x)), rows: rest.map((r) => r.map(scalar)), format, notes: ["Treated the first inner array as the header row."] };
  }
  if (!arr.every((r) => r && typeof r === "object" && !Array.isArray(r))) {
    if (arr.every((r) => r == null || typeof r !== "object")) return { header: ["value"], rows: arr.map((v) => [scalar(v)]), format, notes };
    throw new ToolError("Expected an array of objects (records), e.g. [{\"id\":1,\"name\":\"Ada\"}].");
  }
  const header = [...new Set(arr.flatMap((r) => Object.keys(r as object)))];
  const nested = header.filter((k) => arr.some((r) => { const v = (r as Record<string, unknown>)[k]; return v !== null && typeof v === "object"; }));
  if (nested.length) notes.push(`Nested values in ${nested.map((n) => `"${n}"`).join(", ")} are kept as JSON text.`);
  return { header, rows: arr.map((r) => header.map((k) => scalar((r as Record<string, unknown>)[k]))), format, notes };
}

export type CsvOpts = { delimiter?: string; header?: boolean; quoteChar?: string; skipEmpty?: boolean };

export async function parseCsv(src: string, o: CsvOpts = {}): Promise<Table & { delimiter: string; errors: { row?: number; message: string }[] }> {
  const Papa = (await import("papaparse")).default;
  const r = Papa.parse<string[]>(src.replace(/^﻿/, ""), {
    delimiter: o.delimiter || "",
    quoteChar: o.quoteChar || '"',
    skipEmptyLines: o.skipEmpty === false ? false : "greedy",
    header: false,
  });
  let data = r.data as string[][];
  const errors = r.errors.map((e) => ({ row: e.row == null ? undefined : e.row + 1, message: e.message }));
  if (!data.length) throw new ToolError("No rows found. Paste CSV with a header line, e.g. id,name\\n1,Ada");
  const hasHeader = o.header !== false;
  const width = Math.max(...data.map((r) => r.length));
  let header: string[];
  if (hasHeader) {
    header = data[0].map((h, i) => h.trim() || `column${i + 1}`);
    data = data.slice(1);
  } else header = Array.from({ length: width }, (_, i) => `column${i + 1}`);
  // Dedupe header names.
  const seen = new Map<string, number>();
  header = header.map((h) => {
    const k = seen.get(h) ?? 0;
    seen.set(h, k + 1);
    return k ? `${h}_${k + 1}` : h;
  });
  while (header.length < width) header.push(`column${header.length + 1}`);
  const rows: Cell[][] = data.map((r) => header.map((_, i) => (r[i] === undefined ? null : r[i])));
  const ragged = data.filter((r) => r.length !== header.length).length;
  const notes: string[] = [];
  if (ragged) notes.push(`${ragged} row(s) have a different number of fields than the header.`);
  const delimiter = r.meta.delimiter;
  return { header, rows, format: delimiter === "\t" ? "tsv" : "csv", notes, delimiter, errors };
}

export async function parseTabular(src: string, fmt: TabFormat = "auto", csv: CsvOpts = {}): Promise<Table> {
  if (!src.trim()) throw new ToolError("Paste CSV, TSV, a JSON array of objects or NDJSON — or drop a file.");
  const f = fmt === "auto" ? detectFormat(src) : fmt;
  if (f === "json") {
    let v: unknown;
    try {
      v = JSON.parse(src);
    } catch (e) {
      throw new ToolError(`Invalid JSON: ${(e as Error).message}`);
    }
    if (!Array.isArray(v)) {
      // {"data":[...]} style wrappers
      const arr = v && typeof v === "object" ? Object.entries(v as object).find(([, x]) => Array.isArray(x)) : undefined;
      if (arr) {
        const t = fromObjects(arr[1] as unknown[], "json");
        t.notes.unshift(`Using the "${arr[0]}" array from the object.`);
        return t;
      }
      return fromObjects([v], "json");
    }
    return fromObjects(v, "json");
  }
  if (f === "ndjson") {
    const lines = src.split(/\r?\n/);
    const arr: unknown[] = [];
    lines.forEach((l, i) => {
      if (!l.trim()) return;
      try {
        arr.push(JSON.parse(l));
      } catch (e) {
        throw new ToolError(`NDJSON line ${i + 1}: ${(e as Error).message}`);
      }
    });
    return fromObjects(arr, "ndjson");
  }
  return parseCsv(src, { ...csv, delimiter: csv.delimiter || (f === "tsv" ? "\t" : "") });
}

/* ── profiling ─────────────────────────────────────────────────────────── */

export type ColType = "integer" | "float" | "boolean" | "date" | "string" | "empty";

const INT = /^[+-]?\d+$/;
const FLOAT = /^[+-]?(\d{1,3}(,\d{3})+|\d+)?(\.\d+)?([eE][+-]?\d+)?$/;
const BOOL = /^(true|false|yes|no|y|n|t|f)$/i;
const DATE = /^(\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?|\d{1,2}\/\d{1,2}\/\d{4})$/;

export const isEmpty = (v: Cell) => v == null || (typeof v === "string" && (v.trim() === "" || /^(null|na|n\/a|nan|none|-)$/i.test(v.trim())));

export function toNumber(v: Cell): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean" || v == null) return null;
  const s = v.trim().replace(/^\$/, "");
  if (!s || !FLOAT.test(s) || s === "." || s === "+" || s === "-") return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function inferColType(values: Cell[]): ColType {
  const vals = values.filter((v) => !isEmpty(v));
  if (!vals.length) return "empty";
  if (vals.every((v) => typeof v === "boolean" || (typeof v === "string" && BOOL.test(v.trim())))) {
    // 0/1 columns stay integers; y/n columns need at least one alpha
    return "boolean";
  }
  if (vals.every((v) => (typeof v === "number" && Number.isInteger(v)) || (typeof v === "string" && INT.test(v.trim())))) return "integer";
  if (vals.every((v) => toNumber(v) !== null)) return "float";
  if (vals.every((v) => typeof v === "string" && DATE.test(v.trim()) && !Number.isNaN(Date.parse(v.includes("/") ? v : v.replace(" ", "T"))))) return "date";
  return "string";
}

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export type ColumnProfile = {
  name: string;
  type: ColType;
  count: number;
  nulls: number;
  nullPct: number;
  distinct: number;
  min?: number | string;
  max?: number | string;
  mean?: number;
  median?: number;
  stddev?: number;
  p25?: number;
  p75?: number;
  sum?: number;
  minLen?: number;
  maxLen?: number;
  top: { value: string; count: number }[];
  hist?: number[];
  histRange?: [number, number];
  trueCount?: number;
};

export function profileColumn(name: string, values: Cell[], bins = 12, topN = 5): ColumnProfile {
  const type = inferColType(values);
  const present = values.filter((v) => !isEmpty(v));
  const counts = new Map<string, number>();
  for (const v of present) {
    const k = String(v);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const numeric = type === "integer" || type === "float";
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1] || (numeric ? (toNumber(a[0]) ?? 0) - (toNumber(b[0]) ?? 0) : a[0].localeCompare(b[0]))).slice(0, topN).map(([value, count]) => ({ value, count }));
  const p: ColumnProfile = {
    name,
    type,
    count: values.length,
    nulls: values.length - present.length,
    nullPct: values.length ? ((values.length - present.length) / values.length) * 100 : 0,
    distinct: counts.size,
    top,
  };
  if (type === "integer" || type === "float") {
    const nums = present.map(toNumber).filter((n): n is number => n !== null).sort((a, b) => a - b);
    const sum = nums.reduce((a, b) => a + b, 0);
    const mean = sum / nums.length;
    const variance = nums.length > 1 ? nums.reduce((a, b) => a + (b - mean) ** 2, 0) / (nums.length - 1) : 0;
    Object.assign(p, { min: nums[0], max: nums[nums.length - 1], sum, mean, median: quantile(nums, 0.5), p25: quantile(nums, 0.25), p75: quantile(nums, 0.75), stddev: Math.sqrt(variance) });
    const lo = nums[0], hi = nums[nums.length - 1];
    const k = Math.max(1, Math.min(bins, type === "integer" ? hi - lo + 1 : bins));
    const hist = new Array(k).fill(0);
    for (const n of nums) hist[hi === lo ? 0 : Math.min(k - 1, Math.floor(((n - lo) / (hi - lo)) * k))]++;
    p.hist = hist;
    p.histRange = [lo, hi];
  } else if (type === "date") {
    const ds = present.map((v) => String(v).trim()).sort((a, b) => Date.parse(a.replace(" ", "T")) - Date.parse(b.replace(" ", "T")));
    p.min = ds[0];
    p.max = ds[ds.length - 1];
  } else if (type === "boolean") {
    p.trueCount = present.filter((v) => v === true || /^(true|yes|y|t)$/i.test(String(v).trim())).length;
  }
  if (type === "string" || type === "date" || type === "boolean") {
    const lens = present.map((v) => String(v).length);
    p.minLen = lens.length ? Math.min(...lens) : 0;
    p.maxLen = lens.length ? Math.max(...lens) : 0;
    if (type === "string" && p.min === undefined && present.length) {
      const sorted = present.map(String).sort((a, b) => a.localeCompare(b));
      p.min = sorted[0];
      p.max = sorted[sorted.length - 1];
    }
  }
  return p;
}

export const fmtNum = (n: number | undefined, d = 2): string => {
  if (n === undefined || Number.isNaN(n)) return "";
  if (Number.isInteger(n)) return n.toLocaleString("en-US", { useGrouping: false });
  const a = Math.abs(n);
  if (a !== 0 && (a < 0.001 || a >= 1e12)) return n.toExponential(3);
  return String(Number(n.toFixed(d)));
};

/* ── export ────────────────────────────────────────────────────────────── */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function exportTable(header: string[], rows: Cell[][], fmt: string, o: { table?: string; types?: ColType[]; pretty?: boolean } = {}): { text: string; lang: "json" | "markdown" | "html" | "sql" | "text"; ext: string } {
  const types = o.types ?? header.map((_, i) => inferColType(rows.map((r) => r[i])));
  const typed = (v: Cell, i: number): Cell => {
    if (isEmpty(v)) return null;
    const t = types[i];
    if (t === "integer" || t === "float") return toNumber(v);
    if (t === "boolean") return v === true || /^(true|yes|y|t)$/i.test(String(v).trim());
    return v;
  };
  switch (fmt) {
    case "json": {
      const objs = rows.map((r) => Object.fromEntries(header.map((h, i) => [h, typed(r[i], i)])));
      return { text: JSON.stringify(objs, null, o.pretty === false ? 0 : 2), lang: "json", ext: "json" };
    }
    case "ndjson":
      return { text: rows.map((r) => JSON.stringify(Object.fromEntries(header.map((h, i) => [h, typed(r[i], i)])))).join("\n"), lang: "json", ext: "ndjson" };
    case "markdown": {
      const cellMd = (v: Cell) => (v == null ? "" : String(v).replace(/\|/g, "\\|").replace(/\n/g, "<br>"));
      const w = header.map((h, i) => Math.max(3, h.length, ...rows.map((r) => cellMd(r[i]).length)));
      const num = types.map((t) => t === "integer" || t === "float");
      const line = (cells: string[]) => "| " + cells.map((c, i) => (num[i] ? c.padStart(w[i]) : c.padEnd(w[i]))).join(" | ") + " |";
      return {
        text: [line(header), "| " + w.map((n, i) => (num[i] ? "-".repeat(n - 1) + ":" : "-".repeat(n))).join(" | ") + " |", ...rows.map((r) => line(r.map(cellMd)))].join("\n"),
        lang: "markdown",
        ext: "md",
      };
    }
    case "html": {
      const num = types.map((t) => t === "integer" || t === "float");
      const tr = (r: Cell[]) => "    <tr>" + r.map((v, i) => `<td${num[i] ? ' align="right"' : ""}>${v == null ? "" : esc(String(v))}</td>`).join("") + "</tr>";
      return {
        text: `<table>\n  <thead>\n    <tr>${header.map((h) => `<th>${esc(h)}</th>`).join("")}</tr>\n  </thead>\n  <tbody>\n${rows.map(tr).join("\n")}\n  </tbody>\n</table>`,
        lang: "html",
        ext: "html",
      };
    }
    case "tsv":
      return { text: [header, ...rows].map((r) => r.map((v) => (v == null ? "" : String(v).replace(/[\t\n\r]/g, " "))).join("\t")).join("\n"), lang: "text", ext: "tsv" };
    case "csv": {
      const q = (v: Cell) => {
        const s = v == null ? "" : String(v);
        return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      return { text: [header, ...rows].map((r) => r.map(q).join(",")).join("\n"), lang: "text", ext: "csv" };
    }
    case "sql": {
      const name = o.table || "data";
      const qi = (s: string) => (/^[A-Za-z_][\w]*$/.test(s) ? s : `"${s.replace(/"/g, '""')}"`);
      const sqlT = (t: ColType) => ({ integer: "INTEGER", float: "REAL", boolean: "BOOLEAN", date: "DATE", string: "TEXT", empty: "TEXT" })[t];
      const lit = (v: Cell, i: number) => {
        const x = typed(v, i);
        if (x == null) return "NULL";
        if (typeof x === "number") return String(x);
        if (typeof x === "boolean") return x ? "TRUE" : "FALSE";
        return `'${String(x).replace(/'/g, "''")}'`;
      };
      const ddl = `CREATE TABLE ${qi(name)} (\n${header.map((h, i) => `  ${qi(h)} ${sqlT(types[i])}`).join(",\n")}\n);`;
      const ins = rows.map((r) => `INSERT INTO ${qi(name)} (${header.map(qi).join(", ")}) VALUES (${r.map(lit).join(", ")});`);
      return { text: [ddl, "", ...ins].join("\n"), lang: "sql", ext: "sql" };
    }
    default: {
      // aligned plain text
      const s = (v: Cell) => (v == null ? "" : String(v).replace(/\n/g, " "));
      const w = header.map((h, i) => Math.max(h.length, ...rows.map((r) => s(r[i]).length)));
      const num = types.map((t) => t === "integer" || t === "float");
      const line = (cells: string[]) => cells.map((c, i) => (num[i] ? c.padStart(w[i]) : c.padEnd(w[i]))).join("  ").trimEnd();
      return { text: [line(header), w.map((n) => "─".repeat(n)).join("  "), ...rows.map((r) => line(r.map(s)))].join("\n"), lang: "text", ext: "txt" };
    }
  }
}

/* ── tiny inline charts (HTML/SVG strings, sanitised again on render) ─── */

export function sparkBars(hist: number[], w = 120, h = 28, color = "#0088b0"): string {
  const max = Math.max(1, ...hist);
  const bw = w / hist.length;
  const bars = hist
    .map((c, i) => {
      const bh = Math.max(c ? 1.5 : 0, (c / max) * (h - 2));
      return `<rect x="${(i * bw + 0.5).toFixed(2)}" y="${(h - bh).toFixed(2)}" width="${Math.max(1, bw - 1).toFixed(2)}" height="${bh.toFixed(2)}" rx="1" fill="${color}"/>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${bars}</svg>`;
}

export { esc as escapeHtml };
