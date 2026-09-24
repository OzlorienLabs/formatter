/**
 * OpenSCAD in a module Worker (public/workers/openscad.js), plus customizer
 * parameter parsing and STL statistics. Browser only.
 */

export type ScadLog = { level: "error" | "warning" | "echo" | "trace" | "info"; text: string };
export type ScadResult = { ok: boolean; format: "stl" | "svg" | "off"; data: string | null; logs: ScadLog[]; ms: number };

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (r: ScadResult) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker("/workers/openscad.js", { type: "module", name: "openscad" });
    worker.onmessage = (e: MessageEvent) => {
      const p = pending.get(e.data?.id);
      if (!p) return;
      clearTimeout(p.timer);
      pending.delete(e.data.id);
      p.resolve(e.data as ScadResult);
    };
    worker.onerror = (e) => {
      const err = new Error(`The OpenSCAD worker failed to start${e.message ? `: ${e.message}` : ""}. Reload once while online so the 11 MB runtime is cached.`);
      for (const p of pending.values()) {
        clearTimeout(p.timer);
        p.reject(err);
      }
      pending.clear();
      worker?.terminate();
      worker = null;
    };
  }
  return worker;
}

/** Kill the worker (stops a runaway render). The next render starts a fresh one. */
export function cancelScad(reason = "Render stopped.") {
  if (!worker) return;
  worker.terminate();
  worker = null;
  for (const p of pending.values()) {
    clearTimeout(p.timer);
    p.reject(new Error(reason));
  }
  pending.clear();
}

export function renderScad(code: string, defines: Record<string, string> = {}, timeoutMs = 180_000): Promise<ScadResult> {
  const w = getWorker();
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => cancelScad(`Render timed out after ${Math.round(timeoutMs / 1000)} s — simplify the model or lower $fn.`), timeoutMs);
    pending.set(id, { resolve, reject, timer });
    w.postMessage({ id, code, defines, want: "auto" });
  });
}

/* ── customizer parameters ─────────────────────────────────────────── */

export type Param =
  | { name: string; kind: "number"; value: number; min?: number; max?: number; step?: number; label: string; group: string }
  | { name: string; kind: "bool"; value: boolean; label: string; group: string }
  | { name: string; kind: "string"; value: string; label: string; group: string }
  | { name: string; kind: "choice"; value: string | number; options: { v: string | number; label: string }[]; label: string; group: string };

/**
 * Top-level assignments before the first module/function, in OpenSCAD's customizer style:
 *   width = 40;       // [10:100]   slider
 *   wall = 1.6;       // [0.8:0.4:4] slider with step
 *   style = "round";  // [round, square]
 *   holes = true;
 *   // Description line above becomes the label
 *   /* [Group name] *\/ starts a group
 */
export function parseParams(code: string): Param[] {
  const out: Param[] = [];
  let group = "Parameters";
  let lastComment = "";
  for (const raw of code.split("\n")) {
    const line = raw.trim();
    const g = line.match(/^\/\*\s*\[([^\]]+)\]\s*\*\/$/);
    if (g) {
      group = g[1].trim();
      if (/^hidden$/i.test(group)) break;
      continue;
    }
    if (/^(module|function|include|use)\b/.test(line) || /^[a-z_]\w*\s*\(/i.test(line)) break;
    const c = line.match(/^\/\/\s*(.+)$/);
    if (c) {
      lastComment = c[1];
      continue;
    }
    const m = line.match(/^([A-Za-z_]\w*)\s*=\s*([^;]+);\s*(?:\/\/\s*(.*))?$/);
    if (!m) {
      if (line) lastComment = "";
      continue;
    }
    const [, name, val, hint = ""] = m;
    if (name.startsWith("$")) continue;
    const label = lastComment || name.replace(/_/g, " ");
    lastComment = "";
    const range = hint.match(/^\[\s*(-?[\d.]+)\s*:\s*(-?[\d.]+)\s*(?::\s*(-?[\d.]+))?\s*\]/);
    const list = hint.match(/^\[([^\]]+)\]/);
    const num = Number(val);
    if (/^(true|false)$/.test(val.trim())) out.push({ name, kind: "bool", value: val.trim() === "true", label, group });
    else if (Number.isFinite(num) && range) {
      const [a, b, c2] = [Number(range[1]), Number(range[2]), range[3] !== undefined ? Number(range[3]) : undefined];
      // [min:step:max] when three numbers are given
      const [min, step, max] = c2 !== undefined ? [a, b, c2] : [a, undefined, b];
      out.push({ name, kind: "number", value: num, min, max, step: step ?? (Number.isInteger(num) && Number.isInteger(min) && Number.isInteger(max) ? 1 : 0.1), label, group });
    } else if (list && !range) {
      const opts = list[1].split(",").map((s) => {
        const [v, l] = s.split(":").map((x) => x.trim());
        const isNum = Number.isFinite(Number(v)) && v !== "";
        return { v: isNum ? Number(v) : v.replace(/^"|"$/g, ""), label: (l ?? v).replace(/^"|"$/g, "") };
      });
      const cur = Number.isFinite(num) ? num : val.trim().replace(/^"|"$/g, "");
      out.push({ name, kind: "choice", value: cur, options: opts, label, group });
    } else if (Number.isFinite(num)) out.push({ name, kind: "number", value: num, label, group, step: Number.isInteger(num) ? 1 : 0.1 });
    else if (/^".*"$/.test(val.trim())) out.push({ name, kind: "string", value: val.trim().slice(1, -1), label, group });
  }
  return out;
}

/** -D definitions (OpenSCAD literals) for overrides that differ from the code's defaults. */
export function definesFor(params: Param[], overrides: Record<string, unknown>): Record<string, string> {
  const d: Record<string, string> = {};
  for (const p of params) {
    if (!(p.name in overrides)) continue;
    const v = overrides[p.name];
    if (v === p.value) continue;
    d[p.name] = typeof v === "string" ? JSON.stringify(v) : String(v);
  }
  return d;
}

/* ── STL statistics ────────────────────────────────────────────────── */

export type StlStats = { triangles: number; min: [number, number, number]; max: [number, number, number]; volume: number; area: number };

export function stlStats(stl: string): StlStats {
  const re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/g;
  const v: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(stl))) v.push(+m[1], +m[2], +m[3]);
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  let volume = 0, area = 0;
  for (let i = 0; i + 8 < v.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = v.slice(i, i + 9);
    for (const [x, y, z] of [[ax, ay, az], [bx, by, bz], [cx, cy, cz]]) {
      if (x < min[0]) min[0] = x;
      if (y < min[1]) min[1] = y;
      if (z < min[2]) min[2] = z;
      if (x > max[0]) max[0] = x;
      if (y > max[1]) max[1] = y;
      if (z > max[2]) max[2] = z;
    }
    volume += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
    const ux = bx - ax, uy = by - ay, uz = bz - az, wx = cx - ax, wy = cy - ay, wz = cz - az;
    area += Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx) / 2;
  }
  const triangles = Math.floor(v.length / 9);
  if (!triangles) return { triangles: 0, min: [0, 0, 0], max: [0, 0, 0], volume: 0, area: 0 };
  return { triangles, min, max, volume: Math.abs(volume), area };
}
