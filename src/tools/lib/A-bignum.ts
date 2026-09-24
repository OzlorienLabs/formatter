/**
 * An arbitrary-precision expression evaluator. Integer mode works on BigInt;
 * decimal mode on exact rationals (BigInt numerator / denominator), rounded
 * only for display — so 1/3*3 is exactly 1. Irrational functions (sqrt, root,
 * pi, e, fractional powers) are computed to the requested precision plus guard
 * digits. Errors carry the column of the offending character.
 */

export class CalcError extends Error {
  constructor(message: string, public pos: number) {
    super(message);
  }
}

/* ── rationals ───────────────────────────────────────────────────────── */

export type Q = { n: bigint; d: bigint };

const babs = (a: bigint) => (a < 0n ? -a : a);
export function bgcd(a: bigint, b: bigint): bigint {
  a = babs(a);
  b = babs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}
function q(n: bigint, d: bigint = 1n): Q {
  if (d === 0n) throw new Error("division by zero");
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const g = bgcd(n, d);
  return g > 1n ? { n: n / g, d: d / g } : { n, d };
}
const isInt = (x: Q) => x.d === 1n;
const add = (a: Q, b: Q) => q(a.n * b.d + b.n * a.d, a.d * b.d);
const sub = (a: Q, b: Q) => q(a.n * b.d - b.n * a.d, a.d * b.d);
const mul = (a: Q, b: Q) => q(a.n * b.n, a.d * b.d);
const div = (a: Q, b: Q) => q(a.n * b.d, a.d * b.n);
const cmp = (a: Q, b: Q) => {
  const x = a.n * b.d - b.n * a.d;
  return x < 0n ? -1 : x > 0n ? 1 : 0;
};
const trunc = (a: Q) => a.n / a.d;
const floor = (a: Q) => (a.n >= 0n || a.n % a.d === 0n ? a.n / a.d : a.n / a.d - 1n);
const bitLen = (a: bigint) => (a === 0n ? 0 : babs(a).toString(2).length);

export function isqrt(n: bigint): bigint {
  if (n < 0n) throw new Error("square root of a negative number");
  if (n < 2n) return n;
  let x = 1n << BigInt(Math.ceil(bitLen(n) / 2));
  for (;;) {
    const y = (x + n / x) >> 1n;
    if (y >= x) return x;
    x = y;
  }
}

function iroot(n: bigint, k: bigint): bigint {
  if (k === 2n) return isqrt(n);
  if (n < 2n) return n;
  let x = 1n << BigInt(Math.ceil(bitLen(n) / Number(k)) + 1);
  for (;;) {
    const y = ((k - 1n) * x + n / x ** (k - 1n)) / k;
    if (y >= x) return x;
    x = y;
  }
}

function powQ(a: Q, e: bigint): Q {
  if (e < 0n) {
    if (a.n === 0n) throw new Error("zero to a negative power");
    return powQ(q(a.d, a.n), -e);
  }
  return q(a.n ** e, a.d ** e);
}

const TEN = (k: number) => 10n ** BigInt(k);

/** Round a rational to `p` decimal places. mode: half-up | half-even | down. */
export function roundQ(x: Q, p: number, mode: string): { int: bigint; exact: boolean } {
  const s = x.n * TEN(p);
  let r = s / x.d;
  const rem = s % x.d;
  if (rem !== 0n && mode !== "down") {
    const twice = babs(rem) * 2n;
    const up = twice > x.d || (twice === x.d && (mode === "half-up" || r % 2n !== 0n));
    if (up) r += s < 0n ? -1n : 1n;
  }
  return { int: r, exact: rem === 0n };
}

function scaledToString(v: bigint, p: number, trim: boolean): string {
  const neg = v < 0n;
  let s = babs(v).toString();
  if (p > 0) {
    s = s.padStart(p + 1, "0");
    let frac = s.slice(-p);
    const ip = s.slice(0, -p);
    if (trim) frac = frac.replace(/0+$/, "");
    s = frac ? `${ip}.${frac}` : ip;
  }
  return (neg && /[1-9]/.test(s) ? "-" : "") + s;
}

/* ── constants ───────────────────────────────────────────────────────── */

function atanInv(x: bigint, scale: bigint): bigint {
  let sum = scale / x;
  let term = sum;
  const x2 = x * x;
  let k = 1n;
  let sign = -1n;
  while (term !== 0n) {
    term /= x2;
    sum += (sign * term) / (2n * k + 1n);
    sign = -sign;
    k++;
  }
  return sum;
}

function piQ(digits: number): Q {
  const guard = digits + 12;
  const scale = TEN(guard);
  const pi = 4n * (4n * atanInv(5n, scale) - atanInv(239n, scale));
  return q(pi, scale);
}

function eQ(digits: number): Q {
  const guard = digits + 12;
  const scale = TEN(guard);
  let sum = 0n;
  let term = scale;
  let k = 1n;
  while (term !== 0n) {
    sum += term;
    term /= k++;
  }
  return q(sum, scale);
}

function rootQ(x: Q, k: bigint, digits: number): Q {
  if (x.n < 0n && k % 2n === 0n) throw new Error("even root of a negative number");
  const neg = x.n < 0n;
  const guard = digits + 12;
  const scale = TEN(guard);
  const inner = (babs(x.n) * scale ** k) / x.d;
  const r = iroot(inner, k);
  return q(neg ? -r : r, scale);
}

/* ── tokens & parser ─────────────────────────────────────────────────── */

type Tok = { t: "num" | "id" | "op" | "end"; v: string; pos: number };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === "#" || src.startsWith("//", i)) break;
    const rest = src.slice(i);
    let m = rest.match(/^0[xX][0-9a-fA-F_]+|^0[bB][01_]+|^0[oO][0-7_]+/);
    if (!m) m = rest.match(/^(\d[\d_]*(\.\d*)?|\.\d+)([eE][+-]?\d+)?/);
    if (m) {
      out.push({ t: "num", v: m[0], pos: i });
      i += m[0].length;
      if (/^[A-Za-z_]/.test(src[i] ?? "") && !/^0[xob]/i.test(m[0])) throw new CalcError(`Unexpected "${src[i]}" right after the number ${m[0]}`, i);
      continue;
    }
    m = rest.match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (m) {
      out.push({ t: "id", v: m[0], pos: i });
      i += m[0].length;
      continue;
    }
    if (rest.startsWith("**")) { out.push({ t: "op", v: "^", pos: i }); i += 2; continue; }
    const map: Record<string, string> = { "×": "*", "·": "*", "÷": "/", "−": "-", "–": "-" };
    if ("+-*/%^!(),=".includes(c) || map[c]) {
      out.push({ t: "op", v: map[c] ?? c, pos: i });
      i++;
      continue;
    }
    throw new CalcError(`Unexpected character "${c}"`, i);
  }
  out.push({ t: "end", v: "", pos: src.length });
  return out;
}

type Node =
  | { k: "num"; v: string; pos: number }
  | { k: "id"; v: string; pos: number }
  | { k: "neg"; a: Node; pos: number }
  | { k: "bin"; op: string; a: Node; b: Node; pos: number }
  | { k: "fact"; a: Node; pos: number }
  | { k: "call"; f: string; args: Node[]; pos: number };

function parse(toks: Tok[]): Node {
  let p = 0;
  const peek = () => toks[p];
  const eat = (v: string) => {
    const t = toks[p];
    if (t.t === "op" && t.v === v) {
      p++;
      return t;
    }
    return null;
  };
  const expect = (v: string, what: string) => {
    const t = eat(v);
    if (!t) {
      const c = peek();
      throw new CalcError(c.t === "end" ? `Missing "${v}" ${what}` : `Expected "${v}" ${what}, found "${c.v}"`, c.pos);
    }
    return t;
  };
  function expr(): Node {
    let a = term();
    for (;;) {
      const t = peek();
      if (t.t === "op" && (t.v === "+" || t.v === "-")) {
        p++;
        a = { k: "bin", op: t.v, a, b: term(), pos: t.pos };
      } else return a;
    }
  }
  function term(): Node {
    let a = unary();
    for (;;) {
      const t = peek();
      if (t.t === "op" && (t.v === "*" || t.v === "/" || t.v === "%")) {
        p++;
        a = { k: "bin", op: t.v, a, b: unary(), pos: t.pos };
      } else if (t.t === "id" && t.v === "mod") {
        p++;
        a = { k: "call", f: "mod", args: [a, unary()], pos: t.pos };
      } else if ((t.t === "op" && t.v === "(") || t.t === "id" || t.t === "num") {
        throw new CalcError(`Missing operator before "${t.v}" (write * for multiplication)`, t.pos);
      } else return a;
    }
  }
  function unary(): Node {
    const t = peek();
    if (t.t === "op" && t.v === "-") {
      p++;
      return { k: "neg", a: unary(), pos: t.pos };
    }
    if (t.t === "op" && t.v === "+") {
      p++;
      return unary();
    }
    return power();
  }
  function power(): Node {
    const a = postfix();
    const t = peek();
    if (t.t === "op" && t.v === "^") {
      p++;
      return { k: "bin", op: "^", a, b: unary(), pos: t.pos };
    }
    return a;
  }
  function postfix(): Node {
    let a = primary();
    for (;;) {
      const t = eat("!");
      if (!t) return a;
      a = { k: "fact", a, pos: t.pos };
    }
  }
  function primary(): Node {
    const t = peek();
    if (t.t === "num") {
      p++;
      return { k: "num", v: t.v, pos: t.pos };
    }
    if (t.t === "id") {
      p++;
      if (eat("(")) {
        const args: Node[] = [];
        if (!eat(")")) {
          do args.push(expr());
          while (eat(","));
          expect(")", `to close ${t.v}(`);
        }
        return { k: "call", f: t.v, args, pos: t.pos };
      }
      return { k: "id", v: t.v, pos: t.pos };
    }
    if (eat("(")) {
      const e = expr();
      expect(")", "to close the parenthesis");
      return e;
    }
    if (t.t === "end") throw new CalcError("Expression ends too early — a number or ( is missing", t.pos);
    throw new CalcError(`Unexpected "${t.v}"`, t.pos);
  }
  const root = expr();
  const t = peek();
  if (t.t !== "end") throw new CalcError(t.v === ")" ? 'Unmatched ")"' : t.v === "=" ? 'Unexpected "=" — assign with "name = expression" at the start of a line' : `Unexpected "${t.v}"`, t.pos);
  return root;
}

/* ── evaluation ──────────────────────────────────────────────────────── */

export type CalcOpts = { mode: "int" | "dec"; precision: number; rounding: string };

export const FUNCS = ["abs", "min", "max", "gcd", "lcm", "pow", "modpow", "modinv", "mod", "isqrt", "sqrt", "cbrt", "root", "floor", "ceil", "round", "trunc", "sign", "fact", "binom", "digits", "bits"];
const CONSTS = ["pi", "e", "ans"];

const MAX_BITS = 40_000_000;

function literal(v: string, pos: number, o: CalcOpts): Q {
  const s = v.replace(/_/g, "");
  if (/^0[xob]/i.test(s)) {
    if (s.length < 3) throw new CalcError(`Incomplete number "${v}"`, pos);
    return q(BigInt(s));
  }
  const m = s.match(/^(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/)!;
  const ip = m[1] || "0", fp = m[2] ?? "", ex = Number(m[3] ?? 0);
  if (Math.abs(ex) > 100000) throw new CalcError(`Exponent ${ex} is too large`, pos);
  let x = q(BigInt(ip + fp), TEN(fp.length));
  x = ex >= 0 ? mul(x, q(TEN(ex))) : div(x, q(TEN(-ex)));
  if (o.mode === "int" && !isInt(x)) throw new CalcError(`${v} is not an integer — switch to Decimal mode for fractions`, pos);
  return x;
}

function needInt(x: Q, what: string, pos: number): bigint {
  if (!isInt(x)) throw new CalcError(`${what} needs an integer`, pos);
  return x.n;
}

function factorial(n: bigint, pos: number): bigint {
  if (n < 0n) throw new CalcError("Factorial of a negative number is undefined", pos);
  if (n > 25000n) throw new CalcError(`${n}! is too large to compute here (limit 25000!)`, pos);
  // Split product for speed.
  const prod = (a: bigint, b: bigint): bigint => {
    if (b - a < 16n) {
      let r = 1n;
      for (let i = a; i <= b; i++) r *= i;
      return r;
    }
    const m = (a + b) / 2n;
    return prod(a, m) * prod(m + 1n, b);
  };
  return n < 2n ? 1n : prod(2n, n);
}

function modpow(b: bigint, e: bigint, m: bigint): bigint {
  if (m === 0n) throw new Error("modulus is zero");
  if (e < 0n) {
    b = modinv(b, m);
    e = -e;
  }
  let r = 1n % m;
  b = ((b % m) + m) % m;
  while (e > 0n) {
    if (e & 1n) r = (r * b) % m;
    b = (b * b) % m;
    e >>= 1n;
  }
  return r;
}

function modinv(a: bigint, m: bigint): bigint {
  let [or, r] = [((a % m) + m) % m, babs(m)];
  let [os, s] = [1n, 0n];
  while (r) {
    const k = or / r;
    [or, r] = [r, or - k * r];
    [os, s] = [s, os - k * s];
  }
  if (or !== 1n) throw new Error(`${a} has no inverse modulo ${m} (gcd is ${or})`);
  return ((os % m) + m) % m;
}

export function evaluate(node: Node, vars: Map<string, Q>, o: CalcOpts): Q {
  const ev = (n: Node) => evaluate(n, vars, o);
  const digits = o.precision;
  try {
    switch (node.k) {
      case "num":
        return literal(node.v, node.pos, o);
      case "id": {
        const v = vars.get(node.v);
        if (v) return v;
        if (node.v === "pi" || node.v === "e") {
          if (o.mode === "int") throw new CalcError(`${node.v} is irrational — switch to Decimal mode`, node.pos);
          return node.v === "pi" ? piQ(digits) : eQ(digits);
        }
        if (node.v === "ans") throw new CalcError("ans is empty — it holds the previous line's result", node.pos);
        if (FUNCS.includes(node.v)) throw new CalcError(`${node.v} is a function — call it like ${node.v}(…)`, node.pos);
        throw new CalcError(`Unknown variable "${node.v}" — define it on an earlier line: ${node.v} = …`, node.pos);
      }
      case "neg": {
        const a = ev(node.a);
        return { n: -a.n, d: a.d };
      }
      case "fact":
        return q(factorial(needInt(ev(node.a), "Factorial", node.pos), node.pos));
      case "bin": {
        const a = ev(node.a), b = ev(node.b);
        switch (node.op) {
          case "+": return add(a, b);
          case "-": return sub(a, b);
          case "*": return mul(a, b);
          case "/":
            if (b.n === 0n) throw new CalcError("Division by zero", node.pos);
            if (o.mode === "int") return q(a.n / b.n);
            return div(a, b);
          case "%":
            if (b.n === 0n) throw new CalcError("Modulo by zero", node.pos);
            return sub(a, mul(b, q(trunc(div(a, b)))));
          case "^": {
            if (isInt(b)) {
              const e = b.n;
              if (e < 0n && o.mode === "int") throw new CalcError("Negative exponent gives a fraction — switch to Decimal mode", node.pos);
              const est = Number(babs(e)) * Math.max(bitLen(a.n), bitLen(a.d));
              if (est > MAX_BITS) throw new CalcError(`Result would have about ${Math.round(est * 0.30103).toLocaleString()} digits — too large`, node.pos);
              return powQ(a, e);
            }
            if (o.mode === "int") throw new CalcError("Fractional exponent in Integer mode", node.pos);
            if (b.d > 10000n) throw new CalcError("Fractional exponents need a small denominator (e.g. ^0.5, ^(1/3))", node.pos);
            const base = powQ(a, b.n < 0n ? -b.n : b.n);
            const r = rootQ(base, b.d, digits);
            return b.n < 0n ? div(q(1n), r) : r;
          }
        }
        throw new CalcError(`Unknown operator ${node.op}`, node.pos);
      }
      case "call": {
        const f = node.f.toLowerCase();
        const args = node.args.map(ev);
        const arity = (min: number, max = min) => {
          if (args.length < min || args.length > max)
            throw new CalcError(`${f}() takes ${min === max ? min : `${min}–${max === Infinity ? "any number of" : max}`} argument${max === 1 ? "" : "s"}, got ${args.length}`, node.pos);
        };
        const I = (i: number) => needInt(args[i], `${f}()`, node.pos);
        switch (f) {
          case "abs": arity(1); return { n: babs(args[0].n), d: args[0].d };
          case "sign": arity(1); return q(args[0].n > 0n ? 1n : args[0].n < 0n ? -1n : 0n);
          case "min": arity(1, Infinity); return args.reduce((a, b) => (cmp(a, b) <= 0 ? a : b));
          case "max": arity(1, Infinity); return args.reduce((a, b) => (cmp(a, b) >= 0 ? a : b));
          case "gcd": arity(1, Infinity); return q(args.map((_, i) => I(i)).reduce(bgcd));
          case "lcm": arity(1, Infinity); return q(args.map((_, i) => I(i)).reduce((a, b) => (a === 0n || b === 0n ? 0n : babs(a * b) / bgcd(a, b))));
          case "pow": arity(2); return ev({ k: "bin", op: "^", a: node.args[0], b: node.args[1], pos: node.pos });
          case "modpow": arity(3); return q(modpow(I(0), I(1), I(2)));
          case "modinv": arity(2); return q(modinv(I(0), I(1)));
          case "mod": { arity(2); const m = I(1); if (m === 0n) throw new CalcError("Modulo by zero", node.pos); const r = I(0) % m; return q(r < 0n ? r + babs(m) : r); }
          case "isqrt": arity(1); return q(isqrt(I(0)));
          case "sqrt":
            arity(1);
            if (args[0].n < 0n) throw new CalcError("Square root of a negative number", node.pos);
            if (o.mode === "int") return q(isqrt(trunc(args[0])));
            return rootQ(args[0], 2n, digits);
          case "cbrt":
            arity(1);
            if (o.mode === "int") { const n = I(0); const r = iroot(babs(n), 3n); return q(n < 0n ? -r : r); }
            return rootQ(args[0], 3n, digits);
          case "root": {
            arity(2);
            const k = I(1);
            if (k < 1n) throw new CalcError("root(x, n) needs n ≥ 1", node.pos);
            if (o.mode === "int") { if (args[0].n < 0n) throw new CalcError("Root of a negative number", node.pos); return q(iroot(I(0), k)); }
            return rootQ(args[0], k, digits);
          }
          case "floor": arity(1); return q(floor(args[0]));
          case "ceil": arity(1); return q(-floor({ n: -args[0].n, d: args[0].d }));
          case "trunc": arity(1); return q(trunc(args[0]));
          case "round": {
            arity(1, 2);
            const p = args[1] ? Number(I(1)) : 0;
            const r = roundQ(args[0], p, "half-up");
            return q(r.int, TEN(p));
          }
          case "fact": arity(1); return q(factorial(I(0), node.pos));
          case "binom": {
            arity(2);
            const n = I(0), k = I(1);
            if (k < 0n || k > n) return q(0n);
            let r = 1n;
            const kk = k > n - k ? n - k : k;
            for (let i = 1n; i <= kk; i++) r = (r * (n - kk + i)) / i;
            return q(r);
          }
          case "digits": arity(1); return q(BigInt(babs(I(0)).toString().length));
          case "bits": arity(1); return q(BigInt(bitLen(I(0))));
        }
        throw new CalcError(`Unknown function ${node.f}() — available: ${FUNCS.join(", ")}`, node.pos);
      }
    }
  } catch (e) {
    if (e instanceof CalcError) throw e;
    throw new CalcError((e as Error).message.replace(/^./, (c) => c.toUpperCase()), node.pos);
  }
}

/* ── lines ───────────────────────────────────────────────────────────── */

export type LineResult = { line: number; src: string; name?: string; value: Q; text: string; exact: boolean; digits: number; sci: string; fraction?: string };

export function formatQ(x: Q, o: CalcOpts & { group?: boolean }): { text: string; exact: boolean } {
  if (o.mode === "int" || isInt(x)) {
    const s = (isInt(x) ? x.n : trunc(x)).toString();
    return { text: o.group ? groupDigits(s) : s, exact: true };
  }
  const r = roundQ(x, o.precision, o.rounding);
  const s = scaledToString(r.int, o.precision, true);
  return { text: o.group ? groupDigits(s) : s, exact: r.exact };
}

export function groupDigits(s: string): string {
  const m = s.match(/^(-?)(\d+)(.*)$/);
  if (!m) return s;
  return m[1] + m[2].replace(/\B(?=(\d{3})+(?!\d))/g, ",") + m[3];
}

export function sciOf(x: Q, sig = 15): string {
  if (x.n === 0n) return "0";
  const neg = x.n < 0n;
  const n = babs(x.n), d = x.d;
  // e = floor(log10(|x|)): the length difference is right or one too high.
  let e = n.toString().length - d.toString().length;
  const below = e >= 0 ? n < d * TEN(e) : n * TEN(-e) < d;
  if (below) e--;
  const k = sig - 1 - e;
  const ds = (k >= 0 ? (n * TEN(k)) / d : n / (d * TEN(-k))).toString();
  const frac = ds.slice(1).replace(/0+$/, "");
  return `${neg ? "-" : ""}${ds[0]}${frac ? "." + frac : ""}e${e >= 0 ? "+" : ""}${e}`;
}

export function runLines(src: string, o: CalcOpts & { group?: boolean }): { results: LineResult[]; vars: Map<string, Q> } {
  const vars = new Map<string, Q>();
  const results: LineResult[] = [];
  const lines = src.split(/\r?\n/);
  lines.forEach((raw, idx) => {
    const code = raw.replace(/(#|\/\/).*$/, "");
    if (!code.trim()) return;
    let name: string | undefined;
    let body = code;
    let offset = 0;
    const m = code.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(?!=)/);
    if (m) {
      name = m[1];
      if (FUNCS.includes(name) || name === "ans")
        throw Object.assign(new CalcError(`"${name}" is reserved and cannot be assigned`, code.indexOf(name)), { line: idx + 1, src: raw });
      body = code.slice(m[0].length);
      offset = m[0].length;
    }
    let value: Q;
    try {
      value = evaluate(parse(tokenize(body)), vars, o);
    } catch (e) {
      const ce = e instanceof CalcError ? e : new CalcError((e as Error).message, 0);
      throw Object.assign(ce, { pos: ce.pos + offset, line: idx + 1, src: raw });
    }
    if (name) vars.set(name, value);
    vars.set("ans", value);
    const f = formatQ(value, o);
    const intPart = babs(trunc(value)).toString();
    results.push({
      line: idx + 1,
      src: raw.trim(),
      name,
      value,
      text: f.text,
      exact: f.exact,
      digits: intPart === "0" && !isInt(value) ? 0 : intPart.length,
      sci: sciOf(value),
      fraction: !isInt(value) && o.mode === "dec" && value.n.toString().length + value.d.toString().length < 80 ? `${value.n}/${value.d}` : undefined,
    });
  });
  void CONSTS;
  return { results, vars };
}
