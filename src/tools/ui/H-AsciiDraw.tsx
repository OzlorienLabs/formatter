"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ToolIcon from "@/src/components/ToolIcon";
import { downloadBlob } from "@/src/components/tool/OutputView";
import type { CustomProps } from "@/src/tools/types";
import {
  D, L, R, U,
  cloneGrid, convertCharset, copyRect, drawArrow, drawLine, drawRect, eraseRect, floodFill, glyphInfo, gridToText, makeGrid, pasteBlock, textSize, writeText,
  type Charset, type Grid, type Pt,
} from "@/src/tools/lib/H-draw";

type Tool = "select" | "rect" | "line" | "arrow" | "text" | "brush" | "fill" | "erase";

const TOOLS: { id: Tool; label: string; glyph: string; key: string; hint: string }[] = [
  { id: "select", label: "Select", glyph: "⬚", key: "V", hint: "Drag to select; drag the selection to move it. Delete clears, ⌘C/⌘X copy/cut, arrows nudge." },
  { id: "rect", label: "Box", glyph: "□", key: "R", hint: "Drag corner to corner to draw a box. Crossing lines join automatically." },
  { id: "line", label: "Line", glyph: "└", key: "L", hint: "Drag to draw a line; it bends once at a corner. Shift flips which way it bends." },
  { id: "arrow", label: "Arrow", glyph: "→", key: "A", hint: "Like Line, with an arrowhead at the end. Alt adds one at the start too." },
  { id: "text", label: "Text", glyph: "T", key: "T", hint: "Click a cell and type. Enter starts a new line under the first character; Esc stops." },
  { id: "brush", label: "Brush", glyph: "✎", key: "B", hint: "Paint the brush character freehand." },
  { id: "fill", label: "Fill", glyph: "◧", key: "F", hint: "Flood-fill the clicked area with the brush character." },
  { id: "erase", label: "Erase", glyph: "⌫", key: "E", hint: "Drag to erase a rectangle of cells." },
];

const INK = "#262524";
const ACCENT = "#0088b0";
const MAGENTA = "#d6006c";

const CSS = `
.h-ad { display: grid; gap: 10px; }
.h-ad-bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 8px 10px; }
.h-ad-tools { display: inline-flex; flex-wrap: wrap; border: 1px solid rgba(32,30,29,.14); border-radius: var(--radius-md); overflow: hidden; background: rgba(255,255,255,.35); }
.h-ad-tools button { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border: 0; background: transparent; cursor: pointer; font-size: 13.5px; color: var(--color-neutral-800); }
.h-ad-tools button + button { border-left: 1px solid rgba(32,30,29,.1); }
.h-ad-tools button[aria-pressed="true"] { background: var(--color-accent-700); color: #fff; }
.h-ad-tools .gl { font-family: var(--font-mono); font-size: 14px; width: 14px; text-align: center; }
.h-ad-tools kbd { font-family: var(--font-mono); font-size: 10px; opacity: .55; }
.h-ad-sep { width: 1px; height: 24px; background: rgba(32,30,29,.12); }
.h-ad-stage { position: relative; overflow: auto; max-height: min(640px, calc(100vh - 300px)); min-height: 280px; background: #fff; }
.h-ad-stage canvas { display: block; touch-action: none; outline: none; cursor: crosshair; }
.h-ad-stage canvas.sel { cursor: default; }
.h-ad-stage canvas.txt { cursor: text; }
.h-ad-foot { display: flex; flex-wrap: wrap; gap: 6px 16px; padding: 6px 12px; border-top: 1px solid rgba(32,30,29,.08); font-size: 12.5px; color: var(--color-neutral-600); }
.h-ad-foot .mono { font-size: 12px; }
.h-ad-num { width: 58px; }
.h-ad-brush { width: 42px; text-align: center; font-family: var(--font-mono); }
.h-ad-flash { font-size: 12.5px; padding: 3px 9px; border-radius: 999px; background: rgba(0,160,90,.09); color: oklch(42% .12 150); }
@media (max-width: 760px) { .h-ad-tools kbd { display: none; } .h-ad-tools button { padding: 6px 8px; } }
`;

function parseSize(s: string | undefined): { w: number; h: number } {
  const m = /^\s*(\d+)\s*[x×,]\s*(\d+)\s*$/i.exec(s ?? "");
  return m ? { w: clamp(+m[1], 8, 400), h: clamp(+m[2], 4, 200) } : { w: 80, h: 24 };
}
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const norm = (a: Pt, b: Pt) => ({ x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) });

type Drag =
  | { kind: "shape"; start: Pt; cur: Pt; elbow: "h" | "v" | null; shift: boolean; alt: boolean }
  | { kind: "brush"; last: Pt }
  | { kind: "select"; start: Pt; cur: Pt }
  | { kind: "move"; from: Pt; cur: Pt; block: Grid; origin: Pt; base: Grid };

export default function AsciiDraw({ inputs, opts, setInput, record, mono }: CustomProps) {
  const art = inputs.art ?? "";
  const size = parseSize(inputs.size);
  const ext = textSize(art);
  const W = Math.max(size.w, ext.w), H = Math.max(size.h, ext.h);
  const grid = useMemo(() => makeGrid(W, H, art), [W, H, art]);
  const cs = (opts.charset as Charset) || "light";

  const [tool, setTool] = useState<Tool>("rect");
  const [brush, setBrush] = useState("#");
  const [zoom, setZoom] = useState(0);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hover, setHover] = useState<Pt | null>(null);
  const [sel, setSel] = useState<{ a: Pt; b: Pt } | null>(null);
  const [caret, setCaret] = useState<{ p: Pt; startX: number } | null>(null);
  const [flash, setFlash] = useState("");
  const undo = useRef<string[]>([]);
  const redo = useRef<string[]>([]);
  const [, bump] = useState(0);
  const cv = useRef<HTMLCanvasElement>(null);
  const clip = useRef<Grid | null>(null);

  const fontPx = clamp(Math.round((mono || 13) + 2 + zoom * 2), 9, 30);
  const [metrics, setMetrics] = useState({ cw: 9, ch: 18, family: "monospace" });

  useEffect(() => {
    const probe = document.createElement("span");
    probe.className = "mono";
    document.body.appendChild(probe);
    const family = getComputedStyle(probe).fontFamily || "monospace";
    probe.remove();
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return;
    ctx.font = `${fontPx}px ${family}`;
    const cw = Math.ceil(ctx.measureText("MMMMMMMMMM").width / 10 * 100) / 100;
    setMetrics({ cw: Math.max(5, cw), ch: Math.round(fontPx * 1.3), family });
  }, [fontPx]);

  const say = (m: string) => {
    setFlash(m);
    window.setTimeout(() => setFlash(""), 1800);
  };

  const commit = useCallback(
    (g: Grid) => {
      const next = gridToText(g);
      if (next === art) return;
      undo.current.push(art);
      if (undo.current.length > 200) undo.current.shift();
      redo.current = [];
      setInput("art", next);
      bump((n) => n + 1);
    },
    [art, setInput]
  );

  const doUndo = useCallback(() => {
    const prev = undo.current.pop();
    if (prev === undefined) return say("Nothing to undo");
    redo.current.push(art);
    setInput("art", prev);
    setSel(null);
    bump((n) => n + 1);
  }, [art, setInput]);

  const doRedo = useCallback(() => {
    const next = redo.current.pop();
    if (next === undefined) return say("Nothing to redo");
    undo.current.push(art);
    setInput("art", next);
    bump((n) => n + 1);
  }, [art, setInput]);

  /** The grid as it should look right now: committed art plus the in-progress gesture. */
  const view = useMemo(() => {
    if (!drag) return grid;
    if (drag.kind === "shape") {
      const g = cloneGrid(grid);
      const elbow = drag.elbow ? (drag.shift ? (drag.elbow === "h" ? "v" : "h") : drag.elbow) : "h";
      if (tool === "rect") drawRect(g, drag.start, drag.cur, cs);
      else if (tool === "line") drawLine(g, drag.start, drag.cur, cs, elbow);
      else if (tool === "arrow") drawArrow(g, drag.start, drag.cur, cs, elbow, drag.alt);
      else if (tool === "erase") eraseRect(g, drag.start, drag.cur);
      return g;
    }
    if (drag.kind === "move") {
      const g = cloneGrid(drag.base);
      pasteBlock(g, drag.block, { x: drag.origin.x + drag.cur.x - drag.from.x, y: drag.origin.y + drag.cur.y - drag.from.y });
      return g;
    }
    return grid;
  }, [drag, grid, tool, cs]);

  /* ── rendering ─────────────────────────────────────────────────────── */
  useEffect(() => {
    const c = cv.current;
    if (!c) return;
    const { cw, ch, family } = metrics;
    const dpr = window.devicePixelRatio || 1;
    const pw = Math.ceil(W * cw), ph = H * ch;
    if (c.width !== Math.round(pw * dpr) || c.height !== Math.round(ph * dpr)) {
      c.width = Math.round(pw * dpr);
      c.height = Math.round(ph * dpr);
      c.style.width = pw + "px";
      c.style.height = ph + "px";
    }
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, pw, ph);
    // dotted grid
    ctx.fillStyle = "rgba(32,30,29,.13)";
    for (let y = 0; y <= H; y++) for (let x = 0; x <= W; x++) ctx.fillRect(Math.round(x * cw) - 0.5, y * ch - 0.5, 1, 1);
    // selection + hover
    const shade = (x0: number, y0: number, x1: number, y1: number, fill: string, stroke?: string) => {
      ctx.fillStyle = fill;
      ctx.fillRect(x0 * cw, y0 * ch, (x1 - x0 + 1) * cw, (y1 - y0 + 1) * ch);
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(x0 * cw + 0.5, y0 * ch + 0.5, (x1 - x0 + 1) * cw - 1, (y1 - y0 + 1) * ch - 1);
        ctx.setLineDash([]);
      }
    };
    if (drag?.kind === "select") {
      const r = norm(drag.start, drag.cur);
      shade(r.x0, r.y0, r.x1, r.y1, "rgba(0,136,176,.1)", ACCENT);
    } else if (drag?.kind === "move") {
      const dx = drag.cur.x - drag.from.x, dy = drag.cur.y - drag.from.y;
      shade(drag.origin.x + dx, drag.origin.y + dy, drag.origin.x + dx + drag.block[0].length - 1, drag.origin.y + dy + drag.block.length - 1, "rgba(0,136,176,.1)", ACCENT);
    } else if (sel) {
      const r = norm(sel.a, sel.b);
      shade(r.x0, r.y0, r.x1, r.y1, "rgba(0,136,176,.1)", ACCENT);
    }
    if (drag?.kind === "shape" && tool === "erase") {
      const r = norm(drag.start, drag.cur);
      shade(r.x0, r.y0, r.x1, r.y1, "rgba(214,0,108,.08)", MAGENTA);
    }
    if (hover && !drag) shade(hover.x, hover.y, hover.x, hover.y, "rgba(0,136,176,.14)");
    if (caret) {
      ctx.fillStyle = ACCENT;
      ctx.fillRect(caret.p.x * cw, caret.p.y * ch + 2, 2, ch - 4);
    }
    // glyphs
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.font = `${fontPx}px ${family}`;
    ctx.lineCap = "butt";
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const g = view[y][x];
        if (g === " ") continue;
        drawGlyph(ctx, g, x * cw, y * ch, cw, ch);
      }
  }, [view, metrics, W, H, sel, hover, caret, drag, tool, fontPx]);

  /* ── pointer handling ─────────────────────────────────────────────── */
  const cellOf = (e: { clientX: number; clientY: number }): Pt => {
    const r = cv.current!.getBoundingClientRect();
    return { x: clamp(Math.floor((e.clientX - r.left) / metrics.cw), 0, W - 1), y: clamp(Math.floor((e.clientY - r.top) / metrics.ch), 0, H - 1) };
  };
  const inSel = (p: Pt) => {
    if (!sel) return false;
    const r = norm(sel.a, sel.b);
    return p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1;
  };

  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus();
    const p = cellOf(e);
    if (tool !== "text") setCaret(null);
    switch (tool) {
      case "select":
        if (sel && inSel(p)) {
          const r = norm(sel.a, sel.b);
          const block = copyRect(grid, { x: r.x0, y: r.y0 }, { x: r.x1, y: r.y1 });
          const base = cloneGrid(grid);
          eraseRect(base, { x: r.x0, y: r.y0 }, { x: r.x1, y: r.y1 });
          setDrag({ kind: "move", from: p, cur: p, block, origin: { x: r.x0, y: r.y0 }, base });
        } else {
          setSel(null);
          setDrag({ kind: "select", start: p, cur: p });
        }
        break;
      case "text":
        setCaret({ p, startX: p.x });
        break;
      case "fill": {
        const g = cloneGrid(grid);
        floodFill(g, p, brush || "#");
        commit(g);
        break;
      }
      case "brush": {
        const g = cloneGrid(grid);
        g[p.y][p.x] = brush || "#";
        commit(g);
        setDrag({ kind: "brush", last: p });
        break;
      }
      default:
        setDrag({ kind: "shape", start: p, cur: p, elbow: null, shift: e.shiftKey, alt: e.altKey });
    }
  }

  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const p = cellOf(e);
    setHover((h) => (h && h.x === p.x && h.y === p.y ? h : p));
    if (!drag) return;
    if (drag.kind === "shape") {
      if (p.x === drag.cur.x && p.y === drag.cur.y && drag.shift === e.shiftKey && drag.alt === e.altKey) return;
      const elbow = drag.elbow ?? (p.x !== drag.start.x ? "h" : p.y !== drag.start.y ? "v" : null);
      setDrag({ ...drag, cur: p, elbow, shift: e.shiftKey, alt: e.altKey });
    } else if (drag.kind === "select" || drag.kind === "move") {
      if (p.x !== drag.cur.x || p.y !== drag.cur.y) setDrag({ ...drag, cur: p });
    } else if (drag.kind === "brush") {
      if (p.x === drag.last.x && p.y === drag.last.y) return;
      const g = cloneGrid(grid);
      // Bresenham so fast strokes stay continuous.
      let x0 = drag.last.x, y0 = drag.last.y;
      const dx = Math.abs(p.x - x0), dy = -Math.abs(p.y - y0), sx = x0 < p.x ? 1 : -1, sy = y0 < p.y ? 1 : -1;
      let err = dx + dy;
      for (;;) {
        g[y0][x0] = brush || "#";
        if (x0 === p.x && y0 === p.y) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
      }
      const next = gridToText(g);
      setInput("art", next); // one undo step per stroke: pushed on pointer down
      setDrag({ kind: "brush", last: p });
    }
  }

  function onUp() {
    if (!drag) return;
    if (drag.kind === "shape") {
      const moved = drag.start.x !== drag.cur.x || drag.start.y !== drag.cur.y;
      if (moved || tool === "erase") commit(view);
    } else if (drag.kind === "select") {
      const r = norm(drag.start, drag.cur);
      setSel(r.x0 === r.x1 && r.y0 === r.y1 ? null : { a: drag.start, b: drag.cur });
    } else if (drag.kind === "move") {
      const dx = drag.cur.x - drag.from.x, dy = drag.cur.y - drag.from.y;
      if (dx || dy) {
        commit(view);
        const r = norm(sel!.a, sel!.b);
        setSel({ a: { x: r.x0 + dx, y: r.y0 + dy }, b: { x: r.x1 + dx, y: r.y1 + dy } });
      }
    }
    setDrag(null);
  }

  /* ── keyboard ─────────────────────────────────────────────────────── */
  function onKey(e: React.KeyboardEvent<HTMLCanvasElement>) {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) doRedo();
      else doUndo();
      return;
    }
    if (mod && e.key.toLowerCase() === "y") {
      e.preventDefault();
      doRedo();
      return;
    }
    if (caret && tool === "text") {
      const g = cloneGrid(grid);
      if (e.key === "Escape") return setCaret(null);
      if (e.key === "Enter") {
        e.preventDefault();
        return setCaret({ p: { x: caret.startX, y: Math.min(H - 1, caret.p.y + 1) }, startX: caret.startX });
      }
      if (e.key === "Backspace") {
        e.preventDefault();
        const x = Math.max(0, caret.p.x - 1);
        g[caret.p.y][x] = " ";
        commit(g);
        return setCaret({ ...caret, p: { x, y: caret.p.y } });
      }
      const move: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (move[e.key]) {
        e.preventDefault();
        return setCaret({ ...caret, p: { x: clamp(caret.p.x + move[e.key][0], 0, W - 1), y: clamp(caret.p.y + move[e.key][1], 0, H - 1) } });
      }
      if (e.key.length === 1 && !mod) {
        e.preventDefault();
        writeText(g, caret.p, e.key);
        commit(g);
        return setCaret({ ...caret, p: { x: Math.min(W - 1, caret.p.x + 1), y: caret.p.y } });
      }
      return;
    }
    if (sel && (e.key === "Delete" || e.key === "Backspace")) {
      e.preventDefault();
      const g = cloneGrid(grid);
      eraseRect(g, sel.a, sel.b);
      commit(g);
      return;
    }
    if (sel && mod && (e.key === "c" || e.key === "x")) {
      e.preventDefault();
      const block = copyRect(grid, sel.a, sel.b);
      clip.current = block;
      navigator.clipboard?.writeText(gridToText(block)).catch(() => {});
      if (e.key === "x") {
        const g = cloneGrid(grid);
        eraseRect(g, sel.a, sel.b);
        commit(g);
      }
      say(e.key === "x" ? "Cut" : "Copied selection");
      return;
    }
    if (sel && e.key.startsWith("Arrow")) {
      e.preventDefault();
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]!;
      const r = norm(sel.a, sel.b);
      if (r.x0 + d[0] < 0 || r.y0 + d[1] < 0 || r.x1 + d[0] >= W || r.y1 + d[1] >= H) return;
      const block = copyRect(grid, sel.a, sel.b);
      const g = cloneGrid(grid);
      eraseRect(g, sel.a, sel.b);
      pasteBlock(g, block, { x: r.x0 + d[0], y: r.y0 + d[1] });
      commit(g);
      setSel({ a: { x: r.x0 + d[0], y: r.y0 + d[1] }, b: { x: r.x1 + d[0], y: r.y1 + d[1] } });
      return;
    }
    if (e.key === "Escape") {
      setSel(null);
      setDrag(null);
      return;
    }
    if (!mod && !e.altKey) {
      const t = TOOLS.find((t) => t.key.toLowerCase() === e.key.toLowerCase());
      if (t) {
        setTool(t.id);
        if (t.id !== "select") setSel(null);
      }
    }
  }

  function onPaste(e: React.ClipboardEvent<HTMLCanvasElement>) {
    const text = e.clipboardData.getData("text/plain");
    if (!text) return;
    e.preventDefault();
    const at = sel ? { x: norm(sel.a, sel.b).x0, y: norm(sel.a, sel.b).y0 } : caret?.p ?? hover ?? { x: 0, y: 0 };
    const { w, h } = textSize(text);
    const block = makeGrid(w, h, text);
    const g = cloneGrid(grid);
    pasteBlock(g, block, at);
    commit(g);
    setTool("select");
    setSel({ a: at, b: { x: Math.min(W - 1, at.x + w - 1), y: Math.min(H - 1, at.y + h - 1) } });
    say(`Pasted ${w}×${h}`);
  }

  /* ── actions ─────────────────────────────────────────────────────── */
  function setSize(w: number, h: number) {
    setInput("size", `${clamp(w || 80, 8, 400)}x${clamp(h || 24, 4, 200)}`);
  }
  function resize(w: number, h: number) {
    const nw = clamp(w || 8, 8, 400), nh = clamp(h || 4, 4, 200);
    if (nw < ext.w || nh < ext.h) {
      const g = makeGrid(nw, nh, art);
      commit(g);
    }
    setSize(nw, nh);
  }
  function copyAll() {
    const text = gridToText(grid);
    navigator.clipboard?.writeText(text).catch(() => {});
    record(text);
    say("Copied drawing");
  }
  function download() {
    const text = gridToText(grid);
    downloadBlob(new Blob([text + "\n"], { type: "text/plain;charset=utf-8" }), "drawing.txt");
    record(text);
  }
  function convert() {
    commit(convertCharset(grid, cs));
    say(`Converted to ${cs}`);
  }
  function clear() {
    commit(makeGrid(W, H));
    setSel(null);
    setCaret(null);
  }

  const toolInfo = TOOLS.find((t) => t.id === tool)!;
  const selR = sel ? norm(sel.a, sel.b) : null;

  return (
    <div className="h-ad">
      <style>{CSS}</style>
      <section className="g pane" aria-label="ASCII drawing">
        <div className="h-ad-bar" role="toolbar" aria-label="Drawing tools">
          <div className="h-ad-tools">
            {TOOLS.map((t) => (
              <button key={t.id} type="button" aria-pressed={tool === t.id} title={`${t.label} (${t.key}) — ${t.hint}`} onClick={() => { setTool(t.id); if (t.id !== "select") setSel(null); if (t.id !== "text") setCaret(null); cv.current?.focus(); }}>
                <span className="gl" aria-hidden>{t.glyph}</span>
                {t.label}
                <kbd>{t.key}</kbd>
              </button>
            ))}
          </div>
          {(tool === "brush" || tool === "fill") && (
            <label className="opt">
              <span className="lbl">Char</span>
              <input className="inp h-ad-brush" value={brush} maxLength={2} onChange={(e) => setBrush([...e.target.value].slice(-1).join("") || "")} aria-label="Brush character" />
            </label>
          )}
          <div style={{ flex: 1 }} />
          <button type="button" className="btn btn-sm" onClick={doUndo} disabled={!undo.current.length} title="Undo (⌘/Ctrl+Z)">
            <ToolIcon name="arrow-counter-clockwise" size={15} /> Undo
          </button>
          <button type="button" className="btn btn-sm" onClick={doRedo} disabled={!redo.current.length} title="Redo (⌘/Ctrl+Shift+Z)">
            <ToolIcon name="arrows-clockwise" size={15} /> Redo
          </button>
        </div>
        <div className="h-ad-bar" style={{ borderTop: "1px solid rgba(32,30,29,.08)", paddingTop: 6 }}>
          <label className="opt">
            <span className="lbl">Grid</span>
            <input className="inp h-ad-num" type="number" min={8} max={400} value={W} onChange={(e) => resize(+e.target.value, H)} aria-label="Columns" />
            ×
            <input className="inp h-ad-num" type="number" min={4} max={200} value={H} onChange={(e) => resize(W, +e.target.value)} aria-label="Rows" />
          </label>
          <div className="seg" role="group" aria-label="Zoom">
            <button type="button" onClick={() => setZoom((z) => Math.max(-2, z - 1))} title="Smaller">A−</button>
            <button type="button" onClick={() => setZoom((z) => Math.min(5, z + 1))} title="Larger">A+</button>
          </div>
          <span className="h-ad-sep" />
          <button type="button" className="btn btn-sm" onClick={convert} title={`Redraw every line in the "${cs}" style chosen under Lines`}>
            <ToolIcon name="shuffle" size={15} /> Convert to {cs}
          </button>
          <button type="button" className="btn btn-sm btn-danger" onClick={clear} title="Clear the canvas (undoable)">
            <ToolIcon name="trash" size={15} /> Clear
          </button>
          <div style={{ flex: 1 }} />
          {flash && <span className="h-ad-flash" role="status">{flash}</span>}
          <button type="button" className="btn btn-sm" onClick={copyAll}>
            <ToolIcon name="copy" size={15} /> Copy text
          </button>
          <button type="button" className="btn btn-sm" onClick={download}>
            <ToolIcon name="download-simple" size={15} /> .txt
          </button>
        </div>
        <div className="h-ad-stage scroll" style={{ borderTop: "1px solid rgba(32,30,29,.1)" }}>
          <canvas
            ref={cv}
            tabIndex={0}
            role="img"
            aria-label={`Drawing canvas, ${W} by ${H} cells. ${toolInfo.hint}`}
            className={tool === "select" ? "sel" : tool === "text" ? "txt" : undefined}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={() => setDrag(null)}
            onPointerLeave={() => setHover(null)}
            onKeyDown={onKey}
            onPaste={onPaste}
          />
        </div>
        <div className="h-ad-foot">
          <span className="mono">{hover ? `col ${hover.x + 1}, row ${hover.y + 1}` : `${W} × ${H}`}</span>
          {selR && <span className="mono">selection {selR.x1 - selR.x0 + 1} × {selR.y1 - selR.y0 + 1}</span>}
          <span style={{ flex: 1, minWidth: 200 }}>
            <b style={{ fontWeight: 500, color: "var(--color-neutral-800)" }}>{toolInfo.label}:</b> {toolInfo.hint}
          </span>
          <span className="mono">{art.split("\n").filter((l) => l.trim()).length} lines · {art.replace(/\s/g, "").length} glyphs</span>
        </div>
      </section>
    </div>
  );
}

/* ── glyph renderer: box-drawing characters are drawn as vectors so they always join ── */

function drawGlyph(ctx: CanvasRenderingContext2D, g: string, x: number, y: number, cw: number, ch: number) {
  const info = glyphInfo(g);
  const cx = Math.round(x + cw / 2) + 0.5, cy = Math.round(y + ch / 2) + 0.5;
  const x1 = x + cw, y1 = y + ch;
  if (info) {
    const { mask, kind } = info;
    ctx.strokeStyle = INK;
    ctx.lineWidth = kind === "heavy" ? 2.4 : 1.2;
    ctx.setLineDash(kind === "dashed" ? [3, 2] : []);
    if (kind === "double") {
      const d = 1.6;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const has = (b: number) => (mask & b) !== 0;
      if (has(R)) {
        ctx.moveTo(cx + (has(U) ? d : -d), cy - d); ctx.lineTo(x1, cy - d);
        ctx.moveTo(cx + (has(D) ? d : -d), cy + d); ctx.lineTo(x1, cy + d);
      }
      if (has(L)) {
        ctx.moveTo(cx - (has(U) ? d : -d), cy - d); ctx.lineTo(x, cy - d);
        ctx.moveTo(cx - (has(D) ? d : -d), cy + d); ctx.lineTo(x, cy + d);
      }
      if (has(D)) {
        ctx.moveTo(cx - d, cy + (has(L) ? d : -d)); ctx.lineTo(cx - d, y1);
        ctx.moveTo(cx + d, cy + (has(R) ? d : -d)); ctx.lineTo(cx + d, y1);
      }
      if (has(U)) {
        ctx.moveTo(cx - d, cy - (has(L) ? d : -d)); ctx.lineTo(cx - d, y);
        ctx.moveTo(cx + d, cy - (has(R) ? d : -d)); ctx.lineTo(cx + d, y);
      }
      ctx.stroke();
      return;
    }
    ctx.beginPath();
    const corner = kind === "rounded" && [R | D, L | D, U | R, U | L].includes(mask);
    if (corner) {
      const r = Math.min(cw, ch) / 2;
      const ex = mask & R ? x1 : x, ey = mask & D ? y1 : y;
      ctx.moveTo(ex, cy);
      ctx.arcTo(cx, cy, cx, ey, r);
      ctx.lineTo(cx, ey);
    } else {
      if (mask & (L | R)) {
        ctx.moveTo(mask & L ? x : cx, cy);
        ctx.lineTo(mask & R ? x1 : cx, cy);
      }
      if (mask & (U | D)) {
        ctx.moveTo(cx, mask & U ? y : cy);
        ctx.lineTo(cx, mask & D ? y1 : cy);
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);
    return;
  }
  const tri: Record<string, [number, number][]> = {
    "▶": [[0.2, 0.25], [0.85, 0.5], [0.2, 0.75]],
    "◀": [[0.8, 0.25], [0.15, 0.5], [0.8, 0.75]],
    "▲": [[0.15, 0.72], [0.5, 0.22], [0.85, 0.72]],
    "▼": [[0.15, 0.28], [0.5, 0.78], [0.85, 0.28]],
  };
  if (tri[g]) {
    ctx.fillStyle = INK;
    ctx.beginPath();
    tri[g].forEach(([px, py], i) => (i ? ctx.lineTo(x + px * cw, y + py * ch) : ctx.moveTo(x + px * cw, y + py * ch)));
    ctx.closePath();
    ctx.fill();
    return;
  }
  ctx.fillStyle = INK;
  ctx.fillText(g, x + cw / 2, y + ch / 2 + 1);
}
