/**
 * Box drawing, text measurement and table rendering shared by the ASCII tools.
 * Pure functions — no DOM — so they run in unit tests and pipelines.
 */

/* ── display width ───────────────────────────────────────────────────── */

/** Terminal display width of one code point: 0 for combining marks, 2 for East Asian wide / emoji. */
export function cpWidth(cp: number): number {
  if (cp === 0 || cp === 0x200b || cp === 0x200c || cp === 0x200d || cp === 0xfe0f || cp === 0xfe0e) return 0;
  if ((cp >= 0x0300 && cp <= 0x036f) || (cp >= 0x1ab0 && cp <= 0x1aff) || (cp >= 0x1dc0 && cp <= 0x1dff) || (cp >= 0x20d0 && cp <= 0x20ff) || (cp >= 0xfe20 && cp <= 0xfe2f)) return 0;
  if (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0x303e) ||
    (cp >= 0x3041 && cp <= 0x33ff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0xa000 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1f64f) ||
    (cp >= 0x1f900 && cp <= 0x1f9ff) ||
    (cp >= 0x1f680 && cp <= 0x1f6ff) ||
    (cp >= 0x1fa70 && cp <= 0x1faff) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  )
    return 2;
  return 1;
}

export function strWidth(s: string): number {
  let w = 0;
  for (const ch of s) w += cpWidth(ch.codePointAt(0)!);
  return w;
}

export const padEndW = (s: string, w: number, fill = " ") => s + fill.repeat(Math.max(0, w - strWidth(s)));

export function alignW(s: string, w: number, align: Align, fill = " "): string {
  const gap = Math.max(0, w - strWidth(s));
  if (align === "right") return fill.repeat(gap) + s;
  if (align === "center") {
    const l = Math.floor(gap / 2);
    return fill.repeat(l) + s + fill.repeat(gap - l);
  }
  return s + fill.repeat(gap);
}

export type Align = "left" | "center" | "right";

/** Cut a string to at most `w` display columns. */
export function sliceW(s: string, w: number): string {
  let out = "";
  let used = 0;
  for (const ch of s) {
    const cw = cpWidth(ch.codePointAt(0)!);
    if (used + cw > w) break;
    out += ch;
    used += cw;
  }
  return out;
}

/** Greedy word wrap by display width; words longer than the width are hard-split. */
export function wrapText(text: string, width: number): string[] {
  if (width <= 0) return text.split("\n");
  const out: string[] = [];
  for (const para of text.split("\n")) {
    if (!para.trim()) {
      out.push("");
      continue;
    }
    const lead = para.match(/^\s*/)![0];
    let line = lead;
    let lineW = strWidth(lead);
    for (const word0 of para.trim().split(/\s+/)) {
      let word = word0;
      while (strWidth(word) > width) {
        if (lineW > strWidth(lead)) {
          out.push(line.trimEnd());
          line = "";
          lineW = 0;
        }
        const head = sliceW(word, width);
        out.push(head);
        word = word.slice(head.length);
      }
      const ww = strWidth(word);
      if (!word) continue;
      if (lineW === 0 || (line === lead && lineW === strWidth(lead))) {
        line += word;
        lineW += ww;
      } else if (lineW + 1 + ww <= width) {
        line += " " + word;
        lineW += 1 + ww;
      } else {
        out.push(line.trimEnd());
        line = word;
        lineW = ww;
      }
    }
    out.push(line.trimEnd());
  }
  return out;
}

/* ── border styles ───────────────────────────────────────────────────── */

export type Border = {
  tl: string; t: string; tr: string;
  l: string; r: string;
  bl: string; b: string; br: string;
  /** Table junctions: left tee, right tee, top tee, bottom tee, cross, inner vertical, inner horizontal. */
  ml: string; mr: string; tm: string; bm: string; x: string; v: string; h: string;
  /** Header separator (defaults to the row separator). */
  hl?: string; hh?: string; hx?: string; hr?: string;
  shadow?: string;
};

const mk = (s: string, extra: Partial<Border> = {}): Border => {
  const [tl, t, tr, l, r, bl, b, br, ml, mr, tm, bm, x, v, h] = [...s];
  return { tl, t, tr, l, r, bl, b, br, ml, mr, tm, bm, x, v, h, ...extra };
};

export const BORDERS: Record<string, Border> = {
  single: mk("┌─┐││└─┘├┤┬┴┼│─", { hl: "╞", hh: "═", hx: "╪", hr: "╡" }),
  double: mk("╔═╗║║╚═╝╠╣╦╩╬║═"),
  rounded: mk("╭─╮││╰─╯├┤┬┴┼│─", { hl: "╞", hh: "═", hx: "╪", hr: "╡" }),
  heavy: mk("┏━┓┃┃┗━┛┣┫┳┻╋┃━"),
  dashed: mk("┌╌┐╎╎└╌┘├┤┬┴┼╎╌"),
  ascii: mk("+-+||+-++++++|-", { hl: "+", hh: "=", hx: "+", hr: "+" }),
  stars: mk("***************"),
  hash: mk("###############"),
  block: mk("█▀████▄███████▀"),
  shadow: mk("┌─┐││└─┘├┤┬┴┼│─", { shadow: "▒", hl: "╞", hh: "═", hx: "╪", hr: "╡" }),
};

export const BORDER_CHOICES: [string, string][] = [
  ["single", "Single ┌─┐"],
  ["double", "Double ╔═╗"],
  ["rounded", "Rounded ╭─╮"],
  ["heavy", "Heavy ┏━┓"],
  ["dashed", "Dashed ┌╌┐"],
  ["ascii", "ASCII +-+"],
  ["stars", "Stars ***"],
  ["hash", "Hash ###"],
  ["block", "Block █▀█"],
  ["shadow", "Shadow ┌─┐▒"],
];

/** Add a drop shadow one column right and one row down. */
export function addShadow(lines: string[], ch: string): string[] {
  const w = Math.max(...lines.map(strWidth));
  const out = lines.map((ln, i) => padEndW(ln, w) + (i === 0 ? " " : ch));
  out.push(" " + ch.repeat(w));
  return out;
}

/* ── box ─────────────────────────────────────────────────────────────── */

export type BoxOpts = {
  style: string;
  align: Align;
  padX: number;
  padY: number;
  margin: number;
  /** Inner content width; 0 = fit the text. */
  width: number;
  title?: string;
  titleAlign?: Align;
};

export function drawBox(text: string, o: BoxOpts): string[] {
  const b = BORDERS[o.style] ?? BORDERS.single;
  let lines = o.width > 0 ? wrapText(text.replace(/\t/g, "    "), Math.max(1, o.width)) : text.replace(/\t/g, "    ").split("\n");
  // Trim leading/trailing blank lines but keep inner ones.
  while (lines.length > 1 && !lines[0].trim()) lines.shift();
  while (lines.length > 1 && !lines[lines.length - 1].trim()) lines.pop();
  lines = lines.map((l) => l.trimEnd());
  const title = (o.title ?? "").trim();
  const titleW = title ? strWidth(title) + 2 : 0;
  const contentW = Math.max(o.width > 0 ? o.width : 0, ...lines.map(strWidth), titleW - 2 * o.padX, 0);
  const inner = contentW + 2 * o.padX;
  let top = b.t.repeat(inner);
  if (title) {
    const t = ` ${title} `;
    const gap = inner - strWidth(t);
    const ta = o.titleAlign ?? "left";
    const left = ta === "center" ? Math.floor(gap / 2) : ta === "right" ? Math.max(0, gap - 1) : Math.min(1, gap);
    top = b.t.repeat(left) + t + b.t.repeat(Math.max(0, gap - left));
  }
  const out: string[] = [b.tl + top + b.tr];
  const blank = b.l + " ".repeat(inner) + b.r;
  for (let i = 0; i < o.padY; i++) out.push(blank);
  for (const ln of lines) out.push(b.l + " ".repeat(o.padX) + alignW(ln, contentW, o.align) + " ".repeat(o.padX) + b.r);
  for (let i = 0; i < o.padY; i++) out.push(blank);
  out.push(b.bl + b.b.repeat(inner) + b.br);
  let res = b.shadow ? addShadow(out, b.shadow) : out;
  if (o.margin > 0) {
    const pad = " ".repeat(o.margin);
    const empty = Array.from({ length: Math.ceil(o.margin / 2) }, () => "");
    res = [...empty, ...res.map((l) => pad + l), ...empty];
  }
  return res;
}

/* ── tables ──────────────────────────────────────────────────────────── */

export type ParsedTable = { rows: string[][]; aligns: (Align | null)[]; format: string; header: boolean };

function splitDelimited(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"' && !cur.trim()) {
      q = true;
      cur = "";
    } else if (c === delim) {
      out.push(cur.trim());
      cur = "";
    } else cur += c;
  }
  out.push(cur.trim());
  return out;
}

const isMdRule = (cells: string[]) => cells.length > 0 && cells.every((c) => /^:?-{1,}:?$/.test(c.trim()));

/** Parse CSV, TSV, semicolon, or Markdown/pipe tables (auto-detected unless `format` is given). */
export function parseTable(src: string, format = "auto"): ParsedTable {
  const lines = src.replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim());
  if (!lines.length) return { rows: [], aligns: [], format: "empty", header: false };
  let fmt = format;
  if (fmt === "auto") {
    const first = lines[0];
    if (/^\s*\|/.test(first) || (lines[1] && isMdRule(lines[1].replace(/^\s*\||\|\s*$/g, "").split("|")))) fmt = "markdown";
    else if (first.includes("\t")) fmt = "tsv";
    else if ((first.match(/;/g) ?? []).length > (first.match(/,/g) ?? []).length) fmt = "ssv";
    else fmt = "csv";
  }
  if (fmt === "markdown") {
    const rows: string[][] = [];
    let aligns: (Align | null)[] = [];
    let header = false;
    for (const l of lines) {
      const cells = l.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
      if (isMdRule(cells)) {
        header = rows.length === 1;
        aligns = cells.map((c) => {
          const s = c.trim();
          return s.startsWith(":") && s.endsWith(":") ? "center" : s.endsWith(":") ? "right" : s.startsWith(":") ? "left" : null;
        });
        continue;
      }
      rows.push(cells);
    }
    return { rows, aligns, format: "markdown", header };
  }
  const delim = fmt === "tsv" ? "\t" : fmt === "ssv" ? ";" : ",";
  return { rows: lines.map((l) => splitDelimited(l, delim)), aligns: [], format: fmt, header: true };
}

const NUMERIC = /^[-+(]?[$€£¥]?\s?\d[\d,_ ]*(\.\d+)?%?\)?$|^[-+]?\d*\.\d+(e[-+]?\d+)?$/i;

export type TableOpts = {
  style: string;
  header: boolean;
  /** "auto" (numbers right), or l/c/r per column like "l,r,c". */
  align: string;
  rowLines: boolean;
  padX: number;
  maxCol: number;
};

export function drawTable(t: ParsedTable, o: TableOpts): string[] {
  const b = BORDERS[o.style] ?? BORDERS.single;
  const ncol = Math.max(...t.rows.map((r) => r.length));
  const rows = t.rows.map((r) => Array.from({ length: ncol }, (_, i) => (r[i] ?? "").replace(/\t/g, " ")));
  const body = o.header ? rows.slice(1) : rows;
  const forced = o.align.trim() && o.align.trim() !== "auto" ? o.align.split(/[,\s]+/).map((a) => (a[0] === "r" ? "right" : a[0] === "c" ? "center" : "left") as Align) : null;
  const aligns: Align[] = Array.from({ length: ncol }, (_, c) => {
    if (forced) return forced[c] ?? forced[forced.length - 1];
    if (t.aligns[c]) return t.aligns[c]!;
    const vals = body.map((r) => r[c]).filter((v) => v !== "");
    return vals.length && vals.every((v) => NUMERIC.test(v)) ? "right" : "left";
  });
  // Cells may wrap when a column max width is set.
  const cellLines = rows.map((r) => r.map((c) => (o.maxCol > 0 ? wrapText(c, o.maxCol) : [c])));
  const widths = Array.from({ length: ncol }, (_, c) => Math.max(1, ...cellLines.map((r) => Math.max(...r[c].map(strWidth)))));
  const p = " ".repeat(o.padX);
  const seg = (h: string) => widths.map((w) => h.repeat(w + 2 * o.padX));
  const out: string[] = [b.tl + seg(b.t).join(b.tm) + b.tr];
  cellLines.forEach((r, ri) => {
    const height = Math.max(...r.map((c) => c.length));
    for (let k = 0; k < height; k++) {
      const cells = r.map((c, ci) => p + alignW(c[k] ?? "", widths[ci], aligns[ci]) + p);
      out.push(b.l + cells.join(b.v) + b.r);
    }
    const last = ri === cellLines.length - 1;
    if (last) return;
    if (o.header && ri === 0) out.push((b.hl ?? b.ml) + seg(b.hh ?? b.h).join(b.hx ?? b.x) + (b.hr ?? b.mr));
    else if (o.rowLines) out.push(b.ml + seg(b.h).join(b.x) + b.mr);
  });
  out.push(b.bl + seg(b.b).join(b.bm) + b.br);
  return b.shadow ? addShadow(out, b.shadow) : out;
}
