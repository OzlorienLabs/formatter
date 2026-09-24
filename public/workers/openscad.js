/* OpenSCAD worker (module worker). Runs the real OpenSCAD compiled to
 * WebAssembly, self-hosted at /vendor/openscad/openscad.js — no network.
 *
 * Message in:  { id, code, defines: { name: valueLiteral }, want: "auto" | "stl" | "svg" | "off" }
 * Message out: { id, ok, format, data, logs: [{ level, text }], ms, error? }
 *
 * A fresh OpenSCAD instance is created per render: callMain is not re-entrant
 * after a failed run, and a new instance costs only ~100 ms once the module is
 * compiled.
 */
import { createOpenSCAD } from "/vendor/openscad/openscad.js";

function classify(text) {
  if (/^ERROR|^Parser error|^Can't parse|error:/i.test(text)) return "error";
  if (/^WARNING|DEPRECATED/i.test(text)) return "warning";
  if (/^ECHO:/.test(text)) return "echo";
  if (/^TRACE:/.test(text)) return "trace";
  return "info";
}

async function attempt(code, defines, format) {
  const logs = [];
  const push = (text) => {
    if (/Could not initialize localization|Fontconfig error: Cannot load default config/.test(text)) return;
    logs.push({ level: classify(text), text });
  };
  const osc = await createOpenSCAD({ print: push, printErr: push });
  const inst = osc.getInstance();
  inst.FS.writeFile("/input.scad", code);
  const out = `/out.${format}`;
  const args = ["/input.scad", "-o", out, "--backend=manifold"];
  for (const [k, v] of Object.entries(defines || {})) args.push("-D", `${k}=${v}`);
  let rc = 0;
  try {
    rc = inst.callMain(args);
  } catch (e) {
    rc = -1;
    if (typeof e === "number") push("ERROR: OpenSCAD aborted (internal exception " + e + ").");
    else push("ERROR: " + ((e && e.message) || String(e)));
  }
  let data = null;
  try {
    data = inst.FS.readFile(out, { encoding: "utf8" });
  } catch {
    data = null;
  }
  return { rc, data, logs };
}

self.onmessage = async (event) => {
  const { id, code, defines, want = "auto" } = event.data || {};
  const t0 = performance.now();
  try {
    const first = want === "svg" ? "svg" : want === "off" ? "off" : "stl";
    let r = await attempt(code, defines, first);
    let format = first;
    if (!r.data && want === "auto" && r.logs.some((l) => /not a 3D object/i.test(l.text))) {
      const r2 = await attempt(code, defines, "svg");
      if (r2.data) {
        r = { ...r2, logs: r2.logs };
        format = "svg";
      }
    }
    self.postMessage({ id, ok: !!r.data, format, data: r.data, logs: r.logs, rc: r.rc, ms: Math.round(performance.now() - t0) });
  } catch (e) {
    self.postMessage({ id, ok: false, format: "stl", data: null, logs: [{ level: "error", text: "ERROR: " + ((e && e.message) || String(e)) }], ms: Math.round(performance.now() - t0) });
  }
};
