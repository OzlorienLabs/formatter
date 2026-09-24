/**
 * The grid model behind ASCII Draw: a rectangle of single-width cells,
 * line drawing with automatic junctions (every line cell stores which of its
 * four sides connect), and conversion between ASCII and Unicode box styles.
 */

export type Grid = string[][];
export type Pt = { x: number; y: number };

export const U = 1, R = 2, D = 4, L = 8;

export type Charset = "ascii" | "light" | "heavy" | "double" | "rounded";

export const CHARSET_CHOICES: [Charset, string][] = [
  ["light", "Light ┌─┐"],
  ["rounded", "Rounded ╭─╮"],
  ["heavy", "Heavy ┏━┓"],
  ["double", "Double ╔═╗"],
  ["ascii", "ASCII +-|"],
];

// index = mask (U R D L bits) → glyph
const TABLES: Record<Exclude<Charset, "ascii">, string> = {
  //      0    U    R    UR   D    UD   RD   URD  L    UL   RL   URL  DL   UDL  RDL  all
  light: " │─└││┌├─┘─┴┐┤┬┼",
  rounded: " │─╰││╭├─╯─┴╮┤┬┼",
  heavy: " ┃━┗┃┃┏┣━┛━┻┓┫┳╋",
  double: " ║═╚║║╔╠═╝═╩╗╣╦╬",
};

function asciiGlyph(mask: number): string {
  if (!mask) return " ";
  if ((mask & (U | D)) === mask) return "|";
  if ((mask & (L | R)) === mask) return "-";
  return "+";
}

export function glyph(mask: number, cs: Charset): string {
  if (cs === "ascii") return asciiGlyph(mask);
  return [...TABLES[cs]][mask];
}

/** Known line glyphs → mask. '+', '-', '|' are contextual in ASCII drawings. */
const MASK = new Map<string, number>();
for (const t of Object.values(TABLES)) [...t].forEach((c, m) => c !== " " && !MASK.has(c) && MASK.set(c, m || (U | D)));
for (const [c, m] of [["╌", L | R], ["┄", L | R], ["┈", L | R], ["╎", U | D], ["┆", U | D], ["┊", U | D], ["╴", L], ["╶", R], ["╵", U], ["╷", D]] as [string, number][]) MASK.set(c, m);
// Mixed single/double and light/heavy junctions (e.g. table header rules).
const MIXED: [string, number][] = [];
const mixedSets = ["╒╓", "╕╖", "╘╙", "╛╜", "╞╟", "╡╢", "╤╥", "╧╨", "╪╫", "┍┎┏", "┑┒", "┕┖", "┙┚", "┝┞┟┠┡┢", "┥┦┧┨┩┪", "┭┮┯┰┱┲", "┵┶┷┸┹┺", "┽┾┿╀╁╂╃╄╅╆╇╈╉╊"];
const mixedMasks = [R | D, L | D, U | R, U | L, U | D | R, U | D | L, L | R | D, L | R | U, U | D | L | R, R | D, L | D, U | R, U | L, U | D | R, U | D | L, L | R | D, L | R | U, U | D | L | R];
mixedSets.forEach((set, i) => [...set].forEach((c) => MIXED.push([c, mixedMasks[i]])));
for (const [c, m] of MIXED) if (!MASK.has(c)) MASK.set(c, m);
// Fix single-direction duplicates: the tables map U/D/L/R alone to │/─ which already exist.
MASK.set("│", U | D); MASK.set("─", L | R); MASK.set("━", L | R); MASK.set("┃", U | D); MASK.set("═", L | R); MASK.set("║", U | D);

export const ARROWS: Record<Charset | "any", Record<"U" | "R" | "D" | "L", string>> = {
  ascii: { U: "^", R: ">", D: "v", L: "<" },
  light: { U: "▲", R: "▶", D: "▼", L: "◀" },
  rounded: { U: "▲", R: "▶", D: "▼", L: "◀" },
  heavy: { U: "▲", R: "▶", D: "▼", L: "◀" },
  double: { U: "▲", R: "▶", D: "▼", L: "◀" },
  any: { U: "▲", R: "▶", D: "▼", L: "◀" },
};
/** Which side of an arrowhead cell its shaft attaches to. */
const ARROW_BACK: Record<string, number> = { "^": D, "▲": D, "△": D, ">": L, "▶": L, "►": L, "→": L, v: U, "▼": U, "▽": U, "<": R, "◀": R, "◄": R, "←": R };
const ARROW_DIR: Record<string, "U" | "R" | "D" | "L"> = { "^": "U", "▲": "U", "△": "U", ">": "R", "▶": "R", "►": "R", v: "D", "▼": "D", "▽": "D", "<": "L", "◀": "L", "◄": "L" };

export const isLineChar = (c: string) => MASK.has(c) || c === "+" || c === "-" || c === "|";

function at(g: Grid, x: number, y: number): string {
  return g[y]?.[x] ?? " ";
}

/** Does the cell at (x,y) reach towards side `dir` of its neighbour? */
function reaches(g: Grid, x: number, y: number, towards: number): boolean {
  const c = at(g, x, y);
  if (MASK.has(c)) return (MASK.get(c)! & towards) !== 0;
  if (c === "-") return (towards & (L | R)) !== 0;
  if (c === "|") return (towards & (U | D)) !== 0;
  if (c === "+") return true;
  if (c in ARROW_BACK) return ARROW_BACK[c] === towards;
  return false;
}

/** The connection mask of a cell, resolving ASCII '+', '-' and '|' from their neighbours. */
export function maskAt(g: Grid, x: number, y: number): number {
  const c = at(g, x, y);
  if (MASK.has(c)) return MASK.get(c)!;
  if (c === "-") return L | R;
  if (c === "|") return U | D;
  if (c === "+") {
    let m = 0;
    if (reaches(g, x, y - 1, D)) m |= U;
    if (reaches(g, x + 1, y, L)) m |= R;
    if (reaches(g, x, y + 1, U)) m |= D;
    if (reaches(g, x - 1, y, R)) m |= L;
    return m;
  }
  return 0;
}

export function makeGrid(w: number, h: number, text = ""): Grid {
  const lines = text.replace(/\r/g, "").replace(/\t/g, "    ").split("\n");
  const g: Grid = [];
  for (let y = 0; y < h; y++) {
    const chars = [...(lines[y] ?? "")];
    const row: string[] = [];
    for (let x = 0; x < w; x++) row.push(chars[x] ?? " ");
    g.push(row);
  }
  return g;
}

export function textSize(text: string): { w: number; h: number } {
  const lines = text.replace(/\r/g, "").replace(/\t/g, "    ").replace(/\n+$/, "").split("\n");
  return { w: Math.max(0, ...lines.map((l) => [...l].length)), h: text.trim() ? lines.length : 0 };
}

export function gridToText(g: Grid): string {
  const lines = g.map((r) => r.join("").replace(/\s+$/, ""));
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  return lines.join("\n");
}

export const cloneGrid = (g: Grid): Grid => g.map((r) => r.slice());

function inside(g: Grid, x: number, y: number) {
  return y >= 0 && y < g.length && x >= 0 && x < (g[0]?.length ?? 0);
}

function putMask(g: Grid, x: number, y: number, add: number, cs: Charset) {
  if (!inside(g, x, y)) return;
  const cur = at(g, x, y);
  const prev = isLineChar(cur) ? maskAt(g, x, y) : 0;
  g[y][x] = glyph(prev | add, cs);
}

/** Cells along an L-shaped path from a to b: horizontal first ('h') or vertical first ('v'). */
export function elbowPath(a: Pt, b: Pt, first: "h" | "v"): Pt[] {
  const pts: Pt[] = [];
  const corner = first === "h" ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
  const seg = (p: Pt, q: Pt, skipFirst: boolean) => {
    const dx = Math.sign(q.x - p.x), dy = Math.sign(q.y - p.y);
    let x = p.x, y = p.y;
    if (!skipFirst) pts.push({ x, y });
    while (x !== q.x || y !== q.y) {
      x += dx;
      y += dy;
      pts.push({ x, y });
    }
  };
  seg(a, corner, false);
  seg(corner, b, true);
  return pts;
}

function dirBetween(p: Pt, q: Pt): number {
  if (q.x > p.x) return R;
  if (q.x < p.x) return L;
  if (q.y > p.y) return D;
  return U;
}
const OPP: Record<number, number> = { [U]: D, [D]: U, [L]: R, [R]: L };

/** Draw a polyline through `pts`, merging with lines already on the grid. */
export function drawPath(g: Grid, pts: Pt[], cs: Charset) {
  if (pts.length === 1) {
    putMask(g, pts[0].x, pts[0].y, L | R, cs);
    return;
  }
  // Collect every side a cell touches first, so a closed path's start cell becomes a corner.
  const masks = new Map<string, { p: Pt; m: number }>();
  for (let i = 0; i < pts.length; i++) {
    let m = 0;
    if (i > 0) m |= OPP[dirBetween(pts[i - 1], pts[i])];
    if (i < pts.length - 1) m |= dirBetween(pts[i], pts[i + 1]);
    const k = pts[i].x + "," + pts[i].y;
    const cur = masks.get(k);
    masks.set(k, { p: pts[i], m: (cur?.m ?? 0) | m });
  }
  for (const { p, m } of masks.values()) putMask(g, p.x, p.y, m, cs);
}

export function drawLine(g: Grid, a: Pt, b: Pt, cs: Charset, first: "h" | "v" = "h") {
  drawPath(g, elbowPath(a, b, first), cs);
}

export function drawArrow(g: Grid, a: Pt, b: Pt, cs: Charset, first: "h" | "v" = "h", both = false) {
  const pts = elbowPath(a, b, first);
  drawPath(g, pts, cs);
  if (pts.length < 2) return;
  const head = (p: Pt, prev: Pt) => {
    const d = dirBetween(prev, p);
    const k = d === U ? "U" : d === R ? "R" : d === D ? "D" : "L";
    if (inside(g, p.x, p.y)) g[p.y][p.x] = ARROWS[cs][k];
  };
  head(pts[pts.length - 1], pts[pts.length - 2]);
  if (both) head(pts[0], pts[1]);
}

export function drawRect(g: Grid, a: Pt, b: Pt, cs: Charset) {
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
  if (x0 === x1 || y0 === y1) return drawLine(g, { x: x0, y: y0 }, { x: x1, y: y1 }, cs);
  drawPath(g, [...elbowPath({ x: x0, y: y0 }, { x: x1, y: y0 }, "h"), ...elbowPath({ x: x1, y: y0 }, { x: x1, y: y1 }, "v").slice(1), ...elbowPath({ x: x1, y: y1 }, { x: x0, y: y1 }, "h").slice(1), ...elbowPath({ x: x0, y: y1 }, { x: x0, y: y0 }, "v").slice(1)], cs);
}

export function eraseRect(g: Grid, a: Pt, b: Pt) {
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inside(g, x, y)) g[y][x] = " ";
}

export function copyRect(g: Grid, a: Pt, b: Pt): Grid {
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
  const out: Grid = [];
  for (let y = y0; y <= y1; y++) {
    const row: string[] = [];
    for (let x = x0; x <= x1; x++) row.push(at(g, x, y));
    out.push(row);
  }
  return out;
}

/** Paste a block; spaces in the block are transparent when `transparent`. */
export function pasteBlock(g: Grid, block: Grid, at0: Pt, transparent = false) {
  block.forEach((row, dy) =>
    row.forEach((c, dx) => {
      const x = at0.x + dx, y = at0.y + dy;
      if (inside(g, x, y) && !(transparent && c === " ")) g[y][x] = c;
    })
  );
}

export function floodFill(g: Grid, p: Pt, ch: string) {
  if (!inside(g, p.x, p.y)) return;
  const target = g[p.y][p.x];
  if (target === ch) return;
  const stack: Pt[] = [p];
  while (stack.length) {
    const { x, y } = stack.pop()!;
    if (!inside(g, x, y) || g[y][x] !== target) continue;
    g[y][x] = ch;
    stack.push({ x: x + 1, y }, { x: x - 1, y }, { x, y: y + 1 }, { x, y: y - 1 });
  }
}

/** Re-draw every line glyph in another style. ASCII hyphens inside words are left alone. */
export function convertCharset(g: Grid, cs: Charset): Grid {
  const out = cloneGrid(g);
  for (let y = 0; y < g.length; y++)
    for (let x = 0; x < g[y].length; x++) {
      const c = g[y][x];
      if (c in ARROW_DIR) {
        const back = ARROW_BACK[c];
        const bx = x + (back === L ? -1 : back === R ? 1 : 0), by = y + (back === U ? -1 : back === D ? 1 : 0);
        // ASCII < > v ^ are only arrowheads when a shaft touches their back.
        if (/[<>v^]/.test(c) && !(maskAt(g, bx, by) & OPP[back])) continue;
        out[y][x] = ARROWS[cs][ARROW_DIR[c]];
        continue;
      }
      if (!isLineChar(c)) continue;
      if (c === "-" && !(isLineChar(at(g, x - 1, y)) || isLineChar(at(g, x + 1, y)) || at(g, x + 1, y) in ARROW_BACK || at(g, x - 1, y) in ARROW_BACK)) continue;
      if (c === "|" && !(isLineChar(at(g, x, y - 1)) || isLineChar(at(g, x, y + 1)) || isLineChar(at(g, x - 1, y)) || isLineChar(at(g, x + 1, y)))) continue;
      if (c === "+" && !maskAt(g, x, y)) continue;
      out[y][x] = glyph(maskAt(g, x, y), cs);
    }
  return out;
}

/** Break a string of text into cells (wide characters take one cell here). */
export function writeText(g: Grid, p: Pt, text: string) {
  let x = p.x, y = p.y;
  for (const ch of text) {
    if (ch === "\n") {
      y++;
      x = p.x;
      continue;
    }
    if (inside(g, x, y)) g[y][x] = ch;
    x++;
  }
}

export type GlyphKind = "light" | "heavy" | "double" | "rounded" | "dashed";
const KIND = new Map<string, GlyphKind>();
for (const [k, t] of Object.entries(TABLES) as [GlyphKind, string][]) for (const c of t) if (c !== " " && !KIND.has(c)) KIND.set(c, k);
for (const c of "╭╮╰╯") KIND.set(c, "rounded");
for (const c of "╌╎┄┆┈┊") KIND.set(c, "dashed");

/** For vector rendering: the sides a pure box-drawing glyph connects, and its weight. */
export function glyphInfo(c: string): { mask: number; kind: GlyphKind } | null {
  const kind = KIND.get(c);
  if (!kind) return null;
  return { mask: MASK.get(c)!, kind };
}
