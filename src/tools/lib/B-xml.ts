/**
 * XML helpers: a JSON → XML builder with attribute / text-key conventions,
 * and a structural scanner for the validator (namespaces, entities, roots,
 * declaration, statistics). Run the scanner only after a well-formedness check.
 */

/* ── JSON → XML ────────────────────────────────────────────────────── */

export type BuildOpts = {
  root: string;
  attrPrefix: string;
  textKey: string;
  arrays: "repeat" | "wrap";
  itemName: string;
  indent: string;
  decl: boolean;
  cdata: boolean;
  nulls: "empty" | "nil" | "omit";
};

export function safeName(k: string, renamed: Set<string>): string {
  let s = k.replace(/[^\p{L}\p{N}_.:-]/gu, "_");
  if (!/^[\p{L}_]/u.test(s) || /^xml/i.test(s)) s = "_" + s;
  if (s !== k) renamed.add(`${k} → ${s}`);
  return s;
}

/** items → item, categories → category, addresses → address; null when there is no plural. */
function singular(k: string): string | null {
  if (/ies$/i.test(k) && k.length > 4) return k.slice(0, -3) + "y";
  if (/(ss|us|is)$/i.test(k)) return null;
  if (/(sses|xes|ches|shes)$/i.test(k)) return k.slice(0, -2);
  if (/[^s]s$/i.test(k) && k.length > 2) return k.slice(0, -1);
  return null;
}

const escText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;").replace(/\n/g, "&#10;").replace(/\t/g, "&#9;");

export function jsonToXml(value: unknown, o: BuildOpts): { xml: string; notes: string[] } {
  const renamed = new Set<string>();
  const nl = o.indent ? "\n" : "";
  let usesNil = false;
  const text = (v: unknown) => {
    const s = typeof v === "string" ? v : String(v);
    if (o.cdata && /[<&]/.test(s)) return `<![CDATA[${s.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
    return escText(s);
  };
  const isAttr = (k: string) => o.attrPrefix !== "" && k.startsWith(o.attrPrefix) && k.length > o.attrPrefix.length;

  const el = (name: string, v: unknown, depth: number): string[] => {
    const pad = o.indent.repeat(depth);
    const tag = safeName(name, renamed);
    if (Array.isArray(v)) {
      if (o.arrays === "repeat") return v.flatMap((x) => el(name, x, depth));
      const inner = v.flatMap((x) => el(singular(name) ?? (o.itemName || "item"), x, depth + 1));
      return inner.length ? [`${pad}<${tag}>`, ...inner, `${pad}</${tag}>`] : [`${pad}<${tag}/>`];
    }
    if (v === null || v === undefined) {
      if (o.nulls === "omit") return [];
      if (o.nulls === "nil") { usesNil = true; return [`${pad}<${tag} xsi:nil="true"/>`]; }
      return [`${pad}<${tag}/>`];
    }
    if (typeof v !== "object") return [`${pad}<${tag}>${text(v)}</${tag}>`];
    const obj = v as Record<string, unknown>;
    let attrs = "";
    let txt: string | null = null;
    const kids: string[] = [];
    for (const [k, x] of Object.entries(obj)) {
      if (isAttr(k)) {
        if (x !== null && typeof x === "object") { kids.push(...el(k.slice(o.attrPrefix.length), x, depth + 1)); continue; }
        attrs += ` ${safeName(k.slice(o.attrPrefix.length), renamed)}="${escAttr(x === null ? "" : String(x))}"`;
      } else if (k === o.textKey) {
        txt = (txt ?? "") + (x === null ? "" : Array.isArray(x) ? x.join("") : String(x));
      } else kids.push(...el(k, x, depth + 1));
    }
    if (!kids.length && txt === null) return [`${pad}<${tag}${attrs}/>`];
    if (!kids.length) return [`${pad}<${tag}${attrs}>${text(txt)}</${tag}>`];
    const body = txt !== null ? [`${o.indent.repeat(depth + 1)}${text(txt)}`, ...kids] : kids;
    return [`${pad}<${tag}${attrs}>`, ...body, `${pad}</${tag}>`];
  };

  let lines: string[];
  const notes: string[] = [];
  const keys = value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value) : [];
  if (!o.root && keys.length === 1 && !isAttr(keys[0]) && keys[0] !== o.textKey && !Array.isArray((value as Record<string, unknown>)[keys[0]])) {
    lines = el(keys[0], (value as Record<string, unknown>)[keys[0]], 0);
  } else {
    const root = o.root || "root";
    if (Array.isArray(value)) {
      const inner = value.flatMap((x) => el(o.itemName || "item", x, 1));
      const tag = safeName(root, renamed);
      lines = inner.length ? [`<${tag}>`, ...inner, `</${tag}>`] : [`<${tag}/>`];
    } else lines = el(root, value, 0);
    if (!o.root) notes.push(`Wrapped in <${root}> because XML needs exactly one root element.`);
  }
  if (usesNil && lines.length) lines[0] = lines[0].replace(/^(<[^\s/>]+)/, '$1 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"');
  if (renamed.size) notes.push(`Renamed keys that are not valid XML names: ${[...renamed].slice(0, 8).join(", ")}${renamed.size > 8 ? "…" : ""}`);
  let xml = lines.map((l) => (o.indent ? l : l.trim())).join(nl);
  if (o.decl) xml = `<?xml version="1.0" encoding="UTF-8"?>${nl || "\n"}${xml}`;
  return { xml, notes };
}

/* ── structural scan ───────────────────────────────────────────────── */

export type ScanIssue = { level: "error" | "warning" | "info"; message: string; line?: number; col?: number };
export type ScanResult = {
  issues: ScanIssue[];
  stats: { elements: number; attributes: number; depth: number; namespaces: string[]; text: number; comments: number; cdata: number; pis: number; names: number; roots: number; entities: number };
  decl: { version?: string; encoding?: string; standalone?: string } | null;
  doctype: string | null;
};

const PREDEF = new Set(["amp", "lt", "gt", "quot", "apos"]);

export function scanXml(src: string): ScanResult {
  const issues: ScanIssue[] = [];
  const lineStarts = [0];
  for (let i = 0; i < src.length; i++) if (src.charCodeAt(i) === 10) lineStarts.push(i + 1);
  const pos = (p: number) => {
    let lo = 0, hi = lineStarts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lineStarts[mid] <= p) lo = mid; else hi = mid - 1; }
    return { line: lo + 1, col: p - lineStarts[lo] + 1 };
  };
  const stats = { elements: 0, attributes: 0, depth: 0, namespaces: [] as string[], text: 0, comments: 0, cdata: 0, pis: 0, names: 0, roots: 0, entities: 0 };
  const nsUris = new Set<string>();
  const names = new Set<string>();
  const declared = new Set<string>();
  let decl: ScanResult["decl"] = null;
  let doctype: string | null = null;
  const stack: { name: string; ns: Map<string, string> }[] = [];
  const lookup = (prefix: string) => {
    if (prefix === "xml" || prefix === "xmlns") return "builtin";
    for (let k = stack.length - 1; k >= 0; k--) if (stack[k].ns.has(prefix)) return stack[k].ns.get(prefix)!;
    return undefined;
  };
  const reportedPrefixes = new Set<string>();
  const checkEntities = (s: string, base: number) => {
    const re = /&([^;\s&<]*);?/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s))) {
      const name = m[1];
      if (!m[0].endsWith(";")) { issues.push({ level: "error", message: `Bare "&" must be written as &amp;`, ...pos(base + m.index) }); continue; }
      if (name.startsWith("#")) {
        const cp = name[1] === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
        if (!Number.isFinite(cp) || cp === 0 || cp > 0x10ffff || (cp < 0x20 && ![9, 10, 13].includes(cp)))
          issues.push({ level: "error", message: `Invalid character reference &${name};`, ...pos(base + m.index) });
        continue;
      }
      stats.entities++;
      if (!PREDEF.has(name) && !declared.has(name)) issues.push({ level: "error", message: `Undefined entity &${name}; — only &amp; &lt; &gt; &quot; &apos; exist without a DTD`, ...pos(base + m.index) });
    }
  };

  let i = 0;
  const n = src.length;
  if (src.charCodeAt(0) === 0xfeff) { issues.push({ level: "info", message: "Starts with a UTF-8 byte-order mark" }); i = 1; }
  let seenRootEnd = false;
  while (i < n) {
    const lt = src.indexOf("<", i);
    const textEnd = lt < 0 ? n : lt;
    if (textEnd > i) {
      const t = src.slice(i, textEnd);
      if (t.trim()) {
        if (!stack.length) issues.push({ level: "error", message: `Text outside the root element: "${t.trim().slice(0, 30)}"`, ...pos(i + t.search(/\S/)) });
        else stats.text++;
        checkEntities(t, i);
      }
    }
    if (lt < 0) break;
    i = lt;
    if (src.startsWith("<!--", i)) {
      const e = src.indexOf("-->", i + 4);
      const body = src.slice(i + 4, e < 0 ? n : e);
      if (body.includes("--")) issues.push({ level: "error", message: 'A comment may not contain "--"', ...pos(i + 4 + body.indexOf("--")) });
      stats.comments++;
      i = e < 0 ? n : e + 3;
      continue;
    }
    if (src.startsWith("<![CDATA[", i)) {
      const e = src.indexOf("]]>", i);
      if (!stack.length) issues.push({ level: "error", message: "CDATA section outside the root element", ...pos(i) });
      stats.cdata++;
      i = e < 0 ? n : e + 3;
      continue;
    }
    if (src.startsWith("<!DOCTYPE", i) || src.startsWith("<!doctype", i)) {
      let depth = 0, j = i;
      for (; j < n; j++) {
        if (src[j] === "[") depth++;
        else if (src[j] === "]") depth--;
        else if (src[j] === ">" && depth <= 0) break;
      }
      doctype = src.slice(i, j + 1);
      for (const m of doctype.matchAll(/<!ENTITY\s+(%\s+)?([^\s]+)/g)) declared.add(m[2]);
      if (stats.roots) issues.push({ level: "error", message: "DOCTYPE must come before the root element", ...pos(i) });
      i = j + 1;
      continue;
    }
    if (src.startsWith("<?", i)) {
      const e = src.indexOf("?>", i);
      const body = src.slice(i + 2, e < 0 ? n : e);
      const target = /^\S+/.exec(body)?.[0] ?? "";
      if (target.toLowerCase() === "xml") {
        if (i > (src.charCodeAt(0) === 0xfeff ? 1 : 0)) issues.push({ level: "error", message: "The XML declaration must be the very first thing in the document (no whitespace or comments before it)", ...pos(i) });
        if (target !== "xml") issues.push({ level: "error", message: `The declaration must be lower-case "<?xml"`, ...pos(i) });
        decl = {};
        for (const m of body.matchAll(/(\w+)\s*=\s*(["'])(.*?)\2/g)) (decl as Record<string, string>)[m[1]] = m[3];
      } else stats.pis++;
      i = e < 0 ? n : e + 2;
      continue;
    }
    if (src[i + 1] === "/") {
      const e = src.indexOf(">", i);
      const name = src.slice(i + 2, e).trim();
      stack.pop();
      if (!stack.length) seenRootEnd = true;
      i = e + 1;
      continue;
    }
    // start tag: find the closing '>' outside quotes
    let j = i + 1, q = "";
    for (; j < n; j++) {
      const c = src[j];
      if (q) { if (c === q) q = ""; continue; }
      if (c === '"' || c === "'") q = c;
      else if (c === ">") break;
    }
    const raw = src.slice(i + 1, j);
    const selfClose = raw.endsWith("/");
    const inner = selfClose ? raw.slice(0, -1) : raw;
    const nameM = /^[^\s/>]+/.exec(inner);
    const name = nameM ? nameM[0] : "";
    stats.elements++;
    names.add(name);
    if (!stack.length) {
      stats.roots++;
      if (seenRootEnd || stats.roots > 1) issues.push({ level: "error", message: `Second root element <${name}> — a document has exactly one root`, ...pos(i) });
    }
    const ns = new Map<string, string>();
    const attrs: { name: string; value: string; at: number }[] = [];
    const attrRe = /([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let m: RegExpExecArray | null;
    const attrText = inner.slice(name.length);
    const base = i + 1 + name.length;
    while ((m = attrRe.exec(attrText))) {
      const an = m[1], av = m[3] ?? m[4] ?? "";
      attrs.push({ name: an, value: av, at: base + m.index });
      if (an === "xmlns") { ns.set("", av); if (av) nsUris.add(av); }
      else if (an.startsWith("xmlns:")) {
        const p = an.slice(6);
        if (!av) issues.push({ level: "error", message: `xmlns:${p}="" — a prefix cannot be undeclared in XML 1.0`, ...pos(base + m.index) });
        ns.set(p, av);
        if (av) nsUris.add(av);
      }
      checkEntities(av, base + m.index + an.length + 2);
      if (/</.test(av)) issues.push({ level: "error", message: `"<" is not allowed in the value of attribute ${an}`, ...pos(base + m.index) });
    }
    stats.attributes += attrs.filter((a) => !a.name.startsWith("xmlns")).length;
    stack.push({ name, ns });
    stats.depth = Math.max(stats.depth, stack.length);
    const check = (qn: string, at: number, what: string) => {
      const c = qn.indexOf(":");
      if (c <= 0) return;
      const p = qn.slice(0, c);
      if (lookup(p) === undefined && !reportedPrefixes.has(p + "@" + at)) {
        reportedPrefixes.add(p + "@" + at);
        issues.push({ level: "error", message: `Namespace prefix "${p}" on ${what} ${qn} is not declared (add xmlns:${p}="…")`, ...pos(at) });
      }
    };
    check(name, i, "element");
    const seenAttr = new Map<string, string>();
    for (const a of attrs) {
      if (!a.name.startsWith("xmlns")) check(a.name, a.at, "attribute");
      // Same local name + same namespace URI is a duplicate even with different prefixes.
      const c = a.name.indexOf(":");
      if (c > 0 && !a.name.startsWith("xmlns:")) {
        const key = `{${lookup(a.name.slice(0, c)) ?? a.name.slice(0, c)}}${a.name.slice(c + 1)}`;
        if (seenAttr.has(key) && seenAttr.get(key) !== a.name) issues.push({ level: "error", message: `Attributes ${seenAttr.get(key)} and ${a.name} are the same name in the same namespace`, ...pos(a.at) });
        seenAttr.set(key, a.name);
      }
    }
    if (selfClose) { stack.pop(); if (!stack.length) seenRootEnd = true; }
    i = j + 1;
  }
  stats.names = names.size;
  stats.namespaces = [...nsUris];
  if (!stats.roots) issues.push({ level: "error", message: "No root element found" });
  if (!decl) issues.push({ level: "info", message: "No XML declaration — parsers assume version 1.0 and UTF-8 (or UTF-16 with a BOM)" });
  else {
    const d = decl as { version?: string; encoding?: string; standalone?: string };
    if (!d.version) issues.push({ level: "error", message: "The XML declaration needs a version, e.g. version=\"1.0\"", line: 1 });
    else if (!/^1\.[01]$/.test(d.version)) issues.push({ level: "error", message: `Unsupported XML version "${d.version}"`, line: 1 });
    if (!d.encoding) issues.push({ level: "info", message: "No encoding in the declaration — UTF-8 is assumed", line: 1 });
    else if (!/^(utf-?8|utf-?16(le|be)?|iso-8859-\d+|us-ascii|windows-125\d|shift_jis|euc-jp|gb2312|gbk|big5|koi8-r)$/i.test(d.encoding))
      issues.push({ level: "warning", message: `Unusual encoding "${d.encoding}" — many parsers only support UTF-8 and UTF-16`, line: 1 });
    else if (!/^utf-?8$/i.test(d.encoding) && /[^\x00-\x7f]/.test(src)) issues.push({ level: "warning", message: `Declared encoding is ${d.encoding}, but text pasted here is Unicode — make sure the file is really saved as ${d.encoding}`, line: 1 });
    if (d.standalone && !/^(yes|no)$/.test(d.standalone)) issues.push({ level: "error", message: `standalone must be "yes" or "no", not "${d.standalone}"`, line: 1 });
  }
  return { issues, stats, decl, doctype };
}
