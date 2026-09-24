// Python playground worker: real CPython (Pyodide) loaded from this site's /vendor/pyodide/.
// Module worker — create with: new Worker("/workers/python.js", { type: "module" }).
// Protocol in:  { type: "run", id, code, stdin }
// Protocol out: { type: "status", status: "loading" | "ready" | "error", version?, ms?, error? }
//               { type: "out", stream: "stdout" | "stderr", text }
//               { type: "done", id, repr, error, ms }
import { loadPyodide } from "/vendor/pyodide/pyodide.mjs";

const post = (m) => self.postMessage(m);
let stdin = null;

const HELPERS = `
import sys, builtins, traceback, linecache
from pyodide.code import eval_code_async

_fmt_input = builtins.input
def _fmt_echo_input(prompt=""):
    try:
        value = _fmt_input(prompt)
    except EOFError:
        sys.stdout.write("\\n")
        raise EOFError("input() ran out of lines - type them into the stdin box, one per line") from None
    sys.stdout.write(value + "\\n")
    return value
builtins.input = _fmt_echo_input

async def _fmt_run(code):
    ns = {"__name__": "__main__", "__builtins__": builtins}
    # Let tracebacks quote the user's source lines.
    linecache.cache["<main>"] = (len(code), None, code.splitlines(True), "<main>")
    try:
        result = await eval_code_async(code, ns, filename="<main>")
        return (None if result is None else repr(result)), None
    except SystemExit as e:
        if e.code in (None, 0):
            return None, None
        return None, f"SystemExit: {e.code}"
    except BaseException as e:
        tb = e.__traceback__
        while tb is not None and tb.tb_frame.f_code.co_filename != "<main>":
            tb = tb.tb_next
        return None, "".join(traceback.format_exception(type(e), e, tb))
    finally:
        sys.stdout.flush()
        sys.stderr.flush()
`;

async function boot() {
  const t0 = performance.now();
  post({ type: "status", status: "loading" });
  const py = await loadPyodide({ indexURL: "/vendor/pyodide/" });
  const decOut = new TextDecoder();
  const decErr = new TextDecoder();
  py.setStdout({ write: (buf) => { post({ type: "out", stream: "stdout", text: decOut.decode(buf, { stream: true }) }); return buf.length; }, isatty: true });
  py.setStderr({ write: (buf) => { post({ type: "out", stream: "stderr", text: decErr.decode(buf, { stream: true }) }); return buf.length; }, isatty: true });
  py.setStdin({ stdin: () => { const s = stdin; stdin = null; return s; }, autoEOF: true });
  await py.runPythonAsync(HELPERS);
  const version = py.runPython("import sys; sys.version.split()[0]");
  post({ type: "status", status: "ready", version, ms: Math.round(performance.now() - t0) });
  return py;
}

const ready = boot().catch((e) => {
  post({ type: "status", status: "error", error: String(e && e.message || e) });
  throw e;
});

let queue = Promise.resolve();
self.onmessage = (e) => {
  const q = e.data;
  if (!q || q.type !== "run") return;
  queue = queue.then(async () => {
    let py;
    try {
      py = await ready;
    } catch (err) {
      post({ type: "done", id: q.id, repr: null, error: "The Python runtime failed to load: " + (err && err.message || err) + "\nReload once while online so /vendor/pyodide/ is cached.", ms: 0 });
      return;
    }
    stdin = q.stdin ? (q.stdin.endsWith("\n") ? q.stdin : q.stdin + "\n") : null;
    const t0 = performance.now();
    let res;
    try {
      res = await py.globals.get("_fmt_run")(q.code);
      const [repr, error] = res.toJs();
      post({ type: "done", id: q.id, repr: repr ?? null, error: error ?? null, ms: performance.now() - t0 });
    } catch (err) {
      post({ type: "done", id: q.id, repr: null, error: String(err && err.message || err), ms: performance.now() - t0 });
    } finally {
      if (res && res.destroy) res.destroy();
    }
  });
};
