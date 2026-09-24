/**
 * Maps JSON Pointers (/a/0/b) to source positions so validators can report
 * the line of a failing value. Tolerates comments and trailing commas; on
 * anything it cannot scan it simply returns what it found so far.
 */
import { lineCol } from "./jsonparse";

export type Loc = { line: number; col: number; keyLine?: number; keyCol?: number };

export function locatePointers(src: string): Map<string, Loc> {
  const map = new Map<string, Loc>();
  let i = 0;
  const n = src.length;
  const ws = () => {
    for (;;) {
      const c = src[i];
      if (c === " " || c === "\t" || c === "\n" || c === "\r" || c === "﻿") { i++; continue; }
      if (c === "/" && src[i + 1] === "/") { while (i < n && src[i] !== "\n") i++; continue; }
      if (c === "/" && src[i + 1] === "*") { const e = src.indexOf("*/", i + 2); i = e < 0 ? n : e + 2; continue; }
      if (c === "#") { while (i < n && src[i] !== "\n") i++; continue; }
      break;
    }
  };
  const str = (): string => {
    const q = src[i++];
    let out = "";
    while (i < n && src[i] !== q) {
      if (src[i] === "\\") {
        const e = src[i + 1];
        if (e === "u") { out += String.fromCharCode(parseInt(src.slice(i + 2, i + 6), 16)); i += 6; continue; }
        out += ({ n: "\n", t: "\t", r: "\r", b: "\b", f: "\f" } as Record<string, string>)[e] ?? e;
        i += 2;
        continue;
      }
      out += src[i++];
    }
    i++;
    return out;
  };
  const esc = (k: string) => k.replace(/~/g, "~0").replace(/\//g, "~1");
  const value = (ptr: string, keyPos?: number) => {
    ws();
    const at = lineCol(src, i);
    const loc: Loc = { ...at };
    if (keyPos !== undefined) {
      const k = lineCol(src, keyPos);
      loc.keyLine = k.line;
      loc.keyCol = k.col;
    }
    map.set(ptr, loc);
    const c = src[i];
    if (c === "{") {
      i++;
      for (;;) {
        ws();
        if (src[i] === "}") { i++; return; }
        if (i >= n) throw 0;
        const kp = i;
        let key: string;
        if (src[i] === '"' || src[i] === "'") key = str();
        else { const m = /^[A-Za-z_$][\w$-]*/.exec(src.slice(i, i + 200)); if (!m) throw 0; key = m[0]; i += key.length; }
        ws();
        if (src[i] !== ":") throw 0;
        i++;
        value(`${ptr}/${esc(key)}`, kp);
        ws();
        if (src[i] === ",") i++;
      }
    }
    if (c === "[") {
      i++;
      let idx = 0;
      for (;;) {
        ws();
        if (src[i] === "]") { i++; return; }
        if (i >= n) throw 0;
        value(`${ptr}/${idx++}`);
        ws();
        if (src[i] === ",") i++;
      }
    }
    if (c === '"' || c === "'") { str(); return; }
    const m = /^[^,\]}\s]+/.exec(src.slice(i, i + 400));
    if (!m) throw 0;
    i += m[0].length;
  };
  try {
    value("");
  } catch {
    /* partial map */
  }
  return map;
}
