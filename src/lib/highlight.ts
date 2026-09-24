/**
 * A tiny regex tokenizer for syntax colouring in editors and output panes.
 * It is deliberately approximate: one sticky scan per language, no nesting.
 * Returns escaped HTML with <span class="tk-*"> wrappers.
 */
import type { Lang } from "@/src/tools/types";

type Rule = [cls: string, re: RegExp];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const kw = (words: string) => new RegExp(`\\b(?:${words.trim().split(/\s+/).join("|")})\\b`, "y");

const STR_D = /"(?:[^"\\\n]|\\.)*"?/y;
const STR_S = /'(?:[^'\\\n]|\\.)*'?/y;
const STR_B = /`(?:[^`\\]|\\.)*`?/y;
const NUM = /-?\b(?:0x[\da-fA-F_]+|0b[01_]+|0o[0-7_]+|\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?[nLlfFuU]*)\b/y;
const LINE_SLASH = /\/\/[^\n]*/y;
const BLOCK = /\/\*[\s\S]*?(?:\*\/|$)/y;
const HASH = /#[^\n]*/y;
const PUNC = /[{}[\]();,.:]/y;
const OP = /[=+\-*/%<>!&|^~?]+/y;

const C_LIKE_TAIL: Rule[] = [["num", NUM], ["op", OP], ["punc", PUNC]];

const RULES: Partial<Record<Lang, Rule[]>> = {
  json: [
    ["key", /"(?:[^"\\\n]|\\.)*"(?=\s*:)/y],
    ["str", STR_D],
    ["num", /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/y],
    ["kw", /\b(?:true|false|null)\b/y],
    ["com", LINE_SLASH],
    ["punc", /[{}[\],:]/y],
  ],
  js: [
    ["com", BLOCK], ["com", LINE_SLASH], ["str", STR_D], ["str", STR_S], ["str", STR_B],
    ["kw", kw("const let var function return if else for while do switch case break continue new class extends import export from default async await try catch finally throw typeof instanceof in of this super null undefined true false yield delete void static get set")],
    ["type", /\b[A-Z][\w$]*\b/y],
    ["fn", /[a-zA-Z_$][\w$]*(?=\s*\()/y],
    ...C_LIKE_TAIL,
  ],
  ts: [],
  css: [
    ["com", BLOCK],
    ["str", STR_D], ["str", STR_S],
    ["kw", /@[\w-]+/y],
    ["key", /[\w-]+(?=\s*:[^{};]*[;}])/y],
    ["num", /-?\d*\.?\d+(?:px|em|rem|%|vh|vw|s|ms|deg|fr|ch)?/y],
    ["type", /#[\da-fA-F]{3,8}\b/y],
    ["attr", /[.#][\w-]+/y],
    ["punc", /[{}();:,]/y],
  ],
  sql: [
    ["com", /--[^\n]*/y], ["com", BLOCK], ["str", STR_S], ["str", STR_D],
    ["kw", new RegExp(`\\b(?:${"select from where and or not insert into values update set delete create table view index drop alter add column primary key foreign references join inner left right outer full cross on as group by order having limit offset union all distinct case when then else end is null like in between exists asc desc default unique check constraint with returning begin commit rollback transaction if replace pragma cast integer int text varchar char boolean bool real float double decimal numeric date timestamp serial bigint smallint autoincrement over partition window count sum avg min max coalesce".split(" ").join("|")})\\b`, "iy")],
    ["num", NUM], ["op", OP], ["punc", PUNC],
  ],
  yaml: [
    ["com", /#[^\n]*/y],
    ["key", /[^\s:#'"\-][^:#\n]*(?=:(?:\s|$))/y],
    ["str", STR_D], ["str", STR_S],
    ["kw", /\b(?:true|false|null|yes|no|on|off)\b|~/y],
    ["num", NUM],
    ["punc", /[-:|>[\]{},]|---/y],
    ["attr", /[&*][\w-]+|!![\w]+/y],
  ],
  toml: [
    ["com", /#[^\n]*/y],
    ["type", /^\s*\[\[?[^\]\n]+\]\]?/my],
    ["key", /[\w.-]+(?=\s*=)/y],
    ["str", /"""[\s\S]*?"""|'''[\s\S]*?'''/y], ["str", STR_D], ["str", STR_S],
    ["kw", /\b(?:true|false)\b/y], ["num", NUM], ["punc", /[=[\]{},]/y],
  ],
  ini: [["com", /[#;][^\n]*/y], ["type", /\[[^\]\n]+\]/y], ["key", /[\w.-]+(?=\s*=)/y], ["str", STR_D], ["str", STR_S], ["punc", /=/y]],
  python: [
    ["com", HASH], ["str", /[rbfu]*(?:"""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$))/iy], ["str", STR_D], ["str", STR_S],
    ["kw", kw("def class return if elif else for while in not and or is import from as with try except finally raise pass break continue lambda yield global nonlocal assert del async await True False None print self match case")],
    ["attr", /@[\w.]+/y],
    ["fn", /[a-zA-Z_]\w*(?=\s*\()/y],
    ...C_LIKE_TAIL,
  ],
  go: [
    ["com", BLOCK], ["com", LINE_SLASH], ["str", STR_D], ["str", STR_B], ["str", STR_S],
    ["kw", kw("package import func return if else for range switch case default break continue go defer select chan map struct interface type var const nil true false fallthrough goto")],
    ["type", kw("int int8 int16 int32 int64 uint uint8 uint16 uint32 uint64 float32 float64 string bool byte rune error any")],
    ["fn", /[a-zA-Z_]\w*(?=\s*\()/y], ...C_LIKE_TAIL,
  ],
  rust: [
    ["com", BLOCK], ["com", LINE_SLASH], ["str", STR_D],
    ["kw", kw("fn let mut const static if else match for while loop in return break continue struct enum impl trait pub use mod crate self Self super where as ref move async await dyn unsafe type true false Some None Ok Err")],
    ["type", /\b(?:i8|i16|i32|i64|i128|isize|u8|u16|u32|u64|u128|usize|f32|f64|bool|char|str|String|Vec|Option|Result|Box)\b/y],
    ["attr", /#!?\[[^\]\n]*\]/y], ["fn", /[a-z_]\w*!?(?=\s*\()/y], ["type", /\b[A-Z]\w*/y], ...C_LIKE_TAIL,
  ],
  java: [
    ["com", BLOCK], ["com", LINE_SLASH], ["str", STR_D], ["str", STR_S],
    ["kw", kw("public private protected static final abstract class interface enum extends implements new return if else for while do switch case default break continue try catch finally throw throws import package void this super null true false var record instanceof synchronized")],
    ["type", kw("int long short byte char boolean float double String Integer Long List Map Set Object")],
    ["attr", /@\w+/y], ["fn", /[a-zA-Z_]\w*(?=\s*\()/y], ["type", /\b[A-Z]\w*/y], ...C_LIKE_TAIL,
  ],
  shell: [
    ["com", /(?:^|(?<=\s))#[^\n]*/y], ["str", STR_D], ["str", STR_S],
    ["kw", kw("if then else elif fi for do done while case esac function in export local return sudo")],
    ["attr", /\s--?[\w-]+/y], ["type", /\$\{?[\w@#?*!-]+\}?/y], ["punc", /[|&;<>\\]/y],
  ],
  graphql: [
    ["com", HASH], ["str", STR_D],
    ["kw", kw("query mutation subscription fragment on type schema input enum interface union scalar extend implements directive true false null")],
    ["type", /\b[A-Z]\w*/y], ["attr", /[$@]\w+/y], ["punc", /[{}()[\]:!=,|&]/y],
  ],
  dot: [
    ["com", BLOCK], ["com", LINE_SLASH], ["com", HASH], ["str", STR_D],
    ["kw", /\b(?:strict|graph|digraph|subgraph|node|edge)\b/iy],
    ["key", /\w+(?=\s*=)/y], ["op", /->|--/y], ["punc", /[{}[\];,=]/y],
  ],
  mermaid: [
    ["com", /%%[^\n]*/y], ["str", STR_D],
    ["kw", /\b(?:graph|flowchart|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|gantt|pie|journey|gitGraph|mindmap|timeline|quadrantChart|sankey-beta|xychart-beta|block-beta|kanban|participant|actor|loop|alt|else|opt|end|note|subgraph|direction|class|state|section|title|dateFormat|commit|branch|checkout|merge|TD|TB|LR|RL|BT)\b/y],
    ["op", /-{1,3}>{1,2}|={2,3}>|-\.->|--[ox]|<\|--|\*--|o--|\.\.>|\|\|--o\{|}o--o\{|\|o--\|\||[-.]+>>?/y],
    ["punc", /[[\](){}|:;]/y],
  ],
  plantuml: [
    ["com", /'[^\n]*/y], ["kw", /@(?:start|end)\w+/y], ["str", STR_D],
    ["kw", /\b(?:participant|actor|boundary|control|entity|database|collections|queue|class|interface|abstract|enum|package|namespace|note|end|alt|else|opt|loop|par|group|activate|deactivate|return|title|skinparam|start|stop|if|then|endif|while|endwhile|fork|repeat|state|usecase|component|node|rectangle|left|right|over|of|as)\b/y],
    ["op", /-+>>?|<-+|\.+>|<\|--|--\|>|\*--|o--|-->|\.\.\|>/y], ["punc", /[:{}()[\]]/y],
  ],
  scad: [
    ["com", BLOCK], ["com", LINE_SLASH], ["str", STR_D],
    ["kw", kw("module function if else for let each include use true false undef")],
    ["fn", /\b(?:cube|sphere|cylinder|polyhedron|square|circle|polygon|text|translate|rotate|scale|mirror|color|union|difference|intersection|hull|minkowski|linear_extrude|rotate_extrude|offset|resize|echo|sin|cos|tan|sqrt|pow|abs|max|min|len|concat)\b/y],
    ["attr", /\$fn|\$fa|\$fs|\$t/y], ...C_LIKE_TAIL,
  ],
  regex: [
    ["type", /\\[dDwWsSbB]|\\./y], ["kw", /\((?:\?(?:<?[=!]|:|<[\w]+>|P<\w+>))?|\)/y],
    ["str", /\[(?:\\.|[^\]\\])*\]/y], ["op", /[*+?]|\{\d+(?:,\d*)?\}/y], ["punc", /[|^$.]/y],
  ],
};
RULES.ts = [
  ...RULES.js!.slice(0, 5),
  ["kw", kw("interface type enum implements declare namespace readonly keyof infer as satisfies abstract private public protected")],
  ...RULES.js!.slice(5),
  ["type", kw("string number boolean any unknown never void object")],
];

function highlightMarkup(src: string, html: boolean): string {
  // XML / HTML: tags, attributes, comments, text.
  let out = "";
  const re = /<!--[\s\S]*?(?:-->|$)|<!\[CDATA\[[\s\S]*?(?:\]\]>|$)|<\?[\s\S]*?(?:\?>|$)|<!DOCTYPE[^>]*>?|<\/?[\w:.-]+(?:\s+[\w:.@-]+(?:\s*=\s*(?:"[^"]*"?|'[^']*'?|[^\s>]+))?)*\s*\/?>?/giy;
  let i = 0;
  while (i < src.length) {
    re.lastIndex = i;
    const m = re.exec(src);
    if (m && m.index === i && m[0].length) {
      const t = m[0];
      if (t.startsWith("<!--")) out += `<span class="tk-com">${esc(t)}</span>`;
      else if (t.startsWith("<![CDATA[") || t.startsWith("<?") || /^<!DOCTYPE/i.test(t)) out += `<span class="tk-attr">${esc(t)}</span>`;
      else {
        out += t.replace(/^(<\/?)([\w:.-]+)|(\s+)([\w:.@-]+)(\s*=\s*)?("[^"]*"?|'[^']*'?|[^\s>]+)?|(\/?>)$/g, (all, open, name, sp, an, eq, av, close) => {
          if (open) return `<span class="tk-punc">${esc(open)}</span><span class="tk-tag">${esc(name)}</span>`;
          if (an) return `${sp}<span class="tk-attr">${esc(an)}</span>${eq ? `<span class="tk-punc">${esc(eq)}</span>` : ""}${av ? `<span class="tk-str">${esc(av)}</span>` : ""}`;
          if (close) return `<span class="tk-punc">${esc(close)}</span>`;
          return esc(all);
        });
      }
      i += t.length;
    } else {
      const next = src.indexOf("<", i + 1);
      const end = next === -1 ? src.length : next;
      const text = src.slice(i, end);
      out += html ? esc(text).replace(/&amp;[\w#]+;/g, (e) => `<span class="tk-kw">${e}</span>`) : esc(text);
      i = end;
    }
  }
  return out;
}

function highlightMarkdown(src: string): string {
  return src
    .split("\n")
    .map((line) => {
      const e = esc(line);
      if (/^\s*#{1,6}\s/.test(line)) return `<span class="tk-kw">${e}</span>`;
      if (/^\s*```/.test(line)) return `<span class="tk-com">${e}</span>`;
      if (/^\s*>/.test(line)) return `<span class="tk-com">${e}</span>`;
      return e
        .replace(/(\*\*[^*]+\*\*|__[^_]+__)/g, '<span class="tk-type">$1</span>')
        .replace(/(`[^`]+`)/g, '<span class="tk-str">$1</span>')
        .replace(/(\[[^\]]*\]\([^)]*\))/g, '<span class="tk-fn">$1</span>')
        .replace(/^(\s*(?:[-*+]|\d+\.)\s)/, '<span class="tk-punc">$1</span>');
    })
    .join("\n");
}

export const HIGHLIGHT_LIMIT = 80_000;

export function highlight(src: string, lang?: Lang): string {
  if (!lang || lang === "text" || src.length > HIGHLIGHT_LIMIT) return esc(src);
  if (lang === "xml" || lang === "html") return highlightMarkup(src, lang === "html");
  if (lang === "markdown") return highlightMarkdown(src);
  const rules = RULES[lang];
  if (!rules) return esc(src);
  let out = "";
  let plain = "";
  let i = 0;
  const n = src.length;
  outer: while (i < n) {
    for (const [cls, re] of rules) {
      re.lastIndex = i;
      const m = re.exec(src);
      if (m && m.index === i && m[0].length > 0) {
        if (plain) { out += esc(plain); plain = ""; }
        out += `<span class="tk-${cls}">${esc(m[0])}</span>`;
        i += m[0].length;
        continue outer;
      }
    }
    // Consume a whole identifier at once so keywords never match mid-word.
    const w = /[\w$]+|\s+|[^\w\s$]/y;
    w.lastIndex = i;
    const m = w.exec(src)!;
    plain += m[0];
    i += m[0].length;
  }
  if (plain) out += esc(plain);
  return out;
}

export function escapeHtml(s: string) {
  return esc(s).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
