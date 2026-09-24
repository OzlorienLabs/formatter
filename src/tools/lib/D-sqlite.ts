/**
 * sql.js (SQLite compiled to WebAssembly), shared by the SQL & Data tools.
 * Browser: the self-hosted build under /vendor/sqljs. Node (unit tests): the
 * package straight from node_modules. The runtime is loaded once and cached.
 */
import type { Database, QueryExecResult, SqlJsStatic } from "sql.js";
import { isNode, loadScript } from "./vendor";
import { ToolError } from "../types";

let sqlP: Promise<SqlJsStatic> | null = null;

export function getSqlJs(): Promise<SqlJsStatic> {
  if (!sqlP) {
    sqlP = (async () => {
      if (isNode) {
        const mod = (await import(/* webpackIgnore: true */ "sql.js" as string)) as { default: (c?: object) => Promise<SqlJsStatic> };
        return mod.default();
      }
      await loadScript("/vendor/sqljs/sql-wasm.js");
      const init = (window as unknown as { initSqlJs?: (c: object) => Promise<SqlJsStatic> }).initSqlJs;
      if (!init) throw new ToolError("The SQLite runtime did not load. Reload once while online to cache it.");
      return init({ locateFile: () => "/vendor/sqljs/sql-wasm-browser.wasm" });
    })();
    sqlP.catch(() => (sqlP = null));
  }
  return sqlP;
}

export type Cell = string | number | boolean | null;

export type StmtResult = {
  sql: string;
  /** 1-based line where the statement starts. */
  line: number;
  columns: string[];
  rows: Cell[][];
  /** For statements without a result set. */
  changes?: number;
  ms: number;
};

const cell = (v: unknown): Cell => {
  if (v == null) return null;
  if (v instanceof Uint8Array) return `x'${Array.from(v.slice(0, 32), (b) => b.toString(16).padStart(2, "0")).join("")}${v.length > 32 ? "…" : ""}' (${v.length} B)`;
  return v as Cell;
};

/** Splits a script into statements, respecting quotes, comments and BEGIN…END (triggers). */
export function splitStatements(src: string): { sql: string; line: number }[] {
  const out: { sql: string; line: number }[] = [];
  let start = 0;
  let depth = 0; // BEGIN…END nesting inside CREATE TRIGGER
  let i = 0;
  const n = src.length;
  const push = (end: number) => {
    const raw = src.slice(start, end);
    const trimmed = raw.replace(/^(\s|--[^\n]*\n?|\/\*[\s\S]*?\*\/)+/, "");
    if (trimmed.trim()) {
      const lead = raw.length - trimmed.length;
      const line = src.slice(0, start + lead).split("\n").length;
      out.push({ sql: trimmed.trim(), line });
    }
  };
  while (i < n) {
    const c = src[i];
    if (c === "-" && src[i + 1] === "-") {
      const e = src.indexOf("\n", i);
      i = e < 0 ? n : e + 1;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const e = src.indexOf("*/", i + 2);
      i = e < 0 ? n : e + 2;
      continue;
    }
    if (c === "'" || c === '"' || c === "`" || c === "[") {
      const close = c === "[" ? "]" : c;
      let j = i + 1;
      while (j < n) {
        if (src[j] === close) {
          if (close !== "]" && src[j + 1] === close) {
            j += 2;
            continue;
          }
          break;
        }
        j++;
      }
      i = j + 1;
      continue;
    }
    if (/[A-Za-z]/.test(c) && (i === 0 || !/[\w$]/.test(src[i - 1]))) {
      const m = /^[A-Za-z_]+/.exec(src.slice(i, i + 12));
      const w = m ? m[0].toUpperCase() : "";
      const head = src.slice(start, i).toUpperCase();
      if (w === "BEGIN" && /CREATE\s+(TEMP\w*\s+)?TRIGGER/.test(head)) depth++;
      else if (w === "CASE" && depth > 0) depth++;
      else if (w === "END" && depth > 0) depth--;
      i += w.length || 1;
      continue;
    }
    if (c === ";" && depth === 0) {
      push(i);
      start = i + 1;
    }
    i++;
  }
  push(n);
  return out;
}

/** Runs each statement and collects its result; errors carry the statement's line. */
export function execScript(db: Database, script: string, o: { maxRows?: number } = {}): StmtResult[] {
  const results: StmtResult[] = [];
  const max = o.maxRows ?? 5000;
  for (const st of splitStatements(script)) {
    const t0 = performance.now();
    let stmt;
    try {
      stmt = db.prepare(st.sql);
    } catch (e) {
      throw new ToolError(`Line ${st.line}: ${(e as Error).message}\n  ${st.sql.split("\n")[0].slice(0, 120)}`);
    }
    try {
      const columns = stmt.getColumnNames();
      const rows: Cell[][] = [];
      let total = 0;
      while (stmt.step()) {
        total++;
        if (rows.length < max) rows.push(stmt.get().map(cell));
      }
      const ms = performance.now() - t0;
      if (columns.length) results.push({ sql: st.sql, line: st.line, columns, rows, ms, changes: total > max ? total : undefined });
      else results.push({ sql: st.sql, line: st.line, columns: [], rows: [], changes: db.getRowsModified(), ms });
    } catch (e) {
      throw new ToolError(`Line ${st.line}: ${(e as Error).message}\n  ${st.sql.split("\n")[0].slice(0, 120)}`);
    } finally {
      stmt.free();
    }
  }
  return results;
}

export function execFirst(db: Database, sql: string): QueryExecResult | undefined {
  return db.exec(sql)[0];
}

/* ── loading tabular data into a table ───────────────────────────────── */

export type SqlType = "INTEGER" | "REAL" | "TEXT" | "BOOLEAN" | "DATE" | "DATETIME";

export const quoteIdent = (s: string) => `"${s.replace(/"/g, '""')}"`;

export function sqlIdent(s: string, fallback = "col"): string {
  const t = s.trim().replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "");
  if (!t) return fallback;
  return /^\d/.test(t) ? `_${t}` : t;
}

const INT_RE = /^[+-]?\d{1,15}$/;
const REAL_RE = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DT_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;
const BOOL_RE = /^(true|false)$/i;

/** Infers an SQLite column type from string cells (empty cells are ignored). */
export function inferSqlType(values: (string | null | undefined)[]): SqlType {
  let seen = 0;
  let int = true, real = true, bool = true, date = true, dt = true;
  for (const raw of values) {
    if (raw == null) continue;
    const v = String(raw).trim();
    if (!v) continue;
    seen++;
    if (int && !INT_RE.test(v)) int = false;
    if (real && !REAL_RE.test(v)) real = false;
    if (bool && !BOOL_RE.test(v)) bool = false;
    if (date && !DATE_RE.test(v)) date = false;
    if (dt && !DT_RE.test(v)) dt = false;
    if (!int && !real && !bool && !date && !dt) break;
  }
  if (!seen) return "TEXT";
  if (int) return "INTEGER";
  if (real) return "REAL";
  if (bool) return "BOOLEAN";
  if (date) return "DATE";
  if (dt) return "DATETIME";
  return "TEXT";
}

export function coerce(v: unknown, t: SqlType): Cell {
  if (v == null) return null;
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "object") return JSON.stringify(v);
  const s = String(v);
  if (s.trim() === "") return null;
  if (t === "INTEGER") return parseInt(s, 10);
  if (t === "REAL") return parseFloat(s);
  if (t === "BOOLEAN") return /^true$/i.test(s.trim()) ? 1 : 0;
  return s;
}

export type LoadedTable = { name: string; columns: { name: string; type: SqlType }[]; rows: number; ddl: string };

/** Creates `name` and inserts `rows` (objects keyed by header) with inferred column types. */
export function loadTable(db: Database, name: string, header: string[], rows: Record<string, unknown>[] | unknown[][]): LoadedTable {
  const used = new Set<string>();
  const cols = header.map((h, i) => {
    let c = sqlIdent(h, `col${i + 1}`);
    let k = 2;
    while (used.has(c.toLowerCase())) c = `${sqlIdent(h, `col${i + 1}`)}_${k++}`;
    used.add(c.toLowerCase());
    return c;
  });
  const getter = (r: unknown, i: number) => (Array.isArray(r) ? r[i] : (r as Record<string, unknown>)[header[i]]);
  const types = header.map((_, i) => {
    const vals = (rows as unknown[]).map((r) => getter(r, i));
    if (vals.every((v) => v == null || typeof v === "number")) return vals.some((v) => typeof v === "number" && !Number.isInteger(v)) ? "REAL" : vals.some((v) => typeof v === "number") ? "INTEGER" : "TEXT";
    if (vals.every((v) => v == null || typeof v === "boolean")) return vals.some((v) => v != null) ? "BOOLEAN" : "TEXT";
    return inferSqlType(vals.map((v) => (v == null ? null : typeof v === "object" ? "{}" : String(v))));
  }) as SqlType[];
  const ddl = `CREATE TABLE ${quoteIdent(name)} (\n${cols.map((c, i) => `  ${quoteIdent(c)} ${types[i]}`).join(",\n")}\n);`;
  db.run(`DROP TABLE IF EXISTS ${quoteIdent(name)}`);
  db.run(ddl);
  if (rows.length) {
    const stmt = db.prepare(`INSERT INTO ${quoteIdent(name)} VALUES (${cols.map(() => "?").join(",")})`);
    db.run("BEGIN");
    try {
      for (const r of rows as unknown[]) stmt.run(header.map((_, i) => coerce(getter(r, i), types[i])) as never);
      db.run("COMMIT");
    } catch (e) {
      db.run("ROLLBACK");
      throw e;
    } finally {
      stmt.free();
    }
  }
  return { name, columns: cols.map((c, i) => ({ name: c, type: types[i] })), rows: rows.length, ddl };
}

/* ── output helpers ───────────────────────────────────────────────────── */

export function toCsv(columns: string[], rows: Cell[][], sep = ","): string {
  const q = (v: Cell) => {
    if (v == null) return "";
    const s = String(v);
    return s.includes(sep) || /["\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.map((c) => q(c)).join(sep), ...rows.map((r) => r.map(q).join(sep))].join("\n");
}

export function toJsonRows(columns: string[], rows: Cell[][]): Record<string, Cell>[] {
  return rows.map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i]])));
}

/** A fixed-width text table like the sqlite3 shell's `.mode box`-lite. */
export function asciiTable(columns: string[], rows: Cell[][], maxRows = 200): string {
  const shown = rows.slice(0, maxRows);
  const str = (v: Cell) => (v == null ? "NULL" : String(v).replace(/\n/g, "↵"));
  const w = columns.map((c, i) => Math.min(60, Math.max(c.length, ...shown.map((r) => str(r[i]).length))));
  const fit = (s: string, n: number, right: boolean) => (s.length > n ? s.slice(0, n - 1) + "…" : right ? s.padStart(n) : s.padEnd(n));
  const line = "+" + w.map((n) => "-".repeat(n + 2)).join("+") + "+";
  const out = [line, "| " + columns.map((c, i) => fit(c, w[i], false)).join(" | ") + " |", line];
  for (const r of shown) out.push("| " + r.map((v, i) => fit(str(v), w[i], typeof v === "number")).join(" | ") + " |");
  out.push(line);
  if (rows.length > maxRows) out.push(`… ${rows.length - maxRows} more row(s)`);
  return out.join("\n");
}

export type { Database, SqlJsStatic };
