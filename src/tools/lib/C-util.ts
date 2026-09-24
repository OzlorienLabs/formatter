/** Small helpers shared by group C tools (XML, formatters, text). */

/** 1-based line/column of an offset. */
export function lineColAt(src: string, pos: number): { line: number; col: number } {
  let line = 1, last = -1;
  const end = Math.min(pos, src.length);
  for (let i = 0; i < end; i++) if (src.charCodeAt(i) === 10) { line++; last = i; }
  return { line, col: end - last };
}

/** A Babel-style code frame: two lines of context and a caret under the column. */
export function codeFrame(src: string, line: number, col: number, context = 2): string {
  const lines = src.split("\n");
  const from = Math.max(1, line - context), to = Math.min(lines.length, line + context);
  const w = String(to).length;
  const out: string[] = [];
  for (let l = from; l <= to; l++) {
    const text = (lines[l - 1] ?? "").replace(/\t/g, "  ");
    out.push(`${l === line ? ">" : " "} ${String(l).padStart(w)} | ${text.length > 160 ? text.slice(0, 157) + "…" : text}`);
    if (l === line) {
      const before = (lines[l - 1] ?? "").slice(0, Math.max(0, col - 1)).replace(/\t/g, "  ");
      out.push(`  ${" ".repeat(w)} | ${" ".repeat(Math.min(before.length, 158))}^`);
    }
  }
  return out.join("\n");
}

export const utf8Bytes = (s: string) => new TextEncoder().encode(s).length;

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function savings(before: number, after: number): string {
  if (!before) return "0%";
  const p = Math.round((1 - after / before) * 1000) / 10;
  return `${p > 0 ? "−" : p < 0 ? "+" : ""}${Math.abs(p)}%`;
}

export const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** FNV-1a 32-bit, hex. Deterministic, fast, good enough for pseudonyms. */
export function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function commonPrefix(xs: string[]): string {
  if (!xs.length) return "";
  let p = xs[0];
  for (const x of xs) {
    let i = 0;
    while (i < p.length && i < x.length && p[i] === x[i]) i++;
    p = p.slice(0, i);
    if (!p) break;
  }
  return p;
}

/** Pad cells into aligned columns. */
export function alignColumns(rows: string[][], sep = "  "): string[] {
  const w: number[] = [];
  rows.forEach((r) => r.forEach((c, i) => (w[i] = Math.max(w[i] ?? 0, c.length))));
  return rows.map((r) => r.map((c, i) => (i === r.length - 1 ? c : c.padEnd(w[i]))).join(sep).trimEnd());
}
