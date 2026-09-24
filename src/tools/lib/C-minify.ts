/** Small, conservative minifiers for CSS, HTML and SQL. */

/* ── CSS ─────────────────────────────────────────────────────────────── */

type Tok = { t: "str" | "com" | "ws" | "url" | "code"; v: string };

function cssTokens(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0, code = "";
  const flush = () => { if (code) { out.push({ t: "code", v: code }); code = ""; } };
  while (i < src.length) {
    const c = src[i];
    if (c === "/" && src[i + 1] === "*") {
      const e = src.indexOf("*/", i + 2);
      const end = e < 0 ? src.length : e + 2;
      flush();
      out.push({ t: "com", v: src.slice(i, end) });
      i = end;
    } else if (c === "/" && src[i + 1] === "/" && !/:$/.test(code) && !/url\($/i.test(code)) {
      // SCSS/Less line comment
      const e = src.indexOf("\n", i);
      flush();
      out.push({ t: "com", v: src.slice(i, e < 0 ? src.length : e) });
      i = e < 0 ? src.length : e;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== c) { if (src[j] === "\\") j++; j++; }
      flush();
      out.push({ t: "str", v: src.slice(i, j + 1) });
      i = j + 1;
    } else if (/url\($/i.test(code + c) === false && /^url\(/i.test(src.slice(i, i + 4)) && !/["']/.test(src.slice(i + 4).trimStart()[0] ?? "")) {
      const e = src.indexOf(")", i);
      flush();
      out.push({ t: "url", v: src.slice(i, e < 0 ? src.length : e + 1).replace(/^url\(\s*/i, "url(").replace(/\s*\)$/, ")") });
      i = e < 0 ? src.length : e + 1;
    } else if (/\s/.test(c)) {
      let j = i;
      while (j < src.length && /\s/.test(src[j])) j++;
      flush();
      out.push({ t: "ws", v: " " });
      i = j;
    } else {
      code += c;
      i++;
    }
  }
  flush();
  return out;
}

export function minifyCss(src: string, o: { keepLicense?: boolean } = {}): string {
  const toks = cssTokens(src).filter((t) => t.t !== "com" || (o.keepLicense && t.v.startsWith("/*!")));
  // Transform declaration values only (never selectors, strings or urls).
  const xform = (v: string) =>
    v
      .replace(/(^|[\s(,])-?0*\.?0+(?:px|em|rem|pt|pc|cm|mm|in|ex|ch|vw|vh|vmin|vmax|q)(?![\w%])/gi, (_m, pre: string) => pre + "0")
      .replace(/(^|[^\w.#-])(-?)0+(\.\d+)/g, "$1$2$3") // 0.5 → .5
      .replace(/(\.\d*?[1-9])0+(?!\d)/g, "$1") // 1.50 → 1.5
      .replace(/(^|[^\w.#-])(-?\d+)\.0+(?!\d)/g, "$1$2") // 2.0 → 2
      .replace(/#([0-9a-fA-F])\1([0-9a-fA-F])\2([0-9a-fA-F])\3(?![0-9a-fA-F])/g, "#$1$2$3")
      .replace(/#[0-9a-fA-F]{3,8}(?![0-9a-fA-F])/g, (h) => h.toLowerCase());
  let depth = 0;
  let inValue = false;
  for (const t of toks) {
    if (t.t !== "code") continue;
    let out = "", seg = "", segIsValue = inValue;
    for (const ch of t.v) {
      if (ch === "{" || ch === "}" || ch === ";" || ch === ":") {
        out += segIsValue ? xform(seg) : seg;
        seg = "";
        if (ch === "{") { depth++; inValue = false; }
        else if (ch === "}") { depth = Math.max(0, depth - 1); inValue = false; }
        else if (ch === ";") inValue = false;
        else if (depth > 0) inValue = true;
        out += ch;
        segIsValue = inValue;
      } else seg += ch;
    }
    t.v = out + (segIsValue ? xform(seg) : seg);
  }
  // Merge whitespace runs left behind by removed comments.
  for (let k = toks.length - 1; k > 0; k--) if (toks[k].t === "ws" && (toks[k - 1].t === "ws" || toks[k - 1].t === "com")) toks.splice(k, 1);
  let out = "";
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    if (t.t === "ws") {
      const prev = out[out.length - 1] ?? "";
      const next = toks[k + 1];
      const nc = next ? next.v[0] : "";
      if (!prev || /[{};,:>~+(\[=]/.test(prev) || /^[{};,>~)\]=!]/.test(nc) || !next) continue;
      if (nc === ":" && /[\w-]$/.test(prev)) {
        // "color : red" (declaration) vs "a :hover" (selector): look ahead for "{" before ";" or "}".
        let sel = false;
        for (let j = k + 1; j < toks.length; j++) {
          const m = toks[j].t === "code" ? /[;{}]/.exec(toks[j].v) : null;
          if (m) { sel = m[0] === "{"; break; }
        }
        if (!sel) continue;
      }
      out += " ";
      continue;
    }
    out += t.v;
  }
  // Put back spaces that are meaningful inside calc()/min()/clamp() around + and -.
  out = out.replace(/(calc|min|max|clamp)\(([^;{}]*)\)/g, (m) => m.replace(/(\S)([+-])(?=[\d.(a-z$-])/gi, (x, a: string, op: string) => (/[\d)%a-z]/i.test(a) ? `${a} ${op} ` : x)).replace(/ {2,}/g, " "));
  out = out.replace(/;;+/g, ";").replace(/;}/g, "}").replace(/\bfont-weight:normal\b/g, "font-weight:400").replace(/\bfont-weight:bold\b/g, "font-weight:700");
  // Drop empty rules (repeat to clear nested @media blocks emptied by the first pass).
  for (let k = 0; k < 4; k++) out = out.replace(/(^|[{};])[^{};@]+\{\}/g, "$1").replace(/@media[^{]+\{\}/g, "");
  return out.trim();
}

/* ── HTML ────────────────────────────────────────────────────────────── */

const BLOCK = new Set("html head body div p ul ol li dl dt dd table thead tbody tfoot tr td th section article aside header footer nav main h1 h2 h3 h4 h5 h6 form fieldset legend figure figcaption blockquote hr br meta link title script style noscript template details summary select option pre textarea address canvas video audio iframe".split(" "));

export function minifyHtml(src: string, o: { comments?: boolean } = {}): string {
  const out: string[] = [];
  let i = 0;
  const n = src.length;
  const tagName = (tag: string) => /^<\/?([a-zA-Z][\w:-]*)/.exec(tag)?.[1]?.toLowerCase() ?? "";
  while (i < n) {
    if (src.startsWith("<!--", i)) {
      const e = src.indexOf("-->", i + 4);
      const end = e < 0 ? n : e + 3;
      const c = src.slice(i, end);
      if (o.comments || /^<!--\[if|^<!--\s*\/?ko\b|^<!--\s*!/.test(c)) out.push(c);
      i = end;
      continue;
    }
    if (src[i] === "<" && /[a-zA-Z!/?]/.test(src[i + 1] ?? "")) {
      // tag — respect quoted attribute values
      let j = i + 1, q = "";
      for (; j < n; j++) {
        const ch = src[j];
        if (q) { if (ch === q) q = ""; continue; }
        if (ch === '"' || ch === "'") q = ch;
        else if (ch === ">") break;
      }
      let tag = src.slice(i, j + 1);
      // collapse whitespace between attributes (outside quotes)
      tag = tag.replace(/("[^"]*"|'[^']*')|\s+/g, (m, qv) => (qv ? qv : " ")).replace(/\s+(\/?>)$/, "$1").replace(/\s*=\s*(?=["'\w])/g, "=");
      out.push(tag);
      i = j + 1;
      const name = tagName(tag);
      if (!tag.startsWith("</") && /^(pre|textarea|script|style)$/.test(name)) {
        const close = src.toLowerCase().indexOf(`</${name}`, i);
        const e = close < 0 ? n : close;
        let body = src.slice(i, e);
        if (name === "script" || name === "style") body = body.trim();
        out.push(body);
        i = e;
      }
      continue;
    }
    const e = src.indexOf("<", i + 1);
    const end = e < 0 ? n : e;
    let text = src.slice(i, end);
    if (!text.trim()) {
      // whitespace between tags: drop next to block elements, else keep one space
      const prev = out[out.length - 1] ?? "";
      const next = src.slice(end, end + 40);
      const nearBlock = BLOCK.has(tagName(prev)) || BLOCK.has(tagName(next)) || !prev || e < 0 || next.startsWith("<!");
      text = nearBlock ? "" : " ";
    } else text = text.replace(/\s+/g, " ");
    out.push(text);
    i = end;
  }
  // trim spaces adjacent to block tags inside text
  return out
    .join("")
    .replace(/\s+(<\/?(?:html|head|body|div|p|ul|ol|li|table|tr|td|th|thead|tbody|section|article|header|footer|nav|main|h[1-6]|br|hr|meta|link|title|form)\b)/gi, "$1")
    .replace(/(<\/?(?:html|head|body|div|p|ul|ol|li|table|tr|td|th|thead|tbody|section|article|header|footer|nav|main|h[1-6]|title|form)\b[^>]*>)\s+/gi, "$1")
    .trim();
}

/* ── SQL ─────────────────────────────────────────────────────────────── */

export function minifySql(src: string, o: { comments?: boolean } = {}): string {
  let out = "";
  let i = 0;
  const n = src.length;
  let pendingSpace = false;
  const emit = (s: string) => {
    if (pendingSpace && out && !/[\s(,;.]$/.test(out) && !/^[),;.]/.test(s)) out += " ";
    pendingSpace = false;
    out += s;
  };
  while (i < n) {
    const c = src[i];
    if (c === "-" && src[i + 1] === "-") {
      const e = src.indexOf("\n", i);
      if (o.comments) { emit(src.slice(i, e < 0 ? n : e).replace(/^--/, "/*").trimEnd() + " */"); }
      i = e < 0 ? n : e;
      pendingSpace = true;
      continue;
    }
    if (c === "#" && /^#\s/.test(src.slice(i, i + 2)) && (!out || /\n\s*$/.test(src.slice(0, i)))) {
      const e = src.indexOf("\n", i);
      i = e < 0 ? n : e;
      pendingSpace = true;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const e = src.indexOf("*/", i + 2);
      const end = e < 0 ? n : e + 2;
      const body = src.slice(i, end);
      if (o.comments || body.startsWith("/*+") || body.startsWith("/*!")) emit(body);
      i = end;
      pendingSpace = true;
      continue;
    }
    if (c === "'" || c === '"' || c === "`" || c === "[") {
      const close = c === "[" ? "]" : c;
      let j = i + 1;
      for (; j < n; j++) {
        if (src[j] === close) {
          if (src[j + 1] === close && c !== "[") { j++; continue; }
          break;
        }
        if (src[j] === "\\" && c !== "[") j++;
      }
      emit(src.slice(i, j + 1));
      i = j + 1;
      continue;
    }
    if (c === "$") {
      const tag = /^\$[A-Za-z_]*\$/.exec(src.slice(i));
      if (tag) {
        const e = src.indexOf(tag[0], i + tag[0].length);
        const end = e < 0 ? n : e + tag[0].length;
        emit(src.slice(i, end));
        i = end;
        continue;
      }
    }
    if (/\s/.test(c)) {
      while (i < n && /\s/.test(src[i])) i++;
      pendingSpace = true;
      continue;
    }
    if (/[(),;=<>+*/]/.test(c)) {
      // no space needed around punctuation/operators
      if (/[)=<>+*/,;]/.test(c)) pendingSpace = false;
      out += c;
      i++;
      if (/[(,=<>+*/;]/.test(c)) {
        while (i < n && /[ \t]/.test(src[i])) i++;
        if (c === ";") pendingSpace = true;
      }
      continue;
    }
    let j = i;
    while (j < n && !/[\s(),;=<>+*/'"`[]/.test(src[j]) && !(src[j] === "-" && src[j + 1] === "-") && !(src[j] === "/" && src[j + 1] === "*")) j++;
    if (j === i) j = i + 1;
    emit(src.slice(i, j));
    i = j;
  }
  return out.trim();
}
