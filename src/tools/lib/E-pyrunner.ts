/**
 * Python playground runtime: one module Worker (public/workers/python.js)
 * running Pyodide from /vendor/pyodide/. Stop terminates it (the only way to
 * interrupt CPython without SharedArrayBuffer) and boots a fresh one.
 */

export type PyStatus = "idle" | "loading" | "ready" | "running" | "error";
export type PyChunk = { stream: "stdout" | "stderr"; text: string };
export type PyDone = { repr: string | null; error: string | null; ms: number };
export type PyEvent =
  | { type: "status"; status: PyStatus; version?: string; ms?: number; error?: string }
  | { type: "out"; stream: "stdout" | "stderr"; text: string }
  | { type: "start"; id: number }
  | ({ type: "done"; id: number } & PyDone);

export class PyStopped extends Error {}

class PyRunner {
  private worker: Worker | null = null;
  private seq = 0;
  private listeners = new Set<(e: PyEvent) => void>();
  private pending: { id: number; resolve: (r: { out: PyChunk[]; done: PyDone }) => void; reject: (e: Error) => void; out: PyChunk[]; timer?: ReturnType<typeof setTimeout> } | null = null;
  status: PyStatus = "idle";
  version = "";
  bootMs = 0;
  lastError = "";

  on(l: (e: PyEvent) => void) {
    this.listeners.add(l);
    return () => void this.listeners.delete(l);
  }
  private emit(e: PyEvent) {
    if (e.type === "status") {
      this.status = e.status;
      if (e.version) this.version = e.version;
      if (e.ms) this.bootMs = e.ms;
      if (e.error) this.lastError = e.error;
    }
    this.listeners.forEach((l) => l(e));
  }

  ensure() {
    if (this.worker) return;
    const w = new Worker("/workers/python.js", { type: "module" });
    this.worker = w;
    this.emit({ type: "status", status: "loading" });
    w.onmessage = (e: MessageEvent<PyEvent>) => {
      const m = e.data;
      if (m.type === "status") {
        // While a run is queued the runtime reports ready; keep showing "running".
        this.emit(this.pending && m.status === "ready" ? { ...m, status: "running" } : m);
        return;
      }
      if (m.type === "out") {
        this.pending?.out.push({ stream: m.stream, text: m.text });
        this.emit(m);
        return;
      }
      if (m.type === "done" && this.pending?.id === m.id) {
        const p = this.pending;
        this.pending = null;
        if (p.timer) clearTimeout(p.timer);
        this.emit(m);
        this.emit({ type: "status", status: "ready" });
        p.resolve({ out: p.out, done: { repr: m.repr, error: m.error, ms: m.ms } });
      }
    };
    w.onerror = (e) => {
      e.preventDefault();
      this.emit({ type: "status", status: "error", error: e.message || "The Python worker could not start (module workers need a current browser)." });
      if (this.pending) {
        const p = this.pending;
        this.pending = null;
        p.reject(new Error(this.lastError));
      }
      this.worker?.terminate();
      this.worker = null;
    };
  }

  run(code: string, stdin: string, timeoutMs: number): Promise<{ out: PyChunk[]; done: PyDone }> {
    if (this.pending) this.stop("Superseded by a new run.");
    this.ensure();
    const id = ++this.seq;
    this.emit({ type: "start", id });
    this.emit({ type: "status", status: this.status === "loading" ? "loading" : "running" });
    return new Promise((resolve, reject) => {
      this.pending = { id, resolve, reject, out: [] };
      if (timeoutMs > 0)
        this.pending.timer = setTimeout(() => {
          if (this.pending?.id === id) this.stop(`Stopped after ${timeoutMs / 1000} s. A long loop? Raise the time limit, or press Stop sooner.`);
        }, timeoutMs + (this.status === "loading" ? 60_000 : 0));
      this.worker!.postMessage({ type: "run", id, code, stdin });
    });
  }

  /** Terminate the interpreter and boot a fresh one. */
  stop(reason = "Stopped.") {
    const p = this.pending;
    this.pending = null;
    if (p?.timer) clearTimeout(p.timer);
    this.worker?.terminate();
    this.worker = null;
    this.emit({ type: "status", status: "idle" });
    p?.reject(new PyStopped(reason));
    this.ensure();
  }
}

let runner: PyRunner | null = null;
export function pyRunner(): PyRunner {
  if (!runner) runner = new PyRunner();
  return runner;
}

export const pyMeta = new WeakMap<object, { out: PyChunk[]; done: PyDone }>();

/** Line numbers of "<main>" frames in a traceback. */
export function tracebackLines(tb: string): number[] {
  return [...tb.matchAll(/File "<main>", line (\d+)/g)].map((m) => Number(m[1]));
}
