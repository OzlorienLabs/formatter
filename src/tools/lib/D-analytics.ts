/**
 * The SQL Analytics workbench engine: named datasets (pasted CSV/JSON/NDJSON
 * or built-in samples) loaded into an in-memory SQLite database, a script run
 * statement by statement, and an automatic chart for label + number results.
 */
import { ToolError } from "../types";
import { execScript, getSqlJs, loadTable, sqlIdent, type Cell, type LoadedTable, type StmtResult } from "./D-sqlite";
import { parseTabular, type TabFormat } from "./D-tabular";

export type Dataset = { name: string; sample?: string; format?: TabFormat; data?: string };
export type Workspace = { tables: Dataset[] };

export function parseWorkspace(s: string): Workspace | null {
  const t = s.trim();
  if (!t.startsWith("{")) return null;
  try {
    const v = JSON.parse(t);
    if (v && Array.isArray(v.tables) && v.tables.every((d: Dataset) => d && typeof d.name === "string")) return v as Workspace;
  } catch {
    /* not a workspace */
  }
  return null;
}

export const workspaceJson = (w: Workspace) => JSON.stringify(w, null, 1);

export type AnalyticsRun = { tables: LoadedTable[]; results: StmtResult[]; notes: string[]; ms: number };

export async function runAnalytics(datasetsText: string, sql: string, o: { maxRows?: number } = {}): Promise<AnalyticsRun> {
  const t0 = performance.now();
  const SQL = await getSqlJs();
  const db = new SQL.Database();
  const notes: string[] = [];
  try {
    const ws = parseWorkspace(datasetsText);
    const sets: Dataset[] = ws ? ws.tables : datasetsText.trim() ? [{ name: "input", data: datasetsText }] : [];
    if (!ws && datasetsText.trim()) notes.push("Loaded the incoming data as table \"input\".");
    const tables: LoadedTable[] = [];
    const samples = sets.some((d) => d.sample) ? (await import("./D-datasets")).SAMPLES : {};
    for (const d of sets) {
      const name = sqlIdent(d.name, "t");
      let src = d.data ?? "";
      let fmt: TabFormat = d.format ?? "auto";
      if (d.sample) {
        const s = (samples as Record<string, { format: TabFormat; data: () => string }>)[d.sample];
        if (!s) throw new ToolError(`Unknown sample dataset "${d.sample}".`);
        src = s.data();
        fmt = s.format;
      }
      if (!src.trim()) {
        notes.push(`Dataset "${name}" is empty — skipped.`);
        continue;
      }
      let tab;
      try {
        tab = await parseTabular(src, fmt);
      } catch (e) {
        throw new ToolError(`Dataset "${name}": ${(e as Error).message}`);
      }
      tables.push(loadTable(db, name, tab.header, tab.rows as Cell[][]));
    }
    if (!sql.trim()) return { tables, results: [], notes, ms: performance.now() - t0 };
    const results = execScript(db, sql, { maxRows: o.maxRows ?? 10000 });
    return { tables, results, notes, ms: performance.now() - t0 };
  } finally {
    db.close();
  }
}

/* ── automatic chart ───────────────────────────────────────────────────── */

const PALETTE = ["#0088b0", "#d6006c", "#b98d00"];
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function niceTicks(max: number, min = 0, n = 4): number[] {
  const span = max - min || Math.abs(max) || 1;
  const step0 = span / n;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? step0;
  const out: number[] = [];
  const top = Math.ceil(max / step - 1e-9) * step;
  for (let v = Math.floor(min / step) * step; v <= top + step * 0.001; v += step) out.push(Number(v.toPrecision(12)));
  if (out.length < 2) out.push(Number((out[0] + step).toPrecision(12)));
  return out;
}

const short = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, "") + "B";
  if (a >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (a >= 1e4) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "k";
  return String(Number(n.toFixed(2)));
};

export type ChartPick = { label: number; values: number[]; kind: "bar" | "line" };

export function pickChart(columns: string[], rows: Cell[][]): ChartPick | null {
  if (rows.length < 2 || columns.length < 2) return null;
  const isNum = (i: number) => rows.every((r) => r[i] == null || typeof r[i] === "number") && rows.some((r) => typeof r[i] === "number");
  const nums = columns.map((_, i) => i).filter(isNum);
  const label = columns.findIndex((_, i) => !nums.includes(i));
  if (!nums.length) return null;
  const lab = label >= 0 ? label : nums[0];
  const values = nums.filter((i) => i !== lab).slice(0, 3);
  if (!values.length) return null;
  const dateLike = rows.every((r) => r[lab] == null || /^\d{4}(-\d{2}){0,2}/.test(String(r[lab])));
  return { label: lab, values, kind: dateLike || (label < 0 && rows.length > 12) || rows.length > 40 ? "line" : "bar" };
}

export function chartSvg(columns: string[], rows: Cell[][], pick: ChartPick | null = pickChart(columns, rows), o: { width?: number; height?: number } = {}): string | null {
  if (!pick) return null;
  const data = rows.slice(0, pick.kind === "bar" ? 40 : 1000);
  const W = o.width ?? 760, H = o.height ?? 320;
  const L = 58, R = 16, T = pick.values.length > 1 ? 34 : 16, B = 64;
  const w = W - L - R, h = H - T - B;
  const all = data.flatMap((r) => pick.values.map((i) => (typeof r[i] === "number" ? (r[i] as number) : 0)));
  const max = Math.max(0, ...all), min = Math.min(0, ...all);
  const ticks = niceTicks(max, min);
  const top = ticks[ticks.length - 1], bot = ticks[0];
  const y = (v: number) => T + h - ((v - bot) / (top - bot || 1)) * h;
  const parts: string[] = [];
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#fff"/>`);
  for (const t of ticks) parts.push(`<line x1="${L}" x2="${W - R}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}" stroke="#e7e5e4" stroke-width="1"/><text x="${L - 8}" y="${(y(t) + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="#57534e">${short(t)}</text>`);
  const n = data.length;
  const labelEvery = Math.max(1, Math.ceil(n / (pick.kind === "bar" ? 20 : 8)));
  const xLabel = (i: number, x: number) => {
    if (i % labelEvery) return "";
    const s = String(data[i][pick.label] ?? "∅");
    const t = s.length > 14 ? s.slice(0, 13) + "…" : s;
    return `<text x="${x.toFixed(1)}" y="${T + h + 14}" font-size="11" fill="#57534e" text-anchor="end" transform="rotate(-35 ${x.toFixed(1)} ${T + h + 14})">${esc(t)}</text>`;
  };
  if (pick.kind === "bar") {
    const band = w / n;
    const bw = Math.max(2, (band * 0.78) / pick.values.length);
    data.forEach((r, i) => {
      pick.values.forEach((ci, k) => {
        const v = typeof r[ci] === "number" ? (r[ci] as number) : 0;
        const x = L + i * band + band * 0.11 + k * bw;
        const y0 = y(Math.max(0, v)), y1 = y(Math.min(0, v));
        parts.push(`<rect x="${x.toFixed(1)}" y="${y0.toFixed(1)}" width="${(bw - 1).toFixed(1)}" height="${Math.max(0.5, y1 - y0).toFixed(1)}" rx="2" fill="${PALETTE[k]}"><title>${esc(String(r[pick.label]))}: ${v}</title></rect>`);
      });
      parts.push(xLabel(i, L + i * band + band / 2 + 4));
    });
  } else {
    const x = (i: number) => L + (n === 1 ? w / 2 : (i / (n - 1)) * w);
    pick.values.forEach((ci, k) => {
      const pts = data.map((r, i) => `${x(i).toFixed(1)},${y(typeof r[ci] === "number" ? (r[ci] as number) : 0).toFixed(1)}`);
      parts.push(`<polyline points="${pts.join(" ")}" fill="none" stroke="${PALETTE[k]}" stroke-width="2" stroke-linejoin="round"/>`);
      if (n <= 60) data.forEach((r, i) => parts.push(`<circle cx="${x(i).toFixed(1)}" cy="${y(typeof r[ci] === "number" ? (r[ci] as number) : 0).toFixed(1)}" r="2.6" fill="${PALETTE[k]}"><title>${esc(String(r[pick.label]))}: ${r[ci]}</title></circle>`));
    });
    data.forEach((_, i) => parts.push(xLabel(i, x(i) + 4)));
  }
  parts.push(`<line x1="${L}" x2="${W - R}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}" stroke="#a8a29e"/>`);
  if (pick.values.length > 1)
    pick.values.forEach((ci, k) => parts.push(`<rect x="${L + k * 150}" y="8" width="10" height="10" rx="2" fill="${PALETTE[k]}"/><text x="${L + k * 150 + 15}" y="17" font-size="12" fill="#292524">${esc(columns[ci])}</text>`));
  else parts.push(`<text x="${L}" y="11" font-size="11" fill="#57534e">${esc(columns[pick.values[0]])} by ${esc(columns[pick.label])}</text>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="ui-sans-serif, system-ui, sans-serif">${parts.join("")}</svg>`;
}
