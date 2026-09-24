/**
 * Duration parsing and formatting: "1h 20m 5s", "PT1H20M", "01:20:05",
 * "2.03:04:05" (.NET), Go's "1h20m5.5s", "90 min", bare seconds.
 */

const UNIT: Record<string, number> = {
  ns: 1e-9, nanosecond: 1e-9, nanoseconds: 1e-9,
  us: 1e-6, "µs": 1e-6, "μs": 1e-6, microsecond: 1e-6, microseconds: 1e-6,
  ms: 1e-3, msec: 1e-3, msecs: 1e-3, millisecond: 1e-3, milliseconds: 1e-3,
  s: 1, sec: 1, secs: 1, second: 1, seconds: 1,
  m: 60, min: 60, mins: 60, minute: 60, minutes: 60,
  h: 3600, hr: 3600, hrs: 3600, hour: 3600, hours: 3600,
  d: 86400, day: 86400, days: 86400,
  w: 604800, wk: 604800, wks: 604800, week: 604800, weeks: 604800,
  mo: 2629746, mon: 2629746, month: 2629746, months: 2629746,
  y: 31556952, yr: 31556952, yrs: 31556952, year: 31556952, years: 31556952,
};

export type Parsed = { seconds: number; kind: string; approx: boolean };

export class DurationError extends Error {}

/** Parse one duration expression into seconds. */
export function parseDuration(input: string): Parsed {
  let s = input.trim();
  if (!s) throw new DurationError("empty");
  let sign = 1;
  if (/^[-−]/.test(s)) {
    sign = -1;
    s = s.slice(1).trim();
  } else if (s.startsWith("+")) s = s.slice(1).trim();

  // ISO 8601: P1Y2M3W4DT5H6M7.5S
  const iso = /^P(?:(\d+(?:[.,]\d+)?)Y)?(?:(\d+(?:[.,]\d+)?)M)?(?:(\d+(?:[.,]\d+)?)W)?(?:(\d+(?:[.,]\d+)?)D)?(?:T(?:(\d+(?:[.,]\d+)?)H)?(?:(\d+(?:[.,]\d+)?)M)?(?:(\d+(?:[.,]\d+)?)S)?)?$/i.exec(s);
  if (iso && s.length > 1 && !/T$/i.test(s)) {
    const n = (i: number) => Number((iso[i] ?? "0").replace(",", "."));
    const secs = n(1) * UNIT.y + n(2) * UNIT.mo + n(3) * UNIT.w + n(4) * UNIT.d + n(5) * 3600 + n(6) * 60 + n(7);
    return { seconds: sign * secs, kind: "ISO 8601", approx: !!(iso[1] || iso[2]) };
  }
  // .NET TimeSpan d.hh:mm:ss(.fff) and clock hh:mm:ss / mm:ss, optional "3 days 04:05:06"
  const clock = /^(?:(\d+)\s*(?:d|days?)\s*|(\d+)\.(?=\d{1,2}:\d{2}:\d{2}))?(\d+):(\d{1,2}(?:\.\d+)?)(?::(\d{1,2}(?:\.\d+)?))?$/i.exec(s);
  if (clock) {
    const days = +(clock[1] ?? clock[2] ?? 0);
    const a = +clock[3], b = parseFloat(clock[4]);
    if (clock[5] !== undefined && !Number.isInteger(b)) throw new DurationError(`"${input.trim()}": minutes cannot have a fraction in h:mm:ss`);
    const secs = clock[5] !== undefined ? a * 3600 + b * 60 + parseFloat(clock[5]) : a * 60 + b;
    if (clock[5] === undefined && b >= 60) throw new DurationError(`"${input.trim()}": seconds must be under 60 in mm:ss`);
    return { seconds: sign * (days * 86400 + secs), kind: clock[5] !== undefined ? (clock[2] ? ".NET TimeSpan" : "clock hh:mm:ss") : "clock mm:ss", approx: false };
  }
  // Bare number = seconds
  if (/^\d+(\.\d+)?$/.test(s)) return { seconds: sign * parseFloat(s), kind: "seconds", approx: false };
  // Unit list: "1h 20m 5s", "1 hour, 20 minutes and 5 seconds", "1h20m5.5s", "1.5 hours"
  const cleaned = s.replace(/,|\band\b/gi, " ").replace(/\s+/g, " ").trim();
  const re = /(\d+(?:\.\d+)?|\.\d+)\s*([a-zµμ]+)/gi;
  let m: RegExpExecArray | null;
  let total = 0, used = 0, approx = false;
  let pos = 0;
  while ((m = re.exec(cleaned))) {
    const gap = cleaned.slice(pos, m.index).trim();
    if (gap) throw new DurationError(`"${input.trim()}": unexpected "${gap}"`);
    const u = m[2].toLowerCase();
    const f = UNIT[u] ?? UNIT[u.replace(/s$/, "")];
    if (f === undefined) throw new DurationError(`"${input.trim()}": unknown unit "${m[2]}" — use ms, s, m, h, d, w, mo, y`);
    if (u === "mo" || u.startsWith("mon") || u.startsWith("y")) approx = true;
    total += parseFloat(m[1]) * f;
    used++;
    pos = m.index + m[0].length;
  }
  if (!used || cleaned.slice(pos).trim()) throw new DurationError(`"${input.trim()}" is not a duration — try 1h 20m, PT1H20M, 01:20:05 or 4805`);
  const go = /^(\d+(\.\d+)?(ns|us|µs|ms|s|m|h))+$/.test(s.replace(/\s/g, ""));
  return { seconds: sign * total, kind: go && !/\s/.test(s) ? "Go / compact" : "units", approx };
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function toIso(sec: number): string {
  const neg = sec < 0;
  let s = Math.abs(sec);
  const d = Math.floor(s / 86400);
  s -= d * 86400;
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  s = r3(s - m * 60);
  let out = "P" + (d ? `${d}D` : "");
  const t = (h ? `${h}H` : "") + (m ? `${m}M` : "") + (s ? `${s}S` : "");
  if (t) out += "T" + t;
  if (out === "P") out = "PT0S";
  return (neg ? "-" : "") + out;
}

export function toClock(sec: number, days = true): string {
  const neg = sec < 0;
  let s = Math.abs(sec);
  const ms = Math.round((s - Math.floor(s)) * 1000);
  s = Math.floor(s);
  let d = 0;
  if (days) {
    d = Math.floor(s / 86400);
    s -= d * 86400;
  }
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return (neg ? "-" : "") + (d ? `${d}d ` : "") + `${p(h)}:${p(m)}:${p(ss)}` + (ms ? "." + String(ms).padStart(3, "0") : "");
}

const PARTS: [string, number][] = [["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60], ["second", 1]];

export function toHuman(sec: number, weeks = false): string {
  if (sec === 0) return "0 seconds";
  let s = Math.abs(sec);
  const out: string[] = [];
  for (const [name, f] of PARTS) {
    if (name === "week" && !weeks) continue;
    const n = name === "second" ? r3(s) : Math.floor(s / f);
    if (n) out.push(`${n} ${name}${n === 1 ? "" : "s"}`);
    s -= name === "second" ? s : n * f;
  }
  const txt = out.length > 1 ? out.slice(0, -1).join(", ") + " and " + out[out.length - 1] : out[0] ?? `${r3(Math.abs(sec) * 1000)} milliseconds`;
  return (sec < 0 ? "minus " : "") + txt;
}

export function toCompact(sec: number): string {
  if (sec === 0) return "0s";
  let s = Math.abs(sec);
  const out: string[] = [];
  for (const [u, f] of [["d", 86400], ["h", 3600], ["m", 60]] as [string, number][]) {
    const n = Math.floor(s / f);
    if (n) out.push(n + u);
    s -= n * f;
  }
  const whole = Math.floor(s + 1e-9), ms = Math.round((s - whole) * 1000);
  if (whole) out.push(whole + "s");
  if (ms) out.push(ms + "ms");
  return (sec < 0 ? "-" : "") + out.join(" ");
}

export function allForms(sec: number) {
  return {
    seconds: r3(sec),
    milliseconds: Math.round(sec * 1000),
    minutes: Math.round((sec / 60) * 10000) / 10000,
    hours: Math.round((sec / 3600) * 10000) / 10000,
    iso: toIso(sec),
    clock: toClock(sec),
    human: toHuman(sec),
    compact: toCompact(sec),
  };
}

/** Clock display for timers: [h:]mm:ss(.cc) */
export function timerText(ms: number, centis = true): string {
  const neg = ms < 0;
  const a = Math.abs(ms);
  const h = Math.floor(a / 3600000), m = Math.floor((a % 3600000) / 60000), s = Math.floor((a % 60000) / 1000), cs = Math.floor((a % 1000) / 10);
  const p = (n: number) => String(n).padStart(2, "0");
  return (neg ? "-" : "") + (h ? `${h}:${p(m)}` : p(m)) + `:${p(s)}` + (centis ? `.${p(cs)}` : "");
}
