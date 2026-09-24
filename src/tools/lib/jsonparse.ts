/**
 * A JSON parser that reports exact line and column, flags duplicate keys, and
 * — in tolerant mode — accepts the JSON5-ish things people paste: comments,
 * trailing commas, single quotes, unquoted keys, NaN/Infinity, hex numbers.
 */
import { ToolError } from "../types";

export type ParseIssue = { message: string; line: number; col: number; pos: number };

export class JsonSyntaxError extends ToolError {
  constructor(public issue: ParseIssue, src: string) {
    super(`${issue.message} at line ${issue.line}, column ${issue.col}\n${caret(src, issue)}`);
  }
}

export function lineCol(src: string, pos: number) {
  let line = 1, col = 1;
  for (let i = 0; i < pos && i < src.length; i++) {
    if (src.charCodeAt(i) === 10) { line++; col = 1; } else col++;
  }
  return { line, col };
}

export function caret(src: string, issue: { line: number; col: number }) {
  const text = src.split("\n")[issue.line - 1] ?? "";
  const start = Math.max(0, issue.col - 40);
  const shown = text.slice(start, start + 80).replace(/\t/g, " ");
  return `  ${shown}\n  ${" ".repeat(Math.max(0, issue.col - 1 - start))}^`;
}

type Opts = { tolerant?: boolean; onDuplicate?: (key: string, pos: number) => void };

export function parseJson(src: string, opts: Opts = {}): unknown {
  const tol = !!opts.tolerant;
  let i = 0;
  const n = src.length;

  const fail = (message: string, at = i): never => {
    const { line, col } = lineCol(src, at);
    throw new JsonSyntaxError({ message, line, col, pos: at }, src);
  };

  function ws() {
    for (;;) {
      const c = src[i];
      if (c === " " || c === "\t" || c === "\n" || c === "\r" || c === "﻿") { i++; continue; }
      if (c === "/" && (src[i + 1] === "/" || src[i + 1] === "*")) {
        if (!tol) fail("Comments are not allowed in JSON (turn on Tolerant)");
        if (src[i + 1] === "/") { while (i < n && src[i] !== "\n") i++; }
        else {
          const end = src.indexOf("*/", i + 2);
          if (end < 0) fail("Unterminated block comment");
          i = end + 2;
        }
        continue;
      }
      if (tol && c === "#") { while (i < n && src[i] !== "\n") i++; continue; }
      break;
    }
  }

  function str(): string {
    const q = src[i];
    if (q === "'" && !tol) fail("Strings must use double quotes");
    const start = i++;
    let out = "";
    for (;;) {
      if (i >= n) fail("Unterminated string", start);
      const c = src[i++];
      if (c === q) return out;
      if (c === "\n") fail("Unescaped line break inside a string", i - 1);
      if (c === "\\") {
        const e = src[i++];
        switch (e) {
          case '"': out += '"'; break;
          case "'": out += "'"; break;
          case "\\": out += "\\"; break;
          case "/": out += "/"; break;
          case "b": out += "\b"; break;
          case "f": out += "\f"; break;
          case "n": out += "\n"; break;
          case "r": out += "\r"; break;
          case "t": out += "\t"; break;
          case "u": {
            const h = src.slice(i, i + 4);
            if (!/^[0-9a-fA-F]{4}$/.test(h)) fail("Invalid \\u escape", i - 2);
            out += String.fromCharCode(parseInt(h, 16));
            i += 4;
            break;
          }
          case "\n": if (tol) break; // line continuation
          // falls through
          default: fail(`Invalid escape \\${e ?? ""}`, i - 2);
        }
      } else if (c.charCodeAt(0) < 0x20 && c !== "\t") fail("Control character inside a string", i - 1);
      else out += c;
    }
  }

  function numberTok(): number {
    const start = i;
    const m = /^[+-]?(?:0[xX][0-9a-fA-F]+|Infinity|NaN|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/.exec(src.slice(i, i + 400));
    if (!m) fail("Unexpected character", start);
    const t = m![0];
    if (!tol) {
      if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(t)) fail(`Invalid number ${t}`, start);
    }
    i += t.length;
    if (/^[+-]?0[xX]/.test(t)) return (t.startsWith("-") ? -1 : 1) * parseInt(t.replace(/^[+-]/, ""), 16);
    return Number(t);
  }

  function value(depth: number): unknown {
    if (depth > 5000) fail("Nesting too deep");
    ws();
    const c = src[i];
    if (c === "{") return obj(depth);
    if (c === "[") return arr(depth);
    if (c === '"' || c === "'") return str();
    if (c === "t" && src.startsWith("true", i)) { i += 4; return true; }
    if (c === "f" && src.startsWith("false", i)) { i += 5; return false; }
    if (c === "n" && src.startsWith("null", i)) { i += 4; return null; }
    if (c === undefined) fail("Unexpected end of input");
    if (/[-+\d.IN]/.test(c)) return numberTok();
    if (tol && c === "u" && src.startsWith("undefined", i)) { i += 9; return null; }
    return fail(`Unexpected ${JSON.stringify(c)}`);
  }

  function key(): string {
    ws();
    const c = src[i];
    if (c === '"' || c === "'") return str();
    if (tol) {
      const m = /^[A-Za-z_$][\w$-]*/.exec(src.slice(i, i + 200));
      if (m) { i += m[0].length; return m[0]; }
    }
    if (c === "}") fail("Trailing comma before }", i);
    return fail(c === undefined ? "Unexpected end of input — expected a key" : `Expected a double-quoted key, found ${JSON.stringify(c)}`);
  }

  function obj(depth: number) {
    const out: Record<string, unknown> = {};
    const seen = new Set<string>();
    i++;
    ws();
    if (src[i] === "}") { i++; return out; }
    for (;;) {
      const kpos = i;
      const k = key();
      if (seen.has(k)) opts.onDuplicate?.(k, kpos);
      seen.add(k);
      ws();
      if (src[i] !== ":") fail(`Expected ':' after key ${JSON.stringify(k)}`);
      i++;
      const v = value(depth + 1);
      if (k === "__proto__") Object.defineProperty(out, k, { value: v, enumerable: true, writable: true, configurable: true });
      else out[k] = v;
      ws();
      if (src[i] === ",") {
        i++;
        ws();
        if (src[i] === "}") {
          if (!tol) fail("Trailing comma before }", i - 1);
          i++;
          return out;
        }
        continue;
      }
      if (src[i] === "}") { i++; return out; }
      fail(src[i] === undefined ? "Unexpected end of input — missing }" : `Expected ',' or '}' after a value, found ${JSON.stringify(src[i])}`);
    }
  }

  function arr(depth: number) {
    const out: unknown[] = [];
    i++;
    ws();
    if (src[i] === "]") { i++; return out; }
    for (;;) {
      out.push(value(depth + 1));
      ws();
      if (src[i] === ",") {
        i++;
        ws();
        if (src[i] === "]") {
          if (!tol) fail("Trailing comma before ]", i - 1);
          i++;
          return out;
        }
        continue;
      }
      if (src[i] === "]") { i++; return out; }
      fail(src[i] === undefined ? "Unexpected end of input — missing ]" : `Expected ',' or ']' after a value, found ${JSON.stringify(src[i])}`);
    }
  }

  ws();
  if (i >= n) fail("Empty input — paste some JSON");
  const v = value(0);
  ws();
  if (i < n) fail(`Unexpected ${JSON.stringify(src[i])} after the end of the document`);
  return v;
}

/** Fast path through JSON.parse; falls back to parseJson for a precise error or tolerant parsing. */
export function readJson(src: string, tolerant = false): unknown {
  if (!tolerant) {
    try {
      return JSON.parse(src);
    } catch {
      /* re-parse for the exact position */
    }
  }
  return parseJson(src, { tolerant });
}

export function sortKeysDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeysDeep);
  if (v && typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(v as object).sort()) o[k] = sortKeysDeep((v as Record<string, unknown>)[k]);
    return o;
  }
  return v;
}

export function stringify(v: unknown, indent: string | number) {
  return JSON.stringify(v, null, indent === "tab" ? "\t" : indent === 0 || indent === "0" ? undefined : Number(indent));
}

export function jsonStats(v: unknown) {
  let objects = 0, arrays = 0, strings = 0, numbers = 0, bools = 0, nulls = 0, keys = 0, maxDepth = 0;
  const walk = (x: unknown, d: number) => {
    maxDepth = Math.max(maxDepth, d);
    if (Array.isArray(x)) { arrays++; x.forEach((y) => walk(y, d + 1)); }
    else if (x && typeof x === "object") { objects++; const e = Object.entries(x); keys += e.length; e.forEach(([, y]) => walk(y, d + 1)); }
    else if (typeof x === "string") strings++;
    else if (typeof x === "number") numbers++;
    else if (typeof x === "boolean") bools++;
    else nulls++;
  };
  walk(v, 0);
  return { objects, arrays, strings, numbers, bools, nulls, keys, maxDepth };
}

export const utf8Len = (s: string) => new TextEncoder().encode(s).length;
