/** Text Toolbox operations: case conversion, line operations and text transforms. */

export type TextParams = {
  sep: string;
  n: number;
  prefix: string;
  suffix: string;
  pattern: string;
  replace: string;
  flags: string;
  regex: boolean;
  ci: boolean;
  cols: string;
};

export type Op = { id: string; group: "Case" | "Lines" | "Text" | "Extract"; label: string; params?: (keyof TextParams)[]; run: (s: string, p: TextParams) => string };

const unescape = (s: string) => s.replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\r/g, "\r");
const lines = (s: string) => s.replace(/\r\n?/g, "\n").split("\n");
const perLine = (f: (l: string) => string) => (s: string) => lines(s).map(f).join("\n");

/** Split an identifier or phrase into words: camelCase, snake_case, kebab-case, spaces. */
export function words(s: string): string[] {
  return s
    .replace(/([\p{Ll}\d])(\p{Lu})/gu, "$1 $2")
    .replace(/(\p{Lu}+)(\p{Lu}\p{Ll})/gu, "$1 $2")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}
const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
const SMALL = new Set("a an and as at but by en for if in nor of on or per the to v vs via".split(" "));

function titleCase(l: string): string {
  const parts = l.split(/(\s+)/);
  const idx = parts.map((p, k) => (p.trim() ? k : -1)).filter((k) => k >= 0);
  return parts
    .map((p, k) => {
      if (!p.trim()) return p;
      const lower = p.toLowerCase();
      const prevWord = idx[idx.indexOf(k) - 1];
      const afterColon = prevWord !== undefined && /[:—–!?.]$/.test(parts[prevWord]);
      if (k !== idx[0] && k !== idx[idx.length - 1] && !afterColon && SMALL.has(lower.replace(/[^\p{L}]/gu, ""))) return lower;
      if (/[\p{Ll}][\p{Lu}]/u.test(p) || /^[\p{Lu}\d]{2,}$/u.test(p)) return p; // iPhone, NASA
      return p.replace(/^([^\p{L}]*)(\p{L})/u, (_m, a: string, b: string) => a + b.toUpperCase()).replace(/(-)(\p{Ll})/gu, (_m, a: string, b: string) => a + b.toUpperCase());
    })
    .join("");
}

function sentenceCase(s: string): string {
  return s.toLowerCase().replace(/(^\s*|[.!?]\s+|\n\s*)(\p{Ll})/gu, (_m, a: string, b: string) => a + b.toUpperCase()).replace(/\bi\b/g, "I");
}

function reFrom(p: TextParams, global = true): RegExp {
  const flags = [...new Set((p.flags || "") + (global ? "g" : "") + (p.ci ? "i" : ""))].join("");
  try {
    return p.regex ? new RegExp(p.pattern, flags.replace(/[^dgimsuy]/g, "")) : new RegExp(p.pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags.replace(/[^gimsuy]/g, ""));
  } catch (e) {
    throw new Error(`Invalid regular expression: ${(e as Error).message}`);
  }
}

const cmp = (ci: boolean) => (a: string, b: string) => (ci ? a.toLowerCase().localeCompare(b.toLowerCase()) : a < b ? -1 : a > b ? 1 : 0);

function wrap(s: string, width: number): string {
  const w = Math.max(1, width);
  return lines(s)
    .map((l) => {
      if (l.length <= w) return l;
      const indent = l.match(/^\s*/)![0];
      const out: string[] = [];
      let cur = "";
      for (const word of l.trim().split(/\s+/)) {
        if (!cur) cur = indent + word;
        else if ((cur + " " + word).length <= w) cur += " " + word;
        else { out.push(cur); cur = indent + word; }
      }
      if (cur) out.push(cur);
      return out.join("\n");
    })
    .join("\n");
}

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function splitColumns(l: string, sep: string): string[] {
  if (!sep || sep === "auto") return l.includes("\t") ? l.split("\t") : l.includes(",") ? l.split(",") : l.trim().split(/\s+/);
  if (sep === " ") return l.trim().split(/\s+/);
  return l.split(unescape(sep));
}

function parseCols(spec: string, max: number): number[] {
  const out: number[] = [];
  for (const part of spec.split(/[,\s]+/).filter(Boolean)) {
    const r = /^(-?\d+)?-(-?\d+)?$/.exec(part);
    if (r && part.includes("-") && !/^-\d+$/.test(part)) {
      const a = r[1] ? +r[1] : 1, b = r[2] ? +r[2] : max;
      for (let k = a; k <= b; k++) out.push(k);
    } else if (/^-?\d+$/.test(part)) out.push(+part < 0 ? max + 1 + +part : +part);
  }
  return out;
}

const ROT = (s: string) => s.replace(/[a-z]/gi, (c) => String.fromCharCode(((c.charCodeAt(0) - (c <= "Z" ? 65 : 97) + 13) % 26) + (c <= "Z" ? 65 : 97)));

export const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
export const URL_RE = /\b(?:https?|ftp|wss?):\/\/[^\s<>"'`)\]]+[^\s<>"'`)\].,;:!?]/g;
const IPV4_RE = /\b(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}\b/g;
const IPV6_RE = /(?<![\w:])(?:(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,7}:(?:[0-9a-fA-F]{1,4}(?::[0-9a-fA-F]{1,4}){0,6})?|::(?:[0-9a-fA-F]{1,4}(?::[0-9a-fA-F]{1,4}){0,6})?)(?![\w:])/g;
const NUM_RE = /[-+]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:[eE][-+]?\d+)?/g;

export const OPS: Op[] = [
  { id: "upper", group: "Case", label: "UPPER CASE", run: (s) => s.toUpperCase() },
  { id: "lower", group: "Case", label: "lower case", run: (s) => s.toLowerCase() },
  { id: "title", group: "Case", label: "Title Case", run: perLine(titleCase) },
  { id: "sentence", group: "Case", label: "Sentence case", run: sentenceCase },
  { id: "camel", group: "Case", label: "camelCase", run: perLine((l) => words(l).map((w, k) => (k ? cap(w) : w.toLowerCase())).join("")) },
  { id: "pascal", group: "Case", label: "PascalCase", run: perLine((l) => words(l).map(cap).join("")) },
  { id: "snake", group: "Case", label: "snake_case", run: perLine((l) => words(l).map((w) => w.toLowerCase()).join("_")) },
  { id: "kebab", group: "Case", label: "kebab-case", run: perLine((l) => words(l).map((w) => w.toLowerCase()).join("-")) },
  { id: "constant", group: "Case", label: "CONSTANT_CASE", run: perLine((l) => words(l).map((w) => w.toUpperCase()).join("_")) },
  { id: "dot", group: "Case", label: "dot.case", run: perLine((l) => words(l).map((w) => w.toLowerCase()).join(".")) },
  { id: "swap", group: "Case", label: "sWAP cASE", run: (s) => [...s].map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join("") },
  { id: "alternate", group: "Case", label: "aLtErNaTiNg", run: (s) => { let k = 0; return [...s].map((c) => (/\p{L}/u.test(c) ? (k++ % 2 ? c.toUpperCase() : c.toLowerCase()) : c)).join(""); } },

  { id: "sort-az", group: "Lines", label: "Sort A → Z", params: ["ci"], run: (s, p) => lines(s).sort(cmp(p.ci)).join("\n") },
  { id: "sort-za", group: "Lines", label: "Sort Z → A", params: ["ci"], run: (s, p) => lines(s).sort(cmp(p.ci)).reverse().join("\n") },
  { id: "sort-natural", group: "Lines", label: "Sort natural (file2 < file10)", params: ["ci"], run: (s, p) => lines(s).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: p.ci ? "base" : "variant" })).join("\n") },
  { id: "sort-length", group: "Lines", label: "Sort by length", run: (s) => lines(s).sort((a, b) => a.length - b.length || a.localeCompare(b)).join("\n") },
  { id: "shuffle", group: "Lines", label: "Shuffle (random)", run: (s) => shuffle(lines(s)).join("\n") },
  { id: "reverse-lines", group: "Lines", label: "Reverse line order", run: (s) => lines(s).reverse().join("\n") },
  { id: "dedupe", group: "Lines", label: "Remove duplicate lines", params: ["ci"], run: (s, p) => { const seen = new Set<string>(); return lines(s).filter((l) => { const k = p.ci ? l.toLowerCase().trim() : l; if (seen.has(k)) return false; seen.add(k); return true; }).join("\n"); } },
  { id: "remove-empty", group: "Lines", label: "Remove empty lines", run: (s) => lines(s).filter((l) => l.trim()).join("\n") },
  { id: "trim", group: "Lines", label: "Trim each line", run: perLine((l) => l.trim()) },
  { id: "number", group: "Lines", label: "Number lines", params: ["n", "sep"], run: (s, p) => { const ls = lines(s); const w = String(ls.length + p.n - 1).length; return ls.map((l, k) => String(k + p.n).padStart(w) + unescape(p.sep || ". ") + l).join("\n"); } },
  { id: "join", group: "Lines", label: "Join lines with separator", params: ["sep"], run: (s, p) => lines(s).filter((l) => l.trim()).join(unescape(p.sep)) },
  { id: "split", group: "Lines", label: "Split on delimiter", params: ["sep"], run: (s, p) => s.split(p.sep ? unescape(p.sep) : ",").map((x) => x.trim()).join("\n") },
  { id: "wrap", group: "Lines", label: "Wrap at N columns", params: ["n"], run: (s, p) => wrap(s, p.n) },
  { id: "affix", group: "Lines", label: "Add prefix / suffix", params: ["prefix", "suffix"], run: (s, p) => lines(s).map((l) => unescape(p.prefix) + l + unescape(p.suffix)).join("\n") },
  { id: "keep", group: "Lines", label: "Keep lines matching", params: ["pattern", "regex", "ci"], run: (s, p) => { const re = reFrom(p, false); return lines(s).filter((l) => re.test(l)).join("\n"); } },
  { id: "remove", group: "Lines", label: "Remove lines matching", params: ["pattern", "regex", "ci"], run: (s, p) => { const re = reFrom(p, false); return lines(s).filter((l) => !re.test(l)).join("\n"); } },
  { id: "column", group: "Lines", label: "Extract columns", params: ["sep", "cols"], run: (s, p) => lines(s).map((l) => { const c = splitColumns(l, p.sep); return parseCols(p.cols || "1", c.length).map((k) => c[k - 1] ?? "").join(p.sep && p.sep !== "auto" ? unescape(p.sep) : "\t"); }).join("\n") },

  { id: "reverse", group: "Text", label: "Reverse text", run: (s) => [...s].reverse().join("") },
  { id: "collapse", group: "Text", label: "Collapse whitespace", run: (s) => lines(s).map((l) => l.replace(/[ \t]+/g, " ").trim()).join("\n").replace(/\n{3,}/g, "\n\n") },
  { id: "punct", group: "Text", label: "Remove punctuation", run: (s) => s.replace(/[\p{P}\p{S}]/gu, "") },
  { id: "diacritics", group: "Text", label: "Strip diacritics (é → e)", run: (s) => s.normalize("NFD").replace(/\p{M}/gu, "").replace(/ß/g, "ss").replace(/[Øø]/g, (c) => (c === "Ø" ? "O" : "o")).replace(/Æ/g, "AE").replace(/æ/g, "ae").replace(/Œ/g, "OE").replace(/œ/g, "oe").replace(/[Łł]/g, (c) => (c === "Ł" ? "L" : "l")) },
  { id: "slugify", group: "Text", label: "Slugify", run: perLine((l) => l.normalize("NFD").replace(/\p{M}/gu, "").replace(/ß/g, "ss").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")) },
  { id: "replace", group: "Text", label: "Find & replace", params: ["pattern", "replace", "regex", "flags", "ci"], run: (s, p) => {
    if (!p.pattern) return s;
    const re = reFrom(p);
    if (p.regex) return s.replace(re, unescape(p.replace));
    const lit = unescape(p.replace);
    return s.replace(re, () => lit);
  } },
  { id: "rot13", group: "Text", label: "ROT13", run: ROT },
  { id: "count", group: "Text", label: "Count occurrences", params: ["pattern", "regex", "ci"], run: (s, p) => countText(s, p) },

  { id: "emails", group: "Extract", label: "Extract emails", params: ["ci"], run: (s, p) => uniq(s.match(EMAIL_RE) ?? [], p.ci).join("\n") },
  { id: "urls", group: "Extract", label: "Extract URLs", run: (s) => uniq(s.match(URL_RE) ?? [], false).join("\n") },
  { id: "numbers", group: "Extract", label: "Extract numbers", run: (s) => (s.match(NUM_RE) ?? []).join("\n") },
  { id: "ips", group: "Extract", label: "Extract IP addresses", run: (s) => uniq([...(s.match(IPV4_RE) ?? []), ...(s.match(IPV6_RE) ?? []).filter((x) => x.includes(":") && x.length > 2)], false).join("\n") },
];

function uniq(xs: string[], ci: boolean): string[] {
  const seen = new Set<string>();
  return xs.filter((x) => { const k = ci ? x.toLowerCase() : x; if (seen.has(k)) return false; seen.add(k); return true; });
}

export function countRows(s: string, p: TextParams): [string, number][] {
  const counts = new Map<string, number>();
  if (p.pattern) {
    const re = reFrom(p);
    for (const m of s.matchAll(re)) { const k = p.ci ? m[0].toLowerCase() : m[0]; counts.set(k, (counts.get(k) ?? 0) + 1); }
  } else {
    for (const w of s.match(/[\p{L}\p{N}'’-]+/gu) ?? []) { const k = p.ci ? w.toLowerCase() : w; counts.set(k, (counts.get(k) ?? 0) + 1); }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function countText(s: string, p: TextParams): string {
  const rows = countRows(s, p);
  const total = rows.reduce((a, r) => a + r[1], 0);
  const w = Math.max(4, ...rows.slice(0, 500).map((r) => r[0].length));
  return [`${p.pattern ? `Matches of ${p.regex ? "/" + p.pattern + "/" : JSON.stringify(p.pattern)}` : "Word frequency"}: ${total} total, ${rows.length} distinct`, "", ...rows.slice(0, 500).map(([k, n]) => `${k.padEnd(w)}  ${n}`)].join("\n");
}

export function textStats(s: string) {
  const ls = lines(s);
  const wordsArr = s.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? [];
  const sentences = (s.match(/[^.!?\n]+[.!?]+(\s|$)/g) ?? []).length || (s.trim() ? 1 : 0);
  const paragraphs = s.split(/\n\s*\n/).filter((x) => x.trim()).length;
  const longest = ls.reduce((a, l) => Math.max(a, l.length), 0);
  const avgWord = wordsArr.length ? wordsArr.reduce((a, w) => a + w.length, 0) / wordsArr.length : 0;
  const mins = wordsArr.length / 230;
  return {
    chars: [...s].length,
    charsNoSpace: [...s.replace(/\s/g, "")].length,
    words: wordsArr.length,
    lines: s ? ls.length : 0,
    nonEmpty: ls.filter((l) => l.trim()).length,
    unique: new Set(ls).size,
    sentences,
    paragraphs,
    bytes: new TextEncoder().encode(s).length,
    longest,
    avgWord: Math.round(avgWord * 10) / 10,
    reading: mins < 1 ? `${Math.max(1, Math.round(mins * 60))} s` : `${Math.round(mins)} min`,
  };
}
