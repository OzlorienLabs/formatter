/**
 * A Graphviz DOT parser (graph / digraph / strict, node / edge / attr
 * statements, edge chains, `{a b} -> c` groups, subgraphs and clusters, ports,
 * quoted / HTML / numeric IDs, `+` string concatenation, comments) and a
 * translator to a Mermaid flowchart.
 */
import { ToolError } from "../types";

type Attrs = Record<string, string>;

export type DotNode = { id: string; attrs: Attrs; sub: string | null; order: number };
export type DotEdge = { from: string; to: string; attrs: Attrs; sub: string | null };
export type DotSub = { id: string; attrs: Attrs; parent: string | null; nodes: string[]; anonymous: boolean };
export type DotGraph = {
  strict: boolean;
  directed: boolean;
  id: string;
  attrs: Attrs;
  nodes: Map<string, DotNode>;
  edges: DotEdge[];
  subs: Map<string, DotSub>;
  extraGraphs: number;
};

type Tok = { t: "id" | "html" | "str" | "punct" | "edgeop" | "eof"; v: string; line: number; col: number };

function lex(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0, line = 1, col = 1;
  const n = src.length;
  const adv = (k = 1) => {
    for (let j = 0; j < k; j++) {
      if (src[i] === "\n") { line++; col = 1; } else col++;
      i++;
    }
  };
  while (i < n) {
    const c = src[i];
    if (c === "\n" || c === " " || c === "\t" || c === "\r" || c === "﻿") { adv(); continue; }
    if (c === "/" && src[i + 1] === "/") { while (i < n && src[i] !== "\n") adv(); continue; }
    if (c === "#" && (col === 1 || /^\s*$/.test(src.slice(src.lastIndexOf("\n", i - 1) + 1, i)))) { while (i < n && src[i] !== "\n") adv(); continue; }
    if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      if (end < 0) throw new ToolError(`Unterminated /* comment at line ${line}, column ${col}`);
      adv(end + 2 - i);
      continue;
    }
    const L = line, C = col;
    if (c === "-" && (src[i + 1] === ">" || src[i + 1] === "-")) {
      toks.push({ t: "edgeop", v: src.slice(i, i + 2), line: L, col: C });
      adv(2);
      continue;
    }
    if ("{}[]=;,:".includes(c)) { toks.push({ t: "punct", v: c, line: L, col: C }); adv(); continue; }
    if (c === '"') {
      adv();
      let s = "";
      while (i < n && src[i] !== '"') {
        if (src[i] === "\\" && src[i + 1] === '"') { s += '"'; adv(2); continue; }
        if (src[i] === "\\" && src[i + 1] === "\n") { adv(2); continue; }
        if (src[i] === "\\" && src[i + 1] === "\r" && src[i + 2] === "\n") { adv(3); continue; }
        s += src[i];
        adv();
      }
      if (i >= n) throw new ToolError(`Unterminated string starting at line ${L}, column ${C}`);
      adv();
      toks.push({ t: "str", v: s, line: L, col: C });
      continue;
    }
    if (c === "<") {
      let depth = 0, j = i;
      for (; j < n; j++) {
        if (src[j] === "<") depth++;
        else if (src[j] === ">" && --depth === 0) break;
      }
      if (j >= n) throw new ToolError(`Unterminated HTML label starting at line ${L}, column ${C}`);
      const v = src.slice(i + 1, j);
      adv(j + 1 - i);
      toks.push({ t: "html", v, line: L, col: C });
      continue;
    }
    if (c === "+") {
      // string concatenation: "a" + "b"
      toks.push({ t: "punct", v: "+", line: L, col: C });
      adv();
      continue;
    }
    const m = /^(?:[A-Za-z_\u0080-￿][A-Za-z0-9_\u0080-￿]*|-?(?:\.\d+|\d+(?:\.\d*)?))/.exec(src.slice(i, i + 256));
    if (m) {
      toks.push({ t: "id", v: m[0], line: L, col: C });
      adv(m[0].length);
      continue;
    }
    throw new ToolError(`Unexpected character ${JSON.stringify(c)} at line ${L}, column ${C}`);
  }
  toks.push({ t: "eof", v: "", line, col });
  return toks;
}

const KW = new Set(["graph", "digraph", "subgraph", "node", "edge", "strict"]);

export function parseDot(src: string): DotGraph {
  const toks = lex(src);
  let p = 0;
  const peek = (k = 0) => toks[Math.min(p + k, toks.length - 1)];
  const next = () => toks[p++];
  const err = (msg: string, t = peek()): never => {
    throw new ToolError(`${msg} at line ${t.line}, column ${t.col}${t.t === "eof" ? " (end of input)" : ` near ${JSON.stringify(t.v)}`}`);
  };
  const isKw = (t: Tok, k: string) => t.t === "id" && t.v.toLowerCase() === k;
  const isId = (t: Tok) => t.t === "str" || t.t === "html" || (t.t === "id" && !KW.has(t.v.toLowerCase()));
  const expect = (v: string) => {
    const t = peek();
    if (t.t === "punct" && t.v === v) return next();
    return err(`Expected '${v}'`);
  };
  const readId = (): string => {
    const t = peek();
    if (!isId(t)) err("Expected an identifier");
    next();
    let v = t.v;
    if (t.t === "str") while (peek().t === "punct" && peek().v === "+" && peek(1).t === "str") { next(); v += next().v; }
    return t.t === "html" ? `<${v}>` : v;
  };

  const g: DotGraph = { strict: false, directed: true, id: "", attrs: {}, nodes: new Map(), edges: [], subs: new Map(), extraGraphs: 0 };
  let order = 0;
  let anon = 0;

  if (isKw(peek(), "strict")) { next(); g.strict = true; }
  if (isKw(peek(), "digraph")) g.directed = true;
  else if (isKw(peek(), "graph")) g.directed = false;
  else err("A DOT file starts with 'graph' or 'digraph'");
  next();
  if (isId(peek())) g.id = readId();
  expect("{");

  const readAttrList = (): Attrs => {
    const a: Attrs = {};
    while (peek().t === "punct" && peek().v === "[") {
      next();
      while (!(peek().t === "punct" && peek().v === "]")) {
        if (peek().t === "eof") err("Unclosed attribute list '['");
        const k = readId();
        let v = "true";
        if (peek().t === "punct" && peek().v === "=") { next(); v = readId(); }
        a[k] = v;
        if (peek().t === "punct" && (peek().v === "," || peek().v === ";")) next();
      }
      next();
    }
    return a;
  };

  const touchNode = (id: string, sub: string | null, defaults: Attrs, attrs: Attrs = {}) => {
    let node = g.nodes.get(id);
    if (!node) {
      node = { id, attrs: { ...defaults }, sub, order: order++ };
      g.nodes.set(id, node);
      if (sub) g.subs.get(sub)?.nodes.push(id);
    } else if (sub && node.sub === null) {
      // Graphviz draws a node inside any cluster that mentions it.
      node.sub = sub;
      g.subs.get(sub)?.nodes.push(id);
    }
    Object.assign(node.attrs, attrs);
    return node;
  };

  type Scope = { nodeDefaults: Attrs; edgeDefaults: Attrs; sub: string | null };

  // Returns the node ids a statement endpoint stands for (a node or every node in a subgraph).
  const parseStmtList = (scope: Scope, into: string[]) => {
    while (!(peek().t === "punct" && peek().v === "}")) {
      if (peek().t === "eof") err("Missing '}'");
      parseStmt(scope, into);
      if (peek().t === "punct" && (peek().v === ";" || peek().v === ",")) next();
    }
    next();
  };

  const parseSubgraph = (scope: Scope): string[] => {
    let id = "";
    if (isKw(peek(), "subgraph")) {
      next();
      if (isId(peek())) id = readId();
    }
    const anonymous = !id;
    if (!id) id = `__anon${anon++}`;
    if (!g.subs.has(id)) g.subs.set(id, { id, attrs: {}, parent: scope.sub, nodes: [], anonymous });
    expect("{");
    const members: string[] = [];
    // Anonymous `{a b}` groups keep the enclosing subgraph for placement.
    const inner: Scope = { nodeDefaults: { ...scope.nodeDefaults }, edgeDefaults: { ...scope.edgeDefaults }, sub: anonymous ? scope.sub : id };
    if (anonymous) g.subs.delete(id);
    parseStmtList(inner, members);
    return members;
  };

  const parseEndpoint = (scope: Scope): string[] => {
    const t = peek();
    if (isKw(t, "subgraph") || (t.t === "punct" && t.v === "{")) return parseSubgraph(scope);
    const id = readId();
    if (peek().t === "punct" && peek().v === ":") {
      next();
      readId();
      if (peek().t === "punct" && peek().v === ":") { next(); readId(); }
    }
    return [id];
  };

  const parseStmt = (scope: Scope, into: string[]) => {
    const t = peek();
    if (isKw(t, "graph") || isKw(t, "node") || isKw(t, "edge")) {
      next();
      const a = readAttrList();
      const k = t.v.toLowerCase();
      if (k === "node") Object.assign(scope.nodeDefaults, a);
      else if (k === "edge") Object.assign(scope.edgeDefaults, a);
      else if (scope.sub) Object.assign(g.subs.get(scope.sub)!.attrs, a);
      else Object.assign(g.attrs, a);
      return;
    }
    // ID '=' ID
    if (isId(t) && peek(1).t === "punct" && peek(1).v === "=") {
      const k = readId();
      next();
      const v = readId();
      if (scope.sub && g.subs.has(scope.sub)) g.subs.get(scope.sub)!.attrs[k] = v;
      else g.attrs[k] = v;
      return;
    }
    const isSub = isKw(t, "subgraph") || (t.t === "punct" && t.v === "{");
    let left = parseEndpoint(scope);
    if (!isSub) for (const id of left) touchNode(id, scope.sub, scope.nodeDefaults);
    if (peek().t !== "edgeop") {
      // node statement (or a bare subgraph)
      const a = readAttrList();
      if (!isSub) for (const id of left) touchNode(id, scope.sub, scope.nodeDefaults, a);
      into.push(...left);
      return;
    }
    const chain: string[][] = [left];
    while (peek().t === "edgeop") {
      const op = next();
      if (g.directed && op.v === "--") err("Undirected edge '--' in a digraph (use '->')", op);
      if (!g.directed && op.v === "->") err("Directed edge '->' in an undirected graph (use '--' or 'digraph')", op);
      const nt = peek();
      const sub = isKw(nt, "subgraph") || (nt.t === "punct" && nt.v === "{");
      const right = parseEndpoint(scope);
      if (!sub) for (const id of right) touchNode(id, scope.sub, scope.nodeDefaults);
      chain.push(right);
    }
    const a = { ...scope.edgeDefaults, ...readAttrList() };
    for (let i = 0; i < chain.length - 1; i++)
      for (const f of chain[i]) for (const to of chain[i + 1]) {
        if (g.strict && g.edges.some((e) => (e.from === f && e.to === to) || (!g.directed && e.from === to && e.to === f))) continue;
        g.edges.push({ from: f, to, attrs: a, sub: scope.sub });
      }
    for (const c of chain) into.push(...c);
    left = [];
  };

  parseStmtList({ nodeDefaults: {}, edgeDefaults: {}, sub: null }, []);
  while (peek().t !== "eof") {
    // Further graphs in the same file are counted, not converted.
    if (isKw(peek(), "graph") || isKw(peek(), "digraph") || isKw(peek(), "strict")) g.extraGraphs++;
    next();
  }
  return g;
}

/* ── DOT → Mermaid ─────────────────────────────────────────────────── */

const SHAPES: Record<string, [string, string]> = {
  box: ["[", "]"], rect: ["[", "]"], rectangle: ["[", "]"], square: ["[", "]"], record: ["[", "]"], mrecord: ["(", ")"],
  plaintext: ["[", "]"], plain: ["[", "]"], none: ["[", "]"], underline: ["[", "]"], note: ["[", "]"], tab: ["[", "]"], folder: ["[", "]"], box3d: ["[", "]"], component: ["[", "]"],
  ellipse: ["(", ")"], oval: ["(", ")"], egg: ["(", ")"],
  circle: ["((", "))"], point: ["((", "))"], doublecircle: ["(((", ")))"],
  diamond: ["{", "}"], mdiamond: ["{", "}"],
  cylinder: ["[(", ")]"],
  hexagon: ["{{", "}}"], octagon: ["{{", "}}"], doubleoctagon: ["{{", "}}"], tripleoctagon: ["{{", "}}"],
  parallelogram: ["[/", "/]"], trapezium: ["[/", "\\]"], invtrapezium: ["[\\", "/]"],
  house: ["[/", "\\]"], invhouse: ["[\\", "/]"],
  msquare: ["[[", "]]"], star: [">", "]"], cds: [">", "]"], larrow: [">", "]"], rarrow: [">", "]"], rpromoter: [">", "]"],
  triangle: ["[/", "\\]"], invtriangle: ["[\\", "/]"], polygon: ["{{", "}}"], pentagon: ["{{", "}}"], septagon: ["{{", "}}"],
};

const COLORS: Record<string, string> = {
  red: "#e53935", green: "#43a047", blue: "#1e88e5", yellow: "#fdd835", orange: "#fb8c00", purple: "#8e24aa", gray: "#9e9e9e", grey: "#9e9e9e",
  black: "#000000", white: "#ffffff", lightblue: "#add8e6", lightgrey: "#d3d3d3", lightgray: "#d3d3d3", lightyellow: "#ffffe0", lightgreen: "#90ee90",
  pink: "#ffc0cb", cyan: "#00bcd4", magenta: "#ff00ff", brown: "#8d6e63", gold: "#ffd700", navy: "#000080", darkgreen: "#006400", salmon: "#fa8072",
  lightpink: "#ffb6c1", palegreen: "#98fb98", lightsalmon: "#ffa07a", lightcyan: "#e0ffff", khaki: "#f0e68c", orchid: "#da70d6", tomato: "#ff6347",
};

function color(c: string | undefined): string | null {
  if (!c) return null;
  const first = c.split(/[:;]/)[0].trim().toLowerCase();
  if (/^#[0-9a-f]{3,8}$/.test(first)) return first.slice(0, 7);
  if (/^\d*\.?\d+[ ,]+\d*\.?\d+[ ,]+\d*\.?\d+$/.test(first)) {
    // HSV triple
    const [h, s, v] = first.split(/[ ,]+/).map(Number);
    const f = (n: number) => {
      const k = (n + h * 6) % 6;
      return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255).toString(16).padStart(2, "0");
    };
    return `#${f(5)}${f(3)}${f(1)}`;
  }
  return COLORS[first] ?? (/^[a-z]+$/.test(first) ? first : null);
}

function mmLabel(s: string): string {
  let t = s;
  if (/^<.*>$/s.test(t)) t = t.slice(1, -1).replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim(); // HTML label → text
  t = t
    .replace(/\\[nlr]/g, "\n")
    .replace(/\\N/g, "")
    .replace(/\\G/g, "")
    .replace(/\\(.)/g, "$1")
    .trim();
  return t
    .replace(/"/g, "#quot;")
    .replace(/\n+$/, "")
    .replace(/\n/g, "<br/>");
}

function recordLabel(s: string): string {
  // record labels: {a|b|<p> c} → "a | b | c"
  return s.replace(/<[^>]*>/g, "").replace(/[{}]/g, "").split("|").map((x) => x.trim()).filter(Boolean).join(" | ");
}

export type MermaidOpts = { defaultShape: "dot" | "box"; colors: boolean; direction: string; title: boolean };

export function dotToMermaid(g: DotGraph, o: MermaidOpts): { text: string; notes: string[] } {
  const notes: string[] = [];
  const ids = new Map<string, string>();
  const used = new Set<string>();
  const safeId = (raw: string) => {
    let s = ids.get(raw);
    if (s) return s;
    s = raw.replace(/[^A-Za-z0-9_]/g, "_").replace(/^_+(?=.)/, "");
    if (!s || /^\d/.test(s)) s = "n" + s;
    if (/^(end|graph|subgraph|flowchart|style|class|classDef|click|linkStyle|direction|default)$/i.test(s)) s = s + "_";
    const base = s;
    for (let i = 2; used.has(s); i++) s = `${base}_${i}`;
    used.add(s);
    ids.set(raw, s);
    return s;
  };
  // Assign node ids first (declaration order) so edges and subgraphs agree.
  const nodes = [...g.nodes.values()].sort((a, b) => a.order - b.order);
  nodes.forEach((n) => safeId(n.id));
  const subIds = new Map<string, string>();
  for (const s of g.subs.values()) {
    let sid = s.id.replace(/[^A-Za-z0-9_]/g, "_") || "sg";
    if (/^\d/.test(sid)) sid = "sg_" + sid;
    const base = sid;
    for (let i = 2; used.has(sid); i++) sid = `${base}_${i}`;
    used.add(sid);
    subIds.set(s.id, sid);
  }

  const rankdir = (g.attrs.rankdir ?? "TB").toUpperCase();
  const dir = o.direction !== "auto" ? o.direction : ({ TB: "TD", LR: "LR", RL: "RL", BT: "BT" } as Record<string, string>)[rankdir] ?? "TD";

  const nodeDecl = (n: DotNode) => {
    const shape = (n.attrs.shape ?? (o.defaultShape === "box" ? "box" : "ellipse")).toLowerCase();
    let label = n.attrs.label ?? n.id;
    if (label === "\\N") label = n.id;
    if (shape === "record" || shape === "mrecord") label = recordLabel(label);
    if (shape === "point") label = " ";
    let br = SHAPES[shape] ?? ["[", "]"];
    if (/rounded/i.test(n.attrs.style ?? "") && br[0] === "[") br = ["(", ")"];
    if (!SHAPES[shape]) notes.push(`Shape "${shape}" has no Mermaid equivalent; drawn as a rectangle.`);
    return `${safeId(n.id)}${br[0]}"${mmLabel(label) || " "}"${br[1]}`;
  };

  const lines: string[] = [];
  const title = g.attrs.label ?? "";
  if (title && o.title) lines.push("---", `title: ${mmLabel(title).replace(/<br\/>/g, " ")}`, "---");
  lines.push(`flowchart ${dir}`);

  const emitScope = (sub: string | null, indent: string) => {
    for (const n of nodes) if (n.sub === sub) lines.push(indent + nodeDecl(n));
    for (const s of g.subs.values()) {
      if (s.parent !== sub) continue;
      const label = s.attrs.label ?? (s.id.startsWith("cluster") ? s.id.replace(/^cluster_?/, "") : s.id);
      lines.push(`${indent}subgraph ${subIds.get(s.id)}["${mmLabel(label) || " "}"]`);
      const sd = s.attrs.rankdir?.toUpperCase();
      if (sd) lines.push(`${indent}  direction ${sd === "TB" ? "TB" : sd}`);
      emitScope(s.id, indent + "  ");
      lines.push(`${indent}end`);
    }
  };
  emitScope(null, "  ");

  const linkStyles: string[] = [];
  g.edges.forEach((e, i) => {
    const a = e.attrs;
    let from = safeId(e.from), to = safeId(e.to);
    const dirAttr = (a.dir ?? (g.directed ? "forward" : "none")).toLowerCase();
    const style = (a.style ?? "").toLowerCase();
    const bold = style.includes("bold") || Number(a.penwidth) >= 2;
    const dashed = style.includes("dashed") || style.includes("dotted");
    const invis = style.includes("invis");
    let arrow: string;
    const noHead = (a.arrowhead ?? "").toLowerCase() === "none";
    if (dirAttr === "back") [from, to] = [to, from];
    const head = dirAttr !== "none" && !noHead;
    if (invis) arrow = "~~~";
    else if (dashed) arrow = head ? (dirAttr === "both" ? "<-.->" : "-.->") : "-.-";
    else if (bold) arrow = head ? (dirAttr === "both" ? "<==>" : "==>") : "===";
    else arrow = head ? (dirAttr === "both" ? "<-->" : "-->") : "---";
    const label = a.label ?? a.xlabel;
    const lbl = label && !invis ? `|"${mmLabel(label)}"|` : "";
    lines.push(`  ${from} ${arrow}${lbl} ${to}`);
    if (o.colors) {
      const c = color(a.color);
      const parts: string[] = [];
      if (c) parts.push(`stroke:${c}`);
      if (a.penwidth && Number(a.penwidth) > 0) parts.push(`stroke-width:${Math.min(8, Number(a.penwidth))}px`);
      if (parts.length) linkStyles.push(`  linkStyle ${i} ${parts.join(",")}`);
    }
  });

  if (o.colors) {
    for (const n of nodes) {
      const a = n.attrs;
      const st = (a.style ?? "").toLowerCase();
      const parts: string[] = [];
      const fill = color(a.fillcolor ?? (st.includes("filled") ? a.color : undefined));
      if (fill && (st.includes("filled") || a.fillcolor)) parts.push(`fill:${fill}`);
      const stroke = color(a.color);
      if (stroke) parts.push(`stroke:${stroke}`);
      const fc = color(a.fontcolor);
      if (fc) parts.push(`color:${fc}`);
      if (st.includes("dashed")) parts.push("stroke-dasharray:5 5");
      if (st.includes("bold") || Number(a.penwidth) >= 2) parts.push("stroke-width:2px");
      if (parts.length) lines.push(`  style ${safeId(n.id)} ${parts.join(",")}`);
    }
    for (const s of g.subs.values()) {
      const a = s.attrs;
      const parts: string[] = [];
      const fill = color(a.fillcolor ?? a.bgcolor ?? ((a.style ?? "").includes("filled") ? a.color : undefined));
      if (fill) parts.push(`fill:${fill}`);
      const stroke = color(a.pencolor ?? a.color);
      if (stroke) parts.push(`stroke:${stroke}`);
      if (parts.length) lines.push(`  style ${subIds.get(s.id)} ${parts.join(",")}`);
    }
    lines.push(...linkStyles);
  }

  if (g.extraGraphs) notes.push(`The file holds ${g.extraGraphs + 1} graphs; only the first was converted.`);
  if (g.strict) notes.push("strict: duplicate edges were merged.");
  if (g.edges.some((e) => e.from === e.to)) notes.push("Self-loops are drawn but Mermaid places them loosely.");
  return { text: lines.join("\n"), notes: [...new Set(notes)] };
}
