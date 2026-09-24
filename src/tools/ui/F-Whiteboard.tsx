"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import ToolIcon from "@/src/components/ToolIcon";
import { downloadBlob } from "@/src/components/tool/OutputView";
import type { CustomProps } from "../types";
import {
  bounds,
  drawElement,
  FILLS,
  FONTS,
  hit,
  lineHeight,
  moveEl,
  normBox,
  parseScene,
  resizeEl,
  sceneBounds,
  sceneToSvg,
  simplify,
  STROKES,
  boxOf,
  type El,
  type Fill,
  type FontKind,
  type Scene,
} from "../lib/F-board";

type Tool = "select" | "hand" | "pen" | "line" | "arrow" | "rect" | "ellipse" | "diamond" | "text" | "eraser";
type Style = { stroke: string; fill: Fill; fillColor: string; sw: number; dash: boolean; rough: boolean; size: number; font: FontKind; opacity: number };
type View = { zoom: number; x: number; y: number };
type Box = { x: number; y: number; w: number; h: number };
type Drag =
  | { mode: "pan"; sx: number; sy: number; vx: number; vy: number }
  | { mode: "draw"; el: El; ox: number; oy: number }
  | { mode: "move"; ox: number; oy: number; orig: El[]; moved: boolean }
  | { mode: "resize"; handle: string; box: Box; orig: El[] }
  | { mode: "marquee"; ox: number; oy: number; x: number; y: number; add: boolean }
  | { mode: "erase"; ids: Set<string>; last: [number, number] }
  | { mode: "pinch"; d0: number; m0: [number, number]; v0: View };

const STORE = "formatter:F-whiteboard";
const HANDLE = 8;
const TOOLS: { id: Tool; key: string; label: string; icon: ReactNode }[] = [
  { id: "select", key: "V", label: "Select", icon: <path d="M5 3l14 8-6 1.5L10 19z" /> },
  { id: "hand", key: "H", label: "Pan", icon: <path d="M8 13V5.5a1.5 1.5 0 013 0V11m0-5.5V4a1.5 1.5 0 013 0v7m0-5a1.5 1.5 0 013 0v6.5a6.5 6.5 0 01-6.5 6.5h-.8A5.5 5.5 0 015.6 16L3.8 12a1.5 1.5 0 012.6-1.5L8 13" /> },
  { id: "rect", key: "R", label: "Rectangle", icon: <rect x="4" y="6" width="16" height="12" rx="1.5" /> },
  { id: "diamond", key: "D", label: "Diamond", icon: <path d="M12 3l9 9-9 9-9-9z" /> },
  { id: "ellipse", key: "O", label: "Ellipse", icon: <ellipse cx="12" cy="12" rx="9" ry="7" /> },
  { id: "arrow", key: "A", label: "Arrow", icon: <path d="M4 20L20 4m0 0h-8m8 0v8" /> },
  { id: "line", key: "L", label: "Line", icon: <path d="M4 20L20 4" /> },
  { id: "pen", key: "P", label: "Pen", icon: <path d="M3 17c3-6 5 3 8-3s4-7 7-3 2 6 3 5" /> },
  { id: "text", key: "T", label: "Text", icon: <path d="M5 6V4h14v2M12 4v16m-3 0h6" /> },
  { id: "eraser", key: "E", label: "Eraser", icon: <path d="M8 20h12M5 15l8-8 6 6-6 6H9z" /> },
];

let idSeq = 0;
const newId = () => `w${Date.now().toString(36)}${(idSeq++).toString(36)}`;
const newSeed = () => Math.floor(Math.random() * 2 ** 31);

function selBox(els: El[]): Box | null {
  if (!els.length) return null;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const e of els) {
    const b = bounds(e);
    x1 = Math.min(x1, b.x);
    y1 = Math.min(y1, b.y);
    x2 = Math.max(x2, b.x + b.w);
    y2 = Math.max(y2, b.y + b.h);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

function handlesOf(b: Box): [string, number, number][] {
  return [
    ["nw", b.x, b.y], ["n", b.x + b.w / 2, b.y], ["ne", b.x + b.w, b.y], ["e", b.x + b.w, b.y + b.h / 2],
    ["se", b.x + b.w, b.y + b.h], ["s", b.x + b.w / 2, b.y + b.h], ["sw", b.x, b.y + b.h], ["w", b.x, b.y + b.h / 2],
  ];
}

let measureCtx: CanvasRenderingContext2D | null = null;
function measureText(text: string, size: number, font: FontKind) {
  measureCtx ??= document.createElement("canvas").getContext("2d");
  const ctx = measureCtx!;
  ctx.font = `${size}px ${FONTS[font]}`;
  const lines = text.split("\n");
  return { w: Math.max(4, ...lines.map((l) => ctx.measureText(l).width)), h: lines.length * lineHeight(size) };
}

export default function Whiteboard({ inputs, opts, setInput, record }: CustomProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const cvs = useRef<HTMLCanvasElement>(null);
  const [els, setEls] = useState<El[]>([]);
  const [bg, setBg] = useState("#ffffff");
  const [tool, setTool] = useState<Tool>("select");
  const [lock, setLock] = useState(false);
  const [style, setStyle] = useState<Style>({ stroke: "#1e1e1e", fill: "none", fillColor: "#a5d8ff", sw: 2, dash: false, rough: true, size: 20, font: "hand", opacity: 1 });
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [view, setView] = useState<View>({ zoom: 1, x: 40, y: 40 });
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);
  const [draft, setDraft] = useState<El | null>(null);
  const [marquee, setMarquee] = useState<Box | null>(null);
  const [erasing, setErasing] = useState<Set<string>>(new Set());
  const [spaceDown, setSpaceDown] = useState(false);
  const [size, setSize] = useState({ w: 800, h: 560 });
  const [hint, setHint] = useState("");

  const st = useRef({ els, view, sel, tool, style, spaceDown, lock });
  st.current = { els, view, sel, tool, style, spaceDown, lock };
  const past = useRef<string[]>([]);
  const future = useRef<string[]>([]);
  const drag = useRef<Drag | null>(null);
  const pointers = useRef(new Map<number, [number, number]>());
  const written = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clip = useRef<El[]>([]);

  /* ── persistence ─────────────────────────────────────────────────── */

  const fit = useCallback((list: El[], w = size.w, h = size.h) => {
    if (!list.length) return setView({ zoom: 1, x: 40, y: 40 });
    const b = sceneBounds(list);
    const z = Math.min(1.5, Math.max(0.1, Math.min((w - 60) / Math.max(1, b.w), (h - 60) / Math.max(1, b.h))));
    setView({ zoom: z, x: (w - b.w * z) / 2 - b.x * z, y: (h - b.h * z) / 2 - b.y * z });
  }, [size.w, size.h]);

  const serialize = (list: El[], background = bg) => JSON.stringify({ v: 1, bg: background, elements: list });

  const persist = (list: El[], background = bg) => {
    const json = serialize(list, background);
    try {
      localStorage.setItem(STORE, json);
    } catch {
      /* storage full or blocked */
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      written.current = json;
      setInput("scene", json);
    }, 250);
  };

  /** Commit a new element list as one undoable step. */
  const commit = (list: El[], label = "") => {
    past.current.push(serialize(st.current.els));
    if (past.current.length > 200) past.current.shift();
    future.current = [];
    setEls(list);
    persist(list);
    if (label) setHint(label);
  };

  // Load from inputs (examples, history, workspaces) or from the autosave.
  useEffect(() => {
    const raw = inputs.scene ?? "";
    if (raw === written.current) return;
    written.current = raw;
    let scene: Scene;
    try {
      let src = raw;
      if (!src.trim()) {
        try {
          src = localStorage.getItem(STORE) ?? "";
        } catch {
          src = "";
        }
      }
      scene = parseScene(src);
    } catch (e) {
      setHint(`Could not read the scene: ${(e as Error).message}`);
      return;
    }
    past.current = [];
    future.current = [];
    setEls(scene.elements);
    setBg(scene.bg);
    setSel(new Set());
    setEditing(null);
    requestAnimationFrame(() => fit(scene.elements));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputs.scene]);

  /* ── sizing & drawing ────────────────────────────────────────────── */

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = cvs.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (c.width !== Math.round(size.w * dpr) || c.height !== Math.round(size.h * dpr)) {
      c.width = Math.round(size.w * dpr);
      c.height = Math.round(size.h * dpr);
    }
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = bg === "transparent" ? "#ffffff" : bg;
    ctx.fillRect(0, 0, size.w, size.h);
    // Dot grid
    const g = 24 * view.zoom;
    if (g > 7) {
      ctx.fillStyle = "rgba(32,30,29,.13)";
      const ox = ((view.x % g) + g) % g, oy = ((view.y % g) + g) % g;
      for (let x = ox; x < size.w; x += g) for (let y = oy; y < size.h; y += g) ctx.fillRect(x - 0.75, y - 0.75, 1.5, 1.5);
    }
    ctx.setTransform(dpr * view.zoom, 0, 0, dpr * view.zoom, dpr * view.x, dpr * view.y);
    for (const e of els) {
      if (editing?.id === e.id) continue;
      if (erasing.has(e.id)) {
        drawElement(ctx, { ...e, opacity: 0.2 });
        continue;
      }
      drawElement(ctx, e);
    }
    if (draft) drawElement(ctx, draft);
    // Selection
    const selected = els.filter((e) => sel.has(e.id));
    const lw = 1 / view.zoom;
    ctx.lineWidth = lw;
    ctx.strokeStyle = "#0088b0";
    ctx.setLineDash([]);
    for (const e of selected) {
      const b = bounds(e);
      ctx.strokeRect(b.x - 4 * lw, b.y - 4 * lw, b.w + 8 * lw, b.h + 8 * lw);
    }
    const sb = selBox(selected);
    if (sb && tool === "select" && !editing) {
      if (selected.length > 1) {
        ctx.setLineDash([4 * lw, 3 * lw]);
        ctx.strokeRect(sb.x - 8 * lw, sb.y - 8 * lw, sb.w + 16 * lw, sb.h + 16 * lw);
        ctx.setLineDash([]);
      }
      const pad = (selected.length > 1 ? 8 : 4) * lw;
      const hb = { x: sb.x - pad, y: sb.y - pad, w: sb.w + 2 * pad, h: sb.h + 2 * pad };
      ctx.fillStyle = "#fff";
      for (const [, hx, hy] of handlesOf(hb)) {
        ctx.fillRect(hx - (HANDLE / 2) * lw, hy - (HANDLE / 2) * lw, HANDLE * lw, HANDLE * lw);
        ctx.strokeRect(hx - (HANDLE / 2) * lw, hy - (HANDLE / 2) * lw, HANDLE * lw, HANDLE * lw);
      }
    }
    if (marquee) {
      ctx.fillStyle = "rgba(0,136,176,.08)";
      ctx.fillRect(marquee.x, marquee.y, marquee.w, marquee.h);
      ctx.strokeRect(marquee.x, marquee.y, marquee.w, marquee.h);
    }
  }, [els, view, size, sel, draft, marquee, erasing, editing, tool, bg]);

  /* ── coordinates & hit testing ───────────────────────────────────── */

  const toWorld = (clientX: number, clientY: number): [number, number] => {
    const r = cvs.current!.getBoundingClientRect();
    const v = st.current.view;
    return [(clientX - r.left - v.x) / v.zoom, (clientY - r.top - v.y) / v.zoom];
  };
  const topHit = (x: number, y: number) => {
    const list = st.current.els;
    const tol = 6 / st.current.view.zoom;
    for (let i = list.length - 1; i >= 0; i--) if (hit(list[i], x, y, tol)) return list[i];
    return null;
  };
  const handleAt = (x: number, y: number): [string, Box] | null => {
    const selected = st.current.els.filter((e) => st.current.sel.has(e.id));
    const sb = selBox(selected);
    if (!sb) return null;
    const lw = 1 / st.current.view.zoom;
    const pad = (selected.length > 1 ? 8 : 4) * lw;
    const hb = { x: sb.x - pad, y: sb.y - pad, w: sb.w + 2 * pad, h: sb.h + 2 * pad };
    for (const [name, hx, hy] of handlesOf(hb)) if (Math.abs(x - hx) <= HANDLE * lw && Math.abs(y - hy) <= HANDLE * lw) return [name, sb];
    return null;
  };

  const zoomAt = (factor: number, cx = size.w / 2, cy = size.h / 2) => {
    setView((v) => {
      const z = Math.min(8, Math.max(0.1, v.zoom * factor));
      const k = z / v.zoom;
      return { zoom: z, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
    });
  };

  /* ── style application ───────────────────────────────────────────── */

  const applyStyle = (patch: Partial<Style>) => {
    setStyle((s) => ({ ...s, ...patch }));
    const ids = st.current.sel;
    if (!ids.size) return;
    const list = st.current.els.map((e) => {
      if (!ids.has(e.id)) return e;
      const n: El = { ...e };
      if (patch.stroke !== undefined) n.stroke = patch.stroke;
      if (patch.fill !== undefined && !["pen", "line", "arrow", "text"].includes(e.type)) n.fill = patch.fill;
      if (patch.fillColor !== undefined) n.fillColor = patch.fillColor;
      if (patch.sw !== undefined) n.sw = patch.sw;
      if (patch.dash !== undefined) n.dash = patch.dash;
      if (patch.rough !== undefined) n.rough = patch.rough;
      if (patch.opacity !== undefined) n.opacity = patch.opacity;
      if (e.type === "text" && (patch.size !== undefined || patch.font !== undefined)) {
        n.size = patch.size ?? e.size;
        n.font = patch.font ?? e.font;
        const m = measureText(e.text ?? "", n.size ?? 20, n.font ?? "hand");
        if (e.align !== "center") n.w = m.w;
        n.h = m.h;
      }
      return n;
    });
    commit(list);
  };

  /* ── text editing ────────────────────────────────────────────────── */

  const startText = (x: number, y: number, into?: El) => {
    const s = st.current.style;
    const el: El = into
      ? { id: newId(), type: "text", x: bounds(into).x, y: bounds(into).y + bounds(into).h / 2 - lineHeight(s.size) / 2, w: bounds(into).w, h: lineHeight(s.size), text: "", size: s.size, font: s.font, align: "center", stroke: into.stroke, fill: "none", fillColor: s.fillColor, sw: 1, dash: false, rough: s.rough, seed: newSeed() }
      : { id: newId(), type: "text", x, y: y - lineHeight(s.size) / 2, w: 4, h: lineHeight(s.size), text: "", size: s.size, font: s.font, align: "left", stroke: s.stroke, fill: "none", fillColor: s.fillColor, sw: 1, dash: false, rough: s.rough, seed: newSeed(), opacity: s.opacity < 1 ? s.opacity : undefined };
    past.current.push(serialize(st.current.els));
    future.current = [];
    setEls([...st.current.els, el]);
    setSel(new Set([el.id]));
    setEditing({ id: el.id, value: "" });
  };

  const finishText = () => {
    const ed = editing;
    if (!ed) return;
    setEditing(null);
    const list = st.current.els;
    const el = list.find((e) => e.id === ed.id);
    if (!el) return;
    if (!ed.value.trim()) {
      const next = list.filter((e) => e.id !== ed.id);
      setEls(next);
      persist(next);
      setSel(new Set());
      return;
    }
    const m = measureText(ed.value, el.size ?? 20, el.font ?? "hand");
    const upd: El = { ...el, text: ed.value, w: el.align === "center" ? Math.max(el.w, m.w) : m.w, h: m.h };
    if (el.align === "center") {
      upd.y = el.y + (el.h - m.h) / 2;
      if (m.w > el.w) upd.x = el.x - (m.w - el.w) / 2;
    }
    const next = list.map((e) => (e.id === ed.id ? upd : e));
    setEls(next);
    persist(next);
    if (!st.current.lock) setTool("select");
  };

  /* ── pointer handlers ────────────────────────────────────────────── */

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (editing) {
      finishText();
      return;
    }
    wrap.current?.focus();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointers.current.size === 2) {
      // Pinch-zoom with two fingers; abandon any draft.
      const [a, b] = [...pointers.current.values()];
      setDraft(null);
      drag.current = { mode: "pinch", d0: Math.hypot(a[0] - b[0], a[1] - b[1]), m0: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], v0: st.current.view };
      return;
    }
    const [x, y] = toWorld(e.clientX, e.clientY);
    const t = st.current.tool;
    const s = st.current.style;
    if (st.current.spaceDown || t === "hand" || e.button === 1) {
      drag.current = { mode: "pan", sx: e.clientX, sy: e.clientY, vx: st.current.view.x, vy: st.current.view.y };
      return;
    }
    if (t === "select") {
      const h = handleAt(x, y);
      if (h) {
        drag.current = { mode: "resize", handle: h[0], box: h[1], orig: st.current.els.filter((el) => st.current.sel.has(el.id)) };
        return;
      }
      const target = topHit(x, y);
      if (target) {
        let next = st.current.sel;
        if (e.shiftKey) {
          next = new Set(next);
          if (next.has(target.id)) next.delete(target.id);
          else next.add(target.id);
        } else if (!next.has(target.id)) next = new Set([target.id]);
        setSel(next);
        drag.current = { mode: "move", ox: x, oy: y, orig: st.current.els.filter((el) => next.has(el.id)), moved: false };
      } else {
        if (!e.shiftKey) setSel(new Set());
        drag.current = { mode: "marquee", ox: x, oy: y, x, y, add: e.shiftKey };
      }
      return;
    }
    if (t === "eraser") {
      const target = topHit(x, y);
      const ids = new Set<string>(target ? [target.id] : []);
      setErasing(ids);
      drag.current = { mode: "erase", ids, last: [x, y] };
      return;
    }
    if (t === "text") {
      // Keep focus on the text box that is about to open.
      e.preventDefault();
      const target = topHit(x, y);
      if (target?.type === "text") {
        setSel(new Set([target.id]));
        setEditing({ id: target.id, value: target.text ?? "" });
      } else startText(x, y);
      return;
    }
    const base = { id: newId(), stroke: s.stroke, fill: s.fill, fillColor: s.fillColor, sw: s.sw, dash: s.dash, rough: s.rough, seed: newSeed(), opacity: s.opacity < 1 ? s.opacity : undefined };
    let el: El;
    if (t === "pen") el = { ...base, type: "pen", fill: "none", pts: [[x, y]], x, y, w: 0, h: 0 };
    else if (t === "line" || t === "arrow") el = { ...base, type: t, fill: "none", pts: [[x, y], [x, y]], x, y, w: 0, h: 0 };
    else el = { ...base, type: t, x, y, w: 0, h: 0 };
    setDraft(el);
    drag.current = { mode: "draw", el, ox: x, oy: y };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
    const d = drag.current;
    const c = cvs.current;
    if (!d) {
      // Cursor feedback
      if (!c) return;
      const t = st.current.tool;
      if (st.current.spaceDown || t === "hand") c.style.cursor = "grab";
      else if (t === "select") {
        const [x, y] = toWorld(e.clientX, e.clientY);
        const h = handleAt(x, y);
        c.style.cursor = h ? (/^(n|s)$/.test(h[0]) ? "ns-resize" : /^(e|w)$/.test(h[0]) ? "ew-resize" : /^(nw|se)$/.test(h[0]) ? "nwse-resize" : "nesw-resize") : topHit(x, y) ? "move" : "default";
      } else if (t === "text") c.style.cursor = "text";
      else c.style.cursor = "crosshair";
      return;
    }
    if (d.mode === "pinch") {
      if (pointers.current.size < 2) return;
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const r = c!.getBoundingClientRect();
      const z = Math.min(8, Math.max(0.1, d.v0.zoom * (dist / d.d0)));
      const k = z / d.v0.zoom;
      const cx = d.m0[0] - r.left, cy = d.m0[1] - r.top;
      setView({ zoom: z, x: cx - (cx - d.v0.x) * k + (mid[0] - d.m0[0]), y: cy - (cy - d.v0.y) * k + (mid[1] - d.m0[1]) });
      return;
    }
    if (d.mode === "pan") {
      setView((v) => ({ ...v, x: d.vx + e.clientX - d.sx, y: d.vy + e.clientY - d.sy }));
      if (c) c.style.cursor = "grabbing";
      return;
    }
    const [x, y] = toWorld(e.clientX, e.clientY);
    if (d.mode === "draw") {
      const el = { ...d.el };
      if (el.type === "pen") {
        const last = el.pts![el.pts!.length - 1];
        if (Math.hypot(x - last[0], y - last[1]) < 1 / st.current.view.zoom) return;
        el.pts = [...el.pts!, [x, y]];
        Object.assign(el, boxOf(el.pts));
      } else if (el.type === "line" || el.type === "arrow") {
        let [ex, ey] = [x, y];
        if (e.shiftKey) {
          const ang = Math.round(Math.atan2(y - d.oy, x - d.ox) / (Math.PI / 12)) * (Math.PI / 12);
          const len = Math.hypot(x - d.ox, y - d.oy);
          ex = d.ox + Math.cos(ang) * len;
          ey = d.oy + Math.sin(ang) * len;
        }
        el.pts = [[d.ox, d.oy], [ex, ey]];
        Object.assign(el, boxOf(el.pts));
      } else {
        let w = x - d.ox, h = y - d.oy;
        if (e.shiftKey) {
          const m = Math.max(Math.abs(w), Math.abs(h));
          w = Math.sign(w || 1) * m;
          h = Math.sign(h || 1) * m;
        }
        el.w = w;
        el.h = h;
      }
      d.el = el;
      setDraft(el);
      return;
    }
    if (d.mode === "move") {
      let dx = x - d.ox, dy = y - d.oy;
      if (e.shiftKey) Math.abs(dx) > Math.abs(dy) ? (dy = 0) : (dx = 0);
      if (!d.moved && Math.hypot(dx, dy) * st.current.view.zoom < 2) return;
      d.moved = true;
      const moved = new Map(d.orig.map((o) => [o.id, moveEl(o, dx, dy)]));
      setEls((list) => list.map((el) => moved.get(el.id) ?? el));
      return;
    }
    if (d.mode === "resize") {
      const b = d.box;
      let x1 = b.x, y1 = b.y, x2 = b.x + b.w, y2 = b.y + b.h;
      if (d.handle.includes("w")) x1 = x;
      if (d.handle.includes("e")) x2 = x;
      if (d.handle.includes("n")) y1 = y;
      if (d.handle.includes("s")) y2 = y;
      if (e.shiftKey && b.w && b.h && d.handle.length === 2) {
        const k = Math.max(Math.abs(x2 - x1) / b.w, Math.abs(y2 - y1) / b.h);
        if (d.handle.includes("w")) x1 = x2 - b.w * k;
        else x2 = x1 + b.w * k;
        if (d.handle.includes("n")) y1 = y2 - b.h * k;
        else y2 = y1 + b.h * k;
      }
      const to = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
      const resized = new Map(d.orig.map((o) => [o.id, resizeEl(o, b, to)]));
      setEls((list) => list.map((el) => resized.get(el.id) ?? el));
      return;
    }
    if (d.mode === "marquee") {
      d.x = x;
      d.y = y;
      setMarquee({ x: Math.min(d.ox, x), y: Math.min(d.oy, y), w: Math.abs(x - d.ox), h: Math.abs(y - d.oy) });
      return;
    }
    if (d.mode === "erase") {
      // Sample the segment since the last event so fast strokes do not skip elements.
      const [lx, ly] = d.last;
      const steps = Math.max(1, Math.ceil((Math.hypot(x - lx, y - ly) * st.current.view.zoom) / 3));
      let added = false;
      for (let i = 1; i <= steps; i++) {
        const target = topHit(lx + ((x - lx) * i) / steps, ly + ((y - ly) * i) / steps);
        if (target && !d.ids.has(target.id)) {
          d.ids.add(target.id);
          added = true;
        }
      }
      d.last = [x, y];
      if (added) setErasing(new Set(d.ids));
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(e.pointerId);
    const d = drag.current;
    if (d?.mode === "pinch") {
      if (pointers.current.size === 0) drag.current = null;
      return;
    }
    drag.current = null;
    if (!d) return;
    if (d.mode === "draw") {
      setDraft(null);
      let el = d.el;
      const b = bounds(el);
      const tiny = el.type === "pen" ? false : Math.max(b.w, b.h) * st.current.view.zoom < 4;
      if (tiny) return;
      if (el.pts && el.type === "pen") {
        el = { ...el, pts: simplify(el.pts, 1.2 / st.current.view.zoom) };
        Object.assign(el, boxOf(el.pts!));
      }
      el = normBox(el);
      commit([...st.current.els, el]);
      if (el.type !== "pen" && !st.current.lock) {
        setTool("select");
        setSel(new Set([el.id]));
      }
      return;
    }
    if (d.mode === "move") {
      if (!d.moved) return;
      past.current.push(serialize(st.current.els.map((el) => d.orig.find((o) => o.id === el.id) ?? el)));
      future.current = [];
      persist(st.current.els);
      return;
    }
    if (d.mode === "resize") {
      const list = st.current.els.map(normBox);
      past.current.push(serialize(st.current.els.map((el) => d.orig.find((o) => o.id === el.id) ?? el)));
      future.current = [];
      setEls(list);
      persist(list);
      return;
    }
    if (d.mode === "marquee") {
      setMarquee(null);
      const m = { x: Math.min(d.ox, d.x), y: Math.min(d.oy, d.y), w: Math.abs(d.x - d.ox), h: Math.abs(d.y - d.oy) };
      if (m.w < 2 && m.h < 2) return;
      const inside = st.current.els.filter((el) => {
        const b = bounds(el);
        return b.x >= m.x && b.y >= m.y && b.x + b.w <= m.x + m.w && b.y + b.h <= m.y + m.h;
      });
      setSel(new Set([...(d.add ? st.current.sel : []), ...inside.map((el) => el.id)]));
      return;
    }
    if (d.mode === "erase") {
      setErasing(new Set());
      if (d.ids.size) commit(st.current.els.filter((el) => !d.ids.has(el.id)), `Erased ${d.ids.size}`);
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const [x, y] = toWorld(e.clientX, e.clientY);
    const target = topHit(x, y);
    if (target?.type === "text") {
      setSel(new Set([target.id]));
      setEditing({ id: target.id, value: target.text ?? "" });
    } else if (target && ["rect", "ellipse", "diamond"].includes(target.type)) startText(x, y, target);
    else if (!target && st.current.tool === "select") startText(x, y);
  };

  const onWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const r = cvs.current!.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) {
      const f = Math.exp(-e.deltaY * 0.0022);
      const cx = e.clientX - r.left, cy = e.clientY - r.top;
      setView((v) => {
        const z = Math.min(8, Math.max(0.1, v.zoom * f));
        const k = z / v.zoom;
        return { zoom: z, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
      });
    } else setView((v) => ({ ...v, x: v.x - (e.shiftKey ? e.deltaY : e.deltaX), y: v.y - (e.shiftKey ? 0 : e.deltaY) }));
  }, []);

  useEffect(() => {
    const c = cvs.current;
    if (!c) return;
    c.addEventListener("wheel", onWheel, { passive: false });
    return () => c.removeEventListener("wheel", onWheel);
  }, [onWheel]);

  /* ── commands ────────────────────────────────────────────────────── */

  const undo = () => {
    const prev = past.current.pop();
    if (prev === undefined) return;
    future.current.push(serialize(st.current.els));
    const list = parseScene(prev).elements;
    setEls(list);
    setSel(new Set());
    persist(list);
  };
  const redo = () => {
    const next = future.current.pop();
    if (next === undefined) return;
    past.current.push(serialize(st.current.els));
    const list = parseScene(next).elements;
    setEls(list);
    persist(list);
  };
  const del = () => {
    if (!st.current.sel.size) return;
    commit(st.current.els.filter((e) => !st.current.sel.has(e.id)), `Deleted ${st.current.sel.size}`);
    setSel(new Set());
  };
  const duplicate = (list = st.current.els.filter((e) => st.current.sel.has(e.id)), offset = 16) => {
    if (!list.length) return;
    const copies = list.map((e) => ({ ...moveEl(e, offset, offset), id: newId(), seed: newSeed() }));
    commit([...st.current.els, ...copies], `Duplicated ${copies.length}`);
    setSel(new Set(copies.map((c) => c.id)));
  };
  const reorder = (front: boolean) => {
    const ids = st.current.sel;
    if (!ids.size) return;
    const chosen = st.current.els.filter((e) => ids.has(e.id));
    const rest = st.current.els.filter((e) => !ids.has(e.id));
    commit(front ? [...rest, ...chosen] : [...chosen, ...rest]);
  };
  const nudge = (dx: number, dy: number) => {
    const ids = st.current.sel;
    if (!ids.size) return;
    commit(st.current.els.map((e) => (ids.has(e.id) ? moveEl(e, dx, dy) : e)));
  };
  const clearAll = () => {
    if (!st.current.els.length) return;
    if (!window.confirm("Clear the whole board? You can undo this.")) return;
    commit([], "Cleared");
    setSel(new Set());
  };

  const exportSvg = () => {
    const svg = sceneToSvg({ v: 1, elements: st.current.els, bg }, { background: !opts.transparent });
    downloadBlob(new Blob([svg], { type: "image/svg+xml" }), "whiteboard.svg");
    record(`Exported SVG · ${st.current.els.length} elements`);
  };
  const exportPng = () => {
    const list = st.current.els;
    if (!list.length) return;
    const b = sceneBounds(list);
    const pad = 24, scale = 2;
    const c = document.createElement("canvas");
    c.width = Math.ceil((b.w + pad * 2) * scale);
    c.height = Math.ceil((b.h + pad * 2) * scale);
    const ctx = c.getContext("2d")!;
    if (!opts.transparent && bg !== "transparent") {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, c.width, c.height);
    }
    ctx.setTransform(scale, 0, 0, scale, (pad - b.x) * scale, (pad - b.y) * scale);
    for (const e of list) drawElement(ctx, e);
    c.toBlob((blob) => blob && downloadBlob(blob, "whiteboard.png"), "image/png");
    record(`Exported PNG · ${list.length} elements`);
  };
  const exportJson = () => downloadBlob(new Blob([serialize(st.current.els)], { type: "application/json" }), "whiteboard.json");
  const importJson = async (f: File | undefined) => {
    if (!f) return;
    try {
      const scene = parseScene(await f.text());
      commit(scene.elements, `Imported ${scene.elements.length} elements`);
      setBg(scene.bg);
      fit(scene.elements);
    } catch (e) {
      setHint(`Import failed: ${(e as Error).message}`);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (editing) return;
    const tgt = e.target as HTMLElement;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(tgt.tagName) || tgt.isContentEditable) return;
    if (tgt.tagName === "BUTTON" && (e.key === " " || e.key === "Enter")) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (e.key === " ") {
      e.preventDefault();
      setSpaceDown(true);
      return;
    }
    if (mod && k === "z") {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if (mod && k === "y") {
      e.preventDefault();
      redo();
      return;
    }
    if (mod && k === "d") {
      e.preventDefault();
      duplicate();
      return;
    }
    if (mod && k === "a") {
      e.preventDefault();
      setTool("select");
      setSel(new Set(st.current.els.map((el) => el.id)));
      return;
    }
    if (mod && k === "c") {
      clip.current = st.current.els.filter((el) => st.current.sel.has(el.id));
      return;
    }
    if (mod && k === "v") {
      if (clip.current.length) duplicate(clip.current, 24);
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      del();
      return;
    }
    if (e.key === "Escape") {
      setSel(new Set());
      setTool("select");
      return;
    }
    if (e.key.startsWith("Arrow")) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      nudge(e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0, e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0);
      return;
    }
    if (!mod && (e.key === "+" || e.key === "=")) return zoomAt(1.2);
    if (!mod && e.key === "-") return zoomAt(1 / 1.2);
    if (!mod && e.key === "0") return setView((v) => ({ zoom: 1, x: v.x, y: v.y }));
    if (!mod && e.shiftKey && k === "1") return fit(st.current.els);
    if (mod || e.altKey) return;
    const t = TOOLS.find((x) => x.key.toLowerCase() === k);
    if (t) {
      setTool(t.id);
      if (t.id !== "select") setSel(new Set());
    }
  };

  const selected = els.filter((e) => sel.has(e.id));
  const shown = selected[0] ?? null;
  const cur: Style = shown
    ? { stroke: shown.stroke, fill: shown.fill, fillColor: shown.fillColor, sw: shown.sw, dash: shown.dash, rough: shown.rough, size: shown.size ?? style.size, font: shown.font ?? style.font, opacity: shown.opacity ?? 1 }
    : style;
  const showText = shown ? selected.some((e) => e.type === "text") : tool === "text";
  const showFill = shown ? selected.some((e) => ["rect", "ellipse", "diamond"].includes(e.type)) : ["rect", "ellipse", "diamond"].includes(tool);

  const editEl = editing ? els.find((e) => e.id === editing.id) : null;

  return (
    <div className="fwb" onKeyDown={onKeyDown} onKeyUp={(e) => e.key === " " && setSpaceDown(false)}>
      <style>{CSS}</style>
      <div className="fwb-bar g2">
        <div className="fwb-tools" role="toolbar" aria-label="Drawing tools">
          {TOOLS.map((t) => (
            <button key={t.id} type="button" className="fwb-tool" aria-pressed={tool === t.id} title={`${t.label} (${t.key})`} aria-label={t.label} onClick={() => { setTool(t.id); if (t.id !== "select") setSel(new Set()); }}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{t.icon}</svg>
              <kbd>{t.key}</kbd>
            </button>
          ))}
          <button type="button" className="fwb-tool" aria-pressed={lock} title="Keep the tool after drawing" aria-label="Lock tool" onClick={() => setLock(!lock)}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="5" y="11" width="14" height="9" rx="2" /><path d={lock ? "M8 11V8a4 4 0 018 0v3" : "M8 11V8a4 4 0 017.5-2"} /></svg>
          </button>
        </div>
        <div className="fwb-actions">
          <button type="button" className="btn-icon" onClick={undo} disabled={!past.current.length} title="Undo (Ctrl+Z)" aria-label="Undo"><ToolIcon name="arrow-counter-clockwise" size={17} /></button>
          <button type="button" className="btn-icon" onClick={redo} disabled={!future.current.length} title="Redo (Ctrl+Shift+Z)" aria-label="Redo"><ToolIcon name="arrow-counter-clockwise" size={17} className="fwb-flip" /></button>
          <span className="fwb-sep" />
          <button type="button" className="btn-icon" onClick={() => zoomAt(1 / 1.2)} aria-label="Zoom out">−</button>
          <button type="button" className="btn-icon mono" style={{ fontSize: 12, minWidth: 46, justifyContent: "center" }} onClick={() => setView((v) => ({ ...v, zoom: 1 }))} title="Reset zoom (0)">{Math.round(view.zoom * 100)}%</button>
          <button type="button" className="btn-icon" onClick={() => zoomAt(1.2)} aria-label="Zoom in">+</button>
          <button type="button" className="btn-icon" onClick={() => fit(els)} title="Zoom to fit (Shift+1)">Fit</button>
          <span className="fwb-sep" />
          <button type="button" className="btn btn-sm" onClick={exportPng} disabled={!els.length}><ToolIcon name="download-simple" size={14} /> PNG</button>
          <button type="button" className="btn btn-sm" onClick={exportSvg} disabled={!els.length}><ToolIcon name="download-simple" size={14} /> SVG</button>
          <details className="fwb-more">
            <summary className="btn btn-sm" aria-label="More">⋯</summary>
            <div className="menu" style={{ right: 0, top: 36 }}>
              <button type="button" onClick={exportJson}>Export scene (.json)</button>
              <label style={{ display: "flex", padding: "7px 9px", cursor: "pointer", fontSize: 14 }}>
                Import scene (.json)…
                <input type="file" accept=".json,application/json" hidden onChange={(e) => { void importJson(e.target.files?.[0]); e.target.value = ""; }} />
              </label>
              <button type="button" onClick={() => { setBg(bg === "#ffffff" ? "#fdf8ef" : bg === "#fdf8ef" ? "#1e1e24" : "#ffffff"); persist(els, bg === "#ffffff" ? "#fdf8ef" : bg === "#fdf8ef" ? "#1e1e24" : "#ffffff"); }}>Background: {bg === "#ffffff" ? "white" : bg === "#fdf8ef" ? "paper" : "dark"} → next</button>
              <button type="button" onClick={clearAll} style={{ color: "var(--color-accent-2-700)" }}>Clear board</button>
            </div>
          </details>
        </div>
      </div>

      <div className="fwb-main">
        <aside className="fwb-panel g2" aria-label="Style">
          <div className="lbl">Stroke</div>
          <div className="fwb-swatches">
            {STROKES.map((c) => (
              <button key={c} type="button" className="fwb-sw" style={{ background: c }} aria-pressed={cur.stroke === c} aria-label={`Stroke ${c}`} onClick={() => applyStyle({ stroke: c })} />
            ))}
            <label className="fwb-sw fwb-custom" title="Custom colour"><input type="color" value={cur.stroke} onChange={(e) => applyStyle({ stroke: e.target.value })} aria-label="Custom stroke colour" /></label>
          </div>
          {showFill && (
            <>
              <div className="lbl">Fill</div>
              <div className="seg fwb-seg">
                {(["none", "hatch", "solid"] as Fill[]).map((f) => (
                  <button key={f} type="button" aria-pressed={cur.fill === f} onClick={() => applyStyle({ fill: f })}>{f === "none" ? "None" : f === "hatch" ? "Hatch" : "Solid"}</button>
                ))}
              </div>
              {cur.fill !== "none" && (
                <div className="fwb-swatches">
                  {FILLS.map((c) => (
                    <button key={c} type="button" className="fwb-sw" style={{ background: c }} aria-pressed={cur.fillColor === c} aria-label={`Fill ${c}`} onClick={() => applyStyle({ fillColor: c })} />
                  ))}
                </div>
              )}
            </>
          )}
          <div className="lbl">Stroke width</div>
          <div className="seg fwb-seg">
            {[1, 2, 4].map((w) => (
              <button key={w} type="button" aria-pressed={cur.sw === w} onClick={() => applyStyle({ sw: w })} aria-label={`Width ${w}`}>
                <span style={{ display: "inline-block", width: 22, height: w + 0.5, background: "currentColor", borderRadius: 2, verticalAlign: "middle" }} />
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <label className="tog"><input type="checkbox" checked={cur.dash} onChange={(e) => applyStyle({ dash: e.target.checked })} /> Dashed</label>
            <label className="tog"><input type="checkbox" checked={cur.rough} onChange={(e) => applyStyle({ rough: e.target.checked })} /> Hand-drawn</label>
          </div>
          {showText && (
            <>
              <div className="lbl">Text</div>
              <div className="seg fwb-seg">
                {[[16, "S"], [20, "M"], [28, "L"], [40, "XL"]].map(([s, l]) => (
                  <button key={s} type="button" aria-pressed={cur.size === s} onClick={() => applyStyle({ size: s as number })}>{l}</button>
                ))}
              </div>
              <div className="seg fwb-seg">
                {(["hand", "sans", "mono"] as FontKind[]).map((f) => (
                  <button key={f} type="button" aria-pressed={cur.font === f} onClick={() => applyStyle({ font: f })} style={{ fontFamily: FONTS[f] }}>{f === "hand" ? "Hand" : f === "sans" ? "Sans" : "Mono"}</button>
                ))}
              </div>
            </>
          )}
          <div className="lbl">Opacity</div>
          <input type="range" min={10} max={100} step={5} value={Math.round(cur.opacity * 100)} onChange={(e) => applyStyle({ opacity: Number(e.target.value) / 100 })} style={{ width: "100%", accentColor: "var(--color-accent-700)" }} aria-label="Opacity" />
          {selected.length > 0 && (
            <>
              <div className="lbl">Selection ({selected.length})</div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                <button type="button" className="btn btn-sm" onClick={() => reorder(true)} title="Bring to front">Front</button>
                <button type="button" className="btn btn-sm" onClick={() => reorder(false)} title="Send to back">Back</button>
                <button type="button" className="btn btn-sm" onClick={() => duplicate()} title="Duplicate (Ctrl+D)">Duplicate</button>
                <button type="button" className="btn btn-sm btn-danger" onClick={del} title="Delete (Del)">Delete</button>
              </div>
            </>
          )}
        </aside>

        <div
          ref={wrap}
          className="fwb-stage"
          tabIndex={0}
          onBlur={() => setSpaceDown(false)}
          aria-label="Whiteboard canvas. Use the toolbar or keyboard shortcuts to draw."
        >
          <canvas
            ref={cvs}
            style={{ width: size.w, height: size.h, touchAction: "none", display: "block" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onDoubleClick={onDoubleClick}
            data-testid="whiteboard-canvas"
          />
          {editEl && editing && (
            <textarea
              autoFocus
              ref={(n) => {
                if (n && document.activeElement !== n) requestAnimationFrame(() => n.focus());
              }}
              className="fwb-text"
              value={editing.value}
              onChange={(e) => setEditing({ ...editing, value: e.target.value })}
              onBlur={finishText}
              onKeyDown={(e) => {
                if (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) {
                  e.preventDefault();
                  finishText();
                }
                e.stopPropagation();
              }}
              style={{
                left: view.x + editEl.x * view.zoom,
                top: view.y + editEl.y * view.zoom,
                width: Math.max(editEl.align === "center" ? editEl.w * view.zoom : 40, (measureText(editing.value || "M", editEl.size ?? 20, editEl.font ?? "hand").w + 24) * view.zoom),
                height: (editing.value.split("\n").length * lineHeight(editEl.size ?? 20) + 6) * view.zoom,
                fontSize: (editEl.size ?? 20) * view.zoom,
                lineHeight: `${lineHeight(editEl.size ?? 20) * view.zoom}px`,
                fontFamily: FONTS[editEl.font ?? "hand"],
                color: editEl.stroke,
                textAlign: editEl.align === "center" ? "center" : "left",
              }}
              aria-label="Text"
              placeholder="Type…"
            />
          )}
          {!els.length && !draft && (
            <div className="fwb-empty">
              <b>Draw something</b>
              <span>Pick a tool above — R rectangle, O ellipse, A arrow, P pen, T text. Double-click to write.</span>
            </div>
          )}
          <div className="fwb-status mono">
            {els.length} element{els.length === 1 ? "" : "s"}
            {hint ? ` · ${hint}` : ""} · autosaved locally
          </div>
        </div>
      </div>
    </div>
  );
}

const CSS = `
.fwb{display:grid;gap:10px}
.fwb-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;padding:6px 8px;border-radius:var(--radius-lg)}
.fwb-tools{display:flex;flex-wrap:wrap;gap:2px}
.fwb-tool{position:relative;display:inline-grid;place-items:center;width:38px;height:36px;border:1px solid transparent;border-radius:6px;background:none;cursor:pointer;color:var(--color-neutral-800)}
.fwb-tool:hover{background:rgba(0,136,176,.07)}
.fwb-tool[aria-pressed="true"]{background:var(--color-accent-100);border-color:var(--color-accent-300);color:var(--color-accent-900)}
.fwb-tool kbd{position:absolute;right:2px;bottom:0;font-size:8.5px;font-family:var(--font-mono);color:var(--color-neutral-500)}
.fwb-actions{display:flex;align-items:center;gap:4px;flex-wrap:wrap}
.fwb-sep{width:1px;height:20px;background:rgba(32,30,29,.14);margin:0 4px}
.fwb-flip{transform:scaleX(-1)}
.fwb-more{position:relative}
.fwb-more summary{list-style:none}
.fwb-more summary::-webkit-details-marker{display:none}
.fwb-main{display:grid;grid-template-columns:200px minmax(0,1fr);gap:10px;align-items:start}
.fwb-panel{display:grid;gap:8px;padding:12px;border-radius:var(--radius-lg);align-content:start}
.fwb-panel .lbl{font-size:10.5px;margin-top:4px}
.fwb-swatches{display:flex;flex-wrap:wrap;gap:5px}
.fwb-sw{width:22px;height:22px;border-radius:5px;border:1px solid rgba(0,0,0,.15);cursor:pointer;padding:0;position:relative}
.fwb-sw[aria-pressed="true"]{outline:2px solid var(--color-accent-600);outline-offset:1px}
.fwb-custom{background:conic-gradient(red,yellow,lime,cyan,blue,magenta,red);overflow:hidden}
.fwb-custom input{opacity:0;position:absolute;inset:0;width:100%;height:100%;cursor:pointer}
.fwb-seg{display:flex}
.fwb-seg button{flex:1;padding:5px 6px;font-size:12.5px}
.fwb-stage{position:relative;height:min(68vh,620px);min-height:380px;border-radius:var(--radius-lg);overflow:hidden;border:1px solid rgba(32,30,29,.12);outline:none;background:#fff}
.fwb-stage:focus-visible{box-shadow:0 0 0 2px var(--color-accent-300)}
.fwb-text{position:absolute;border:1px dashed var(--color-accent-500);background:rgba(255,255,255,.85);padding:0 2px;margin:0;resize:none;outline:none;overflow:hidden;white-space:pre;z-index:3;box-sizing:content-box}
.fwb-empty{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;pointer-events:none;color:var(--color-neutral-600);text-align:center;padding:20px}
.fwb-empty b{font-size:20px;font-weight:500;color:var(--color-neutral-700)}
.fwb-empty span{font-size:14px;max-width:360px}
.fwb-status{position:absolute;left:10px;bottom:8px;font-size:11px;color:var(--color-neutral-500);pointer-events:none;background:rgba(255,255,255,.7);padding:1px 6px;border-radius:4px}
@media (max-width:760px){
  .fwb-main{grid-template-columns:minmax(0,1fr)}
  .fwb-panel{order:2;grid-template-columns:repeat(auto-fill,minmax(150px,1fr))}
  .fwb-stage{height:62vh}
  .fwb-tool{width:34px}
}
`;
