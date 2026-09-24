/**
 * Template-driven random JSON. String values holding {{tokens}} are replaced
 * with faker-backed data (a lone token keeps its type: numbers stay numbers),
 * and ["{{repeat n}}", item] arrays expand into n copies.
 */
import type { Faker } from "@faker-js/faker";
import { ToolError } from "../types";
import { FIELD_TYPES, TYPE_BY_KEY, autoType, fromPattern, type FieldArgs } from "./G-fake";

type Gen = (f: Faker, args: string[], c: { index: number; row: Record<string, unknown>; rnd: () => number }) => unknown;

const num = (s: string | undefined, d: number) => (s === undefined || s === "" || !Number.isFinite(Number(s)) ? d : Number(s));
const toDate = (s: string | undefined, d: string) => {
  const t = new Date(s || d);
  if (Number.isNaN(t.getTime())) throw new ToolError(`"${s}" is not a date — use YYYY-MM-DD.`);
  return t;
};

export type TokenDoc = { token: string; args: string; desc: string; sample?: string };

/** Tokens with their own argument grammar. Everything in FIELD_TYPES is also a token. */
const SPECIAL: Record<string, { gen: Gen; args: string; desc: string; sample: string }> = {
  int: { args: "min max", desc: "Whole number in [min, max] (a number, not a string)", sample: "{{int 1 100}}", gen: (f, a) => f.number.int({ min: num(a[0], 0), max: num(a[1], 1000) }) },
  float: { args: "min max decimals", desc: "Decimal number rounded to `decimals` places", sample: "{{float 0 1 3}}", gen: (f, a) => f.number.float({ min: num(a[0], 0), max: num(a[1], 1), fractionDigits: num(a[2], 2) }) },
  bool: { args: "[percentTrue]", desc: "true / false, optionally weighted", sample: "{{bool 80}}", gen: (f, a) => f.datatype.boolean({ probability: num(a[0], 50) / 100 }) },
  date: { args: "from to", desc: "Date YYYY-MM-DD between two dates", sample: "{{date 2020-01-01 2025-12-31}}", gen: (f, a) => f.date.between({ from: toDate(a[0], "2020-01-01"), to: toDate(a[1], "2025-12-31") }).toISOString().slice(0, 10) },
  datetime: { args: "from to", desc: "ISO-8601 timestamp between two dates", sample: "{{datetime 2024-01-01 2024-12-31}}", gen: (f, a) => f.date.between({ from: toDate(a[0], "2020-01-01"), to: toDate(a[1], "2025-12-31") }).toISOString() },
  pick: { args: "a b c …", desc: "One of the listed values (quote values with spaces; numbers stay numbers)", sample: "{{pick red green blue}}", gen: (f, a) => { if (!a.length) throw new ToolError("{{pick}} needs at least one value, e.g. {{pick red green blue}}."); return autoType(f.helpers.arrayElement(a)); } },
  weighted: { args: "a:70 b:30 …", desc: "Weighted choice", sample: "{{weighted active:80 banned:5 pending:15}}", gen: (f, a) => f.helpers.weightedArrayElement(a.map((x) => { const m = /^(.*):(\d+(?:\.\d+)?)$/.exec(x); return { value: autoType(m ? m[1] : x), weight: m ? +m[2] : 1 }; })) },
  lorem: { args: "words", desc: "Lorem ipsum words", sample: "{{lorem 8}}", gen: (f, a) => f.lorem.words(num(a[0], 5)) },
  sentence: { args: "[words]", desc: "One sentence", sample: "{{sentence}}", gen: (f, a) => (a[0] ? f.lorem.sentence(num(a[0], 8)) : f.lorem.sentence()) },
  paragraph: { args: "[sentences]", desc: "One paragraph", sample: "{{paragraph 2}}", gen: (f, a) => f.lorem.paragraph(num(a[0], 3)) },
  index: { args: "[start]", desc: "Position in the enclosing repeat (0-based; {{index 1}} starts at 1)", sample: "{{index 1}}", gen: (_f, a, c) => c.index + num(a[0], 0) },
  price: { args: "[min max]", desc: "Price with two decimals", sample: "{{price 5 250}}", gen: (f, a, c) => TYPE_BY_KEY.price.gen(f, { min: num(a[0], 1), max: num(a[1], 500) }, c) },
  name: { args: "", desc: "Full name", sample: "{{name}}", gen: (f) => f.person.fullName() },
  color: { args: "", desc: "Hex colour", sample: "{{color}}", gen: (f) => f.color.rgb({ format: "hex", casing: "lower" }) },
  guid: { args: "", desc: "UUID v4 (alias)", sample: "{{guid}}", gen: (f) => f.string.uuid() },
  pattern: { args: "PATTERN", desc: "# digit, A upper, a lower, X hex, [a-z]{n}", sample: "{{pattern INV-####-AA}}", gen: (_f, a, c) => fromPattern(a.join(" ") || "AA-####", c.rnd) },
  now: { args: "", desc: "Current timestamp (ISO)", sample: "{{now}}", gen: () => new Date().toISOString() },
  timestamp: { args: "[from to]", desc: "Unix seconds", sample: "{{timestamp}}", gen: (f, a) => Math.floor(f.date.between({ from: toDate(a[0], "2020-01-01"), to: toDate(a[1], "2025-12-31") }).getTime() / 1000) },
  zip: { args: "", desc: "Postcode", sample: "{{zip}}", gen: (f) => f.location.zipCode() },
  lat: { args: "", desc: "Latitude", sample: "{{lat}}", gen: (f) => f.location.latitude({ precision: 5 }) },
  lng: { args: "", desc: "Longitude", sample: "{{lng}}", gen: (f) => f.location.longitude({ precision: 5 }) },
  tags: { args: "min max", desc: "Array of lorem words (a real JSON array)", sample: "{{tags 1 4}}", gen: (f, a) => f.helpers.uniqueArray(() => f.word.noun(), f.number.int({ min: num(a[0], 1), max: num(a[1], 3) })) },
};

const ALIASES: Record<string, string> = { guid: "guid", firstname: "firstName", lastname: "lastName", fullname: "fullName", ip: "ipv4", ipv4: "ipv4", boolean: "bool", integer: "int", number: "int", text: "sentence", words: "lorem", phoneNumber: "phone" };

function lookup(name: string): Gen | null {
  if (SPECIAL[name]) return SPECIAL[name].gen;
  const t = TYPE_BY_KEY[name] ?? TYPE_BY_KEY[ALIASES[name] ?? ""] ?? FIELD_TYPES.find((x) => x.key.toLowerCase() === name.toLowerCase());
  const s = SPECIAL[ALIASES[name] ?? ""] ?? SPECIAL[name.toLowerCase()];
  if (s) return s.gen;
  if (!t) return null;
  return (f, a, c) => {
    const args: FieldArgs = {};
    (t.args ?? []).forEach((k, i) => {
      if (a[i] === undefined) return;
      if (k === "values" || k === "pattern" || k === "formula" || k === "from" || k === "to" || k === "value") (args as Record<string, string>)[k] = k === "values" || k === "pattern" ? a.slice(i).join(" ") : a[i];
      else (args as Record<string, number>)[k] = Number(a[i]);
    });
    return t.gen(f, args, c);
  };
}

export function tokenDocs(): TokenDoc[] {
  const docs: TokenDoc[] = Object.entries(SPECIAL).map(([k, v]) => ({ token: v.sample, args: v.args, desc: v.desc }));
  for (const t of FIELD_TYPES) {
    if (SPECIAL[t.key] || t.key === "formula") continue;
    docs.push({ token: `{{${t.key}${t.args?.length ? " " + t.args.join(" ") : ""}}}`, args: (t.args ?? []).join(" "), desc: `${t.label} (${t.group})` });
  }
  docs.push({ token: '["{{repeat 5}}", {…}]', args: "n  |  min max", desc: "Array directive: n copies of the item (or a random count between min and max)" });
  return docs;
}

function tokenize(argStr: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(argStr))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

// Arguments may contain {n} / {m,n} repeat counts (for {{pattern}}), nothing else with braces.
const TOKEN = /\{\{\s*([A-Za-z_]\w*)\s*((?:[^{}]|\{\d+(?:,\d+)?\})*)\}\}/g;
const WHOLE = /^\{\{\s*([A-Za-z_]\w*)\s*((?:[^{}]|\{\d+(?:,\d+)?\})*)\}\}$/;
const REPEAT = /^\{\{\s*repeat\s+(\d+)(?:\s+(\d+))?\s*\}\}$/i;

export type GenStats = { nodes: number; tokens: number; repeats: number };

export function generate(template: unknown, f: Faker, rnd: () => number): { value: unknown; stats: GenStats } {
  const stats: GenStats = { nodes: 0, tokens: 0, repeats: 0 };
  const LIMIT = 250_000;
  const pathStr = (p: (string | number)[]) => "$" + p.map((x) => (typeof x === "number" ? `[${x}]` : /^[A-Za-z_$][\w$]*$/.test(x) ? `.${x}` : `[${JSON.stringify(x)}]`)).join("");

  function token(name: string, argStr: string, index: number, row: Record<string, unknown>, path: (string | number)[]): unknown {
    const g = lookup(name);
    if (!g) {
      const near = [...Object.keys(SPECIAL), ...FIELD_TYPES.map((t) => t.key)].filter((k) => k.toLowerCase().startsWith(name.slice(0, 2).toLowerCase())).slice(0, 6);
      throw new ToolError(`Unknown token {{${name}}} at ${pathStr(path)}.${near.length ? ` Did you mean: ${near.map((n) => `{{${n}}}`).join(", ")}?` : ""} Open the Tokens tab for the full list.`);
    }
    stats.tokens++;
    try {
      return g(f, tokenize(argStr.trim()), { index, row, rnd });
    } catch (e) {
      if (e instanceof ToolError) throw new ToolError(`${e.message} (at ${pathStr(path)})`);
      throw new ToolError(`{{${name}${argStr ? " " + argStr.trim() : ""}}} failed at ${pathStr(path)}: ${(e as Error).message}`);
    }
  }

  function walk(node: unknown, index: number, row: Record<string, unknown>, path: (string | number)[]): unknown {
    if (++stats.nodes > LIMIT) throw new ToolError(`The template expands to more than ${LIMIT.toLocaleString()} values — lower the repeat counts.`);
    if (typeof node === "string") {
      const whole = WHOLE.exec(node);
      if (whole) {
        if (whole[1].toLowerCase() === "repeat") throw new ToolError(`{{repeat}} at ${pathStr(path)} must be the first element of an array: ["{{repeat 5}}", { … }].`);
        return token(whole[1], whole[2], index, row, path);
      }
      if (!node.includes("{{")) return node;
      return node.replace(TOKEN, (_m, name: string, args: string) => {
        const v = token(name, args, index, row, path);
        return v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
      });
    }
    if (Array.isArray(node)) {
      const head = node[0];
      const m = typeof head === "string" ? REPEAT.exec(head.trim()) : null;
      if (m) {
        stats.repeats++;
        const lo = +m[1], hi = m[2] !== undefined ? +m[2] : lo;
        if (hi < lo) throw new ToolError(`{{repeat ${lo} ${hi}}} at ${pathStr(path)}: the maximum is smaller than the minimum.`);
        const n = lo + Math.floor(rnd() * (hi - lo + 1));
        const items = node.slice(1);
        if (!items.length) throw new ToolError(`["{{repeat ${m[1]}}}"] at ${pathStr(path)} needs an item to repeat after it.`);
        return Array.from({ length: n }, (_, i) => walk(items[i % items.length], i, {}, [...path, i]));
      }
      return node.map((x, i) => walk(x, index, {}, [...path, i]));
    }
    if (node && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node)) out[k] = walk(v, index, out, [...path, k]);
      return out;
    }
    return node;
  }

  return { value: walk(template, 0, {}, []), stats };
}
