/**
 * Stack trace parsers: JavaScript (V8 / Node, Firefox, Safari, React component
 * stacks, "Caused by" chains), Java (causes, suppressed, "... N more", flattened
 * log lines) and Go (panics, goroutine dumps).
 */
import { alignColumns, commonPrefix } from "./C-util";

/* ── JavaScript ───────────────────────────────────────────────────────── */

export type JsKind = "app" | "node_modules" | "node internal" | "browser extension" | "native";
export type JsFrame = { fn: string; file: string; line: number | null; col: number | null; kind: JsKind; raw: string; async?: boolean; component?: boolean; err: number };
export type JsError = { type: string; message: string; frames: JsFrame[]; label: string };

const HEADER_JS = /^\s*(?:Uncaught(?: \(in promise\))?\s+)?(?:\[cause\]:\s*)?(?:Caused by:\s*)?([A-Z$_][\w$.]*(?:Error|Exception|Rejection)|Error|[A-Z][\w$]*Error\b|AggregateError|DOMException)(?:\s*\[([A-Z_]+)\])?(?::\s?(.*))?$/;

export function demangle(file: string): string {
  let f = file;
  f = f.replace(/^webpack-internal:\/\/\/(?:\([^)]*\)\/)?\.?\/?/, "");
  f = f.replace(/^webpack:\/\/\/?(?:[^/]*\/)?\.\//, "").replace(/^webpack:\/\/\//, "").replace(/^webpack:\/\/[^/]+\//, "");
  f = f.replace(/^(?:\/_next\/static\/chunks\/)?(?:\(app-pages-browser\)|\(rsc\)|\(ssr\))\/\.\//, "");
  f = f.replace(/\?[\w=&.-]*$/, "");
  return f;
}

export function jsKind(file: string): JsKind {
  if (/^(chrome|moz|safari|safari-web|edge)-extension:\/\//.test(file)) return "browser extension";
  if (/^node:|^internal\/|^\(?internal\/|^events\.js|^timers\.js|^module\.js|^_stream/.test(file)) return "node internal";
  if (/^native$|^<anonymous>$|^\[native code\]$|^native code$/.test(file) || !file) return "native";
  if (/[\\/]node_modules[\\/]/.test(file)) return "node_modules";
  return "app";
}

function splitLoc(loc: string): { file: string; line: number | null; col: number | null } {
  // eval at foo (file:1:2), <anonymous>:3:4 → use the outer location
  const ev = /^eval at [^(]+ \((.+?)\)(?:, .*)?$/.exec(loc);
  if (ev) loc = ev[1];
  const m = /^(.*?):(\d+)(?::(\d+))?$/.exec(loc);
  if (m) return { file: m[1], line: +m[2], col: m[3] ? +m[3] : null };
  return { file: loc, line: null, col: null };
}

export function parseJsTrace(src: string, o: { demangle?: boolean } = {}): JsError[] {
  const dm = o.demangle !== false;
  const text = src.replace(/\r\n?/g, "\n").replace(/\\n(?=\s+at |\s*Caused by|\s*\[cause\])/g, "\n");
  const errors: JsError[] = [];
  let cur: JsError | null = null;
  const start = (type: string, message: string, label: string) => {
    cur = { type, message, frames: [], label };
    errors.push(cur);
  };
  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/\s+$/, "").replace(/\)\s*\{$/, ")");
    if (!line.trim()) continue;
    const t = line.trim();
    let m: RegExpExecArray | null;
    // V8: at fn (loc) | at loc | at async fn (loc) | at new Foo (loc)
    if ((m = /^at (?:(async) )?(?:(.+?) \((.+)\)|(.+))$/.exec(t))) {
      if (!cur) start("Error", "", "Error");
      const isAsync = !!m[1];
      const fn = m[2] ?? "";
      const loc = (m[3] ?? m[4] ?? "").trim();
      if (!m[3] && /^[\w$.<>\s[\]]+$/.test(loc) && !/:\d+/.test(loc) && !/^(native|<anonymous>)$/.test(loc)) {
        // "at Promise.all (index 0)" style handled above; bare function names (React 19 "at Button")
        pushJs(cur!, { fn: loc, file: "", line: null, col: null, raw: line, async: isAsync, component: /^[A-Z]/.test(loc) });
        continue;
      }
      if (/^index \d+$/.test(loc)) {
        pushJs(cur!, { fn: `${fn} [${loc}]`, file: "", line: null, col: null, raw: line, async: isAsync });
        continue;
      }
      const { file, line: ln, col } = splitLoc(loc);
      pushJs(cur!, { fn, file, line: ln, col, raw: line, async: isAsync });
      continue;
    }
    // React (<=17) component stack: "in Button (at App.js:12)" / "in div (created by App)"
    if ((m = /^in ([\w$.]+)(?: \((?:at (.+?)|created by ([\w$.]+))\))?$/.exec(t))) {
      if (!cur) start("React component stack", "", "Components");
      const { file, line: ln, col } = splitLoc(m[2] ?? "");
      pushJs(cur!, { fn: `<${m[1]}>${m[3] ? ` (created by ${m[3]})` : ""}`, file, line: ln, col, raw: line, component: true });
      continue;
    }
    if ((m = HEADER_JS.exec(t)) && !/@\S+:\d+/.test(t)) {
      const caused = /^(Caused by:|\[cause\]:)/.test(t) || (errors.length > 0 && /^\s+\[cause\]/.test(line));
      start(m[1], (m[3] ?? "") + (m[2] ? ` [${m[2]}]` : ""), errors.length ? (caused ? "Caused by" : "Error") : "Error");
      continue;
    }
    // Firefox / Safari: fn@loc, @loc, "global code@loc", "fn@[native code]"
    if ((m = /^((?:[^\s@]|\s(?=code@))*)@(.+:\d+(?::\d+)?|\[native code\])$/.exec(t))) {
      if (!cur) start("Error", "", "Error");
      const loc = m[2] === "[native code]" ? "native" : m[2];
      const { file, line: ln, col } = splitLoc(loc);
      let fn = m[1];
      const isAsync = /^async\*|\*async$/.test(fn);
      fn = fn.replace(/^async\*|\*async$/, "").replace(/(\/<)+$/, "").replace(/\/</g, ".");
      pushJs(cur!, { fn, file: loc === "native" ? "" : file, line: ln, col, raw: line, async: isAsync });
      continue;
    }
    if (t === "[native code]") { if (cur) pushJs(cur, { fn: "", file: "native", line: null, col: null, raw: line }); continue; }
    if (/^\{?\s*\[cause\]:\s*(.*)$/.test(t)) {
      const rest = t.replace(/^\{?\s*\[cause\]:\s*/, "");
      const mm = /^([\w$.]+)(?::\s?(.*))?$/.exec(rest);
      start(mm ? mm[1] : "Error", mm?.[2] ?? rest, "Caused by");
      continue;
    }
    if (/^\.\.\. \d+ lines matching cause stack trace \.\.\.$/.test(t)) {
      if (cur) (cur as JsError).frames.push({ fn: t, file: "", line: null, col: null, kind: "native", raw: line, err: errors.length - 1 });
      continue;
    }
    if (/^[}\]]\s*,?$/.test(t) || /^(code|errno|syscall|path|\w+): /.test(t) && cur && (cur as JsError).frames.length) continue;
    // continuation of the message (multi-line messages) before any frame
    if (cur && !(cur as JsError).frames.length) (cur as JsError).message += ((cur as JsError).message ? "\n" : "") + t;
    else if (!cur) {
      const mm = /^([\w$.]+): (.*)$/.exec(t);
      start(mm ? mm[1] : "Error", mm ? mm[2] : t, "Error");
    }
  }
  return errors;

  function pushJs(e: JsError, f: Omit<JsFrame, "kind" | "err">) {
    const file = dm ? demangle(f.file) : f.file;
    e.frames.push({ ...f, file, kind: f.component && !file ? "app" : f.file === "" ? "native" : jsKind(file), err: errors.indexOf(e) });
  }
}

export type JsFormatOptions = { hideModules: boolean; hideInternals: boolean; shorten: "none" | "prefix" | "cwd"; cwd: string };

export function shortenPaths(errors: JsError[], o: JsFormatOptions): (f: string) => string {
  if (o.shorten === "cwd" && o.cwd.trim()) {
    const cwds = o.cwd.split(/[,\s]+/).filter(Boolean).map((c) => c.replace(/^file:\/\//, "").replace(/\/?$/, "/"));
    return (f) => {
      const g = f.replace(/^file:\/\//, "");
      for (const c of cwds) if (g.startsWith(c)) return g.slice(c.length);
      return f;
    };
  }
  if (o.shorten === "prefix") {
    const files = errors.flatMap((e) => e.frames.filter((f) => f.file && f.kind !== "native" && f.kind !== "node internal" && f.kind !== "browser extension").map((f) => f.file));
    const uniq = [...new Set(files)];
    let p = uniq.length > 1 ? commonPrefix(uniq) : uniq[0]?.slice(0, uniq[0].lastIndexOf("/") + 1) ?? "";
    p = p.slice(0, p.lastIndexOf("/") + 1);
    if (p.length < 2) return (f) => f;
    return (f) => (f.startsWith(p) ? f.slice(p.length) : f);
  }
  return (f) => f;
}

/* ── Java ─────────────────────────────────────────────────────────────── */

export type JavaFrame = { cls: string; method: string; file: string; line: number | null; module: string; native: boolean; raw: string };
export type JavaThrowable = { kind: "root" | "cause" | "suppressed"; depth: number; cls: string; message: string; frames: (JavaFrame | { more: number })[]; thread?: string; parent?: number };

const JAVA_HEAD = /^(?:Exception in thread "([^"]*)"\s+)?((?:[a-zA-Z_$][\w$]*\.)+[A-Z$][\w$]*(?:\$[\w$]+)*|[A-Z][\w$]*(?:Exception|Error|Throwable))(?::\s?(.*))?$/;

/** Undo log-file flattening: literal \n\t, or everything on one line. */
export function unflattenJava(src: string): string {
  let s = src.replace(/\r\n?/g, "\n");
  if (/\\n\\t|\\n\s*at |\\tat /.test(s)) s = s.replace(/\\r/g, "").replace(/\\n/g, "\n").replace(/\\t/g, "\t");
  const lines = s.split("\n");
  const out: string[] = [];
  for (const l of lines) {
    if ((l.match(/\bat [\w$.\/]+\.[\w$<>]+\(/g) ?? []).length > 1 || /\S\s+at [\w$.\/]+\.[\w$<>]+\([^)]*\)/.test(l) && !/^\s*at /.test(l)) {
      const parts = l
        .split(/\s+(?=at [\w$.\/]+\.[\w$<>]+\()|\s+(?=Caused by: )|\s+(?=Suppressed: )|\s+(?=\.\.\. \d+ (?:more|common frames omitted))/)
        .map((x) => x.trim());
      for (const p of parts) out.push(/^at |^\.\.\. /.test(p) ? "\tat ".slice(0, 1) + p : p);
    } else out.push(l);
  }
  return out.join("\n");
}

export function parseJavaTrace(src: string): JavaThrowable[] & { preamble?: string[] } {
  const text = unflattenJava(src);
  const list: JavaThrowable[] & { preamble?: string[] } = [];
  const preamble: string[] = [];
  list.preamble = preamble;
  let cur: JavaThrowable | null = null;
  const stack: { t: number; indent: number }[] = [];
  for (const rawLine of text.split("\n")) {
    if (!rawLine.trim()) continue;
    const indent = rawLine.match(/^\s*/)![0].replace(/\t/g, "    ").length;
    let t = rawLine.trim();
    // strip a leading log prefix like "2026-09-24 10:00:00 ERROR [main] c.e.App - "
    let m: RegExpExecArray | null;
    if ((m = /^at\s+(?:([\w.$-]+(?:@[\w.-]+)?)\/(?:([\w.$-]+(?:@[\w.-]+)?)\/)?)?([\w$.<>]+)\.([\w$<>-]+)\((.*?)\)(?:\s*~?\[.*\])?$/.exec(t))) {
      if (!cur) { cur = { kind: "root", depth: 0, cls: "(unknown)", message: "", frames: [] }; list.push(cur); }
      const loc = m[5];
      const fm = /^(.*?)(?::(\d+))?$/.exec(loc)!;
      const mod = m[2] ? `${m[1]}/${m[2]}` : m[1] ?? "";
      cur.frames.push({ cls: m[3], method: m[4], file: loc === "Native Method" ? "Native Method" : fm[1], line: fm[2] ? +fm[2] : null, module: mod, native: loc === "Native Method", raw: t });
      continue;
    }
    if ((m = /^\.\.\. (\d+) (?:more|common frames omitted)$/.exec(t))) {
      if (cur) cur.frames.push({ more: +m[1] });
      continue;
    }
    let kind: JavaThrowable["kind"] = "root";
    if (/^Caused by:\s*/.test(t)) { kind = "cause"; t = t.replace(/^Caused by:\s*/, ""); }
    else if (/^Suppressed:\s*/.test(t)) { kind = "suppressed"; t = t.replace(/^Suppressed:\s*/, ""); }
    else if (!cur || cur.frames.length) {
      if (!JAVA_HEAD.exec(t) || !/Exception|Error|Throwable/.test(JAVA_HEAD.exec(t)![2])) {
        const at = /(?:^|\s)(Exception in thread "[^"]*"\s+)?((?:[a-z_$][\w$]*\.)+[A-Z][\w$]*(?:Exception|Error|Throwable|Failure)\b)(?=:|\s*$)/.exec(t);
        if (at) {
          const pre = t.slice(0, at.index).trim();
          if (pre) preamble.push(pre);
          t = t.slice(at.index).trim();
        } else if (!cur) {
          preamble.push(t);
          continue;
        }
      }
    }
    if ((m = JAVA_HEAD.exec(t)) && (kind !== "root" || !cur || cur.frames.length > 0 || /Exception|Error|Throwable/.test(m[2]))) {
      const th: JavaThrowable = { kind, depth: 0, cls: m[2], message: m[3] ?? "", frames: [], thread: m[1] };
      // Parent: causes chain to the last throwable at a lower-or-equal indent; suppressed nest under the current one.
      while (stack.length && (stack[stack.length - 1].indent > indent || (kind === "suppressed" && stack[stack.length - 1].indent >= indent && list[stack[stack.length - 1].t].kind === "suppressed"))) stack.pop();
      if (kind === "cause") {
        const p = stack.length ? stack[stack.length - 1] : null;
        th.parent = p?.t;
        th.depth = p ? list[p.t].depth : 0;
        if (p && p.indent === indent) stack.pop();
      } else if (kind === "suppressed") {
        const p = stack.length ? stack[stack.length - 1] : null;
        th.parent = p?.t;
        th.depth = (p ? list[p.t].depth : 0) + 1;
      }
      list.push(th);
      stack.push({ t: list.length - 1, indent });
      cur = th;
      continue;
    }
    if (cur && !cur.frames.length) cur.message += (cur.message ? "\n" : "") + t;
    else if (!cur) {
      cur = { kind: "root", depth: 0, cls: "(message)", message: t, frames: [] };
      list.push(cur);
    }
  }
  return list;
}

export const JAVA_FRAMEWORK = "java., javax., jdk., sun., com.sun., org.springframework., org.apache., org.hibernate., kotlin., kotlinx., reactor., io.netty., org.junit., org.eclipse.jetty., jakarta.";

/** The root cause is the deepest element of the main "Caused by" chain. */
export function javaRootCause(list: JavaThrowable[]): number {
  let idx = 0;
  list.forEach((t, i) => { if (t.kind === "cause" && t.depth === 0) idx = i; });
  return idx;
}

/* ── Go ──────────────────────────────────────────────────────────────── */

export type GoFrame = { fn: string; args: string; file: string; line: number | null; offset: string; std: boolean; runtime: boolean };
export type Goroutine = { id: number; state: string; wait: string; minutes: number; locked: boolean; frames: GoFrame[]; createdBy?: GoFrame & { inGoroutine?: number }; elided: boolean; header: string };
export type GoDump = { panic: string[]; fatal: string; goroutines: Goroutine[]; tail: string[] };

function goStd(fn: string, file: string): boolean {
  if (/\/(usr\/local\/go|go\/src|goroot|GOROOT)\//i.test(file) || /^\$GOROOT/.test(file)) return true;
  const pkg = fn.replace(/\(.*$/, "");
  const first = pkg.split("/")[0].split(".")[0];
  if (first === "main") return false;
  return !pkg.split("/")[0].includes(".") && !/^(main)$/.test(first);
}

export function parseGoDump(src: string): GoDump {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const d: GoDump = { panic: [], fatal: "", goroutines: [], tail: [] };
  let g: Goroutine | null = null;
  let pendingFn: { fn: string; args: string; created?: boolean; inG?: number } | null = null;
  for (let k = 0; k < lines.length; k++) {
    const line = lines[k];
    const t = line.trim();
    let m: RegExpExecArray | null;
    if (!t) { if (pendingFn && g) flushFn(); continue; }
    if (!g && (m = /^panic: (.*)$/.exec(t))) { d.panic.push(m[1]); continue; }
    if (!g && /^\t?panic: /.test(line)) { d.panic.push(t.replace(/^panic: /, "")); continue; }
    if (!g && (m = /^fatal error: (.*)$/.exec(t))) { d.fatal = m[1]; continue; }
    if (!g && d.panic.length && !/^goroutine /.test(t) && !/^\[signal /.test(t)) {
      d.panic[d.panic.length - 1] += "\n" + t;
      continue;
    }
    if (/^\[signal /.test(t)) { d.panic.push(t); continue; }
    if ((m = /^goroutine (\d+)(?: gp=\S+ m=\S+(?: mp=\S+)?)? \[([^\]]+)\]:$/.exec(t))) {
      if (pendingFn && g) flushFn();
      const parts = m[2].split(",").map((s) => s.trim());
      const minutes = parts.find((p) => /^\d+ minutes?$/.test(p));
      g = { id: +m[1], state: parts[0], wait: minutes ?? "", minutes: minutes ? parseInt(minutes, 10) : 0, locked: parts.includes("locked to thread"), frames: [], elided: false, header: t };
      d.goroutines.push(g);
      continue;
    }
    if (!g) { d.tail.push(t); continue; }
    if (/^\.\.\.additional frames elided\.\.\.$/.test(t)) { g.elided = true; continue; }
    if ((m = /^(.+?):(\d+)(?: \+0x([0-9a-fA-F]+))?$/.exec(t)) && /^\s/.test(line) && pendingFn) {
      const fr: GoFrame = { fn: pendingFn.fn, args: pendingFn.args, file: m[1], line: +m[2], offset: m[3] ? "+0x" + m[3] : "", std: goStd(pendingFn.fn, m[1]), runtime: /^runtime\./.test(pendingFn.fn) };
      if (pendingFn.created) g.createdBy = { ...fr, inGoroutine: pendingFn.inG };
      else g.frames.push(fr);
      pendingFn = null;
      continue;
    }
    if ((m = /^created by (\S+?)(?: in goroutine (\d+))?$/.exec(t))) {
      if (pendingFn) flushFn();
      pendingFn = { fn: m[1], args: "", created: true, inG: m[2] ? +m[2] : undefined };
      continue;
    }
    const fa = splitFnArgs(t);
    if (fa && !/^\s/.test(line)) {
      if (pendingFn) flushFn();
      pendingFn = fa;
      continue;
    }
    if (/^(exit status \d+|Process finished|FAIL|\S+ exited)/.test(t)) { g = null; d.tail.push(t); continue; }
    d.tail.push(t);
  }
  if (pendingFn && g) flushFn();
  return d;

  function flushFn() {
    if (!pendingFn || !g) return;
    const fr: GoFrame = { fn: pendingFn.fn, args: pendingFn.args, file: "", line: null, offset: "", std: goStd(pendingFn.fn, ""), runtime: /^runtime\./.test(pendingFn.fn) };
    if (pendingFn.created) g.createdBy = { ...fr, inGoroutine: pendingFn.inG };
    else g.frames.push(fr);
    pendingFn = null;
  }
}

/** "pkg.(*T).Method(0x1, {0x2, 0x3})" → fn + args, matching the trailing parenthesised group. */
function splitFnArgs(t: string): { fn: string; args: string } | null {
  if (!t.endsWith(")")) return null;
  let depth = 0;
  for (let i = t.length - 1; i >= 0; i--) {
    if (t[i] === ")") depth++;
    else if (t[i] === "(") {
      depth--;
      if (depth === 0) {
        const fn = t.slice(0, i);
        if (!fn || /\s/.test(fn)) return null;
        return { fn, args: t.slice(i + 1, -1) };
      }
    }
  }
  return null;
}

export function goSignature(g: Goroutine): string {
  return [g.state, g.locked ? "L" : "", ...g.frames.map((f) => `${f.fn}@${f.file}:${f.line}`), g.createdBy ? `c:${g.createdBy.fn}@${g.createdBy.file}:${g.createdBy.line}` : ""].join("|");
}

export { alignColumns };
