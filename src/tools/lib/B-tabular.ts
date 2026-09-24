/**
 * Tabular helpers shared by the JSON ⇄ CSV converters, the SQL generators and
 * the CSV validator: flattening nested records to dot-path columns (and back),
 * CSV serialisation, and value-type inference for text cells.
 */

export type Row = Record<string, unknown>;
export type ArrayMode = "join" | "json" | "explode" | "columns";

const isPlainObject = (v: unknown): v is Row => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * Flatten one record. Nested objects become `a.b.c` columns when `flatten` is
 * on (otherwise they are JSON strings). Arrays follow `arrays`:
 *  - join: primitives joined with `sep`, objects as JSON
 *  - json: the whole array as a JSON string
 *  - columns: one column per index, `tags.0`, `tags.1`, …
 *  - explode: handled by `explodeRecord` before flattening; here arrays are left for it.
 */
export function flattenRecord(rec: unknown, o: { flatten: boolean; arrays: ArrayMode; sep?: string }): Row {
  const out: Row = {};
  const sep = o.sep ?? "; ";
  const put = (path: string, v: unknown) => {
    if (Array.isArray(v)) {
      if (o.arrays === "columns") {
        if (!v.length) out[path] = "";
        v.forEach((x, i) => put(`${path}.${i}`, x));
      } else if (o.arrays === "json") out[path] = JSON.stringify(v);
      else out[path] = v.every((x) => x === null || typeof x !== "object") ? v.map((x) => (x === null ? "" : String(x))).join(sep) : v.map((x) => (x !== null && typeof x === "object" ? JSON.stringify(x) : String(x))).join(sep);
      return;
    }
    if (isPlainObject(v)) {
      if (!o.flatten) {
        out[path] = JSON.stringify(v);
        return;
      }
      const keys = Object.keys(v);
      if (!keys.length) out[path] = "";
      for (const k of keys) put(path ? `${path}.${k}` : k, v[k]);
      return;
    }
    out[path] = v;
  };
  if (isPlainObject(rec)) for (const k of Object.keys(rec)) put(k, rec[k]);
  else put("value", rec);
  return out;
}

/**
 * Explode arrays into rows: a record with `items: [a, b]` becomes two records,
 * one with `items: a` and one with `items: b`. Several arrays multiply (a
 * cartesian product), capped to keep the output sane.
 */
export function explodeRecord(rec: unknown, flatten: boolean, cap = 10_000): unknown[] {
  if (!isPlainObject(rec)) return Array.isArray(rec) ? rec : [rec];
  let rows: Row[] = [{}];
  for (const [k, v] of Object.entries(rec)) {
    let variants: unknown[];
    // Only arrays of objects are exploded; arrays of plain values stay together (and are joined later).
    if (Array.isArray(v) && v.some(isPlainObject)) variants = v.flatMap((x) => (isPlainObject(x) && flatten ? explodeRecord(x, flatten, cap) : [x]));
    else if (Array.isArray(v) && !v.length) variants = [null];
    else if (isPlainObject(v) && flatten) variants = explodeRecord(v, flatten, cap);
    else variants = [v];
    const next: Row[] = [];
    for (const r of rows) for (const x of variants) {
      if (next.length >= cap) break;
      next.push({ ...r, [k]: x });
    }
    rows = next;
  }
  return rows;
}

/** Rebuild nested objects from `a.b.c` keys (numeric segments become array indices). */
export function unflattenRecord(rec: Row): Row {
  const out: Row = {};
  for (const [key, v] of Object.entries(rec)) {
    if (!key.includes(".")) {
      if (!(key in out) || !isPlainObject(out[key])) out[key] = v;
      continue;
    }
    const parts = key.split(".");
    let cur: Record<string, unknown> | unknown[] = out;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      const last = i === parts.length - 1;
      const k: string | number = Array.isArray(cur) ? Number(p) : p;
      if (last) {
        (cur as Record<string, unknown>)[k as string] = v;
      } else {
        const nextIsIndex = /^\d+$/.test(parts[i + 1]);
        let child = (cur as Record<string, unknown>)[k as string];
        if (child === undefined || child === null || typeof child !== "object") {
          child = nextIsIndex ? [] : {};
          (cur as Record<string, unknown>)[k as string] = child;
        }
        cur = child as Record<string, unknown> | unknown[];
      }
    }
  }
  return out;
}

/** Columns in first-seen order across all rows (or sorted). */
export function columnsOf(rows: Row[], order: "first" | "sorted" = "first"): string[] {
  const seen = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r)) seen.add(k);
  const cols = [...seen];
  return order === "sorted" ? cols.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) : cols;
}

export function csvCell(v: unknown, delim: string, quoteAll: boolean): string {
  const s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  if (quoteAll || s.includes(delim) || /["\r\n]/.test(s) || /^\s|\s$/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(cols: string[], rows: Row[], o: { delim: string; quoteAll: boolean; header: boolean; eol: string }): string {
  const lines: string[] = [];
  if (o.header) lines.push(cols.map((c) => csvCell(c, o.delim, o.quoteAll)).join(o.delim));
  for (const r of rows) lines.push(cols.map((c) => csvCell(r[c], o.delim, o.quoteAll)).join(o.delim));
  return lines.join(o.eol);
}

/* ── typing of text cells ─────────────────────────────────────────── */

export const RX = {
  int: /^[-+]?(0|[1-9]\d*)$/,
  num: /^[-+]?(0|[1-9]\d*)?(\.\d+)?([eE][-+]?\d+)?$/,
  bool: /^(true|false)$/i,
  date: /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/,
  datetime: /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/,
  email: /^[^\s@,;]+@[^\s@,;]+\.[A-Za-z]{2,}$/,
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  url: /^https?:\/\/[^\s]+$/i,
};

export function isNumText(s: string) {
  return s !== "" && s !== "+" && s !== "-" && s !== "." && RX.num.test(s) && /\d/.test(s);
}

/** Convert a CSV cell into a JSON value: numbers (without leading zeros), booleans, null. */
export function typeCell(s: string, emptyAs: "string" | "null"): unknown {
  if (s === "") return emptyAs === "null" ? null : "";
  if (RX.int.test(s)) {
    const n = Number(s);
    return Number.isSafeInteger(n) ? n : s;
  }
  if (isNumText(s) && !/^[-+]?0\d/.test(s)) return Number(s);
  if (s === "true" || s === "TRUE" || s === "True") return true;
  if (s === "false" || s === "FALSE" || s === "False") return false;
  if (s === "null" || s === "NULL") return null;
  return s;
}

export type CellKind = "empty" | "integer" | "number" | "boolean" | "date" | "datetime" | "email" | "uuid" | "url" | "text";

export function kindOfText(s: string): CellKind {
  const t = s.trim();
  if (t === "") return "empty";
  if (RX.int.test(t)) return "integer";
  if (isNumText(t)) return "number";
  if (RX.bool.test(t)) return "boolean";
  if (RX.date.test(t)) return "date";
  if (RX.datetime.test(t)) return "datetime";
  if (RX.uuid.test(t)) return "uuid";
  if (RX.email.test(t)) return "email";
  if (RX.url.test(t)) return "url";
  return "text";
}

/** Does a value of kind `k` satisfy a column inferred as `col`? */
export function kindFits(k: CellKind, col: CellKind) {
  if (k === "empty" || k === col || col === "text") return true;
  if (col === "number" && k === "integer") return true;
  if (col === "datetime" && k === "date") return true;
  return false;
}

/** Infer a column kind from its text values: the most specific kind ≥ 80% of the non-empty cells share. */
export function inferColumnKind(values: string[]): { kind: CellKind; counts: Partial<Record<CellKind, number>> } {
  const counts: Partial<Record<CellKind, number>> = {};
  let n = 0;
  for (const v of values) {
    const k = kindOfText(v);
    counts[k] = (counts[k] ?? 0) + 1;
    if (k !== "empty") n++;
  }
  if (!n) return { kind: "empty", counts };
  const c = (k: CellKind) => counts[k] ?? 0;
  const candidates: [CellKind, number][] = [
    ["integer", c("integer")],
    ["number", c("integer") + c("number")],
    ["boolean", c("boolean")],
    ["date", c("date")],
    ["datetime", c("date") + c("datetime")],
    ["uuid", c("uuid")],
    ["email", c("email")],
    ["url", c("url")],
  ];
  for (const [k, m] of candidates) if (m / n >= 0.8 && m >= Math.min(n, 2)) return { kind: k, counts };
  return { kind: "text", counts };
}
