/**
 * A lossless XML tokenizer + tree builder with precise well-formedness
 * diagnostics, and a pretty printer / minifier that keeps comments, CDATA,
 * processing instructions, DOCTYPE, namespaces and attribute order intact.
 */
import { codeFrame, lineColAt } from "./C-util";

export type XAttr = { name: string; value: string; quote: '"' | "'"; start: number; end: number };
export type XElement = {
  type: "element";
  name: string;
  attrs: XAttr[];
  children: XNode[];
  selfClosed: boolean;
  /** Offsets of the start tag. */
  start: number;
  tagEnd: number;
  /** Offset after the end tag (or start tag when self-closed). */
  end: number;
  parent?: XElement;
};
export type XNode =
  | XElement
  | { type: "text"; value: string; start: number; end: number }
  | { type: "cdata"; value: string; start: number; end: number }
  | { type: "comment"; value: string; start: number; end: number }
  | { type: "pi"; target: string; value: string; start: number; end: number }
  | { type: "doctype"; value: string; start: number; end: number };

export type XIssue = { level: "error" | "warning" | "info"; message: string; line: number; col: number; pos: number };
export type XDoc = { children: XNode[]; root: XElement | null; issues: XIssue[]; src: string };

export class XmlError extends Error {
  constructor(message: string, public line: number, public col: number, public frame: string) {
    super(message);
  }
}

const NAME_START = /[A-Za-z_:À-ÖØ-öø-˿Ͱ-ͽͿ-῿‌-‍⁰-↏Ⰰ-⿯、-퟿豈-﷏ﷰ-�]/;
const NAME_CHAR = /[-.0-9·̀-ͯ‿-⁀A-Za-z_:À-ÖØ-öø-˿Ͱ-ͽͿ-῿‌-‍⁰-↏Ⰰ-⿯、-퟿豈-﷏ﷰ-�]/;
const PREDEF = new Set(["amp", "lt", "gt", "quot", "apos"]);
const isWs = (c: string) => c === " " || c === "\t" || c === "\n" || c === "\r";

/** Parse XML into a lossless tree, collecting every well-formedness issue it can recover from. */
export function parseXml(src: string): XDoc {
  const issues: XIssue[] = [];
  const n = src.length;
  let i = src.charCodeAt(0) === 0xfeff ? 1 : 0;
  const bodyStart = i;
  const top: XNode[] = [];
  const stack: XElement[] = [];
  let root: XElement | null = null;
  let rootClosed = false;
  let declaredEntities = new Set<string>();
  let externalDtd = false;
  let fatal = false;

  const issue = (level: XIssue["level"], message: string, pos: number) => {
    const { line, col } = lineColAt(src, pos);
    issues.push({ level, message, line, col, pos });
  };
  const add = (node: XNode) => {
    if (stack.length) {
      const p = stack[stack.length - 1];
      p.children.push(node);
      if (node.type === "element") node.parent = p;
    } else top.push(node);
  };
  const checkRefs = (text: string, base: number, where: string) => {
    for (let k = text.indexOf("&"); k >= 0; k = text.indexOf("&", k + 1)) {
      const m = /^&(#[0-9]+;|#x[0-9a-fA-F]+;|([A-Za-z_:][\w.:-]*);)/.exec(text.slice(k, k + 64));
      if (!m) {
        issue("error", `Unescaped "&" in ${where} — write &amp; (or a complete reference like &lt; or &#169;)`, base + k);
        continue;
      }
      if (m[2] && !PREDEF.has(m[2]) && !declaredEntities.has(m[2])) {
        if (externalDtd) issue("warning", `Entity &${m[2]}; is not predefined — it must come from the external DTD`, base + k);
        else issue("error", `Undefined entity &${m[2]}; — only &amp; &lt; &gt; &quot; &apos; are predefined`, base + k);
      }
      if (m[1].startsWith("#")) {
        const cp = m[1][1] === "x" ? parseInt(m[1].slice(2), 16) : parseInt(m[1].slice(1), 10);
        if (!(cp === 9 || cp === 10 || cp === 13 || (cp >= 0x20 && cp <= 0xd7ff) || (cp >= 0xe000 && cp <= 0xfffd) || (cp >= 0x10000 && cp <= 0x10ffff)))
          issue("error", `Character reference &${m[1]} is not a legal XML character`, base + k);
      }
    }
  };
  const readName = (): string => {
    const s = i;
    if (i < n && NAME_START.test(src[i])) {
      i++;
      while (i < n && NAME_CHAR.test(src[i])) i++;
    }
    return src.slice(s, i);
  };
  const skipWs = () => {
    while (i < n && isWs(src[i])) i++;
  };

  while (i < n && !fatal) {
    const c = src[i];
    if (c !== "<") {
      const s = i;
      const e = src.indexOf("<", i);
      i = e < 0 ? n : e;
      const value = src.slice(s, i);
      if (!stack.length) {
        const k = value.search(/\S/);
        if (k >= 0) issue("error", root ? "Text after the root element — a document has exactly one root" : "Text before the root element", s + k);
      } else {
        const bad = value.indexOf("]]>");
        if (bad >= 0) issue("error", `"]]>" is not allowed in text — escape the ">" as &gt;`, s + bad);
        checkRefs(value, s, "text");
      }
      add({ type: "text", value, start: s, end: i });
      continue;
    }
    const s = i;
    if (src.startsWith("<!--", i)) {
      const e = src.indexOf("-->", i + 4);
      if (e < 0) { issue("error", "Unterminated comment — missing -->", s); fatal = true; break; }
      const value = src.slice(i + 4, e);
      const dd = value.indexOf("--");
      if (dd >= 0) issue("error", `"--" is not allowed inside a comment`, i + 4 + dd);
      if (value.endsWith("-")) issue("error", `A comment cannot end with "--->"`, e - 1);
      i = e + 3;
      add({ type: "comment", value, start: s, end: i });
      continue;
    }
    if (src.startsWith("<![CDATA[", i)) {
      const e = src.indexOf("]]>", i + 9);
      if (e < 0) { issue("error", "Unterminated CDATA section — missing ]]>", s); fatal = true; break; }
      if (!stack.length) issue("error", "CDATA section outside the root element", s);
      i = e + 3;
      add({ type: "cdata", value: src.slice(s + 9, e), start: s, end: i });
      continue;
    }
    if (src.startsWith("<!DOCTYPE", i) || src.startsWith("<!doctype", i)) {
      if (src.startsWith("<!doctype", i)) issue("error", "DOCTYPE must be upper-case in XML: <!DOCTYPE", s);
      let k = i + 9, depth = 0, q = "";
      for (; k < n; k++) {
        const ch = src[k];
        if (q) { if (ch === q) q = ""; continue; }
        if (ch === '"' || ch === "'") q = ch;
        else if (ch === "[") depth++;
        else if (ch === "]") depth--;
        else if (ch === ">" && depth <= 0) break;
      }
      if (k >= n) { issue("error", "Unterminated DOCTYPE — missing >", s); fatal = true; break; }
      const value = src.slice(s, k + 1);
      if (root) issue("error", "DOCTYPE must come before the root element", s);
      for (const m of value.matchAll(/<!ENTITY\s+(?:%\s+)?([^\s]+)/g)) declaredEntities.add(m[1]);
      if (/\b(SYSTEM|PUBLIC)\b/.test(value.split("[")[0])) externalDtd = true;
      i = k + 1;
      add({ type: "doctype", value, start: s, end: i });
      continue;
    }
    if (src.startsWith("<?", i)) {
      const e = src.indexOf("?>", i + 2);
      if (e < 0) { issue("error", "Unterminated processing instruction — missing ?>", s); fatal = true; break; }
      i += 2;
      const target = readName();
      if (!target) issue("error", "Processing instruction needs a target name, e.g. <?xml-stylesheet …?>", s);
      if (target.toLowerCase() === "xml") {
        if (target !== "xml") issue("error", `The XML declaration must be lower-case "<?xml"`, s);
        else if (s !== bodyStart) issue("error", "The XML declaration <?xml …?> must be the very first thing in the document (no whitespace or comments before it)", s);
        const body = src.slice(i, e);
        if (!/\bversion\s*=\s*["']1\.[01]["']/.test(body)) issue("error", 'XML declaration needs version="1.0"', s);
        const enc = /\bencoding\s*=\s*["']([^"']*)["']/.exec(body);
        if (enc && !/^[A-Za-z][\w.-]*$/.test(enc[1])) issue("error", `Invalid encoding name "${enc[1]}"`, s);
      }
      const value = src.slice(i, e);
      i = e + 2;
      add({ type: "pi", target, value, start: s, end: i });
      continue;
    }
    if (src.startsWith("</", i)) {
      i += 2;
      const name = readName();
      skipWs();
      if (!name || src[i] !== ">") {
        issue("error", name ? `Malformed closing tag </${name} — expected ">"` : "Malformed closing tag — expected a name after </", s);
        const gt = src.indexOf(">", i);
        i = gt < 0 ? n : gt + 1;
        if (!name) continue;
      } else i++;
      if (!stack.length) {
        issue("error", `Unexpected closing tag </${name}> — ${root ? "the root element is already closed" : "no element is open"}`, s);
        continue;
      }
      const topEl = stack[stack.length - 1];
      if (topEl.name === name) {
        stack.pop();
        topEl.end = i;
        if (!stack.length) rootClosed = true;
        continue;
      }
      const at = lineColAt(src, topEl.start);
      const idx = stack.map((x) => x.name).lastIndexOf(name);
      if (idx >= 0) {
        issue("error", `Mismatched closing tag </${name}> — expected </${topEl.name}> (opened at line ${at.line}, column ${at.col})`, s);
        while (stack.length > idx) {
          const el = stack.pop()!;
          el.end = i;
        }
        if (!stack.length) rootClosed = true;
      } else issue("error", `Mismatched closing tag </${name}> — expected </${topEl.name}> (opened at line ${at.line}, column ${at.col})`, s);
      continue;
    }
    if (src.startsWith("<!", i)) {
      issue("error", `Unknown markup declaration "${src.slice(i, i + 12)}…" — did you mean <!-- comment --> or <![CDATA[ … ]]>?`, s);
      const gt = src.indexOf(">", i);
      i = gt < 0 ? n : gt + 1;
      continue;
    }
    // Start tag
    i++;
    const name = readName();
    if (!name) {
      issue("error", `Unescaped "<" — write &lt; in text, or start a tag with a name like <item>`, s);
      add({ type: "text", value: "<", start: s, end: s + 1 });
      continue;
    }
    if (rootClosed || (root && !stack.length)) issue("error", `Extra content after the root element: <${name}> — a document has exactly one root`, s);
    const el: XElement = { type: "element", name, attrs: [], children: [], selfClosed: false, start: s, tagEnd: s, end: s };
    const seen = new Set<string>();
    let closed = false;
    for (;;) {
      const before = i;
      skipWs();
      if (i >= n) { issue("error", `Unterminated start tag <${name} — missing ">"`, s); fatal = true; break; }
      if (src[i] === ">") { i++; closed = true; break; }
      if (src.startsWith("/>", i)) { i += 2; el.selfClosed = true; closed = true; break; }
      const as = i;
      const an = readName();
      if (!an) {
        issue("error", `Unexpected "${src[i]}" in <${name}> — expected an attribute name, ">" or "/>"`, i);
        const gt = src.indexOf(">", i);
        i = gt < 0 ? n : gt + 1;
        if (src[i - 2] === "/") el.selfClosed = true;
        closed = true;
        break;
      }
      if (before === as) issue("error", `Missing whitespace before attribute "${an}"`, as);
      skipWs();
      if (src[i] !== "=") {
        issue("error", `Attribute "${an}" has no value — XML requires ${an}="…"`, as);
        el.attrs.push({ name: an, value: "", quote: '"', start: as, end: i });
        continue;
      }
      i++;
      skipWs();
      const q = src[i];
      let value: string;
      let quote: '"' | "'" = '"';
      if (q === '"' || q === "'") {
        quote = q;
        const e = src.indexOf(q, i + 1);
        if (e < 0) { issue("error", `Unterminated attribute value for "${an}"`, i); fatal = true; break; }
        value = src.slice(i + 1, e);
        const lt = value.indexOf("<");
        if (lt >= 0) issue("error", `"<" is not allowed in attribute values — use &lt; (attribute "${an}")`, i + 1 + lt);
        checkRefs(value, i + 1, `attribute "${an}"`);
        i = e + 1;
      } else {
        issue("error", `Attribute value for "${an}" must be quoted`, i);
        const vs = i;
        while (i < n && !isWs(src[i]) && src[i] !== ">" && !src.startsWith("/>", i)) i++;
        value = src.slice(vs, i);
      }
      if (seen.has(an)) issue("error", `Duplicate attribute "${an}" on <${name}>`, as);
      seen.add(an);
      el.attrs.push({ name: an, value, quote, start: as, end: i });
    }
    if (!closed) break;
    el.tagEnd = i;
    el.end = i;
    add(el);
    if (!root && !stack.length) root = el;
    if (!el.selfClosed) stack.push(el);
    else if (el === root) rootClosed = true;
  }

  for (let k = stack.length - 1; k >= 0; k--) {
    const at = lineColAt(src, stack[k].start);
    issue("error", `Unclosed element <${stack[k].name}> (opened at line ${at.line}, column ${at.col}) — add </${stack[k].name}>`, n);
    stack[k].end = n;
  }
  if (!root && !fatal) issue("error", src.trim() ? "No root element — an XML document needs one element that wraps everything" : "The document is empty", 0);
  if (root) checkNamespaces(root, new Map([["xml", "http://www.w3.org/XML/1998/namespace"]]), issue);
  issues.sort((a, b) => a.pos - b.pos);
  return { children: top, root, issues, src };
}

function checkNamespaces(el: XElement, scope: Map<string, string>, issue: (l: XIssue["level"], m: string, p: number) => void) {
  let local = scope;
  for (const a of el.attrs) {
    if (a.name === "xmlns" || a.name.startsWith("xmlns:")) {
      if (local === scope) local = new Map(scope);
      const p = a.name === "xmlns" ? "" : a.name.slice(6);
      if (p && !a.value) issue("error", `Namespace prefix "${p}" cannot be bound to an empty URI`, a.start);
      local.set(p, a.value);
    }
  }
  const pfx = (q: string) => (q.includes(":") ? q.slice(0, q.indexOf(":")) : "");
  const ep = pfx(el.name);
  if (ep && ep !== "xmlns" && !local.has(ep)) issue("error", `Undeclared namespace prefix "${ep}" on <${el.name}> — add xmlns:${ep}="…" to it or an ancestor`, el.start);
  for (const a of el.attrs) {
    const ap = pfx(a.name);
    if (ap && ap !== "xmlns" && !local.has(ap)) issue("error", `Undeclared namespace prefix "${ap}" on attribute ${a.name}`, a.start);
  }
  for (const c of el.children) if (c.type === "element") checkNamespaces(c, local, issue);
}

/** Parse, throwing an XmlError (with code frame) on the first error. */
export function parseStrict(src: string): XDoc {
  const doc = parseXml(src);
  const err = doc.issues.find((x) => x.level === "error");
  if (err) {
    const more = doc.issues.filter((x) => x.level === "error").length - 1;
    throw new XmlError(
      `${err.message}\nLine ${err.line}, column ${err.col}${more > 0 ? ` (+${more} more error${more > 1 ? "s" : ""})` : ""}\n\n${codeFrame(src, err.line, err.col)}`,
      err.line,
      err.col,
      codeFrame(src, err.line, err.col)
    );
  }
  return doc;
}

/* ── printing ─────────────────────────────────────────────────────────── */

export type FormatOptions = {
  indent: string;
  /** Put attributes on separate lines when an element has more than this many (0 = never). */
  attrWrap: number;
  empty: "preserve" | "self" | "expand";
  /** Keep text-only elements inline when the line fits in this width. */
  width: number;
  comments: boolean;
  /** Space before "/>" in self-closing tags. */
  spaceSelfClose?: boolean;
};

const attrStr = (a: XAttr) => `${a.name}=${a.quote}${a.value}${a.quote}`;

function spaceMode(el: XElement, inherited: boolean): boolean {
  const a = el.attrs.find((x) => x.name === "xml:space");
  if (a) return a.value === "preserve";
  return inherited;
}

/** Serialise a node exactly as written (used inside xml:space="preserve"). */
export function raw(n: XNode): string {
  switch (n.type) {
    case "element":
      return `<${n.name}${n.attrs.map((a) => " " + attrStr(a)).join("")}${n.selfClosed ? "/>" : `>${n.children.map(raw).join("")}</${n.name}>`}`;
    case "text": return n.value;
    case "cdata": return `<![CDATA[${n.value}]]>`;
    case "comment": return `<!--${n.value}-->`;
    case "pi": return `<?${n.target}${n.value}?>`;
    case "doctype": return n.value;
  }
}

function dedent(text: string): string[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  const ind = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^[ \t]*/)![0].length));
  return lines.map((l, k) => (k === 0 ? l.trim() : l.slice(Number.isFinite(ind) ? ind : 0).trimEnd()));
}

export function formatXml(doc: XDoc, o: FormatOptions): string {
  const out: string[] = [];
  const pad = (d: number) => o.indent.repeat(d);
  const sc = o.spaceSelfClose ? " />" : "/>";

  const openTag = (el: XElement, d: number, close: string): string => {
    if (!el.attrs.length) return `<${el.name}${close}`;
    if (o.attrWrap > 0 && el.attrs.length > o.attrWrap)
      return `<${el.name}\n${el.attrs.map((a) => pad(d + 1) + attrStr(a)).join("\n")}${close}`;
    return `<${el.name} ${el.attrs.map(attrStr).join(" ")}${close}`;
  };

  const emit = (node: XNode, d: number, preserve: boolean) => {
    switch (node.type) {
      case "text": {
        for (const l of dedent(node.value)) out.push(l ? pad(d) + l : "");
        return;
      }
      case "cdata":
        out.push(pad(d) + `<![CDATA[${node.value}]]>`);
        return;
      case "comment":
        if (o.comments) out.push(pad(d) + `<!--${node.value}-->`);
        return;
      case "pi":
        out.push(pad(d) + `<?${node.target}${node.value}?>`);
        return;
      case "doctype":
        out.push(pad(d) + node.value);
        return;
    }
    const el = node;
    const keep = spaceMode(el, preserve);
    if (keep) {
      const inner = el.children.filter((c) => o.comments || c.type !== "comment").map(raw).join("");
      out.push(pad(d) + openTag(el, d, !inner && el.selfClosed ? sc : ">") + (inner || !el.selfClosed ? `${inner}</${el.name}>` : ""));
      return;
    }
    const kids = el.children.filter((c) => (c.type === "text" ? c.value.trim() !== "" : c.type === "comment" ? o.comments : true));
    if (!kids.length) {
      const self = o.empty === "self" || (o.empty === "preserve" && el.selfClosed);
      out.push(pad(d) + (self ? openTag(el, d, sc) : openTag(el, d, ">") + `</${el.name}>`));
      return;
    }
    const textOnly = kids.every((c) => c.type === "text" || c.type === "cdata");
    if (textOnly) {
      const inner = kids.map((c) => (c.type === "text" ? c.value : raw(c))).join("").trim();
      const line = pad(d) + openTag(el, d, ">") + inner + `</${el.name}>`;
      const lastLine = line.slice(line.lastIndexOf("\n") + 1);
      if (!inner.includes("\n") && lastLine.length <= o.width) {
        out.push(line);
        return;
      }
    }
    out.push(pad(d) + openTag(el, d, ">"));
    for (const c of kids) emit(c, d + 1, keep);
    out.push(pad(d) + `</${el.name}>`);
  };

  for (const c of doc.children) {
    if (c.type === "text") continue; // whitespace between prolog items
    emit(c, 0, false);
  }
  return out.join("\n");
}

export function minifyXml(doc: XDoc, o: { comments: boolean }): string {
  const parts: string[] = [];
  const emit = (node: XNode, preserve: boolean, parent: XElement | null) => {
    switch (node.type) {
      case "text": {
        if (preserve) { parts.push(node.value); return; }
        if (!node.value.trim()) {
          if (/[\n\r]/.test(node.value) || !parent) return;
          parts.push(" ");
          return;
        }
        const onlyText = parent && parent.children.every((c) => c.type === "text" || c.type === "cdata" || c.type === "comment");
        let v = node.value.replace(/\s*\n\s*/g, " ");
        if (onlyText) v = v.trim();
        parts.push(v);
        return;
      }
      case "comment":
        if (o.comments) parts.push(`<!--${node.value}-->`);
        return;
      case "element": {
        const keep = spaceMode(node, preserve);
        const head = `<${node.name}${node.attrs.map((a) => " " + attrStr(a)).join("")}`;
        const kids = node.children.filter((c) => o.comments || c.type !== "comment");
        if (!kids.length || kids.every((c) => c.type === "text" && !c.value.trim() && !keep)) {
          parts.push(head + "/>");
          return;
        }
        parts.push(head + ">");
        for (const c of kids) emit(c, keep, node);
        parts.push(`</${node.name}>`);
        return;
      }
      default:
        parts.push(raw(node));
    }
  };
  for (const c of doc.children) if (c.type !== "text") emit(c, false, null);
  return parts.join("");
}

/* ── source-preserving rewrites ───────────────────────────────────────── */

function walk(nodes: XNode[], f: (n: XNode) => void) {
  for (const n of nodes) {
    f(n);
    if (n.type === "element") walk(n.children, f);
  }
}

/** Sort attributes alphabetically (namespace declarations first) without touching anything else. */
export function sortAttributesInSource(doc: XDoc): string {
  const edits: { s: number; e: number; t: string }[] = [];
  walk(doc.children, (n) => {
    if (n.type !== "element" || n.attrs.length < 2) return;
    const key = (a: XAttr) => (a.name === "xmlns" ? "0" : a.name.startsWith("xmlns:") ? "1" + a.name : "2" + a.name);
    const sorted = [...n.attrs].sort((a, b) => key(a).localeCompare(key(b)));
    if (sorted.every((a, k) => a === n.attrs[k])) return;
    // Replace each attribute slot with the sorted attribute, keeping the whitespace between them.
    n.attrs.forEach((a, k) => edits.push({ s: a.start, e: a.end, t: attrStr(sorted[k]) }));
  });
  return applyEdits(doc.src, edits);
}

export function removeCommentsInSource(doc: XDoc): string {
  const edits: { s: number; e: number; t: string }[] = [];
  const src = doc.src;
  walk(doc.children, (n) => {
    if (n.type !== "comment") return;
    let s = n.start, e = n.end;
    // Remove the whole line when the comment sits alone on it.
    const ls = src.lastIndexOf("\n", s - 1) + 1;
    let le = src.indexOf("\n", e);
    if (le < 0) le = src.length;
    if (!src.slice(ls, s).trim() && !src.slice(e, le).trim()) {
      s = ls;
      e = Math.min(src.length, le + 1);
    }
    edits.push({ s, e, t: "" });
  });
  return applyEdits(src, edits);
}

function applyEdits(src: string, edits: { s: number; e: number; t: string }[]): string {
  edits.sort((a, b) => b.s - a.s);
  let out = src;
  for (const x of edits) out = out.slice(0, x.s) + x.t + out.slice(x.e);
  return out;
}

/* ── analysis ─────────────────────────────────────────────────────────── */

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (m, e: string) => {
    if (e[0] === "#") {
      const cp = e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return String.fromCodePoint(cp); } catch { return m; }
    }
    return ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" } as Record<string, string>)[e];
  });
}

/** Text content of an element (entities decoded). */
export function textOf(el: XElement): string {
  let s = "";
  for (const c of el.children) {
    if (c.type === "text") s += decodeEntities(c.value);
    else if (c.type === "cdata") s += c.value;
    else if (c.type === "element") s += textOf(c);
  }
  return s;
}

/** XML → JSON: attributes as "@name", text as "#text", repeated children become arrays. */
export function xmlToJson(doc: XDoc, o: { attrPrefix?: string; textKey?: string } = {}): unknown {
  const ap = o.attrPrefix ?? "@", tk = o.textKey ?? "#text";
  const conv = (el: XElement): unknown => {
    const obj: Record<string, unknown> = {};
    for (const a of el.attrs) obj[ap + a.name] = decodeEntities(a.value);
    const elems = el.children.filter((c): c is XElement => c.type === "element");
    const text = el.children.filter((c) => c.type === "text" || c.type === "cdata").map((c) => (c.type === "text" ? decodeEntities(c.value) : (c as { value: string }).value)).join("").trim();
    if (!elems.length && !el.attrs.length) return text === "" ? null : typed(text);
    for (const c of elems) {
      const v = conv(c);
      if (c.name in obj) {
        const cur = obj[c.name];
        obj[c.name] = Array.isArray(cur) && (cur as unknown as { __multi?: boolean }).__multi ? (cur.push(v), cur) : mark([cur, v]);
      } else obj[c.name] = v;
    }
    if (text) obj[tk] = typed(text);
    return obj;
  };
  const mark = (a: unknown[]) => {
    Object.defineProperty(a, "__multi", { value: true, enumerable: false });
    return a;
  };
  const typed = (t: string): unknown => (/^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/.test(t) && t.length < 16 ? Number(t) : t === "true" ? true : t === "false" ? false : t);
  if (!doc.root) return null;
  return { [doc.root.name]: conv(doc.root) };
}

export type XmlStats = {
  elements: number;
  attributes: number;
  nsDecls: number;
  texts: number;
  comments: number;
  cdata: number;
  pis: number;
  maxDepth: number;
  namespaces: [string, string][];
  names: Map<string, { count: number; attrs: Set<string>; withText: number; depths: Set<number>; parents: Set<string> }>;
  paths: { xpath: string; name: string; depth: number; attrs: string; text: string }[];
};

export function xmlStats(doc: XDoc): XmlStats {
  const st: XmlStats = { elements: 0, attributes: 0, nsDecls: 0, texts: 0, comments: 0, cdata: 0, pis: 0, maxDepth: 0, namespaces: [], names: new Map(), paths: [] };
  const ns = new Map<string, string>();
  const visit = (nodes: XNode[], depth: number, path: string, parent: string) => {
    const counts = new Map<string, number>();
    const idx = new Map<string, number>();
    for (const c of nodes) if (c.type === "element") counts.set(c.name, (counts.get(c.name) ?? 0) + 1);
    for (const c of nodes) {
      if (c.type === "text") { if (c.value.trim() && depth > 0) st.texts++; continue; }
      if (c.type === "comment") { st.comments++; continue; }
      if (c.type === "cdata") { st.cdata++; continue; }
      if (c.type === "pi") { st.pis++; continue; }
      if (c.type !== "element") continue;
      st.elements++;
      st.maxDepth = Math.max(st.maxDepth, depth + 1);
      for (const a of c.attrs) {
        if (a.name === "xmlns" || a.name.startsWith("xmlns:")) {
          st.nsDecls++;
          const p = a.name === "xmlns" ? "(default)" : a.name.slice(6);
          if (!ns.has(p + " " + a.value)) ns.set(p + " " + a.value, p);
        } else st.attributes++;
      }
      const k = (idx.get(c.name) ?? 0) + 1;
      idx.set(c.name, k);
      const xp = `${path}/${c.name}${(counts.get(c.name) ?? 0) > 1 ? `[${k}]` : ""}`;
      const own = c.children.filter((x) => x.type === "text" || x.type === "cdata").map((x) => (x.type === "text" ? decodeEntities(x.value) : (x as { value: string }).value)).join("").trim().replace(/\s+/g, " ");
      let info = st.names.get(c.name);
      if (!info) st.names.set(c.name, (info = { count: 0, attrs: new Set(), withText: 0, depths: new Set(), parents: new Set() }));
      info.count++;
      c.attrs.filter((a) => !a.name.startsWith("xmlns")).forEach((a) => info!.attrs.add(a.name));
      if (own) info.withText++;
      info.depths.add(depth + 1);
      if (parent) info.parents.add(parent);
      st.paths.push({ xpath: xp, name: c.name, depth: depth + 1, attrs: c.attrs.map((a) => `${a.name}="${a.value}"`).join(" "), text: own.length > 80 ? own.slice(0, 77) + "…" : own });
      visit(c.children, depth + 1, xp, c.name);
    }
  };
  visit(doc.children, 0, "", "");
  st.namespaces = [...ns.entries()].map(([k, p]) => [p, k.slice(k.indexOf(" ") + 1)]);
  return st;
}

/** A plain-text outline of the element tree. */
export function outline(doc: XDoc, maxText = 50, showText = true): string {
  const lines: string[] = [];
  const walkEl = (el: XElement, prefix: string, last: boolean, isRoot: boolean) => {
    const attrs = el.attrs.map((a) => `@${a.name}=${JSON.stringify(decodeEntities(a.value))}`).join(" ");
    const kids = el.children.filter((c): c is XElement => c.type === "element");
    const t = el.children.filter((c) => c.type === "text" || c.type === "cdata").map((c) => (c.type === "text" ? decodeEntities(c.value) : (c as { value: string }).value)).join("").trim().replace(/\s+/g, " ");
    const text = t && showText ? ` = ${JSON.stringify(t.length > maxText ? t.slice(0, maxText - 1) + "…" : t)}` : "";
    lines.push(`${isRoot ? "" : prefix + (last ? "└─ " : "├─ ")}${el.name}${attrs ? " " + attrs : ""}${text}`);
    const next = isRoot ? "" : prefix + (last ? "   " : "│  ");
    kids.forEach((k, j) => walkEl(k, next, j === kids.length - 1, false));
  };
  if (doc.root) walkEl(doc.root, "", true, true);
  return lines.join("\n");
}
