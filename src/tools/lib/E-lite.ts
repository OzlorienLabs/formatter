/**
 * Offline "lite" tooling for Go, Rust and Java: a string/comment-aware lexer,
 * a brace-aware formatter, a heuristic linter, a symbol outline and stats.
 * No compiler — everything is pattern-based and honest about it.
 */

export type LiteLang = "go" | "rust" | "java";
export type LiteIssue = { level: "error" | "warning" | "info"; message: string; line?: number; col?: number };
export type Sym = { line: number; kind: string; name: string; parent: string; signature: string };

const CODE = 0, STR = 1, COM = 2, CHR = 3;

export type Lexed = { src: string; mask: string; kinds: Uint8Array; lineStarts: number[]; issues: LiteIssue[] };

function lineStartsOf(s: string) {
  const a = [0];
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) a.push(i + 1);
  return a;
}

export function posOf(starts: number[], i: number): { line: number; col: number } {
  let lo = 0, hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= i) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo + 1, col: i - starts[lo] + 1 };
}

const RUST_CHAR = /^'(?:\\(?:u\{[0-9a-fA-F]{1,6}\}|x[0-9a-fA-F]{2}|[nrt\\0'"])|[^\\'\n])'/u;

export function lex(src: string, lang: LiteLang): Lexed {
  const n = src.length;
  const kinds = new Uint8Array(n);
  const issues: LiteIssue[] = [];
  const starts = lineStartsOf(src);
  const at = (i: number) => posOf(starts, i);
  const mark = (a: number, b: number, k: number) => kinds.fill(k, a, Math.min(b, n));
  let i = 0;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === "/" && d === "/") {
      let j = src.indexOf("\n", i);
      if (j < 0) j = n;
      mark(i, j, COM);
      i = j;
    } else if (c === "/" && d === "*") {
      let j = i + 2, depth = 1;
      while (j < n && depth > 0) {
        if (lang === "rust" && src[j] === "/" && src[j + 1] === "*") {
          depth++;
          j += 2;
        } else if (src[j] === "*" && src[j + 1] === "/") {
          depth--;
          j += 2;
        } else j++;
      }
      if (depth > 0) issues.push({ level: "error", message: "Unterminated block comment — add */", ...at(i) });
      mark(i, j, COM);
      i = j;
    } else if (lang === "go" && c === "`") {
      const j = src.indexOf("`", i + 1);
      if (j < 0) {
        issues.push({ level: "error", message: "Unterminated raw string — add a closing backtick", ...at(i) });
        mark(i, n, STR);
        i = n;
      } else {
        mark(i, j + 1, STR);
        i = j + 1;
      }
    } else if (lang === "rust" && (c === "r" || (c === "b" && d === "r")) && !/[\w]/.test(src[i - 1] ?? "") && /^b?r(#*)"/.test(src.slice(i, i + 40))) {
      const m = /^b?r(#*)"/.exec(src.slice(i, i + 40))!;
      const close = '"' + m[1];
      const j = src.indexOf(close, i + m[0].length);
      if (j < 0) {
        issues.push({ level: "error", message: `Unterminated raw string — add ${close}`, ...at(i) });
        mark(i, n, STR);
        i = n;
      } else {
        mark(i, j + close.length, STR);
        i = j + close.length;
      }
    } else if (lang === "java" && src.startsWith('"""', i)) {
      let j = i + 3;
      while (j < n && !(src.startsWith('"""', j) && src[j - 1] !== "\\")) j++;
      if (j >= n) {
        issues.push({ level: "error", message: 'Unterminated text block — add """', ...at(i) });
        mark(i, n, STR);
        i = n;
      } else {
        mark(i, j + 3, STR);
        i = j + 3;
      }
    } else if (c === '"') {
      let j = i + 1;
      let ok = false;
      while (j < n) {
        const x = src[j];
        if (x === "\\") {
          j += 2;
          continue;
        }
        if (x === '"') {
          ok = true;
          break;
        }
        if (x === "\n" && lang !== "rust") break;
        j++;
      }
      if (!ok) issues.push({ level: "error", message: "Unterminated string literal — add the closing \"", ...at(i) });
      mark(i, ok ? j + 1 : j, STR);
      i = ok ? j + 1 : j;
    } else if (c === "'") {
      if (lang === "rust") {
        const m = RUST_CHAR.exec(src.slice(i, i + 14));
        if (m) {
          mark(i, i + m[0].length, CHR);
          i += m[0].length;
        } else i++; // a lifetime or loop label
      } else {
        let j = i + 1;
        let ok = false;
        while (j < n && src[j] !== "\n") {
          if (src[j] === "\\") {
            j += 2;
            continue;
          }
          if (src[j] === "'") {
            ok = true;
            break;
          }
          j++;
        }
        if (!ok) issues.push({ level: "error", message: `Unterminated ${lang === "go" ? "rune" : "character"} literal — add the closing '`, ...at(i) });
        else if (j === i + 1) issues.push({ level: "error", message: `Empty ${lang === "go" ? "rune" : "character"} literal ''`, ...at(i) });
        mark(i, ok ? j + 1 : j, CHR);
        i = ok ? j + 1 : j;
      }
    } else i++;
  }
  // Mask: comments become spaces, string/char bodies become "_" (delimiters kept), newlines survive.
  let mask = "";
  for (let k = 0; k < n; k++) {
    const ch = src[k];
    if (ch === "\n" || kinds[k] === CODE) mask += ch;
    else if (kinds[k] === COM) mask += " ";
    else mask += kinds[k - 1] !== kinds[k] || kinds[k + 1] !== kinds[k] ? ch : "_";
  }
  return { src, mask, kinds, lineStarts: starts, issues };
}

/* ── brackets ────────────────────────────────────────────────────────── */

const OPEN: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
const CLOSE: Record<string, string> = { ")": "(", "]": "[", "}": "{" };

export function checkBrackets(lx: Lexed): LiteIssue[] {
  const out: LiteIssue[] = [];
  const stack: { ch: string; i: number }[] = [];
  const m = lx.mask;
  for (let i = 0; i < m.length; i++) {
    const c = m[i];
    if (OPEN[c]) stack.push({ ch: c, i });
    else if (CLOSE[c]) {
      const top = stack[stack.length - 1];
      if (!top) out.push({ level: "error", message: `Unexpected '${c}' — nothing is open here`, ...posOf(lx.lineStarts, i) });
      else if (top.ch !== CLOSE[c]) {
        const p = posOf(lx.lineStarts, top.i);
        out.push({ level: "error", message: `'${c}' does not match '${top.ch}' opened at line ${p.line}:${p.col} — expected '${OPEN[top.ch]}'`, ...posOf(lx.lineStarts, i) });
        stack.pop();
      } else stack.pop();
    }
  }
  for (const s of stack.reverse()) out.push({ level: "error", message: `'${s.ch}' is never closed — add '${OPEN[s.ch]}'`, ...posOf(lx.lineStarts, s.i) });
  return out;
}

/* ── formatter ───────────────────────────────────────────────────────── */

const OPS = /\s*(<<=|>>=|&\^=|:=|==|!=|<=|>=|\+=|-=|\*=|\/=|%=|&=|\|=|\^=|=>|->|(?<![=!<>:+\-*/%&|^.])=(?![=>~]))\s*/g;

function respaceCode(s: string, lang: LiteLang, first: boolean, last: boolean): string {
  let t = s.replace(/[ \t]{2,}/g, " ");
  t = t.replace(/\s+,/g, ",").replace(/,(?=[^\s)\]}>])/g, ", ");
  t = t.replace(/\)\{/g, ") {").replace(/\}else\b/g, "} else").replace(/\belse\{/g, "else {").replace(/\btry\{/g, "try {").replace(/\bfinally\{/g, "finally {");
  const kw = lang === "java" ? /\b(if|for|while|switch|catch|synchronized)\(/g : lang === "go" ? /\b(if|for|switch)\(/g : /\b(if|while|match)\(/g;
  t = t.replace(kw, "$1 (");
  t = t.replace(OPS, (_m, op: string) => ` ${op} `);
  t = t.replace(/;(?=[^\s;)])/g, "; ");
  t = t.replace(/\(\s+/g, "(").replace(/\s+\)/g, ")");
  t = t.replace(/[ \t]{2,}/g, " ");
  if (first) t = t.replace(/^\s+/, "");
  if (last) t = t.replace(/\s+$/, "");
  return t;
}

export type FormatOpts = { indent: "auto" | "tabs" | "2" | "4"; spacing: boolean };

export function formatLite(src: string, lang: LiteLang, opts: FormatOpts): string {
  const text = src.replace(/\r\n?/g, "\n");
  const lx = lex(text, lang);
  const unit = opts.indent === "tabs" || (opts.indent === "auto" && lang === "go") ? "\t" : " ".repeat(opts.indent === "2" ? 2 : 4);
  const lines = text.split("\n");
  const out: string[] = [];
  let depth = 0;
  let blank = 0;
  const caseAt = new Set<number>();
  let prevCode = "";
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const start = lx.lineStarts[li];
    const end = start + line.length;
    const mline = lx.mask.slice(start, end);
    const contStr = li > 0 && start < text.length && (lx.kinds[start] === STR || lx.kinds[start] === CHR) && lx.kinds[start - 1] === lx.kinds[start];
    const contCom = li > 0 && start < text.length && lx.kinds[start] === COM && lx.kinds[start - 1] === COM && lx.kinds[start - 2] === COM;
    const bump = () => {
      for (const ch of mline) {
        if (ch === "{" || ch === "(" || ch === "[") depth++;
        else if (ch === "}" || ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
      }
      for (const d of [...caseAt]) if (d > depth) caseAt.delete(d);
    };
    if (contStr) {
      out.push(line);
      bump();
      continue;
    }
    if (contCom && line.trim()) {
      const t = line.trim();
      out.push(t.startsWith("*") ? unit.repeat(depth) + " " + t : line.replace(/\s+$/, ""));
      bump();
      continue;
    }
    const endsInString = line.length > 0 && lx.kinds[end - 1] === STR && end < text.length && lx.kinds[end] === STR;
    const lead = line.length - line.replace(/^\s+/, "").length;
    const trimmed = endsInString ? line.slice(lead) : line.trim();
    if (!trimmed) {
      blank++;
      if (blank === 1 && out.length) out.push("");
      continue;
    }
    blank = 0;
    const mt = mline.slice(lead).trim();
    let closers = 0;
    while (closers < mt.length && (mt[closers] === "}" || mt[closers] === ")" || mt[closers] === "]" || (closers > 0 && mt[closers] === " "))) closers++;
    const leadClose = (mt.slice(0, closers).match(/[)}\]]/g) ?? []).length;
    let level = depth - leadClose;
    const isCase = /^(case\b|default\s*:)/.test(mt) || (lang === "java" && /^default\s*->/.test(mt));
    if (lang === "go" && isCase) level -= 1;
    if (lang === "java") {
      if (isCase) {
        if (/:\s*$/.test(mt) || /:\s*\/\//.test(mt) || (/:/.test(mt) && !/->/.test(mt))) caseAt.add(depth);
        else caseAt.delete(depth);
      } else if (caseAt.has(depth) && leadClose === 0) level += 1;
    }
    const pm = prevCode;
    if (/^\.[A-Za-z_]/.test(mt) && !/[{(\[]$/.test(pm)) level += 1;
    else if (/(&&|\|\||[+\-*/%^|&]|=>|->|=)$/.test(pm) && !/^[)}\]]/.test(mt) && !/(\+\+|--)$/.test(pm) && !/[{(\[]$/.test(pm)) level += 1;
    level = Math.max(0, level);
    let body = trimmed;
    if (opts.spacing) {
      // Re-space code runs only; strings, chars and comments stay byte-for-byte.
      const s0 = start + (endsInString ? lead : line.indexOf(trimmed));
      let res = "";
      let k = 0;
      while (k < body.length) {
        const kind = lx.kinds[s0 + k];
        let j = k + 1;
        while (j < body.length && (lx.kinds[s0 + j] === CODE) === (kind === CODE)) j++;
        const seg = body.slice(k, j);
        if (kind === COM && res) res = res.replace(/[ \t]*$/, " ");
        res += kind === CODE ? respaceCode(seg, lang, k === 0, j === body.length) : seg;
        k = j;
      }
      body = endsInString ? res : res.trim();
    }
    out.push(unit.repeat(level) + body);
    if (mt) prevCode = mt.replace(/\s+$/, "");
    bump();
  }
  while (out.length && out[out.length - 1] === "") out.pop();
  let result = out;
  if (lang === "go") result = alignGo(result);
  return result.join("\n") + "\n";
}

/** gofmt-style column alignment of struct fields and const/var blocks. */
function alignGo(lines: string[]): string[] {
  const out = lines.slice();
  const FIELD = /^(\t+)([A-Za-z_]\w*(?:, *[A-Za-z_]\w*)*) +([^\s=/`][^=/`]*?)( +`[^`]*`)?( *\/\/.*)?$/;
  const ASSIGN = /^(\t+)([A-Za-z_]\w*)( +[^\s=/][^=/]*?)? *= *(.+?)( *\/\/.*)?$/;
  let i = 0;
  while (i < out.length) {
    const opener = out[i];
    const isStruct = /\bstruct\s*\{\s*$/.test(opener);
    const isBlock = /^\s*(const|var)\s*\(\s*$/.test(opener);
    if (!isStruct && !isBlock) {
      i++;
      continue;
    }
    const ind = (/^\t*/.exec(opener)?.[0] ?? "") + "\t";
    let j = i + 1;
    while (j < out.length && out[j].startsWith(ind)) {
      // Collect a run of consecutive matching lines at exactly this indent.
      const run: number[] = [];
      while (j < out.length && out[j].startsWith(ind) && !out[j].startsWith(ind + "\t") && (isStruct ? FIELD : ASSIGN).test(out[j])) run.push(j++);
      if (run.length > 1) {
        if (isStruct) {
          const parts = run.map((k) => FIELD.exec(out[k])!);
          const w1 = Math.max(...parts.map((p) => p[2].length));
          const w2 = Math.max(...parts.map((p) => p[3].trimEnd().length));
          const anyTag = parts.some((p) => p[4]);
          const w3 = Math.max(...parts.map((p) => (p[4] ?? "").trim().length));
          run.forEach((k, x) => {
            const p = parts[x];
            let s = ind + p[2].padEnd(w1 + 1) + (p[4] || p[5] ? p[3].trimEnd().padEnd(w2 + 1) : p[3].trimEnd());
            if (p[4]) s += p[5] ? p[4].trim().padEnd(w3 + 1) : p[4].trim();
            else if (p[5] && anyTag) s += " ".repeat(w3 + 1);
            if (p[5]) s += p[5].trim();
            out[k] = s.replace(/\s+$/, "");
          });
        } else {
          const parts = run.map((k) => ASSIGN.exec(out[k])!);
          const w1 = Math.max(...parts.map((p) => p[2].length));
          const w2 = Math.max(...parts.map((p) => (p[3] ?? "").trim().length));
          run.forEach((k, x) => {
            const p = parts[x];
            const typ = (p[3] ?? "").trim();
            out[k] = (ind + p[2].padEnd(w1 + 1) + (w2 ? typ.padEnd(w2 + 1) : "") + "= " + p[4] + (p[5] ? " " + p[5].trim() : "")).replace(/\s+$/, "");
          });
        }
      }
      if (!run.length) j++;
    }
    i = j;
  }
  return out;
}

/* ── outline ─────────────────────────────────────────────────────────── */

function lineDepths(lx: Lexed): number[] {
  const depths: number[] = [];
  let d = 0;
  const lines = lx.mask.split("\n");
  for (const l of lines) {
    depths.push(d);
    for (const ch of l) {
      if (ch === "{") d++;
      else if (ch === "}") d = Math.max(0, d - 1);
    }
  }
  return depths;
}

const sig = (s: string) => {
  const t = s.trim().replace(/\s*\{\s*$/, "").replace(/\s+/g, " ");
  return t.length > 110 ? t.slice(0, 107) + "…" : t;
};

export function outline(lx: Lexed, lang: LiteLang): Sym[] {
  const syms: Sym[] = [];
  const ml = lx.mask.split("\n");
  const sl = lx.src.split("\n");
  const depths = lineDepths(lx);
  const containers: { depth: number; name: string; kind: string }[] = [];
  let block: "const" | "var" | "import" | null = null;
  for (let i = 0; i < ml.length; i++) {
    const m = ml[i];
    const t = m.trim();
    const d = depths[i];
    while (containers.length && d < containers[containers.length - 1].depth) containers.pop();
    const parent = containers[containers.length - 1]?.name ?? "";
    const add = (kind: string, name: string, container = false, s = sl[i]) => {
      syms.push({ line: i + 1, kind, name, parent, signature: sig(s) });
      if (container && /\{\s*$/.test(t)) containers.push({ depth: d + 1, name, kind });
    };
    if (!t) continue;
    if (lang === "go") {
      if (block) {
        if (/^\)/.test(t)) {
          block = null;
          continue;
        }
        if (block === "import") {
          const p = /"([^"]*)"/.exec(sl[i]);
          if (p) add("import", p[1]);
        } else {
          const n = /^([A-Za-z_]\w*)/.exec(t);
          if (n && d === 0) add(block, n[1]);
        }
        continue;
      }
      let r: RegExpExecArray | null;
      if ((r = /^package\s+(\w+)/.exec(t))) add("package", r[1]);
      else if (/^import\s*\($/.test(t)) block = "import";
      else if ((r = /^import\s+(?:[\w.]+\s+)?"/.exec(t))) add("import", /"([^"]*)"/.exec(sl[i])?.[1] ?? "");
      else if ((r = /^(const|var)\s*\($/.exec(t))) block = r[1] as "const" | "var";
      else if ((r = /^(const|var)\s+([A-Za-z_]\w*)/.exec(t)) && d === 0) add(r[1], r[2]);
      else if ((r = /^type\s+([A-Za-z_]\w*)(\[[^\]]*\])?\s+(struct|interface)\b/.exec(t))) add(r[3], r[1] + (r[2] ?? ""), true);
      else if ((r = /^type\s+([A-Za-z_]\w*)/.exec(t))) add("type", r[1]);
      else if ((r = /^func\s+\(\s*\w*\s*\*?\s*([A-Za-z_]\w*)(?:\[[^\]]*\])?\s*\)\s*([A-Za-z_]\w*)/.exec(t))) syms.push({ line: i + 1, kind: "method", name: r[2], parent: r[1], signature: sig(sl[i]) });
      else if ((r = /^func\s+([A-Za-z_]\w*)/.exec(t))) add("func", r[1]);
      else if (containers[containers.length - 1]?.kind === "interface" && (r = /^([A-Za-z_]\w*)\s*\(/.exec(t))) add("method", r[1]);
    } else if (lang === "rust") {
      let r: RegExpExecArray | null;
      const vis = "(?:pub(?:\\([^)]*\\))?\\s+)?";
      if ((r = new RegExp(`^${vis}mod\\s+(\\w+)`).exec(t))) add("mod", r[1], true);
      else if ((r = new RegExp(`^${vis}use\\s+([^;]+)`).exec(t))) add("use", r[1].trim());
      else if ((r = new RegExp(`^${vis}struct\\s+(\\w+)`).exec(t))) add("struct", r[1], true);
      else if ((r = new RegExp(`^${vis}enum\\s+(\\w+)`).exec(t))) add("enum", r[1], true);
      else if ((r = new RegExp(`^${vis}(?:unsafe\\s+)?trait\\s+(\\w+)`).exec(t))) add("trait", r[1], true);
      else if ((r = /^(?:unsafe\s+)?impl\b(?:\s*<[^{]*?>)?\s+(.+?)\s*(?:where\b.*)?\{?\s*$/.exec(t))) add("impl", r[1].replace(/\s+/g, " "), true);
      else if ((r = new RegExp(`^${vis}(?:const\\s+|async\\s+|unsafe\\s+|extern\\s+"[^"]*"\\s+)*fn\\s+(\\w+)`).exec(t))) {
        const inImpl = containers.some((c) => c.kind === "impl" || c.kind === "trait");
        syms.push({ line: i + 1, kind: inImpl ? "method" : "fn", name: r[1], parent, signature: sig(sl[i]) });
      } else if ((r = new RegExp(`^${vis}(const|static)\\s+(?:mut\\s+)?(\\w+)`).exec(t))) add(r[1], r[2]);
      else if ((r = new RegExp(`^${vis}type\\s+(\\w+)`).exec(t))) add("type", r[1]);
      else if ((r = /^macro_rules!\s*(\w+)/.exec(t))) add("macro", r[1], true);
    } else {
      let r: RegExpExecArray | null;
      const mods = "(?:(?:public|protected|private|static|final|abstract|sealed|non-sealed|strictfp|synchronized|native|default|transient|volatile)\\s+)*";
      const top = containers[containers.length - 1];
      if ((r = /^package\s+([\w.]+)/.exec(t))) add("package", r[1]);
      else if ((r = /^import\s+(static\s+)?([\w.*]+)/.exec(t))) add("import", (r[1] ? "static " : "") + r[2]);
      else if ((r = new RegExp(`^(?:@\\w+(?:\\([^)]*\\))?\\s+)*${mods}(class|interface|enum|record|@interface)\\s+(\\w+)`).exec(t))) add(r[1] === "@interface" ? "annotation" : r[1], r[2], true);
      else if (top && d === top.depth && (r = new RegExp(`^(?:@\\w+(?:\\([^)]*\\))?\\s+)*${mods}(?:<[^>]+>\\s+)?(\\w+)\\s*\\(`).exec(t)) && r[1] === top.name) add("constructor", r[1], true);
      else if (top && d === top.depth && (r = new RegExp(`^(?:@\\w+(?:\\([^)]*\\))?\\s+)*${mods}(?:<[^>]+>\\s+)?([\\w.<>\\[\\],? ]+?)\\s+(\\w+)\\s*\\(`).exec(t)) && !/^(return|new|else|throw|case)\b/.test(r[1])) add("method", r[2], true);
      else if (top && d === top.depth && top.kind !== "enum" && (r = new RegExp(`^(?:@\\w+(?:\\([^)]*\\))?\\s+)*${mods}([\\w.<>\\[\\],? ]+?)\\s+(\\w+)\\s*(=|;)`).exec(t)) && !/^(return|throw|break|continue)\b/.test(r[1])) add("field", r[2]);
      else if (top && top.kind === "enum" && d === top.depth && (r = /^([A-Z][A-Z0-9_]*)\s*(\(|,|;|\{|$)/.exec(t))) add("constant", r[1]);
    }
  }
  return syms;
}

/* ── lint ────────────────────────────────────────────────────────────── */

function goPkgName(path: string) {
  const segs = path.split("/");
  let last = segs[segs.length - 1];
  if (/^v\d+$/.test(last) && segs.length > 1) last = segs[segs.length - 2];
  last = last.replace(/\.v\d+$/, "").replace(/^go-/, "").replace(/-go$/, "");
  return last.replace(/[^A-Za-z0-9_]/g, "");
}

export function lint(lx: Lexed, lang: LiteLang, syms: Sym[]): LiteIssue[] {
  const issues: LiteIssue[] = [...lx.issues, ...checkBrackets(lx)];
  const ml = lx.mask.split("\n");
  const sl = lx.src.split("\n");
  const depths = lineDepths(lx);
  const add = (level: LiteIssue["level"], message: string, line?: number, col?: number) => issues.push({ level, message, line, col });
  const codeLines = ml.map((l, i) => ({ t: l.trim(), i })).filter((x) => x.t);
  const nextCode = (i: number) => codeLines.find((x) => x.i > i);
  const find = (re: RegExp, cb: (m: RegExpExecArray, line: number) => void) => {
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    let m: RegExpExecArray | null;
    while ((m = g.exec(lx.mask))) {
      const p = posOf(lx.lineStarts, m.index);
      cb(m, p.line);
      if (m[0] === "") g.lastIndex++;
    }
  };

  if (lang === "go") {
    const first = codeLines[0];
    const pkg = first && /^package\s+(\w+)/.exec(first.t);
    if (!pkg) add("error", "Missing package clause — a Go file must start with `package name`.", first ? first.i + 1 : 1);
    const pkgName = pkg?.[1];
    const hasMain = /\bfunc\s+main\s*\(\s*\)/.test(lx.mask);
    if (pkgName === "main" && !hasMain) add("error", "package main has no func main() — the program has no entry point.");
    if (pkgName && pkgName !== "main" && hasMain) add("warning", `func main only runs in package main (this is package ${pkgName}).`);
    // Imports and their use.
    const imports: { name: string; path: string; line: number }[] = [];
    let inBlock = false;
    let lastImportLine = 0;
    ml.forEach((l, i) => {
      const t = l.trim();
      if (/^import\s*\($/.test(t)) {
        inBlock = true;
        return;
      }
      if (inBlock) {
        if (t.startsWith(")")) {
          inBlock = false;
          lastImportLine = i;
          return;
        }
        const m = /^([\w.]+\s+)?"/.exec(t) && /^(?:([\w.]+)\s+)?"([^"]*)"/.exec(sl[i].trim());
        if (m) imports.push({ name: m[1] ?? goPkgName(m[2]), path: m[2], line: i + 1 });
        return;
      }
      const s = /^import\s+(?:([\w.]+)\s+)?"/.test(t) && /^import\s+(?:([\w.]+)\s+)?"([^"]*)"/.exec(sl[i].trim());
      if (s) {
        imports.push({ name: s[1] ?? goPkgName(s[2]), path: s[2], line: i + 1 });
        lastImportLine = i;
      }
    });
    const rest = ml.slice(lastImportLine + 1).join("\n");
    for (const im of imports) {
      if (im.name === "_" || im.name === ".") continue;
      if (!new RegExp(`\\b${im.name}\\.`).test(rest)) add("error", `"${im.path}" imported and not used${im.name !== goPkgName(im.path) ? ` (as ${im.name})` : ""} — Go refuses to compile this.`, im.line);
    }
    const seen = new Map<string, number>();
    for (const im of imports) {
      if (seen.has(im.path)) add("error", `"${im.path}" imported twice (also line ${seen.get(im.path)}).`, im.line);
      seen.set(im.path, im.line);
    }
    // Statements outside functions, brace placement, err checks, defer in loops.
    const blockKinds: string[] = [];
    ml.forEach((l, i) => {
      const t = l.trim();
      if (!t) return;
      if (depths[i] === 0 && /^[A-Za-z_][\w, ]*:=/.test(t)) add("error", "`:=` is only allowed inside functions — use `var name = value` at package level.", i + 1);
      if (t === "{") {
        const prev = codeLines.filter((x) => x.i < i).pop();
        if (prev && /(\bfunc\b.*\)|\bif\b.*|\bfor\b.*|\bswitch\b.*|\belse|\bstruct|\binterface)$/.test(prev.t)) add("error", "The opening brace must be on the same line — Go inserts a semicolon at the end of the previous line.", i + 1);
      }
      if (/\berr\s*:?=[^=]/.test(t) && !/\berr\s*[!=]=\s*nil/.test(t) && !/^return\b/.test(t)) {
        const nx = nextCode(i);
        if (nx && !/\berr\b/.test(nx.t)) add("warning", "err is assigned but not checked on the next line — handle it (if err != nil { … }) or discard it explicitly with _.", i + 1);
      }
      if (/\bdefer\b/.test(t)) {
        const k = blockKinds.lastIndexOf("func");
        if (blockKinds.slice(k + 1).includes("for")) add("warning", "defer inside a loop runs only when the function returns — resources pile up until then.", i + 1);
      }
      if (/\bfmt\.(Println|Print)\(/.test(t) && /%[vdsqfxtTp]/.test(sl[i])) add("warning", "Println/Print do not interpret %-verbs — use fmt.Printf (and add \\n).", i + 1);
      const pf = /\bfmt\.Printf\(\s*"((?:[^"\\]|\\.)*)"/.exec(sl[i]);
      if (pf && !/\\n/.test(pf[1])) add("info", "Printf does not add a newline — end the format with \\n.", i + 1);
      for (const ch of l) {
        if (ch === "{") blockKinds.push(/\bfunc\b/.test(t) ? "func" : /^\s*for\b/.test(t) || /\bfor\b.*\{$/.test(t) ? "for" : "block");
        else if (ch === "}") blockKinds.pop();
      }
    });
    if (/\bpanic\(/.test(lx.mask)) find(/\bpanic\(/, (_m, line) => add("info", "panic stops the program — return an error unless this is truly unrecoverable.", line));
  } else if (lang === "rust") {
    if (!/\bfn\s+main\s*\(/.test(lx.mask)) add("info", "No fn main — fine for a library (lib.rs); a binary crate needs one.");
    let unwraps = 0;
    find(/\.(unwrap|expect)\s*\(/, (m, line) => {
      unwraps++;
      add("warning", `.${m[1]}() panics on None/Err — propagate with ? or handle it with match / if let.`, line);
    });
    find(/\bunsafe\s*\{/, (_m, line) => add("warning", "unsafe block — document the invariant that makes it sound (// SAFETY: …).", line));
    find(/\bunsafe\s+fn\b/, (_m, line) => add("info", "unsafe fn — callers must uphold its safety contract.", line));
    find(/(^|[^.\w:!])(println|print|eprintln|eprint|format|vec|panic|assert|assert_eq|assert_ne|todo|unimplemented|dbg|matches)\s*\(/, (m, line) => {
      const before = lx.mask.slice(Math.max(0, m.index - 4), m.index + m[1].length);
      if (/fn\s*$/.test(before)) return;
      add("error", `${m[2]} is a macro — call it as ${m[2]}!(…).`, line);
    });
    find(/\b(todo|unimplemented)!\s*\(/, (m, line) => add("warning", `${m[1]}!() panics when reached.`, line));
    find(/:\s*&String\b/, (_m, line) => add("info", "&String parameter — accept &str instead; it works for both String and literals.", line));
    find(/:\s*&Vec</, (_m, line) => add("info", "&Vec<T> parameter — accept &[T] instead.", line));
    const clones = (lx.mask.match(/\.clone\(\)/g) ?? []).length;
    if (clones >= 4) add("info", `${clones} .clone() calls — check whether borrowing would do.`);
    // Missing semicolon heuristic.
    ml.forEach((l, i) => {
      const t = l.trim();
      if (!t || depths[i] === 0) return;
      const bal = (t.match(/[({[]/g) ?? []).length === (t.match(/[)}\]]/g) ?? []).length;
      if (!bal) return;
      const stmt = /^let\s/.test(t) || /^[\w:]+!\s*\(.*\)$/.test(t) || /^[\w.]+(::\w+)*\s*\(.*\)$/.test(t) || /^[\w.]+\s*[+\-*/]?=\s*[^=]/.test(t);
      if (!stmt || /=>/.test(t) || /[;{},([=+\-*/.&|]$/.test(t) || /^(if|while|for|match|loop|return|else)\b/.test(t)) return;
      const nx = nextCode(i);
      if (!nx || /^(\}|\.|\?|\)|\]|&&|\|\||[+\-*/%=]|else\b|as\b)/.test(nx.t)) return;
      add("warning", "Missing `;`? This statement is followed by another one.", i + 1, sl[i].length + 1);
    });
    if (unwraps === 0 && /\bResult</.test(lx.mask)) add("info", "Errors are propagated without unwrap() — nice.");
  } else {
    // Public top-level types vs file name.
    const tops = syms.filter((s) => ["class", "interface", "enum", "record", "annotation"].includes(s.kind) && !s.parent);
    const pubs = tops.filter((s) => /\bpublic\b/.test(s.signature));
    if (pubs.length > 1) add("error", `Only one public top-level type per file — found ${pubs.map((p) => p.name).join(", ")}.`, pubs[1].line);
    else if (pubs.length === 1) add("info", `Save this file as ${pubs[0].name}.java — a public type must live in a file of the same name.`, pubs[0].line);
    else if (tops.length) add("info", `No public top-level type; any file name works (e.g. ${tops[0].name}.java).`);
    // main signature.
    const mains = syms.filter((s) => s.kind === "method" && s.name === "main");
    if (!mains.length) add("info", "No main method — fine for a library class; a program needs public static void main(String[] args).");
    for (const m of mains) {
      const s = m.signature;
      const miss: string[] = [];
      if (!/\bpublic\b/.test(s)) miss.push("public");
      if (!/\bstatic\b/.test(s)) miss.push("static");
      if (!/\bvoid\s+main\b/.test(s)) miss.push("void return type");
      if (!/\(\s*(final\s+)?String\s*(\[\]\s*\w+|\.\.\.\s*\w+|\w+\s*\[\])\s*\)/.test(s)) miss.push("a String[] parameter");
      if (miss.length) add("warning", `main is missing ${miss.join(", ")} — the JVM will not use it as an entry point (Java 21+ instance main aside).`, m.line);
    }
    // == on string literals.
    for (let i = 0; i < lx.src.length; i++) {
      if (lx.kinds[i] === STR && lx.kinds[i - 1] !== STR) {
        let j = i;
        while (j < lx.src.length && lx.kinds[j] === STR) j++;
        const before = lx.mask.slice(Math.max(0, i - 4), i);
        const after = lx.mask.slice(j, j + 4);
        if (/[!=]=\s*$/.test(before) || /^\s*[!=]=/.test(after)) add("warning", "== / != on a String compares references — use .equals(…) (or Objects.equals).", posOf(lx.lineStarts, i).line, posOf(lx.lineStarts, i).col);
        i = j;
      }
    }
    // Empty catch.
    find(/catch\s*\([^)]*\)\s*\{\s*\}/, (m, line) => {
      const orig = lx.src.slice(m.index, m.index + m[0].length);
      add(/\/\/|\/\*/.test(orig) ? "info" : "warning", /\/\/|\/\*/.test(orig) ? "catch block only has a comment — make sure ignoring the exception is intended." : "Empty catch block swallows the exception — log it, rethrow, or comment why it is safe.", line);
    });
    find(/catch\s*\(\s*(?:final\s+)?(Exception|Throwable)\s+\w+\)/, (m, line) => add("info", `Catching ${m[1]} also catches bugs (NullPointerException…) — catch the specific exceptions you expect.`, line));
    find(/\b(List|ArrayList|LinkedList|Map|HashMap|TreeMap|LinkedHashMap|Set|HashSet|TreeSet|Collection|Iterator|Optional|Deque|ArrayDeque|Queue|Comparator|Comparable)\s+[a-z]\w*\s*[=;,)]/, (m, line) => add("warning", `Raw type ${m[1]} — add type arguments, e.g. ${m[1]}<String>.`, line));
    find(/\bnew\s+(ArrayList|LinkedList|HashMap|TreeMap|LinkedHashMap|HashSet|TreeSet|ArrayDeque)\s*\(/, (m, line) => add("warning", `new ${m[1]}() is a raw type — use the diamond: new ${m[1]}<>().`, line));
    find(/\.printStackTrace\(\)/, (_m, line) => add("info", "printStackTrace() — prefer a logger so the error reaches your logs.", line));
    find(/public\s+boolean\s+equals\s*\(\s*Object\b/, (m) => {
      const before = lx.mask.slice(Math.max(0, m.index - 60), m.index);
      if (!/@Override\s*$/.test(before)) add("info", "equals(Object) without @Override — add it so the compiler checks the signature.", posOf(lx.lineStarts, m.index).line);
    });
    const hasEquals = /\bboolean\s+equals\s*\(\s*Object\b/.test(lx.mask), hasHash = /\bint\s+hashCode\s*\(\s*\)/.test(lx.mask);
    if (hasEquals !== hasHash) add("warning", "equals and hashCode must be overridden together.");
  }
  return issues.sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
}

/* ── stats ───────────────────────────────────────────────────────────── */

export function stats(lx: Lexed, syms: Sym[]) {
  const lines = lx.src.split("\n");
  let code = 0, comment = 0, blank = 0, longest = 0;
  const ml = lx.mask.split("\n");
  lines.forEach((l, i) => {
    longest = Math.max(longest, l.length);
    if (!l.trim()) blank++;
    else if (ml[i].trim()) code++;
    else comment++;
  });
  const depths = lineDepths(lx);
  const fns = syms.filter((s) => ["func", "fn", "method", "constructor"].includes(s.kind)).length;
  const types = syms.filter((s) => ["struct", "interface", "enum", "trait", "class", "record", "type", "annotation"].includes(s.kind)).length;
  const imports = syms.filter((s) => s.kind === "import" || s.kind === "use").length;
  const todos = (lx.src.match(/\b(TODO|FIXME|XXX|HACK)\b/g) ?? []).length;
  return { lines: lines.length, code, comment, blank, fns, types, imports, maxDepth: Math.max(0, ...depths), longest, todos };
}
