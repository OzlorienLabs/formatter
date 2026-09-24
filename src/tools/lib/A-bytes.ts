/**
 * Byte helpers shared by the Encoding and Binary & Numbers tools: Base64 in
 * both directions (tolerant, with precise error positions), charsets, hex
 * formatting and parsing (xxd / hexdump -C dumps too), magic-byte sniffing
 * and image dimensions read straight from the headers.
 */
import { ToolError } from "../types";

export const utf8Encode = (s: string) => new TextEncoder().encode(s);

export function fmtSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

/** 1-based line/column of a character offset. */
export function lineColAt(src: string, pos: number) {
  let line = 1, col = 1;
  for (let i = 0; i < pos && i < src.length; i++) {
    if (src.charCodeAt(i) === 10) { line++; col = 1; } else col++;
  }
  return { line, col };
}

export function where(src: string, pos: number) {
  const { line, col } = lineColAt(src, pos);
  return src.includes("\n") ? `line ${line}, column ${col}` : `position ${col}`;
}

/** Printable name for a character in an error message. */
export function showChar(c: string) {
  const cp = c.codePointAt(0) ?? 0;
  if (cp < 0x20 || cp === 0x7f) return `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
  return `"${c}"`;
}

/* ── Base64 ──────────────────────────────────────────────────────────── */

const STD = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const URLS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export function b64encode(bytes: Uint8Array, o: { url?: boolean; pad?: boolean; wrap?: number } = {}): string {
  const A = o.url ? URLS : STD;
  let s = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    s += A[n >> 18] + A[(n >> 12) & 63] + A[(n >> 6) & 63] + A[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    s += A[n >> 18] + A[(n >> 12) & 63] + (o.pad === false ? "" : "==");
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    s += A[n >> 18] + A[(n >> 12) & 63] + A[(n >> 6) & 63] + (o.pad === false ? "" : "=");
  }
  if (o.wrap && o.wrap > 0) {
    const lines: string[] = [];
    for (let k = 0; k < s.length; k += o.wrap) lines.push(s.slice(k, k + o.wrap));
    s = lines.join("\n");
  }
  return s;
}

export type B64Decoded = {
  bytes: Uint8Array;
  urlSafe: boolean;
  mixed: boolean;
  padded: boolean;
  missingPad: number;
  whitespace: number;
  dataUrl?: { mime: string; params: string };
};

const DEC = (() => {
  const t = new Int16Array(128).fill(-1);
  for (let i = 0; i < 64; i++) t[STD.charCodeAt(i)] = i;
  t["-".charCodeAt(0)] = 62;
  t["_".charCodeAt(0)] = 63;
  return t;
})();

/**
 * Tolerant Base64 decoder: whitespace, URL-safe alphabet, missing padding and
 * a leading data: URL are all accepted. Anything else throws a ToolError that
 * names the character and its position.
 */
export function b64decode(src: string, what = "Base64"): B64Decoded {
  let start = 0;
  let dataUrl: B64Decoded["dataUrl"];
  const lead = src.match(/^\s*/)![0].length;
  const m = src.slice(lead).match(/^data:([^,;]*)((?:;[^,;]*)*),/i);
  if (m) {
    if (!/;base64/i.test(m[2])) throw new ToolError("This data: URL is not Base64-encoded (it has no ;base64 marker) — its payload is percent-encoded text. Try URL Decode instead.");
    dataUrl = { mime: m[1] || "text/plain", params: m[2] };
    start = lead + m[0].length;
  }
  const vals: number[] = [];
  let whitespace = 0, pads = 0, urlish = false, stdish = false;
  let padAt = -1;
  const bad: string[] = [];
  for (let i = start; i < src.length; i++) {
    const c = src.charCodeAt(i);
    if (c === 32 || c === 9 || c === 10 || c === 13 || c === 12) { whitespace++; continue; }
    if (c === 61) { // '='
      if (padAt < 0) padAt = i;
      pads++;
      continue;
    }
    const v = c < 128 ? DEC[c] : -1;
    if (v < 0) {
      if (bad.length < 3) bad.push(`${showChar(String.fromCodePoint(src.codePointAt(i)!))} at ${where(src, i)}`);
      continue;
    }
    if (padAt >= 0) throw new ToolError(`Padding "=" at ${where(src, padAt)} is followed by more data — "=" may only appear at the very end. Is this two ${what} strings glued together?`);
    if (c === 45 || c === 95) urlish = true;
    if (c === 43 || c === 47) stdish = true;
    vals.push(v);
  }
  if (bad.length) throw new ToolError(`Invalid ${what} character ${bad[0]}.${bad.length > 1 ? ` Also: ${bad.slice(1).join("; ")}.` : ""} Valid characters are A–Z a–z 0–9 + / (or - _ for URL-safe) and "=" padding.`);
  if (pads > 2) throw new ToolError(`Too much padding: ${pads} "=" characters (at most 2 are allowed).`);
  if (vals.length % 4 === 1) throw new ToolError(`Truncated ${what}: ${vals.length} characters leaves one dangling character — a group of 4 needs at least 2. Part of the string is probably missing.`);
  const expectedPad = (4 - (vals.length % 4)) % 4;
  if (pads && pads !== expectedPad) throw new ToolError(`Wrong padding: ${vals.length} data characters need ${expectedPad} "=" but ${pads} were found.`);
  const out = new Uint8Array(Math.floor((vals.length * 6) / 8));
  let o = 0, acc = 0, bits = 0;
  for (const v of vals) {
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >> bits) & 0xff;
    }
  }
  return { bytes: out, urlSafe: urlish, mixed: urlish && stdish, padded: pads > 0, missingPad: pads ? 0 : expectedPad, whitespace, dataUrl };
}

/* ── charsets ────────────────────────────────────────────────────────── */

export type Charset = "utf8" | "latin1" | "ascii" | "utf16le" | "utf16be" | "utf32be";

export function encodeText(s: string, cs: Charset): Uint8Array {
  if (cs === "utf8") return utf8Encode(s);
  if (cs === "latin1" || cs === "ascii") {
    const max = cs === "ascii" ? 0x7f : 0xff;
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c > max) {
        const ch = String.fromCodePoint(s.codePointAt(i)!);
        throw new ToolError(`${showChar(ch)} (U+${s.codePointAt(i)!.toString(16).toUpperCase().padStart(4, "0")}) at ${where(s, i)} is not representable in ${cs === "ascii" ? "ASCII" : "Latin-1"}. Use UTF-8 instead.`);
      }
      out[i] = c;
    }
    return out;
  }
  if (cs === "utf32be") {
    const cps = Array.from(s, (c) => c.codePointAt(0)!);
    const out = new Uint8Array(cps.length * 4);
    const dv = new DataView(out.buffer);
    cps.forEach((cp, i) => dv.setUint32(i * 4, cp));
    return out;
  }
  const out = new Uint8Array(s.length * 2);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (cs === "utf16le") { out[i * 2] = c & 0xff; out[i * 2 + 1] = c >> 8; }
    else { out[i * 2] = c >> 8; out[i * 2 + 1] = c & 0xff; }
  }
  return out;
}

/** Strict UTF-8 decode; null when the bytes are not valid UTF-8. */
export function utf8Strict(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** Offset of the first byte that breaks UTF-8, with a short reason. */
export function utf8Error(b: Uint8Array): { at: number; why: string } | null {
  for (let i = 0; i < b.length; ) {
    const x = b[i];
    let need = 0, min = 0;
    if (x < 0x80) { i++; continue; }
    else if (x >= 0xc2 && x <= 0xdf) { need = 1; min = 0x80; }
    else if (x >= 0xe0 && x <= 0xef) { need = 2; min = 0x800; }
    else if (x >= 0xf0 && x <= 0xf4) { need = 3; min = 0x10000; }
    else return { at: i, why: x >= 0x80 && x <= 0xbf ? `stray continuation byte 0x${hex2(x)}` : `byte 0x${hex2(x)} can never start a UTF-8 sequence` };
    let cp = x & (0x3f >> need);
    for (let k = 1; k <= need; k++) {
      const y = b[i + k];
      if (y === undefined) return { at: i, why: `sequence starting 0x${hex2(x)} is cut off at the end` };
      if ((y & 0xc0) !== 0x80) return { at: i + k, why: `expected a continuation byte after 0x${hex2(x)}, got 0x${hex2(y)}` };
      cp = (cp << 6) | (y & 0x3f);
    }
    if (cp < min) return { at: i, why: "overlong encoding" };
    if (cp >= 0xd800 && cp <= 0xdfff) return { at: i, why: "encodes a UTF-16 surrogate" };
    if (cp > 0x10ffff) return { at: i, why: "beyond U+10FFFF" };
    i += need + 1;
  }
  return null;
}

export function decodeBytes(b: Uint8Array, cs: Charset, fatal = true): string {
  if (cs === "latin1") {
    let s = "";
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
    return s;
  }
  if (cs === "ascii") {
    const i = b.findIndex((x) => x > 0x7f);
    if (i >= 0 && fatal) throw new ToolError(`Byte ${i + 1} is 0x${hex2(b[i])} (${b[i]}), outside 7-bit ASCII (0–127). Decode as UTF-8 or Latin-1 instead.`);
    return decodeBytes(b.map((x) => (x > 0x7f ? 0x3f : x)), "latin1");
  }
  if (cs === "utf32be") {
    if (b.length % 4) throw new ToolError(`UTF-32 needs a multiple of 4 bytes; got ${b.length}.`);
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    let s = "";
    for (let i = 0; i < b.length; i += 4) s += String.fromCodePoint(Math.min(dv.getUint32(i), 0x10ffff));
    return s;
  }
  if (cs === "utf16le" || cs === "utf16be") {
    if (b.length % 2 && fatal) throw new ToolError(`UTF-16 needs an even number of bytes; got ${b.length}. The last byte (0x${hex2(b[b.length - 1])}) has no partner.`);
    return new TextDecoder(cs === "utf16le" ? "utf-16le" : "utf-16be").decode(b);
  }
  if (fatal) {
    const e = utf8Error(b);
    if (e) throw new ToolError(`Not valid UTF-8 at byte ${e.at + 1} (offset 0x${e.at.toString(16)}): ${e.why}. Try Latin-1, or turn off strict decoding to substitute U+FFFD.`);
  }
  return new TextDecoder("utf-8").decode(b);
}

/* ── hex ─────────────────────────────────────────────────────────────── */

export const hex2 = (n: number) => n.toString(16).padStart(2, "0");

export type HexSep = "none" | "space" | "colon" | "0x" | "0xcomma" | "escape" | "c" | "percent";

export const HEX_SEP_CHOICES: [string, string][] = [
  ["space", "Space"],
  ["none", "None"],
  ["colon", "Colon (aa:bb)"],
  ["0x", "0x prefix"],
  ["0xcomma", "0x, comma-separated"],
  ["escape", "\\x escaped"],
  ["percent", "% (URL)"],
  ["c", "C array"],
];

export function hexFormat(bytes: Uint8Array, o: { upper?: boolean; sep?: string; perLine?: number; name?: string }): string {
  const sep = (o.sep ?? "space") as HexSep;
  const per = o.perLine && o.perLine > 0 ? o.perLine : 0;
  const h = (b: number) => (o.upper ? hex2(b).toUpperCase() : hex2(b));
  const tok = (b: number) =>
    sep === "0x" || sep === "0xcomma" || sep === "c" ? `0x${h(b)}` : sep === "escape" ? `\\x${h(b)}` : sep === "percent" ? `%${h(b)}` : h(b);
  const joiner = sep === "space" || sep === "0x" ? " " : sep === "colon" ? ":" : sep === "0xcomma" || sep === "c" ? ", " : "";
  const toks = Array.from(bytes, tok);
  if (sep === "c") {
    const per2 = per || 12;
    const lines: string[] = [];
    for (let i = 0; i < toks.length; i += per2) lines.push("  " + toks.slice(i, i + per2).join(", "));
    const name = o.name ?? "data";
    return `const unsigned char ${name}[${bytes.length}] = {\n${lines.join(",\n")}\n};`;
  }
  if (!per) return toks.join(joiner);
  const lines: string[] = [];
  for (let i = 0; i < toks.length; i += per) lines.push(toks.slice(i, i + per).join(joiner));
  return lines.join(joiner.trim() ? joiner.trimEnd() + "\n" : "\n");
}

/** `hexdump -C` style: offset | 16 hex bytes in two groups | ASCII. */
export function hexdump(bytes: Uint8Array, o: { upper?: boolean; width?: number; limit?: number } = {}): string {
  const w = o.width ?? 16;
  const limit = o.limit ?? 64 * 1024;
  const n = Math.min(bytes.length, limit);
  const lines: string[] = [];
  const h = (b: number) => (o.upper ? hex2(b).toUpperCase() : hex2(b));
  for (let off = 0; off < n; off += w) {
    const row = bytes.subarray(off, Math.min(off + w, n));
    let hx = "";
    for (let i = 0; i < w; i++) {
      hx += i < row.length ? h(row[i]) + " " : "   ";
      if (i === w / 2 - 1) hx += " ";
    }
    const asc = Array.from(row, (b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : ".")).join("");
    lines.push(`${off.toString(16).padStart(8, "0")}  ${hx} |${asc}|`);
  }
  lines.push(n.toString(16).padStart(8, "0") + (bytes.length > n ? `  … ${bytes.length - n} more bytes not shown` : ""));
  return lines.join("\n");
}

/**
 * Parse hex written almost any way: continuous, spaced, 0x / \x / % / U+
 * prefixed, colon or comma separated, C arrays, and xxd / hexdump -C dumps
 * (offsets and the ASCII column are dropped).
 */
export function parseHex(src: string): { bytes: Uint8Array; format: string } {
  const lines = src.split(/\r?\n/);
  const nonEmpty = lines.filter((l) => l.trim());
  let format = "plain";
  const isXxd = nonEmpty.length > 0 && nonEmpty.every((l) => /^\s*[0-9a-fA-F]{4,16}:\s/.test(l));
  const isCanon = !isXxd && nonEmpty.length > 0 && nonEmpty.every((l) => /^\s*[0-9a-fA-F]{6,16}(\s{1,2}([0-9a-fA-F]{2}\s{1,2}){0,16}\s*\|.*\|?)?\s*$/.test(l)) && nonEmpty.some((l) => l.includes("|"));
  const bytes: number[] = [];
  let pos = 0;
  for (const line of lines) {
    let body = line;
    let base = pos;
    if (isXxd) {
      const m = line.match(/^(\s*[0-9a-fA-F]{4,16}:\s)/);
      if (m) { body = line.slice(m[1].length).split(/\s{2,}/)[0]; base = pos + m[1].length; format = "xxd dump"; }
    } else if (isCanon) {
      const m = line.match(/^(\s*[0-9a-fA-F]{6,16})/);
      if (m) { body = m[1].length === line.trimEnd().length ? "" : line.slice(m[1].length).split("|")[0]; base = pos + m[1].length; format = "hexdump -C dump"; }
    }
    scanHexLine(body, base, bytes, src);
    pos += line.length + 1;
  }
  if (format === "plain") {
    if (/0x/i.test(src)) format = /[{}]/.test(src) ? "C array" : "0x-prefixed";
    else if (/\\x/i.test(src)) format = "\\x escaped";
    else if (/%[0-9a-f]{2}/i.test(src)) format = "percent-encoded";
    else if (/[0-9a-f]:[0-9a-f]/i.test(src)) format = "colon-separated";
    else if (/[0-9a-f]\s+[0-9a-f]/i.test(src)) format = "space-separated";
    else format = "continuous";
  }
  return { bytes: Uint8Array.from(bytes), format };
}

const C_WORDS = /^(unsigned|signed|const|char|uint8_t|u8|byte|static|int|var|let|new|Uint8Array|bytes|b|=)$/i;

function scanHexLine(body: string, base: number, out: number[], src: string) {
  const code = /0x|\\x|[{}]/i.test(src);
  const re = /[^\s,:;{}()[\]]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const t = m[0];
    const at = base + m.index;
    if (C_WORDS.test(t) || /^[A-Za-z_]\w*\[\d*\]=?$/.test(t) || /^[A-Za-z_]\w*=$/.test(t)) continue;
    // In source-code style input, bare identifiers (variable names, types) are not data.
    if (code && /^[A-Za-z_]\w*$/.test(t) && /[g-zG-Z_]/.test(t)) continue;
    // A token can hold several prefixed bytes: \x41\x42, %41%42, 0x41.
    const parts = t.split(/(?=\\x|%[0-9a-fA-F]|0x|0X)/);
    let off = 0;
    for (const raw of parts) {
      let p = raw;
      let pAt = at + off;
      off += raw.length;
      const pre = p.match(/^(0x|\\x|%|U\+|#|\$)/i);
      if (pre) { p = p.slice(pre[1].length); pAt += pre[1].length; }
      if (/^[0-9a-fA-F]+h$/i.test(p) && p.length > 2) p = p.slice(0, -1);
      if (!p) continue;
      for (let i = 0; i < p.length; i++)
        if (!/[0-9a-fA-F]/.test(p[i])) throw new ToolError(`${showChar(p[i])} at ${where(src, pAt + i)} is not a hex digit (0–9, a–f).`);
      if (p.length % 2) {
        if (pre) p = "0" + p;
        else
          throw new ToolError(
            `Odd number of hex digits in "${p.length > 24 ? p.slice(0, 20) + "…" : p}" at ${where(src, pAt)} (${p.length} digits) — every byte needs two. Add a leading 0 or find the missing digit.`
          );
      }
      for (let i = 0; i < p.length; i += 2) out.push(parseInt(p.slice(i, i + 2), 16));
    }
  }
}

/* ── magic bytes ─────────────────────────────────────────────────────── */

export type Magic = { mime: string; ext: string; label: string; image?: boolean };

export function sniff(b: Uint8Array): Magic | null {
  const at = (i: number, ...xs: number[]) => xs.every((x, k) => b[i + k] === x);
  const ascii = (i: number, s: string) => at(i, ...Array.from(s, (c) => c.charCodeAt(0)));
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { mime: "image/png", ext: "png", label: "PNG image", image: true };
  if (at(0, 0xff, 0xd8, 0xff)) return { mime: "image/jpeg", ext: "jpg", label: "JPEG image", image: true };
  if (ascii(0, "GIF87a") || ascii(0, "GIF89a")) return { mime: "image/gif", ext: "gif", label: "GIF image", image: true };
  if (ascii(0, "RIFF") && ascii(8, "WEBP")) return { mime: "image/webp", ext: "webp", label: "WebP image", image: true };
  if (ascii(0, "BM") && b.length > 26) return { mime: "image/bmp", ext: "bmp", label: "BMP image", image: true };
  if (at(0, 0, 0, 1, 0)) return { mime: "image/x-icon", ext: "ico", label: "ICO icon", image: true };
  if (ascii(4, "ftypavif")) return { mime: "image/avif", ext: "avif", label: "AVIF image", image: true };
  if (ascii(0, "%PDF-")) return { mime: "application/pdf", ext: "pdf", label: "PDF document" };
  if (at(0, 0x50, 0x4b, 0x03, 0x04) || at(0, 0x50, 0x4b, 0x05, 0x06)) return { mime: "application/zip", ext: "zip", label: "ZIP archive" };
  if (at(0, 0x1f, 0x8b)) return { mime: "application/gzip", ext: "gz", label: "GZIP data" };
  if (at(0, 0x28, 0xb5, 0x2f, 0xfd)) return { mime: "application/zstd", ext: "zst", label: "Zstandard data" };
  if (ascii(0, "7z") && at(2, 0xbc, 0xaf, 0x27, 0x1c)) return { mime: "application/x-7z-compressed", ext: "7z", label: "7-Zip archive" };
  if (ascii(0, "wOF2")) return { mime: "font/woff2", ext: "woff2", label: "WOFF2 font" };
  if (ascii(0, "wOFF")) return { mime: "font/woff", ext: "woff", label: "WOFF font" };
  if (at(0, 0x00, 0x61, 0x73, 0x6d)) return { mime: "application/wasm", ext: "wasm", label: "WebAssembly module" };
  if (ascii(0, "SQLite format 3")) return { mime: "application/vnd.sqlite3", ext: "sqlite", label: "SQLite database" };
  if (ascii(0, "ID3") || at(0, 0xff, 0xfb)) return { mime: "audio/mpeg", ext: "mp3", label: "MP3 audio" };
  if (ascii(0, "OggS")) return { mime: "audio/ogg", ext: "ogg", label: "Ogg media" };
  if (ascii(4, "ftyp")) return { mime: "video/mp4", ext: "mp4", label: "MP4 / QuickTime media" };
  if (at(0, 0x7f, 0x45, 0x4c, 0x46)) return { mime: "application/x-elf", ext: "elf", label: "ELF executable" };
  // Text-ish: sniff the start.
  const head = new TextDecoder().decode(b.subarray(0, 256)).replace(/^\uFEFF/, "").trimStart();
  if (/^<svg[\s>]/i.test(head) || (/^<\?xml/i.test(head) && /<svg[\s>]/i.test(new TextDecoder().decode(b.subarray(0, 2048))))) return { mime: "image/svg+xml", ext: "svg", label: "SVG image", image: true };
  if (/^<\?xml/i.test(head)) return { mime: "application/xml", ext: "xml", label: "XML document" };
  if (/^<!doctype html|^<html/i.test(head)) return { mime: "text/html", ext: "html", label: "HTML document" };
  if (/^[{[]/.test(head)) {
    try {
      JSON.parse(new TextDecoder().decode(b));
      return { mime: "application/json", ext: "json", label: "JSON" };
    } catch { /* not JSON */ }
  }
  return null;
}

/** Image dimensions read from the header bytes (PNG, GIF, JPEG, WebP, BMP, ICO, SVG). */
export function imageSize(b: Uint8Array, mime: string): { w: number; h: number; extra?: string } | null {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  try {
    if (mime === "image/png" && b.length >= 29) {
      const depth = b[24], ct = b[25];
      const kind = ({ 0: "greyscale", 2: "RGB", 3: "palette", 4: "grey + alpha", 6: "RGBA" } as Record<number, string>)[ct] ?? `colour type ${ct}`;
      return { w: dv.getUint32(16), h: dv.getUint32(20), extra: `${depth}-bit ${kind}${b[28] ? ", interlaced" : ""}` };
    }
    if (mime === "image/gif" && b.length >= 10) return { w: dv.getUint16(6, true), h: dv.getUint16(8, true), extra: `${2 ** ((b[10] & 7) + 1)}-colour palette` };
    if (mime === "image/bmp") return { w: dv.getInt32(18, true), h: Math.abs(dv.getInt32(22, true)), extra: `${dv.getUint16(28, true)} bpp` };
    if (mime === "image/x-icon") return { w: b[6] || 256, h: b[7] || 256, extra: `${dv.getUint16(4, true)} image(s)` };
    if (mime === "image/webp") {
      const tag = String.fromCharCode(b[12], b[13], b[14], b[15]);
      if (tag === "VP8 ") return { w: dv.getUint16(26, true) & 0x3fff, h: dv.getUint16(28, true) & 0x3fff, extra: "lossy" };
      if (tag === "VP8L") {
        const bits = dv.getUint32(21, true);
        return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1, extra: "lossless" };
      }
      if (tag === "VP8X") return { w: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), h: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)), extra: "extended" };
    }
    if (mime === "image/jpeg") {
      let i = 2;
      while (i + 9 < b.length) {
        if (b[i] !== 0xff) { i++; continue; }
        const marker = b[i + 1];
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
        const len = dv.getUint16(i + 2);
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { w: dv.getUint16(i + 7), h: dv.getUint16(i + 5), extra: `${b[i + 9]} component(s), ${marker === 0xc2 ? "progressive" : "baseline"}` };
        }
        i += 2 + len;
      }
    }
    if (mime === "image/svg+xml") {
      const s = new TextDecoder().decode(b.subarray(0, 4096));
      const tag = s.match(/<svg\b[^>]*>/i)?.[0] ?? "";
      const attr = (n: string) => tag.match(new RegExp(`\\s${n}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1];
      const w = parseFloat(attr("width") ?? ""), h = parseFloat(attr("height") ?? "");
      const vb = attr("viewBox")?.trim().split(/[\s,]+/).map(Number);
      if (w && h) return { w, h, extra: vb ? `viewBox ${vb.join(" ")}` : "vector" };
      if (vb && vb.length === 4) return { w: vb[2], h: vb[3], extra: "from viewBox (vector)" };
    }
  } catch {
    /* truncated header */
  }
  return null;
}

/** A blob: URL in the browser, a data: URL elsewhere (tests). */
export function objectUrl(bytes: Uint8Array, mime: string): string {
  if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function" && typeof window !== "undefined" && !/jsdom/i.test(navigator.userAgent)) {
    return URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
  }
  return `data:${mime};base64,${b64encode(bytes)}`;
}

export const blobOf = (bytes: Uint8Array, mime: string) => new Blob([bytes as BlobPart], { type: mime });
