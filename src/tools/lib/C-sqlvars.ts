/** Inline bind parameters into SQL: placeholder detection, value parsing (JSON, CSV, ORM logs) and typed literals. */

export type Style = "?" | "$1" | ":name" | "@name" | "%s" | "%(name)s" | "{name}";
export type Placeholder = { style: Style; start: number; end: number; key: string | number; text: string };
export type Val = { v: unknown; type: "string" | "number" | "boolean" | "null" | "date" | "timestamp" | "json" | "array" | "raw"; label?: string };

/** Scan SQL, skipping strings, quoted identifiers and comments. */
export function findPlaceholders(sql: string): Record<Style, Placeholder[]> {
  const res: Record<Style, Placeholder[]> = { "?": [], $1: [], ":name": [], "@name": [], "%s": [], "%(name)s": [], "{name}": [] };
  let i = 0, qCount = 0, sCount = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    if (c === "-" && sql[i + 1] === "-") { const e = sql.indexOf("\n", i); i = e < 0 ? n : e; continue; }
    if (c === "/" && sql[i + 1] === "*") { const e = sql.indexOf("*/", i + 2); i = e < 0 ? n : e + 2; continue; }
    if (c === "'" || c === '"' || c === "`") {
      let j = i + 1;
      for (; j < n; j++) {
        if (sql[j] === "\\" && c === "'") { j++; continue; }
        if (sql[j] === c) { if (sql[j + 1] === c) { j++; continue; } break; }
      }
      i = j + 1;
      continue;
    }
    if (c === "$" && /^\$[A-Za-z_]*\$/.test(sql.slice(i)) && !/^\$\d/.test(sql.slice(i))) {
      const tag = /^\$[A-Za-z_]*\$/.exec(sql.slice(i))![0];
      const e = sql.indexOf(tag, i + tag.length);
      i = e < 0 ? n : e + tag.length;
      continue;
    }
    let m: RegExpExecArray | null;
    const rest = sql.slice(i, i + 80);
    if (c === "?") {
      if ((m = /^\?(\d+)/.exec(rest))) { res["$1"].push({ style: "$1", start: i, end: i + m[0].length, key: +m[1], text: m[0] }); i += m[0].length; continue; }
      if (sql[i + 1] !== "|" && sql[i + 1] !== "&") res["?"].push({ style: "?", start: i, end: i + 1, key: qCount++, text: "?" });
      i++;
      continue;
    }
    if (c === "$" && (m = /^\$(\d+)/.exec(rest))) { res["$1"].push({ style: "$1", start: i, end: i + m[0].length, key: +m[1], text: m[0] }); i += m[0].length; continue; }
    if (c === ":" && sql[i - 1] !== ":" && sql[i + 1] !== ":" && sql[i + 1] !== "=" && (m = /^:([A-Za-z_][\w.]*)/.exec(rest)) && !/\w/.test(sql[i - 1] ?? "")) {
      res[":name"].push({ style: ":name", start: i, end: i + m[0].length, key: m[1], text: m[0] });
      i += m[0].length;
      continue;
    }
    if (c === "@" && sql[i + 1] !== "@" && sql[i - 1] !== "@" && (m = /^@([A-Za-z_][\w]*)/.exec(rest)) && !/\w/.test(sql[i - 1] ?? "")) {
      res["@name"].push({ style: "@name", start: i, end: i + m[0].length, key: m[1], text: m[0] });
      i += m[0].length;
      continue;
    }
    if (c === "%") {
      if ((m = /^%\(([A-Za-z_]\w*)\)s/.exec(rest))) { res["%(name)s"].push({ style: "%(name)s", start: i, end: i + m[0].length, key: m[1], text: m[0] }); i += m[0].length; continue; }
      if (/^%[sdf]/.test(rest)) { res["%s"].push({ style: "%s", start: i, end: i + 2, key: sCount++, text: rest.slice(0, 2) }); i += 2; continue; }
    }
    if (c === "{" && (m = /^\{([A-Za-z_]\w*|\d+)\}/.exec(rest))) {
      res["{name}"].push({ style: "{name}", start: i, end: i + m[0].length, key: /^\d+$/.test(m[1]) ? +m[1] : m[1], text: m[0] });
      i += m[0].length;
      continue;
    }
    i++;
  }
  return res;
}

export function detectStyle(found: Record<Style, Placeholder[]>): Style | null {
  const order: Style[] = ["%(name)s", "$1", "?", ":name", "@name", "%s", "{name}"];
  let best: Style | null = null;
  for (const s of order) if (found[s].length && (!best || found[s].length > found[best].length)) best = s;
  return best;
}

/* ── values ─────────────────────────────────────────────────────────── */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TS = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;

export function inferVal(v: unknown): Val {
  if (v === null || v === undefined) return { v: null, type: "null" };
  if (typeof v === "number") return { v, type: "number" };
  if (typeof v === "boolean") return { v, type: "boolean" };
  if (Array.isArray(v)) return { v, type: "array" };
  if (typeof v === "object") return { v, type: "json" };
  const s = String(v);
  if (ISO_DATE.test(s)) return { v: s, type: "date" };
  if (ISO_TS.test(s)) return { v: s, type: "timestamp" };
  return { v: s, type: "string" };
}

/** A bare token from CSV / log text: numbers, booleans, null, quoted strings. */
function tokenVal(tok: string): Val {
  const t = tok.trim();
  if (/^'.*'$/s.test(t)) return inferVal(t.slice(1, -1).replace(/''/g, "'"));
  if (/^".*"$/s.test(t)) return inferVal(t.slice(1, -1).replace(/\\"/g, '"'));
  if (/^(null|nil|none|<null>)$/i.test(t)) return { v: null, type: "null" };
  if (/^(true|false)$/i.test(t)) return { v: /^true$/i.test(t), type: "boolean" };
  if (/^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/.test(t) && t.length < 16) return { v: Number(t), type: "number" };
  return inferVal(t);
}

function splitCsv(s: string): string[] {
  const out: string[] = [];
  let cur = "", q = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      cur += c;
      if (c === q) { if (s[i + 1] === q) { cur += s[++i]; continue; } q = ""; }
      continue;
    }
    if (c === "'" || c === '"') { q = c; cur += c; continue; }
    if (c === "," || c === "\n") { out.push(cur); cur = ""; continue; }
    cur += c;
  }
  if (cur.trim() || out.length) out.push(cur);
  return out.map((x) => x.trim()).filter((x, k, a) => x !== "" || k < a.length - 1);
}

const TYPE_MAP: Record<string, Val["type"]> = {
  VARCHAR: "string", CHAR: "string", NVARCHAR: "string", LONGVARCHAR: "string", CLOB: "string", STRING: "string", TEXT: "string", UUID: "string", OTHER: "string",
  INTEGER: "number", INT: "number", BIGINT: "number", SMALLINT: "number", TINYINT: "number", LONG: "number", SHORT: "number", NUMERIC: "number", DECIMAL: "number", DOUBLE: "number", FLOAT: "number", REAL: "number", BIGDECIMAL: "number",
  BOOLEAN: "boolean", BIT: "boolean",
  DATE: "date", LOCALDATE: "date",
  TIMESTAMP: "timestamp", TIMESTAMP_WITH_TIMEZONE: "timestamp", LOCALDATETIME: "timestamp", INSTANT: "timestamp", OFFSETDATETIME: "timestamp", TIME: "string",
};

function typed(raw: string, type: string): Val {
  const T = type.toUpperCase().replace(/^JAVA\.\w+\./, "");
  if (/^(null|<null>)$/i.test(raw)) return { v: null, type: "null", label: type };
  const k = TYPE_MAP[T];
  if (k === "number") return { v: Number(raw), type: Number.isFinite(Number(raw)) ? "number" : "string", label: type };
  if (k === "boolean") return { v: /^(true|1)$/i.test(raw), type: "boolean", label: type };
  if (k === "date" || k === "timestamp") return { v: raw.replace(/\.0$/, ""), type: k, label: type };
  if (k === "string") return { v: raw, type: "string", label: type };
  return { ...tokenVal(raw), label: type };
}

export type ParsedValues = { positional: Val[]; named: Map<string, Val>; source: string; sql?: string };

export function parseValues(src: string): ParsedValues {
  const s = src.trim();
  const out: ParsedValues = { positional: [], named: new Map(), source: "none" };
  if (!s) return out;
  // MyBatis / JDBC log
  const prep = /Preparing:\s*(.+)/.exec(s);
  if (prep) out.sql = prep[1].trim();
  const mb = /Parameters:\s*(.*)$/m.exec(s);
  if (mb) {
    out.source = "MyBatis / JDBC log";
    const body = mb[1].trim();
    if (body) {
      const re = /\s*(?:(null)|(.*?)\(([\w.$]+)\))\s*(?:,|$)/gy;
      let m: RegExpExecArray | null;
      while (re.lastIndex < body.length && (m = re.exec(body))) {
        if (m[1]) out.positional.push({ v: null, type: "null" });
        else out.positional.push(typed(m[2], m[3]));
        if (m[0] === "") break;
      }
    }
    return out;
  }
  // Hibernate 5: binding parameter [1] as [VARCHAR] - [ada]; Hibernate 6: binding parameter (1:VARCHAR) <- [ada]
  const hb = [...s.matchAll(/binding parameter \[(\d+)\] as \[(\w+)\] - \[(.*?)\]\s*$/gm)];
  const hb6 = [...s.matchAll(/binding parameter \((\d+):(\w+)\) <- \[(.*?)\]\s*$/gm)];
  if (hb.length || hb6.length) {
    out.source = "Hibernate log";
    const h = /^Hibernate:\s*(.+)$/m.exec(s) ?? /^\s*(select|insert|update|delete)\b.*$/im.exec(s);
    if (h) out.sql = (h[1] && /^Hibernate/.test(h[0]) ? h[1] : h[0]).trim();
    for (const m of [...hb, ...hb6]) out.positional[+m[1] - 1] = typed(m[3], m[2]);
    for (let k = 0; k < out.positional.length; k++) if (!out.positional[k]) out.positional[k] = { v: null, type: "null" };
    return out;
  }
  // Rails: [["id", 1], ["email", "ada@example.com"]] (maybe after the SQL line)
  const rails = /(\[\[\s*"[^"]*",[\s\S]*\]\])\s*$/.exec(s);
  if (rails) {
    try {
      const arr = JSON.parse(rails[1].replace(/\bnil\b/g, "null")) as [string, unknown][];
      out.source = "Rails log";
      const sqlPart = s.slice(0, rails.index).replace(/^.*?\(\d+(\.\d+)?ms\)\s*/, "").trim();
      if (sqlPart) out.sql = sqlPart;
      for (const [k, v] of arr) {
        const val = inferVal(v);
        out.positional.push(val);
        out.named.set(k, val);
      }
      return out;
    } catch {
      /* fall through */
    }
  }
  // JSON
  if (/^[[{]/.test(s)) {
    try {
      const j = JSON.parse(s);
      if (Array.isArray(j)) {
        out.source = "JSON array";
        out.positional = j.map(inferVal);
      } else if (j && typeof j === "object") {
        out.source = "JSON object";
        for (const [k, v] of Object.entries(j)) {
          const val = inferVal(v);
          out.named.set(k, val);
          out.positional.push(val);
        }
      }
      return out;
    } catch {
      /* not JSON */
    }
  }
  // key=value / key: value lines
  const lines = s.split(/\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length && lines.every((l) => /^[:@$]?[A-Za-z_][\w.]*\s*[=:]\s*/.test(l))) {
    out.source = "name=value lines";
    for (const l of lines) {
      const m = /^[:@$]?([A-Za-z_][\w.]*)\s*[=:]\s*(.*)$/.exec(l)!;
      const v = tokenVal(m[2]);
      out.named.set(m[1], v);
      out.positional.push(v);
    }
    return out;
  }
  out.source = "comma-separated list";
  out.positional = splitCsv(s).map(tokenVal);
  return out;
}

/* ── literals ───────────────────────────────────────────────────────── */

export type Dialect = "generic" | "postgresql" | "mysql" | "sqlite" | "transactsql" | "plsql";

export function literal(val: Val, d: Dialect, inList = false): string {
  const str = (s: string) => {
    let e = s.replace(/'/g, "''");
    if (d === "mysql") e = e.replace(/\\/g, "\\\\");
    return d === "transactsql" && /[^\x00-\x7f]/.test(s) ? `N'${e}'` : `'${e}'`;
  };
  switch (val.type) {
    case "null": return "NULL";
    case "number": return String(val.v);
    case "boolean": return d === "postgresql" || d === "mysql" || d === "generic" ? (val.v ? "TRUE" : "FALSE") : val.v ? "1" : "0";
    case "date":
      if (d === "postgresql" || d === "generic" || d === "mysql") return `DATE ${str(String(val.v))}`;
      if (d === "plsql") return `DATE ${str(String(val.v))}`;
      return str(String(val.v));
    case "timestamp": {
      const t = String(val.v).replace("T", " ").replace(/Z$/, "");
      if (d === "postgresql" || d === "generic") return `${/(Z|[+-]\d{2}:?\d{2})$/.test(String(val.v)) && d === "postgresql" ? "TIMESTAMPTZ" : "TIMESTAMP"} ${str(String(val.v).replace("T", " "))}`;
      if (d === "plsql") return `TIMESTAMP ${str(t.replace(/[+-]\d{2}:?\d{2}$/, ""))}`;
      if (d === "transactsql") return str(String(val.v).replace(" ", "T").replace(/Z$/, ""));
      return str(t.replace(/[+-]\d{2}:?\d{2}$/, ""));
    }
    case "array": {
      const items = (val.v as unknown[]).map((x) => literal(inferVal(x), d));
      if (inList) return items.join(", ");
      return d === "postgresql" ? `ARRAY[${items.join(", ")}]` : `(${items.join(", ")})`;
    }
    case "json": return str(JSON.stringify(val.v)) + (d === "postgresql" ? "::jsonb" : "");
    case "raw": return String(val.v);
    default: return str(String(val.v));
  }
}
