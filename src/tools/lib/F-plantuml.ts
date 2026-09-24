/**
 * PlantUML → Mermaid translator. Covers the everyday subset of sequence,
 * class, activity (new syntax), state, use case, component/deployment,
 * mindmap, gantt and ER (IE) diagrams. Anything it cannot express is dropped
 * with a warning that carries the source line number.
 *
 * Also: the PlantUML text encoding (raw deflate + PlantUML's base64 alphabet)
 * so users can paste the code into their own PlantUML server. Nothing is sent.
 */
import { ToolError } from "../types";

export type Warning = { line: number; message: string };
export type Translation = { mermaid: string; kind: string; warnings: Warning[] };
type L = { n: number; t: string };

/* ── helpers ───────────────────────────────────────────────────────── */

const unq = (s: string) => s.trim().replace(/^"(.*)"$/s, "$1").replace(/^\[(.*)\]$/s, "$1").replace(/^\((.*)\)$/s, "$1").replace(/^:(.*):$/s, "$1");
const esc = (s: string) => s.replace(/\\n/g, "<br/>").replace(/"/g, "#quot;");
const stripColor = (s: string) => s.replace(/\s+#[\w#]+(?:[;|/].*)?$/, "").replace(/\s+<<[^>]*>>\s*$/, "");
/** Remove direction words and colour/style brackets from an arrow, and normalise its length. */
function normArrow(a: string) {
  return a
    .replace(/\[[^\]]*\]/g, "")
    .replace(/(up|down|left|right|u|d|l|r|le|ri|do)(?=[-.])/gi, "")
    .replace(/-{2,}/g, "--")
    .replace(/\.{2,}/g, "..");
}

class Ids {
  private map = new Map<string, string>();
  private used = new Set<string>();
  constructor(private prefix = "n") {}
  get(name: string): string {
    const key = name.trim();
    let id = this.map.get(key);
    if (id) return id;
    let base = key.replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "") || this.prefix;
    if (/^\d/.test(base)) base = `${this.prefix}${base}`;
    if (/^(end|graph|subgraph|style|class|click|default|flowchart|direction|call|href|linkStyle|classDef|participant|actor|as|note|loop|alt|else|opt|par|and|rect|activate|deactivate|box|title|autonumber|critical|break|option|create|destroy|links?|properties|details|left|right|over|of|state|namespace)$/i.test(base)) base = `${base}_`;
    id = base;
    for (let i = 2; this.used.has(id); i++) id = `${base}${i}`;
    this.used.add(id);
    this.map.set(key, id);
    return id;
  }
  has(name: string) {
    return this.map.has(name.trim());
  }
  alias(name: string, id: string) {
    this.map.set(name.trim(), id);
    this.used.add(id);
  }
}

/* ── preprocessing ─────────────────────────────────────────────────── */

type Pre = { lines: L[]; tag: string; title: string; lr: boolean; warnings: Warning[] };

function preprocess(src: string): Pre {
  const warnings: Warning[] = [];
  const raw = src.replace(/\r\n?/g, "\n").split("\n");
  const lines: L[] = [];
  let tag = "uml", title = "", lr = false;
  let inBlockComment = false, skipBlock: string | null = null, skipDepth = 0;
  for (let i = 0; i < raw.length; i++) {
    const n = i + 1;
    let t = raw[i];
    if (inBlockComment) {
      if (t.includes("'/")) {
        inBlockComment = false;
        t = t.slice(t.indexOf("'/") + 2);
      } else continue;
    }
    if (t.includes("/'")) {
      const end = t.indexOf("'/", t.indexOf("/'") + 2);
      if (end < 0) {
        inBlockComment = true;
        t = t.slice(0, t.indexOf("/'"));
      } else t = t.slice(0, t.indexOf("/'")) + t.slice(end + 2);
    }
    t = t.trim();
    if (!t || t.startsWith("'")) continue;
    if (skipBlock) {
      if (skipBlock === "{") {
        skipDepth += (t.match(/\{/g) ?? []).length - (t.match(/\}/g) ?? []).length;
        if (skipDepth <= 0) skipBlock = null;
      } else if (new RegExp(`^end\\s*${skipBlock}\\b`, "i").test(t)) skipBlock = null;
      continue;
    }
    const start = t.match(/^@start(\w+)/i);
    if (start) {
      tag = start[1].toLowerCase();
      continue;
    }
    if (/^@end\w+/i.test(t)) continue;
    if (/^skinparam\b/i.test(t)) {
      if (t.endsWith("{")) {
        skipBlock = "{";
        skipDepth = 1;
      }
      warnings.push({ line: n, message: "skinparam ignored — use the Mermaid theme option instead." });
      continue;
    }
    if (/^(legend|header|footer)\b/i.test(t) && !/^(legend|header|footer)\b.*\S.*\bend/i.test(t)) {
      const kw = t.split(/\s/)[0].toLowerCase();
      if (!/^(header|footer)\s+\S/i.test(t) || kw === "legend") skipBlock = kw;
      warnings.push({ line: n, message: `${kw} ignored (not supported by Mermaid).` });
      continue;
    }
    if (/^(!theme|!include|!import|!pragma|!define|!procedure|!function|!\$|scale\b|hide\b|show\b|caption\b|newpage\b|mainframe\b|allowmixing\b|set\s+namespaceSeparator|skin\b)/i.test(t)) {
      warnings.push({ line: n, message: `"${t.split(/\s/)[0]}" ignored${/^!include/i.test(t) ? " — includes are never fetched" : ""}.` });
      continue;
    }
    if (/^left\s+to\s+right\s+direction$/i.test(t)) {
      lr = true;
      continue;
    }
    if (/^top\s+to\s+bottom\s+direction$/i.test(t)) continue;
    const ti = t.match(/^title\s+(.+)$/i);
    if (ti) {
      title = unq(ti[1]);
      continue;
    }
    lines.push({ n, t });
  }
  return { lines, tag, title, lr, warnings };
}

function detect(p: Pre): string {
  const text = p.lines.map((l) => l.t).join("\n");
  if (p.tag === "mindmap" || p.tag === "wbs") return "mindmap";
  if (p.tag === "gantt") return "gantt";
  if (/^(json|yaml|salt|ditaa|dot|math|latex|regex|ebnf|chen|chronology)$/.test(p.tag)) return "unsupported:" + p.tag;
  if (/^\s*\[[^\]]+\]\s+(lasts|requires|starts|ends|happens|is\s+\d+%)/im.test(text) || /^project\s+starts/im.test(text)) return "gantt";
  if (/^(entity|table)\s+("[^"]+"|\S+)(\s+as\s+\S+)?\s*\{/im.test(text) || /^\S+\s+[|}][|o](--|\.\.)[|o][|{]\s+\S+/im.test(text)) return "er";
  if (/^\*+[\s_[]/m.test(text) && !/->|\{/.test(text)) return "mindmap";
  if (/^(start|stop)$/im.test(text) || /^(#\w+)?:[^\n]*;\s*$/m.test(text) || /^(if\s*\(.*\)\s*then|while\s*\(|repeat\s*$|fork\s*$)/im.test(text)) return "activity";
  if (/^\s*\(\*\)/m.test(text)) return "unsupported:legacy activity";
  if (/\[\*\]/.test(text) || /^state\s+/im.test(text)) return "state";
  const count = (re: RegExp) => (text.match(re) ?? []).length;
  const classScore = count(/^(abstract\s+class|abstract|class|enum|annotation)\s+/gim) + count(/<\|--|--\|>|\*--|--\*|o--|--o|\.\.\|>|<\|\.\./g) + (/^interface\s+\S+\s*\{/im.test(text) ? 2 : 0);
  const compScore = count(/^(component|node|database|cloud|package|folder|frame|artifact|storage|queue|rectangle|card|agent|stack|file|boundary|control|collections|hexagon)\b/gim) + count(/^\[[^\]]+\]/gm);
  const ucScore = count(/^usecase\b/gim) + count(/^\s*\([^)]+\)(\s+as\s+\w+)?\s*$/gm) + count(/(-->|--|\.>|->)\s*\([^)]+\)/g);
  const seqScore = count(/^(participant|autonumber|activate|deactivate|alt|loop|opt|par)\b/gim) + count(/^\S+\s*-+>>?\s*\S+\s*:/gm);
  if (seqScore > Math.max(classScore, compScore, ucScore)) return "sequence";
  if (classScore && classScore >= compScore && classScore >= ucScore) return "class";
  if (ucScore && ucScore >= compScore) return "usecase";
  if (compScore) return "component";
  if (/^interface\s+/im.test(text)) return "class";
  return "sequence";
}

/* ── sequence ──────────────────────────────────────────────────────── */

function sequence(p: Pre, W: Warning[]): string[] {
  const out: string[] = ["sequenceDiagram"];
  const ids = new Ids("P");
  const order: string[] = [];
  const blocks: string[] = [];
  const act: { callee: string; caller: string }[] = [];
  let lastFrom = "", lastTo = "";
  const pid = (raw: string) => {
    const name = unq(raw);
    const id = ids.get(name);
    if (!order.includes(id)) order.push(id);
    return id;
  };
  const DECL = /^(participant|actor|boundary|control|entity|database|collections|queue)\s+(.+)$/i;
  const lines = p.lines;
  for (let i = 0; i < lines.length; i++) {
    const { n, t } = lines[i];
    let m: RegExpMatchArray | null;
    if ((m = t.match(DECL))) {
      const kind = m[1].toLowerCase();
      let rest = m[2].replace(/\s+order\s+-?\d+/i, "").replace(/\s+#[\w#]+\s*$/, "").replace(/\s*<<.*>>\s*$/, "").trim();
      let id: string, label = "";
      const asM = rest.match(/^("[^"]+"|\S+)\s+as\s+("[^"]+"|\S+)$/i);
      if (asM) {
        // `participant "Long" as L` and `participant Long as L` → id L; `participant L as "Long"` → id L.
        const [a, b] = [asM[1], asM[2]];
        if (b.startsWith('"') && !a.startsWith('"')) [id, label] = [unq(a), unq(b)];
        else [label, id] = [unq(a), unq(b)];
      } else {
        rest = unq(rest);
        id = rest;
        label = /[^\w]/.test(rest) ? rest : "";
      }
      const mid = ids.get(id);
      if (label) ids.alias(label, mid);
      if (!order.includes(mid)) order.push(mid);
      const kw = kind === "actor" ? "actor" : "participant";
      out.push(`  ${kw} ${mid}${label && label !== mid ? ` as ${label.replace(/\\n/g, " ")}` : ""}`);
      if (!["participant", "actor"].includes(kind)) out.push(`  %% ${mid}: PlantUML ${kind}`);
      continue;
    }
    if (/^autonumber\b/i.test(t)) {
      out.push("  autonumber");
      continue;
    }
    if ((m = t.match(/^(activate|deactivate)\s+(\S+)/i))) {
      const who = pid(m[2]);
      if (m[1].toLowerCase() === "activate") act.push({ callee: who, caller: lastFrom || who });
      else {
        const k = act.map((a) => a.callee).lastIndexOf(who);
        if (k >= 0) act.splice(k, 1);
      }
      out.push(`  ${m[1].toLowerCase()} ${who}`);
      continue;
    }
    if ((m = t.match(/^(destroy|create)\s+(\S+)/i))) {
      W.push({ line: n, message: `"${m[1]}" ignored — Mermaid shows the participant for the whole diagram.` });
      pid(m[2].replace(/^(participant|actor)\s+/i, ""));
      continue;
    }
    if ((m = t.match(/^return\s*(.*)$/i))) {
      const a = act.pop();
      if (!a) {
        W.push({ line: n, message: "return without an active call — ignored." });
        continue;
      }
      out.push(`  ${a.callee}-->>-${a.caller}: ${m[1] || " "}`);
      continue;
    }
    if ((m = t.match(/^(alt|opt|loop|par|break|critical|group)\b\s*(.*)$/i))) {
      let kw = m[1].toLowerCase();
      if (kw === "group") {
        W.push({ line: n, message: "group has no Mermaid equivalent — shown as a critical block." });
        kw = "critical";
      }
      blocks.push(kw);
      out.push(`  ${kw} ${m[2] || " "}`.trimEnd());
      continue;
    }
    if ((m = t.match(/^else\b\s*(.*)$/i))) {
      out.push(`  ${blocks[blocks.length - 1] === "par" ? "and" : blocks[blocks.length - 1] === "critical" ? "option" : "else"} ${m[1]}`.trimEnd());
      continue;
    }
    if (/^end$/i.test(t)) {
      blocks.pop();
      out.push("  end");
      continue;
    }
    if ((m = t.match(/^box\s*(.*)$/i))) {
      const label = unq(m[1].replace(/\s*#[\w#]+\s*$/, "")) || " ";
      blocks.push("box");
      out.push(`  box rgba(0,136,176,0.07) ${label}`);
      continue;
    }
    if (/^end\s*box$/i.test(t)) {
      blocks.pop();
      out.push("  end");
      continue;
    }
    if ((m = t.match(/^(?:note|hnote|rnote)\s+(left|right|over)(?:\s+of)?\s*([^:]*?)\s*(?::\s*(.*))?$/i))) {
      let text = m[3];
      if (text === undefined) {
        const body: string[] = [];
        while (++i < lines.length && !/^end\s*(note|hnote|rnote)$/i.test(lines[i].t)) body.push(lines[i].t);
        text = body.join("<br/>");
      }
      const who = m[2].trim() ? m[2].split(",").map((x) => pid(x)).join(",") : lastTo || lastFrom || order[0];
      if (!who) {
        W.push({ line: n, message: "note before any participant — ignored." });
        continue;
      }
      const pos = m[1].toLowerCase() === "over" ? "over" : `${m[1].toLowerCase()} of`;
      out.push(`  Note ${pos} ${who}: ${text.replace(/\\n/g, "<br/>").replace(/;/g, ",") || " "}`);
      continue;
    }
    if ((m = t.match(/^ref\s+over\s+([^:]+?)\s*:\s*(.*)$/i))) {
      out.push(`  Note over ${m[1].split(",").map((x) => pid(x)).join(",")}: ref: ${m[2]}`);
      continue;
    }
    if ((m = t.match(/^==+\s*(.*?)\s*==+$/))) {
      out.push(`  %%SEP%% ${m[1]}`);
      continue;
    }
    if (/^(\.\.\.|\|\|\|?|\|\|\d+\|\|)/.test(t) || /^\.\.\..*\.\.\.$/.test(t)) continue;
    if (/^(divider|delay)\b/i.test(t)) continue;
    // Messages
    m = t.match(/^("[^"]+"|[\w.@$À-￿]+|\[|\])\s*([ox]?(?:<<?|\\{1,2}|\/{1,2})?[-.]+(?:\[[^\]]*\])?[-.]*(?:>>?|\\{1,2}|\/{1,2})?[xo]?)\s*("[^"]+"|[\w.@$À-￿]+|\[|\])\s*(\+\+|--|\*\*|!!)?\s*(?:(\+\+|--)\s*)?(?::\s*(.*))?$/);
    if (m && /[-.]/.test(m[2])) {
      let [, a, arrow, b, mod, mod2, text = ""] = m;
      arrow = arrow.replace(/\[[^\]]*\]/g, "");
      const dashed = /--|\.\./.test(arrow);
      let from = a, to = b;
      const leftHead = /^[ox]?(<|\\|\/)/.test(arrow);
      const rightHead = /(>|\\|\/)[xo]?$/.test(arrow);
      const reversed = leftHead && !rightHead;
      const both = leftHead && rightHead;
      if (reversed) [from, to] = [b, a];
      if (from === "[" || from === "]" || to === "[" || to === "]") {
        W.push({ line: n, message: "Found/lost messages ([ or ]) are drawn from/to the participant itself." });
        if (from === "[" || from === "]") from = to;
        else to = from;
      }
      const f = pid(from), tt = pid(to);
      let arr = dashed ? "-->>" : "->>";
      if (/x$/.test(arrow) || /^x/.test(arrow)) arr = dashed ? "--x" : "-x";
      else if (/>>|<<|\\|\//.test(arrow)) arr = dashed ? "--)" : "-)";
      if (both) arr = dashed ? "<<-->>" : "<<->>";
      const mods = [mod, mod2].filter(Boolean);
      let pre = "";
      if (mods.includes("++")) {
        pre = "+";
        act.push({ callee: tt, caller: f });
      } else if (mods.includes("--")) {
        pre = "-";
        const k = act.map((x) => x.callee).lastIndexOf(f);
        if (k >= 0) act.splice(k, 1);
      }
      if (mods.includes("**") || mods.includes("!!")) W.push({ line: n, message: "Create/destroy markers (** / !!) ignored." });
      out.push(`  ${f}${arr}${pre}${tt}: ${text.replace(/\\n/g, "<br/>").replace(/;/g, ",") || " "}`);
      lastFrom = f;
      lastTo = tt;
      continue;
    }
    W.push({ line: n, message: `Not understood, skipped: ${t}` });
  }
  let depth = 1;
  return out.map((l) => {
    const sep = l.match(/^ {2}%%SEP%% (.*)$/);
    const line = sep ? (order.length ? `  Note over ${order.length > 1 ? `${order[0]},${order[order.length - 1]}` : order[0]}: ${sep[1]}` : "") : l;
    const body = line.trim();
    if (!body || body === "sequenceDiagram") return line;
    if (/^end$/.test(body)) depth = Math.max(1, depth - 1);
    const pad = "  ".repeat(/^(else|and|option)\b/.test(body) ? Math.max(1, depth - 1) : depth);
    if (/^(alt|opt|loop|par|break|critical|box|rect)\b/.test(body)) {
      depth++;
      return pad + body;
    }
    return pad + body;
  });
}

/* ── class ─────────────────────────────────────────────────────────── */

function classMember(raw: string): string {
  let s = raw.trim();
  let suffix = "";
  if (/\{static\}|\{classifier\}/i.test(s)) {
    suffix = "$";
    s = s.replace(/\{(static|classifier)\}\s*/gi, "");
  }
  if (/\{abstract\}/i.test(s)) {
    suffix = "*";
    s = s.replace(/\{abstract\}\s*/gi, "");
  }
  const vis = /^[+\-#~]/.test(s) ? s[0] : "";
  if (vis) s = s.slice(1).trim();
  const method = s.match(/^([\w$]+)\s*\((.*)\)\s*(?::\s*(.+))?$/);
  if (method) return `${vis}${method[1]}(${method[2].replace(/(\w+)\s*:\s*([\w<>[\],.]+)/g, "$2 $1").replace(/</g, "~").replace(/>/g, "~")})${method[3] ? " " + method[3].replace(/</g, "~").replace(/>/g, "~") : ""}${suffix}`;
  const field = s.match(/^([\w$]+)\s*:\s*(.+)$/);
  if (field) return `${vis}${field[2].trim().replace(/</g, "~").replace(/>/g, "~").replace(/\s+/g, "")} ${field[1]}${suffix}`;
  const typed = s.match(/^([\w<>[\],.]+)\s+([\w$]+)(\(.*\))?$/);
  if (typed) return `${vis}${typed[1].replace(/</g, "~").replace(/>/g, "~")} ${typed[2]}${typed[3] ?? ""}${suffix}`;
  return `${vis}${s.replace(/</g, "~").replace(/>/g, "~")}${suffix}`;
}

function classDiagram(p: Pre, W: Warning[]): string[] {
  const out: string[] = ["classDiagram"];
  if (p.lr) out.push("  direction LR");
  const ids = new Ids("C");
  const rels: string[] = [];
  const notes: string[] = [];
  const pkgStack: { name: string; lines: string[] }[] = [];
  const emit = (s: string) => (pkgStack.length ? pkgStack[pkgStack.length - 1].lines : out).push(s);
  const cid = (raw: string) => {
    const name = unq(raw).replace(/<.*>$/, "");
    return ids.get(name.includes(".") ? name : name);
  };
  const lines = p.lines;
  for (let i = 0; i < lines.length; i++) {
    const { n, t } = lines[i];
    let m: RegExpMatchArray | null;
    if ((m = t.match(/^(package|namespace|together)\s*("[^"]+"|[\w.:-]+)?\s*(?:<<\w+>>)?\s*(?:#\S+)?\s*\{$/i))) {
      if (m[1].toLowerCase() === "together") {
        pkgStack.push({ name: "", lines: [] });
        continue;
      }
      pkgStack.push({ name: unq(m[2] ?? "pkg").replace(/[^\w.]+/g, "_"), lines: [] });
      continue;
    }
    if (t === "}" && pkgStack.length) {
      const pk = pkgStack.pop()!;
      const target = pkgStack.length ? pkgStack[pkgStack.length - 1].lines : out;
      if (!pk.name || !pk.lines.length) target.push(...pk.lines);
      else {
        if (pkgStack.length) W.push({ line: n, message: "Nested packages are flattened (Mermaid namespaces cannot nest)." });
        target.push(`  namespace ${pk.name.replace(/\./g, "_")} {`, ...pk.lines.map((l) => "  " + l), "  }");
      }
      continue;
    }
    m = t.match(/^(abstract\s+class|abstract|class|interface|enum|annotation|entity|exception|struct|record|protocol|metaclass|stereotype|dataclass)\s+("[^"]+"|[\w.$]+(?:<[^>]*>)?)(?:\s+as\s+("[^"]+"|[\w.$]+))?\s*(<<[^>]+>>)?\s*(?:#[\w#]+)?\s*(?:(?:extends|implements)\s+[\w.,\s]+)?\s*(\{)?\s*(\})?$/i);
    if (m) {
      const kind = m[1].toLowerCase().replace(/\s+class$/, "");
      const display = unq(m[2]);
      const generic = display.match(/<([^>]*)>$/)?.[1];
      const alias = m[3] ? unq(m[3]) : "";
      const id = alias ? ids.get(alias) : cid(display);
      if (alias) ids.alias(display, id);
      const label = alias || /[^\w]/.test(display.replace(/<.*>$/, "")) ? `["${display.replace(/<.*>$/, "").replace(/"/g, "'")}"]` : "";
      const head = `  class ${id}${generic ? `~${generic.replace(/\s/g, "")}~` : ""}${label}`;
      const members: string[] = [];
      const ext = t.match(/\b(extends|implements)\s+([\w.,\s]+?)\s*\{?$/i);
      if (ext) for (const parent of ext[2].split(",").map((x) => x.trim()).filter(Boolean)) rels.push(`  ${cid(parent)} ${ext[1].toLowerCase() === "extends" ? "<|--" : "<|.."} ${id}`);
      if (m[5] && !m[6]) {
        while (++i < lines.length && lines[i].t !== "}") {
          const x = lines[i].t;
          if (/^(--|==|\.\.|__)/.test(x)) continue;
          if (kind === "enum") x.split(/[,\s]+/).filter(Boolean).forEach((v) => members.push(`    ${v.replace(/[^\w]/g, "")}`));
          else members.push(`    ${classMember(x)}`);
        }
      }
      emit(members.length ? `${head} {` : head);
      const stereo = m[4]?.replace(/[<>]/g, "") ?? (kind === "interface" ? "interface" : kind === "abstract" ? "abstract" : kind === "enum" ? "enumeration" : kind !== "class" ? kind : "");
      if (members.length) {
        if (stereo) emit(`    <<${stereo}>>`);
        members.forEach((x) => emit(x));
        emit("  }");
      } else if (stereo) emit(`  <<${stereo}>> ${id}`);
      continue;
    }
    if ((m = t.match(/^("[^"]+"|[\w.$]+)\s*:\s*(.+)$/)) && !/[-.]{2}/.test(m[1])) {
      emit(`  ${cid(m[1])} : ${classMember(m[2])}`);
      continue;
    }
    if ((m = t.match(/^note\s+"([^"]+)"(?:\s+as\s+\w+)?$/i))) {
      notes.push(`  note "${esc(m[1])}"`);
      continue;
    }
    if ((m = t.match(/^note\s+(?:(top|bottom|left|right)\s+of\s+)?("[^"]+"|[\w.$]+)?\s*(?::\s*(.*))?$/i))) {
      let text = m[3];
      if (text === undefined) {
        const body: string[] = [];
        while (++i < lines.length && !/^end\s*note$/i.test(lines[i].t)) body.push(lines[i].t);
        text = body.join("<br/>");
      }
      if (m[2] && m[1]) notes.push(`  note for ${cid(m[2])} "${esc(text)}"`);
      else {
        const floating = t.match(/^note\s+"([^"]+)"/i);
        notes.push(`  note "${esc(floating ? floating[1] : text)}"`);
      }
      continue;
    }
    m = t.match(/^("[^"]+"|[\w.$]+(?:<[^>]*>)?)\s*(?:"([^"]*)"\s*)?([<*o#x}+^|]*[-.]+(?:\w+[-.]+)?[>*o#x{+^|]*)\s*(?:"([^"]*)"\s*)?("[^"]+"|[\w.$]+(?:<[^>]*>)?)\s*(?::\s*(.*))?$/);
    if (m && /[-.]/.test(m[3])) {
      const [, a, ma, arrowRaw, mb, b, label] = m;
      const arrow = normArrow(arrowRaw);
      const lm = arrow.match(/^([<*o#x}+^|]*)([-.]+)([>*o#x{+^|]*)$/);
      if (!lm) {
        W.push({ line: n, message: `Unrecognised relation "${arrowRaw}".` });
        continue;
      }
      const conv = (h: string, left: boolean) => (h === "<|" || h === "^" ? "<|" : h === "|>" ? "|>" : h === "*" ? "*" : h === "o" ? "o" : h === "<" ? "<" : h === ">" ? ">" : h === "" ? "" : (W.push({ line: n, message: `Arrow head "${h}" approximated.` }), left ? "<" : ">"));
      const line = lm[2].includes(".") ? ".." : "--";
      const rel = `${conv(lm[1], true)}${line}${conv(lm[3], false)}`;
      const lab = label ? ` : ${label.replace(/\s*[<>]\s*$/, "").replace(/^\s*[<>]\s*/, "").trim()}` : "";
      rels.push(`  ${cid(a)}${ma !== undefined ? ` "${ma}"` : ""} ${rel}${mb !== undefined ? ` "${mb}"` : ""} ${cid(b)}${lab}`);
      continue;
    }
    if (/^(remove|hide|show|set)\b/i.test(t)) continue;
    W.push({ line: n, message: `Not understood, skipped: ${t}` });
  }
  return [...out, ...rels, ...notes];
}

/* ── activity (new syntax) ─────────────────────────────────────────── */

type Front = { id: string; label?: string }[];
type Group = { name: string; ids: string[]; kids: Group[]; kind: "partition" | "lane" };

function activity(p: Pre, W: Warning[]): string[] {
  const nodes: string[] = [];
  const edges: string[] = [];
  const notes: string[] = [];
  let seq = 0;
  let front: Front = [];
  let pendingLabel = "";
  let last = "";
  const stack: { kind: string; d?: string; ends: Front; hasElse?: boolean; first?: string | null; bar?: string; exit?: string }[] = [];
  const root: Group = { name: "", ids: [], kids: [], kind: "partition" };
  const groupStack: Group[] = [root];
  const lanes = new Map<string, Group>();
  let lane: Group | null = null;

  const place = (id: string) => {
    const g = groupStack[groupStack.length - 1];
    if (g === root && lane) lane.ids.push(id);
    else g.ids.push(id);
  };
  const add = (def: (id: string) => string, connect = true) => {
    const id = `a${seq++}`;
    nodes.push(`  ${def(id)}`);
    place(id);
    if (connect)
      for (const f of front) {
        const lab = f.label || pendingLabel;
        edges.push(`  ${f.id} -->${lab ? `|"${esc(lab)}"|` : ""} ${id}`);
      }
    pendingLabel = "";
    for (const s of stack) if (s.kind === "repeat" && s.first === null) s.first = id;
    front = [{ id }];
    last = id;
    return id;
  };
  const lines = p.lines;
  for (let i = 0; i < lines.length; i++) {
    const { n } = lines[i];
    let t = lines[i].t;
    let m: RegExpMatchArray | null;
    if (/^start$/i.test(t)) {
      add((id) => `${id}((" ")):::start`, false);
      continue;
    }
    if (/^(stop|end)$/i.test(t)) {
      add((id) => `${id}(((" "))):::stop`);
      front = [];
      continue;
    }
    if (/^(detach|kill)$/i.test(t)) {
      front = [];
      continue;
    }
    // Action, possibly multi-line, with optional colour prefix.
    if ((m = t.match(/^(#[\w#]+)?\s*:(.*)$/s))) {
      let body = m[2];
      while (!/[;|<>/\]}]\s*$/.test(body) && i + 1 < lines.length) body += "\n" + lines[++i].t;
      const shapeEnd = body.trim().slice(-1);
      body = body.trim().slice(0, -1);
      const text = esc(body.replace(/\n/g, "<br/>").replace(/\*\*(.*?)\*\*/g, "<b>$1</b>"));
      const shape = shapeEnd === "|" ? ["[/", "/]"] : shapeEnd === ">" ? [">", "]"] : shapeEnd === "<" ? ["[\\", "\\]"] : shapeEnd === "]" ? ["[", "]"] : ["(", ")"];
      add((id) => `${id}${shape[0]}"${text}"${shape[1]}`);
      continue;
    }
    if ((m = t.match(/^-+>\s*(.*?);?$/))) {
      pendingLabel = m[1];
      for (const f of front) f.label = f.label || m[1];
      continue;
    }
    if ((m = t.match(/^if\s*\((.*?)\)\s*(?:is\s*\((.*?)\)\s*)?(?:then\s*(?:\((.*?)\))?)?\s*$/i))) {
      const d = add((id) => `${id}{"${esc(m![1] + (m![2] ? ` ${m![2]}` : ""))}"}`);
      stack.push({ kind: "if", d, ends: [] });
      front = [{ id: d, label: m[3] ?? "" }];
      continue;
    }
    let prevLabel = "";
    const pre = t.match(/^\(([^)]*)\)\s*((?:else\s*if|elseif|else)\b.*)$/i);
    if (pre) {
      prevLabel = pre[1];
      t = pre[2];
    }
    if ((m = t.match(/^(?:else\s*if|elseif)\s*\((.*?)\)\s*(?:is\s*\((.*?)\)\s*)?(?:then\s*(?:\((.*?)\))?)?\s*$/i))) {
      const top = stack[stack.length - 1];
      if (!top || top.kind !== "if") {
        W.push({ line: n, message: "elseif without if." });
        continue;
      }
      top.ends.push(...front);
      front = [{ id: top.d!, label: prevLabel }];
      const d = add((id) => `${id}{"${esc(m![1])}"}`);
      top.d = d;
      front = [{ id: d, label: m[3] ?? "" }];
      continue;
    }
    if ((m = t.match(/^else\s*(?:\((.*?)\))?\s*$/i))) {
      const top = stack[stack.length - 1];
      if (!top || (top.kind !== "if" && top.kind !== "switch")) {
        W.push({ line: n, message: "else without if." });
        continue;
      }
      top.ends.push(...front);
      top.hasElse = true;
      front = [{ id: top.d!, label: m[1] ?? "" }];
      continue;
    }
    if (/^end\s*if$/i.test(t)) {
      const top = stack.pop();
      if (!top || top.kind !== "if") {
        W.push({ line: n, message: "endif without if." });
        continue;
      }
      if (!top.hasElse) top.ends.push({ id: top.d! });
      front = [...top.ends, ...front];
      continue;
    }
    if ((m = t.match(/^switch\s*\((.*)\)\s*$/i))) {
      const d = add((id) => `${id}{"${esc(m![1])}"}`);
      stack.push({ kind: "switch", d, ends: [], first: undefined });
      front = [];
      continue;
    }
    if ((m = t.match(/^case\s*\((.*)\)\s*$/i))) {
      const top = stack[stack.length - 1];
      if (!top || top.kind !== "switch") continue;
      top.ends.push(...front);
      front = [{ id: top.d!, label: m[1] }];
      continue;
    }
    if (/^end\s*switch$/i.test(t)) {
      const top = stack.pop();
      if (top) front = [...top.ends, ...front];
      continue;
    }
    if ((m = t.match(/^while\s*\((.*?)\)\s*(?:is\s*\((.*?)\))?\s*$/i))) {
      const d = add((id) => `${id}{"${esc(m![1])}"}`);
      stack.push({ kind: "while", d, ends: [] });
      front = [{ id: d, label: m[2] ?? "" }];
      continue;
    }
    if ((m = t.match(/^end\s*while\s*(?:\((.*?)\))?\s*$/i))) {
      const top = stack.pop();
      if (!top || top.kind !== "while") {
        W.push({ line: n, message: "endwhile without while." });
        continue;
      }
      for (const f of front) edges.push(`  ${f.id} -->${f.label ? `|"${esc(f.label)}"|` : ""} ${top.d}`);
      front = [{ id: top.d!, label: m[1] ?? "" }, ...top.ends];
      continue;
    }
    if ((m = t.match(/^repeat\s*(?::(.*);)?$/i))) {
      stack.push({ kind: "repeat", ends: [], first: null });
      if (m[1] !== undefined) add((id) => `${id}("${esc(m![1])}")`);
      continue;
    }
    if ((m = t.match(/^repeat\s*while\s*\((.*?)\)\s*(?:is\s*\((.*?)\))?\s*(?:not\s*\((.*?)\))?\s*$/i))) {
      const top = stack.pop();
      if (!top || top.kind !== "repeat") {
        W.push({ line: n, message: "repeat while without repeat." });
        continue;
      }
      const d = add((id) => `${id}{"${esc(m![1])}"}`);
      if (top.first) edges.push(`  ${d} -->${m[2] ? `|"${esc(m[2])}"|` : ""} ${top.first}`);
      front = [{ id: d, label: m[3] ?? "" }];
      continue;
    }
    if (/^backward\s*:/i.test(t)) {
      W.push({ line: n, message: "backward actions are not drawn." });
      continue;
    }
    if (/^break$/i.test(t)) {
      W.push({ line: n, message: "break ignored." });
      continue;
    }
    if (/^(fork|split)$/i.test(t)) {
      const bar = add((id) => `${id}[" "]:::bar`);
      stack.push({ kind: "fork", ends: [], bar });
      continue;
    }
    if (/^(fork|split)\s+again$/i.test(t)) {
      const top = stack[stack.length - 1];
      if (!top || top.kind !== "fork") continue;
      top.ends.push(...front);
      front = [{ id: top.bar! }];
      continue;
    }
    if (/^end\s*(fork|merge|split)(\s*\{.*\})?$/i.test(t)) {
      const top = stack.pop();
      if (!top || top.kind !== "fork") continue;
      front = [...top.ends, ...front];
      add((id) => `${id}[" "]:::bar`);
      continue;
    }
    if ((m = t.match(/^(partition|group|package|rectangle|card)\s+("[^"]+"|[^{]+?)\s*(?:#\S+\s*)?\{?$/i))) {
      const g: Group = { name: unq(m[2]), ids: [], kids: [], kind: "partition" };
      groupStack[groupStack.length - 1].kids.push(g);
      groupStack.push(g);
      continue;
    }
    if (t === "}" || /^end\s*group$/i.test(t)) {
      if (groupStack.length > 1) groupStack.pop();
      continue;
    }
    if ((m = t.match(/^\|(?:#?[\w#]+\|)?([^|]+)\|$/))) {
      const name = m[1].trim();
      if (!lanes.has(name)) {
        const g: Group = { name, ids: [], kids: [], kind: "lane" };
        lanes.set(name, g);
      }
      lane = lanes.get(name)!;
      continue;
    }
    if ((m = t.match(/^(?:floating\s+)?note\s+(left|right)?\s*(?::\s*(.*))?$/i))) {
      let text = m[2];
      if (text === undefined) {
        const body: string[] = [];
        while (++i < lines.length && !/^end\s*note$/i.test(lines[i].t)) body.push(lines[i].t);
        text = body.join("<br/>");
      }
      const id = `a${seq++}`;
      notes.push(`  ${id}["${esc(text)}"]:::note`);
      if (last) notes.push(`  ${last} -.- ${id}`);
      continue;
    }
    if (/^(end\s*note)$/i.test(t)) continue;
    t = t.replace(/;$/, "");
    W.push({ line: n, message: `Not understood, skipped: ${t}` });
  }
  if (stack.length) W.push({ line: lines[lines.length - 1]?.n ?? 0, message: `${stack.length} unclosed block(s) (${stack.map((s) => s.kind).join(", ")}).` });
  const out = [`flowchart ${p.lr ? "LR" : "TD"}`, ...nodes, ...edges, ...notes];
  let gseq = 0;
  const emitGroup = (g: Group, depth: number) => {
    const pad = "  ".repeat(depth);
    out.push(`${pad}subgraph g${gseq++}["${esc(g.name)}"]`);
    if (g.kind === "lane") out.push(`${pad}  direction TB`);
    for (const id of g.ids) out.push(`${pad}  ${id}`);
    for (const k of g.kids) emitGroup(k, depth + 1);
    out.push(`${pad}end`);
  };
  for (const g of lanes.values()) if (g.ids.length) emitGroup(g, 1);
  for (const k of root.kids) emitGroup(k, 1);
  out.push(
    "  classDef start fill:#1f1f1f,stroke:#1f1f1f,color:#1f1f1f",
    "  classDef stop fill:#1f1f1f,stroke:#1f1f1f,color:#1f1f1f",
    "  classDef bar fill:#1f1f1f,stroke:#1f1f1f,color:#1f1f1f,font-size:2px",
    "  classDef note fill:#fff8c4,stroke:#c9b458,color:#333"
  );
  return out;
}

/* ── state ─────────────────────────────────────────────────────────── */

function stateDiagram(p: Pre, W: Warning[]): string[] {
  const out = ["stateDiagram-v2"];
  if (p.lr) out.push("  direction LR");
  let depth = 1;
  const lines = p.lines;
  const sid = (s: string) => (s === "[*]" ? s : unq(s).replace(/[^\w]+/g, "_"));
  for (let i = 0; i < lines.length; i++) {
    const { n } = lines[i];
    const t = lines[i].t;
    const pad = "  ".repeat(depth);
    let m: RegExpMatchArray | null;
    if ((m = t.match(/^state\s+("[^"]+"|[\w.]+)(?:\s+as\s+("[^"]+"|[\w.]+))?\s*(<<\w+>>)?\s*(?:#[\w#;:.]+)?\s*(\{)?\s*(?::\s*(.*))?$/i))) {
      let [, a, b, stereo, brace, desc] = m;
      let id = sid(a), label = "";
      if (b) {
        if (a.startsWith('"')) [label, id] = [unq(a), sid(b)];
        else [id, label] = [sid(a), unq(b)];
      }
      if (stereo && !/^<<(fork|join|choice)>>$/i.test(stereo)) {
        W.push({ line: n, message: `${stereo} states are drawn as plain states.` });
        stereo = "";
      }
      if (label) out.push(`${pad}state "${label.replace(/"/g, "'")}" as ${id}`);
      if (stereo) out.push(`${pad}state ${id} ${stereo.toLowerCase()}`);
      if (desc) out.push(`${pad}${id} : ${desc}`);
      if (brace) {
        out.push(`${pad}state ${id} {`);
        depth++;
      } else if (!label && !stereo && !desc) out.push(`${pad}${id}`);
      continue;
    }
    if (t === "}") {
      depth = Math.max(1, depth - 1);
      out.push(`${"  ".repeat(depth)}}`);
      continue;
    }
    if (/^(--|\|\|)$/.test(t)) {
      out.push(`${pad}--`);
      continue;
    }
    if ((m = t.match(/^note\s+(left|right|top|bottom)\s+of\s+("[^"]+"|[\w.]+)\s*(?::\s*(.*))?$/i))) {
      const side = /left|top/i.test(m[1]) ? "left" : "right";
      if (m[3] !== undefined) out.push(`${pad}note ${side} of ${sid(m[2])} : ${m[3]}`);
      else {
        out.push(`${pad}note ${side} of ${sid(m[2])}`);
        while (++i < lines.length && !/^end\s*note$/i.test(lines[i].t)) out.push(`${pad}  ${lines[i].t}`);
        out.push(`${pad}end note`);
      }
      continue;
    }
    if (/^note\s/i.test(t)) {
      W.push({ line: n, message: "Floating notes are not supported in Mermaid state diagrams." });
      if (!/:/.test(t)) while (++i < lines.length && !/^end\s*note$/i.test(lines[i].t));
      continue;
    }
    m = t.match(/^("[^"]+"|\[\*\]|\[H\*?\]|[\w.]+)\s*([<]?[-.]+(?:\[[^\]]*\])?(?:\w+)?[-.]*[>]?)\s*("[^"]+"|\[\*\]|\[H\*?\]|[\w.]+)\s*(?::\s*(.*))?$/);
    if (m && /[-.]/.test(m[2])) {
      let [, a, arrow, b, label] = m;
      if (/\[H/.test(a + b)) {
        W.push({ line: n, message: "History states ([H]) are not supported." });
        continue;
      }
      if (/^</.test(arrow.replace(/\[[^\]]*\]/g, ""))) [a, b] = [b, a];
      out.push(`${pad}${sid(a)} --> ${sid(b)}${label ? ` : ${label}` : ""}`);
      continue;
    }
    if ((m = t.match(/^("[^"]+"|[\w.]+)\s*:\s*(.*)$/))) {
      out.push(`${pad}${sid(m[1])} : ${m[2]}`);
      continue;
    }
    W.push({ line: n, message: `Not understood, skipped: ${t}` });
  }
  return out;
}

/* ── use case & component (flowcharts) ─────────────────────────────── */

type Shape = (label: string) => string;
const SHAPES: Record<string, Shape> = {
  actor: (l) => `(["👤 ${l}"])`,
  person: (l) => `(["👤 ${l}"])`,
  usecase: (l) => `(["${l}"])`,
  component: (l) => `[["${l}"]]`,
  database: (l) => `[("${l}")]`,
  storage: (l) => `[("${l}")]`,
  queue: (l) => `[/"${l}"/]`,
  collections: (l) => `[["${l}"]]`,
  cloud: (l) => `(("☁ ${l}"))`,
  interface: (l) => `(("${l}"))`,
  artifact: (l) => `>"${l}"]`,
  file: (l) => `>"${l}"]`,
  hexagon: (l) => `{{"${l}"}}`,
  boundary: (l) => `(["${l}"])`,
  control: (l) => `(("${l}"))`,
  entity: (l) => `(["${l}"])`,
  default: (l) => `["${l}"]`,
};
const CONTAINERS = /^(package|node|folder|frame|cloud|database|rectangle|card|component|namespace|together|stack|storage|agent|file|artifact)$/i;
const ELEMENT_KW = "actor|person|usecase|component|database|storage|queue|collections|cloud|interface|artifact|file|hexagon|boundary|control|entity|node|folder|frame|package|rectangle|card|agent|stack|label|circle|port|portin|portout";

function flowFromElements(p: Pre, W: Warning[], kind: "usecase" | "component"): string[] {
  const ids = new Ids(kind === "usecase" ? "U" : "N");
  const defined = new Set<string>();
  const nodes: string[] = [];
  const edges: string[] = [];
  const out: string[] = [`flowchart ${kind === "usecase" || p.lr ? "LR" : "TD"}`];
  const groupLines: string[][] = [out];
  const emit = (s: string) => groupLines[groupLines.length - 1].push(s);
  let gseq = 0;

  const define = (kw: string, label: string, alias?: string) => {
    const id = ids.get(alias ?? label);
    if (alias) ids.alias(label, id);
    if (!defined.has(id)) {
      defined.add(id);
      const shape = (SHAPES[kw.toLowerCase()] ?? SHAPES.default)(esc(label.replace(/\\n/g, "<br/>")));
      emit(`${"  ".repeat(groupLines.length)}${id}${shape}`);
    }
    return id;
  };
  /** Resolve an endpoint token like [Comp], (Use case), :Actor:, "Name" or Name, defining it if new. */
  const ref = (tok: string): string => {
    const s = tok.trim();
    if (/^\[.*\]$/.test(s)) return ids.has(unq(s)) ? ids.get(unq(s)) : define("component", unq(s));
    if (/^\(.*\)$/.test(s)) return ids.has(unq(s)) ? ids.get(unq(s)) : define(kind === "usecase" ? "usecase" : "interface", unq(s));
    if (/^:.*:$/.test(s)) return ids.has(unq(s)) ? ids.get(unq(s)) : define("actor", unq(s));
    const name = unq(s);
    return ids.has(name) ? ids.get(name) : define(kind === "usecase" ? "actor" : "default", name);
  };
  const lines = p.lines;
  const decl = new RegExp(`^(${ELEMENT_KW})\\s+("[^"]+"|\\[[^\\]]+\\]|\\([^)]+\\)|:[^:]+:|[^\\s{]+)(?:\\s+as\\s+("[^"]+"|[^\\s{]+))?\\s*(<<[^>]*>>)?\\s*(#[\\w#;.:]+)?\\s*(\\{)?\\s*$`, "i");
  for (let i = 0; i < lines.length; i++) {
    const { n, t } = lines[i];
    let m: RegExpMatchArray | null;
    if ((m = t.match(decl))) {
      const [, kw, a, b, , , brace] = m;
      let label = unq(a), alias = b ? unq(b) : undefined;
      if (b && /^"/.test(b) && !/^"/.test(a)) [label, alias] = [unq(b), unq(a)];
      if (brace || (CONTAINERS.test(kw) && lines[i + 1]?.t === "{")) {
        if (!brace) i++;
        const id = ids.get(alias ?? label);
        if (alias) ids.alias(label, id);
        defined.add(id);
        const block: string[] = [`${"  ".repeat(groupLines.length)}subgraph ${id}["${esc(label)}"]`];
        groupLines.push(block);
        continue;
      }
      define(kw, label, alias);
      continue;
    }
    if ((m = t.match(/^(package|node|folder|frame|cloud|database|rectangle|card|namespace|together|stack|storage|component)\s*(?:#[\w#]+\s*)?\{$/i))) {
      const id = ids.get(`${m[1]}_${gseq++}`);
      defined.add(id);
      groupLines.push([`${"  ".repeat(groupLines.length)}subgraph ${id}["${m[1].toLowerCase() === "together" ? " " : m[1]}"]`]);
      continue;
    }
    if ((m = t.match(/^(\[[^\]]+\]|\([^)]+\)|:[^:]+:)\s+as\s+("[^"]+"|\S+)\s*(<<[^>]*>>)?\s*$/))) {
      const kw = m[1].startsWith("[") ? "component" : m[1].startsWith("(") ? (kind === "usecase" ? "usecase" : "interface") : "actor";
      define(kw, unq(m[1]), unq(m[2]));
      continue;
    }
    if (/^(\[[^\]]+\]|\([^)]+\)|:[^:]+:)$/.test(t)) {
      ref(t);
      continue;
    }
    if (t === "}") {
      if (groupLines.length > 1) {
        const block = groupLines.pop()!;
        block.push(`${"  ".repeat(groupLines.length)}end`);
        groupLines[groupLines.length - 1].push(...block);
      }
      continue;
    }
    if ((m = t.match(/^note\s+(?:(left|right|top|bottom)\s+of\s+)?("[^"]+"|\[[^\]]+\]|\([^)]+\)|\S+?)?\s*(?::\s*(.*))?$/i))) {
      let text = m[3];
      if (text === undefined) {
        const body: string[] = [];
        while (++i < lines.length && !/^end\s*note$/i.test(lines[i].t)) body.push(lines[i].t);
        text = body.join("<br/>");
      }
      const id = `note${gseq++}`;
      nodes.push(`  ${id}["${esc(text)}"]:::note`);
      if (m[2] && m[1]) edges.push(`  ${ref(m[2])} -.- ${id}`);
      continue;
    }
    // Relations
    m = t.match(/^("[^"]+"|\[[^\]]+\]|\([^)]+\)|:[^:]+:|[\w.$À-￿]+)\s*([<*o#x}+^|(]*[-.=]+(?:\[[^\]]*\])?(?:\w+[-.=]+)?[>*o#x{+^|)]*)\s*("[^"]+"|\[[^\]]+\]|\([^)]+\)|:[^:]+:|[\w.$À-￿]+)\s*(?::\s*(.*))?$/);
    if (m && /[-.=]/.test(m[2])) {
      const [, a, arrowRaw, b, label] = m;
      const arrow = normArrow(arrowRaw);
      const dotted = arrow.includes(".");
      const left = /^(<|<\||\^)/.test(arrow);
      const right = /(>|\|>)$/.test(arrow);
      let from = ref(a), to = ref(b);
      if (left && !right) [from, to] = [to, from];
      const headless = !left && !right;
      const lab = label ? label.replace(/<<|>>/g, "").trim() : "";
      const link = dotted ? (headless ? "-.-" : "-.->") : headless ? "---" : left && right ? "<-->" : "-->";
      edges.push(`  ${from} ${link}${lab ? `|"${esc(lab)}"|` : ""} ${to}`);
      continue;
    }
    if (/^(skinparam|hide|show|remove)\b/i.test(t)) continue;
    W.push({ line: n, message: `Not understood, skipped: ${t}` });
  }
  while (groupLines.length > 1) {
    const block = groupLines.pop()!;
    block.push(`${"  ".repeat(groupLines.length)}end`);
    groupLines[groupLines.length - 1].push(...block);
    W.push({ line: lines[lines.length - 1]?.n ?? 0, message: "Unclosed { block closed automatically." });
  }
  return [...out, ...nodes, ...edges, "  classDef note fill:#fff8c4,stroke:#c9b458,color:#333"];
}

/* ── mindmap ───────────────────────────────────────────────────────── */

function mindmap(p: Pre, W: Warning[]): string[] {
  const out = ["mindmap"];
  let rootSeen = false;
  const clean = (s: string) => s.replace(/^\[[^\]]*\]\s*/, "").replace(/^_\s*/, "").replace(/<[^>]+>/g, "").trim();
  for (let i = 0; i < p.lines.length; i++) {
    const { n, t } = p.lines[i];
    const m = t.match(/^([*+\-#]+)(_)?\s*(?:\[[^\]]*\])?\s*(.*)$/);
    if (!m) {
      W.push({ line: n, message: `Not a mindmap node, skipped: ${t}` });
      continue;
    }
    const level = m[1].length;
    let text = clean(m[3]);
    if (text.startsWith(":")) {
      text = text.slice(1);
      while (!text.trimEnd().endsWith(";") && i + 1 < p.lines.length) text += " " + p.lines[++i].t;
      text = text.trimEnd().replace(/;$/, "");
    }
    text = text.replace(/[()[\]{}]/g, (c) => ({ "(": "❨", ")": "❩", "[": "［", "]": "］", "{": "｛", "}": "｝" })[c]!);
    if (level === 1) {
      if (rootSeen) W.push({ line: n, message: "Only one root is allowed; extra roots become children." });
      out.push(rootSeen ? `    ${text}` : `  root((${text}))`);
      rootSeen = true;
      continue;
    }
    out.push(`${"  ".repeat(level)}${text}`);
  }
  return out;
}

/* ── gantt ─────────────────────────────────────────────────────────── */

function gantt(p: Pre, W: Warning[], today: string): string[] {
  const out = ["gantt", "  dateFormat YYYY-MM-DD", "  axisFormat %d %b"];
  let projectStart = "";
  const tasks = new Map<string, { id: string; name: string; start: string; dur: string; end?: string; tags: string[]; section: string; milestone?: boolean }>();
  const order: string[] = [];
  let section = "";
  let prev = "";
  let tseq = 0;
  const excludes: string[] = [];
  const task = (name: string) => {
    let t = tasks.get(name);
    if (!t) {
      t = { id: `t${++tseq}`, name, start: "", dur: "", tags: [], section };
      tasks.set(name, t);
      order.push(name);
    }
    return t;
  };
  const dur = (nStr: string, unit: string) => `${Number(nStr) * (/week/i.test(unit) ? 7 : 1)}d`;
  const ref = (s: string) => {
    const m = s.match(/^\[([^\]]+)\]'s\s+(end|start)$/i);
    if (!m) return /^\d{4}-\d{2}-\d{2}$/.test(s.trim()) ? s.trim() : "";
    const other = task(m[1]);
    return m[2].toLowerCase() === "end" ? `after ${other.id}` : `${other.start || "after " + other.id}`;
  };
  for (const { n, t } of p.lines) {
    let m: RegExpMatchArray | null;
    if ((m = t.match(/^project\s+starts\s+(?:the\s+|on\s+)?(\d{4}-\d{1,2}-\d{1,2})/i))) {
      projectStart = m[1].replace(/-(\d)(?=-|$)/g, "-0$1");
      continue;
    }
    if ((m = t.match(/^--\s*(.+?)\s*--$/))) {
      section = m[1];
      continue;
    }
    if ((m = t.match(/^(saturday|sunday)s?\s+(are|is)\s+closed$/i))) {
      if (!excludes.includes("weekends")) excludes.push("weekends");
      continue;
    }
    if ((m = t.match(/^(\d{4}-\d{2}-\d{2})\s+(?:to\s+(\d{4}-\d{2}-\d{2})\s+)?(?:is|are)\s+closed$/i))) {
      excludes.push(m[1]);
      continue;
    }
    let rest = t;
    let then = false;
    if (/^then\s+/i.test(rest)) {
      then = true;
      rest = rest.replace(/^then\s+/i, "");
    }
    if ((m = rest.match(/^\[([^\]]+)\](?:\s+as\s+\[[^\]]+\])?\s+(.*)$/))) {
      const tk = task(m[1]);
      if (!tk.section) tk.section = section;
      if (then && prev && !tk.start) tk.start = `after ${task(prev).id}`;
      for (const clause of m[2].split(/\s+and\s+/i)) {
        let c: RegExpMatchArray | null;
        if ((c = clause.match(/^(?:lasts|requires)\s+(\d+)\s*(days?|weeks?)/i))) tk.dur = dur(c[1], c[2]);
        else if ((c = clause.match(/^starts\s+(?:at\s+|on\s+|the\s+)?(.+)$/i))) tk.start = ref(c[1]) || tk.start;
        else if ((c = clause.match(/^ends\s+(?:at\s+|on\s+|the\s+)?(.+)$/i))) tk.end = ref(c[1]) || undefined;
        else if ((c = clause.match(/^happens\s+(?:at\s+|on\s+)?(.+)$/i))) {
          tk.milestone = true;
          tk.start = ref(c[1]);
          tk.dur = "0d";
        } else if ((c = clause.match(/^is\s+(\d+)%\s+(?:complete|completed)$/i))) {
          const pct = Number(c[1]);
          tk.tags = [pct >= 100 ? "done" : pct > 0 ? "active" : ""].filter(Boolean);
        } else if (/^is\s+colored/i.test(clause) || /^displays\s+on/i.test(clause)) {
          /* style only */
        } else W.push({ line: n, message: `Task clause not understood: "${clause}"` });
      }
      prev = m[1];
      continue;
    }
    W.push({ line: n, message: `Not understood, skipped: ${t}` });
  }
  if (excludes.length) out.push(`  excludes ${excludes.join(", ")}`);
  const start0 = projectStart || today;
  if (!projectStart) W.push({ line: 0, message: `No "Project starts" line — using ${today}.` });
  let curSection: string | null = null;
  let first = true;
  for (const name of order) {
    const tk = tasks.get(name)!;
    if (tk.section !== curSection) {
      if (tk.section) out.push(`  section ${tk.section}`);
      else if (curSection !== null) out.push("  section Other");
      curSection = tk.section;
    }
    if (first && curSection === null) out.push("  section Tasks"), (curSection = "");
    const start = tk.start || (first ? start0 : `after ${[...tasks.values()][[...tasks.keys()].indexOf(name) - 1]?.id ?? ""}`.trim());
    const length = tk.end ? tk.end.replace(/^after /, "") : tk.dur || "1d";
    const tags = [...(tk.milestone ? ["milestone"] : []), ...tk.tags];
    out.push(`  ${name.replace(/[:#]/g, " ")} :${tags.length ? tags.join(", ") + ", " : ""}${tk.id}, ${start}, ${tk.end && /^\d/.test(tk.end) ? tk.end : length}`);
    first = false;
  }
  return out;
}

/* ── ER ────────────────────────────────────────────────────────────── */

function er(p: Pre, W: Warning[]): string[] {
  const out = ["erDiagram"];
  const ids = new Ids("E");
  const eid = (s: string) => ids.get(unq(s));
  const lines = p.lines;
  for (let i = 0; i < lines.length; i++) {
    const { n, t } = lines[i];
    let m: RegExpMatchArray | null;
    if ((m = t.match(/^(?:entity|table|class)\s+("[^"]+"|[\w.]+)(?:\s+as\s+("[^"]+"|[\w.]+))?\s*(?:<<\w+>>)?\s*(?:#\S+)?\s*(\{)?\s*$/i))) {
      const display = unq(m[1]);
      const id = m[2] ? eid(m[2]) : eid(display);
      if (m[2]) ids.alias(display, id);
      const head = display !== id ? `${id}["${display.replace(/"/g, "'")}"]` : id;
      const attrs: string[] = [];
      if (m[3])
        while (++i < lines.length && lines[i].t !== "}") {
          const a = lines[i].t;
          if (/^(--|==|\.\.|__)/.test(a)) continue;
          const am = a.match(/^(\*)?\s*([+\-#~])?\s*("[^"]+"|[\w$]+)\s*(?::\s*([^<]+?))?\s*(<<\s*(\w+)\s*>>)?\s*(<<\s*(\w+)\s*>>)?\s*$/);
          if (!am) {
            W.push({ line: lines[i].n, message: `Attribute not understood: ${a}` });
            continue;
          }
          const type = (am[4] ?? "string").trim().replace(/\s+/g, "_").replace(/[^\w(),-]/g, "") || "string";
          const keys = [am[6], am[8]].filter(Boolean).map((k) => k!.toUpperCase()).map((k) => (k === "GENERATED" ? "" : k === "PK" || k === "FK" || k === "UK" ? k : "")).filter(Boolean);
          const comment = [am[1] ? "required" : "", ...[am[6], am[8]].filter((k) => k && !/^(pk|fk|uk)$/i.test(k)).map((k) => k!.toLowerCase())].filter(Boolean).join(", ");
          attrs.push(`    ${type} ${unq(am[3]).replace(/[^\w]/g, "_")}${keys.length ? " " + [...new Set(keys)].join(", ") : ""}${comment ? ` "${comment}"` : ""}`);
        }
      out.push(`  ${head} {`, ...attrs, "  }");
      continue;
    }
    m = t.match(/^("[^"]+"|[\w.]+)\s*([|}][|o]|[|o]\||\|)?(--|\.\.|-|\.)([|o][|{]|\|[|o]|\|)?\s*("[^"]+"|[\w.]+)\s*(?::\s*(.*))?$/);
    if (m) {
      const norm = (x: string | undefined, left: boolean) => {
        if (!x) return "||";
        const k = x.replace(/\s/g, "");
        if (left) return { "|o": "|o", "o|": "|o", "||": "||", "}o": "}o", "}|": "}|", "|": "||" }[k] ?? "||";
        return { "o|": "o|", "|o": "o|", "||": "||", "o{": "o{", "|{": "|{", "|": "||" }[k] ?? "||";
      };
      const line = m[3].includes(".") ? ".." : "--";
      out.push(`  ${eid(m[1])} ${norm(m[2], true)}${line}${norm(m[4], false)} ${eid(m[5])} : "${(m[6] ?? "").replace(/"/g, "'")}"`);
      continue;
    }
    W.push({ line: n, message: `Not understood, skipped: ${t}` });
  }
  return out;
}

/* ── entry point ───────────────────────────────────────────────────── */

export function plantumlToMermaid(src: string, today = new Date().toISOString().slice(0, 10)): Translation {
  if (!src.trim()) throw new ToolError("Paste PlantUML source (between @startuml and @enduml).");
  const p = preprocess(src);
  const W = [...p.warnings];
  const kind = detect(p);
  if (kind.startsWith("unsupported:")) throw new ToolError(`@start${kind.slice(12)} / ${kind.slice(12)} diagrams are not supported by the Mermaid translator. Supported: sequence, class, activity, state, use case, component, mindmap, gantt, ER.`);
  if (!p.lines.length) throw new ToolError("The diagram is empty.");
  let lines: string[];
  switch (kind) {
    case "class":
      lines = classDiagram(p, W);
      break;
    case "activity":
      lines = activity(p, W);
      break;
    case "state":
      lines = stateDiagram(p, W);
      break;
    case "usecase":
    case "component":
      lines = flowFromElements(p, W, kind);
      break;
    case "mindmap":
      lines = mindmap(p, W);
      break;
    case "gantt":
      lines = gantt(p, W, today);
      break;
    case "er":
      lines = er(p, W);
      break;
    default:
      lines = sequence(p, W);
  }
  const body = lines.filter((l) => l !== "").join("\n");
  const title = p.title && kind !== "mindmap" ? `---\ntitle: ${p.title.replace(/:/g, " -")}\n---\n` : "";
  if (p.title && kind === "mindmap") W.push({ line: 0, message: "Mindmap titles are not shown by Mermaid." });
  return { mermaid: title + body, kind, warnings: W };
}

/* ── PlantUML text encoding ────────────────────────────────────────── */

const ALPHA = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";

function encode64(bytes: Uint8Array): string {
  let r = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b1 = bytes[i], b2 = bytes[i + 1] ?? 0, b3 = bytes[i + 2] ?? 0;
    r += ALPHA[b1 >> 2] + ALPHA[((b1 & 0x3) << 4) | (b2 >> 4)] + ALPHA[((b2 & 0xf) << 2) | (b3 >> 6)] + ALPHA[b3 & 0x3f];
  }
  return r;
}

/** Deflate (raw) + PlantUML base64. Falls back to the "~h" hex form where CompressionStream lacks deflate-raw. */
export async function encodePlantUml(src: string): Promise<{ encoded: string; method: string }> {
  const bytes = new TextEncoder().encode(src.trim());
  const CS = (globalThis as { CompressionStream?: typeof CompressionStream }).CompressionStream;
  if (CS) {
    try {
      const stream = new Blob([bytes]).stream().pipeThrough(new CS("deflate-raw" as CompressionFormat));
      const buf = new Uint8Array(await new Response(stream).arrayBuffer());
      return { encoded: encode64(buf), method: "deflate" };
    } catch {
      /* fall through */
    }
  }
  return { encoded: "~h" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(""), method: "hex" };
}
