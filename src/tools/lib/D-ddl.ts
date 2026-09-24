/**
 * A forgiving CREATE TABLE / ALTER TABLE parser for MySQL, PostgreSQL, SQLite
 * and SQL Server DDL, plus a Mermaid erDiagram emitter.
 */
import { ToolError } from "../types";

export type Column = {
  name: string;
  type: string;
  nullable: boolean;
  pk: boolean;
  unique: boolean;
  fk?: { table: string; column: string };
  default?: string;
  check?: string;
  auto?: boolean;
  comment?: string;
};

export type ForeignKey = { name?: string; columns: string[]; refTable: string; refColumns: string[]; onDelete?: string; onUpdate?: string; line: number };

export type TableDef = {
  name: string; // qualified, e.g. sales.orders
  schema?: string;
  short: string;
  columns: Column[];
  pk: string[];
  uniques: string[][];
  fks: ForeignKey[];
  checks: string[];
  comment?: string;
  line: number;
};

type Tok = { t: "id" | "qid" | "str" | "num" | "p" | "op"; v: string; line: number };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0, line = 1;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === "\n") { line++; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if ((c === "-" && src[i + 1] === "-") || c === "#") {
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const e = src.indexOf("*/", i + 2);
      const end = e < 0 ? n : e + 2;
      line += (src.slice(i, end).match(/\n/g) ?? []).length;
      i = end;
      continue;
    }
    if (c === "'" || (c === "N" && src[i + 1] === "'") || (c === "E" && src[i + 1] === "'")) {
      let j = c === "'" ? i + 1 : i + 2;
      let v = "";
      while (j < n) {
        if (src[j] === "\\" && c === "E") { v += src[j + 1]; j += 2; continue; }
        if (src[j] === "'") {
          if (src[j + 1] === "'") { v += "'"; j += 2; continue; }
          break;
        }
        if (src[j] === "\n") line++;
        v += src[j++];
      }
      out.push({ t: "str", v, line });
      i = j + 1;
      continue;
    }
    if (c === "$" && /\$[A-Za-z_]*\$/.test(src.slice(i, i + 20))) {
      const tag = /^\$[A-Za-z_]*\$/.exec(src.slice(i))![0];
      const e = src.indexOf(tag, i + tag.length);
      const end = e < 0 ? n : e + tag.length;
      out.push({ t: "str", v: src.slice(i + tag.length, e < 0 ? n : e), line });
      line += (src.slice(i, end).match(/\n/g) ?? []).length;
      i = end;
      continue;
    }
    if (c === '"' || c === "`" || c === "[") {
      const close = c === "[" ? "]" : c;
      let j = i + 1, v = "";
      while (j < n) {
        if (src[j] === close) {
          if (close !== "]" && src[j + 1] === close) { v += close; j += 2; continue; }
          break;
        }
        v += src[j++];
      }
      out.push({ t: "qid", v, line });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z_À-￿]/.test(c)) {
      let j = i + 1;
      while (j < n && /[\w$À-￿]/.test(src[j])) j++;
      out.push({ t: "id", v: src.slice(i, j), line });
      i = j;
      continue;
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      let j = i + 1;
      while (j < n && /[0-9.eE]/.test(src[j])) j++;
      out.push({ t: "num", v: src.slice(i, j), line });
      i = j;
      continue;
    }
    if ("(),;.".includes(c)) { out.push({ t: "p", v: c, line }); i++; continue; }
    const two = src.slice(i, i + 2);
    if (["::", ">=", "<=", "<>", "!=", "||", "->"].includes(two)) { out.push({ t: "op", v: two === "->" && src[i + 2] === ">" ? "->>" : two, line }); i += two === "->" && src[i + 2] === ">" ? 3 : 2; continue; }
    out.push({ t: "op", v: c, line });
    i++;
  }
  return out;
}

const up = (t?: Tok) => (t && t.t === "id" ? t.v.toUpperCase() : "");
const isWord = (t: Tok | undefined, ...w: string[]) => !!t && t.t === "id" && w.includes(t.v.toUpperCase());

/** Joins tokens back to readable SQL text. */
function text(ts: Tok[]): string {
  let s = "";
  ts.forEach((t, i) => {
    const v = t.t === "str" ? `'${t.v.replace(/'/g, "''")}'` : t.t === "qid" ? t.v : t.v;
    const prev = ts[i - 1];
    const tight = !prev || t.v === ")" || t.v === "," || t.v === "." || prev.v === "(" || prev.v === "." || t.v === "::" || prev.v === "::" || (t.v === "(" && prev.t === "id");
    s += (tight ? "" : " ") + v;
  });
  return s;
}

class Cursor {
  i = 0;
  constructor(public ts: Tok[]) {}
  peek(k = 0) { return this.ts[this.i + k]; }
  next() { return this.ts[this.i++]; }
  eof() { return this.i >= this.ts.length; }
  word(...w: string[]) {
    if (isWord(this.peek(), ...w)) { this.i++; return true; }
    return false;
  }
  punct(p: string) {
    const t = this.peek();
    if (t && t.t === "p" && t.v === p) { this.i++; return true; }
    return false;
  }
  /** Reads a balanced (...) group, returning the inner tokens. */
  group(): Tok[] {
    if (!this.punct("(")) return [];
    const start = this.i;
    let d = 1;
    while (!this.eof()) {
      const t = this.next();
      if (t.t === "p" && t.v === "(") d++;
      if (t.t === "p" && t.v === ")" && --d === 0) return this.ts.slice(start, this.i - 1);
    }
    throw new ToolError(`Unbalanced parentheses starting on line ${this.ts[start - 1]?.line ?? "?"}.`);
  }
  ident(): string | null {
    const t = this.peek();
    if (!t || (t.t !== "id" && t.t !== "qid")) return null;
    this.i++;
    return t.v;
  }
  /** a.b.c qualified name. */
  qname(): string[] | null {
    const first = this.ident();
    if (first == null) return null;
    const parts = [first];
    while (this.peek()?.v === "." && this.peek()?.t === "p") {
      this.i++;
      const p = this.ident();
      if (p == null) break;
      parts.push(p);
    }
    return parts;
  }
}

/** Splits tokens on commas at depth 0. */
function splitTop(ts: Tok[]): Tok[][] {
  const out: Tok[][] = [];
  let cur: Tok[] = [];
  let d = 0;
  for (const t of ts) {
    if (t.t === "p" && t.v === "(") d++;
    if (t.t === "p" && t.v === ")") d--;
    if (d === 0 && t.t === "p" && t.v === ",") {
      out.push(cur);
      cur = [];
    } else cur.push(t);
  }
  if (cur.length) out.push(cur);
  return out;
}

const identList = (ts: Tok[]) =>
  splitTop(ts)
    .map((p) => p.find((t) => t.t === "id" || t.t === "qid")?.v ?? "")
    .filter(Boolean);

const TYPE_RE = /^(int\w*|bigint|smallint|tinyint|mediumint|serial|bigserial|varchar\w*|nvarchar|char|nchar|text|string|uuid|bool\w*|date\w*|time\w*|numeric|decimal|real|float\w*|double|money|json\w*|blob|bytea|binary|varbinary|bit)$/i;

const CONSTRAINT_WORDS = ["NOT", "NULL", "PRIMARY", "UNIQUE", "DEFAULT", "CHECK", "REFERENCES", "CONSTRAINT", "AUTO_INCREMENT", "AUTOINCREMENT", "IDENTITY", "GENERATED", "COLLATE", "COMMENT", "ON", "KEY", "AS", "CHARACTER", "CHARSET"];

function parseRef(c: Cursor): { table: string[]; cols: string[]; onDelete?: string; onUpdate?: string } {
  const table = c.qname() ?? ["?"];
  const cols = c.peek()?.v === "(" ? identList(c.group()) : [];
  let onDelete: string | undefined, onUpdate: string | undefined;
  for (;;) {
    if (isWord(c.peek(), "ON") && isWord(c.peek(1), "DELETE", "UPDATE")) {
      c.next();
      const which = up(c.next());
      const act: string[] = [];
      while (isWord(c.peek(), "CASCADE", "RESTRICT", "SET", "NULL", "DEFAULT", "NO", "ACTION")) act.push(up(c.next()));
      if (which === "DELETE") onDelete = act.join(" ");
      else onUpdate = act.join(" ");
      continue;
    }
    if (c.word("MATCH")) { c.next(); continue; }
    if (c.word("DEFERRABLE", "INITIALLY", "IMMEDIATE", "DEFERRED")) continue;
    if (isWord(c.peek(), "NOT") && isWord(c.peek(1), "DEFERRABLE", "FOR")) { c.next(); c.next(); if (up(c.peek()) === "REPLICATION") c.next(); continue; }
    break;
  }
  return { table, cols, onDelete, onUpdate };
}

function parseColumn(ts: Tok[], t: TableDef, qualify: (p: string[]) => string) {
  const c = new Cursor(ts);
  const name = c.ident();
  if (!name) return;
  // type: words until a constraint keyword, plus a (...) group and [] suffix
  const typeToks: Tok[] = [];
  while (!c.eof()) {
    const p = c.peek();
    if (p.t === "id" && CONSTRAINT_WORDS.includes(p.v.toUpperCase()) && !(p.v.toUpperCase() === "CHARACTER" && isWord(c.peek(1), "VARYING"))) break;
    if (p.t === "p" && p.v === "(") {
      const g = c.group();
      typeToks.push({ t: "op", v: "(" + text(g).replace(/\s+/g, "") + ")", line: p.line });
      continue;
    }
    if (p.t === "op" && p.v === "[") { c.next(); continue; }
    if (p.t === "qid" && p.v === "") { typeToks.push({ t: "op", v: "[]", line: p.line }); c.next(); continue; }
    typeToks.push(c.next());
  }
  const type = typeToks.map((x) => x.v).join(" ").replace(/ \(/g, "(").replace(/\s+\[\]/g, "[]").trim() || "any";
  const col: Column = { name, type, nullable: true, pk: false, unique: false };
  while (!c.eof()) {
    if (c.word("CONSTRAINT")) { c.ident(); continue; }
    if (isWord(c.peek(), "NOT") && isWord(c.peek(1), "NULL")) { c.next(); c.next(); col.nullable = false; continue; }
    if (c.word("NULL")) continue;
    if (c.word("PRIMARY")) {
      c.word("KEY");
      c.word("ASC", "DESC");
      col.pk = true;
      col.nullable = false;
      if (c.word("AUTOINCREMENT")) col.auto = true;
      continue;
    }
    if (c.word("UNIQUE")) { c.word("KEY"); col.unique = true; continue; }
    if (c.word("KEY")) { col.pk = true; col.nullable = false; continue; }
    if (c.word("AUTO_INCREMENT", "AUTOINCREMENT")) { col.auto = true; continue; }
    if (c.word("IDENTITY")) { if (c.peek()?.v === "(") c.group(); col.auto = true; continue; }
    if (c.word("GENERATED")) {
      const g: Tok[] = [];
      while (!c.eof() && !isWord(c.peek(), "NOT", "PRIMARY", "UNIQUE", "REFERENCES", "CHECK", "CONSTRAINT")) {
        const t2 = c.peek();
        if (t2.v === "(") { c.group(); continue; }
        g.push(c.next());
      }
      if (g.some((x) => up(x) === "IDENTITY")) col.auto = true;
      else col.default = "generated";
      continue;
    }
    if (c.word("DEFAULT")) {
      const d: Tok[] = [];
      if (c.peek()?.v === "(") d.push({ t: "op", v: "(" + text(c.group()) + ")", line: 0 });
      else {
        while (!c.eof() && !isWord(c.peek(), ...CONSTRAINT_WORDS.filter((w) => w !== "NULL" && w !== "ON"))) {
          if (isWord(c.peek(), "ON") && isWord(c.peek(1), "UPDATE")) break;
          if (c.peek().v === "(") { const g = c.group(); d.push({ t: "op", v: "(" + text(g) + ")", line: 0 }); continue; }
          d.push(c.next());
        }
      }
      col.default = text(d).replace(/ \(/g, "(");
      continue;
    }
    if (c.word("CHECK")) { col.check = text(c.group()); continue; }
    if (c.word("REFERENCES")) {
      const r = parseRef(c);
      col.fk = { table: qualify(r.table), column: r.cols[0] ?? "" };
      t.fks.push({ columns: [name], refTable: qualify(r.table), refColumns: r.cols, onDelete: r.onDelete, onUpdate: r.onUpdate, line: ts[0].line });
      continue;
    }
    if (c.word("COLLATE")) { c.next(); continue; }
    if (c.word("CHARACTER", "CHARSET")) { c.word("SET"); c.next(); continue; }
    if (c.word("COMMENT")) { const s = c.next(); if (s?.t === "str") col.comment = s.v; continue; }
    if (isWord(c.peek(), "ON") && isWord(c.peek(1), "UPDATE")) { c.next(); c.next(); c.next(); if (c.peek()?.v === "(") c.group(); continue; }
    if (c.word("AS")) { if (c.peek()?.v === "(") c.group(); col.default = "generated"; continue; }
    c.next();
  }
  t.columns.push(col);
}

function parseCreate(c: Cursor, tables: Map<string, TableDef>, qualify: (p: string[]) => string, line: number) {
  c.word("IF") && c.word("NOT") && c.word("EXISTS");
  const qn = c.qname();
  if (!qn) throw new ToolError(`Line ${line}: expected a table name after CREATE TABLE.`);
  const name = qualify(qn);
  const t: TableDef = { name, schema: qn.length > 1 ? qn[qn.length - 2] : undefined, short: qn[qn.length - 1], columns: [], pk: [], uniques: [], fks: [], checks: [], line };
  if (c.peek()?.v !== "(") {
    if (isWord(c.peek(), "AS")) return; // CREATE TABLE … AS SELECT
    throw new ToolError(`Line ${c.peek()?.line ?? line}: expected "(" after CREATE TABLE ${name}.`);
  }
  const body = c.group();
  for (const part of splitTop(body)) {
    if (!part.length) continue;
    const pc = new Cursor(part);
    let cname: string | undefined;
    if (pc.word("CONSTRAINT")) cname = pc.ident() ?? undefined;
    if (pc.word("PRIMARY")) {
      pc.word("KEY");
      pc.word("CLUSTERED", "NONCLUSTERED");
      t.pk = identList(pc.group());
      continue;
    }
    if (isWord(pc.peek(), "UNIQUE")) {
      pc.next();
      pc.word("KEY", "INDEX");
      pc.word("CLUSTERED", "NONCLUSTERED");
      if (pc.peek()?.v !== "(") pc.ident();
      t.uniques.push(identList(pc.group()));
      continue;
    }
    if (pc.word("FOREIGN")) {
      pc.word("KEY");
      if (pc.peek()?.v !== "(") pc.ident();
      const cols = identList(pc.group());
      if (!pc.word("REFERENCES")) throw new ToolError(`Line ${part[0].line}: FOREIGN KEY without REFERENCES in ${name}.`);
      const r = parseRef(pc);
      t.fks.push({ name: cname, columns: cols, refTable: qualify(r.table), refColumns: r.cols, onDelete: r.onDelete, onUpdate: r.onUpdate, line: part[0].line });
      continue;
    }
    if (pc.word("CHECK")) {
      t.checks.push(text(pc.group()));
      continue;
    }
    if (isWord(pc.peek(), "KEY", "INDEX", "FULLTEXT", "SPATIAL", "EXCLUDE", "PERIOD")) {
      // MySQL secondary index / Postgres EXCLUDE — unless it is a column literally named "key"
      const nxt = pc.peek(1);
      if (!(nxt && nxt.t === "id" && TYPE_RE.test(nxt.v))) continue;
    }
    if (isWord(pc.peek(), "LIKE")) continue;
    parseColumn(part, t, qualify);
  }
  // table options: COMMENT='…'
  while (!c.eof() && c.peek().v !== ";") {
    if (c.word("COMMENT")) {
      if (c.peek()?.v === "=") c.next();
      const s = c.next();
      if (s?.t === "str") t.comment = s.v;
      continue;
    }
    c.next();
  }
  for (const col of t.columns) if (col.pk && !t.pk.includes(col.name)) t.pk.push(col.name);
  if (t.pk.length) for (const col of t.columns) if (t.pk.includes(col.name)) { col.pk = true; col.nullable = false; }
  for (const u of t.uniques) if (u.length === 1) { const col = t.columns.find((x) => x.name === u[0]); if (col) col.unique = true; }
  for (const fk of t.fks)
    fk.columns.forEach((cn, i) => {
      const col = t.columns.find((x) => x.name === cn);
      if (col && !col.fk) col.fk = { table: fk.refTable, column: fk.refColumns[i] ?? "" };
    });
  tables.set(name.toLowerCase(), t);
}

export type ParseResult = { tables: TableDef[]; warnings: { message: string; line?: number }[]; skipped: number };

export function parseDdl(src: string): ParseResult {
  if (!src.trim()) throw new ToolError("Paste CREATE TABLE statements to draw an ER diagram.");
  const toks = tokenize(src);
  const stmts: Tok[][] = [];
  let cur: Tok[] = [];
  let depth = 0;
  for (const t of toks) {
    if (t.t === "p" && t.v === "(") depth++;
    if (t.t === "p" && t.v === ")") depth--;
    if (depth === 0 && ((t.t === "p" && t.v === ";") || (t.t === "id" && t.v.toUpperCase() === "GO" && (cur.length === 0 || cur[cur.length - 1].line < t.line)))) {
      if (cur.length) stmts.push(cur);
      cur = [];
      continue;
    }
    cur.push(t);
  }
  if (cur.length) stmts.push(cur);
  if (depth > 0) throw new ToolError("Unbalanced parentheses: a CREATE TABLE is missing a closing \")\".");

  const tables = new Map<string, TableDef>();
  const warnings: ParseResult["warnings"] = [];
  let skipped = 0;
  const qualify = (p: string[]) => (p.length > 1 ? p.slice(-2).join(".") : p[0]);
  const find = (n: string) => tables.get(n.toLowerCase()) ?? [...tables.values()].find((t) => t.short.toLowerCase() === n.toLowerCase().split(".").pop());

  for (const st of stmts) {
    const c = new Cursor(st);
    const line = st[0].line;
    if (c.word("CREATE")) {
      c.word("OR") && c.word("REPLACE");
      while (c.word("TEMP", "TEMPORARY", "UNLOGGED", "GLOBAL", "LOCAL", "VIRTUAL", "EXTERNAL", "TRANSIENT")) {}
      if (c.word("TABLE")) {
        parseCreate(c, tables, qualify, line);
        continue;
      }
      if (c.word("UNIQUE")) {
        c.word("CLUSTERED", "NONCLUSTERED");
        if (c.word("INDEX")) {
          c.word("CONCURRENTLY");
          c.word("IF") && c.word("NOT") && c.word("EXISTS");
          if (!isWord(c.peek(), "ON")) c.qname();
          if (c.word("ON")) {
            c.word("ONLY");
            const tn = c.qname();
            while (!c.eof() && c.peek().v !== "(") c.next();
            const cols = identList(c.group());
            const t = tn && find(qualify(tn));
            if (t) {
              t.uniques.push(cols);
              if (cols.length === 1) { const col = t.columns.find((x) => x.name === cols[0]); if (col) col.unique = true; }
            }
          }
          continue;
        }
      }
      skipped++;
      continue;
    }
    if (c.word("ALTER")) {
      if (!c.word("TABLE")) { skipped++; continue; }
      c.word("IF") && c.word("EXISTS");
      c.word("ONLY");
      const tn = c.qname();
      const t = tn ? find(qualify(tn)) : undefined;
      if (!t) { warnings.push({ message: `ALTER TABLE ${tn?.join(".") ?? "?"}: table not defined above — skipped.`, line }); continue; }
      for (const action of splitTop(st.slice(c.i))) {
        const a = new Cursor(action);
        if (!a.word("ADD")) {
          if (a.word("ALTER", "MODIFY")) {
            a.word("COLUMN");
            const cn = a.ident();
            const col = t.columns.find((x) => x.name === cn);
            if (col && isWord(a.peek(), "SET") && isWord(a.peek(1), "NOT")) col.nullable = false;
          }
          continue;
        }
        let cname: string | undefined;
        if (a.word("CONSTRAINT")) cname = a.ident() ?? undefined;
        if (a.word("FOREIGN")) {
          a.word("KEY");
          if (a.peek()?.v !== "(") a.ident();
          const cols = identList(a.group());
          a.word("REFERENCES");
          const r = parseRef(a);
          t.fks.push({ name: cname, columns: cols, refTable: qualify(r.table), refColumns: r.cols, onDelete: r.onDelete, onUpdate: r.onUpdate, line });
          cols.forEach((cn, i) => {
            const col = t.columns.find((x) => x.name === cn);
            if (col) col.fk = { table: qualify(r.table), column: r.cols[i] ?? "" };
          });
        } else if (a.word("PRIMARY")) {
          a.word("KEY");
          a.word("CLUSTERED", "NONCLUSTERED");
          t.pk = identList(a.group());
          for (const col of t.columns) if (t.pk.includes(col.name)) { col.pk = true; col.nullable = false; }
        } else if (a.word("UNIQUE")) {
          a.word("KEY", "INDEX");
          if (a.peek()?.v !== "(") a.ident();
          const cols = identList(a.group());
          t.uniques.push(cols);
          if (cols.length === 1) { const col = t.columns.find((x) => x.name === cols[0]); if (col) col.unique = true; }
        } else if (a.word("CHECK")) {
          t.checks.push(text(a.group()));
        } else {
          a.word("COLUMN");
          a.word("IF") && a.word("NOT") && a.word("EXISTS");
          if (!a.eof()) parseColumn(action.slice(a.i), t, qualify);
        }
      }
      continue;
    }
    if (c.word("COMMENT") && c.word("ON")) {
      const what = up(c.next());
      const qn = c.qname();
      c.word("IS");
      const s = c.next();
      if (!qn || s?.t !== "str") continue;
      if (what === "TABLE") { const t = find(qualify(qn)); if (t) t.comment = s.v; }
      else if (what === "COLUMN") {
        const t = find(qualify(qn.slice(0, -1)));
        const col = t?.columns.find((x) => x.name === qn[qn.length - 1]);
        if (col) col.comment = s.v;
      }
      continue;
    }
    skipped++;
  }
  if (!tables.size) throw new ToolError("No CREATE TABLE statements found. Paste DDL such as:\nCREATE TABLE users (id INT PRIMARY KEY, name TEXT);");
  // Resolve references to known tables (match by short name when unqualified).
  for (const t of tables.values())
    for (const fk of t.fks) {
      const target = find(fk.refTable);
      if (!target) warnings.push({ message: `${t.name}: foreign key (${fk.columns.join(", ")}) references ${fk.refTable}, which is not defined.`, line: fk.line });
      else {
        fk.refTable = target.name;
        if (!fk.refColumns.length) fk.refColumns = target.pk.length ? [...target.pk] : [];
        fk.columns.forEach((cn, i) => {
          const col = t.columns.find((x) => x.name === cn);
          if (col) col.fk = { table: target.name, column: fk.refColumns[i] ?? "" };
          else warnings.push({ message: `${t.name}: foreign key column ${cn} is not a column of the table.`, line: fk.line });
        });
      }
    }
  for (const t of tables.values()) if (!t.pk.length) warnings.push({ message: `${t.name} has no primary key.`, line: t.line });
  return { tables: [...tables.values()], warnings, skipped };
}

/* ── Mermaid ─────────────────────────────────────────────────────────── */

const entityId = (name: string) => name.replace(/[^\wÀ-￿-]+/g, "_");
const attrName = (s: string) => {
  const v = s.replace(/[^\wÀ-￿\-\[\]().,*]+/g, "_");
  return /^[A-Za-z_*À-￿]/.test(v) ? v : `_${v}`;
};
const attrType = (s: string) => {
  const v = s.replace(/\s+/g, "_").replace(/[^\wÀ-￿\-\[\]().,*~]+/g, "");
  return /^[A-Za-z_*]/.test(v) ? v : `t_${v || "any"}`;
};
const mstr = (s: string) => s.replace(/"/g, "'").replace(/[\r\n]+/g, " ").slice(0, 80);

export type Relationship = { from: string; to: string; label: string; card: string; oneToOne: boolean; identifying: boolean; optional: boolean; fk: ForeignKey };

export function relationships(tables: TableDef[]): Relationship[] {
  const byName = new Map(tables.map((t) => [t.name, t]));
  const out: Relationship[] = [];
  for (const t of tables)
    for (const fk of t.fks) {
      if (!byName.has(fk.refTable)) continue;
      const cols = fk.columns.map((cn) => t.columns.find((x) => x.name === cn));
      const optional = cols.some((c) => !c || c.nullable);
      const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
      const oneToOne = sameSet(fk.columns, t.pk) || t.uniques.some((u) => sameSet(u, fk.columns)) || (fk.columns.length === 1 && !!cols[0]?.unique);
      const identifying = fk.columns.every((cn) => t.pk.includes(cn));
      // child side: many (or one for 1:1), parent side: exactly one / zero-or-one
      const childSide = oneToOne ? "|o" : "}o";
      const parentSide = optional ? "o|" : "||";
      out.push({ from: t.name, to: fk.refTable, label: fk.columns.join(", "), card: `${childSide}--${parentSide}`, oneToOne, identifying, optional, fk });
    }
  return out;
}

export type MermaidOpts = { attrs: "all" | "keys" | "none"; types: boolean; notes: boolean; dotted: boolean; direction: string };

export function toMermaid(tables: TableDef[], o: MermaidOpts): string {
  const lines = ["erDiagram"];
  if (o.direction && o.direction !== "TB") lines.push(`    direction ${o.direction}`);
  for (const t of tables) {
    const id = entityId(t.name);
    const head = id === t.name ? id : `${id}["${mstr(t.name)}"]`;
    const cols = o.attrs === "none" ? [] : t.columns.filter((c) => o.attrs === "all" || c.pk || c.fk || c.unique);
    if (!cols.length) {
      lines.push(`    ${head} {`, `    }`);
      continue;
    }
    lines.push(`    ${head} {`);
    for (const c of cols) {
      const keys = [c.pk ? "PK" : "", c.fk ? "FK" : "", c.unique && !c.pk ? "UK" : ""].filter(Boolean).join(", ");
      const notes: string[] = [];
      if (o.notes) {
        if (!c.nullable && !c.pk) notes.push("not null");
        if (c.auto) notes.push("auto");
        if (c.default) notes.push(`default ${c.default}`);
        if (c.fk) notes.push(`→ ${c.fk.table}${c.fk.column ? "." + c.fk.column : ""}`);
        if (c.check) notes.push(`check ${c.check}`);
        if (c.comment) notes.push(c.comment);
      }
      const type = attrType((o.types ? c.type : c.type.replace(/\(.*?\)/g, "")).toLowerCase());
      lines.push(`        ${type} ${attrName(c.name)}${keys ? " " + keys : ""}${notes.length ? ` "${mstr(notes.join("; "))}"` : ""}`);
    }
    lines.push("    }");
  }
  for (const r of relationships(tables)) {
    const card = o.dotted && !r.identifying ? r.card.replace("--", "..") : r.card;
    lines.push(`    ${entityId(r.from)} ${card} ${entityId(r.to)} : "${mstr(r.label)}"`);
  }
  return lines.join("\n");
}
