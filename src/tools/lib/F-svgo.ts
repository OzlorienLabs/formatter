/**
 * SVGO-lite: a small, DOM-based SVG optimiser. It covers the safe, high-value
 * SVGO passes (comments, metadata, editor namespaces, defaults, empty
 * containers, number precision, colour shortening, unused IDs) and keeps a log
 * of what each pass removed.
 */
import { ToolError } from "../types";

export type SvgoOptions = {
  precision: number;
  removeIds: boolean;
  pretty: boolean;
  keepTitle: boolean;
};

export type SvgInfo = {
  width: string | null;
  height: string | null;
  viewBox: string | null;
  elements: number;
  counts: Record<string, number>;
  paths: number;
  hasText: boolean;
  hasScripts: boolean;
  hasRaster: boolean;
  ids: number;
};

const SVG_NS = "http://www.w3.org/2000/svg";
const EDITOR_NS = /^(inkscape|sodipodi|sketch|figma|serif|illustrator|i|x|a|graph|adobe|dc|cc|rdf|krita|vectornator|bx|ev)(:|$)/i;
const EDITOR_NS_URI = /inkscape|sodipodi|bohemiancoding|figma|serif\.com|adobe|purl\.org\/dc|creativecommons|w3\.org\/1999\/02\/22-rdf|vectornator|boxy-svg/i;

const DEFAULTS: Record<string, string> = {
  "fill-opacity": "1",
  "stroke-opacity": "1",
  opacity: "1",
  "stroke-width": "1",
  stroke: "none",
  "fill-rule": "nonzero",
  "clip-rule": "nonzero",
  "stroke-linecap": "butt",
  "stroke-linejoin": "miter",
  "stroke-miterlimit": "4",
  "stroke-dasharray": "none",
  "stroke-dashoffset": "0",
  display: "inline",
  visibility: "visible",
  "font-style": "normal",
  "font-variant": "normal",
  "text-anchor": "start",
  "stop-opacity": "1",
  "flood-opacity": "1",
  "letter-spacing": "normal",
  "word-spacing": "normal",
};
const XY_ZERO = new Set(["rect", "image", "use", "foreignObject"]);
const NUMERIC_ATTRS = new Set([
  "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "fx", "fy", "width", "height", "stroke-width", "offset",
  "font-size", "opacity", "fill-opacity", "stroke-opacity", "stop-opacity", "stroke-dashoffset", "dx", "dy", "stdDeviation",
]);
const COLOR_ATTRS = new Set(["fill", "stroke", "stop-color", "color", "flood-color", "lighting-color"]);
const TEXT_KEEP = new Set(["text", "tspan", "textPath", "style", "title", "desc", "script"]);
const CONTAINERS = new Set(["g", "defs", "symbol", "mask", "clipPath", "pattern", "marker", "switch", "a"]);

export type Log = { pass: string; count: number };

export function parseSvg(src: string): Document {
  if (!src.trim()) throw new ToolError("Paste an SVG to begin.");
  if (!/<svg[\s>]/i.test(src)) throw new ToolError("This does not look like SVG — no <svg> element found.");
  const doc = new DOMParser().parseFromString(src, "image/svg+xml");
  const err = doc.getElementsByTagName("parsererror")[0];
  if (err) {
    const msg = (err.textContent ?? "").replace(/\s+/g, " ").trim();
    const m = msg.match(/line (\d+)(?: at column (\d+))?/i);
    throw new ToolError(`Invalid SVG (XML parse error${m ? ` at line ${m[1]}${m[2] ? `, column ${m[2]}` : ""}` : ""}): ${msg.replace(/^This page contains the following errors:\s*/i, "").replace(/Below is a rendering.*$/i, "").slice(0, 240)}`);
  }
  const root = doc.documentElement;
  if (root.localName !== "svg") throw new ToolError(`The root element is <${root.localName}>, not <svg>.`);
  return doc;
}

export function svgInfo(doc: Document): SvgInfo {
  const root = doc.documentElement;
  const counts: Record<string, number> = {};
  const all = Array.from(root.getElementsByTagName("*"));
  for (const el of [root, ...all]) counts[el.localName] = (counts[el.localName] ?? 0) + 1;
  return {
    width: root.getAttribute("width"),
    height: root.getAttribute("height"),
    viewBox: root.getAttribute("viewBox"),
    elements: all.length + 1,
    counts,
    paths: counts.path ?? 0,
    hasText: !!counts.text,
    hasScripts: !!counts.script || all.some((e) => Array.from(e.attributes).some((a) => /^on/i.test(a.name))),
    hasRaster: !!counts.image,
    ids: [root, ...all].filter((e) => e.hasAttribute("id")).length,
  };
}

/* ── number & colour helpers ──────────────────────────────────────── */

export function roundNum(s: string, p: number) {
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return s;
  let r = String(Math.round(n * 10 ** p) / 10 ** p);
  if (r === "-0") r = "0";
  return r.replace(/^(-?)0\./, "$1.");
}

const NUM_RE = /[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/gi;

/** Round and compact path data / point lists / transforms. */
export function compactNumbers(s: string, p: number, path = false) {
  const out = s
    .replace(NUM_RE, (m) => roundNum(m, p))
    .replace(/\s*,\s*/g, ",")
    .replace(/\s+/g, " ")
    .replace(/ ?([a-zA-Z]) ?/g, "$1")
    .replace(/,(-)/g, "$1")
    .replace(/ (-)/g, "$1")
    .trim();
  return path ? out.replace(/(\.\d+) (?=\.\d)/g, "$1") : out;
}

/** Tokenise path data, round every coordinate (not arc flags) and re-join with the fewest separators. */
function compactPath(d: string, p: number) {
  if (!/^[\s\d.,eE+\-MmLlHhVvCcSsQqTtAaZz]*$/.test(d)) return d;
  const ARGS: Record<string, number> = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };
  const out: string[] = [];
  let i = 0, cmd = "", prev = "";
  const num = /^[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/;
  const push = (tok: string) => {
    // A separator is needed unless the next token starts with "-" or is ".5" after a number that already has a dot.
    if (prev && /[\d.]$/.test(prev) && !(tok.startsWith("-") || (tok.startsWith(".") && prev.includes(".") && !/e/i.test(prev)))) out.push(" ");
    out.push(tok);
    prev = tok;
  };
  let argIndex = 0;
  while (i < d.length) {
    const ch = d[i];
    if (/[\s,]/.test(ch)) { i++; continue; }
    if (/[a-zA-Z]/.test(ch)) {
      cmd = ch;
      out.push(ch);
      prev = ch;
      argIndex = 0;
      i++;
      continue;
    }
    const lower = cmd.toLowerCase();
    if (lower === "a" && (argIndex % 7 === 3 || argIndex % 7 === 4) && /[01]/.test(ch)) {
      push(ch);
      i++;
      argIndex++;
      continue;
    }
    const m = d.slice(i).match(num);
    if (!m) return d;
    push(roundNum(m[0], p));
    i += m[0].length;
    argIndex++;
    if (!ARGS[lower] && lower !== "z") return d;
  }
  return out.join("");
}

const hexShort = (h: string) => {
  const m = h.toLowerCase().match(/^#([0-9a-f])\1([0-9a-f])\2([0-9a-f])\3$/);
  return m ? `#${m[1]}${m[2]}${m[3]}` : h.toLowerCase();
};

export function shortColor(v: string) {
  const s = v.trim();
  const rgb = s.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i);
  if (rgb) return hexShort("#" + rgb.slice(1, 4).map((x) => Math.min(255, +x).toString(16).padStart(2, "0")).join(""));
  if (/^#[0-9a-f]{6}$/i.test(s)) return hexShort(s);
  if (/^#[0-9a-f]{3}$/i.test(s)) return s.toLowerCase();
  const names: Record<string, string> = { "#f00": "red", "#c0c0c0": "silver", "#808080": "gray", "#800000": "maroon", "#808000": "olive", "#008000": "green", "#800080": "purple", "#008080": "teal", "#000080": "navy", "#ffa500": "orange", "#ff0000": "red" };
  const short = names[s.toLowerCase()];
  return short && short.length < s.length ? short : s;
}

function parseStyle(s: string): [string, string][] {
  return s
    .split(";")
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => {
      const i = d.indexOf(":");
      return (i < 0 ? [d, ""] : [d.slice(0, i).trim().toLowerCase(), d.slice(i + 1).trim()]) as [string, string];
    })
    .filter(([k, v]) => k && v);
}

/* ── optimiser ─────────────────────────────────────────────────────── */

export function optimizeSvg(src: string, o: SvgoOptions): { svg: string; log: Log[]; doc: Document } {
  const doc = parseSvg(src);
  const root = doc.documentElement;
  const counter = new Map<string, number>();
  const hit = (pass: string, n = 1) => counter.set(pass, (counter.get(pass) ?? 0) + n);
  const styleText = Array.from(root.getElementsByTagName("style")).map((s) => s.textContent ?? "").join("\n");

  // 1. Comments, processing instructions, doctype.
  const walker = (n: Node) => {
    for (const c of Array.from(n.childNodes)) {
      if (c.nodeType === 8) {
        if (!(c.textContent ?? "").startsWith("!")) {
          c.remove();
          hit("Comments removed");
        }
      } else if (c.nodeType === 7) {
        c.parentNode?.removeChild(c);
        hit("Processing instructions removed");
      } else if (c.nodeType === 1) walker(c);
    }
  };
  walker(doc);
  if (doc.doctype) {
    doc.removeChild(doc.doctype);
    hit("Doctype removed");
  }

  // 2. Metadata and editor-only elements.
  for (const el of Array.from(root.getElementsByTagName("*"))) {
    if (!el.isConnected) continue;
    const name = el.tagName;
    if (el.localName === "metadata" || EDITOR_NS.test(name) || (el.namespaceURI && el.namespaceURI !== SVG_NS && EDITOR_NS_URI.test(el.namespaceURI))) {
      el.remove();
      hit(el.localName === "metadata" ? "<metadata> removed" : "Editor elements removed");
    } else if (!o.keepTitle && (el.localName === "title" || el.localName === "desc")) {
      el.remove();
      hit("<title>/<desc> removed");
    }
  }

  // 3. Collect referenced IDs (url(#x), href="#x", CSS, animation begin/end).
  const refs = new Set<string>();
  const scanRefs = (s: string) => {
    for (const m of s.matchAll(/url\(\s*['"]?#([^'")\s]+)['"]?\s*\)/g)) refs.add(m[1]);
    for (const m of s.matchAll(/#([A-Za-z_][\w.-]*)/g)) refs.add(m[1]);
  };
  scanRefs(styleText);
  const allEls = () => [root, ...Array.from(root.getElementsByTagName("*"))];
  for (const el of allEls())
    for (const a of Array.from(el.attributes)) {
      if (/(^|:)href$/.test(a.name) && a.value.startsWith("#")) refs.add(a.value.slice(1));
      else if (a.name === "begin" || a.name === "end") for (const m of a.value.matchAll(/([A-Za-z_][\w-]*)\.(?:begin|end|click)/g)) refs.add(m[1]);
      else if (a.value.includes("url(")) scanRefs(a.value);
      else if (a.name === "aria-labelledby" || a.name === "aria-describedby") a.value.split(/\s+/).forEach((x) => refs.add(x));
    }

  // 4. Attributes: editor namespaces, empties, defaults, numbers, colours.
  const visit = (el: Element, inherited: Set<string>) => {
    const tag = el.localName;
    const set = new Set(inherited);
    for (const a of Array.from(el.attributes)) {
      const name = a.name;
      if (name.startsWith("xmlns:") ? EDITOR_NS.test(name.slice(6)) || EDITOR_NS_URI.test(a.value) : EDITOR_NS.test(name) && name.includes(":") && !name.startsWith("xlink:") && !name.startsWith("xml:")) {
        el.removeAttribute(name);
        hit("Editor attributes removed");
        continue;
      }
      if (name === "enable-background" || (el === root && (name === "version" || name === "baseProfile")) || name === "data-name") {
        el.removeAttribute(name);
        hit("Obsolete attributes removed");
        continue;
      }
      if (!a.value.trim() && name !== "alt") {
        el.removeAttribute(name);
        hit("Empty attributes removed");
        continue;
      }
      if (name === "id" && o.removeIds && !refs.has(a.value)) {
        el.removeAttribute(name);
        hit("Unused IDs removed");
        continue;
      }
      if (DEFAULTS[name] === a.value.trim() && !inherited.has(name) && !styleText.includes(name)) {
        el.removeAttribute(name);
        hit("Default values removed");
        continue;
      }
      if ((name === "x" || name === "y") && XY_ZERO.has(tag) && parseFloat(a.value) === 0 && /^[-+]?0*\.?0*(px)?$/.test(a.value.trim())) {
        el.removeAttribute(name);
        hit("Default values removed");
        continue;
      }
      let v = a.value;
      if (name === "d") v = compactPath(v, o.precision);
      else if (name === "points" || name === "transform" || name === "viewBox" || name === "gradientTransform" || name === "patternTransform") v = compactNumbers(v, o.precision).replace(/([a-z])\(/gi, "$1(");
      else if (NUMERIC_ATTRS.has(name) && /^[-+]?(\d*\.\d+|\d+\.?)(e[-+]?\d+)?(px)?$/i.test(v.trim())) v = roundNum(v, o.precision) + (/(px)$/.test(v.trim()) && name !== "offset" ? "" : "");
      else if (COLOR_ATTRS.has(name)) v = shortColor(v);
      else if (name === "style") {
        const decls = parseStyle(v).filter(([k, val]) => {
          if (EDITOR_NS.test(k) || k.startsWith("-inkscape")) {
            hit("Editor attributes removed");
            return false;
          }
          if (DEFAULTS[k] === val && !inherited.has(k)) {
            hit("Default values removed");
            return false;
          }
          return true;
        });
        v = decls.map(([k, val]) => `${k}:${COLOR_ATTRS.has(k) ? shortColor(val) : /^[-+]?(\d*\.\d+|\d+\.?)(px)?$/.test(val) ? roundNum(val, o.precision) + (val.endsWith("px") && val !== "0px" ? "px" : "") : val}`).join(";");
        for (const [k] of decls) set.add(k);
        if (!v) {
          el.removeAttribute(name);
          hit("Empty attributes removed");
          continue;
        }
      }
      if (v !== a.value) {
        el.setAttribute(name, v);
        hit(name === "d" || name === "points" || name === "transform" ? "Coordinates rounded" : COLOR_ATTRS.has(name) ? "Colours shortened" : "Numbers rounded");
      }
      if (name in DEFAULTS) set.add(name);
    }
    for (const c of Array.from(el.children)) visit(c, set);
  };
  visit(root, new Set());

  // 5. Unused gradients / defs content, empty containers, attribute-less groups.
  if (o.removeIds) {
    for (const el of Array.from(root.getElementsByTagName("*"))) {
      const parent = el.parentElement;
      if (parent?.localName === "defs" && !el.hasAttribute("id") && /Gradient|pattern|clipPath|mask|filter|marker|symbol/.test(el.localName)) {
        el.remove();
        hit("Unused definitions removed");
      }
    }
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const el of Array.from(root.getElementsByTagName("*")).reverse()) {
      if (!el.isConnected) continue;
      const tag = el.localName;
      const empty = !el.children.length && !(el.textContent ?? "").trim();
      if (CONTAINERS.has(tag) && empty && (!el.id || !refs.has(el.id)) && tag !== "a") {
        el.remove();
        hit("Empty containers removed");
        changed = true;
      } else if (tag === "g" && el.attributes.length === 0 && el.parentNode) {
        while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el);
        el.remove();
        hit("Attribute-less groups unwrapped");
        changed = true;
      }
    }
  }

  // 6. Drop namespace declarations nothing uses any more.
  const used = new Set<string>();
  for (const el of allEls()) {
    if (el.prefix) used.add(el.prefix);
    for (const a of Array.from(el.attributes)) if (a.prefix && a.prefix !== "xmlns") used.add(a.prefix);
  }
  for (const a of Array.from(root.attributes))
    if (a.name.startsWith("xmlns:") && !used.has(a.name.slice(6))) {
      root.removeAttribute(a.name);
      hit("Unused namespaces removed");
    }
  if (!root.hasAttribute("xmlns")) root.setAttribute("xmlns", SVG_NS);

  const svg = serialize(root, o.pretty);
  const log = [...counter.entries()].map(([pass, count]) => ({ pass, count }));
  return { svg, log, doc };
}

/* ── serializer ────────────────────────────────────────────────────── */

const escAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const escText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function serialize(root: Element, pretty: boolean): string {
  const out: string[] = [];
  const walk = (el: Element, depth: number, preserve: boolean) => {
    const pad = pretty ? "  ".repeat(depth) : "";
    const tag = el.tagName;
    const attrs = Array.from(el.attributes).map((a) => ` ${a.name}="${escAttr(a.value)}"`).join("");
    const keepText = TEXT_KEEP.has(el.localName) || preserve || el.getAttribute("xml:space") === "preserve";
    const kids = Array.from(el.childNodes).filter((c) => c.nodeType === 1 || c.nodeType === 8 || ((c.nodeType === 3 || c.nodeType === 4) && (keepText || (c.textContent ?? "").trim())));
    if (!kids.length) {
      out.push(`${pad}<${tag}${attrs}/>`);
      return;
    }
    const inline = kids.every((c) => c.nodeType === 3 || c.nodeType === 4) || keepText;
    if (inline) {
      const inner = kids
        .map((c) => {
          if (c.nodeType === 4) return `<![CDATA[${c.textContent}]]>`;
          if (c.nodeType === 1) {
            const sub: string[] = [];
            const saved = out.length;
            walk(c as Element, 0, true);
            sub.push(...out.splice(saved));
            return sub.join("");
          }
          if (c.nodeType === 8) return `<!--${c.textContent}-->`;
          const t = c.textContent ?? "";
          if (el.localName === "style") return /[<&]/.test(t) ? `<![CDATA[${t.trim()}]]>` : t.replace(/\s+/g, " ").trim();
          return escText(preserve || el.getAttribute("xml:space") === "preserve" ? t : t.replace(/\s+/g, " "));
        })
        .join("");
      out.push(`${pad}<${tag}${attrs}>${el.localName === "style" || el.localName === "title" ? inner.trim() : inner}</${tag}>`);
      return;
    }
    out.push(`${pad}<${tag}${attrs}>`);
    for (const c of kids) {
      if (c.nodeType === 1) walk(c as Element, depth + 1, preserve);
      else if (c.nodeType === 8) out.push(`${pretty ? "  ".repeat(depth + 1) : ""}<!--${c.textContent}-->`);
      else out.push(`${pretty ? "  ".repeat(depth + 1) : ""}${escText((c.textContent ?? "").trim())}`);
    }
    out.push(`${pad}</${tag}>`);
  };
  walk(root, 0, false);
  return out.join(pretty ? "\n" : "");
}

/* ── output formats ────────────────────────────────────────────────── */

export function toBase64Utf8(s: string) {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** The "mini-svg-data-uri" trick: single quotes, minimal percent-encoding. */
export function miniDataUri(svg: string) {
  const body = svg
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/"/g, "'")
    .replace(/[%#<>?[\\\]^`{|}]/g, encodeURIComponent)
    .trim();
  return `data:image/svg+xml,${body}`;
}

const camel = (s: string) => s.replace(/[-:]([a-z])/g, (_, c: string) => c.toUpperCase());
const JSX_KEEP = /^(data-|aria-)/;

export function toJsx(root: Element, componentName = "Icon"): string {
  const walk = (el: Element, depth: number): string => {
    const pad = "  ".repeat(depth);
    const attrs = Array.from(el.attributes)
      .filter((a) => !(a.name.startsWith("xmlns:") && el !== root))
      .filter((a) => a.name !== "xmlns:xlink")
      .map((a) => {
        if (a.name === "style") {
          const obj = parseStyle(a.value)
            .map(([k, v]) => `${k.startsWith("--") ? JSON.stringify(k) : camel(k.replace(/^-ms-/, "ms-"))}: ${/^-?\d*\.?\d+$/.test(v) ? v : JSON.stringify(v)}`)
            .join(", ");
          return ` style={{ ${obj} }}`;
        }
        const name = a.name === "class" ? "className" : a.name === "for" ? "htmlFor" : JSX_KEEP.test(a.name) ? a.name : camel(a.name);
        return ` ${name}=${JSON.stringify(a.value)}`;
      })
      .join("");
    const spread = el === root ? " {...props}" : "";
    const kids = Array.from(el.childNodes).filter((c) => c.nodeType === 1 || (c.nodeType === 3 && (c.textContent ?? "").trim()));
    if (!kids.length) return `${pad}<${el.tagName}${attrs}${spread} />`;
    const inner = kids
      .map((c) => {
        if (c.nodeType === 1) return walk(c as Element, depth + 1);
        const t = (c.textContent ?? "").trim();
        return `${"  ".repeat(depth + 1)}${el.localName === "style" ? `{${JSON.stringify(t)}}` : /[{}<>]/.test(t) ? `{${JSON.stringify(t)}}` : t}`;
      })
      .join("\n");
    return `${pad}<${el.tagName}${attrs}${spread}>\n${inner}\n${pad}</${el.tagName}>`;
  };
  return `export default function ${componentName}(props) {\n  return (\n${walk(root, 2)}\n  );\n}\n`;
}
