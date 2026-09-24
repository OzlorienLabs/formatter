/**
 * JSON / CSV rows → SQL: per-column type inference with dialect-specific type
 * names, identifier quoting, literal escaping, CREATE / DROP and batched INSERTs.
 */
import { RX } from "./B-tabular";

export type Dialect = "mysql" | "postgres" | "sqlite" | "mssql" | "oracle";
export type Logical = "INTEGER" | "BIGINT" | "DECIMAL" | "BOOLEAN" | "DATE" | "TIMESTAMP" | "TEXT" | "JSON" | "NULL";

export type ColumnInfo = {
  name: string;
  sqlName: string;
  logical: Logical;
  sqlType: string;
  nullable: boolean;
  nonNull: number;
  distinct: number;
  maxLen: number;
  precision: number;
  scale: number;
  tz: boolean;
  pk: boolean;
  sample: string;
};

export type SqlOptions = {
  dialect: Dialect;
  table: string;
  create: boolean;
  drop: boolean;
  pk: boolean;
  batch: number;
  notNull: boolean;
  varchar: boolean;
  emptyNull: boolean;
  snake: boolean;
  /** Values come from text (CSV): "42" is a number, "true" a boolean. */
  fromText: boolean;
};

export const DIALECTS: [Dialect, string][] = [
  ["postgres", "PostgreSQL"],
  ["mysql", "MySQL"],
  ["sqlite", "SQLite"],
  ["mssql", "SQL Server"],
  ["oracle", "Oracle"],
];

const RESERVED = new Set(
  "add all alter and any as asc between by case check column constraint create cross current current_date current_time current_timestamp database default delete desc distinct drop else end exists false fetch for foreign from full grant group having in index inner insert intersect into is join key left like limit not null offset on or order outer primary references right select session_user set some table then to true union unique update user using values view when where with".split(" ")
);

export function quoteIdent(name: string, d: Dialect, force = true): string {
  const plain = /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && !RESERVED.has(name.toLowerCase());
  if (!force && plain) return name;
  switch (d) {
    case "mysql":
      return "`" + name.replace(/`/g, "``") + "`";
    case "mssql":
      return "[" + name.replace(/]/g, "]]") + "]";
    default:
      return '"' + name.replace(/"/g, '""') + '"';
  }
}

export function snakeCase(s: string) {
  return s
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase() || "col";
}

/* ── classification of individual values ─────────────────────────── */

type VKind = "null" | "int" | "dec" | "bool" | "date" | "ts" | "json" | "text";

function classify(v: unknown, o: SqlOptions): VKind {
  if (v === null || v === undefined) return "null";
  if (typeof v === "boolean") return "bool";
  if (typeof v === "number") return Number.isInteger(v) ? "int" : "dec";
  if (typeof v === "object") return "json";
  const s = String(v);
  if (s === "" && o.emptyNull) return "null";
  if (o.fromText) {
    if (/^[-+]?(0|[1-9]\d*)$/.test(s)) return "int";
    if (/^[-+]?(0|[1-9]\d*)\.\d+$/.test(s)) return "dec";
    if (/^(true|false)$/i.test(s)) return "bool";
  }
  if (RX.date.test(s)) return "date";
  if (RX.datetime.test(s)) return "ts";
  return "text";
}

function digits(v: unknown): { p: number; s: number } {
  const t = String(typeof v === "number" ? v : v).replace(/^[-+]/, "");
  if (/e/i.test(t)) return { p: 18, s: 6 };
  const [a, b = ""] = t.split(".");
  return { p: a.replace(/^0+(?=\d)/, "").length + b.length, s: b.length };
}

export function inferColumns(rows: Record<string, unknown>[], cols: string[], o: SqlOptions): ColumnInfo[] {
  const used = new Set<string>();
  return cols.map((name) => {
    const kinds = new Set<VKind>();
    let nonNull = 0, maxLen = 0, intDigits = 0, scale = 0, tz = false, bigint = false;
    const distinct = new Set<string>();
    let sample = "";
    for (const r of rows) {
      const v = r[name];
      const k = classify(v, o);
      if (k === "null") continue;
      nonNull++;
      kinds.add(k);
      const s = typeof v === "object" ? JSON.stringify(v) : String(v);
      if (!sample) sample = s.length > 40 ? s.slice(0, 37) + "…" : s;
      distinct.add(s);
      maxLen = Math.max(maxLen, [...s].length);
      if (k === "int") {
        const n = Number(v);
        if (!Number.isSafeInteger(n) || n > 2147483647 || n < -2147483648) bigint = true;
        intDigits = Math.max(intDigits, digits(v).p);
      }
      if (k === "dec") {
        const d = digits(v);
        intDigits = Math.max(intDigits, d.p - d.s);
        scale = Math.max(scale, d.s);
      }
      if (k === "ts" && /(Z|[+-]\d{2}:?\d{2})$/.test(s)) tz = true;
    }
    let logical: Logical;
    const only = (...ks: VKind[]) => [...kinds].every((k) => ks.includes(k));
    if (!kinds.size) logical = "NULL";
    else if (only("bool")) logical = "BOOLEAN";
    else if (only("int")) logical = bigint ? "BIGINT" : "INTEGER";
    else if (only("int", "dec")) logical = "DECIMAL";
    else if (only("date")) logical = "DATE";
    else if (only("date", "ts")) logical = "TIMESTAMP";
    else if (only("json")) logical = "JSON";
    else logical = "TEXT";
    let sqlName = o.snake ? snakeCase(name) : name;
    const base = sqlName;
    for (let i = 2; used.has(sqlName.toLowerCase()); i++) sqlName = `${base}_${i}`;
    used.add(sqlName.toLowerCase());
    const precision = Math.min(38, Math.max(intDigits + scale, scale + 1, 10));
    const col: ColumnInfo = {
      name,
      sqlName,
      logical,
      sqlType: "",
      nullable: nonNull < rows.length,
      nonNull,
      distinct: distinct.size,
      maxLen,
      precision,
      scale: Math.min(scale, 18),
      tz,
      pk: false,
      sample,
    };
    col.sqlType = sqlType(col, o);
    return col;
  });
}

function varchar(len: number) {
  for (const n of [16, 32, 64, 128, 255, 512, 1024, 4000]) if (len <= n) return n;
  return 0;
}

export function sqlType(c: ColumnInfo, o: SqlOptions): string {
  const d = o.dialect;
  const dec = `(${c.precision},${c.scale})`;
  const vlen = o.varchar ? varchar(c.maxLen) : 0;
  switch (c.logical) {
    case "INTEGER":
      return { mysql: "INT", postgres: "INTEGER", sqlite: "INTEGER", mssql: "INT", oracle: "NUMBER(10)" }[d];
    case "BIGINT":
      return { mysql: "BIGINT", postgres: "BIGINT", sqlite: "INTEGER", mssql: "BIGINT", oracle: "NUMBER(19)" }[d];
    case "DECIMAL":
      return { mysql: `DECIMAL${dec}`, postgres: `NUMERIC${dec}`, sqlite: "REAL", mssql: `DECIMAL${dec}`, oracle: `NUMBER${dec}` }[d];
    case "BOOLEAN":
      return { mysql: "BOOLEAN", postgres: "BOOLEAN", sqlite: "INTEGER", mssql: "BIT", oracle: "NUMBER(1)" }[d];
    case "DATE":
      return { mysql: "DATE", postgres: "DATE", sqlite: "TEXT", mssql: "DATE", oracle: "DATE" }[d];
    case "TIMESTAMP":
      return {
        mysql: "DATETIME",
        postgres: c.tz ? "TIMESTAMPTZ" : "TIMESTAMP",
        sqlite: "TEXT",
        mssql: c.tz ? "DATETIMEOFFSET" : "DATETIME2",
        oracle: c.tz ? "TIMESTAMP WITH TIME ZONE" : "TIMESTAMP",
      }[d];
    case "JSON":
      return { mysql: "JSON", postgres: "JSONB", sqlite: "TEXT", mssql: "NVARCHAR(MAX)", oracle: "CLOB" }[d];
    default:
      if (d === "sqlite") return "TEXT";
      if (d === "postgres") return vlen ? `VARCHAR(${vlen})` : "TEXT";
      if (d === "mysql") return vlen && vlen <= 1024 ? `VARCHAR(${vlen})` : "TEXT";
      if (d === "mssql") return vlen ? `NVARCHAR(${vlen})` : "NVARCHAR(MAX)";
      if (c.logical === "NULL") return "VARCHAR2(255)";
      return c.maxLen > 4000 ? "CLOB" : `VARCHAR2(${vlen || 4000})`;
  }
}

/* ── literals ─────────────────────────────────────────────────────── */

function strLit(s: string, d: Dialect): string {
  s = s.replace(/\0/g, "");
  let body = s.replace(/'/g, "''");
  if (d === "mysql") body = body.replace(/\\/g, "\\\\");
  return (d === "mssql" && /[^\x00-\x7f]/.test(s) ? "N'" : "'") + body + "'";
}

export function literal(v: unknown, c: ColumnInfo, o: SqlOptions): string {
  const d = o.dialect;
  if (v === null || v === undefined || (v === "" && o.emptyNull)) return "NULL";
  switch (c.logical) {
    case "BOOLEAN": {
      const b = typeof v === "boolean" ? v : /^true$/i.test(String(v));
      return d === "postgres" || d === "mysql" ? (b ? "TRUE" : "FALSE") : b ? "1" : "0";
    }
    case "INTEGER":
    case "BIGINT":
    case "DECIMAL":
      return String(v).replace(/^\+/, "");
    case "DATE":
      return d === "oracle" ? `DATE ${strLit(String(v), d)}` : strLit(String(v), d);
    case "TIMESTAMP": {
      let s = String(v);
      if (d === "mysql") {
        // MySQL DATETIME has no zone: normalise to UTC wall time.
        const t = /(Z|[+-]\d{2}:?\d{2})$/.test(s) ? new Date(s) : null;
        s = t && !Number.isNaN(t.getTime()) ? t.toISOString().slice(0, 19).replace("T", " ") : s.replace("T", " ");
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += " 00:00:00";
        return strLit(s, d);
      }
      if (d === "oracle") {
        s = s.replace("T", " ").replace(/Z$/, " +00:00");
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += " 00:00:00";
        return `TIMESTAMP ${strLit(s, d)}`;
      }
      return strLit(s, d);
    }
    case "JSON": {
      const s = typeof v === "string" ? v : JSON.stringify(v);
      return strLit(s, d);
    }
    default:
      return strLit(typeof v === "object" ? JSON.stringify(v) : String(v), d);
  }
}

/* ── statements ───────────────────────────────────────────────────── */

export function buildSql(rows: Record<string, unknown>[], cols: string[], o: SqlOptions): { sql: string; columns: ColumnInfo[]; notes: string[] } {
  const d = o.dialect;
  const notes: string[] = [];
  const columns = inferColumns(rows, cols, o);
  const q = (s: string) => quoteIdent(s, d);
  const table = o.table.trim() || "data";
  const tq = table.split(".").map(q).join(".");
  if (o.pk) {
    const id = columns.find((c) => c.name.toLowerCase() === "id") ?? columns.find((c) => /^(\w+_id|\w+Id)$/.test(c.name) && c.name.toLowerCase().replace(/_?id$/, "") === table.toLowerCase().replace(/s$/, ""));
    if (id && id.nonNull === rows.length && id.distinct === rows.length) id.pk = true;
    else if (id) notes.push(`"${id.name}" has nulls or duplicates, so it is not made the primary key.`);
    else notes.push("No id column found for a primary key.");
  }
  const out: string[] = [];
  if (o.drop) {
    if (d === "oracle")
      out.push(`BEGIN\n  EXECUTE IMMEDIATE 'DROP TABLE ${tq.replace(/'/g, "''")}';\nEXCEPTION\n  WHEN OTHERS THEN\n    IF SQLCODE != -942 THEN RAISE; END IF;\nEND;\n/`);
    else out.push(`DROP TABLE IF EXISTS ${tq};`);
  }
  if (o.create) {
    const width = Math.max(...columns.map((c) => q(c.sqlName).length));
    const defs = columns.map((c) => {
      const parts = [q(c.sqlName).padEnd(width), c.sqlType];
      if (c.pk) parts.push("PRIMARY KEY");
      else if (o.notNull && !c.nullable) parts.push("NOT NULL");
      if (c.logical === "JSON" && d === "sqlite") parts.push(`CHECK (json_valid(${q(c.sqlName)}))`);
      if (c.logical === "JSON" && d === "oracle") parts.push(`CHECK (${q(c.sqlName)} IS JSON)`);
      if (c.logical === "JSON" && d === "mssql") parts.push(`CHECK (ISJSON(${q(c.sqlName)}) = 1)`);
      return "  " + parts.join(" ");
    });
    out.push(`CREATE TABLE ${o.drop || d === "oracle" || d === "mssql" ? "" : "IF NOT EXISTS "}${tq} (\n${defs.join(",\n")}\n);`);
  }
  const colList = columns.map((c) => q(c.sqlName)).join(", ");
  const tuples = rows.map((r) => "(" + columns.map((c) => literal(r[c.name], c, o)).join(", ") + ")");
  const batch = Math.max(1, Math.floor(o.batch) || 1);
  const maxBatch = d === "mssql" ? Math.min(batch, 1000) : batch;
  if (d === "mssql" && batch > 1000) notes.push("SQL Server allows at most 1000 rows per VALUES list; batches are capped at 1000.");
  for (let i = 0; i < tuples.length; i += maxBatch) {
    const chunk = tuples.slice(i, i + maxBatch);
    if (chunk.length === 1) out.push(`INSERT INTO ${tq} (${colList}) VALUES ${chunk[0]};`);
    else if (d === "oracle") out.push(`INSERT ALL\n${chunk.map((t) => `  INTO ${tq} (${colList}) VALUES ${t}`).join("\n")}\nSELECT 1 FROM DUAL;`);
    else out.push(`INSERT INTO ${tq} (${colList}) VALUES\n  ${chunk.join(",\n  ")};`);
  }
  if (d === "mssql" && columns.some((c) => c.logical === "BOOLEAN")) notes.push("SQL Server has no boolean type: BIT columns store 1 and 0.");
  if (d === "sqlite" && columns.some((c) => ["DATE", "TIMESTAMP"].includes(c.logical))) notes.push("SQLite stores dates as ISO-8601 TEXT.");
  if (d === "mysql" && columns.some((c) => c.logical === "TIMESTAMP" && c.tz)) notes.push("MySQL DATETIME has no time zone — zoned timestamps were converted to UTC.");
  return { sql: out.join("\n\n") + "\n", columns, notes };
}
