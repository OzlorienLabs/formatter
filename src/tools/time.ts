import { DurationError, allForms, parseDuration, toClock, toCompact, toHuman, toIso } from "./lib/H-duration";
import {
  abbr, bestSlots, cityOf, dayDelta, dstInfo, fmtDate, fmtOffset, fmtTime, fmtTransition, localZone, longName, nextTransition, offsetMin, overlapIntervals, parseRefTime, partsIn, resolveZone, zonedToUtc,
} from "./lib/H-tz";
import { ToolError, bool, num, str, type Result, type SpecModule, type View } from "./types";

/* ── durations ───────────────────────────────────────────────────────── */

type Row = { line: number; label: string; input: string; sec?: number; kind?: string; approx?: boolean; err?: string };

function parseLines(src: string): Row[] {
  const rows: Row[] = [];
  src.replace(/\r/g, "").split("\n").forEach((raw, i) => {
    const t = raw.trim();
    if (!t || t.startsWith("#") || t.startsWith("//")) return;
    // "label: duration" (a label contains a letter; "01:20:05" does not match)
    const lm = /^([^:]*[A-Za-z][^:]*?):\s+(.+)$/.exec(t);
    const label = lm ? lm[1].trim() : "";
    const input = lm ? lm[2].trim() : t;
    try {
      const p = parseDuration(input);
      rows.push({ line: i + 1, label, input, sec: p.seconds, kind: p.kind, approx: p.approx });
    } catch (e) {
      rows.push({ line: i + 1, label, input, err: e instanceof DurationError ? e.message : String(e) });
    }
  });
  return rows;
}

const FORMAT_CHOICES: [string, string][] = [
  ["all", "Summary — every form"],
  ["seconds", "Seconds"],
  ["ms", "Milliseconds"],
  ["minutes", "Minutes (decimal)"],
  ["hours", "Hours (decimal)"],
  ["iso", "ISO 8601 (PT1H20M5S)"],
  ["clock", "Clock (01:20:05)"],
  ["human", "Words (1 hour and 20 minutes)"],
  ["compact", "Compact (1h 20m 5s)"],
];

function formatOne(sec: number, f: string): string {
  const a = allForms(sec);
  switch (f) {
    case "seconds": return String(a.seconds);
    case "ms": return String(a.milliseconds);
    case "minutes": return String(a.minutes);
    case "hours": return String(a.hours);
    case "iso": return a.iso;
    case "clock": return a.clock;
    case "human": return a.human;
    case "compact": return a.compact;
  }
  return a.clock;
}

function block(title: string, sec: number): string {
  const a = allForms(sec);
  return [
    title,
    `  seconds       ${a.seconds}`,
    `  milliseconds  ${a.milliseconds}`,
    `  minutes       ${a.minutes}`,
    `  hours         ${a.hours}`,
    `  ISO 8601      ${a.iso}`,
    `  clock         ${a.clock}`,
    `  compact       ${a.compact}`,
    `  words         ${a.human}`,
  ].join("\n");
}

function convertDurations(src: string, fmt: string): Result {
  const rows = parseLines(src);
  if (!rows.length) throw new ToolError("Type a duration such as 1h 20m 5s, PT1H20M, 01:20:05 or 4805 — one per line.");
  const good = rows.filter((r) => r.sec !== undefined);
  const bad = rows.filter((r) => r.err);
  if (!good.length) throw new ToolError(bad.map((r) => `Line ${r.line}: ${r.err}`).join("\n"));
  const total = good.reduce((a, r) => a + r.sec!, 0);
  let text: string;
  if (fmt === "all" && good.length === 1 && !bad.length) {
    const r = good[0];
    text = block(`${r.label ? r.label + ": " : ""}${r.input}   (${r.kind}${r.approx ? ", months/years averaged" : ""})`, r.sec!);
  } else if (fmt === "all") {
    // Several lines: one aligned row each, then the total.
    const head = ["input", "seconds", "ISO 8601", "clock", "compact"];
    const body = rows.map((r) => (r.sec !== undefined ? [(r.label ? r.label + ": " : "") + r.input, String(allForms(r.sec).seconds), toIso(r.sec), toClock(r.sec), toCompact(r.sec)] : [r.input, "error: " + r.err, "", "", ""]));
    const tot = ["TOTAL", String(allForms(total).seconds), toIso(total), toClock(total), toCompact(total)];
    const w = head.map((h, i) => Math.max(h.length, ...[...body, tot].map((b) => (b[i] ?? "").length)));
    const fmtRow = (b: string[]) => b.map((c, i) => (i === 1 ? c.padStart(w[i]) : c.padEnd(w[i]))).join("  ").trimEnd();
    text = [fmtRow(head), w.map((x) => "─".repeat(x)).join("  "), ...body.map(fmtRow), w.map((x) => "─".repeat(x)).join("  "), fmtRow(tot), "", `Total: ${toHuman(total)}`].join("\n");
  } else {
    text = rows.map((r) => (r.sec !== undefined ? (r.label ? `${r.label}: ` : "") + formatOne(r.sec, fmt) : `error: ${r.err}`)).join("\n");
  }
  const notes: string[] = bad.map((r) => `Line ${r.line}: ${r.err}`);
  if (good.some((r) => r.approx)) notes.push("Months and years have no fixed length: they are averaged (1 month = 30.44 days, 1 year = 365.24 days).");
  const secs = good.map((r) => r.sec!);
  const views: View[] = [
    { label: "Result", out: { kind: "text", text } },
    {
      label: "Table",
      out: {
        kind: "table",
        columns: ["line", "label", "input", "detected", "seconds", "ISO 8601", "clock", "compact", "words"],
        rows: rows.map((r) => (r.sec !== undefined ? [r.line, r.label || null, r.input, r.kind!, allForms(r.sec).seconds, toIso(r.sec), toClock(r.sec), toCompact(r.sec), toHuman(r.sec)] : [r.line, r.label || null, r.input, "✗ " + r.err, null, null, null, null, null])),
      },
    },
    {
      label: "Stats",
      out: {
        kind: "stats",
        items: [
          { label: "Durations", value: good.length, tone: bad.length ? "warn" : "ok" },
          { label: "Total", value: toCompact(total), tone: "info" },
          { label: "Total (clock)", value: toClock(total) },
          { label: "Average", value: toCompact(Math.round((total / good.length) * 1000) / 1000) },
          { label: "Longest", value: toCompact(Math.max(...secs)) },
          { label: "Shortest", value: toCompact(Math.min(...secs)) },
          ...(bad.length ? [{ label: "Invalid lines", value: bad.length, tone: "bad" as const }] : []),
        ],
      },
    },
  ];
  return { text, views, notes: notes.length ? notes : undefined };
}

/* ── timer plans (used when the Durations box is empty) ─────────────── */

export function parseNums(s: string | undefined, d: number[]): number[] {
  const parts = (s ?? "").split(/[,\s]+/).filter(Boolean).map(Number);
  return d.map((x, i) => (Number.isFinite(parts[i]) && parts[i] >= 0 ? parts[i] : x));
}

function pomodoroPlan(cfg: string): Result {
  const [focus, short, long, every] = parseNums(cfg, [25, 5, 15, 4, 0]);
  const n = Math.max(1, Math.round(every));
  const rows: (string | number)[][] = [];
  let t = 0;
  for (let i = 1; i <= n; i++) {
    rows.push([i, "Focus", toClock(focus * 60).slice(3), "+" + toClock(t).replace(/^00:/, "")]);
    t += focus * 60;
    const brk = i === n ? long : short;
    rows.push([i, i === n ? "Long break" : "Short break", toClock(brk * 60).slice(3), "+" + toClock(t).replace(/^00:/, "")]);
    t += brk * 60;
  }
  const text = [`Pomodoro plan — ${n} focus sessions (${focus}/${short}/${long} min)`, "", "#  Phase        Length  Starts", ...rows.map((r) => `${String(r[0]).padEnd(2)} ${String(r[1]).padEnd(12)} ${String(r[2]).padEnd(7)} ${r[3]}`), "", `Total ${toCompact(t)} · ${toCompact(n * focus * 60)} focused`].join("\n");
  return { text, views: [{ label: "Plan", out: { kind: "text", text } }, { label: "Table", out: { kind: "table", columns: ["#", "phase", "length", "starts"], rows } }] };
}

function intervalPlan(cfg: string): Result {
  const [work, rest, rounds, prep] = parseNums(cfg, [30, 15, 8, 10]);
  const R = Math.max(1, Math.round(rounds));
  const rows: (string | number)[][] = [];
  let t = 0;
  if (prep) {
    rows.push(["–", "Get ready", `${prep}s`, "+" + toClock(t).slice(3)]);
    t += prep;
  }
  for (let i = 1; i <= R; i++) {
    rows.push([i, "Work", `${work}s`, "+" + toClock(t).slice(3)]);
    t += work;
    if (i < R && rest) {
      rows.push([i, "Rest", `${rest}s`, "+" + toClock(t).slice(3)]);
      t += rest;
    }
  }
  const text = [`Interval plan — ${R} rounds of ${work}s work / ${rest}s rest${prep ? `, ${prep}s get-ready` : ""}`, "", ...rows.map((r) => `${String(r[0]).padEnd(3)} ${String(r[1]).padEnd(10)} ${String(r[2]).padEnd(5)} ${r[3]}`), "", `Total ${toCompact(t)} · work ${toCompact(R * work)} · rest ${toCompact((R - 1) * rest)}`].join("\n");
  return { text, views: [{ label: "Plan", out: { kind: "text", text } }, { label: "Table", out: { kind: "table", columns: ["round", "phase", "length", "starts"], rows } }] };
}

export type Stopwatch = { a: number; s: number | null; laps: number[] };
export function readStopwatch(s: string | undefined): Stopwatch {
  try {
    const v = JSON.parse(s || "{}");
    return { a: Number(v.a) || 0, s: typeof v.s === "number" ? v.s : null, laps: Array.isArray(v.laps) ? v.laps.map(Number).filter(Number.isFinite) : [] };
  } catch {
    return { a: 0, s: null, laps: [] };
  }
}

export function lapsCsv(laps: number[]): string {
  const f = (ms: number) => (ms / 1000).toFixed(3);
  return ["lap,lap_seconds,split_seconds,lap_clock,split_clock", ...laps.map((split, i) => {
    const lap = split - (laps[i - 1] ?? 0);
    return `${i + 1},${f(lap)},${f(split)},${toClock(lap / 1000)},${toClock(split / 1000)}`;
  })].join("\n");
}

/* ── time zones ──────────────────────────────────────────────────────── */

export const DEFAULT_ZONES = "local, UTC, America/New_York, Europe/London, Asia/Kolkata, Asia/Tokyo";

export function parseZoneList(s: string | undefined): { zones: string[]; bad: string[] } {
  const zones: string[] = [];
  const bad: string[] = [];
  for (const raw of (s?.trim() ? s : DEFAULT_ZONES).split(/[,\n;]+/)) {
    const q = raw.trim();
    if (!q) continue;
    const z = resolveZone(q);
    if (!z) bad.push(q);
    else if (!zones.includes(z)) zones.push(z);
  }
  return { zones, bad };
}

function tzCompare(zonesSrc: string, timeSrc: string, opts: Record<string, unknown>): Result {
  const { zones, bad } = parseZoneList(zonesSrc);
  if (!zones.length) throw new ToolError(`No valid time zones. Use IANA names like Europe/London, cities like "Bangalore", or UTC+5:30.${bad.length ? ` Not recognised: ${bad.join(", ")}` : ""}`);
  const home = zones[0];
  const t = parseRefTime(timeSrc, home);
  if (t === null) throw new ToolError(`Could not read the time "${timeSrc}". Use 2026-09-24T09:00 (wall time in ${home}), an ISO instant with Z/offset, 09:30, epoch seconds, or "now".`);
  const h12 = str(opts.clock) === "12";
  const ws = num(opts.workStart, 9), we = num(opts.workEnd, 17);
  const hp = partsIn(home, t);
  const rows = zones.map((z) => {
    const p = partsIn(z, t);
    const off = offsetMin(z, t);
    const d = dstInfo(z, t);
    const nx = d.observes ? nextTransition(z, t) : null;
    const dd = dayDelta(hp, p);
    const hm = p.h + p.mi / 60;
    const work = p.wd >= 1 && p.wd <= 5 && hm >= ws && hm < we;
    return {
      z, p, off, d, nx, dd, work,
      cells: [
        z === localZone() && zonesSrc.includes("local") ? `${z} (local)` : z,
        `${fmtDate(p)} ${fmtTime(p, h12)}${dd ? ` (${dd > 0 ? "+" : ""}${dd}d)` : ""}`,
        fmtOffset(off),
        abbr(z, t),
        d.observes ? (d.active ? "DST" : "standard") : "no DST",
        nx ? fmtTransition(nx, h12) : "—",
        work ? "✓ working" : p.h < 7 || p.h >= 22 ? "night" : "off hours",
      ],
    };
  });
  const cols = ["zone", "local time", "offset", "abbr", "DST", "next change", "status"];
  const widths = cols.map((c, i) => Math.max(c.length, ...rows.map((r) => r.cells[i].length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join("  ").trimEnd();
  const dayStart = zonedToUtc(home, hp.y, hp.mo, hp.d, 0, 0);
  const ov = overlapIntervals(zones, dayStart, ws, we);
  const fmtRange = (a: number, b: number) => zones.map((z) => `${cityOf(z)} ${fmtTime(partsIn(z, a), h12)}–${fmtTime(partsIn(z, b), h12)}`).join(" · ");
  const overlapLines = ov.length
    ? ov.map(([a, b]) => `  ${toCompact((b - a) / 1000)}: ${fmtRange(a, b)}`)
    : [
        `  none — no moment on ${fmtDate(hp)} is inside ${ws}:00–${we}:00 on a weekday everywhere.`,
        "  Least painful slots:",
        ...bestSlots(zones, dayStart, ws, we).map((s) => `  · ${zones.map((z) => `${cityOf(z)} ${fmtTime(partsIn(z, s.t), h12)}`).join(" · ")}${s.outside.length ? `  (outside hours: ${s.outside.map(cityOf).join(", ")})` : ""}`),
      ];
  const text = [
    `Reference: ${fmtDate(hp)} ${fmtTime(hp, h12)} in ${home} (${fmtOffset(offsetMin(home, t))}) = ${new Date(t).toISOString().replace(".000Z", "Z")}`,
    "",
    line(cols),
    line(widths.map((w) => "─".repeat(w))),
    ...rows.map((r) => line(r.cells)),
    "",
    `Working-hours overlap (${ws}:00–${we}:00, Mon–Fri) on ${fmtDate(hp)} in ${cityOf(home)}:`,
    ...overlapLines,
  ].join("\n");
  const notes = bad.length ? [`Not recognised and skipped: ${bad.join(", ")}`] : undefined;
  const views: View[] = [
    { label: "Comparison", out: { kind: "text", text } },
    { label: "Table", out: { kind: "table", columns: cols, rows: rows.map((r) => r.cells) } },
    {
      label: "Details",
      out: {
        kind: "table",
        columns: ["zone", "long name", "UTC offset now", "standard", "daylight", "observes DST"],
        rows: rows.map((r) => [r.z, longName(r.z, t), fmtOffset(r.off), fmtOffset(r.d.std), r.d.observes ? fmtOffset(r.d.dst) : "—", r.d.observes]),
      },
    },
  ];
  return { text, views, notes };
}

/* ── specs ───────────────────────────────────────────────────────────── */

const specs: SpecModule = {
  "stopwatch-timer": {
    inputs: [
      { id: "duration", label: "Durations", placeholder: "One per line: 1h 20m 5s · PT1H20M · 01:20:05 · 4805 · 90 min · label: 25m" },
      { id: "countdown", label: "Countdown", kind: "text", placeholder: "5m" },
      { id: "pomodoro", label: "Pomodoro", kind: "text", placeholder: "25,5,15,4" },
      { id: "intervals", label: "Intervals", kind: "text", placeholder: "30,15,8,10" },
      { id: "stopwatch", label: "Stopwatch state", kind: "text" },
    ],
    options: [
      { id: "mode", label: "Mode", type: "segment", choices: [["stopwatch", "Stopwatch"], ["countdown", "Countdown"], ["pomodoro", "Pomodoro"], ["intervals", "Intervals"], ["convert", "Convert"]], default: "stopwatch", show: () => false },
      { id: "format", label: "Convert to", type: "select", choices: FORMAT_CHOICES, default: "all", show: (o) => o.mode === "convert" },
      { id: "sound", label: "Sound", type: "toggle", default: true, show: (o) => o.mode !== "convert" && o.mode !== "stopwatch" },
    ],
    custom: () => import("./ui/H-Timers"),
    run: ({ inputs, opts }) => {
      const src = str(inputs.duration);
      if (src.trim()) return convertDurations(src, str(opts.format, "all"));
      const mode = str(opts.mode, "stopwatch");
      if (mode === "pomodoro") return pomodoroPlan(str(inputs.pomodoro));
      if (mode === "intervals") return intervalPlan(str(inputs.intervals));
      if (mode === "countdown") {
        const c = str(inputs.countdown, "5m");
        let sec: number;
        try {
          sec = parseDuration(c).seconds;
        } catch (e) {
          throw new ToolError(`Countdown: ${(e as Error).message}`);
        }
        return { text: block(`Countdown ${c}`, sec) };
      }
      const sw = readStopwatch(inputs.stopwatch);
      if (sw.laps.length) {
        const csv = lapsCsv(sw.laps);
        return { text: csv, filename: "laps.csv", views: [{ label: "Laps CSV", out: { kind: "text", text: csv } }] };
      }
      if (mode === "convert") throw new ToolError("Type a duration such as 1h 20m 5s, PT1H20M, 01:20:05 or 4805 — one per line.");
      return { text: `Stopwatch ${toClock(sw.a / 1000)} — no laps yet.` };
    },
    examples: [
      { label: "Stopwatch", inputs: { duration: "", stopwatch: "" }, opts: { mode: "stopwatch" }, note: "Space starts/pauses, L records a lap, R resets. Fastest and slowest laps are highlighted; export laps as CSV." },
      { label: "Tea countdown", inputs: { duration: "", countdown: "3m 30s" }, opts: { mode: "countdown" }, note: "A countdown with a progress ring and a Web Audio alarm; the tab title shows the time left." },
      { label: "Pomodoro 50/10", inputs: { duration: "", pomodoro: "50,10,30,3" }, opts: { mode: "pomodoro" }, note: "50-minute focus blocks, 10-minute breaks and a 30-minute long break after every 3rd block." },
      { label: "HIIT 40/20 × 10", inputs: { duration: "", intervals: "40,20,10,10" }, opts: { mode: "intervals" }, note: "Tabata-style intervals: 10s get-ready, then 10 rounds of 40s work / 20s rest with beeps in the last 3 seconds." },
      { label: "Convert: every format", inputs: { duration: "1h 20m 5s\nPT1H20M5S\n01:20:05\n4805\n2.03:04:05\n1h20m5.5s\n90 min\n1 day, 6 hours and 30 minutes" }, opts: { mode: "convert", format: "all" }, note: "Words, ISO 8601, clock, .NET TimeSpan (2.03:04:05), Go (1h20m5.5s) and bare seconds are all understood — with a total." },
      { label: "Timesheet total", inputs: { duration: "standup: 15m\ncode review: 1h 10m\nfeature work: 3h 45m\nincident call: 50 min\nplanning: 0:45:00" }, opts: { mode: "convert", format: "compact" }, note: "Label lines with \"label: duration\"; the Stats tab sums the day." },
      { label: "Video timestamps → seconds", inputs: { duration: "03:25\n1:02:07\n00:45.5\n12:00:00" }, opts: { mode: "convert", format: "seconds" }, note: "mm:ss and h:mm:ss become plain seconds — one per line, ready for a pipeline." },
      { label: "To ISO 8601", inputs: { duration: "45 minutes\n2 hours 30 minutes\n1 week\n36h\n1.5 days" }, opts: { mode: "convert", format: "iso" }, note: "Normalised ISO 8601 durations for APIs, iCal and schema.org." },
      { label: "Bad unit", inputs: { duration: "2 fortnights" }, opts: { mode: "convert" }, error: true, note: "Unknown units are reported with the accepted list." },
    ],
    steps: ["Pick a tab: Stopwatch, Countdown, Pomodoro, Intervals or Convert.", "Space starts and pauses, R resets, L records a lap.", "Convert parses durations in any common format; one per line."],
    tips: ["Timers keep running while you switch tabs.", "Allow notifications to be alerted when a countdown ends in a background tab."],
  },

  "timezone-compare": {
    inputs: [
      { id: "zones", label: "Zones", placeholder: "Comma-separated: local, UTC, America/New_York, Bangalore, UTC+5:45" },
      { id: "time", label: "Reference time", kind: "text", placeholder: "now · 2026-09-24T09:00 (in the first zone) · 2026-09-24T16:00Z" },
    ],
    options: [
      { id: "clock", label: "Clock", type: "segment", choices: [["24", "24 h"], ["12", "12 h"]], default: "24" },
      { id: "workStart", label: "Work from", type: "number", default: 9, min: 0, max: 23 },
      { id: "workEnd", label: "to", type: "number", default: 17, min: 1, max: 24 },
    ],
    custom: () => import("./ui/H-Timezones"),
    run: ({ inputs, opts }) => tzCompare(str(inputs.zones), str(inputs.time), opts),
    examples: [
      { label: "Distributed team", inputs: { zones: "America/Los_Angeles, Europe/London, Asia/Kolkata", time: "2026-09-24T08:00" }, note: "San Francisco, London and Bangalore: no full 9–17 overlap, so the least painful slots are suggested." },
      { label: "APAC call", inputs: { zones: "Asia/Singapore, Asia/Tokyo, Australia/Sydney, Pacific/Auckland, Asia/Kolkata", time: "2026-09-24T10:00" }, note: "Five APAC offices; the overlap band shows when everyone is at work." },
      { label: "DST edge (March)", inputs: { zones: "America/New_York, Europe/London, Europe/Berlin", time: "2026-03-10T09:00" }, note: "The US springs forward on 8 March, Europe on 29 March: for three weeks New York is only 4 hours behind London." },
      { label: "DST edge (November)", inputs: { zones: "Europe/London, America/Chicago, Australia/Sydney", time: "2026-10-28T09:00" }, note: "Europe has fallen back, Chicago has not yet, and Sydney has just sprung forward — offsets differ from the usual." },
      { label: "Half-hour offsets", inputs: { zones: "UTC, Asia/Kolkata, Asia/Kathmandu, Australia/Adelaide, America/St_Johns, Pacific/Chatham", time: "2026-09-24T12:00Z" }, note: "UTC+5:30, +5:45, +9:30, −2:30 and +12:45: cells show local minutes when a zone is off the hour." },
      { label: "12-hour clock", inputs: { zones: "local, America/New_York, America/Denver, America/Phoenix, Pacific/Honolulu", time: "now" }, opts: { clock: "12", workStart: 8, workEnd: 18 }, note: "Live mode (now) with US zones; Phoenix does not observe DST." },
      { label: "Unknown zone", inputs: { zones: "Mars/Olympus_Mons", time: "now" }, error: true, note: "Unrecognised zones are reported." },
    ],
    steps: ["Add zones by city, IANA name or abbreviation; drag order with the arrows. The first zone is home.", "Pick a date and time (in the home zone) or leave it live.", "Hover the 24-hour grid to compare; the green band marks the working-hours overlap. Click a cell to set the meeting time."],
  },
};

export default specs;
