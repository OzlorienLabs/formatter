/**
 * Whiteboard scene model, geometry and renderers (Canvas 2D and SVG string).
 * Pure and deterministic: rough "hand-drawn" jitter comes from each element's
 * seed, so a scene renders identically every time and in every export.
 */

export type ElType = "pen" | "line" | "arrow" | "rect" | "ellipse" | "diamond" | "text";
export type Fill = "none" | "solid" | "hatch";
export type FontKind = "hand" | "sans" | "mono";

export type El = {
  id: string;
  type: ElType;
  x: number;
  y: number;
  w: number;
  h: number;
  pts?: [number, number][];
  text?: string;
  size?: number;
  font?: FontKind;
  align?: "left" | "center";
  stroke: string;
  fill: Fill;
  fillColor: string;
  sw: number;
  dash: boolean;
  rough: boolean;
  seed: number;
  opacity?: number;
};

export type Scene = { v: 1; elements: El[]; bg: string };

export const FONTS: Record<FontKind, string> = {
  hand: '"Comic Sans MS", "Segoe Print", "Bradley Hand", "Chalkboard SE", "Marker Felt", cursive',
  sans: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  mono: 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace',
};

export const STROKES = ["#1e1e1e", "#e03131", "#2f9e44", "#1971c2", "#f08c00", "#9c36b5", "#0c8599", "#868e96"];
export const FILLS = ["#ffc9c9", "#b2f2bb", "#a5d8ff", "#ffec99", "#eebefa", "#99e9f2", "#e9ecef", "#ffffff"];

export function emptyScene(): Scene {
  return { v: 1, elements: [], bg: "#ffffff" };
}

export function parseScene(s: string): Scene {
  if (!s || !s.trim()) return emptyScene();
  const v = JSON.parse(s) as Partial<Scene> | El[];
  const elements = Array.isArray(v) ? v : Array.isArray(v.elements) ? v.elements : null;
  if (!elements) throw new Error('Scene JSON needs an "elements" array.');
  return { v: 1, elements: elements.filter((e) => e && typeof e === "object" && typeof e.type === "string").map(normalize), bg: (!Array.isArray(v) && v.bg) || "#ffffff" };
}

function normalize(e: El): El {
  const el: El = {
    id: String(e.id ?? Math.random().toString(36).slice(2, 10)),
    type: e.type,
    x: Number(e.x) || 0,
    y: Number(e.y) || 0,
    w: Number(e.w) || 0,
    h: Number(e.h) || 0,
    stroke: e.stroke || "#1e1e1e",
    fill: e.fill === "solid" || e.fill === "hatch" ? e.fill : "none",
    fillColor: e.fillColor || "#a5d8ff",
    sw: Number(e.sw) || 2,
    dash: !!e.dash,
    rough: e.rough !== false,
    seed: Number(e.seed) || 1,
  };
  if (e.pts) el.pts = e.pts.map((p) => [Number(p[0]) || 0, Number(p[1]) || 0]);
  if (e.type === "text") {
    el.text = String(e.text ?? "");
    el.size = Number(e.size) || 20;
    el.font = e.font === "sans" || e.font === "mono" ? e.font : "hand";
    el.align = e.align === "center" ? "center" : "left";
  }
  if (e.opacity !== undefined) el.opacity = Math.min(1, Math.max(0.05, Number(e.opacity)));
  if (el.pts) Object.assign(el, boxOf(el.pts));
  return el;
}

export function boxOf(pts: [number, number][]) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const [x, y] of pts) {
    if (x < x1) x1 = x;
    if (y < y1) y1 = y;
    if (x > x2) x2 = x;
    if (y > y2) y2 = y;
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/* ── seeded randomness ─────────────────────────────────────────────── */

function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── geometry → path commands ──────────────────────────────────────── */

export type Cmd = ["M", number, number] | ["L", number, number] | ["C", number, number, number, number, number, number] | ["Q", number, number, number, number] | ["Z"];
export type Shape = { strokes: Cmd[][]; fill?: Cmd[]; text?: { lines: string[]; x: number; y: number; size: number; font: string; align: "left" | "center"; w: number } };

function roughLine(r: () => number, x1: number, y1: number, x2: number, y2: number, amp: number): Cmd[] {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const k = Math.min(amp, len * 0.05 + 0.4);
  const j = () => (r() - 0.5) * 2 * k;
  const nx = -(y2 - y1) / len, ny = (x2 - x1) / len;
  const bow = (r() - 0.5) * Math.min(len * 0.02 + 1, 4);
  const a: [number, number] = [x1 + j(), y1 + j()];
  const b: [number, number] = [x2 + j(), y2 + j()];
  const c1: [number, number] = [a[0] + (b[0] - a[0]) / 3 + nx * bow + j() * 0.3, a[1] + (b[1] - a[1]) / 3 + ny * bow + j() * 0.3];
  const c2: [number, number] = [a[0] + ((b[0] - a[0]) * 2) / 3 + nx * bow + j() * 0.3, a[1] + ((b[1] - a[1]) * 2) / 3 + ny * bow + j() * 0.3];
  return [["M", a[0], a[1]], ["C", c1[0], c1[1], c2[0], c2[1], b[0], b[1]]];
}

function polyStrokes(el: El, pts: [number, number][], closed: boolean): Cmd[][] {
  const seq = closed ? [...pts, pts[0]] : pts;
  if (!el.rough) {
    const c: Cmd[] = [["M", seq[0][0], seq[0][1]]];
    for (const p of seq.slice(1)) c.push(["L", p[0], p[1]]);
    if (closed) c.push(["Z"]);
    return [c];
  }
  const r = rng(el.seed);
  const amp = 1.2 + el.sw * 0.35;
  const out: Cmd[][] = [];
  for (let pass = 0; pass < 2; pass++) {
    const c: Cmd[] = [];
    for (let i = 0; i < seq.length - 1; i++) c.push(...roughLine(r, seq[i][0], seq[i][1], seq[i + 1][0], seq[i + 1][1], amp * (pass ? 1.3 : 1)));
    out.push(c);
  }
  return out;
}

/** Closed smooth curve through points (Catmull-Rom → cubic Bézier). */
function smoothClosed(pts: [number, number][]): Cmd[] {
  const n = pts.length;
  const c: Cmd[] = [["M", pts[0][0], pts[0][1]]];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    c.push(["C", p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]]);
  }
  return c;
}

function ellipseCmds(cx: number, cy: number, rx: number, ry: number): Cmd[] {
  const k = 0.5522847498;
  return [
    ["M", cx + rx, cy],
    ["C", cx + rx, cy + ry * k, cx + rx * k, cy + ry, cx, cy + ry],
    ["C", cx - rx * k, cy + ry, cx - rx, cy + ry * k, cx - rx, cy],
    ["C", cx - rx, cy - ry * k, cx - rx * k, cy - ry, cx, cy - ry],
    ["C", cx + rx * k, cy - ry, cx + rx, cy - ry * k, cx + rx, cy],
    ["Z"],
  ];
}

export function textLines(el: El) {
  return (el.text ?? "").split("\n");
}

export function lineHeight(size: number) {
  return Math.round(size * 1.25);
}

export function shapeOf(el: El): Shape {
  const x = el.w < 0 ? el.x + el.w : el.x, y = el.h < 0 ? el.y + el.h : el.y;
  const w = Math.abs(el.w), h = Math.abs(el.h);
  switch (el.type) {
    case "rect": {
      const pts: [number, number][] = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
      const fill: Cmd[] = [["M", x, y], ["L", x + w, y], ["L", x + w, y + h], ["L", x, y + h], ["Z"]];
      return { strokes: polyStrokes(el, pts, true), fill };
    }
    case "diamond": {
      const pts: [number, number][] = [[x + w / 2, y], [x + w, y + h / 2], [x + w / 2, y + h], [x, y + h / 2]];
      const fill: Cmd[] = [["M", pts[0][0], pts[0][1]], ["L", pts[1][0], pts[1][1]], ["L", pts[2][0], pts[2][1]], ["L", pts[3][0], pts[3][1]], ["Z"]];
      return { strokes: polyStrokes(el, pts, true), fill };
    }
    case "ellipse": {
      const cx = x + w / 2, cy = y + h / 2, rx = w / 2, ry = h / 2;
      const fill = ellipseCmds(cx, cy, rx, ry);
      if (!el.rough) return { strokes: [fill], fill };
      const r = rng(el.seed);
      const strokes: Cmd[][] = [];
      for (let pass = 0; pass < 2; pass++) {
        const n = 14;
        const start = r() * Math.PI * 2;
        const pts: [number, number][] = [];
        for (let i = 0; i < n; i++) {
          const a = start + (i / n) * Math.PI * 2;
          const jr = 1 + (r() - 0.5) * 0.05;
          pts.push([cx + Math.cos(a) * rx * jr + (r() - 0.5) * 1.2, cy + Math.sin(a) * ry * jr + (r() - 0.5) * 1.2]);
        }
        const c = smoothClosed(pts);
        // Overshoot a little past the start, like a pen that does not quite meet itself.
        const last = c[c.length - 1] as ["C", number, number, number, number, number, number];
        last[5] += (r() - 0.5) * 4;
        last[6] += (r() - 0.5) * 4;
        strokes.push(c);
      }
      return { strokes, fill };
    }
    case "line":
    case "arrow": {
      const pts = el.pts && el.pts.length >= 2 ? el.pts : ([[x, y], [x + w, y + h]] as [number, number][]);
      const strokes = polyStrokes(el, pts, false);
      if (el.type === "arrow") {
        const [a, b] = [pts[pts.length - 2], pts[pts.length - 1]];
        const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
        const len = Math.min(Math.max(12, el.sw * 5), Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.6);
        const wing = (d: number): [number, number] => [b[0] - len * Math.cos(ang + d), b[1] - len * Math.sin(ang + d)];
        const head = polyStrokes({ ...el, seed: el.seed + 7 }, [wing(0.45), b, wing(-0.45)], false);
        strokes.push(...(el.rough ? head : head.slice(0, 1)));
      }
      return { strokes };
    }
    case "pen": {
      const pts = el.pts ?? [];
      if (pts.length < 2) return { strokes: pts.length ? [[["M", pts[0][0], pts[0][1]], ["L", pts[0][0] + 0.01, pts[0][1]]]] : [] };
      const c: Cmd[] = [["M", pts[0][0], pts[0][1]]];
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
        c.push(["Q", pts[i][0], pts[i][1], mx, my]);
      }
      c.push(["L", pts[pts.length - 1][0], pts[pts.length - 1][1]]);
      return { strokes: [c] };
    }
    case "text": {
      const size = el.size ?? 20;
      return { strokes: [], text: { lines: textLines(el), x, y, size, font: FONTS[el.font ?? "hand"], align: el.align ?? "left", w } };
    }
  }
}

/** Simplify a freehand stroke (radial distance) so saved scenes stay small. */
export function simplify(pts: [number, number][], tol = 1.5): [number, number][] {
  if (pts.length < 3) return pts;
  const out: [number, number][] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const p = out[out.length - 1];
    if (Math.hypot(pts[i][0] - p[0], pts[i][1] - p[1]) >= tol) out.push([Math.round(pts[i][0] * 10) / 10, Math.round(pts[i][1] * 10) / 10]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/* ── canvas renderer ───────────────────────────────────────────────── */

function trace(ctx: CanvasRenderingContext2D, cmds: Cmd[]) {
  for (const c of cmds) {
    if (c[0] === "M") ctx.moveTo(c[1], c[2]);
    else if (c[0] === "L") ctx.lineTo(c[1], c[2]);
    else if (c[0] === "C") ctx.bezierCurveTo(c[1], c[2], c[3], c[4], c[5], c[6]);
    else if (c[0] === "Q") ctx.quadraticCurveTo(c[1], c[2], c[3], c[4]);
    else ctx.closePath();
  }
}

export function drawElement(ctx: CanvasRenderingContext2D, el: El) {
  const s = shapeOf(el);
  ctx.save();
  ctx.globalAlpha = el.opacity ?? 1;
  if (s.fill && el.fill !== "none") {
    ctx.beginPath();
    trace(ctx, s.fill);
    if (el.fill === "solid") {
      ctx.fillStyle = el.fillColor;
      ctx.fill();
    } else {
      ctx.save();
      ctx.clip();
      const b = { x: Math.min(el.x, el.x + el.w), y: Math.min(el.y, el.y + el.h), w: Math.abs(el.w), h: Math.abs(el.h) };
      ctx.strokeStyle = el.fillColor === "#ffffff" ? "#ced4da" : el.fillColor;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      const step = 8;
      for (let d = -b.h; d < b.w; d += step) {
        ctx.moveTo(b.x + d, b.y + b.h);
        ctx.lineTo(b.x + d + b.h, b.y);
      }
      ctx.stroke();
      ctx.restore();
    }
  }
  if (s.strokes.length) {
    ctx.strokeStyle = el.stroke;
    ctx.lineWidth = el.sw;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.setLineDash(el.dash ? [el.sw * 4, el.sw * 3.5] : []);
    s.strokes.forEach((st, i) => {
      ctx.beginPath();
      trace(ctx, st);
      ctx.globalAlpha = (el.opacity ?? 1) * (el.rough && i % 2 === 1 && el.type !== "arrow" ? 0.75 : 1);
      ctx.stroke();
    });
  }
  if (s.text) {
    const t = s.text;
    ctx.fillStyle = el.stroke;
    ctx.font = `${t.size}px ${t.font}`;
    ctx.textBaseline = "top";
    ctx.textAlign = t.align === "center" ? "center" : "left";
    const lh = lineHeight(t.size);
    t.lines.forEach((ln, i) => ctx.fillText(ln, t.align === "center" ? t.x + t.w / 2 : t.x, t.y + i * lh + (lh - t.size) / 2));
  }
  ctx.restore();
}

/* ── bounds & hit testing ──────────────────────────────────────────── */

export function bounds(el: El) {
  const x = Math.min(el.x, el.x + el.w), y = Math.min(el.y, el.y + el.h);
  return { x, y, w: Math.abs(el.w), h: Math.abs(el.h) };
}

export function sceneBounds(els: El[]) {
  if (!els.length) return { x: 0, y: 0, w: 0, h: 0 };
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const e of els) {
    const b = bounds(e);
    const pad = e.sw + (e.type === "arrow" ? 6 : 2);
    x1 = Math.min(x1, b.x - pad);
    y1 = Math.min(y1, b.y - pad);
    x2 = Math.max(x2, b.x + b.w + pad);
    y2 = Math.max(y2, b.y + b.h + pad);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

function distSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function hit(el: El, px: number, py: number, tol: number): boolean {
  const b = bounds(el);
  const t = tol + el.sw / 2;
  if (px < b.x - t || px > b.x + b.w + t || py < b.y - t || py > b.y + b.h + t) return false;
  if (el.type === "text") return true;
  if (el.pts && (el.type === "pen" || el.type === "line" || el.type === "arrow")) {
    for (let i = 0; i < el.pts.length - 1; i++) if (distSeg(px, py, el.pts[i][0], el.pts[i][1], el.pts[i + 1][0], el.pts[i + 1][1]) <= t) return true;
    return el.pts.length === 1 && Math.hypot(px - el.pts[0][0], py - el.pts[0][1]) <= t;
  }
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  if (el.type === "ellipse") {
    const rx = b.w / 2 || 1, ry = b.h / 2 || 1;
    const d = Math.hypot((px - cx) / rx, (py - cy) / ry);
    if (el.fill !== "none") return d <= 1 + t / Math.min(rx, ry);
    return Math.abs(d - 1) * Math.min(rx, ry) <= t;
  }
  if (el.type === "diamond") {
    const d = Math.abs(px - cx) / (b.w / 2 || 1) + Math.abs(py - cy) / (b.h / 2 || 1);
    if (el.fill !== "none") return d <= 1.05;
    return Math.abs(d - 1) * Math.min(b.w, b.h) / 2 <= t;
  }
  if (el.fill !== "none") return true;
  return px - b.x <= t || b.x + b.w - px <= t || py - b.y <= t || b.y + b.h - py <= t;
}

/* ── transforms ────────────────────────────────────────────────────── */

export function moveEl(el: El, dx: number, dy: number): El {
  const n = { ...el, x: el.x + dx, y: el.y + dy };
  if (el.pts) n.pts = el.pts.map(([x, y]) => [x + dx, y + dy]);
  return n;
}

/** Resize to a new bounding box (x, y, w, h — w/h may be negative when flipped). */
export function resizeEl(el: El, from: { x: number; y: number; w: number; h: number }, to: { x: number; y: number; w: number; h: number }): El {
  const sx = from.w ? to.w / from.w : 1, sy = from.h ? to.h / from.h : 1;
  if (el.pts) {
    const pts = el.pts.map(([x, y]) => [to.x + (x - from.x) * sx, to.y + (y - from.y) * sy] as [number, number]);
    return { ...el, pts, ...boxOf(pts) };
  }
  if (el.type === "text") {
    const k = Math.max(0.2, Math.abs(sy));
    const size = Math.max(6, Math.round((el.size ?? 20) * k));
    return { ...el, x: Math.min(to.x, to.x + to.w), y: Math.min(to.y, to.y + to.h), w: Math.abs(el.w * sx), h: Math.abs(el.h * k), size };
  }
  const nx = to.x + (el.x - from.x) * sx, ny = to.y + (el.y - from.y) * sy;
  return { ...el, x: nx, y: ny, w: el.w * sx, h: el.h * sy };
}

/** Normalise negative sizes after a drag. */
export function normBox(el: El): El {
  if (el.pts || (el.w >= 0 && el.h >= 0)) return el;
  const b = bounds(el);
  return { ...el, ...b };
}

/* ── SVG export ────────────────────────────────────────────────────── */

const n2 = (v: number) => String(Math.round(v * 100) / 100);
function dOf(cmds: Cmd[]) {
  return cmds
    .map((c) => (c[0] === "Z" ? "Z" : `${c[0]}${c.slice(1).map((v) => n2(v as number)).join(" ")}`))
    .join("");
}
const xmlEsc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function sceneToSvg(scene: Scene, opts: { padding?: number; background?: boolean } = {}): string {
  const pad = opts.padding ?? 24;
  const els = scene.elements;
  const b = sceneBounds(els);
  const W = Math.max(1, Math.ceil(b.w + pad * 2)), H = Math.max(1, Math.ceil(b.h + pad * 2));
  const ox = -b.x + pad, oy = -b.y + pad;
  const patterns = new Map<string, string>();
  const body: string[] = [];
  for (const el of els) {
    const s = shapeOf(el);
    const parts: string[] = [];
    if (s.fill && el.fill !== "none") {
      let fill = el.fillColor;
      if (el.fill === "hatch") {
        const col = el.fillColor === "#ffffff" ? "#ced4da" : el.fillColor;
        const id = `hatch-${col.replace(/[^\w]/g, "")}`;
        patterns.set(id, `<pattern id="${id}" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="${xmlEsc(col)}" stroke-width="1.6"/></pattern>`);
        fill = `url(#${id})`;
      }
      parts.push(`<path d="${dOf(s.fill)}" fill="${xmlEsc(fill)}" stroke="none"/>`);
    }
    if (s.strokes.length) {
      const dash = el.dash ? ` stroke-dasharray="${n2(el.sw * 4)} ${n2(el.sw * 3.5)}"` : "";
      s.strokes.forEach((st, i) => {
        const op = el.rough && i % 2 === 1 && el.type !== "arrow" ? ' stroke-opacity="0.75"' : "";
        parts.push(`<path d="${dOf(st)}" fill="none" stroke="${xmlEsc(el.stroke)}" stroke-width="${n2(el.sw)}" stroke-linecap="round" stroke-linejoin="round"${dash}${op}/>`);
      });
    }
    if (s.text) {
      const t = s.text;
      const lh = lineHeight(t.size);
      const anchor = t.align === "center" ? ' text-anchor="middle"' : "";
      const tx = t.align === "center" ? t.x + t.w / 2 : t.x;
      const spans = t.lines.map((ln, i) => `<tspan x="${n2(tx)}" y="${n2(t.y + i * lh + (lh - t.size) / 2 + t.size * 0.8)}">${xmlEsc(ln) || " "}</tspan>`).join("");
      parts.push(`<text font-family="${xmlEsc(t.font)}" font-size="${t.size}" fill="${xmlEsc(el.stroke)}"${anchor} xml:space="preserve">${spans}</text>`);
    }
    if (!parts.length) continue;
    const op = el.opacity !== undefined && el.opacity < 1 ? ` opacity="${n2(el.opacity)}"` : "";
    body.push(`  <g data-type="${el.type}"${op}>${parts.join("")}</g>`);
  }
  const bg = opts.background !== false && scene.bg && scene.bg !== "transparent" ? `  <rect x="${n2(-ox)}" y="${n2(-oy)}" width="${W}" height="${H}" fill="${xmlEsc(scene.bg)}"/>\n` : "";
  const defs = patterns.size ? `  <defs>${[...patterns.values()].join("")}</defs>\n` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">\n${defs}<g transform="translate(${n2(ox)} ${n2(oy)})">\n${bg}${body.join("\n")}\n</g>\n</svg>`;
}

/* ── builders (examples) ───────────────────────────────────────────── */

let bseq = 0;
type Opt = Partial<Omit<El, "id" | "type">>;
const base = (o: Opt = {}) => ({ stroke: "#1e1e1e", fill: "none" as Fill, fillColor: "#a5d8ff", sw: 2, dash: false, rough: true, seed: ++bseq * 7919, ...o });

export const B = {
  reset() {
    bseq = 0;
  },
  rect: (x: number, y: number, w: number, h: number, o?: Opt): El => ({ id: `e${bseq + 1}`, type: "rect", x, y, w, h, ...base(o) }),
  ellipse: (x: number, y: number, w: number, h: number, o?: Opt): El => ({ id: `e${bseq + 1}`, type: "ellipse", x, y, w, h, ...base(o) }),
  diamond: (x: number, y: number, w: number, h: number, o?: Opt): El => ({ id: `e${bseq + 1}`, type: "diamond", x, y, w, h, ...base(o) }),
  text: (x: number, y: number, text: string, o: Opt & { size?: number; w?: number; align?: "left" | "center" } = {}): El => {
    const size = o.size ?? 20;
    const lines = text.split("\n");
    const w = o.w ?? Math.max(...lines.map((l) => l.length)) * size * 0.55;
    return { id: `e${bseq + 1}`, type: "text", x, y, w, h: lines.length * lineHeight(size), text, size, font: "hand", align: o.align ?? "left", ...base(o), fill: "none" };
  },
  /** Text centred inside a box. */
  label: (bx: number, by: number, bw: number, bh: number, text: string, o: Opt & { size?: number } = {}): El => {
    const size = o.size ?? 20;
    const h = text.split("\n").length * lineHeight(size);
    return B.text(bx, by + (bh - h) / 2, text, { ...o, w: bw, align: "center" });
  },
  arrow: (a: [number, number], b: [number, number], o?: Opt): El => ({ id: `e${bseq + 1}`, type: "arrow", pts: [a, b], ...boxOf([a, b]), ...base(o) }),
  line: (a: [number, number], b: [number, number], o?: Opt): El => ({ id: `e${bseq + 1}`, type: "line", pts: [a, b], ...boxOf([a, b]), ...base(o) }),
  pen: (pts: [number, number][], o?: Opt): El => ({ id: `e${bseq + 1}`, type: "pen", pts, ...boxOf(pts), ...base(o) }),
};

export function sceneJson(elements: El[], bg = "#ffffff"): string {
  // Give every element a unique id.
  const seen = new Set<string>();
  const els = elements.map((e, i) => {
    let id = e.id;
    if (seen.has(id)) id = `${id}_${i}`;
    seen.add(id);
    return { ...e, id };
  });
  return JSON.stringify({ v: 1, bg, elements: els });
}
