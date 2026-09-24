import { BORDER_CHOICES, alignW, drawBox, drawTable, parseTable, strWidth, type Align } from "./lib/H-box";
import { CHARSET_CHOICES, convertCharset, gridToText, makeGrid, textSize, type Charset } from "./lib/H-draw";
import { countTree, detectFormat, parseAny, renderTree, sortTree, type TNode, type TreeFormat } from "./lib/H-tree";
import { HEART, MANDELBROT, SPHERE, SUNSET } from "./lib/H-samples";
import { ToolError, bool, num, str, type Result, type SpecModule, type View } from "./types";

/* ── shared examples ─────────────────────────────────────────────────── */

const ARCH = `┌────────────┐ HTTPS  ┌──────────────┐        ┌──────────────┐
│  Browser   │───────▶│ API Gateway  │───────▶│ Auth Service │
└────────────┘        └───────┬──────┘        └──────────────┘
                              │
                              │ JWT ok
                              │
                              ▼
                      ┌──────────────┐        ┌──────────────┐
                      │  Orders API  │───────▶│ Redis cache  │
                      └───────┬──────┘        └──────────────┘
                              ▼
                      ┌──────────────┐
                      │  PostgreSQL  │
                      └──────────────┘`;

const SEQUENCE = `  Client               Server                Database
    │                    │                      │
    │  POST /login       │                      │
    ├───────────────────▶│                      │
    │                    │  SELECT user         │
    │                    ├─────────────────────▶│
    │                    │    row + hash        │
    │                    │◀─────────────────────┤
    │  200 Set-Cookie    │                      │
    │◀───────────────────┤                      │
    │  GET /me           │                      │
    ├───────────────────▶│                      │
    │                    │                      │`;

const TABLE_ART = `┌──────────┬─────────┬─────────┬───────┐
│ Region   │      Q1 │      Q2 │ Trend │
╞══════════╪═════════╪═════════╪═══════╡
│ EMEA     │ 1,204.5 │ 1,388.0 │ ▲ 15% │
├──────────┼─────────┼─────────┼───────┤
│ Americas │ 2,310.0 │ 2,145.2 │ ▼ 7%  │
├──────────┼─────────┼─────────┼───────┤
│ APAC     │   980.3 │ 1,120.9 │ ▲ 14% │
└──────────┴─────────┴─────────┴───────┘`;

const FLOW = `              +------------+
              |   Start    |
              +------------+
                    |
                    v
           +------------------+
           |   Read config    |
           +------------------+
                    |
                    v
           +------------------+  no
           |      Valid?      |--------->exit 1
           +------------------+
                    | yes
                    v
                serve :8080`;

const SALES_CSV = `Region,Q1,Q2,Trend
EMEA,"1,204.5","1,388.0",▲ 15%
Americas,"2,310.0","2,145.2",▼ 7%
APAC,980.3,"1,120.9",▲ 14%`;

const MD_TABLE = `| Endpoint        | Method | p50 (ms) | p99 (ms) | Status |
|:----------------|:------:|---------:|---------:|:-------|
| /api/users      | GET    |       12 |       88 | ok     |
| /api/orders     | POST   |       41 |      310 | slow   |
| /api/search?q=  | GET    |      120 |     1450 | alert  |`;

const TSV = "Package\tVersion\tLicense\tSize\nreact\t18.3.1\tMIT\t6.4 kB\nnext\t14.2.5\tMIT\t94 kB\nzod\t3.23.8\tMIT\t13 kB\nlodash\t4.17.21\tMIT\t72 kB";

const PROJECT_INDENT = `formatter/
  app/
    layout.tsx
    page.tsx
    tools/
      [slug]/
        page.tsx
  src/
    components/
      ToolShell.tsx
      OutputView.tsx
    tools/
      json.ts
      ascii.ts
      lib/
        jsonparse.ts
  package.json
  README.md
  tsconfig.json`;

const PATHS = `src/index.ts
src/server/routes/users.ts
src/server/routes/orders.ts
src/server/middleware/auth.ts
src/server/app.ts
src/utils/logger.ts
tests/users.test.ts
tests/orders.test.ts
docs/
.github/workflows/ci.yml
Dockerfile
package.json`;

const TREE_OUT = `.
├── Cargo.toml
├── src
│   ├── main.rs
│   ├── lib.rs
│   └── parser
│       ├── mod.rs
│       ├── lexer.rs
│       └── ast.rs
├── benches
│   └── parse.rs
└── tests
    └── integration.rs

4 directories, 8 files`;

const JSON_TREE = `{
  "docker-compose.yml": null,
  "services": {
    "api": { "Dockerfile": null, "main.go": null, "go.mod": null },
    "web": { "package.json": null, "src": ["App.tsx", "main.tsx", "styles.css"] },
    "worker": { "worker.py": "consumes the jobs queue", "requirements.txt": null }
  },
  "infra": { "terraform": ["main.tf", "variables.tf", "outputs.tf"] }
}`;

const MARKDOWN_OUTLINE = `- Getting started
  - Install
  - First run
- Guides
  * Pipelines
  * Workspaces
    + Sharing
    + Import / export
- Reference
\t- CLI
\t- Config file`;

/* ── Box drawing ─────────────────────────────────────────────────────── */

function trimLines(lines: string[]) {
  return lines.map((l) => l.replace(/\s+$/, "")).join("\n");
}

function sizeStats(text: string, extra: { label: string; value: string | number }[] = []): View {
  const lines = text.split("\n");
  return {
    label: "Stats",
    out: {
      kind: "stats",
      items: [
        { label: "Lines", value: lines.length },
        { label: "Width (columns)", value: Math.max(0, ...lines.map(strWidth)), tone: "info" },
        { label: "Characters", value: [...text].length },
        ...extra,
      ],
    },
  };
}

/* ── Banner comments ─────────────────────────────────────────────────── */

type Syntax = { line?: string; open?: string; mid?: string; close?: string; suffix?: string };

const SYNTAX: Record<string, Syntax> = {
  slash: { line: "//" },
  cblock: { open: "/*", mid: " *", close: " */" },
  jsdoc: { open: "/**", mid: " *", close: " */" },
  cinline: { line: "/*", suffix: "*/" },
  hash: { line: "#" },
  dash: { line: "--" },
  html: { line: "<!--", suffix: "-->" },
  lisp: { line: ";;" },
  vb: { line: "'" },
  percent: { line: "%" },
  ocaml: { open: "(*", mid: " *", close: " *)" },
  rem: { line: "REM" },
  none: { line: "" },
};

const LANG_CHOICES: [string, string][] = [
  ["slash", "// — C, C++, JS, TS, Java, Go, Rust, Swift, C#"],
  ["cblock", "/* … */ — C-style block"],
  ["jsdoc", "/** … */ — JSDoc, Javadoc, PHPDoc"],
  ["cinline", "/* … */ per line — CSS, C"],
  ["hash", "# — Python, Shell, Ruby, YAML, R, Perl"],
  ["dash", "-- — SQL, Lua, Haskell, Ada, Elm"],
  ["html", "<!-- … --> — HTML, XML, Markdown"],
  ["lisp", ";; — Lisp, Clojure, Scheme, asm"],
  ["vb", "' — VB, VBA, VBScript"],
  ["percent", "% — MATLAB, LaTeX, Erlang"],
  ["ocaml", "(* … *) — OCaml, Pascal, F#"],
  ["rem", "REM — Batch files"],
  ["none", "No comment markers"],
];

const DEFAULT_FILL: Record<string, string> = { rule: "-", box: "*", banner: "=", double: "=", figlet: "-" };

function boxChars(fill: string) {
  if (fill === "─") return { tl: "┌", tr: "┐", bl: "└", br: "┘", side: "│" };
  if (fill === "━") return { tl: "┏", tr: "┓", bl: "┗", br: "┛", side: "┃" };
  if (fill === "═") return { tl: "╔", tr: "╗", bl: "╚", br: "╝", side: "║" };
  if (fill === "-" || fill === "=" || fill === "~") return { tl: "+", tr: "+", bl: "+", br: "+", side: "|" };
  return { tl: fill, tr: fill, bl: fill, br: fill, side: fill };
}

/** A rule of `fill` exactly `w` columns wide (fill may be wide or multi-char). */
function rule(fill: string, w: number): string {
  if (w <= 0) return "";
  const fw = Math.max(1, strWidth(fill));
  let s = fill.repeat(Math.floor(w / fw));
  if (strWidth(s) < w) s += " ".repeat(w - strWidth(s));
  return s;
}

/** Text embedded in a rule: "-- Title -------" (left), centred, or right. */
function ruleWith(text: string, fill: string, w: number, align: Align, gap = 1): string {
  if (!text) return rule(fill, w);
  const t = " ".repeat(gap) + text + " ".repeat(gap);
  const rest = w - strWidth(t);
  if (rest < 2) return t.trim();
  const lead = align === "left" ? Math.min(2, rest) : align === "right" ? rest - Math.min(2, rest) : Math.floor(rest / 2);
  return rule(fill, lead) + t + rule(fill, rest - lead);
}

function commentBody(style: string, lines: string[], W: number, align: Align, fill: string, pad: number, fig: string[] | null): string[] {
  const out: string[] = [];
  const blank = () => {
    for (let i = 0; i < pad; i++) out.push("");
  };
  switch (style) {
    case "rule":
      for (const l of lines) out.push(ruleWith(l, fill, W, align));
      break;
    case "box": {
      const c = boxChars(fill);
      const inner = W - 2;
      out.push(c.tl + rule(fill, inner) + c.tr);
      for (let i = 0; i < pad; i++) out.push(c.side + " ".repeat(inner) + c.side);
      for (const l of lines) out.push(c.side + " " + alignW(l, inner - 2, align) + " " + c.side);
      for (let i = 0; i < pad; i++) out.push(c.side + " ".repeat(inner) + c.side);
      out.push(c.bl + rule(fill, inner) + c.br);
      break;
    }
    case "banner":
      out.push(rule(fill, W));
      blank();
      for (const l of lines) out.push(alignW(l, W, align));
      blank();
      out.push(rule(fill, W));
      break;
    case "double":
      out.push(rule(fill, W));
      for (const l of lines) out.push(ruleWith(l, fill, W, align, 3));
      out.push(rule(fill, W));
      break;
    case "figlet": {
      const art = fig ?? lines;
      const artW = Math.max(0, ...art.map(strWidth));
      out.push(rule(fill, W));
      blank();
      for (const l of art) out.push(alignW(alignW(l, artW, "left"), Math.max(W, artW), align));
      blank();
      out.push(rule(fill, W));
      break;
    }
  }
  return out;
}

function wrapComment(body: string[], syn: Syntax): string[] {
  const W = Math.max(0, ...body.map(strWidth));
  if (syn.open) {
    const mid = syn.mid ?? "";
    return [syn.open, ...body.map((l) => (mid + (l ? " " + l : "")).replace(/\s+$/, "")), syn.close ?? ""];
  }
  const pre = syn.line ?? "";
  if (syn.suffix) return body.map((l) => `${pre} ${alignW(l, W, "left")} ${syn.suffix}`);
  return body.map((l) => (pre ? (l ? `${pre} ${l}` : pre) : l).replace(/\s+$/, ""));
}

function prefixWidth(syn: Syntax) {
  if (syn.open) return strWidth(syn.mid ?? "") + 1;
  const p = syn.line ? strWidth(syn.line) + 1 : 0;
  return p + (syn.suffix ? strWidth(syn.suffix) + 1 : 0);
}

/* ── Tree ────────────────────────────────────────────────────────────── */

function treeValue(nodes: TNode[]): unknown {
  const o: Record<string, unknown> = {};
  for (const n of nodes) o[n.name + (n.dir ? "/" : "")] = n.dir ? treeValue(n.children) : n.note ?? null;
  return o;
}

const FORMAT_LABEL: Record<TreeFormat, string> = { indent: "indented list", paths: "path list", json: "JSON", tree: "tree drawing" };

/* ── specs ───────────────────────────────────────────────────────────── */

const specs: SpecModule = {
  "box-drawing": {
    inputs: [{ id: "text", label: "Text or table", placeholder: "Text to frame — or CSV / TSV / Markdown table rows in Table mode" }],
    options: [
      { id: "mode", label: "Mode", type: "segment", choices: [["box", "Box"], ["table", "Table"]], default: "box" },
      { id: "style", label: "Style", type: "select", choices: BORDER_CHOICES, default: "single" },
      { id: "align", label: "Align", type: "segment", choices: [["left", "Left"], ["center", "Center"], ["right", "Right"]], default: "left", show: (o) => o.mode !== "table" },
      { id: "colAlign", label: "Columns", type: "text", default: "auto", placeholder: "auto or l,r,c", width: 90, hint: "auto right-aligns numeric columns and honours Markdown :---: rules", show: (o) => o.mode === "table" },
      { id: "padX", label: "Padding", type: "number", default: 1, min: 0, max: 12 },
      { id: "padY", label: "V-padding", type: "number", default: 0, min: 0, max: 6, show: (o) => o.mode !== "table" },
      { id: "margin", label: "Margin", type: "number", default: 0, min: 0, max: 12, show: (o) => o.mode !== "table" },
      { id: "width", label: "Width", type: "number", default: 0, min: 0, max: 240, hint: "0 = fit the text; otherwise words wrap at this width (per column in Table mode)" },
      { id: "title", label: "Title", type: "text", default: "", placeholder: "in the top border", width: 130, show: (o) => o.mode !== "table" },
      { id: "titleAlign", label: "Title at", type: "segment", choices: [["left", "Left"], ["center", "Center"], ["right", "Right"]], default: "left", show: (o) => o.mode !== "table" && !!str(o.title).trim() },
      { id: "header", label: "Header row", type: "toggle", default: true, show: (o) => o.mode === "table" },
      { id: "rowLines", label: "Row lines", type: "toggle", default: false, show: (o) => o.mode === "table" },
    ],
    run: ({ inputs, opts }) => {
      const src = str(inputs.text).replace(/\r\n?/g, "\n");
      if (!src.trim()) throw new ToolError("Type some text to put in a box — or switch to Table mode and paste CSV, TSV or a Markdown table.");
      if (opts.mode === "table") {
        const t = parseTable(src);
        if (!t.rows.length) throw new ToolError("No table rows found. Use one row per line, cells separated by commas, tabs, semicolons or | pipes.");
        const lens = t.rows.map((r) => r.length);
        const text = trimLines(drawTable(t, { style: str(opts.style, "single"), header: bool(opts.header), align: str(opts.colAlign, "auto"), rowLines: bool(opts.rowLines), padX: num(opts.padX, 1), maxCol: num(opts.width, 0) }));
        const notes = new Set(lens).size > 1 ? [`Rows have ${Math.min(...lens)}–${Math.max(...lens)} cells; short rows were padded with empty cells.`] : undefined;
        return {
          text,
          notes,
          views: [
            { label: "Table", out: { kind: "text", text } },
            { label: "Parsed", out: { kind: "table", columns: bool(opts.header) ? t.rows[0].map((c, i) => c || `col ${i + 1}`) : t.rows[0].map((_, i) => `col ${i + 1}`), rows: bool(opts.header) ? t.rows.slice(1) : t.rows } },
            sizeStats(text, [{ label: "Detected format", value: t.format.toUpperCase() }, { label: "Rows × columns", value: `${t.rows.length} × ${Math.max(...lens)}` }]),
          ],
        };
      }
      const text = trimLines(drawBox(src, { style: str(opts.style, "single"), align: str(opts.align, "left") as Align, padX: num(opts.padX, 1), padY: num(opts.padY, 0), margin: num(opts.margin, 0), width: num(opts.width, 0), title: str(opts.title), titleAlign: str(opts.titleAlign, "left") as Align }));
      return { text, views: [{ label: "Box", out: { kind: "text", text } }, sizeStats(text)] };
    },
    examples: [
      { label: "Notice box", inputs: { text: "Deploy finished in 42s\nAll 318 tests passed" }, opts: { style: "rounded", align: "center", padX: 2, padY: 1, title: "CI" }, note: "A rounded frame with a title set into the top border, centred text and vertical padding." },
      { label: "Word-wrapped", inputs: { text: "Offline-first: every tool here runs in your browser. Nothing you paste is uploaded, logged or sent to any server — close the network tab and try it." }, opts: { style: "shadow", width: 38, title: "Privacy", titleAlign: "center", margin: 2 }, note: "A fixed width wraps long paragraphs by words; the Shadow style adds a ▒ drop shadow and Margin indents the whole box." },
      { label: "ASCII for plain terminals", inputs: { text: "WARNING\nThis script rewrites git history.\nRun it on a fresh clone." }, opts: { style: "ascii", align: "center", padX: 3 }, note: "+-| characters survive any terminal, e-mail or legacy font." },
      { label: "CSV → table", inputs: { text: SALES_CSV }, opts: { mode: "table", style: "single", rowLines: true }, note: "Quoted CSV cells with commas are kept whole; numeric columns right-align automatically and the header gets a ╞═╡ rule." },
      { label: "Markdown table", inputs: { text: MD_TABLE }, opts: { mode: "table", style: "double" }, note: "Markdown alignment rules (:--, :-:, --:) set each column's alignment." },
      { label: "TSV, forced alignment", inputs: { text: TSV }, opts: { mode: "table", style: "heavy", colAlign: "l,c,c,r" }, note: "Tab-separated input (pasted from a spreadsheet) with explicit per-column alignment l,c,c,r." },
      { label: "Block letters", inputs: { text: "BUILD PASSING" }, opts: { style: "block", padX: 2, padY: 1 }, note: "Solid █▀▄ block borders for READMEs and release notes." },
    ],
    tips: [
      "Wide characters (CJK, emoji) count as two columns so borders stay straight.",
      "In Table mode, the first row is the header unless you turn Header row off.",
    ],
  },

  "comment-ascii-art": {
    inputs: [{ id: "text", label: "Heading text", placeholder: "Section title (several lines are fine)", rows: 4 }],
    options: [
      { id: "lang", label: "Comment", type: "select", choices: LANG_CHOICES, default: "slash" },
      { id: "style", label: "Style", type: "select", choices: [["rule", "Line rule — ── Title ──"], ["box", "Box"], ["banner", "Banner — rules above & below"], ["double", "Double rule — === TITLE ==="], ["figlet", "FIGlet large text"]], default: "rule" },
      { id: "width", label: "Width", type: "number", default: 72, min: 20, max: 200, hint: "Total line width including the comment markers" },
      { id: "align", label: "Align", type: "segment", choices: [["left", "Left"], ["center", "Center"], ["right", "Right"]], default: "left" },
      { id: "fill", label: "Fill", type: "text", default: "", placeholder: "auto", width: 60, hint: "Rule character: - = * # ~ ─ ═ ━ … (blank = the style's default)" },
      { id: "font", label: "Font", type: "select", choices: ["Standard", "Small", "Mini", "Slant", "Small Slant", "Big", "Calvin S", "ANSI Regular", "ANSI Shadow", "Doom", "Rectangles", "Thin"], default: "Small", show: (o) => o.style === "figlet" },
      { id: "upper", label: "UPPERCASE", type: "toggle", default: false },
      { id: "pad", label: "Padding", type: "number", default: 0, min: 0, max: 4, show: (o) => o.style === "box" || o.style === "banner" || o.style === "figlet" },
    ],
    run: async ({ inputs, opts }) => {
      let text = str(inputs.text).replace(/\r\n?/g, "\n").replace(/\s+$/, "");
      if (!text.trim()) throw new ToolError("Type a heading to turn into a comment banner.");
      if (bool(opts.upper)) text = text.toUpperCase();
      const style = str(opts.style, "rule");
      const syn = SYNTAX[str(opts.lang, "slash")] ?? SYNTAX.slash;
      const width = Math.max(20, num(opts.width, 72));
      const W = Math.max(8, width - prefixWidth(syn));
      const fill = str(opts.fill).trim() || DEFAULT_FILL[style] || "-";
      const lines = text.split("\n").map((l) => l.trim());
      let fig: string[] | null = null;
      const notes: string[] = [];
      if (style === "figlet") {
        const { figletText } = await import("./lib/H-figlet");
        const art = await figletText(text, { font: str(opts.font, "Small"), width: W, whitespaceBreak: true });
        fig = art.split("\n");
        const artW = Math.max(...fig.map(strWidth));
        if (artW > W) notes.push(`The FIGlet text is ${artW} columns wide — wider than the ${W} available. Increase Width or pick a smaller font (Mini, Small, Calvin S).`);
      }
      const body = commentBody(style, lines, W, str(opts.align, "left") as Align, fill, num(opts.pad, 0), fig);
      const out = wrapComment(body, syn);
      // Guard against the fill or text closing a block comment early.
      const closer = syn.close?.trim() || syn.suffix;
      if (closer && body.some((l) => l.includes(closer))) notes.push(`The banner contains "${closer}", which ends the comment early — choose another fill character.`);
      const outText = out.join("\n");
      return { text: outText, notes: notes.length ? notes : undefined, views: [{ label: "Comment", out: { kind: "text", text: outText } }, sizeStats(outText)] };
    },
    examples: [
      { label: "Section rule", inputs: { text: "Tool UI kit" }, opts: { lang: "slash", style: "rule", fill: "─", width: 60 }, note: "The one-line divider used all over this codebase: // ── Title ─────." },
      { label: "Python banner", inputs: { text: "Data loading\nand validation" }, opts: { lang: "hash", style: "banner", align: "center", width: 64, pad: 1 }, note: "Two centred lines between = rules — a classic Python/Shell module header." },
      { label: "JSDoc box", inputs: { text: "PaymentService\nRetries, idempotency keys and webhooks" }, opts: { lang: "jsdoc", style: "box", fill: "─", width: 56, align: "center" }, note: "A Unicode box inside /** … */ — ─ fills pick matching ┌┐└┘│ corners." },
      { label: "SQL double rule", inputs: { text: "migrations" }, opts: { lang: "dash", style: "double", upper: true, align: "center", width: 60 }, note: "-- ====   MIGRATIONS   ==== with the text centred in the rule." },
      { label: "FIGlet in C", inputs: { text: "main" }, opts: { lang: "cblock", style: "figlet", font: "Small", width: 60 }, note: "Large letters inside a /* */ block — FIGlet fonts are bundled, nothing is fetched." },
      { label: "CSS per line", inputs: { text: "Layout\nGrid · Flex · Container queries" }, opts: { lang: "cinline", style: "box", fill: "*", width: 60, align: "center" }, note: "Each line wrapped in its own /* … */ so the right edge stays aligned." },
      { label: "HTML comment", inputs: { text: "Navigation" }, opts: { lang: "html", style: "rule", fill: "=", align: "center", width: 70 }, note: "<!-- ===== Navigation ===== --> for templates and XML." },
    ],
  },

  "text-to-ascii-figlet": {
    inputs: [{ id: "text", label: "Text", placeholder: "Text to render in large letters", rows: 3 }],
    options: [
      {
        id: "font",
        label: "Font",
        type: "select",
        choices: ["Standard", "Big", "Slant", "Small", "Small Slant", "Mini", "Banner", "Block", "Bubble", "Digital", "Doom", "Epic", "Isometric1", "Larry 3D", "3-D", "Lean", "Script", "Shadow", "Small Shadow", "Speed", "Star Wars", "Ogre", "Rectangles", "ANSI Shadow", "ANSI Regular", "Calvin S", "Colossal", "Graffiti", "Ghost", "DOS Rebel", "Roman", "Thin", "Elite", "Cyberlarge", "Bloody", "Sub-Zero", "The Edge", "Stop"],
        default: "Standard",
      },
      { id: "hLayout", label: "Horizontal", type: "select", choices: [["default", "Default"], ["full", "Full width"], ["fitted", "Fitted"], ["controlled smushing", "Controlled smushing"], ["universal smushing", "Universal smushing"]], default: "default" },
      { id: "vLayout", label: "Vertical", type: "select", choices: [["default", "Default"], ["full", "Full height"], ["fitted", "Fitted"], ["controlled smushing", "Controlled smushing"], ["universal smushing", "Universal smushing"]], default: "default" },
      { id: "width", label: "Width", type: "number", default: 0, min: 0, max: 400, hint: "Wrap output at this many columns (0 = never)" },
      { id: "wsBreak", label: "Break at spaces", type: "toggle", default: true, show: (o) => num(o.width) > 0 },
      { id: "rtl", label: "Right-to-left", type: "toggle", default: false },
      { id: "gallery", label: "All-fonts preview", type: "toggle", default: true, hint: "Adds a tab rendering your text in every bundled font" },
    ],
    run: async ({ inputs, opts, pipeline }) => {
      const text = str(inputs.text).replace(/\r\n?/g, "\n").replace(/\s+$/, "");
      if (!text.trim()) throw new ToolError("Type some text to render.");
      const { figletText, FONT_NAMES } = await import("./lib/H-figlet");
      const font = str(opts.font, "Standard");
      const base = { horizontalLayout: str(opts.hLayout, "default"), verticalLayout: str(opts.vLayout, "default"), width: num(opts.width, 0), whitespaceBreak: bool(opts.wsBreak), printDirection: bool(opts.rtl) ? 1 : 0 };
      const out = await figletText(text, { font, ...base });
      const notes: string[] = [];
      const odd = [...new Set([...text].filter((c) => c.charCodeAt(0) > 126 || (c.charCodeAt(0) < 32 && c !== "\n")))];
      if (odd.length) notes.push(`FIGlet fonts cover ASCII (and some Latin-1) only: ${odd.slice(0, 12).join(" ")} may render blank.`);
      const views: View[] = [{ label: font, out: { kind: "text", text: out } }];
      if (bool(opts.gallery) && !pipeline) {
        const sample = text.split("\n")[0].slice(0, 24);
        const all = await Promise.all(
          FONT_NAMES.map(async (f) => {
            try {
              return `── ${f} ${"─".repeat(Math.max(2, 60 - f.length))}\n${await figletText(sample, { font: f, horizontalLayout: base.horizontalLayout })}`;
            } catch (e) {
              return `── ${f}\n(${(e as Error).message})`;
            }
          })
        );
        views.push({ label: `All fonts (${FONT_NAMES.length})`, out: { kind: "text", text: all.join("\n\n") } });
      }
      const esc = out.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
      views.push({
        label: "As code",
        out: {
          kind: "text",
          text: `// JavaScript / TypeScript\nconst banner = \`\n${esc}\`;\nconsole.log(banner);\n\n# Shell\ncat <<'EOF'\n${out}\nEOF\n\n# Python\nprint(r"""\n${out.replace(/"""/g, '""\\"')}\n""")`,
          lang: "text",
        },
      });
      views.push(sizeStats(out, [{ label: "Font", value: font }]));
      return { text: out, notes: notes.length ? notes : undefined, views };
    },
    examples: [
      { label: "Hello", inputs: { text: "Hello!" }, note: "The Standard font with default kerning/smushing. Open All fonts to compare every bundled font." },
      { label: "Slant logo", inputs: { text: "formatter" }, opts: { font: "Slant" }, note: "Slant is the classic CLI splash-screen font." },
      { label: "ANSI Shadow", inputs: { text: "DEPLOY" }, opts: { font: "ANSI Shadow", gallery: false }, note: "Unicode block characters with a drop shadow — great for terminal MOTDs." },
      { label: "Full width vs smushing", inputs: { text: "WAVE" }, opts: { font: "Big", hLayout: "full", gallery: false }, note: "Full width keeps each letter's whole box; switch Horizontal to Universal smushing to see letters merge." },
      { label: "Wrapped at 60 columns", inputs: { text: "Offline tools for developers" }, opts: { font: "Small", width: 60, wsBreak: true, gallery: false }, note: "A width makes FIGlet break the text at spaces onto several banner rows." },
      { label: "Multi-line", inputs: { text: "v2.4\nstable" }, opts: { font: "Doom", gallery: false }, note: "Each input line is rendered as its own banner row." },
      { label: "Star Wars", inputs: { text: "Episode IV" }, opts: { font: "Star Wars", gallery: false }, note: "Display fonts like Star Wars, Isometric1 and Larry 3D suit short words." },
    ],
    tips: ["FIGlet fonts only include ASCII letters; accented or non-Latin characters render blank.", "Copy the \"As code\" tab to paste the banner into JS, Shell or Python safely escaped."],
  },

  "image-to-ascii": {
    inputs: [{ id: "image", label: "Image", kind: "file", accept: "image/*", read: "dataurl", placeholder: "Drop an image (PNG, JPEG, GIF, WebP, SVG) or browse" }],
    options: [
      { id: "cols", label: "Columns", type: "number", default: 100, min: 10, max: 300, step: 2 },
      { id: "ramp", label: "Characters", type: "select", choices: [["standard", "Standard (10) @%#*+=-:."], ["detailed", "Detailed (70)"], ["blocks", "Blocks █▓▒░"], ["braille", "Braille ⣿ (2×4 dots)"], ["simple", "Simple #=-."], ["digits", "Digits 8069…"], ["custom", "Custom…"]], default: "standard" },
      { id: "custom", label: "Ramp", type: "text", default: "#WX+-. ", placeholder: "dark → light", width: 120, show: (o) => o.ramp === "custom" },
      { id: "invert", label: "Invert (dark bg)", type: "toggle", default: false },
      { id: "dither", label: "Dither", type: "toggle", default: false, hint: "Floyd–Steinberg error diffusion — smoother gradients" },
      { id: "brightness", label: "Brightness", type: "number", default: 0, min: -100, max: 100, step: 5 },
      { id: "contrast", label: "Contrast", type: "number", default: 0, min: -100, max: 100, step: 5 },
      { id: "aspect", label: "Char aspect", type: "number", default: 0.5, min: 0.2, max: 1.5, step: 0.05, hint: "Character width ÷ height. 0.5 suits most monospace fonts." },
      { id: "color", label: "Colour HTML", type: "toggle", default: true },
    ],
    run: async ({ inputs, opts, pipeline }) => {
      const src = str(inputs.image);
      if (!src) throw new ToolError("Drop an image, paste one, or pick a sample from the examples.");
      if (!src.startsWith("data:image/")) throw new ToolError("That file is not an image. Use PNG, JPEG, GIF, WebP, BMP or SVG.");
      const { loadRaster, rasterToAscii, colorHtml } = await import("./lib/H-imgascii");
      const o = { cols: num(opts.cols, 100), ramp: str(opts.ramp, "standard"), custom: str(opts.custom), invert: bool(opts.invert), brightness: num(opts.brightness), contrast: num(opts.contrast), aspect: num(opts.aspect, 0.5), dither: bool(opts.dither) };
      let loaded;
      try {
        loaded = await loadRaster(src, o);
      } catch (e) {
        throw new ToolError((e as Error).message);
      }
      const res = rasterToAscii(loaded.raster, o);
      const views: View[] = [{ label: "ASCII", out: { kind: "text", text: res.text } }];
      if (bool(opts.color) && !pipeline) views.push({ label: "Colour", out: { kind: "html", html: colorHtml(res, o.invert) } });
      views.push({ label: "Source", out: { kind: "image", src, name: str(inputs["image:name"], "image") } });
      views.push({
        label: "Stats",
        out: {
          kind: "stats",
          items: [
            { label: "Image", value: `${loaded.iw} × ${loaded.ih}px` },
            { label: "Characters", value: `${res.cols} × ${res.rows}`, tone: "info" },
            { label: "Sampled pixels", value: `${loaded.raster.w} × ${loaded.raster.h}` },
            { label: "Output chars", value: res.text.length },
          ],
        },
      });
      return { text: res.text, views, filename: "ascii-art.txt" };
    },
    skipNodeTest: true,
    examples: [
      { label: "Shaded sphere", inputs: { image: SPHERE, "image:name": "sphere.svg" }, opts: { cols: 80 }, note: "A smooth gradient mapped onto the 10-step @%#*+=-:. ramp — dark pixels get dense characters." },
      { label: "Sphere, dithered detail", inputs: { image: SPHERE, "image:name": "sphere.svg" }, opts: { cols: 100, ramp: "detailed", dither: true }, note: "The 70-character ramp plus Floyd–Steinberg dithering removes visible banding." },
      { label: "Sunset in colour", inputs: { image: SUNSET, "image:name": "sunset.svg" }, opts: { cols: 110, ramp: "blocks", invert: true }, note: "Block shading, inverted for a dark background — open the Colour tab for coloured characters." },
      { label: "Braille heart", inputs: { image: HEART, "image:name": "heart.svg" }, opts: { cols: 48, ramp: "braille" }, note: "Braille packs a 2×4 dot matrix into each character: four times the detail per column." },
      { label: "Mandelbrot (PNG)", inputs: { image: MANDELBROT, "image:name": "mandelbrot.png" }, opts: { cols: 120, contrast: 30 }, note: "A raster PNG with extra contrast; try Invert and the Colour tab." },
      { label: "Custom ramp", inputs: { image: SPHERE, "image:name": "sphere.svg" }, opts: { cols: 72, ramp: "custom", custom: "01 ", contrast: 20 }, note: "Your own dark → light characters — here a binary 0/1 look." },
    ],
    tips: ["Turn on Invert when the art will be shown light-on-dark (terminals).", "Braille packs 8 dots per character — the highest detail per column.", "Lower Char aspect if the result looks stretched vertically."],
  },

  "ascii-tree": {
    inputs: [{ id: "text", label: "Structure", placeholder: "Indented list, paths (a/b/c.txt), JSON, or an existing tree drawing" }],
    options: [
      { id: "from", label: "Input", type: "select", choices: [["auto", "Auto-detect"], ["indent", "Indented list"], ["paths", "Path list"], ["json", "JSON"], ["tree", "Tree drawing"]], default: "auto" },
      { id: "style", label: "Output", type: "select", choices: [["unicode", "Unicode ├──"], ["ascii", "ASCII |--"], ["rounded", "Rounded ╰──"], ["heavy", "Heavy ┣━━"], ["compact", "Compact ├"], ["minimal", "Indent only"], ["markdown", "Markdown list"], ["paths", "Paths (flatten)"], ["json", "JSON"]], default: "unicode" },
      { id: "sort", label: "Sort", type: "segment", choices: [["none", "Input order"], ["asc", "A→Z"], ["desc", "Z→A"]], default: "none" },
      { id: "dirsFirst", label: "Folders first", type: "toggle", default: false },
      { id: "slash", label: "Trailing /", type: "toggle", default: false },
      { id: "icons", label: "Icons 📁", type: "toggle", default: false },
      { id: "counts", label: "Counts", type: "toggle", default: false },
      { id: "root", label: "Root", type: "text", default: "", placeholder: "e.g. .", width: 90 },
      { id: "maxDepth", label: "Max depth", type: "number", default: 0, min: 0, max: 30, hint: "0 = unlimited" },
    ],
    run: ({ inputs, opts }) => {
      const src = str(inputs.text).replace(/\r\n?/g, "\n");
      if (!src.trim()) throw new ToolError("Paste an indented list, a list of paths, JSON, or a tree drawing.");
      const from = str(opts.from, "auto");
      const fmt: TreeFormat = from === "auto" ? detectFormat(src) : (from as TreeFormat);
      let nodes: TNode[];
      try {
        nodes = parseAny(src, fmt);
      } catch (e) {
        const m = (e as Error).message;
        throw new ToolError(fmt === "json" ? `Invalid JSON: ${m}` : m);
      }
      if (!nodes.length) throw new ToolError("No entries found in the input.");
      nodes = sortTree(nodes, str(opts.sort, "none"), bool(opts.dirsFirst));
      const style = str(opts.style, "unicode");
      const text = renderTree(nodes, { style, slash: bool(opts.slash), counts: bool(opts.counts), icons: bool(opts.icons), maxDepth: num(opts.maxDepth, 0), root: str(opts.root).trim(), notes: true });
      const c = countTree(nodes);
      const views: View[] = [
        { label: style === "json" ? "JSON" : style === "markdown" ? "Markdown" : style === "paths" ? "Paths" : "Tree", out: { kind: "text", text, lang: style === "json" ? "json" : style === "markdown" ? "markdown" : undefined } },
        { label: "Structure", out: { kind: "tree", value: treeValue(nodes) } },
        {
          label: "Stats",
          out: {
            kind: "stats",
            items: [
              { label: "Detected input", value: FORMAT_LABEL[fmt], tone: "info" },
              { label: "Folders", value: c.dirs },
              { label: "Files", value: c.files },
              { label: "Max depth", value: c.depth },
            ],
          },
        },
      ];
      return { text, views, lang: style === "json" ? "json" : undefined };
    },
    examples: [
      { label: "Indented project", inputs: { text: PROJECT_INDENT }, opts: { dirsFirst: true }, note: "Two-space indentation becomes a tree; names ending in / are folders and Folders first groups them." },
      { label: "Paths → tree", inputs: { text: PATHS }, opts: { sort: "asc", dirsFirst: true, slash: true, counts: true, root: "." }, note: "One path per line (e.g. from git ls-files) is merged into folders, sorted, with a tree-style summary." },
      { label: "Reverse: tree → paths", inputs: { text: TREE_OUT }, opts: { style: "paths", slash: true }, note: "Paste output from the tree command and flatten it back into paths." },
      { label: "JSON → ASCII", inputs: { text: JSON_TREE }, opts: { style: "ascii", icons: true }, note: "Objects are folders, arrays list files, and string values become # notes." },
      { label: "Outline → Markdown", inputs: { text: MARKDOWN_OUTLINE }, opts: { style: "markdown" }, note: "Mixed -, *, + bullets and tabs are normalised into a clean nested Markdown list." },
      { label: "Restyle a tree", inputs: { text: TREE_OUT }, opts: { style: "rounded", sort: "asc", dirsFirst: true, maxDepth: 2, root: "." }, note: "Re-draw an existing tree with ╰── corners, sorted, and cut off below depth 2." },
      { label: "Broken JSON", inputs: { text: '{"src": {"index.ts": null,}' }, opts: { from: "json" }, error: true, note: "Forcing JSON input shows the parse error." },
    ],
  },

  "ascii-draw": {
    inputs: [
      { id: "art", label: "Drawing", placeholder: "Your drawing as text" },
      { id: "size", label: "Canvas size", kind: "text", placeholder: "80x24" },
    ],
    options: [{ id: "charset", label: "Lines", type: "select", choices: CHARSET_CHOICES, default: "light", hint: "Style for new lines — and what Run converts the whole drawing to" }],
    custom: () => import("./ui/H-AsciiDraw"),
    run: ({ inputs, opts }) => {
      const src = str(inputs.art).replace(/\r\n?/g, "\n");
      if (!src.trim()) return { text: "", notes: ["The canvas is empty — pick a tool and drag on the grid, or paste an ASCII diagram to convert it."], views: [sizeStats("", [{ label: "Canvas", value: str(inputs.size, "80x24") }])] };
      const { w, h } = textSize(src);
      const cs = str(opts.charset, "light") as Charset;
      const text = gridToText(convertCharset(makeGrid(w, h, src), cs));
      return { text, views: [{ label: "Drawing", out: { kind: "text", text } }, sizeStats(text, [{ label: "Line style", value: cs }])] };
    },
    examples: [
      { label: "Architecture", inputs: { art: ARCH, size: "72x18" }, note: "Boxes joined by arrows, drawn with the Rectangle and Arrow tools — junctions like ┬ appear automatically." },
      { label: "Sequence sketch", inputs: { art: SEQUENCE, size: "64x16" }, note: "Lifelines with ├───▶ message arrows. Change Lines to Heavy or Double and press Convert to restyle every line." },
      { label: "Table", inputs: { art: TABLE_ART, size: "56x12" }, note: "A hand-editable table; the Select tool moves blocks and Text edits cells." },
      { label: "ASCII flowchart → Unicode", inputs: { art: FLOW, size: "56x18" }, opts: { charset: "light" }, note: "Classic +-| art: Run (or Convert) turns + corners into ┌ ┐ └ ┘ ├ by reading which neighbours connect." },
      { label: "Blank canvas", inputs: { art: "", size: "80x24" }, note: "Start from scratch: pick a tool (R rectangle, L line, A arrow, T text) and drag on the grid." },
    ],
    steps: ["Pick a tool, then drag on the grid (Rectangle, Line, Arrow) or click (Text, Fill).", "Lines that touch or cross join automatically with the right corner or junction glyph.", "Copy or download the drawing — or Run to convert it to another line style."],
    tips: ["Shortcuts: V select, R rectangle, L line, A arrow, T text, B brush, F fill, E eraser; ⌘/Ctrl+Z undo, ⌘/Ctrl+Shift+Z redo.", "Hold Shift while drawing a line or arrow to bend it vertically first."],
  },
};

export default specs;
