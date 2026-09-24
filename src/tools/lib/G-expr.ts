/**
 * A tiny, safe expression evaluator for Mock Data formula fields.
 * No eval / Function: a hand-written Pratt-style parser over a whitelist of
 * operators and functions. Identifiers resolve to other fields of the row.
 */
import { ToolError } from "../types";

type Tok = { t: "num" | "str" | "id" | "op" | "eof"; v: string };

function lex(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c) && /[0-9]/.test(src[i + 1] ?? c)) {
      const m = /^\d*\.?\d+(e[+-]?\d+)?/i.exec(src.slice(i))!;
      out.push({ t: "num", v: m[0] });
      i += m[0].length;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1, s = "";
      while (j < src.length && src[j] !== c) {
        if (src[j] === "\\" && j + 1 < src.length) { s += src[j + 1]; j += 2; } else s += src[j++];
      }
      if (j >= src.length) throw new ToolError(`Unterminated string in formula at column ${i + 1}`);
      out.push({ t: "str", v: s });
      i = j + 1;
      continue;
    }
    if (c === "`" || c === "[") {
      const close = c === "`" ? "`" : "]";
      const j = src.indexOf(close, i + 1);
      if (j < 0) throw new ToolError(`Unclosed ${c} in formula at column ${i + 1}`);
      out.push({ t: "id", v: src.slice(i + 1, j) });
      i = j + 1;
      continue;
    }
    const id = /^[A-Za-z_$][\w$]*/.exec(src.slice(i));
    if (id) { out.push({ t: "id", v: id[0] }); i += id[0].length; continue; }
    const op = /^(==|!=|<=|>=|&&|\|\||[-+*/%<>!?:(),])/.exec(src.slice(i));
    if (op) { out.push({ t: "op", v: op[0] }); i += op[0].length; continue; }
    throw new ToolError(`Unexpected character "${c}" in formula at column ${i + 1}`);
  }
  out.push({ t: "eof", v: "" });
  return out;
}

type Node =
  | { k: "lit"; v: unknown }
  | { k: "id"; name: string }
  | { k: "un"; op: string; a: Node }
  | { k: "bin"; op: string; a: Node; b: Node }
  | { k: "tern"; c: Node; a: Node; b: Node }
  | { k: "call"; fn: string; args: Node[] };

function parse(src: string): Node {
  const toks = lex(src);
  let p = 0;
  const peek = () => toks[p];
  const eat = (v?: string) => {
    const t = toks[p];
    if (v !== undefined && t.v !== v) throw new ToolError(`Formula "${src}": expected "${v}" but found "${t.v || "end"}"`);
    p++;
    return t;
  };
  const PREC: Record<string, number> = { "||": 1, "&&": 2, "==": 3, "!=": 3, "<": 4, "<=": 4, ">": 4, ">=": 4, "+": 5, "-": 5, "*": 6, "/": 6, "%": 6 };
  function primary(): Node {
    const t = eat();
    if (t.t === "num") return { k: "lit", v: Number(t.v) };
    if (t.t === "str") return { k: "lit", v: t.v };
    if (t.t === "id") {
      if (t.v === "true" || t.v === "false") return { k: "lit", v: t.v === "true" };
      if (t.v === "null") return { k: "lit", v: null };
      if (peek().v === "(") {
        eat("(");
        const args: Node[] = [];
        if (peek().v !== ")") {
          do args.push(expr(0));
          while (peek().v === "," && eat(","));
        }
        eat(")");
        return { k: "call", fn: t.v.toLowerCase(), args };
      }
      return { k: "id", name: t.v };
    }
    if (t.v === "(") {
      const e = expr(0);
      eat(")");
      return e;
    }
    if (t.v === "-" || t.v === "!") return { k: "un", op: t.v, a: primary() };
    throw new ToolError(`Formula "${src}": unexpected "${t.v || "end of formula"}"`);
  }
  function expr(min: number): Node {
    let left = primary();
    for (;;) {
      const t = peek();
      if (t.t === "op" && t.v === "?" && min === 0) {
        eat("?");
        const a = expr(0);
        eat(":");
        const b = expr(0);
        left = { k: "tern", c: left, a, b };
        continue;
      }
      const pr = t.t === "op" ? PREC[t.v] : undefined;
      if (!pr || pr <= min - 1 || pr < min) break;
      eat();
      const right = expr(pr + 1);
      left = { k: "bin", op: t.v, a: left, b: right };
    }
    return left;
  }
  const n = expr(0);
  if (peek().t !== "eof") throw new ToolError(`Formula "${src}": unexpected "${peek().v}"`);
  return n;
}

const num = (v: unknown) => (typeof v === "number" ? v : Number(v));

const FNS: Record<string, (...a: unknown[]) => unknown> = {
  round: (x, d = 0) => { const f = 10 ** num(d); return Math.round(num(x) * f) / f; },
  floor: (x) => Math.floor(num(x)),
  ceil: (x) => Math.ceil(num(x)),
  abs: (x) => Math.abs(num(x)),
  min: (...a) => Math.min(...a.map(num)),
  max: (...a) => Math.max(...a.map(num)),
  sqrt: (x) => Math.sqrt(num(x)),
  upper: (s) => String(s ?? "").toUpperCase(),
  lower: (s) => String(s ?? "").toLowerCase(),
  concat: (...a) => a.map((x) => (x == null ? "" : String(x))).join(""),
  len: (s) => String(s ?? "").length,
  substr: (s, a, l) => String(s ?? "").substr(num(a), l === undefined ? undefined : num(l)),
  pad: (s, w, ch = "0") => String(s ?? "").padStart(num(w), String(ch)),
  slug: (s) => String(s ?? "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
  initials: (s) => String(s ?? "").split(/\s+/).map((w) => w[0] ?? "").join("").toUpperCase(),
  if: (c, a, b) => (c ? a : b),
  year: (d) => new Date(String(d)).getUTCFullYear(),
  adddays: (d, n) => new Date(new Date(String(d)).getTime() + num(n) * 86400000).toISOString().slice(0, 10),
  string: (x) => String(x ?? ""),
  number: (x) => num(x),
  coalesce: (...a) => a.find((x) => x !== null && x !== undefined && x !== ""),
};

function ev(n: Node, row: Record<string, unknown>, index: number): unknown {
  switch (n.k) {
    case "lit":
      return n.v;
    case "id":
      if (n.name in row) return row[n.name];
      if (n.name === "index") return index;
      if (n.name === "PI") return Math.PI;
      throw new ToolError(`Formula refers to "${n.name}", which is not an earlier field. Fields: ${Object.keys(row).join(", ") || "(none yet)"}`);
    case "un": {
      const a = ev(n.a, row, index);
      return n.op === "-" ? -num(a) : !a;
    }
    case "tern":
      return ev(n.c, row, index) ? ev(n.a, row, index) : ev(n.b, row, index);
    case "call": {
      const f = FNS[n.fn];
      if (!f) throw new ToolError(`Unknown function ${n.fn}(). Available: ${Object.keys(FNS).join(", ")}`);
      return f(...n.args.map((a) => ev(a, row, index)));
    }
    case "bin": {
      if (n.op === "&&") return ev(n.a, row, index) && ev(n.b, row, index);
      if (n.op === "||") return ev(n.a, row, index) || ev(n.b, row, index);
      const a = ev(n.a, row, index), b = ev(n.b, row, index);
      switch (n.op) {
        case "+": {
          if (typeof a === "string" || typeof b === "string") return `${a ?? ""}${b ?? ""}`;
          const r = num(a) + num(b);
          return Math.round(r * 1e10) / 1e10;
        }
        case "-": return Math.round((num(a) - num(b)) * 1e10) / 1e10;
        case "*": return Math.round(num(a) * num(b) * 1e10) / 1e10;
        case "/": return num(b) === 0 ? null : num(a) / num(b);
        case "%": return num(a) % num(b);
        case "==": return a == b;
        case "!=": return a != b;
        case "<": return num(a) < num(b);
        case "<=": return num(a) <= num(b);
        case ">": return num(a) > num(b);
        case ">=": return num(a) >= num(b);
      }
    }
  }
  return null;
}

const cache = new Map<string, Node>();
export function evalFormula(src: string, row: Record<string, unknown>, index = 0): unknown {
  let n = cache.get(src);
  if (!n) {
    n = parse(src);
    cache.set(src, n);
  }
  return ev(n, row, index);
}

export const FORMULA_FUNCTIONS = Object.keys(FNS);
