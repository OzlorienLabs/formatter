import {
  decodeBytes,
  encodeText,
  hex2,
  hexdump,
  hexFormat,
  HEX_SEP_CHOICES,
  parseHex,
  showChar,
  utf8Encode,
  utf8Error,
  where,
  type Charset,
} from "./lib/A-bytes";
import { entityName } from "./lib/A-entities";
import { ToolError, bool, num, str, type SpecModule, type View } from "./types";

/* ── shared ──────────────────────────────────────────────────────────── */

type Stat = { label: string; value: string | number; tone?: "ok" | "warn" | "bad" | "info" };
const stats = (label: string, items: Stat[]): View => ({ label, out: { kind: "stats", items } });
const U = (cp: number) => `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
const printable = (c: string) => {
  const cp = c.codePointAt(0)!;
  if (cp < 0x20) return String.fromCodePoint(0x2400 + cp);
  if (cp === 0x7f) return "␡";
  if (cp === 0x20) return "␠";
  if (cp >= 0x80 && cp < 0xa0) return "·";
  return c;
};

const ENC_CHOICES: [string, string][] = [["utf8", "UTF-8"], ["ascii", "ASCII (7-bit)"], ["latin1", "Latin-1"], ["utf16le", "UTF-16LE"], ["utf16be", "UTF-16BE"]];

/** Decode with an error that points at the source position of the bad byte. */
function decodeAt(bytes: Uint8Array, cs: Charset, strict: boolean, src: string, pos: number[]): string {
  if (strict && cs === "utf8") {
    const e = utf8Error(bytes);
    if (e) throw new ToolError(`Not valid UTF-8 at byte ${e.at + 1} (0x${hex2(bytes[e.at])}, ${where(src, pos[e.at] ?? 0)}): ${e.why}. Try Latin-1, or turn off Strict to substitute U+FFFD.`);
  }
  if (strict && cs === "ascii") {
    const i = bytes.findIndex((b) => b > 0x7f);
    if (i >= 0) throw new ToolError(`Byte ${i + 1} is 0x${hex2(bytes[i])} (${bytes[i]}) at ${where(src, pos[i] ?? 0)}, outside 7-bit ASCII. Decode as UTF-8 or Latin-1 instead.`);
  }
  return decodeBytes(bytes, cs, strict);
}

function byteRows(bytes: Uint8Array, cs: Charset): (string | number)[][] {
  return Array.from(bytes.subarray(0, 4096), (b, i) => [i, b.toString(2).padStart(8, "0"), b, hex2(b), cs === "utf8" && b > 0x7f ? (b >= 0xc0 ? "lead" : "cont.") : printable(String.fromCharCode(b))]);
}

/* ── binary parsing ──────────────────────────────────────────────────── */

function parseBinary(src: string, bitsOpt: string) {
  const toks: { v: string; pos: number }[] = [];
  const SEP = /[\s,;|]/;
  let i = 0;
  while (i < src.length) {
    if (SEP.test(src[i])) { i++; continue; }
    if (/^0[bB]/.test(src.slice(i, i + 2)) && /[01]/.test(src[i + 2] ?? "")) i += 2;
    const start = i;
    let v = "";
    while (i < src.length && !SEP.test(src[i])) {
      const ch = src[i];
      if (ch === "0" || ch === "1") v += ch;
      else if (ch !== "_") throw new ToolError(`${showChar(ch)} at ${where(src, i)} is not a binary digit — only 0 and 1 are allowed (plus spaces, commas, _ or 0b prefixes).`);
      i++;
    }
    if (v) toks.push({ v, pos: start });
  }
  if (!toks.length) throw new ToolError("Paste some binary, e.g. 01001000 01101001 — spaced or continuous.");
  let w = bitsOpt === "7" ? 7 : bitsOpt === "8" ? 8 : 0;
  let format: string;
  if (!w) {
    if (toks.every((t) => t.v.length <= 8)) w = 8;
    else if (toks.every((t) => t.v.length % 8 === 0)) w = 8;
    else if (toks.every((t) => t.v.length % 7 === 0)) w = 7;
    else {
      const bad = toks.find((t) => t.v.length > 8 && t.v.length % 8 !== 0)!;
      throw new ToolError(`The ${bad.v.length}-bit group at ${where(src, bad.pos)} is not a multiple of 8 bits (or 7). A bit is missing or extra — or pick a group size under Bits.`);
    }
  }
  const values: number[] = [];
  const pos: number[] = [];
  for (const t of toks) {
    if (t.v.length <= w) {
      values.push(parseInt(t.v, 2));
      pos.push(t.pos);
    } else {
      if (t.v.length % w) throw new ToolError(`The ${t.v.length}-bit group at ${where(src, t.pos)} does not split into ${w}-bit ${w === 8 ? "bytes" : "characters"} (${t.v.length} is not a multiple of ${w}).`);
      for (let k = 0; k < t.v.length; k += w) {
        values.push(parseInt(t.v.slice(k, k + w), 2));
        pos.push(t.pos + k);
      }
    }
  }
  const spaced = toks.length > 1 && toks.every((t) => t.v.length <= 8);
  format = `${spaced ? "separated" : "continuous"} ${w}-bit groups`;
  return { bytes: Uint8Array.from(values), pos, w, format };
}

/* ── ASCII table ─────────────────────────────────────────────────────── */

const CTRL: [string, string][] = [
  ["NUL", "Null"], ["SOH", "Start of heading"], ["STX", "Start of text"], ["ETX", "End of text"], ["EOT", "End of transmission"], ["ENQ", "Enquiry"], ["ACK", "Acknowledge"], ["BEL", "Bell"],
  ["BS", "Backspace"], ["HT", "Horizontal tab"], ["LF", "Line feed (newline)"], ["VT", "Vertical tab"], ["FF", "Form feed"], ["CR", "Carriage return"], ["SO", "Shift out"], ["SI", "Shift in"],
  ["DLE", "Data link escape"], ["DC1", "Device control 1 (XON)"], ["DC2", "Device control 2"], ["DC3", "Device control 3 (XOFF)"], ["DC4", "Device control 4"], ["NAK", "Negative acknowledge"], ["SYN", "Synchronous idle"], ["ETB", "End of transmission block"],
  ["CAN", "Cancel"], ["EM", "End of medium"], ["SUB", "Substitute"], ["ESC", "Escape"], ["FS", "File separator"], ["GS", "Group separator"], ["RS", "Record separator"], ["US", "Unit separator"],
];
const C1 = "PAD HOP BPH NBH IND NEL SSA ESA HTS HTJ VTS PLD PLU RI SS2 SS3 DCS PU1 PU2 STS CCH MW SPA EPA SOS SGCI SCI CSI ST OSC PM APC".split(" ");
const PUNCT: Record<string, string> = {
  " ": "Space", "!": "Exclamation mark", '"': "Quotation mark", "#": "Number sign (hash)", $: "Dollar sign", "%": "Percent sign", "&": "Ampersand", "'": "Apostrophe",
  "(": "Left parenthesis", ")": "Right parenthesis", "*": "Asterisk", "+": "Plus sign", ",": "Comma", "-": "Hyphen-minus", ".": "Full stop (period)", "/": "Solidus (slash)",
  ":": "Colon", ";": "Semicolon", "<": "Less-than sign", "=": "Equals sign", ">": "Greater-than sign", "?": "Question mark", "@": "Commercial at",
  "[": "Left square bracket", "\\": "Reverse solidus (backslash)", "]": "Right square bracket", "^": "Circumflex accent (caret)", _: "Low line (underscore)", "`": "Grave accent (backtick)",
  "{": "Left curly bracket", "|": "Vertical line (pipe)", "}": "Right curly bracket", "~": "Tilde",
};
const L1SYM = [
  "No-break space", "Inverted exclamation mark", "Cent sign", "Pound sign", "Currency sign", "Yen sign", "Broken bar", "Section sign", "Diaeresis", "Copyright sign", "Feminine ordinal indicator",
  "Left double angle quotation mark", "Not sign", "Soft hyphen", "Registered sign", "Macron", "Degree sign", "Plus-minus sign", "Superscript two", "Superscript three", "Acute accent", "Micro sign",
  "Pilcrow (paragraph) sign", "Middle dot", "Cedilla", "Superscript one", "Masculine ordinal indicator", "Right double angle quotation mark", "Vulgar fraction one quarter", "Vulgar fraction one half",
  "Vulgar fraction three quarters", "Inverted question mark",
];
const MARKS: Record<string, string> = { grave: "grave", acute: "acute", circ: "circumflex", tilde: "tilde", uml: "diaeresis", ring: "ring above", cedil: "cedilla", slash: "stroke" };

function describe(cp: number): { abbr: string; desc: string; cat: string } {
  if (cp < 32) return { abbr: CTRL[cp][0], desc: CTRL[cp][1], cat: "control" };
  if (cp === 127) return { abbr: "DEL", desc: "Delete", cat: "control" };
  if (cp >= 128 && cp < 160) return { abbr: C1[cp - 128], desc: "C1 control", cat: "control" };
  const c = String.fromCharCode(cp);
  if (cp === 32) return { abbr: "SP", desc: "Space", cat: "space" };
  if (/[0-9]/.test(c)) return { abbr: "", desc: `Digit ${["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"][cp - 48]}`, cat: "digit" };
  if (/[A-Z]/.test(c)) return { abbr: "", desc: `Latin capital letter ${c}`, cat: "upper" };
  if (/[a-z]/.test(c)) return { abbr: "", desc: `Latin small letter ${c}`, cat: "lower" };
  if (cp < 127) return { abbr: "", desc: PUNCT[c] ?? "", cat: "punct" };
  if (cp < 192) return { abbr: cp === 160 ? "NBSP" : cp === 173 ? "SHY" : "", desc: L1SYM[cp - 160], cat: cp === 160 ? "space" : "symbol" };
  const n = entityName(cp) ?? "";
  const special: Record<string, string> = { times: "Multiplication sign", divide: "Division sign", szlig: "Latin small letter sharp s", ETH: "Latin capital letter eth", eth: "Latin small letter eth", THORN: "Latin capital letter thorn", thorn: "Latin small letter thorn", AElig: "Latin capital letter AE", aelig: "Latin small letter ae" };
  if (special[n]) return { abbr: "", desc: special[n], cat: /letter/.test(special[n]) ? (/capital/.test(special[n]) ? "upper" : "lower") : "symbol" };
  const m = n.match(/^([A-Za-z])(grave|acute|circ|tilde|uml|ring|cedil|slash)$/);
  if (m) {
    const up = m[1] === m[1].toUpperCase();
    return { abbr: "", desc: `Latin ${up ? "capital" : "small"} letter ${m[1]} with ${MARKS[m[2]]}`, cat: up ? "upper" : "lower" };
  }
  return { abbr: "", desc: "", cat: "symbol" };
}

const C_ESC: Record<number, string> = { 0: "\\0", 7: "\\a", 8: "\\b", 9: "\\t", 10: "\\n", 11: "\\v", 12: "\\f", 13: "\\r", 27: "\\e", 34: '\\"', 39: "\\'", 92: "\\\\" };

type AsciiRow = { cp: number; dec: number; hex: string; oct: string; bin: string; ch: string; html: string; esc: string; caret: string; abbr: string; desc: string; cat: string };

function asciiRow(cp: number): AsciiRow {
  const d = describe(cp);
  const name = entityName(cp);
  return {
    cp,
    dec: cp,
    hex: hex2(cp).toUpperCase(),
    oct: cp.toString(8).padStart(3, "0"),
    bin: cp.toString(2).padStart(8, "0"),
    ch: cp < 32 || cp === 127 || (cp >= 128 && cp < 160) ? printable(String.fromCharCode(cp)) : cp === 32 ? "␠" : cp === 160 ? "⍽" : String.fromCharCode(cp),
    html: name && cp > 32 ? `&${name};` : `&#${cp};`,
    esc: C_ESC[cp] ?? (cp < 32 || cp === 127 ? `\\x${hex2(cp).toUpperCase()}` : cp > 127 ? `\\u00${hex2(cp).toUpperCase()}` : String.fromCharCode(cp)),
    caret: cp < 32 ? `^${String.fromCharCode(cp + 64)}` : cp === 127 ? "^?" : "",
    abbr: d.abbr,
    desc: d.desc,
    cat: d.cat,
  };
}

/** Which code points does one query term select? */
function matchTerm(term: string, max: number): { cps: number[]; how: string } {
  const t = term.trim();
  const inRange = (n: number) => Number.isInteger(n) && n >= 0 && n <= max;
  const numOf = (s: string): number | null => {
    const x = s.trim();
    let m: RegExpMatchArray | null;
    if ((m = x.match(/^(?:0x|\\x|x|U\+|&#x)([0-9a-f]+);?$/i))) return parseInt(m[1], 16);
    if ((m = x.match(/^(?:0b)([01]+)$/i))) return parseInt(m[1], 2);
    if ((m = x.match(/^(?:0o|\\)([0-7]{1,3})$/i)) || (m = x.match(/^0([0-7]+)$/))) return parseInt(m[1], 8);
    if ((m = x.match(/^&#(\d+);?$/))) return Number(m[1]);
    if ((m = x.match(/^[01]{8}$/))) return parseInt(x, 2);
    if (/^\d+$/.test(x)) return Number(x);
    return null;
  };
  // Ranges: 65-90, 0x41..0x5A, A-Z
  const r = t.match(/^(.+?)\s*(?:-|\.\.|–)\s*(.+)$/);
  if (r && t.length > 2) {
    const a = numOf(r[1]) ?? (r[1].length === 1 ? r[1].charCodeAt(0) : null);
    const b = numOf(r[2]) ?? (r[2].length === 1 ? r[2].charCodeAt(0) : null);
    if (a != null && b != null) {
      const lo = Math.max(0, Math.min(a, b)), hi = Math.min(max, Math.max(a, b));
      return { cps: Array.from({ length: Math.max(0, hi - lo + 1) }, (_, i) => lo + i), how: `range ${lo}–${hi}` };
    }
  }
  const cps: number[] = [];
  const hows: string[] = [];
  const n = numOf(t);
  if (n != null && inRange(n)) {
    cps.push(n);
    hows.push(/^\d+$/.test(t) ? "decimal" : "number");
  }
  if ([...t].length === 1) {
    const cp = t.codePointAt(0)!;
    if (cp <= max && !cps.includes(cp)) cps.push(cp);
    hows.push("character");
    return { cps, how: hows.join(" / ") };
  }
  const esc = Object.entries(C_ESC).find(([, v]) => v === t);
  if (esc) return { cps: [Number(esc[0])], how: "escape" };
  const caret = t.match(/^\^([@A-Z[\\\]^_?])$/i);
  if (caret) return { cps: [caret[1] === "?" ? 127 : caret[1].toUpperCase().charCodeAt(0) - 64], how: "caret notation" };
  const ent = t.match(/^&([A-Za-z][A-Za-z0-9]*);?$/);
  if (ent) {
    for (let cp = 0; cp <= max; cp++) if (entityName(cp) === ent[1]) return { cps: [cp], how: "HTML entity" };
  }
  const up = t.toUpperCase();
  for (let cp = 0; cp <= max; cp++) if (describe(cp).abbr === up) return { cps: [cp], how: "control name" };
  if (cps.length) return { cps, how: hows.join(" / ") };
  const lower = t.toLowerCase();
  const byDesc: number[] = [];
  for (let cp = 0; cp <= max; cp++) if (describe(cp).desc.toLowerCase().includes(lower)) byDesc.push(cp);
  if (byDesc.length) return { cps: byDesc, how: `description contains “${t}”` };
  // Otherwise: the characters of the string itself.
  const chars = [...new Set([...t].map((c) => c.codePointAt(0)!).filter((cp) => cp <= max))];
  return { cps: chars, how: "characters of the text" };
}

/* ── base conversion ─────────────────────────────────────────────────── */

const DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz";

type Num = { neg: boolean; int: bigint; fn: bigint; fd: bigint; base: number; how: string };

function parseNumber(raw: string, fromOpt: string, src: string, at: number): Num {
  let s = raw.trim();
  const lead = raw.indexOf(s);
  let neg = false;
  let off = at + lead;
  if (/^[+-]/.test(s)) {
    neg = s[0] === "-";
    s = s.slice(1).trimStart();
    off = at + raw.indexOf(s, lead + 1);
  }
  let base = fromOpt === "auto" ? 0 : Number(fromOpt);
  let how = base ? `base ${base}` : "";
  const pre = s.match(/^(0x|0b|0o|#|\$|&h)/i);
  if (pre) {
    const pb = { "0x": 16, "#": 16, $: 16, "&h": 16, "0b": 2, "0o": 8 }[pre[1].toLowerCase()]!;
    if (!base || base === pb) {
      base = pb;
      how = `${pre[1]} prefix → base ${pb}`;
      s = s.slice(pre[1].length);
      off += pre[1].length;
    }
  }
  if (!base) {
    const body = s.replace(/[_\s,]/g, "");
    if (/^\d*\.?\d*$/.test(body)) { base = 10; how = "decimal"; }
    else if (/^[0-9a-f]+(\.[0-9a-f]*)?$/i.test(body)) { base = 16; how = "hex digits (no prefix) → base 16"; }
    else if (/^[0-9a-z]+$/i.test(body)) {
      const hi = Math.max(...[...body.toLowerCase()].map((c) => DIGITS.indexOf(c)));
      base = Math.max(hi + 1, 2);
      how = `digits up to “${DIGITS[hi]}” → base ${base} (set From base to be sure)`;
    }
  }
  if (!base) base = 10;
  let int = 0n, fn = 0n, fd = 1n;
  let seenDot = false, any = false;
  const B = BigInt(base);
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "_" || c === " " || (c === "," && base === 10 && !seenDot)) continue;
    if (c === ".") {
      if (seenDot) throw new ToolError(`Second decimal point at ${where(src, off + i)}.`);
      seenDot = true;
      continue;
    }
    const v = DIGITS.indexOf(c.toLowerCase());
    if (v < 0 || v >= base) throw new ToolError(`${showChar(c)} at ${where(src, off + i)} is not a valid base-${base} digit${v >= base ? ` (base ${base} uses ${DIGITS.slice(0, base).replace(/^(.{10})(.+)$/, "$1, $2")})` : ""}.`);
    any = true;
    if (seenDot) {
      fn = fn * B + BigInt(v);
      fd *= B;
    } else int = int * B + BigInt(v);
  }
  if (!any) throw new ToolError(`No digits in “${raw.trim()}” at ${where(src, at)}.`);
  return { neg, int, fn, fd, base, how };
}

function toBase(n: Num, b: number, fracDigits: number, upper: boolean, group: boolean): string {
  let s = n.int.toString(b);
  if (group) {
    const g = b === 2 ? 4 : b === 16 ? 4 : 3;
    const sep = b === 10 ? "," : b === 2 || b === 16 || b === 8 ? " " : "_";
    s = s.replace(new RegExp(`\\B(?=(.{${g}})+$)`, "g"), sep);
  }
  if (n.fn) {
    let fnum = n.fn;
    let digits = "";
    const B = BigInt(b);
    for (let i = 0; i < fracDigits && fnum; i++) {
      fnum *= B;
      digits += DIGITS[Number(fnum / n.fd)];
      fnum %= n.fd;
    }
    s += "." + (digits || "0") + (fnum ? "…" : "");
  }
  if (upper) s = s.toUpperCase();
  return (n.neg && (n.int || n.fn) ? "-" : "") + s;
}

function twos(v: bigint, w: number): { bits: string; hex: string; unsigned: string; signed: string; fits: string } {
  const mod = 1n << BigInt(w);
  const minS = -(1n << BigInt(w - 1)), maxU = mod - 1n;
  const fits = v >= minS && v <= maxU;
  const u = ((v % mod) + mod) % mod;
  const s = u >= mod / 2n ? u - mod : u;
  return {
    bits: u.toString(2).padStart(w, "0").replace(/\B(?=(.{4})+$)/g, " "),
    hex: "0x" + u.toString(16).toUpperCase().padStart(w / 4, "0"),
    unsigned: u.toString(),
    signed: s.toString(),
    fits: fits ? (v < 0n ? "two's complement" : v > mod / 2n - 1n ? "unsigned only" : "fits") : "overflow — wrapped",
  };
}

/* ── epoch ───────────────────────────────────────────────────────────── */

const COMMON_TZ = ["UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Sao_Paulo", "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Moscow", "Africa/Lagos", "Africa/Johannesburg", "Asia/Dubai", "Asia/Kolkata", "Asia/Shanghai", "Asia/Singapore", "Asia/Tokyo", "Australia/Sydney", "Pacific/Auckland"];

function tzChoices(): [string, string][] {
  let all: string[] = [];
  try {
    all = (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf("timeZone");
  } catch {
    /* older engines: common list only */
  }
  return [...COMMON_TZ.map((z) => [z, `★ ${z.replace(/_/g, " ")}`] as [string, string]), ...all.filter((z) => !COMMON_TZ.includes(z)).map((z) => [z, z.replace(/_/g, " ")] as [string, string])];
}

function relTime(ms: number, now: number): string {
  const d = (ms - now) / 1000;
  const a = Math.abs(d);
  if (a < 1) return "now";
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [["year", 31556952], ["month", 2629746], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60], ["second", 1]];
  for (const [u, s] of units) if (a >= s) return rtf.format(Math.round(d / s), u);
  return "now";
}

function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const week = Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
  return `${y}-W${String(week).padStart(2, "0")}-${day}`;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number, w = 2) => String(Math.abs(n)).padStart(w, "0");

function rfc2822(d: Date) {
  return `${DAYS[d.getUTCDay()]}, ${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} +0000`;
}

function inZone(d: Date, tz: string): string {
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", weekday: "short", timeZoneName: "longOffset" })
        .formatToParts(d)
        .map((p) => [p.type, p.value])
    );
    const abbr = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" }).formatToParts(d).find((p) => p.type === "timeZoneName")?.value;
    const off = String(parts.timeZoneName).replace("GMT", "") || "+00:00";
    return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} ${off}${abbr && !/^GMT/.test(abbr) ? ` (${abbr})` : ""} ${parts.weekday}`;
  } catch {
    throw new ToolError(`Unknown time zone “${tz}”.`);
  }
}

function dayOfYear(d: Date) {
  return Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000) + 1;
}

type EpochRow = { input: string; unit: string; ms: number; extra?: string; error?: string };

function readEpoch(line: string, unitOpt: string, now: number): EpochRow {
  const t = line.trim();
  if (/^now$/i.test(t)) return { input: t, unit: "now", ms: now };
  if (/^[+-]?\d+(\.\d+)?$/.test(t)) {
    const neg = t.startsWith("-");
    const digits = t.replace(/^[+-]/, "").split(".")[0].replace(/^0+/, "") || "0";
    const v = Number(t);
    let unit = unitOpt;
    if (unit === "auto") {
      const a = Math.abs(v);
      unit = a < 1e11 ? "s" : a < 1e14 ? "ms" : a < 1e17 ? "us" : "ns";
    }
    let ms: number;
    let extra: string | undefined;
    if (unit === "s") ms = v * 1000;
    else if (unit === "ms") ms = v;
    else {
      // Keep sub-millisecond digits exact with BigInt.
      const big = BigInt((neg ? "-" : "") + digits);
      const div = unit === "us" ? 1000n : 1000000n;
      ms = Number(big / div);
      const rem = big % div;
      if (rem) extra = `+${(rem < 0n ? -rem : rem).toString().padStart(unit === "us" ? 3 : 6, "0")} ${unit === "us" ? "µs" : "ns"} after the millisecond`;
    }
    return { input: t, unit: { s: "seconds", ms: "milliseconds", us: "microseconds", ns: "nanoseconds" }[unit] ?? unit, ms, extra };
  }
  let ms = Date.parse(t);
  if (Number.isNaN(ms) && /^\d{4}-\d{2}-\d{2}[ T]\d{1,2}:\d{2}/.test(t)) ms = Date.parse(t.replace(" ", "T"));
  if (Number.isNaN(ms)) return { input: t, unit: "?", ms: NaN, error: `Could not read “${t}” as a timestamp or a date (try ISO 8601: 2024-05-01T12:00:00Z)` };
  const zoned = /(Z|[+-]\d{2}:?\d{2}|GMT|UTC|[ECMP][SD]T)\s*$/i.test(t) || /^\d{4}-\d{2}-\d{2}$/.test(t);
  return { input: t, unit: zoned ? "date" : "date (no zone → local time)", ms };
}

/* ── string stats ────────────────────────────────────────────────────── */

type Seg = { segment: string; isWordLike?: boolean };
function segments(s: string, g: "grapheme" | "word" | "sentence"): Seg[] | null {
  const S = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment: (s: string) => Iterable<Seg> } }).Segmenter;
  if (!S) return null;
  return [...new S(undefined, { granularity: g }).segment(s)];
}

function duration(minutes: number) {
  const secs = Math.round(minutes * 60);
  if (secs < 60) return `${secs} s`;
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
  return h ? `${h} h ${m} min` : `${m} min${s ? ` ${s} s` : ""}`;
}

/* ── specs ───────────────────────────────────────────────────────────── */

const HEX_OPTS = [
  { id: "sep", label: "Separator", type: "select" as const, choices: HEX_SEP_CHOICES, default: "space" },
  { id: "case", label: "Case", type: "segment" as const, choices: [["lower", "abc"], ["upper", "ABC"]] as [string, string][], default: "lower" },
  { id: "per", label: "Bytes / line", type: "number" as const, default: 0, min: 0, max: 1024, hint: "0 keeps everything on one line" },
];

const BIG_SAMPLE = `# RSA toy example: n = p·q, then encrypt and decrypt
p = 61
q = 53
n = p * q
phi = (p - 1) * (q - 1)
e = 17
d = modinv(e, phi)
c = modpow(65, e, n)
modpow(c, d, n)`;

const specs: SpecModule = {
  "binary-to-text": {
    inputs: [{ id: "bin", label: "Binary", lang: "text", wrap: true, placeholder: "01001000 01101001 — spaced, continuous, 0b-prefixed or comma-separated" }],
    options: [
      { id: "enc", label: "Decode as", type: "select", choices: ENC_CHOICES, default: "utf8" },
      { id: "bits", label: "Bits", type: "segment", choices: [["auto", "Auto"], ["8", "8-bit"], ["7", "7-bit"]], default: "auto", hint: "Group size for continuous input" },
      { id: "strict", label: "Strict", type: "toggle", default: true, hint: "Stop at invalid bytes instead of substituting U+FFFD" },
    ],
    run({ inputs, opts }) {
      const src = inputs.bin ?? "";
      const p = parseBinary(src, str(opts.bits, "auto"));
      const cs = str(opts.enc, "utf8") as Charset;
      const text = decodeAt(p.bytes, cs, bool(opts.strict), src, p.pos);
      return {
        text,
        views: [
          { label: "Text", out: { kind: "text", text, wrap: true } },
          { label: `Bytes (${p.bytes.length})`, out: { kind: "table", columns: ["#", "binary", "dec", "hex", "char"], rows: byteRows(p.bytes, cs) } },
          stats("Stats", [
            { label: "Format", value: p.format },
            { label: "Bytes", value: p.bytes.length, tone: "info" },
            { label: "Bits", value: p.bytes.length * p.w },
            { label: "Characters", value: [...text].length, tone: "ok" },
          ]),
        ],
      };
    },
    examples: [
      { label: "Hi!", inputs: { bin: "01001000 01101001 00100001" } },
      { label: "Continuous", inputs: { bin: "010010000110010101101100011011000110111100101100001000000111011101101111011100100110110001100100" }, note: "No separators: split into bytes automatically (the length must be a multiple of 8)." },
      { label: "UTF-8 multi-byte", inputs: { bin: "11000011 10101001 11100010 10000010 10101100 11110000 10011111 10011000 10000000" }, note: "é is 2 bytes, € is 3, 😀 is 4 — the leading 1-bits of the first byte say how many follow." },
      { label: "7-bit ASCII", inputs: { bin: "1000011 1101111 1100100 1100101" }, opts: { bits: "7" }, note: "Classic 7-bit ASCII groups." },
      { label: "0b literals", inputs: { bin: "0b1010000, 0b1111001, 0b1110100, 0b1101000, 0b1101111, 0b1101110" }, note: "Copied from source code: 0b prefixes and commas are ignored." },
      { label: "Latin-1", inputs: { bin: "01000011 01100001 01100110 11101001" }, opts: { enc: "latin1" }, note: "0xE9 is é in Latin-1; as UTF-8 it would be an error." },
      { label: "Bad digit", inputs: { bin: "01001000 01102001" }, note: "The error points at the character that isn't 0 or 1.", error: true },
      { label: "Missing bit", inputs: { bin: "0100100001101001001" }, note: "19 bits don't make whole bytes.", error: true },
    ],
  },

  "text-to-binary": {
    inputs: [{ id: "text", label: "Text", lang: "text", wrap: true }],
    options: [
      { id: "enc", label: "Encoding", type: "select", choices: [["utf8", "UTF-8"], ["ascii", "ASCII"], ["latin1", "Latin-1"], ["utf16be", "UTF-16BE"]], default: "utf8" },
      { id: "sep", label: "Separator", type: "select", choices: [["space", "Space"], ["none", "None"], ["newline", "New line"], ["comma", "Comma"]], default: "space" },
      { id: "group", label: "Bits", type: "segment", choices: [["8", "Bytes"], ["4", "Nibbles"], ["7", "7-bit"]], default: "8", hint: "Nibbles split each byte in two; 7-bit drops the leading 0 (ASCII only)" },
      { id: "prefix", label: "0b prefix", type: "toggle", default: false },
      { id: "per", label: "Bytes / line", type: "number", default: 0, min: 0, max: 256, hint: "0 keeps one line" },
    ],
    run({ inputs, opts }) {
      const src = inputs.text ?? "";
      const g = str(opts.group, "8");
      const cs = (g === "7" ? "ascii" : str(opts.enc, "utf8")) as Charset;
      const bytes = encodeText(src, cs);
      const sep = { space: " ", none: "", newline: "\n", comma: ", " }[str(opts.sep, "space")] ?? " ";
      const pre = bool(opts.prefix) ? "0b" : "";
      const tok = (b: number) => {
        const bits = b.toString(2).padStart(g === "7" ? 7 : 8, "0");
        return pre + (g === "4" ? bits.slice(0, 4) + (pre ? "_" : " ") + bits.slice(4) : bits);
      };
      const toks = Array.from(bytes, tok);
      const per = num(opts.per);
      let text: string;
      if (per > 0 && sep !== "\n") {
        const lines: string[] = [];
        for (let i = 0; i < toks.length; i += per) lines.push(toks.slice(i, i + per).join(sep));
        text = lines.join(sep.trim() ? sep.trim() + "\n" : "\n");
      } else text = toks.join(sep);
      const rows = [...src].slice(0, 2000).map((ch) => {
        const b = encodeText(ch, cs);
        return [printable(ch), U(ch.codePointAt(0)!), Array.from(b, (x) => hex2(x).toUpperCase()).join(" "), Array.from(b, (x) => x.toString(2).padStart(8, "0")).join(" ")];
      });
      return {
        text,
        views: [
          { label: "Binary", out: { kind: "text", text, wrap: true } },
          { label: "Per character", out: { kind: "table", columns: ["char", "code point", `${cs === "utf16be" ? "UTF-16" : cs === "utf8" ? "UTF-8" : cs === "ascii" ? "ASCII" : "Latin-1"} bytes`, "binary"], rows } },
          stats("Stats", [
            { label: "Characters", value: [...src].length },
            { label: "Bytes", value: bytes.length, tone: "info" },
            { label: "Bits", value: bytes.length * (g === "7" ? 7 : 8) },
            { label: "Ones", value: Array.from(bytes).reduce((a, b) => a + b.toString(2).replace(/0/g, "").length, 0) },
          ]),
        ],
      };
    },
    examples: [
      { label: "Hello", inputs: { text: "Hello" } },
      { label: "UTF-8 bytes", inputs: { text: "Añ€😀" }, note: "1, 2, 3 and 4 bytes — see the Per character table for code point → bytes → bits." },
      { label: "Nibbles, 0b", inputs: { text: "OK" }, opts: { group: "4", prefix: true }, note: "Each byte split into two 4-bit halves (one hex digit each); with 0b on, 0b0100_1111 is a valid literal in JS, Python, Rust and Java." },
      { label: "7-bit, one per line", inputs: { text: "ASCII" }, opts: { group: "7", sep: "newline" }, note: "Teletype-era 7-bit codes." },
      { label: "Continuous stream", inputs: { text: "Binary is fun" }, opts: { sep: "none", per: 4 }, note: "Four bytes (32 bits) per line, no separators." },
      { label: "UTF-16BE", inputs: { text: "Hi ☃" }, opts: { enc: "utf16be", sep: "comma" }, note: "Two bytes per character: the high byte of ASCII letters is all zeros." },
      { label: "Not ASCII", inputs: { text: "naïve" }, opts: { enc: "ascii" }, note: "ï has no 7-bit code — the error names the character.", error: true },
    ],
  },

  "hex-to-text": {
    inputs: [{ id: "hex", label: "Hex", lang: "text", wrap: true, placeholder: "48 65 6c 6c 6f · 0x48,0x65 · \\x48\\x65 · 48:65 · xxd / hexdump -C output" }],
    options: [
      { id: "enc", label: "Decode as", type: "select", choices: ENC_CHOICES, default: "utf8" },
      { id: "strict", label: "Strict", type: "toggle", default: true, hint: "Stop at invalid bytes instead of substituting U+FFFD" },
    ],
    run({ inputs, opts }) {
      const src = inputs.hex ?? "";
      if (!src.trim()) throw new ToolError("Paste hex bytes to decode.");
      const { bytes, format } = parseHex(src);
      if (!bytes.length) throw new ToolError("No hex digits found.");
      const cs = str(opts.enc, "utf8") as Charset;
      // Map each byte back to a source position for error messages.
      const pos: number[] = [];
      for (const m of src.matchAll(/[0-9a-fA-F]{2}/g)) pos.push(m.index ?? 0);
      const text = decodeAt(bytes, cs, bool(opts.strict), src, pos);
      const bom = cs.startsWith("utf16") && bytes.length > 1 && ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff));
      return {
        text,
        notes: bom ? [`Starts with a UTF-16 byte-order mark (${bytes[0] === 0xff ? "FF FE → little-endian" : "FE FF → big-endian"}).`] : undefined,
        views: [
          { label: "Text", out: { kind: "text", text, wrap: true } },
          { label: "Hex dump", out: { kind: "text", text: hexdump(bytes) } },
          stats("Stats", [
            { label: "Input format", value: format },
            { label: "Bytes", value: bytes.length, tone: "info" },
            { label: "Characters", value: [...text].length, tone: "ok" },
            { label: "Non-ASCII bytes", value: Array.from(bytes).filter((b) => b > 0x7f).length },
          ]),
        ],
      };
    },
    examples: [
      { label: "Spaced", inputs: { hex: "48 65 6c 6c 6f 2c 20 77 6f 72 6c 64 21" } },
      { label: "Continuous", inputs: { hex: "4a534f4e20697320636f6f6c" } },
      { label: "0x, C array", inputs: { hex: "const char msg[] = { 0x43, 0x61, 0x66, 0xC3, 0xA9 };" }, note: "Type names, braces and 0x prefixes are ignored; C3 A9 is é in UTF-8." },
      { label: "\\x escapes", inputs: { hex: "\\xe2\\x9c\\x93 \\xf0\\x9f\\x9a\\x80" }, note: "Escapes copied from Python, bash or a log file." },
      {
        label: "xxd dump",
        inputs: { hex: "00000000: 5468 6520 7175 6963 6b20 6272 6f77 6e20  The quick brown \n00000010: 666f 7820 6a75 6d70 7320 6f76 6572 2074  fox jumps over t\n00000020: 6865 206c 617a 7920 646f 672e 0a        he lazy dog.." },
        note: "Offsets and the ASCII column are dropped — paste xxd or hexdump -C output as-is.",
      },
      { label: "UTF-16LE + BOM", inputs: { hex: "FF FE 48 00 69 00 20 00 3D D8 4B DC" }, opts: { enc: "utf16le" }, note: "Windows-style UTF-16LE with a byte-order mark; 3D D8 4B DC is a surrogate pair (👋)." },
      { label: "Odd length", inputs: { hex: "48656c6c6" }, note: "Nine digits can't make whole bytes.", error: true },
      { label: "Bad digit", inputs: { hex: "48 65 6g 6c" }, note: "g is not a hex digit — the error gives the position.", error: true },
    ],
  },

  "text-to-hex": {
    inputs: [{ id: "text", label: "Text", lang: "text", wrap: true }],
    options: [{ id: "enc", label: "Encoding", type: "select", choices: [["utf8", "UTF-8"], ["utf16le", "UTF-16LE"], ["utf16be", "UTF-16BE"], ["latin1", "Latin-1"], ["utf32be", "UTF-32BE"]], default: "utf8" }, ...HEX_OPTS],
    run({ inputs, opts }) {
      const src = inputs.text ?? "";
      const cs = str(opts.enc, "utf8") as Charset;
      const bytes = encodeText(src, cs);
      const upper = opts.case === "upper";
      const text = hexFormat(bytes, { upper, sep: str(opts.sep), perLine: num(opts.per), name: "text" });
      const rows = [...src].slice(0, 2000).map((ch) => [printable(ch), U(ch.codePointAt(0)!), Array.from(encodeText(ch, cs), (b) => (upper ? hex2(b).toUpperCase() : hex2(b))).join(" ")]);
      return {
        text,
        views: [
          { label: "Hex", out: { kind: "text", text, wrap: !num(opts.per) } },
          { label: "Hex dump", out: { kind: "text", text: hexdump(bytes, { upper }) } },
          { label: "Per character", out: { kind: "table", columns: ["char", "code point", "bytes"], rows } },
          stats("Stats", [
            { label: "Characters", value: [...src].length },
            { label: "Bytes", value: bytes.length, tone: "info" },
            { label: "Hex digits", value: bytes.length * 2 },
          ]),
        ],
      };
    },
    examples: [
      { label: "Hello", inputs: { text: "Hello, world!" } },
      { label: "UTF-8", inputs: { text: "café ✓ 🚀" }, opts: { case: "upper" }, note: "é → C3 A9, ✓ → E2 9C 93, 🚀 → F0 9F 9A 80." },
      { label: "UTF-16LE", inputs: { text: "Hi 🚀" }, opts: { enc: "utf16le" }, note: "Little-endian code units; the rocket is a surrogate pair (3D D8 80 DE)." },
      { label: "\\x escaped", inputs: { text: "tab\there" }, opts: { sep: "escape" }, note: "Ready for printf or a Python bytes literal." },
      { label: "C array", inputs: { text: "GET / HTTP/1.1\r\nHost: example.com\r\n\r\n" }, opts: { sep: "c", per: 12 }, note: "An HTTP request as a byte array for a test fixture." },
      { label: "Colon, 8 per line", inputs: { text: "The quick brown fox" }, opts: { sep: "colon", per: 8 } },
    ],
  },

  "ascii-table": {
    inputs: [{ id: "q", label: "Find", kind: "text", placeholder: "A · 65 · 0x41 · NUL · \\n · ^C · &amp; · digit · A-Z · 0x20-0x2F · Hi!" }],
    options: [
      { id: "range", label: "Range", type: "segment", choices: [["ascii", "0–127"], ["latin1", "0–255 (Latin-1)"]], default: "ascii" },
      { id: "cat", label: "Show", type: "select", choices: [["all", "Everything"], ["control", "Control codes"], ["printable", "Printable"], ["letters", "Letters"], ["digits", "Digits"], ["punct", "Punctuation & symbols"]], default: "all" },
    ],
    generator: true,
    run({ inputs, opts }) {
      const max = opts.range === "latin1" ? 255 : 127;
      const q = (inputs.q ?? "").trim();
      let cps = Array.from({ length: max + 1 }, (_, i) => i);
      const how: string[] = [];
      if (q) {
        const terms = q.includes(",") && q.length > 1 ? q.split(",").filter((x) => x.trim()) : [q];
        const set = new Set<number>();
        let keepOrder = false;
        for (const t of terms) {
          const m = matchTerm(t, max);
          m.cps.forEach((c) => set.add(c));
          how.push(`“${t.trim()}” → ${m.how}`);
          keepOrder = terms.length === 1 && m.how === "characters of the text";
        }
        cps = keepOrder ? [...set] : [...set].sort((a, b) => a - b);
      }
      const cat = str(opts.cat, "all");
      let rows = cps.map(asciiRow);
      rows = rows.filter((r) =>
        cat === "all" ? true : cat === "control" ? r.cat === "control" : cat === "printable" ? r.cat !== "control" : cat === "letters" ? r.cat === "upper" || r.cat === "lower" : cat === "digits" ? r.cat === "digit" : r.cat === "punct" || r.cat === "symbol"
      );
      if (!rows.length) throw new ToolError(`Nothing matches “${q}”${max < 255 ? " in 0–127 — try the Latin-1 range" : ""}.`);
      const cols = ["Dec", "Hex", "Oct", "Binary", "Char", "HTML", "Escape", "Caret", "Abbr", "Description"];
      const tableRows = rows.map((r) => [r.dec, r.hex, r.oct, r.bin, r.ch, r.html, r.esc, r.caret, r.abbr, r.desc]);
      const w = [3, 3, 3, 8, 4, 10, 8, 5, 5];
      const text = [cols.map((c, i) => (i < w.length ? c.padEnd(w[i]) : c)).join("  "), ...tableRows.map((r) => r.map((c, i) => (i < w.length ? String(c).padEnd(w[i]) : String(c))).join("  "))].join("\n");
      return {
        text,
        notes: how.length ? [how.join(" · ")] : undefined,
        views: [
          { label: `Table (${rows.length})`, out: { kind: "table", columns: cols, rows: tableRows } },
          { label: "Text", out: { kind: "text", text } },
        ],
      };
    },
    examples: [
      { label: "Full table", inputs: { q: "" }, note: "All 128 ASCII codes with hex, octal, binary, HTML, C escape and caret notation." },
      { label: "Find “A”", inputs: { q: "A" }, note: "One character — A is 65, 0x41, 0b01000001." },
      { label: "By number", inputs: { q: "0x1B, 27, 033, ^[, \\e" }, note: "Five ways to write ESC; comma-separate several queries." },
      { label: "Control codes", inputs: { q: "" }, opts: { cat: "control" }, note: "The 33 non-printing codes, from NUL to DEL, with their names." },
      { label: "Range A-Z", inputs: { q: "A-Z" }, note: "Ranges work with characters, decimals or hex (0x41-0x5A)." },
      { label: "By description", inputs: { q: "bracket" }, note: "Search the descriptions: every kind of bracket." },
      { label: "Latin-1 accents", inputs: { q: "with acute" }, opts: { range: "latin1" }, note: "The 0–255 range adds Latin-1 letters and symbols." },
      { label: "Spell a word", inputs: { q: "Hi!" }, note: "Any other text shows the codes of its characters." },
    ],
  },

  "base-converter": {
    inputs: [{ id: "n", label: "Number(s)", lang: "text", placeholder: "255 · 0xff · 0b1010 · 0o777 · -42 · 3.75 · one per line for a batch" }],
    options: [
      { id: "from", label: "From base", type: "select", choices: [["auto", "Auto-detect"], ...Array.from({ length: 35 }, (_, i) => [String(i + 2), `Base ${i + 2}${{ 2: " (binary)", 8: " (octal)", 10: " (decimal)", 16: " (hex)", 36: "" }[i + 2] ?? ""}`] as [string, string])], default: "auto" },
      { id: "to", label: "Custom base", type: "number", default: 12, min: 2, max: 36 },
      { id: "frac", label: "Fraction digits", type: "number", default: 24, min: 1, max: 200 },
      { id: "group", label: "Group digits", type: "toggle", default: false },
      { id: "upper", label: "Upper-case", type: "toggle", default: false },
    ],
    run({ inputs, opts }) {
      const src = inputs.n ?? "";
      const lines = src.split("\n").map((l, i, a) => ({ l, at: a.slice(0, i).reduce((s, x) => s + x.length + 1, 0) })).filter((x) => x.l.trim());
      if (!lines.length) throw new ToolError("Enter a number — prefixes 0x, 0b and 0o pick the base automatically.");
      const to = Math.min(36, Math.max(2, Math.round(num(opts.to, 12))));
      const fd = Math.round(num(opts.frac, 24));
      const up = bool(opts.upper), group = bool(opts.group);
      const bases: [string, number][] = [["Decimal", 10], ["Hex", 16], ["Octal", 8], ["Binary", 2], ["Base 36", 36]];
      if (![10, 16, 8, 2, 36].includes(to)) bases.push([`Base ${to}`, to]);
      const parsed = lines.map(({ l, at }) => parseNumber(l, str(opts.from, "auto"), src, at));
      if (parsed.length > 1) {
        const cols = ["input", "from", ...bases.map(([n]) => n)];
        const rows = parsed.map((p, i) => [lines[i].l.trim(), p.base, ...bases.map(([, b]) => toBase(p, b, fd, up, group))]);
        const text = [cols.join("\t"), ...rows.map((r) => r.join("\t"))].join("\n");
        return { text, views: [{ label: `Batch (${rows.length})`, out: { kind: "table", columns: cols, rows } }, { label: "TSV", out: { kind: "text", text } }] };
      }
      const p = parsed[0];
      const outs = bases.map(([name, b]) => [name, b, toBase(p, b, fd, up, group)] as [string, number, string]);
      const text = outs.map(([name, , v]) => `${name.padEnd(8)} ${v}`).join("\n");
      const views: View[] = [
        { label: "Results", out: { kind: "table", columns: ["base", "radix", "value", "digits"], rows: outs.map(([n, b, v]) => [n, b, v, v.replace(/[^0-9a-z]/gi, "").length]) } },
        { label: "Text", out: { kind: "text", text } },
      ];
      const notes = [`Read as ${p.how}.`];
      if (!p.fn) {
        const v = p.neg ? -p.int : p.int;
        const need = v < 0n ? (-v - 1n).toString(2).length + 1 : v.toString(2).length;
        const widths = [8, 16, 32, 64, ...(need > 64 ? [128] : [])];
        const fit = [8, 16, 32, 64, 128].find((w) => w >= need) ?? 128;
        views.push({
          label: "Two's complement",
          out: { kind: "table", columns: ["width", "bits", "hex", "unsigned", "signed", "status"], rows: widths.map((w) => { const t = twos(v, w); return [`${w}-bit`, t.bits, t.hex, t.unsigned, t.signed, t.fits]; }) },
        });
        const bits = (v < 0n || need > 128 ? (need > 128 ? v.toString(2).padStart(Math.ceil(need / 8) * 8, "0").replace(/\B(?=(.{4})+$)/g, " ") : twos(v, fit).bits) : v.toString(2).padStart(Math.ceil(Math.max(1, need) / 8) * 8, "0").replace(/\B(?=(.{4})+$)/g, " ")).split(" ");
        const cells = bits.map((nib, i) => `<td style="padding:4px 6px;border:1px solid #ddd;text-align:center"><div style="font-family:var(--font-mono);letter-spacing:2px">${[...nib].map((b) => `<span style="color:${b === "1" ? "#0088b0" : "#aaa"};font-weight:${b === "1" ? 700 : 400}">${b}</span>`).join("")}</div><div style="font-size:11px;color:#888">${parseInt(nib, 2).toString(16).toUpperCase()}</div></td>`);
        const rowsHtml: string[] = [];
        for (let i = 0; i < cells.length; i += 8) rowsHtml.push(`<tr>${cells.slice(i, i + 8).join("")}</tr>`);
        views.push({ label: "Bits", out: { kind: "html", html: `<p>${bits.join("").length} bits${v < 0n ? " (two's complement)" : ""} · ${bits.join("").replace(/0/g, "").length} set · nibbles with their hex digit</p><table style="border-collapse:collapse">${rowsHtml.join("")}</table>` } });
      } else notes.push("Fractions convert digit by digit; a trailing … means the expansion goes on (it repeats in the target base).");
      const f = (Number(p.int) + Number(p.fn) / Number(p.fd)) * (p.neg ? -1 : 1);
      if (Number.isFinite(f)) {
        const dv = new DataView(new ArrayBuffer(8));
        dv.setFloat64(0, f);
        const f64 = Array.from(new Uint8Array(dv.buffer), hex2).join("");
        const bits64 = Array.from(new Uint8Array(dv.buffer), (b) => b.toString(2).padStart(8, "0")).join("");
        dv.setFloat32(0, f);
        const f32 = Array.from(new Uint8Array(dv.buffer, 0, 4), hex2).join("");
        const exact = Number.isSafeInteger(f) || !!p.fn ? "" : " (rounded — beyond 2^53)";
        views.push({
          label: "IEEE 754",
          out: {
            kind: "table",
            columns: ["format", "hex", "sign · exponent · mantissa", "value"],
            rows: [
              ["float64", `0x${f64.toUpperCase()}`, `${bits64[0]} · ${bits64.slice(1, 12)} · ${bits64.slice(12)}`, String(f) + exact],
              ["float32", `0x${f32.toUpperCase()}`, "", String(Math.fround(f))],
            ],
          },
        });
      }
      return { text, notes, views };
    },
    examples: [
      { label: "255", inputs: { n: "255" }, note: "See the Two's complement tab: 255 is -1 as a signed 8-bit value." },
      { label: "Hex colour", inputs: { n: "0xFF8800" }, opts: { group: true }, note: "0x prefix → base 16. Grouping splits binary and hex into nibbles." },
      { label: "Negative", inputs: { n: "-42" }, note: "Two's complement at 8, 16, 32 and 64 bits." },
      { label: "Fraction", inputs: { n: "0.1" }, opts: { frac: 32 }, note: "0.1 never ends in binary — why 0.1 + 0.2 ≠ 0.3 in floating point. See IEEE 754." },
      { label: "Big integer", inputs: { n: "0xDEADBEEFCAFEBABE1234567890" }, note: "BigInt: no precision loss at any size." },
      { label: "Base 36 id", inputs: { n: "zik0zj" }, opts: { from: "36" }, note: "Short ids (like URL shorteners) are often base 36." },
      { label: "Batch", inputs: { n: "0b1010\n0o17\n0x1F\n1000000\n-1" }, note: "One number per line gives a table." },
      { label: "Invalid digit", inputs: { n: "0o1289" }, note: "8 and 9 are not octal digits.", error: true },
    ],
  },

  "big-number": {
    inputs: [{ id: "expr", label: "Expressions (one per line)", lang: "text", placeholder: "2^256 − 1\nx = 100!\nx / 2^10\ngcd(x, 3^50)" }],
    options: [
      { id: "mode", label: "Mode", type: "segment", choices: [["int", "Integer"], ["dec", "Decimal"]], default: "int" },
      { id: "prec", label: "Decimals", type: "number", default: 30, min: 0, max: 5000, show: (o) => o.mode === "dec" },
      { id: "round", label: "Rounding", type: "select", choices: [["half-up", "Half up"], ["half-even", "Half even (banker's)"], ["down", "Toward zero"]], default: "half-up", show: (o) => o.mode === "dec" },
      { id: "fmt", label: "Show", type: "segment", choices: [["plain", "Plain"], ["group", "1,234"], ["sci", "Scientific"]], default: "plain" },
    ],
    steps: ["Write one expression per line: + − × ÷ % ^ (or **), parentheses, n! factorials.", "Assign with name = expression and reuse names on later lines; ans is the previous result.", "Functions: gcd lcm abs min max pow modpow modinv mod isqrt sqrt cbrt root floor ceil round trunc sign fact binom digits bits.", "Decimal mode keeps exact fractions and rounds only for display, to the precision you choose."],
    async run({ inputs, opts }) {
      const B = await import("./lib/A-bignum");
      const src = inputs.expr ?? "";
      if (!src.trim()) throw new ToolError("Type an expression, e.g. 2^128 or 50!");
      const mode = opts.mode === "dec" ? "dec" : "int";
      const o = { mode, precision: Math.max(0, Math.round(num(opts.prec, 30))), rounding: str(opts.round, "half-up"), group: opts.fmt === "group" } as const;
      let res: ReturnType<typeof B.runLines>;
      try {
        res = B.runLines(src, o);
      } catch (e) {
        if (e instanceof B.CalcError) {
          const x = e as InstanceType<typeof B.CalcError> & { line?: number; src?: string };
          const line = x.src ?? "";
          throw new ToolError(`Line ${x.line}, column ${x.pos + 1}: ${x.message}\n  ${line}\n  ${" ".repeat(x.pos)}^`);
        }
        throw e;
      }
      const shown = (r: (typeof res.results)[number]) => (opts.fmt === "sci" ? r.sci : r.text);
      const text = res.results.map((r) => (r.name ? `${r.name} = ${shown(r)}` : shown(r))).join("\n");
      const approx = res.results.filter((r) => !r.exact).length;
      const w = Math.min(40, Math.max(...res.results.map((r) => r.src.length)));
      return {
        text,
        notes: [
          ...(mode === "int" && /\//.test(src.replace(/(#|\/\/).*$/gm, "")) ? ["Integer mode: / truncates toward zero (7 / 2 = 3). Switch to Decimal for exact fractions."] : []),
          ...(approx ? [`${approx} result(s) rounded to ${o.precision} decimals (marked ≈).`] : []),
        ],
        views: [
          { label: "Results", out: { kind: "text", text } },
          {
            label: "Worksheet",
            out: {
              kind: "text",
              text: res.results.map((r) => `${r.src.padEnd(w)}  ${r.exact ? "=" : "≈"} ${shown(r)}`).join("\n"),
            },
          },
          {
            label: "Details",
            out: {
              kind: "table",
              columns: ["line", "expression", "result", "digits", "scientific", ...(mode === "dec" ? ["exact fraction"] : [])],
              rows: res.results.map((r) => [r.line, r.src, (r.exact ? "" : "≈ ") + (r.text.length > 300 ? r.text.slice(0, 300) + "…" : r.text), r.digits, r.sci, ...(mode === "dec" ? [r.fraction ?? (r.exact ? "(integer)" : "")] : [])]),
            },
          },
        ],
      };
    },
    examples: [
      { label: "2^256", inputs: { expr: "2^256\n2^256 - 1\n2^64 * 2^64" }, opts: { fmt: "group" }, note: "Exact integers of any size — the largest SHA-256 value and 128-bit products." },
      { label: "Factorials", inputs: { expr: "20!\n52!   # ways to shuffle a deck\n100!\ndigits(1000!)" }, note: "52! has 68 digits; the Details tab shows digit counts and scientific notation." },
      { label: "RSA toy", inputs: { expr: BIG_SAMPLE }, note: "Variables across lines, modinv and modpow: 65 encrypts and decrypts back to 65." },
      { label: "Exact fractions", inputs: { expr: "1/3 * 3\n0.1 + 0.2\n2/7\n22/7 - pi" }, opts: { mode: "dec", prec: 40 }, note: "Decimal mode is exact: 0.1 + 0.2 = 0.3 (unlike floating point)." },
      { label: "√2 to 100 places", inputs: { expr: "sqrt(2)\n2^(1/12)   # equal-temperament semitone\ne\npi" }, opts: { mode: "dec", prec: 100 }, note: "Irrational results are rounded (≈) to the chosen precision." },
      { label: "Number theory", inputs: { expr: "a = 2^89 - 1   # a Mersenne prime\nmodpow(3, a - 1, a)\ngcd(2^60 - 1, 2^48 - 1)\nlcm(12, 18, 30)\nisqrt(10^40 + 12345)\nbinom(60, 30)" }, note: "Fermat test: 3^(a−1) mod a = 1 for a prime a." },
      { label: "Rounding modes", inputs: { expr: "2.5\n3.5\n-2.5\n1/8" }, opts: { mode: "dec", prec: 0, round: "half-even" }, note: "Banker's rounding sends halves to the even neighbour: 2.5 → 2, 3.5 → 4." },
      { label: "Syntax error", inputs: { expr: "x = 12\n(x + 3 * 4" }, note: "Errors give the line and column with a caret.", error: true },
    ],
  },

  "epoch-converter": {
    inputs: [{ id: "t", label: "Timestamps or dates (one per line)", lang: "text", placeholder: "1700000000 · 1700000000123 · now · 2024-02-29T12:00:00Z" }],
    options: [
      { id: "unit", label: "Unit", type: "select", choices: [["auto", "Auto-detect"], ["s", "Seconds"], ["ms", "Milliseconds"], ["us", "Microseconds"], ["ns", "Nanoseconds"]], default: "auto" },
      { id: "tz", label: "Time zone", type: "select", choices: tzChoices(), default: "America/New_York" },
    ],
    run({ inputs, opts }) {
      const src = inputs.t ?? "";
      const lines = src.split("\n").filter((l) => l.trim());
      if (!lines.length) throw new ToolError("Enter a Unix timestamp (s, ms, µs or ns), a date string, or “now”.");
      const now = Date.now();
      const tz = str(opts.tz, "UTC");
      const rows = lines.map((l) => readEpoch(l, str(opts.unit, "auto"), now));
      const good = rows.filter((r) => !r.error && Number.isFinite(r.ms) && Math.abs(r.ms) <= 8.64e15);
      rows.forEach((r) => {
        if (!r.error && Math.abs(r.ms) > 8.64e15) r.error = `${r.input} is outside the range JavaScript dates can represent (±273,790 years)`;
      });
      if (!good.length) throw new ToolError(rows.map((r) => r.error).filter(Boolean).join("\n"));
      const fields = (r: EpochRow): [string, string][] => {
        const d = new Date(r.ms);
        const localFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "full", timeStyle: "long" }).format(d);
        return [
          ["Input", `${r.input}  (${r.unit})`],
          ["UTC (ISO 8601)", d.toISOString() + (r.extra ? `  ${r.extra}` : "")],
          [`Time zone ${tz}`, inZone(d, tz)],
          ["Local (this browser)", localFmt],
          ["RFC 2822", rfc2822(d)],
          ["Relative", relTime(r.ms, now)],
          ["Weekday", d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" })],
          ["ISO week", isoWeek(d)],
          ["Day of year", String(dayOfYear(d))],
          ["Unix seconds", String(Math.floor(r.ms / 1000))],
          ["Unix milliseconds", String(Math.floor(r.ms))],
        ];
      };
      const errs = rows.filter((r) => r.error).map((r) => r.error!);
      if (rows.length === 1) {
        const f = fields(rows[0]);
        const kw = Math.max(...f.map(([k]) => k.length));
        const text = f.map(([k, v]) => `${k.padEnd(kw)}  ${v}`).join("\n");
        return { text, views: [{ label: "Converted", out: { kind: "table", columns: ["field", "value"], rows: f } }, { label: "Text", out: { kind: "text", text } }] };
      }
      const cols = ["input", "unit", "UTC ISO", tz, "relative", "RFC 2822", "weekday", "ISO week", "day of year", "unix s", "unix ms"];
      const trows = rows.map((r) => {
        if (r.error) return [r.input, "invalid", r.error, "", "", "", "", "", "", "", ""];
        const f = fields(r).map(([, v]) => v);
        return [r.input, r.unit, f[1], f[2], f[5], f[4], f[6], f[7], f[8], f[9], f[10]];
      });
      const text = rows.map((r) => (r.error ? `${r.input}\tinvalid` : `${r.input}\t${new Date(r.ms).toISOString()}\t${Math.floor(r.ms / 1000)}`)).join("\n");
      return {
        text,
        notes: errs.length ? [`${errs.length} line(s) could not be read.`] : undefined,
        views: [
          { label: `Batch (${rows.length})`, out: { kind: "table", columns: cols, rows: trows } },
          { label: "TSV", out: { kind: "text", text } },
        ],
      };
    },
    examples: [
      { label: "Seconds", inputs: { t: "1700000000" }, note: "10 digits → seconds. 1.7 billion seconds after 1970-01-01T00:00:00Z." },
      { label: "Now", inputs: { t: "now" }, opts: { tz: "Asia/Tokyo" }, note: "The current instant, also shown in the selected time zone." },
      { label: "Milliseconds (JS)", inputs: { t: "1718900000123" }, opts: { tz: "Europe/Berlin" }, note: "13 digits → milliseconds, what Date.now() returns." },
      { label: "Nanoseconds", inputs: { t: "1700000000123456789" }, note: "19 digits → nanoseconds (Go, Prometheus); sub-millisecond digits are kept exactly." },
      { label: "Before 1970", inputs: { t: "-14182940" }, opts: { tz: "America/Chicago" }, note: "Negative = before the epoch: Apollo 11's landing, 20 July 1969." },
      { label: "Y2038 & far future", inputs: { t: "2147483647\n2147483648\n4102444800\n32503680000" }, note: "The last second a signed 32-bit time_t can hold, the one after (it wraps to 1901 on old systems), 2100 and the year 3000." },
      { label: "Dates → epoch", inputs: { t: "2024-02-29T12:00:00+05:30\nTue, 14 Nov 2023 22:13:20 GMT\n2026-01-01" }, opts: { tz: "Asia/Kolkata" }, note: "ISO 8601 and RFC 2822 strings convert back to Unix seconds and ms." },
      { label: "Not a date", inputs: { t: "next tuesday-ish" }, error: true, note: "Unreadable input is reported." },
    ],
  },

  "string-length": {
    inputs: [{ id: "text", label: "Text", lang: "text", wrap: true }],
    options: [
      { id: "wpm", label: "Reading WPM", type: "number", default: 238, min: 50, max: 1000, hint: "Average silent reading speed for adults is ~238 words per minute" },
      { id: "spm", label: "Speaking WPM", type: "number", default: 150, min: 50, max: 400 },
      { id: "freq", label: "Frequency of", type: "segment", choices: [["char", "Characters"], ["word", "Words"]], default: "char" },
      { id: "ci", label: "Ignore case", type: "toggle", default: false },
      { id: "ws", label: "Count whitespace", type: "toggle", default: false, hint: "Include spaces and line breaks in the frequency table" },
    ],
    run({ inputs, opts }) {
      const s = inputs.text ?? "";
      const cps = [...s];
      const graphemes = segments(s, "grapheme")?.map((x) => x.segment) ?? cps;
      const wordSegs = segments(s, "word");
      const words = wordSegs ? wordSegs.filter((x) => x.isWordLike).map((x) => x.segment) : s.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? [];
      const sentences = (segments(s, "sentence") ?? s.split(/(?<=[.!?])\s+/).map((segment) => ({ segment }))).filter((x) => /[\p{L}\p{N}]/u.test(x.segment)).length;
      const lines = s ? s.split(/\r\n|\r|\n/) : [];
      const paragraphs = s.split(/\n\s*\n/).filter((p) => p.trim()).length;
      const utf8 = utf8Encode(s).length;
      const whitespace = (s.match(/\s/gu) ?? []).length;
      const longest = lines.reduce((a, l) => Math.max(a, [...l].length), 0);
      const invisible = (s.match(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF\u00AD]/g) ?? []).length;
      const emoji = graphemes.filter((g) => /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(g)).length;
      const wpm = Math.max(1, num(opts.wpm, 238)), spm = Math.max(1, num(opts.spm, 150));
      const items: Stat[] = [
        { label: "Characters (UTF-16 units)", value: s.length, tone: "info" },
        { label: "Code points", value: cps.length },
        { label: "Graphemes (visible)", value: graphemes.length, tone: "ok" },
        { label: "Words", value: words.length, tone: "info" },
        { label: "Sentences", value: sentences },
        { label: "Paragraphs", value: paragraphs },
        { label: "Lines", value: lines.length },
        { label: "Longest line", value: longest },
        { label: "Whitespace", value: whitespace },
        { label: "Without spaces", value: cps.length - whitespace },
        { label: "Bytes UTF-8", value: utf8, tone: "warn" },
        { label: "Bytes UTF-16", value: s.length * 2 },
        { label: "Bytes UTF-32", value: cps.length * 4 },
        { label: "Letters", value: (s.match(/\p{L}/gu) ?? []).length },
        { label: "Digits", value: (s.match(/\p{Nd}/gu) ?? []).length },
        { label: "Emoji", value: emoji },
        { label: "Non-ASCII", value: cps.filter((c) => c.codePointAt(0)! > 127).length },
        { label: "Invisible / format chars", value: invisible, tone: invisible ? "bad" : undefined },
        { label: "Unique characters", value: new Set(cps).size },
        { label: "Reading time", value: duration(words.length / wpm) },
        { label: "Speaking time", value: duration(words.length / spm) },
      ];
      const ci = bool(opts.ci), withWs = bool(opts.ws);
      const counts = new Map<string, number>();
      const units = opts.freq === "word" ? words.map((w) => (ci ? w.toLowerCase() : w)) : graphemes.filter((g) => withWs || !/^\s+$/u.test(g)).map((g) => (ci ? g.toLowerCase() : g));
      units.forEach((u) => counts.set(u, (counts.get(u) ?? 0) + 1));
      const total = units.length || 1;
      const freqRows = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([u, n]) => (opts.freq === "word" ? [u, n, `${((n / total) * 100).toFixed(1)}%`] : [printable(u), [...u].map((c) => U(c.codePointAt(0)!)).join(" "), n, `${((n / total) * 100).toFixed(1)}%`]));
      const lineRows = lines.slice(0, 5000).map((l, i) => {
        const w = segments(l, "word")?.filter((x) => x.isWordLike).length ?? (l.match(/[\p{L}\p{N}]+/gu) ?? []).length;
        return [i + 1, l.length, [...l].length, segments(l, "grapheme")?.length ?? [...l].length, utf8Encode(l).length, w, l.length > 60 ? l.slice(0, 57) + "…" : l];
      });
      const text = items.map((i) => `${i.label}: ${typeof i.value === "number" ? i.value.toLocaleString("en-US") : i.value}`).join("\n");
      const notes: string[] = [];
      if (s.length !== graphemes.length) notes.push(`JavaScript's .length says ${s.length}, but a reader sees ${graphemes.length} character${graphemes.length === 1 ? "" : "s"} — emoji, accents and flags take several code units.`);
      if (invisible) notes.push(`${invisible} invisible formatting character(s) found (zero-width spaces, joiners, bidi controls, BOM or soft hyphens).`);
      return {
        text,
        notes,
        views: [
          stats("Counts", items),
          { label: `${opts.freq === "word" ? "Word" : "Character"} frequency`, out: { kind: "table", columns: opts.freq === "word" ? ["word", "count", "share"] : ["char", "code points", "count", "share"], rows: freqRows } },
          { label: `Lines (${lines.length})`, out: { kind: "table", columns: ["line", "UTF-16", "code points", "graphemes", "UTF-8 bytes", "words", "text"], rows: lineRows } },
          { label: "Summary", out: { kind: "text", text } },
        ],
      };
    },
    examples: [
      { label: "Hello 🌍", inputs: { text: "Hello 🌍" }, note: "7 visible characters and 7 code points, but .length is 8: the globe is a surrogate pair (2 UTF-16 units, 4 UTF-8 bytes)." },
      {
        label: "Paragraphs",
        inputs: {
          text: "The Analytical Engine weaves algebraic patterns just as the Jacquard loom weaves flowers and leaves. It might act upon other things besides number.\n\nSupposing, for instance, that the fundamental relations of pitched sounds were susceptible of such expression, the engine might compose elaborate pieces of music.\n\n— Ada Lovelace, 1843",
        },
        note: "Words, sentences, paragraphs and reading time for a short passage.",
      },
      { label: "Family emoji", inputs: { text: "👨\u200D👩\u200D👧\u200D👦 🇯🇵 é é" }, note: "One family emoji is 7 code points (joined by ZWJ); a flag is 2; é can be 1 or 2 (e + combining accent)." },
      { label: "Tweet check", inputs: { text: "Shipping v2.0 today 🚀 — offline-first dev tools, no sign-up, no tracking. Try the JWT workbench and the big-number calculator! #devtools #offline" }, note: "Is it under 280? Compare characters, graphemes and UTF-8 bytes." },
      { label: "Invisible chars", inputs: { text: "pass\u200Bword\uFEFF and ad\u00ADmin" }, note: "Zero-width space, BOM and soft hyphen — invisible but counted (a classic copy-paste bug)." },
      { label: "Word frequency", inputs: { text: "the cat sat on the mat and the dog sat on the log" }, opts: { freq: "word" }, note: "Most frequent words first." },
      { label: "CJK", inputs: { text: "東京は日本の首都です。人口は約1400万人です。" }, note: "Intl.Segmenter finds words and sentences even without spaces." },
    ],
  },
};

export default specs;
