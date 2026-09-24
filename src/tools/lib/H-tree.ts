/**
 * ASCII tree: parse indented lists, path lists, JSON or existing tree drawings
 * into one model, then render it in several styles.
 */

export type TNode = { name: string; dir: boolean; children: TNode[]; note?: string };
export type TreeFormat = "indent" | "paths" | "json" | "tree";

const BRANCH = /(├──|└──|╰──|┣━━|┗━━|\|--|`--|\+--|\\--|├─|└─|╰─|\|-|`-)/;

export function detectFormat(src: string): TreeFormat {
  const t = src.trim();
  if (/^[[{]/.test(t)) {
    try {
      JSON.parse(t);
      return "json";
    } catch {
      /* not JSON */
    }
  }
  const lines = t.split("\n").filter((l) => l.trim());
  if (lines.some((l) => BRANCH.test(l))) return "tree";
  const slashy = lines.filter((l) => /[/\\]/.test(l.trim().replace(/[/\\]$/, "")) || /^\S+\/$/.test(l.trim())).length;
  const indented = lines.filter((l) => /^\s/.test(l)).length;
  if (!indented && slashy >= Math.max(1, lines.length / 2)) return "paths";
  return "indent";
}

function leaf(name: string): TNode {
  let n = name.trim();
  let note: string | undefined;
  // "file.ts  # comment" or "file.ts  -- comment" keep the note
  const m = n.match(/^(.*?\S)\s{2,}(#|\/\/|--|<-|←)\s*(.*)$/);
  if (m) {
    n = m[1];
    note = m[3];
  }
  const dir = /[/\\]$/.test(n);
  return { name: dir ? n.replace(/[/\\]+$/, "") : n, dir, children: [], note };
}

function stripBullet(s: string): string {
  return s.replace(/^([-*+•]|\d+[.)])\s+/, "").replace(/^\[[ xX]\]\s+/, "");
}

export function parseIndent(src: string): TNode[] {
  const root: TNode = { name: "", dir: true, children: [] };
  const stack: { indent: number; node: TNode }[] = [{ indent: -1, node: root }];
  for (const raw of src.replace(/\r/g, "").split("\n")) {
    if (!raw.trim()) continue;
    const ws = raw.match(/^[\t ]*/)![0];
    const indent = [...ws].reduce((a, c) => a + (c === "\t" ? 4 : 1), 0);
    const node = leaf(stripBullet(raw.trim()));
    if (!node.name) continue;
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
    const parent = stack[stack.length - 1].node;
    parent.children.push(node);
    parent.dir = true;
    stack.push({ indent, node });
  }
  return root.children;
}

export function parsePaths(src: string): TNode[] {
  const root: TNode = { name: "", dir: true, children: [] };
  for (const raw of src.replace(/\r/g, "").split("\n")) {
    const line = raw.trim().replace(/^\.\//, "");
    if (!line || line === ".") continue;
    const isDir = /[/\\]$/.test(line);
    const parts = line.split(/[/\\]+/).filter(Boolean);
    let cur = root;
    parts.forEach((p, i) => {
      let next = cur.children.find((c) => c.name === p);
      if (!next) {
        next = { name: p, dir: false, children: [] };
        cur.children.push(next);
      }
      if (i < parts.length - 1 || isDir) next.dir = true;
      cur = next;
    });
  }
  return root.children;
}

function fromJson(v: unknown, name: string): TNode {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    // {name, children} shaped nodes
    if (typeof o.name === "string" && (Array.isArray(o.children) || Object.keys(o).every((k) => k === "name" || k === "type"))) {
      const kids = Array.isArray(o.children) ? o.children.map((c, i) => fromJson(c, String(i))) : [];
      return { name: o.name, dir: Array.isArray(o.children) || o.type === "directory" || o.type === "dir", children: kids };
    }
    return { name, dir: true, children: Object.entries(o).map(([k, x]) => fromJson(x, k)) };
  }
  if (Array.isArray(v)) {
    const kids: TNode[] = [];
    v.forEach((x, i) => {
      if (typeof x === "string" || typeof x === "number") kids.push(leaf(String(x)));
      else if (x && typeof x === "object" && !Array.isArray(x) && typeof (x as { name?: unknown }).name !== "string") kids.push(...fromJson(x, "").children);
      else kids.push(fromJson(x, String(i)));
    });
    return { name, dir: true, children: kids };
  }
  const n = leaf(name);
  if (typeof v === "string" && v) n.note = v;
  return n;
}

export function parseJsonTree(src: string): TNode[] {
  const v = JSON.parse(src);
  const n = fromJson(v, "");
  if (n.name) return [n];
  return n.children;
}

/** Parse the output of `tree`, or any ├── / |-- drawing, back into nodes. */
export function parseTreeText(src: string): TNode[] {
  const root: TNode = { name: "", dir: true, children: [] };
  const stack: { depth: number; node: TNode }[] = [{ depth: -1, node: root }];
  const lines = src.replace(/\r/g, "").split("\n");
  // Indent unit: the smallest non-zero prefix before a branch marker (4 for `tree`, 2 for compact drawings).
  const prefixes = lines.map((l) => l.match(BRANCH)?.index).filter((i): i is number => !!i && i > 0);
  const unit = prefixes.length ? Math.max(2, Math.min(...prefixes)) : 4;
  for (const raw of lines) {
    if (!raw.trim()) continue;
    if (/^\s*\d+ director(y|ies)(, \d+ files?)?\s*$/.test(raw)) continue;
    const m = raw.match(BRANCH);
    let depth: number;
    let name: string;
    if (m && m.index !== undefined) {
      const prefix = raw.slice(0, m.index);
      depth = Math.round([...prefix].length / unit) + 1;
      name = raw.slice(m.index + m[0].length);
    } else {
      depth = 0;
      name = raw;
    }
    const node = leaf(name.replace(/^[─━-]+\s*/, "").replace(/^[📁📂📄]\s*/u, ""));
    if (!node.name) continue;
    while (stack.length > 1 && stack[stack.length - 1].depth >= depth) stack.pop();
    const parent = stack[stack.length - 1].node;
    parent.children.push(node);
    parent.dir = true;
    stack.push({ depth, node });
  }
  return root.children;
}

export function parseAny(src: string, fmt: TreeFormat): TNode[] {
  const nodes = parseRaw(src, fmt);
  // `tree` prints "." as its root line — it is the current folder, not an entry.
  return nodes.length === 1 && nodes[0].name === "." ? nodes[0].children : nodes;
}

function parseRaw(src: string, fmt: TreeFormat): TNode[] {
  switch (fmt) {
    case "json":
      return parseJsonTree(src);
    case "tree":
      return parseTreeText(src);
    case "paths":
      return parsePaths(src);
    default:
      return parseIndent(src);
  }
}

/* ── transforms ─────────────────────────────────────────────────────── */

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export function sortTree(nodes: TNode[], order: string, dirsFirst: boolean): TNode[] {
  const out = nodes.map((n) => ({ ...n, children: sortTree(n.children, order, dirsFirst) }));
  out.sort((a, b) => {
    if (dirsFirst && a.dir !== b.dir) return a.dir ? -1 : 1;
    if (order === "asc") return collator.compare(a.name, b.name);
    if (order === "desc") return collator.compare(b.name, a.name);
    return 0;
  });
  return out;
}

export function countTree(nodes: TNode[]): { dirs: number; files: number; depth: number } {
  let dirs = 0, files = 0, depth = 0;
  const walk = (ns: TNode[], d: number) => {
    for (const n of ns) {
      depth = Math.max(depth, d);
      if (n.dir) dirs++;
      else files++;
      walk(n.children, d + 1);
    }
  };
  walk(nodes, 1);
  return { dirs, files, depth };
}

/* ── renderers ──────────────────────────────────────────────────────── */

export type RenderOpts = {
  style: string;
  slash: boolean;
  counts: boolean;
  icons: boolean;
  maxDepth: number;
  root: string;
  notes: boolean;
};

const GLYPHS: Record<string, [mid: string, last: string, pipe: string, gap: string]> = {
  unicode: ["├── ", "└── ", "│   ", "    "],
  ascii: ["|-- ", "`-- ", "|   ", "    "],
  rounded: ["├── ", "╰── ", "│   ", "    "],
  heavy: ["┣━━ ", "┗━━ ", "┃   ", "    "],
  compact: ["├ ", "└ ", "│ ", "  "],
  minimal: ["", "", "  ", "  "],
};

function label(n: TNode, o: RenderOpts): string {
  let s = (o.icons ? (n.dir ? "📁 " : "📄 ") : "") + n.name + (n.dir && o.slash ? "/" : "");
  if (o.counts && n.dir) s += ` (${n.children.length})`;
  if (o.notes && n.note) s += `  # ${n.note}`;
  return s;
}

export function renderTree(nodes: TNode[], o: RenderOpts): string {
  const out: string[] = [];
  if (o.style === "markdown") {
    const walk = (ns: TNode[], d: number) => {
      for (const n of ns) {
        out.push("  ".repeat(d) + "- " + (n.dir ? `**${label(n, o)}**` : label(n, o)));
        if (!o.maxDepth || d + 1 < o.maxDepth) walk(n.children, d + 1);
      }
    };
    if (o.root) {
      out.push(`- **${o.root}**`);
      walk(nodes, 1);
    } else walk(nodes, 0);
    return out.join("\n");
  }
  if (o.style === "paths") {
    const walk = (ns: TNode[], base: string, d: number) => {
      for (const n of ns) {
        const p = base + n.name;
        out.push(p + (n.dir && o.slash ? "/" : ""));
        if (!o.maxDepth || d < o.maxDepth) walk(n.children, p + "/", d + 1);
      }
    };
    walk(nodes, o.root ? o.root.replace(/\/?$/, "/") : "", 1);
    return out.join("\n");
  }
  if (o.style === "json") {
    const toObj = (ns: TNode[], d: number): Record<string, unknown> => {
      const r: Record<string, unknown> = {};
      for (const n of ns) r[n.name] = n.dir ? (o.maxDepth && d >= o.maxDepth ? {} : toObj(n.children, d + 1)) : n.note ?? null;
      return r;
    };
    const v = o.root ? { [o.root]: toObj(nodes, 1) } : toObj(nodes, 1);
    return JSON.stringify(v, null, 2);
  }
  const [mid, last, pipe, gap] = GLYPHS[o.style] ?? GLYPHS.unicode;
  const walk = (ns: TNode[], prefix: string, d: number) => {
    ns.forEach((n, i) => {
      const end = i === ns.length - 1;
      out.push(prefix + (end ? last : mid) + label(n, o));
      if (n.children.length && (!o.maxDepth || d < o.maxDepth)) walk(n.children, prefix + (end ? gap : pipe), d + 1);
    });
  };
  if (o.root) {
    out.push((o.icons ? "📁 " : "") + o.root);
    walk(nodes, "", 1);
  } else if (nodes.length === 1 && nodes[0].children.length) {
    // A single top-level folder is the root line, like `tree` prints it.
    out.push(label(nodes[0], o));
    walk(nodes[0].children, "", 2);
  } else walk(nodes, "", 1);
  if (o.counts) {
    const c = countTree(nodes);
    out.push("", `${c.dirs} director${c.dirs === 1 ? "y" : "ies"}, ${c.files} file${c.files === 1 ? "" : "s"}`);
  }
  return out.join("\n");
}
