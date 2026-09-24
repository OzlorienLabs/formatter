/** markdown-it setup: GFM task lists, heading ids/anchors, footnotes-lite, plus TOC and stats. */
import type MarkdownIt from "markdown-it";

type Token = { type: string; tag: string; content: string; children: Token[] | null; attrs: [string, string][] | null; attrGet(n: string): string | null; attrSet(n: string, v: string): void; attrJoin(n: string, v: string): void; level: number; nesting: number; info: string; map: [number, number] | null };
type StateCore = { tokens: Token[]; Token: new (type: string, tag: string, nesting: number) => Token; env: Record<string, unknown> };
type StateInline = { src: string; pos: number; posMax: number; push(type: string, tag: string, nesting: number): Token; env: Record<string, unknown> };

export type MdOptions = { html: boolean; linkify: boolean; typographer: boolean; breaks: boolean; tasks: boolean; anchors: boolean; footnotes: boolean };
export type Heading = { level: number; text: string; id: string };

export function slugify(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

function taskLists(md: MarkdownIt) {
  md.core.ruler.after("inline", "c-task-lists", (state: unknown) => {
    const tokens = (state as StateCore).tokens;
    for (let i = 2; i < tokens.length; i++) {
      const inline = tokens[i];
      if (inline.type !== "inline" || tokens[i - 1].type !== "paragraph_open" || tokens[i - 2].type !== "list_item_open") continue;
      const m = /^\[([ xX])\][  ]/.exec(inline.content);
      if (!m) continue;
      const checked = m[1] !== " ";
      const first = inline.children?.[0];
      if (!first || first.type !== "text") continue;
      first.content = first.content.replace(/^\[[ xX]\][  ]/, "");
      const cb = new (state as StateCore).Token("html_inline", "", 0);
      cb.content = `<input class="task-list-item-checkbox" type="checkbox" disabled${checked ? " checked" : ""}> `;
      inline.children!.unshift(cb);
      tokens[i - 2].attrJoin("class", "task-list-item");
      // mark the enclosing list
      for (let k = i - 3; k >= 0; k--) {
        if ((tokens[k].type === "bullet_list_open" || tokens[k].type === "ordered_list_open") && tokens[k].level === tokens[i - 2].level - 1) {
          if (!(tokens[k].attrGet("class") ?? "").includes("contains-task-list")) tokens[k].attrJoin("class", "contains-task-list");
          break;
        }
      }
    }
  });
}

function headingIds(md: MarkdownIt, anchors: boolean) {
  md.core.ruler.push("c-heading-ids", (state: unknown) => {
    const st = state as StateCore;
    const used = new Map<string, number>();
    const heads: Heading[] = [];
    for (let i = 0; i < st.tokens.length; i++) {
      const t = st.tokens[i];
      if (t.type !== "heading_open") continue;
      const inline = st.tokens[i + 1];
      const text = (inline.children ?? []).filter((c) => c.type === "text" || c.type === "code_inline").map((c) => c.content).join("");
      let id = slugify(text) || "section";
      const n = used.get(id) ?? 0;
      used.set(id, n + 1);
      if (n) id = `${id}-${n}`;
      t.attrSet("id", id);
      heads.push({ level: +t.tag.slice(1), text, id });
      if (anchors && inline.children) {
        const a = new st.Token("html_inline", "", 0);
        a.content = ` <a class="md-anchor" href="#${id}" aria-label="Link to this section">#</a>`;
        inline.children.push(a);
      }
    }
    st.env.headings = heads;
  });
}

function footnotes(md: MarkdownIt) {
  md.inline.ruler.after("emphasis", "c-footnote-ref", (state: unknown, silent: boolean) => {
    const s = state as StateInline;
    if (s.src.charCodeAt(s.pos) !== 0x5b || s.src.charCodeAt(s.pos + 1) !== 0x5e) return false;
    const m = /^\[\^([^\]\s]+)\]/.exec(s.src.slice(s.pos));
    if (!m) return false;
    const defs = (s.env.footnoteDefs ?? {}) as Record<string, string>;
    if (!(m[1] in defs)) return false;
    if (!silent) {
      const order = (s.env.footnoteOrder ??= []) as string[];
      let n = order.indexOf(m[1]) + 1;
      if (!n) { order.push(m[1]); n = order.length; }
      const refs = (s.env.footnoteRefs ??= {}) as Record<string, number>;
      refs[m[1]] = (refs[m[1]] ?? 0) + 1;
      const id = slugify(m[1]);
      const tok = s.push("html_inline", "", 0);
      tok.content = `<sup class="footnote-ref"><a href="#fn-${id}" id="fnref-${id}${refs[m[1]] > 1 ? "-" + refs[m[1]] : ""}">[${n}]</a></sup>`;
    }
    s.pos += m[0].length;
    return true;
  });
}

/** Pull "[^id]: text" definitions (with indented continuation lines) out of the source, skipping code fences. */
function extractFootnotes(src: string): { body: string; defs: Record<string, string> } {
  const out: string[] = [];
  const defs: Record<string, string> = {};
  let fence = "";
  let cur: string | null = null;
  for (const line of src.split("\n")) {
    const f = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (f) {
      if (!fence) fence = f[1][0];
      else if (f[1][0] === fence) fence = "";
    }
    if (!fence) {
      const m = /^\[\^([^\]\s]+)\]:\s?(.*)$/.exec(line);
      if (m) { cur = m[1]; defs[cur] = m[2]; continue; }
      if (cur && /^( {2,}|\t)\S/.test(line)) { defs[cur] += "\n" + line.trim(); continue; }
    }
    cur = null;
    out.push(line);
  }
  return { body: out.join("\n"), defs };
}

export async function renderMarkdown(src: string, o: MdOptions) {
  const { default: MD } = await import("markdown-it");
  const md = new MD({ html: o.html, linkify: o.linkify, typographer: o.typographer, breaks: o.breaks, langPrefix: "language-" });
  if (o.tasks) taskLists(md);
  headingIds(md, o.anchors);
  let body = src;
  let defs: Record<string, string> = {};
  if (o.footnotes) {
    ({ body, defs } = extractFootnotes(src));
    footnotes(md);
  }
  const env: Record<string, unknown> = { footnoteDefs: defs };
  const tokens = md.parse(body, env);
  const headings = (env.headings ?? []) as Heading[];
  let html = md.renderer.render(tokens as never, md.options, env);
  const order = (env.footnoteOrder ?? []) as string[];
  if (order.length) {
    html +=
      `<section class="footnotes"><hr><ol>` +
      order
        .map((k) => {
          const id = slugify(k);
          return `<li id="fn-${id}">${md.renderInline(defs[k], env)} <a href="#fnref-${id}" class="footnote-backref" aria-label="Back to reference">↩</a></li>`;
        })
        .join("") +
      `</ol></section>`;
  }
  // stats from tokens
  let links = 0, images = 0, code = 0, tables = 0, tasks = 0, done = 0, lists = 0, quotes = 0;
  const walk = (ts: Token[]) => {
    for (const t of ts) {
      if (t.type === "link_open") links++;
      else if (t.type === "image") images++;
      else if (t.type === "fence" || t.type === "code_block") code++;
      else if (t.type === "table_open") tables++;
      else if (t.type === "bullet_list_open" || t.type === "ordered_list_open") lists++;
      else if (t.type === "blockquote_open") quotes++;
      else if (t.type === "html_inline" && t.content.includes("task-list-item-checkbox")) { tasks++; if (t.content.includes("checked")) done++; }
      if (t.children) walk(t.children);
    }
  };
  walk(tokens as unknown as Token[]);
  const plain = body.replace(/```[\s\S]*?```/g, " ").replace(/`[^`]*`/g, " ").replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/\]\([^)]*\)/g, "]").replace(/<[^>]+>/g, " ").replace(/[#>*_~\-|[\]]/g, " ");
  const words = (plain.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? []).length;
  return { html, headings, stats: { words, links, images, code, tables, tasks, done, lists, quotes, footnotes: order.length }, env };
}

export function tocMarkdown(headings: Heading[], maxLevel = 6): string {
  const hs = headings.filter((h) => h.level <= maxLevel);
  if (!hs.length) return "";
  const min = Math.min(...hs.map((h) => h.level));
  return hs.map((h) => `${"  ".repeat(h.level - min)}- [${h.text}](#${h.id})`).join("\n");
}

export const MD_CSS = `
.prose .task-list-item { list-style: none; }
.prose .contains-task-list { padding-left: 1.2em; }
.prose .task-list-item-checkbox { margin: 0 .45em 0 -1.2em; vertical-align: middle; accent-color: var(--color-accent-700); }
.prose .md-anchor { opacity: 0; text-decoration: none; margin-left: .25em; color: var(--color-accent-600); font-weight: 400; }
.prose h1:hover .md-anchor, .prose h2:hover .md-anchor, .prose h3:hover .md-anchor, .prose h4:hover .md-anchor { opacity: 1; }
.prose .footnotes { font-size: .9em; color: var(--color-neutral-700); margin-top: 2em; }
.prose .footnotes hr { border: 0; border-top: 1px solid var(--color-neutral-300); }
.prose .footnote-ref a { text-decoration: none; font-size: .8em; }
.prose table { margin: .8em 0; }
.prose th { background: rgba(32,30,29,.04); }
.prose hr { border: 0; border-top: 1px solid var(--color-neutral-300); margin: 1.6em 0; }
`;

export const DOC_CSS = `
:root { color-scheme: light dark; }
body { max-width: 760px; margin: 40px auto; padding: 0 20px; font: 16px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1f2328; background: #fff; }
h1, h2 { border-bottom: 1px solid #d1d9e0; padding-bottom: .3em; }
h1, h2, h3, h4 { line-height: 1.25; margin: 1.5em 0 .6em; }
a { color: #0969da; }
code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 85%; }
code { background: rgba(129,139,152,.15); padding: .2em .4em; border-radius: 6px; }
pre { background: #f6f8fa; padding: 16px; border-radius: 6px; overflow: auto; }
pre code { background: none; padding: 0; }
blockquote { margin: 0; padding: 0 1em; color: #59636e; border-left: .25em solid #d1d9e0; }
table { border-collapse: collapse; }
th, td { border: 1px solid #d1d9e0; padding: 6px 13px; }
tr:nth-child(2n) { background: #f6f8fa; }
img { max-width: 100%; }
.task-list-item { list-style: none; }
.task-list-item-checkbox { margin: 0 .3em 0 -1.4em; }
.md-anchor { opacity: 0; text-decoration: none; margin-left: .3em; }
h1:hover .md-anchor, h2:hover .md-anchor, h3:hover .md-anchor { opacity: 1; }
.footnotes { font-size: 85%; color: #59636e; }
@media (prefers-color-scheme: dark) {
  body { background: #0d1117; color: #e6edf3; }
  pre, tr:nth-child(2n) { background: #161b22; }
  th, td, h1, h2 { border-color: #3d444d; }
  a { color: #4493f8; }
}
`;
