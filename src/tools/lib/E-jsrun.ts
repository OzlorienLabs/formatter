/**
 * JavaScript playground runtime: user code runs in a dedicated Worker built
 * from a blob URL (no DOM, no page state), with console capture, top-level
 * await, a time limit and stack traces mapped back to editor lines.
 * In Node (unit tests) the same runtime runs in-process.
 */
import { isNode } from "./vendor";

export type Entry =
  | { kind: "log" | "info" | "warn" | "error" | "debug" | "system"; text: string; depth: number }
  | { kind: "table"; columns: string[]; rows: (string | number | boolean | null)[][]; depth: number }
  | { kind: "value"; text: string; depth: number }
  | { kind: "uncaught"; text: string; line?: number; col?: number; depth: number };

export type JsDone = { ok: boolean; value?: string; error?: { name: string; message: string; stack: string; line?: number; col?: number }; ms: number };
type Msg = { type: "log"; level: string; text: string; depth: number } | { type: "table"; columns: string[]; rows: (string | number | boolean | null)[][]; depth: number } | { type: "clear" } | ({ type: "done"; id: number } & JsDone);

/** Worker body — plain JavaScript so it runs from a blob URL without a bundler. */
export const JS_WORKER_SRC = String.raw`
"use strict";
var post = function (m) { self.postMessage(m); };
var OFFSET = 0;
var AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
try { new AsyncFunction("console", "throw new Error('probe')\n//# sourceURL=probe.js")().catch(function (e) {
  var m = /probe\.js:(\d+)/.exec(String(e && e.stack)); if (m) OFFSET = +m[1] - 1;
}); } catch (e) {}
function typeName(v) {
  var p = Object.getPrototypeOf(v);
  var c = p && p.constructor && p.constructor.name;
  return c && c !== "Object" ? c + " " : "";
}
function fmtKey(k) { return /^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k); }
function fmt(v, depth, seen, top) {
  var t = typeof v;
  if (v === null) return "null";
  if (t === "undefined") return "undefined";
  if (t === "string") return top ? v : "'" + v.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n") + "'";
  if (t === "number") return Object.is(v, -0) ? "-0" : String(v);
  if (t === "bigint") return String(v) + "n";
  if (t === "boolean") return String(v);
  if (t === "symbol") return v.toString();
  if (t === "function") {
    var src = Function.prototype.toString.call(v);
    return /^class[\s{]/.test(src) ? "[class " + (v.name || "(anonymous)") + "]" : "[Function: " + (v.name || "(anonymous)") + "]";
  }
  if (v instanceof Error) return v.stack && String(v.stack).indexOf(v.message) >= 0 ? cleanStack(String(v.stack)) : v.name + ": " + v.message;
  if (v instanceof Date) return isNaN(v) ? "Invalid Date" : v.toISOString();
  if (v instanceof RegExp) return String(v);
  if (typeof Promise !== "undefined" && v instanceof Promise) return "Promise { <pending> }";
  if (seen.indexOf(v) >= 0) return "[Circular]";
  if (depth > 3) return Array.isArray(v) ? "[Array]" : "[Object]";
  seen = seen.concat([v]);
  var parts = [], open, close, prefix = "";
  if (v instanceof Map) {
    prefix = "Map(" + v.size + ") "; open = "{"; close = "}";
    var n = 0; v.forEach(function (val, key) { if (n++ < 50) parts.push(fmt(key, depth + 1, seen) + " => " + fmt(val, depth + 1, seen)); });
    if (v.size > 50) parts.push("... " + (v.size - 50) + " more");
  } else if (v instanceof Set) {
    prefix = "Set(" + v.size + ") "; open = "{"; close = "}";
    var m = 0; v.forEach(function (val) { if (m++ < 50) parts.push(fmt(val, depth + 1, seen)); });
    if (v.size > 50) parts.push("... " + (v.size - 50) + " more");
  } else if (Array.isArray(v) || ArrayBuffer.isView(v)) {
    if (!Array.isArray(v)) prefix = v.constructor.name + "(" + v.length + ") ";
    else if (typeName(v) && typeName(v) !== "Array ") prefix = typeName(v);
    open = "["; close = "]";
    var holes = 0;
    for (var i = 0; i < Math.min(v.length, 100); i++) {
      if (Array.isArray(v) && !(i in v)) { holes++; continue; }
      if (holes) { parts.push("<" + holes + " empty item" + (holes > 1 ? "s" : "") + ">"); holes = 0; }
      parts.push(fmt(v[i], depth + 1, seen));
    }
    if (holes) parts.push("<" + holes + " empty item" + (holes > 1 ? "s" : "") + ">");
    if (v.length > 100) parts.push("... " + (v.length - 100) + " more items");
  } else {
    prefix = typeName(v); open = "{"; close = "}";
    var keys = Object.keys(v);
    for (var j = 0; j < Math.min(keys.length, 60); j++) {
      var d = Object.getOwnPropertyDescriptor(v, keys[j]);
      parts.push(fmtKey(keys[j]) + ": " + (d && d.get ? "[Getter]" : fmt(v[keys[j]], depth + 1, seen)));
    }
    if (keys.length > 60) parts.push("... " + (keys.length - 60) + " more");
    var syms = Object.getOwnPropertySymbols(v);
    for (var s = 0; s < syms.length; s++) parts.push("[" + syms[s].toString() + "]: " + fmt(v[syms[s]], depth + 1, seen));
  }
  if (!parts.length) return prefix + open + close;
  var one = prefix + open + " " + parts.join(", ") + " " + close;
  if (one.length <= 72 && one.indexOf("\n") < 0) return one;
  var pad = "  ";
  return prefix + open + "\n" + parts.map(function (p) { return pad + p.replace(/\n/g, "\n" + pad); }).join(",\n") + "\n" + close;
}
function cleanStack(stack) {
  var lines = String(stack).split("\n"), out = [];
  for (var i = 0; i < lines.length; i++) {
    var l = lines[i];
    var m = /main\.js:(\d+):(\d+)/.exec(l);
    if (m) { out.push(l.replace(/\(?(?:eval at [^)]*\)?,? )?[^\s(]*main\.js:(\d+):(\d+)\)?/, function (_, a, b) { return "(line " + (+a - OFFSET) + ":" + b + ")"; })); continue; }
    if (i === 0 || !/^\s+at |@/.test(l)) out.push(l);
  }
  return out.join("\n");
}
function firstLine(stack) {
  var m = /main\.js:(\d+):(\d+)/.exec(String(stack || ""));
  return m ? { line: +m[1] - OFFSET, col: +m[2] } : {};
}
var depth = 0, counters = {}, timers = {};
function format(args) {
  args = Array.prototype.slice.call(args);
  if (typeof args[0] === "string" && /%[sdifoOjc%]/.test(args[0])) {
    var fmtStr = args.shift();
    fmtStr = fmtStr.replace(/%([sdifoOjc%])/g, function (m, c) {
      if (c === "%") return "%";
      if (!args.length) return m;
      var a = args.shift();
      if (c === "s") return typeof a === "string" ? a : fmt(a, 1, [], false);
      if (c === "d" || c === "i") return String(parseInt(a, 10));
      if (c === "f") return String(parseFloat(a));
      if (c === "c") return "";
      return fmt(a, 0, [], false);
    });
    args.unshift(fmtStr);
  }
  return args.map(function (a) { return typeof a === "string" ? a : fmt(a, 0, [], false); }).join(" ");
}
function log(level) { return function () { post({ type: "log", level: level, text: format(arguments), depth: depth }); }; }
var con = {
  log: log("log"), info: log("info"), warn: log("warn"), error: log("error"), debug: log("debug"),
  dir: function (v) { post({ type: "log", level: "log", text: fmt(v, 0, [], false), depth: depth }); },
  trace: function () { var s = cleanStack(new Error().stack).split("\n").slice(1).join("\n"); post({ type: "log", level: "log", text: "Trace: " + format(arguments) + (s ? "\n" + s : ""), depth: depth }); },
  assert: function (c) { if (!c) { var rest = Array.prototype.slice.call(arguments, 1); post({ type: "log", level: "error", text: "Assertion failed" + (rest.length ? ": " + format(rest) : ""), depth: depth }); } },
  count: function (l) { l = l === undefined ? "default" : String(l); counters[l] = (counters[l] || 0) + 1; post({ type: "log", level: "log", text: l + ": " + counters[l], depth: depth }); },
  countReset: function (l) { counters[l === undefined ? "default" : String(l)] = 0; },
  time: function (l) { timers[l === undefined ? "default" : String(l)] = performance.now(); },
  timeLog: function (l) { l = l === undefined ? "default" : String(l); if (timers[l] === undefined) return post({ type: "log", level: "warn", text: "Timer '" + l + "' does not exist", depth: depth }); var rest = Array.prototype.slice.call(arguments, 1); post({ type: "log", level: "log", text: l + ": " + (performance.now() - timers[l]).toFixed(3) + " ms" + (rest.length ? " " + format(rest) : ""), depth: depth }); },
  timeEnd: function (l) { l = l === undefined ? "default" : String(l); if (timers[l] === undefined) return post({ type: "log", level: "warn", text: "Timer '" + l + "' does not exist", depth: depth }); post({ type: "log", level: "log", text: l + ": " + (performance.now() - timers[l]).toFixed(3) + " ms", depth: depth }); delete timers[l]; },
  group: function () { if (arguments.length) post({ type: "log", level: "log", text: "▾ " + format(arguments), depth: depth }); depth++; },
  groupCollapsed: function () { if (arguments.length) post({ type: "log", level: "log", text: "▸ " + format(arguments), depth: depth }); depth++; },
  groupEnd: function () { if (depth > 0) depth--; },
  clear: function () { post({ type: "clear" }); },
  table: function (data, cols) {
    if (data === null || typeof data !== "object") return con.log(data);
    var keys = Array.isArray(data) ? data.map(function (_, i) { return i; }) : Object.keys(data);
    var columns = [], rows = [], hasValues = false;
    keys.forEach(function (k) {
      var row = data[k];
      if (row !== null && typeof row === "object") Object.keys(row).forEach(function (c) { if (columns.indexOf(c) < 0) columns.push(c); });
      else hasValues = true;
    });
    if (cols) columns = cols.slice();
    keys.forEach(function (k) {
      var row = data[k];
      var cells = [String(k)];
      columns.forEach(function (c) {
        var x = row !== null && typeof row === "object" ? row[c] : undefined;
        cells.push(x === undefined ? null : x !== null && typeof x === "object" ? fmt(x, 2, [], false) : typeof x === "string" ? x : typeof x === "number" || typeof x === "boolean" ? x : fmt(x, 0, [], false));
      });
      if (hasValues) cells.push(row !== null && typeof row === "object" ? null : typeof row === "number" || typeof row === "boolean" ? row : fmt(row, 0, [], true));
      rows.push(cells);
    });
    post({ type: "table", columns: ["(index)"].concat(columns, hasValues ? ["Values"] : []), rows: rows, depth: depth });
  }
};
self.console = con;
self.addEventListener("unhandledrejection", function (e) {
  if (e.preventDefault) e.preventDefault();
  var r = e.reason;
  post({ type: "log", level: "error", text: "Uncaught (in promise) " + (r instanceof Error ? cleanStack(r.stack || String(r)) : fmt(r, 0, [], false)), depth: 0 });
});
self.addEventListener("error", function (e) {
  post({ type: "log", level: "error", text: "Uncaught " + (e.error instanceof Error ? cleanStack(e.error.stack || String(e.error)) : e.message), depth: 0 });
  if (e.preventDefault) e.preventDefault();
});
var KEYWORDS = /^(?:const|let|var|function|async\s+function|class|if|else|for|while|do|switch|case|default|return|throw|try|catch|finally|import|export|break|continue|\}|\{|\/\/|\/\*|\*)/;
function withReturn(code) {
  var lines = code.split("\n");
  var i = lines.length - 1;
  while (i >= 0 && (!lines[i].trim() || /^\s*\/\//.test(lines[i]))) i--;
  if (i < 0) return null;
  var last = lines[i].trim();
  if (KEYWORDS.test(last) || /[{,(\[]$/.test(last) || /^[)\]}]/.test(last)) return null;
  var expr = last.replace(/;+\s*$/, "");
  if (!expr || expr.indexOf(";") >= 0) return null;
  lines[i] = lines[i].replace(last, "return (" + expr + ");");
  return lines.join("\n");
}
self.onmessage = async function (e) {
  var q = e.data;
  var body = q.code, fn = null;
  var alt = q.showValue ? withReturn(body) : null;
  if (alt !== null) { try { fn = new AsyncFunction("console", alt + "\n//# sourceURL=main.js"); } catch (err) { fn = null; } }
  var t0 = performance.now();
  try {
    if (!fn) fn = new AsyncFunction("console", body + "\n//# sourceURL=main.js");
  } catch (err) {
    post({ type: "done", id: q.id, ok: false, error: { name: err.name, message: err.message, stack: err.name + ": " + err.message }, ms: 0 });
    return;
  }
  try {
    var v = await fn.call(undefined, con);
    post({ type: "done", id: q.id, ok: true, value: v === undefined ? undefined : fmt(v, 0, [], false), ms: performance.now() - t0 });
  } catch (err) {
    var isErr = err instanceof Error;
    var pos = isErr ? firstLine(err.stack) : {};
    post({ type: "done", id: q.id, ok: false, error: { name: isErr ? err.name : "Uncaught", message: isErr ? err.message : fmt(err, 0, [], false), stack: isErr ? cleanStack(err.stack || String(err)) : "Uncaught " + fmt(err, 0, [], false), line: pos.line, col: pos.col }, ms: performance.now() - t0 });
  }
};
`;

type Listener = (m: Msg | { type: "status"; status: "idle" | "running" }) => void;

export type JsRunResult = { entries: Entry[]; done: JsDone };

export class JsTimeout extends Error {}

function toEntry(m: Msg): Entry | null {
  if (m.type === "log") return { kind: (["log", "info", "warn", "error", "debug"].includes(m.level) ? m.level : "log") as "log", text: m.text, depth: m.depth };
  if (m.type === "table") return { kind: "table", columns: m.columns, rows: m.rows, depth: m.depth };
  return null;
}

/** Find the line of a syntax error by loading the code as a worker script (browsers report lineno there). */
function syntaxLine(code: string): Promise<{ line: number; col: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(new Blob([`(async () => {\n${code}\n})`], { type: "text/javascript" }));
    const w = new Worker(url);
    const done = (v: { line: number; col: number } | null) => {
      clearTimeout(t);
      w.terminate();
      URL.revokeObjectURL(url);
      resolve(v);
    };
    const t = setTimeout(() => done(null), 800);
    w.onerror = (e) => {
      e.preventDefault();
      done(e.lineno ? { line: e.lineno - 1, col: e.colno } : null);
    };
  });
}

class JsRunner {
  private worker: Worker | null = null;
  private url = "";
  private seq = 0;
  private listeners = new Set<Listener>();
  private pending: { id: number; resolve: (r: JsRunResult) => void; reject: (e: Error) => void; entries: Entry[]; timer: ReturnType<typeof setTimeout> } | null = null;
  running = false;

  on(l: Listener) {
    this.listeners.add(l);
    return () => void this.listeners.delete(l);
  }
  private emit(m: Parameters<Listener>[0]) {
    this.listeners.forEach((l) => l(m));
  }

  stop(reason = "Stopped.") {
    this.worker?.terminate();
    this.worker = null;
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.reject(new Error(reason));
      this.pending = null;
    }
    this.running = false;
    this.emit({ type: "status", status: "idle" });
  }

  run(code: string, timeoutMs: number, showValue: boolean): Promise<JsRunResult> {
    this.stop("Superseded by a new run.");
    if (!this.url) this.url = URL.createObjectURL(new Blob([JS_WORKER_SRC], { type: "text/javascript" }));
    const w = new Worker(this.url);
    this.worker = w;
    const id = ++this.seq;
    this.running = true;
    this.emit({ type: "status", status: "running" });
    return new Promise<JsRunResult>((resolve, reject) => {
      const entries: Entry[] = [];
      const timer = setTimeout(() => {
        if (this.pending?.id !== id) return;
        const p = this.pending;
        this.pending = null;
        this.stop();
        p.reject(new JsTimeout(`Stopped after ${timeoutMs / 1000} s — an infinite loop, or work that never finishes? Raise the time limit if it is just slow.`));
      }, timeoutMs);
      this.pending = { id, resolve, reject, entries, timer };
      w.onmessage = async (e: MessageEvent<Msg>) => {
        const m = e.data;
        this.emit(m);
        if (m.type === "clear") {
          entries.length = 0;
          return;
        }
        const en = toEntry(m);
        if (en) entries.push(en);
        if (m.type === "done" && this.pending?.id === id) {
          clearTimeout(timer);
          this.pending = null;
          this.running = false;
          const done: JsDone = { ok: m.ok, value: m.value, error: m.error, ms: m.ms };
          if (!m.ok && m.error?.name === "SyntaxError" && !m.error.line) {
            const pos = await syntaxLine(code);
            if (pos) done.error = { ...m.error, line: pos.line, col: pos.col, stack: `${m.error.stack}\n    at line ${pos.line}:${pos.col}` };
          }
          this.emit({ type: "status", status: "idle" });
          resolve({ entries, done });
          // The worker stays alive so pending timers can still log, until the next run or Stop.
        }
      };
      w.onerror = (e) => {
        e.preventDefault();
      };
      w.postMessage({ id, code, showValue });
    });
  }
}

let runner: JsRunner | null = null;
export function jsRunner(): JsRunner {
  if (!runner) runner = new JsRunner();
  return runner;
}

/** Node fallback for tests: the same runtime, in-process (no time limit). */
async function runInProcess(code: string, showValue: boolean): Promise<JsRunResult> {
  const entries: Entry[] = [];
  let done: JsDone | null = null;
  const handlers: Record<string, ((e: unknown) => void)[]> = {};
  const fakeSelf: Record<string, unknown> = {
    postMessage: (m: Msg) => {
      if (m.type === "clear") entries.length = 0;
      const en = toEntry(m);
      if (en) entries.push(en);
      if (m.type === "done") done = { ok: m.ok, value: m.value, error: m.error, ms: m.ms };
    },
    addEventListener: (t: string, h: (e: unknown) => void) => (handlers[t] ??= []).push(h),
  };
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function("self", "performance", JS_WORKER_SRC)(fakeSelf, performance);
  await (fakeSelf.onmessage as (e: { data: unknown }) => Promise<void>)({ data: { id: 1, code, showValue } });
  await new Promise((r) => setTimeout(r, 30));
  return { entries, done: done ?? { ok: false, error: { name: "Error", message: "No result", stack: "" }, ms: 0 } };
}

export async function runJs(code: string, timeoutMs: number, showValue: boolean): Promise<JsRunResult> {
  if (isNode) return runInProcess(code, showValue);
  return jsRunner().run(code, timeoutMs, showValue);
}

export function entriesToText(entries: Entry[]): string {
  const out: string[] = [];
  for (const e of entries) {
    const pad = "  ".repeat(e.depth);
    if (e.kind === "table") {
      const w = e.columns.map((c, i) => Math.min(40, Math.max(c.length, ...e.rows.map((r) => String(r[i] ?? "").length))));
      const line = (cells: string[]) => pad + "│ " + cells.map((c, i) => c.slice(0, w[i]).padEnd(w[i])).join(" │ ") + " │";
      out.push(pad + "┌─" + w.map((n) => "─".repeat(n)).join("─┬─") + "─┐");
      out.push(line(e.columns));
      out.push(pad + "├─" + w.map((n) => "─".repeat(n)).join("─┼─") + "─┤");
      for (const r of e.rows) out.push(line(r.map((x) => (x === null ? "" : String(x)))));
      out.push(pad + "└─" + w.map((n) => "─".repeat(n)).join("─┴─") + "─┘");
    } else {
      const prefix = e.kind === "warn" ? "⚠ " : e.kind === "error" || e.kind === "uncaught" ? "✖ " : e.kind === "value" ? "← " : "";
      out.push(pad + prefix + e.text.replace(/\n/g, "\n" + pad + " ".repeat(prefix.length)));
    }
  }
  return out.join("\n");
}

export const jsMeta = new WeakMap<object, JsRunResult>();
