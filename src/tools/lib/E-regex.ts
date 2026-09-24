/**
 * Regex engine helpers for Regex Tester: matching runs in a Worker with a
 * timeout (so catastrophic backtracking cannot freeze the page), plus a
 * token-by-token explainer and a pattern library.
 */
import { isNode } from "./vendor";

export type RxGroup = { n: number; name?: string; s: number; e: number; t: string } | null;
export type RxMatch = { i: number; e: number; t: string; g: RxGroup[] };
export type RxSeg = { t: "keep" | "rep"; s: string; m?: number };
export type RxOut = {
  error?: string;
  matches: RxMatch[];
  names: (string | null)[];
  groupCount: number;
  replaced: string;
  segments: RxSeg[];
  split: string[];
  truncated: boolean;
  ms: number;
};
export type RxReq = { pattern: string; flags: string; text: string; replacement: string; limit?: number };

/**
 * The worker body. Plain ES5-ish JavaScript in a string so it can run from a
 * blob URL, a Node worker_thread, or directly (tests) without a bundler.
 */
export const REGEX_WORKER_SRC = String.raw`
function groupNames(p) {
  var names = [null], inClass = false;
  for (var i = 0; i < p.length; i++) {
    var c = p[i];
    if (c === "\\") { i++; continue; }
    if (inClass) { if (c === "]") inClass = false; continue; }
    if (c === "[") { inClass = true; continue; }
    if (c !== "(") continue;
    if (p[i + 1] !== "?") { names.push(null); continue; }
    if (p[i + 2] === "<" && p[i + 3] !== "=" && p[i + 3] !== "!") {
      var end = p.indexOf(">", i + 3);
      names.push(p.slice(i + 3, end));
    }
  }
  return names;
}
function expand(rep, m, idx, input, names) {
  var out = "";
  for (var i = 0; i < rep.length; i++) {
    var c = rep[i];
    if (c !== "$" || i === rep.length - 1) { out += c; continue; }
    var n = rep[i + 1];
    if (n === "$") { out += "$"; i++; }
    else if (n === "&") { out += m[0]; i++; }
    else if (n === "\x60") { out += input.slice(0, idx); i++; }
    else if (n === "'") { out += input.slice(idx + m[0].length); i++; }
    else if (n === "<" && m.groups) {
      var close = rep.indexOf(">", i + 2);
      if (close < 0) { out += c; continue; }
      var v = m.groups[rep.slice(i + 2, close)];
      out += v == null ? "" : v;
      i = close;
    } else if (n >= "0" && n <= "9") {
      var two = rep.slice(i + 1, i + 3);
      if (/^\d\d$/.test(two) && +two > 0 && +two < m.length) { out += m[+two] == null ? "" : m[+two]; i += 2; }
      else if (+n > 0 && +n < m.length) { out += m[+n] == null ? "" : m[+n]; i++; }
      else out += c;
    } else out += c;
  }
  return out;
}
function compute(q) {
  var t0 = Date.now();
  var flags = q.flags || "";
  var limit = q.limit || 5000;
  var re;
  try { re = new RegExp(q.pattern, flags.indexOf("d") < 0 ? flags + "d" : flags); }
  catch (e) {
    try { re = new RegExp(q.pattern, flags); } catch (e2) { return { error: String(e2.message || e2), matches: [], names: [], groupCount: 0, replaced: "", segments: [], split: [], truncated: false, ms: 0 }; }
  }
  var names = groupNames(q.pattern);
  var text = q.text;
  var global = flags.indexOf("g") >= 0;
  var matches = [], truncated = false;
  function pack(m) {
    var g = [];
    for (var k = 1; k < m.length; k++) {
      var ix = m.indices ? m.indices[k] : null;
      if (m[k] === undefined) g.push(null);
      else g.push({ n: k, name: names[k] || undefined, s: ix ? ix[0] : -1, e: ix ? ix[1] : -1, t: m[k] });
    }
    return { i: m.index, e: m.index + m[0].length, t: m[0], g: g };
  }
  if (global) {
    re.lastIndex = 0;
    var m;
    while ((m = re.exec(text)) !== null) {
      if (matches.length >= limit) { truncated = true; break; }
      matches.push(pack(m));
      if (m[0] === "") re.lastIndex = (flags.indexOf("u") >= 0 || flags.indexOf("v") >= 0) && text.codePointAt(re.lastIndex) > 0xffff ? re.lastIndex + 2 : re.lastIndex + 1;
      if (re.lastIndex > text.length) break;
    }
  } else {
    re.lastIndex = 0;
    var one = re.exec(text);
    if (one) matches.push(pack(one));
  }
  // Replace, keeping pieces so the preview can highlight inserted text.
  var segments = [], last = 0, count = 0;
  var rre = new RegExp(q.pattern, flags.replace("d", ""));
  var replaced = text.replace(rre, function () {
    var args = Array.prototype.slice.call(arguments);
    var hasGroups = typeof args[args.length - 1] === "object";
    var input = hasGroups ? args[args.length - 2] : args[args.length - 1];
    var idx = hasGroups ? args[args.length - 3] : args[args.length - 2];
    var m = args.slice(0, hasGroups ? args.length - 3 : args.length - 2);
    if (hasGroups) m.groups = args[args.length - 1];
    var r = expand(q.replacement, m, idx, input, names);
    if (idx > last) segments.push({ t: "keep", s: text.slice(last, idx) });
    segments.push({ t: "rep", s: r, m: count++ });
    last = idx + m[0].length;
    return r;
  });
  if (last < text.length) segments.push({ t: "keep", s: text.slice(last) });
  var split = text.split(new RegExp(q.pattern, flags.replace(/[gyd]/g, "")));
  return { matches: matches, names: names, groupCount: names.length - 1, replaced: replaced, segments: segments, split: split, truncated: truncated, ms: Date.now() - t0 };
}
`;

const WORKER_TAIL = `self.onmessage = function (e) { var r; try { r = compute(e.data); } catch (err) { r = { error: String(err && err.message || err) }; } r.id = e.data.id; self.postMessage(r); };`;

let direct: ((q: RxReq) => RxOut) | null = null;
function computeDirect(q: RxReq): RxOut {
  if (!direct) direct = new Function(`${REGEX_WORKER_SRC}; return compute;`)() as (q: RxReq) => RxOut;
  return direct(q);
}

export class RegexTimeout extends Error {}

let worker: Worker | null = null;
let workerUrl = "";
let pending: { id: number; resolve: (r: RxOut) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> } | null = null;
let seq = 0;

function killWorker() {
  worker?.terminate();
  worker = null;
}

function browserExec(q: RxReq, timeoutMs: number): Promise<RxOut> {
  if (pending) {
    // A newer request supersedes the in-flight one; if that one is stuck, killing the worker frees it.
    clearTimeout(pending.timer);
    pending.reject(new Error("superseded"));
    pending = null;
    killWorker();
  }
  if (!worker) {
    if (!workerUrl) workerUrl = URL.createObjectURL(new Blob([REGEX_WORKER_SRC + WORKER_TAIL], { type: "text/javascript" }));
    worker = new Worker(workerUrl);
    worker.onmessage = (e: MessageEvent<RxOut & { id: number }>) => {
      if (!pending || e.data.id !== pending.id) return;
      clearTimeout(pending.timer);
      const p = pending;
      pending = null;
      p.resolve(e.data);
    };
  }
  const id = ++seq;
  return new Promise<RxOut>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (pending?.id !== id) return;
      pending = null;
      killWorker();
      reject(new RegexTimeout(`timeout`));
    }, timeoutMs);
    pending = { id, resolve, reject, timer };
    worker!.postMessage({ ...q, id });
  });
}

async function nodeExec(q: RxReq, timeoutMs: number): Promise<RxOut> {
  let wt: typeof import("node:worker_threads");
  try {
    wt = await import(/* webpackIgnore: true */ "node:worker_threads");
  } catch {
    return computeDirect(q);
  }
  const src = `${REGEX_WORKER_SRC}\nconst { parentPort, workerData } = require("worker_threads");\nlet r; try { r = compute(workerData); } catch (err) { r = { error: String(err && err.message || err) }; }\nparentPort.postMessage(r);`;
  return new Promise<RxOut>((resolve, reject) => {
    const w = new wt.Worker(src, { eval: true, workerData: q });
    const timer = setTimeout(() => {
      void w.terminate();
      reject(new RegexTimeout("timeout"));
    }, timeoutMs);
    w.once("message", (r: RxOut) => {
      clearTimeout(timer);
      void w.terminate();
      resolve(r);
    });
    w.once("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

/** Run the regex off the main thread with a time limit. Rejects with RegexTimeout. */
export function execRegex(q: RxReq, timeoutMs = 1000): Promise<RxOut> {
  if (isNode) return nodeExec(q, timeoutMs);
  if (typeof Worker === "undefined") return Promise.resolve(computeDirect(q));
  return browserExec(q, timeoutMs);
}

/** Structured results keyed by the Result object, so a custom UI can read what `run` computed. */
export const regexMeta = new WeakMap<object, { out: RxOut; req: RxReq }>();

/* ── explainer ───────────────────────────────────────────────────────── */

export type TokKind = "literal" | "escape" | "class" | "group" | "close" | "quant" | "anchor" | "alt" | "dot" | "backref" | "look" | "error";
export type Tok = { s: number; e: number; text: string; kind: TokKind; desc: string; depth: number };

const ESC: Record<string, string> = {
  d: "a digit 0–9",
  D: "any character that is not a digit",
  w: "a word character: letter, digit or underscore [A-Za-z0-9_]",
  W: "any character that is not a word character",
  s: "whitespace: space, tab, newline, and Unicode spaces",
  S: "any character that is not whitespace",
  b: "a word boundary (between \\w and \\W, or at the edge of the text)",
  B: "a position that is not a word boundary",
  n: "a newline (LF, U+000A)",
  r: "a carriage return (CR, U+000D)",
  t: "a tab (U+0009)",
  v: "a vertical tab (U+000B)",
  f: "a form feed (U+000C)",
  0: "the NUL character (U+0000)",
};

const CLASS_ESC: Record<string, string> = { d: "digit", D: "non-digit", w: "word char", W: "non-word char", s: "whitespace", S: "non-whitespace", n: "newline", r: "CR", t: "tab", v: "VT", f: "FF", b: "backspace", 0: "NUL" };

function quantDesc(q: string, lazy: boolean, possessive: boolean): string {
  let base: string;
  if (q === "*") base = "zero or more times";
  else if (q === "+") base = "one or more times";
  else if (q === "?") base = "optionally (zero or one time)";
  else {
    const m = /^\{(\d*)(,?)(\d*)\}$/.exec(q)!;
    const [lo, comma, hi] = [m[1], m[2], m[3]];
    if (!comma) base = `exactly ${lo} time${lo === "1" ? "" : "s"}`;
    else if (!hi) base = `${lo} or more times`;
    else base = `between ${lo || 0} and ${hi} times`;
  }
  if (possessive) return `${base}, possessive (no backtracking — not supported in JavaScript)`;
  return `${base}, ${lazy ? "lazy — as few as possible" : "greedy — as many as possible"}`;
}

function describeEscape(body: string, inClass: boolean): { desc: string; kind: TokKind } {
  const c = body[0];
  if (/[1-9]/.test(c) && !inClass) return { desc: `Backreference: the same text group #${body} matched`, kind: "backref" };
  if (c === "k") return { desc: `Backreference to the named group ‹${body.slice(2, -1)}›`, kind: "backref" };
  if (c === "p" || c === "P") {
    const prop = body.slice(2, -1);
    const human: Record<string, string> = { L: "any letter", Lu: "an uppercase letter", Ll: "a lowercase letter", N: "any number", Nd: "a decimal digit", P: "punctuation", S: "a symbol", Z: "a separator", Emoji: "an emoji", Extended_Pictographic: "a pictographic (emoji-like) character", "Script=Greek": "a Greek character", "Script=Latin": "a Latin character", "Script=Han": "a Han (CJK) character", "Script=Cyrillic": "a Cyrillic character" };
    const what = human[prop] ?? `a character with Unicode property ${prop}`;
    return { desc: c === "p" ? `Unicode property: ${what} (needs the u or v flag)` : `Unicode property negated: not ${what}`, kind: "escape" };
  }
  if (c === "x") return { desc: `The character U+00${body.slice(1).toUpperCase()} (${JSON.stringify(String.fromCharCode(parseInt(body.slice(1), 16)))})`, kind: "escape" };
  if (c === "u") {
    const hex = body.startsWith("u{") ? body.slice(2, -1) : body.slice(1);
    const cp = parseInt(hex, 16);
    return { desc: `The character U+${hex.toUpperCase().padStart(4, "0")} (${Number.isFinite(cp) && cp <= 0x10ffff ? JSON.stringify(String.fromCodePoint(cp)) : "?"})`, kind: "escape" };
  }
  if (c === "c") return { desc: `Control character Ctrl+${body[1]?.toUpperCase()}`, kind: "escape" };
  if (inClass && c === "b") return { desc: "backspace (U+0008) — inside a class \\b is not a boundary", kind: "escape" };
  if (ESC[c]) return { desc: (c === "b" || c === "B" ? "Anchor: " : "Matches ") + ESC[c], kind: c === "b" || c === "B" ? "anchor" : "escape" };
  return { desc: `The literal character ${JSON.stringify(c)} (escaped)`, kind: "literal" };
}

function readEscape(p: string, i: number): string {
  // p[i] === "\\"
  const c = p[i + 1];
  if (c === undefined) return "\\";
  if (c === "x") return p.slice(i, i + 4);
  if (c === "u") {
    if (p[i + 2] === "{") {
      const end = p.indexOf("}", i + 3);
      return p.slice(i, end < 0 ? p.length : end + 1);
    }
    return p.slice(i, i + 6);
  }
  if (c === "c") return p.slice(i, i + 3);
  if ((c === "p" || c === "P") && p[i + 2] === "{") {
    const end = p.indexOf("}", i + 3);
    return p.slice(i, end < 0 ? p.length : end + 1);
  }
  if (c === "k" && p[i + 2] === "<") {
    const end = p.indexOf(">", i + 3);
    return p.slice(i, end < 0 ? p.length : end + 1);
  }
  if (/[1-9]/.test(c)) {
    const m = /^\d+/.exec(p.slice(i + 1))!;
    return "\\" + m[0];
  }
  return p.slice(i, i + 2);
}

function describeClass(body: string, negated: boolean): string {
  const items: string[] = [];
  let i = 0;
  const readOne = (): string => {
    if (body[i] === "\\") {
      const e = readEscape(body, i);
      i += e.length;
      return e;
    }
    // Characters outside the BMP.
    const ch = String.fromCodePoint(body.codePointAt(i) ?? 0);
    i += ch.length;
    return ch;
  };
  const human = (t: string) => (t.startsWith("\\") ? (CLASS_ESC[t[1]] ? CLASS_ESC[t[1]] : t.length > 2 ? describeEscape(t.slice(1), true).desc.replace(/^Unicode property: |^Matches /, "").replace(/ \(needs the u or v flag\)$/, "") : JSON.stringify(t[1])) : JSON.stringify(t));
  while (i < body.length) {
    const a = readOne();
    if (body[i] === "-" && i + 1 < body.length) {
      i++;
      const b = readOne();
      items.push(`${human(a)}–${human(b)}`);
    } else items.push(human(a));
  }
  const list = items.length ? items.join(", ") : "nothing";
  return negated ? `Character class: any single character except ${list}` : `Character class: one character from ${list}`;
}

/** Tokenise a JavaScript regex into an explained, indented list. */
export function explainRegex(p: string, flags: string): Tok[] {
  const toks: Tok[] = [];
  let depth = 0;
  let groupNo = 0;
  const stack: number[] = [];
  const m = flags.includes("m"), s = flags.includes("s"), i_ = flags.includes("i");
  let i = 0;
  const push = (t: Omit<Tok, "depth">, d = depth) => toks.push({ ...t, depth: d });
  while (i < p.length) {
    const c = p[i];
    const start = i;
    if (c === "\\") {
      const e = readEscape(p, i);
      const d = describeEscape(e.slice(1), false);
      push({ s: start, e: i + e.length, text: e, kind: d.kind, desc: d.desc });
      i += e.length;
    } else if (c === "[") {
      let j = i + 1;
      const neg = p[j] === "^";
      if (neg) j++;
      let nest = 0;
      while (j < p.length && (p[j] !== "]" || nest > 0)) {
        if (p[j] === "\\") j++;
        else if (p[j] === "[" && flags.includes("v")) nest++;
        else if (p[j] === "]") nest--;
        j++;
      }
      if (j >= p.length) {
        push({ s: start, e: p.length, text: p.slice(start), kind: "error", desc: "Unterminated character class — add a closing ]" });
        break;
      }
      const body = p.slice(i + (neg ? 2 : 1), j);
      push({ s: start, e: j + 1, text: p.slice(start, j + 1), kind: "class", desc: describeClass(body, neg) + (i_ ? " (case-insensitive)" : "") });
      i = j + 1;
    } else if (c === "(") {
      let text = "(";
      let desc: string;
      let kind: TokKind = "group";
      if (p[i + 1] === "?") {
        const r = p.slice(i + 2);
        if (r.startsWith(":")) { text = "(?:"; desc = "Non-capturing group — groups without saving a match"; }
        else if (r.startsWith("=")) { text = "(?="; desc = "Positive lookahead — asserts that what follows matches, without consuming it"; kind = "look"; }
        else if (r.startsWith("!")) { text = "(?!"; desc = "Negative lookahead — asserts that what follows does NOT match"; kind = "look"; }
        else if (r.startsWith("<=")) { text = "(?<="; desc = "Positive lookbehind — asserts that what precedes matches"; kind = "look"; }
        else if (r.startsWith("<!")) { text = "(?<!"; desc = "Negative lookbehind — asserts that what precedes does NOT match"; kind = "look"; }
        else if (r.startsWith("<")) {
          const end = p.indexOf(">", i + 3);
          text = p.slice(i, end + 1);
          groupNo++;
          desc = `Named capturing group #${groupNo} ‹${p.slice(i + 3, end)}›`;
        } else if (/^[imsx-]+:/.test(r)) {
          const mods = /^([imsx-]+):/.exec(r)![1];
          text = `(?${mods}:`;
          const [on, off] = mods.split("-");
          desc = `Modifier group — ${on ? `turns on ${on.split("").join(", ")}` : ""}${on && off ? " and " : ""}${off ? `turns off ${off.split("").join(", ")}` : ""} inside (ES2025)`;
        } else if (r.startsWith(">")) { text = "(?>"; desc = "Atomic group — not supported in JavaScript (a syntax error)"; kind = "error"; }
        else { text = p.slice(i, i + 3); desc = `Unknown group syntax ${text} — JavaScript does not support it`; kind = "error"; }
      } else {
        groupNo++;
        desc = `Capturing group #${groupNo}`;
      }
      push({ s: start, e: i + text.length, text, kind, desc });
      stack.push(toks.length - 1);
      depth++;
      i += text.length;
    } else if (c === ")") {
      if (!stack.length) {
        push({ s: start, e: i + 1, text: ")", kind: "error", desc: "Unmatched ) — there is no group to close" });
      } else {
        const open = toks[stack.pop()!];
        depth--;
        push({ s: start, e: i + 1, text: ")", kind: "close", desc: `End of ${open.desc.split(" —")[0].replace(/^./, (x) => x.toLowerCase())}` });
      }
      i++;
    } else if (c === "*" || c === "+" || c === "?" || (c === "{" && /^\{\d*,?\d*\}/.test(p.slice(i)) && /^\{\d/.test(p.slice(i)))) {
      let q = c;
      if (c === "{") q = /^\{\d*,?\d*\}/.exec(p.slice(i))![0];
      let j = i + q.length;
      const lazy = p[j] === "?";
      const poss = p[j] === "+";
      if (lazy || poss) j++;
      const prev = toks[toks.length - 1];
      if (!prev || prev.kind === "alt" || (prev.kind === "group" && prev.e === start) || prev.kind === "quant" || prev.kind === "anchor") {
        push({ s: start, e: j, text: p.slice(start, j), kind: "error", desc: "Nothing to repeat — a quantifier must follow a character, class or group" });
      } else push({ s: start, e: j, text: p.slice(start, j), kind: "quant", desc: `Quantifier: repeat the previous item ${quantDesc(q, lazy, poss)}` });
      i = j;
    } else if (c === "^") {
      push({ s: start, e: i + 1, text: c, kind: "anchor", desc: m ? "Anchor: start of a line (m flag)" : "Anchor: start of the text" });
      i++;
    } else if (c === "$") {
      push({ s: start, e: i + 1, text: c, kind: "anchor", desc: m ? "Anchor: end of a line (m flag)" : "Anchor: end of the text" });
      i++;
    } else if (c === ".") {
      push({ s: start, e: i + 1, text: c, kind: "dot", desc: s ? "Any character, including newlines (s flag)" : "Any character except a line break" });
      i++;
    } else if (c === "|") {
      push({ s: start, e: i + 1, text: c, kind: "alt", desc: "OR — if the left side fails, try the alternative on the right" }, Math.max(0, depth - 0));
      i++;
    } else {
      // Merge a run of literals, leaving the last one alone when a quantifier follows it.
      let j = i;
      while (j < p.length && !"\\[()*+?{|^$.".includes(p[j])) j += String.fromCodePoint(p.codePointAt(j) ?? 0).length;
      if (j === i) j = i + 1; // a stray { or }
      let end = j;
      const nextQ = p[j] === "*" || p[j] === "+" || p[j] === "?" || (p[j] === "{" && /^\{\d/.test(p.slice(j)));
      if (nextQ && j - i > 1) {
        const lastLen = p.codePointAt(j - 1)! >= 0xdc00 && p.codePointAt(j - 1)! <= 0xdfff ? 2 : 1;
        end = j - lastLen;
      }
      const lit = p.slice(i, end);
      push({ s: start, e: end, text: lit, kind: "literal", desc: lit.length === 1 ? `The character ${JSON.stringify(lit)}${i_ ? " (any case)" : ""}` : `The text ${JSON.stringify(lit)}${i_ ? " (case-insensitive)" : ""}` });
      i = end;
    }
  }
  while (stack.length) {
    const t = toks[stack.pop()!];
    toks.push({ s: t.s, e: t.e, text: t.text, kind: "error", desc: `Unclosed group ${t.text} — add a matching )`, depth: t.depth });
  }
  return toks;
}

export const FLAG_INFO: Record<string, string> = {
  g: "global — find every match, not just the first",
  i: "ignore case",
  m: "multiline — ^ and $ match at line breaks",
  s: "dotAll — . also matches newlines",
  u: "unicode — code points, \\u{…} and \\p{…}",
  y: "sticky — match only at lastIndex",
  d: "indices — report start/end of every group",
};

/* ── pattern library ─────────────────────────────────────────────────── */

export type LibEntry = { name: string; pattern: string; flags: string; desc: string; sample: string };

const jwtSample = () => ["eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9", "eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkFkYSJ9", "c2lnbmF0dXJl" + "LXNhbXBsZQ"].join(".");

const H = "[\\da-f]{1,4}";
export const REGEX_LIBRARY: LibEntry[] = [
  { name: "Email", pattern: "[\\w.%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}", flags: "g", desc: "Pragmatic address matcher (not full RFC 5322).", sample: "Write to ada@example.com or grace.hopper+navy@mail.example.org, not @nobody." },
  { name: "URL", pattern: "https?:\\/\\/(?:www\\.)?[-\\w@:%.+~#=]{1,256}\\.[a-z]{2,6}\\b(?:[-\\w()@:%+.~#?&/=]*)", flags: "gi", desc: "http(s) links with path and query.", sample: "Docs at https://developer.mozilla.org/en-US/docs/Web/JavaScript?lang=en and http://example.com." },
  { name: "IPv4", pattern: "\\b(?:(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)\\b", flags: "g", desc: "Dotted quads 0–255 each.", sample: "Hosts 10.0.0.1, 192.168.1.254 and 8.8.8.8 — but not 256.1.1.1 or 1.2.3." },
  {
    name: "IPv6",
    pattern: `(?<![\\da-f:])(?:(?:${H}:){7}${H}|(?:${H}:){1,7}:|(?:${H}:){1,6}:${H}|(?:${H}:){1,5}(?::${H}){1,2}|(?:${H}:){1,4}(?::${H}){1,3}|(?:${H}:){1,3}(?::${H}){1,4}|(?:${H}:){1,2}(?::${H}){1,5}|${H}:(?::${H}){1,6}|:(?:(?::${H}){1,7}|:))(?![\\da-f:])`,
    flags: "gi",
    desc: "Full and compressed (::) forms; the lookarounds force the longest alternative.",
    sample: "Loopback ::1, doc prefix 2001:db8::8a2e:370:7334 and 2001:0db8:85a3:0000:0000:8a2e:0370:7334.",
  },
  { name: "ISO date", pattern: "\\b(?<year>\\d{4})-(?<month>0[1-9]|1[0-2])-(?<day>0[1-9]|[12]\\d|3[01])(?:T(?<time>[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?<tz>Z|[+-][01]\\d:?[0-5]\\d)?)?\\b", flags: "g", desc: "YYYY-MM-DD with optional time and zone, named groups.", sample: "Released 2026-08-30T10:12:00Z, patched 2026-09-02 and 2026-13-45 is invalid." },
  { name: "UUID", pattern: "\\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\b", flags: "gi", desc: "RFC 9562 UUIDs, versions 1–8.", sample: "id=3f2b8c1e-9d4a-4c6b-8e2f-1a2b3c4d5e6f ref=01890a5d-ac96-774b-bcce-b302099a8057 bad=1234" },
  { name: "Hex colour", pattern: "#(?:[0-9a-fA-F]{3,4}){1,2}\\b", flags: "g", desc: "#rgb, #rgba, #rrggbb, #rrggbbaa.", sample: "color: #0af; background: #1e293bcc; border: #FF00FF; not #12345." },
  { name: "Semver", pattern: "\\bv?(?<major>0|[1-9]\\d*)\\.(?<minor>0|[1-9]\\d*)\\.(?<patch>0|[1-9]\\d*)(?:-(?<pre>[\\da-z-]+(?:\\.[\\da-z-]+)*))?(?:\\+(?<build>[\\da-z-]+(?:\\.[\\da-z-]+)*))?\\b", flags: "gi", desc: "Semantic versions with pre-release and build metadata.", sample: "Upgrade from 1.9.0 to v2.0.0-rc.1+build.5; 01.2.3 is not valid." },
  { name: "Phone (US)", pattern: "(?:\\+?1[-. ]?)?\\(?(?<area>[2-9]\\d{2})\\)?[-. ]?(?<exchange>\\d{3})[-. ]?(?<line>\\d{4})\\b", flags: "g", desc: "NANP numbers in common notations.", sample: "Call (415) 555-0132, +1 212.555.0199 or 800-555-0100." },
  { name: "Phone (E.164)", pattern: "\\+[1-9]\\d{6,14}\\b", flags: "g", desc: "International format: + and up to 15 digits.", sample: "+14155550132, +442071838750, +819012345678" },
  { name: "Credit card", pattern: "\\b(?:4\\d{3}|5[1-5]\\d{2}|2[2-7]\\d{2}|3[47]\\d{2}|6011)[- ]?\\d{4}[- ]?\\d{4}[- ]?\\d{3,4}\\b", flags: "g", desc: "Visa, Mastercard, Amex, Discover shapes (no Luhn check).", sample: "Test cards 4111 1111 1111 1111 and 5500-0000-0000-0004." },
  { name: "Slug", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$", flags: "gm", desc: "lowercase-words-with-hyphens, one per line.", sample: "hello-world\nregex-101\nNot A Slug\ntrailing-\nv2-release-notes" },
  { name: "HTML tag", pattern: "<(?<tag>[a-z][a-z0-9-]*)\\b[^>]*>(?<inner>.*?)<\\/\\k<tag>>", flags: "gis", desc: "Paired tags with a backreference to the tag name.", sample: '<p class="lead">Hello <b>world</b></p>\n<span>ok</div>' },
  { name: "JWT", pattern: "\\beyJ[\\w-]+\\.eyJ[\\w-]+\\.[\\w-]+", flags: "g", desc: "Three base64url segments; header and payload start with eyJ.", sample: `Authorization: Bearer ${jwtSample()}` },
  { name: "Markdown link", pattern: "\\[(?<text>[^\\]]+)\\]\\((?<href>[^)\\s]+)(?:\\s+\"(?<title>[^\"]*)\")?\\)", flags: "g", desc: "[text](href \"title\").", sample: 'See [the docs](https://example.com/docs "Docs") and [home](/).' },
  { name: "Duplicate word", pattern: "\\b(\\w+)\\s+\\1\\b", flags: "gi", desc: "A word repeated — uses a backreference.", sample: "This is is a test of the the duplicate finder. Paris in the the spring." },
  { name: "Strong password", pattern: "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^\\w\\s]).{12,}$", flags: "gm", desc: "Lookaheads: lower, upper, digit, symbol, 12+ chars.", sample: "password\nCorrect-Horse-9-Battery\nShort1!\nNoDigitsHere!!!!" },
  { name: "Time (24h)", pattern: "\\b(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d)?\\b", flags: "g", desc: "HH:MM or HH:MM:SS.", sample: "Doors 09:30, show 21:00:00, bad 24:10." },
  { name: "Number with commas", pattern: "-?\\b\\d{1,3}(?:,\\d{3})*(?:\\.\\d+)?\\b", flags: "g", desc: "1,234,567.89 style numbers.", sample: "Revenue 1,234,567.89 vs -12,000 and 42." },
  { name: "Quoted string", pattern: "\"(?:[^\"\\\\\\n]|\\\\.)*\"", flags: "g", desc: "Double-quoted strings with escapes.", sample: 'say("hello \\"world\\"") and "second" but not "unterminated' },
  { name: "Trailing spaces", pattern: "[ \\t]+$", flags: "gm", desc: "Whitespace at line ends (m flag).", sample: "clean line\ntrailing spaces   \ntab at end\t\nok" },
  { name: "Emoji", pattern: "\\p{Extended_Pictographic}(?:\\u200d\\p{Extended_Pictographic})*", flags: "gu", desc: "Pictographic characters and ZWJ sequences (u flag).", sample: "Ship it 🚀 — tests ✅, family 👨‍👩‍👧, coffee ☕." },
  { name: "Log line", pattern: "^(?<ts>\\S+) \\[(?<level>INFO|WARN|ERROR)\\] (?<msg>.*)$", flags: "gm", desc: "Timestamp, level and message per line.", sample: "2026-09-24T10:00:01Z [INFO] started\n2026-09-24T10:00:02Z [WARN] slow query 812ms\n2026-09-24T10:00:03Z [ERROR] connection reset" },
  { name: "MAC address", pattern: "\\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\\b", flags: "g", desc: "Six hex pairs separated by : or -.", sample: "eth0 00:1A:2B:3C:4D:5E, wlan 00-1a-2b-3c-4d-5f" },
];
