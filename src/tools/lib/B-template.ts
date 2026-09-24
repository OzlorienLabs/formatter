/**
 * A small Mustache / Handlebars-style template engine: {{var}}, dotted and
 * indexed paths, filters with arguments, #each / #if / #unless / #with with
 * {{else}}, mustache sections, comments, raw triple-stache, whitespace control
 * (~) and standalone-line trimming. Missing variables are reported with lines.
 */
import { ToolError } from "../types";

type Expr = { src: string; base: string; filters: { name: string; args: string[] }[] };
type Node =
  | { t: "text"; v: string }
  | { t: "var"; expr: Expr; raw: boolean; line: number; src: string }
  | { t: "block"; kind: string; arg: string; body: Node[]; alt: Node[]; line: number };

type Tok = { t: "text"; v: string } | { t: "tag"; kind: "var" | "raw" | "open" | "inverse" | "close" | "else" | "comment"; body: string; line: number; src: string; start: number; end: number; lstrip: boolean; rstrip: boolean };

function lineAt(src: string, pos: number) {
  let l = 1;
  for (let i = 0; i < pos; i++) if (src.charCodeAt(i) === 10) l++;
  return l;
}

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const open = src.indexOf("{{", i);
    if (open < 0) { toks.push({ t: "text", v: src.slice(i) }); break; }
    if (open > i) toks.push({ t: "text", v: src.slice(i, open) });
    if (src[open - 1] === "\\") {
      // \{{ escapes a literal tag
      const last = toks[toks.length - 1];
      if (last && last.t === "text") last.v = last.v.slice(0, -1);
      toks.push({ t: "text", v: "{{" });
      i = open + 2;
      continue;
    }
    let j = open + 2;
    const triple = src[j] === "{";
    let close: number;
    let inner: string;
    if (src.startsWith("!--", j) || src.startsWith("~!--", j)) {
      close = src.indexOf("--}}", j);
      if (close < 0) throw new ToolError(`Unclosed comment {{!-- at line ${lineAt(src, open)}`);
      inner = src.slice(j, close + 2);
      close += 4;
    } else if (triple) {
      close = src.indexOf("}}}", j);
      if (close < 0) throw new ToolError(`Unclosed {{{ at line ${lineAt(src, open)}`);
      inner = src.slice(j + 1, close);
      close += 3;
    } else {
      close = src.indexOf("}}", j);
      if (close < 0) throw new ToolError(`Unclosed {{ at line ${lineAt(src, open)} — add the matching }}`);
      inner = src.slice(j, close);
      close += 2;
    }
    let body = inner;
    let lstrip = false, rstrip = false;
    if (body.startsWith("~")) { lstrip = true; body = body.slice(1); }
    if (body.endsWith("~")) { rstrip = true; body = body.slice(0, -1); }
    body = body.trim();
    let kind: Extract<Tok, { t: "tag" }>["kind"] = triple ? "raw" : "var";
    if (!triple) {
      const c = body[0];
      if (c === "!") kind = "comment";
      else if (c === "#") { kind = "open"; body = body.slice(1).trim(); }
      else if (c === "^") { kind = "inverse"; body = body.slice(1).trim(); if (!body) kind = "else"; }
      else if (c === "/") { kind = "close"; body = body.slice(1).trim(); }
      else if (c === "&") { kind = "raw"; body = body.slice(1).trim(); }
      else if (body === "else") kind = "else";
    }
    j = close;
    toks.push({ t: "tag", kind, body, line: lineAt(src, open), src: src.slice(open, close), start: open, end: close, lstrip, rstrip });
    i = j;
  }
  // Whitespace control and standalone lines.
  for (let k = 0; k < toks.length; k++) {
    const tk = toks[k];
    if (tk.t !== "tag") continue;
    const prev = toks[k - 1], next = toks[k + 1];
    if (tk.lstrip && prev?.t === "text") prev.v = prev.v.replace(/\s+$/, "");
    if (tk.rstrip && next?.t === "text") next.v = next.v.replace(/^\s+/, "");
    if (tk.kind === "var" || tk.kind === "raw") continue;
    const before = prev ? (prev.t === "text" ? prev.v : null) : "";
    const after = next ? (next.t === "text" ? next.v : null) : "";
    if (before === null || after === null) continue;
    const bm = /(^|\n)[ \t]*$/.exec(before);
    const am = /^[ \t]*(\r?\n|$)/.exec(after);
    if (bm && am && (k > 0 || true)) {
      if (prev && prev.t === "text") prev.v = prev.v.slice(0, prev.v.length - (bm[0].length - bm[1].length));
      if (next && next.t === "text") next.v = next.v.slice(am[0].length);
    }
  }
  return toks;
}

function splitTop(s: string, sep: string): string[] {
  const out: string[] = [];
  let q = "", cur = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { cur += c; if (c === "\\" && i + 1 < s.length) { cur += s[++i]; continue; } if (c === q) q = ""; continue; }
    if (c === '"' || c === "'") { q = c; cur += c; continue; }
    if (s.startsWith(sep, i)) { out.push(cur); cur = ""; i += sep.length - 1; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}

function parseExpr(src: string): Expr {
  const parts = splitTop(src, "|").map((x) => x.trim());
  const base = parts[0];
  const filters = parts.slice(1).filter(Boolean).map((f) => {
    const segs = splitTop(f, ":").map((x) => x.trim());
    return { name: segs[0], args: segs.slice(1) };
  });
  return { src, base, filters };
}

function parse(src: string): Node[] {
  const toks = tokenize(src);
  const root: Node[] = [];
  const stack: { node: Extract<Node, { t: "block" }>; inAlt: boolean; name: string }[] = [];
  const target = () => (stack.length ? (stack[stack.length - 1].inAlt ? stack[stack.length - 1].node.alt : stack[stack.length - 1].node.body) : root);
  for (const tk of toks) {
    if (tk.t === "text") { if (tk.v) target().push({ t: "text", v: tk.v }); continue; }
    switch (tk.kind) {
      case "comment": break;
      case "var": case "raw":
        if (!tk.body) throw new ToolError(`Empty tag ${tk.src} at line ${tk.line}`);
        target().push({ t: "var", expr: parseExpr(tk.body), raw: tk.kind === "raw", line: tk.line, src: tk.src });
        break;
      case "open": case "inverse": {
        const m = /^(\S+)\s*([\s\S]*)$/.exec(tk.body);
        if (!m) throw new ToolError(`Empty block tag at line ${tk.line}`);
        let kind = m[1], arg = m[2].trim();
        if (tk.kind === "inverse") { arg = tk.body; kind = "inverted"; }
        else if (!["each", "if", "unless", "with"].includes(kind)) { arg = tk.body; kind = "section"; }
        else if (!arg) throw new ToolError(`{{#${kind}}} needs an argument at line ${tk.line}, e.g. {{#${kind} items}}`);
        const node: Extract<Node, { t: "block" }> = { t: "block", kind, arg, body: [], alt: [], line: tk.line };
        target().push(node);
        stack.push({ node, inAlt: false, name: tk.kind === "inverse" || kind === "section" ? tk.body : kind });
        break;
      }
      case "else": {
        const top = stack[stack.length - 1];
        if (!top) throw new ToolError(`{{else}} outside a block at line ${tk.line}`);
        top.inAlt = true;
        break;
      }
      case "close": {
        const top = stack.pop();
        if (!top) throw new ToolError(`Unexpected {{/${tk.body}}} at line ${tk.line} — no block is open`);
        if (top.name !== tk.body) throw new ToolError(`{{/${tk.body}}} at line ${tk.line} closes {{#${top.name}}} opened at line ${top.node.line}`);
        break;
      }
    }
  }
  if (stack.length) {
    const top = stack[stack.length - 1];
    throw new ToolError(`{{#${top.name}}} opened at line ${top.node.line} is never closed — add {{/${top.name}}}`);
  }
  return root;
}

/* ── rendering ─────────────────────────────────────────────────────── */

type Frame = { data: unknown; vars: Record<string, unknown> };
export type RenderOpts = { escape: boolean; missing: "blank" | "keep" | "mark" };
export type Warning = { line: number; message: string };

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;", "=": "&#61;" };
const escapeHtml = (s: string) => s.replace(/[&<>"'`=]/g, (c) => ESC[c]);

const MISSING = Symbol("missing");

function literal(s: string): unknown | typeof MISSING {
  if (/^"(?:[^"\\]|\\.)*"$/.test(s) || /^'(?:[^'\\]|\\.)*'$/.test(s)) return s.slice(1, -1).replace(/\\(.)/g, "$1");
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if (s === "true") return true;
  if (s === "false") return false;
  if (s === "null") return null;
  return MISSING;
}

function splitPath(p: string): string[] {
  return p.replace(/\[(\d+|"[^"]*"|'[^']*')\]/g, (_, k) => "." + k.replace(/^["']|["']$/g, "")).split(".").filter((x) => x !== "");
}

function get(obj: unknown, segs: string[]): unknown {
  let cur: unknown = obj;
  for (const s of segs) {
    if (cur === null || cur === undefined) return undefined;
    if (s === "length" && (Array.isArray(cur) || typeof cur === "string")) { cur = (cur as unknown[]).length; continue; }
    if (typeof cur !== "object") return undefined;
    if (!Object.prototype.hasOwnProperty.call(cur, s)) return undefined;
    cur = (cur as Record<string, unknown>)[s];
  }
  return cur;
}

function resolve(path: string, frames: Frame[]): unknown {
  const lit = literal(path);
  if (lit !== MISSING) return lit;
  let p = path;
  let depth = frames.length - 1;
  while (p.startsWith("../")) { p = p.slice(3); depth = Math.max(0, depth - 1); }
  if (p === "this" || p === ".") return frames[depth].data;
  if (p.startsWith("this.")) return get(frames[depth].data, splitPath(p.slice(5)));
  if (p.startsWith("@root")) return get(frames[0].data, splitPath(p.slice(5)));
  if (p.startsWith("@")) {
    const [v, ...rest] = splitPath(p.slice(1));
    for (let d = depth; d >= 0; d--) if (v in frames[d].vars) return get(frames[d].vars[v], rest);
    return undefined;
  }
  const segs = splitPath(p);
  // Mustache-style lookup: walk up the context stack for the first segment.
  for (let d = depth; d >= 0; d--) {
    const data = frames[d].data;
    if (data && typeof data === "object" && Object.prototype.hasOwnProperty.call(data, segs[0])) return get(data, segs);
  }
  return undefined;
}

function truthy(v: unknown) {
  if (Array.isArray(v)) return v.length > 0;
  if (v && typeof v === "object") return Object.keys(v).length > 0;
  return !!v && v !== "false";
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function formatDate(v: unknown, fmt: string): string {
  let d: Date;
  if (v instanceof Date) d = v;
  else if (typeof v === "number") d = new Date(v < 1e11 ? v * 1000 : v);
  else if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) d = new Date(v + "T00:00:00");
  else if (v === "now") d = new Date();
  else d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  const map: Record<string, string> = {
    YYYY: String(d.getFullYear()), YY: p(d.getFullYear() % 100), MMMM: MONTHS[d.getMonth()], MMM: MONTHS[d.getMonth()].slice(0, 3), MM: p(d.getMonth() + 1), M: String(d.getMonth() + 1),
    DD: p(d.getDate()), D: String(d.getDate()), dddd: DAYS[d.getDay()], ddd: DAYS[d.getDay()].slice(0, 3), HH: p(d.getHours()), H: String(d.getHours()),
    hh: p(d.getHours() % 12 || 12), h: String(d.getHours() % 12 || 12), mm: p(d.getMinutes()), ss: p(d.getSeconds()), A: d.getHours() < 12 ? "AM" : "PM", a: d.getHours() < 12 ? "am" : "pm",
  };
  return fmt.replace(/\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|DD|D|dddd|ddd|HH|H|hh|h|mm|ss|A|a/g, (m, lit) => (lit !== undefined ? lit : map[m]));
}

function str(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.map(str).join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export const FILTERS = ["upper", "lower", "title", "capitalize", "trim", "json", "length", "default", "date", "truncate", "escape", "urlencode", "slug", "join", "first", "last", "reverse", "sort", "number", "round", "replace", "keys", "plural"];

function applyFilter(v: unknown, name: string, rawArgs: string[], frames: Frame[], line: number): unknown {
  const args = rawArgs.map((a) => { const l = literal(a); return l === MISSING ? resolve(a, frames) : l; });
  switch (name) {
    case "upper": return str(v).toUpperCase();
    case "lower": return str(v).toLowerCase();
    case "title": return str(v).toLowerCase().replace(/(^|[\s\-_/])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
    case "capitalize": { const s = str(v); return s.charAt(0).toUpperCase() + s.slice(1); }
    case "trim": return str(v).trim();
    case "json": return JSON.stringify(v ?? null, null, args[0] === undefined ? undefined : Number(args[0]));
    case "length": return Array.isArray(v) || typeof v === "string" ? v.length : v && typeof v === "object" ? Object.keys(v).length : 0;
    case "default": return v === undefined || v === null || v === "" ? args[0] ?? "" : v;
    case "date": return formatDate(v, str(args[0] ?? "YYYY-MM-DD"));
    case "truncate": {
      const n = Number(args[0] ?? 30), s = str(v), chars = [...s];
      return chars.length > n ? chars.slice(0, n).join("").replace(/\s+$/, "") + str(args[1] ?? "…") : s;
    }
    case "escape": return escapeHtml(str(v));
    case "urlencode": return encodeURIComponent(str(v));
    case "slug": return str(v).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    case "join": return Array.isArray(v) ? v.map(str).join(str(args[0] ?? ", ")) : str(v);
    case "first": return Array.isArray(v) ? v[0] : str(v).charAt(0);
    case "last": return Array.isArray(v) ? v[v.length - 1] : str(v).slice(-1);
    case "reverse": return Array.isArray(v) ? [...v].reverse() : [...str(v)].reverse().join("");
    case "sort": return Array.isArray(v) ? [...v].sort((a, b) => (args[0] ? str(get(a, splitPath(str(args[0])))) : str(a)).localeCompare(args[0] ? str(get(b, splitPath(str(args[0])))) : str(b), undefined, { numeric: true })) : v;
    case "number": {
      const n = Number(v);
      if (!Number.isFinite(n)) return v;
      const dp = args[0] === undefined ? undefined : Number(args[0]);
      return n.toLocaleString("en-US", dp === undefined ? undefined : { minimumFractionDigits: dp, maximumFractionDigits: dp });
    }
    case "round": { const n = Number(v), dp = Number(args[0] ?? 0); return Number.isFinite(n) ? Math.round(n * 10 ** dp) / 10 ** dp : v; }
    case "replace": return str(v).split(str(args[0] ?? "")).join(str(args[1] ?? ""));
    case "keys": return v && typeof v === "object" ? Object.keys(v) : [];
    case "plural": { const n = Number(v); return `${v} ${n === 1 ? str(args[0] ?? "") : str(args[1] ?? str(args[0] ?? "") + "s")}`; }
  }
  throw new ToolError(`Unknown filter "${name}" at line ${line}. Available: ${FILTERS.join(", ")}`);
}

function evalCond(src: string, frames: Frame[], line: number): unknown {
  const ors = splitTop(src, "||").flatMap((x) => splitTop(x, " or "));
  if (ors.length > 1) return ors.some((x) => truthy(evalCond(x.trim(), frames, line)));
  const ands = splitTop(src, "&&").flatMap((x) => splitTop(x, " and "));
  if (ands.length > 1) return ands.every((x) => truthy(evalCond(x.trim(), frames, line)));
  let s = src.trim();
  let neg = false;
  while (s.startsWith("!") && !s.startsWith("!=")) { neg = !neg; s = s.slice(1).trim(); }
  if (s.startsWith("not ")) { neg = !neg; s = s.slice(4).trim(); }
  const m = /^(.+?)\s*(==|!=|>=|<=|>|<)\s*(.+)$/.exec(s);
  let r: unknown;
  if (m) {
    const a = evalValue(m[1].trim(), frames, line), b = evalValue(m[3].trim(), frames, line);
    const na = Number(a), nb = Number(b);
    const num = typeof a !== "boolean" && typeof b !== "boolean" && a !== "" && b !== "" && a != null && b != null && Number.isFinite(na) && Number.isFinite(nb);
    switch (m[2]) {
      case "==": r = num ? na === nb : str(a) === str(b); break;
      case "!=": r = num ? na !== nb : str(a) !== str(b); break;
      case ">": r = num ? na > nb : str(a) > str(b); break;
      case "<": r = num ? na < nb : str(a) < str(b); break;
      case ">=": r = num ? na >= nb : str(a) >= str(b); break;
      case "<=": r = num ? na <= nb : str(a) <= str(b); break;
    }
  } else r = evalValue(s, frames, line);
  return neg ? !truthy(r) : r;
}

function evalValue(src: string, frames: Frame[], line: number): unknown {
  const e = parseExpr(src);
  let v = resolve(e.base, frames);
  for (const f of e.filters) v = applyFilter(v, f.name, f.args, frames, line);
  return v;
}

export function compileTemplate(src: string) {
  return parse(src);
}

export function renderTemplate(nodes: Node[], data: unknown, o: RenderOpts, warnings: Warning[], label = ""): string {
  const frames: Frame[] = [{ data, vars: {} }];
  const seen = new Set<string>();
  const warn = (line: number, msg: string) => {
    const k = line + msg;
    if (seen.has(k)) return;
    seen.add(k);
    warnings.push({ line, message: label + msg });
  };
  const run = (list: Node[]): string => {
    let out = "";
    for (const n of list) {
      if (n.t === "text") { out += n.v; continue; }
      if (n.t === "var") {
        let v = resolve(n.expr.base, frames);
        const hasDefault = n.expr.filters.some((f) => f.name === "default");
        if (v === undefined && !hasDefault) {
          warn(n.line, `Missing variable "${n.expr.base}"`);
          out += o.missing === "keep" ? n.src : o.missing === "mark" ? `[missing: ${n.expr.base}]` : "";
          continue;
        }
        for (const f of n.expr.filters) v = applyFilter(v, f.name, f.args, frames, n.line);
        const s = str(v);
        const escaped = n.expr.filters.some((f) => f.name === "escape");
        out += o.escape && !n.raw && !escaped ? escapeHtml(s) : s;
        continue;
      }
      // blocks
      if (n.kind === "if" || n.kind === "unless") {
        const c = truthy(evalCond(n.arg, frames, n.line));
        out += run((n.kind === "if" ? c : !c) ? n.body : n.alt);
        continue;
      }
      if (n.kind === "with") {
        const v = evalValue(n.arg, frames, n.line);
        if (v === undefined) warn(n.line, `Missing variable "${n.arg}" in {{#with}}`);
        if (truthy(v)) { frames.push({ data: v, vars: {} }); out += run(n.body); frames.pop(); }
        else out += run(n.alt);
        continue;
      }
      if (n.kind === "each" || n.kind === "section" || n.kind === "inverted") {
        const v = evalValue(n.arg, frames, n.line);
        if (v === undefined && n.kind === "each") warn(n.line, `Missing list "${n.arg}" in {{#each}}`);
        if (n.kind === "inverted") { out += truthy(v) ? "" : run(n.body); continue; }
        if (n.kind === "section" && !Array.isArray(v)) {
          if (!truthy(v)) { out += run(n.alt); continue; }
          if (v && typeof v === "object") { frames.push({ data: v, vars: {} }); out += run(n.body); frames.pop(); }
          else out += run(n.body);
          continue;
        }
        const entries: [string | number, unknown][] = Array.isArray(v) ? v.map((x, i) => [i, x]) : v && typeof v === "object" ? Object.entries(v) : [];
        if (!entries.length) { out += run(n.alt); continue; }
        entries.forEach(([k, x], i) => {
          frames.push({ data: x, vars: { index: i, number: i + 1, key: k, first: i === 0, last: i === entries.length - 1 } });
          out += run(n.body);
          frames.pop();
        });
      }
    }
    return out;
  };
  return run(nodes);
}

/** Top-level names a template refers to (for "unused field" hints). */
export function referencedRoots(nodes: Node[]): Set<string> {
  const out = new Set<string>();
  const add = (e: string) => {
    const m = /^([A-Za-z_$][\w$-]*)/.exec(e.replace(/^(\.\.\/)+/, "").replace(/^this\./, ""));
    if (m && m[1] !== "this") out.add(m[1]);
  };
  const walk = (list: Node[]) => {
    for (const n of list) {
      if (n.t === "var") { add(n.expr.base); n.expr.filters.forEach((f) => f.args.forEach(add)); }
      else if (n.t === "block") {
        n.arg.split(/\|\||&&|==|!=|>=|<=|[<>!]|\s+and\s+|\s+or\s+|\|/).forEach((x) => add(x.trim()));
        walk(n.body);
        walk(n.alt);
      }
    }
  };
  walk(nodes);
  return out;
}
