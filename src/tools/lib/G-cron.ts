/**
 * A real cron engine: parses 5-field (Unix), 6-field (seconds first),
 * 7-field Quartz and AWS `cron(...)` expressions, @macros, lists, ranges,
 * steps, month/day names and Quartz L / W / # / ?; computes the next run
 * times in any IANA time zone (DST-aware); converts between dialects.
 */
import { ToolError } from "../types";

export type FieldKey = "second" | "minute" | "hour" | "dom" | "month" | "dow" | "year";

export const FIELD_INFO: Record<FieldKey, { label: string; min: number; max: number }> = {
  second: { label: "Second", min: 0, max: 59 },
  minute: { label: "Minute", min: 0, max: 59 },
  hour: { label: "Hour", min: 0, max: 23 },
  dom: { label: "Day of month", min: 1, max: 31 },
  month: { label: "Month", min: 1, max: 12 },
  dow: { label: "Day of week", min: 0, max: 6 },
  year: { label: "Year", min: 1970, max: 2199 },
};

export const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
export const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const DAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const MACROS: Record<string, string> = {
  "@yearly": "0 0 1 1 *",
  "@annually": "0 0 1 1 *",
  "@monthly": "0 0 1 * *",
  "@weekly": "0 0 * * 0",
  "@daily": "0 0 * * *",
  "@midnight": "0 0 * * *",
  "@hourly": "0 * * * *",
};

export type Field = {
  key: FieldKey;
  text: string;
  /** "*" or "?" (or starts with "*", which Vixie cron treats as unrestricted for the DOM/DOW rule). */
  star: boolean;
  question: boolean;
  values: number[];
  /** dom: L, L-n, LW, nW */
  last?: number[]; // offsets from the last day (0 = last day)
  lastWeekday?: boolean;
  nearestWeekday?: number[];
  /** dow: n#k and nL */
  nth?: [number, number][];
  lastDow?: number[];
};

export type Cron = {
  source: string;
  dialect: "unix" | "quartz" | "aws";
  hasSeconds: boolean;
  hasYear: boolean;
  macro?: string;
  fields: Record<FieldKey, Field>;
  warnings: string[];
};

const up = (s: string) => s.toUpperCase();
const range = (a: number, b: number) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);

function nameValue(tok: string, key: FieldKey, quartzDow: boolean): number {
  const t = up(tok);
  if (key === "month") {
    const i = MONTHS.indexOf(t);
    if (i >= 0) return i + 1;
  }
  if (key === "dow") {
    const i = DAYS.indexOf(t);
    if (i >= 0) return i;
  }
  if (!/^\d+$/.test(t)) throw new ToolError(`${FIELD_INFO[key].label}: "${tok}" is not a number${key === "month" ? " or month name (JAN–DEC)" : key === "dow" ? " or day name (SUN–SAT)" : ""}.`);
  let n = Number(t);
  if (key === "dow") {
    if (quartzDow) {
      if (n < 1 || n > 7) throw new ToolError(`Day of week: ${n} is out of range 1–7 (Quartz/AWS count SUN=1 … SAT=7).`);
      n -= 1;
    } else {
      if (n > 7) throw new ToolError(`Day of week: ${n} is out of range 0–7 (0 and 7 are both Sunday).`);
      if (n === 7) n = 0;
    }
    return n;
  }
  const { min, max, label } = FIELD_INFO[key];
  if (n < min || n > max) throw new ToolError(`${label}: ${n} is out of range ${min}–${max}.`);
  return n;
}

function parseField(key: FieldKey, text: string, quartzDow: boolean): Field {
  const f: Field = { key, text, star: text.startsWith("*"), question: text === "?", values: [] };
  const info = FIELD_INFO[key];
  const set = new Set<number>();
  if (text === "?") {
    if (key !== "dom" && key !== "dow") throw new ToolError(`${info.label}: "?" is only allowed in the day-of-month and day-of-week fields.`);
    for (let i = info.min; i <= info.max; i++) set.add(i);
    f.values = [...set];
    return f;
  }
  if (!text) throw new ToolError(`${info.label}: empty field.`);
  for (const part of text.split(",")) {
    if (!part) throw new ToolError(`${info.label}: empty item in list "${text}".`);
    const P = up(part);
    // Quartz / cronie specials
    if (key === "dom") {
      if (P === "L") { (f.last ??= []).push(0); continue; }
      let m = /^L-(\d+)$/.exec(P);
      if (m) { if (+m[1] > 30) throw new ToolError(`Day of month: "L-${m[1]}" offset must be 0–30.`); (f.last ??= []).push(+m[1]); continue; }
      if (P === "LW" || P === "WL") { f.lastWeekday = true; continue; }
      m = /^(\d+)W$/.exec(P);
      if (m) { const d = +m[1]; if (d < 1 || d > 31) throw new ToolError(`Day of month: "${part}" — W needs a day 1–31.`); (f.nearestWeekday ??= []).push(d); continue; }
    }
    if (key === "dow") {
      let m = /^([A-Z]{3}|\d)#([1-5])$/.exec(P);
      if (m) { (f.nth ??= []).push([nameValue(m[1], "dow", quartzDow), +m[2]]); continue; }
      if (/#/.test(P)) throw new ToolError(`Day of week: "${part}" — use DAY#N with N from 1 to 5, e.g. MON#2 for the second Monday.`);
      m = /^([A-Z]{3}|\d)L$/.exec(P);
      if (m) { (f.lastDow ??= []).push(nameValue(m[1], "dow", quartzDow)); continue; }
      if (P === "L") { set.add(6); continue; } // Quartz: L alone in day-of-week means 7 = Saturday
    }
    if (/[LW#]/.test(P) && !/^(JUL|WED|SAT|LW)$/.test(P) && !/[A-Z]{3}/.test(P)) {
      throw new ToolError(`${info.label}: "${part}" — L, W and # are only valid in the day fields (e.g. L, 15W, LW in day of month; FRIL, MON#2 in day of week).`);
    }
    const [rng, stepS] = P.split("/");
    if (P.split("/").length > 2) throw new ToolError(`${info.label}: "${part}" has more than one "/".`);
    let step = 1;
    if (stepS !== undefined) {
      if (!/^\d+$/.test(stepS) || +stepS === 0) throw new ToolError(`${info.label}: step "/${stepS}" must be a positive whole number.`);
      step = +stepS;
      if (step > info.max - info.min + 1 && key !== "year") throw new ToolError(`${info.label}: step ${step} is larger than the field's range (${info.min}–${info.max}).`);
    }
    const lo = key === "dow" ? 0 : info.min, hi = key === "dow" ? 6 : info.max;
    let a: number, b: number;
    if (rng === "*" || rng === "?") {
      a = lo;
      b = hi;
      if (key === "dow" && quartzDow && stepS) a = 0;
    } else if (rng.includes("-")) {
      const [x, y, ...more] = rng.split("-");
      if (more.length || !x || !y) throw new ToolError(`${info.label}: bad range "${part}" — use start-end, e.g. ${key === "dow" ? "MON-FRI" : key === "month" ? "JAN-MAR" : `${info.min}-${Math.min(info.max, info.min + 5)}`}.`);
      a = nameValue(x, key, quartzDow);
      b = nameValue(y, key, quartzDow);
      if (key === "dow" && !quartzDow && up(y) === "7") b = 6; // 5-7 means Fri..Sun
      if (key === "dow" && !quartzDow && up(y) === "7" && a > 0) {
        for (let v = a; v <= 6; v += step) set.add(v);
        set.add(0);
        continue;
      }
      if (a > b) {
        if (key === "dow" || key === "month" || key === "hour" || key === "minute" || key === "second") {
          // wrap-around range, e.g. FRI-MON or 22-2
          const seq = [...range(a, hi), ...range(lo, b)];
          for (let k = 0; k < seq.length; k += step) set.add(seq[k]);
          continue;
        }
        throw new ToolError(`${info.label}: range "${part}" runs backwards (${a} > ${b}).`);
      }
    } else {
      a = nameValue(rng, key, quartzDow);
      b = stepS !== undefined ? hi : a;
    }
    for (let v = a; v <= b; v += step) set.add(v);
  }
  f.values = [...set].sort((x, y) => x - y);
  return f;
}

export function parseCron(input: string): Cron {
  let src = input.trim().replace(/\s+/g, " ");
  if (!src) throw new ToolError("Type a cron expression, e.g. */5 * * * * or @daily.");
  const warnings: string[] = [];
  let dialect: Cron["dialect"] = "unix";
  let macro: string | undefined;
  const aws = /^cron\((.*)\)$/i.exec(src);
  if (aws) {
    src = aws[1].trim();
    dialect = "aws";
  }
  if (src.startsWith("@")) {
    const m = MACROS[src.toLowerCase()];
    if (src.toLowerCase() === "@reboot") throw new ToolError("@reboot runs once when the cron daemon starts — it has no schedule to compute.");
    if (!m) throw new ToolError(`Unknown macro ${src}. Use @yearly, @annually, @monthly, @weekly, @daily, @midnight or @hourly.`);
    macro = src.toLowerCase();
    src = m;
  }
  const parts = src.split(" ");
  let names: FieldKey[];
  if (dialect === "aws") {
    if (parts.length !== 6) throw new ToolError(`AWS cron() takes 6 fields — minutes hours day-of-month month day-of-week year — but got ${parts.length}.`);
    names = ["minute", "hour", "dom", "month", "dow", "year"];
  } else if (parts.length === 5) names = ["minute", "hour", "dom", "month", "dow"];
  else if (parts.length === 6) names = ["second", "minute", "hour", "dom", "month", "dow"];
  else if (parts.length === 7) names = ["second", "minute", "hour", "dom", "month", "dow", "year"];
  else throw new ToolError(`Expected 5 fields (minute hour day month weekday), 6 with seconds, or 7 for Quartz with year — got ${parts.length}.`);

  if (dialect !== "aws" && (parts.length === 7 || parts.includes("?"))) dialect = "quartz";
  const quartzDow = dialect !== "unix";
  const fields = {} as Record<FieldKey, Field>;
  names.forEach((k, i) => (fields[k] = parseField(k, parts[i], quartzDow)));
  if (!fields.second) fields.second = { key: "second", text: "0", star: false, question: false, values: [0] };
  if (!fields.year) fields.year = { key: "year", text: "*", star: true, question: false, values: [] };
  else if (fields.year.star) fields.year.values = [];

  if (dialect !== "unix") {
    const dq = fields.dom.question, wq = fields.dow.question;
    if (dq && wq) throw new ToolError(`Only one of day-of-month and day-of-week may be "?".`);
    if (!dq && !wq) {
      if (dialect === "aws") throw new ToolError(`AWS cron() needs "?" in either day-of-month or day-of-week, e.g. cron(0 12 * * ? *).`);
      throw new ToolError(`Quartz needs "?" in either day-of-month or day-of-week (the other one sets the days), e.g. 0 0 12 ? * MON-FRI.`);
    }
  }
  if (fields.dom.values.length && fields.month.values.length && !fields.dom.last && !fields.dom.lastWeekday) {
    const maxDays = Math.max(...fields.month.values.map((m) => [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]));
    const earliest = Math.min(...fields.dom.values, ...(fields.dom.nearestWeekday ?? [99]));
    if (!fields.dom.star && !fields.dom.question && earliest > maxDays) warnings.push(`Day ${earliest} never occurs in the selected month(s) — this schedule may never run.`);
  }
  if (dialect === "unix" && !fields.dom.star && !fields.dow.star) warnings.push("Both day-of-month and day-of-week are restricted: standard cron runs when EITHER matches (OR), not both.");
  return { source: input.trim(), dialect, hasSeconds: names.includes("second"), hasYear: names.includes("year"), macro, fields, warnings };
}

/* ── matching ───────────────────────────────────────────────────────── */

const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m 1-based
const weekday = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).getUTCDay();

function domMatch(f: Field, y: number, m: number, d: number): boolean {
  if (f.question) return true;
  const last = daysIn(y, m);
  if (f.values.includes(d)) return true;
  if (f.last?.some((off) => d === last - off)) return true;
  if (f.lastWeekday) {
    let ld = last;
    while (weekday(y, m, ld) === 0 || weekday(y, m, ld) === 6) ld--;
    if (d === ld) return true;
  }
  if (f.nearestWeekday)
    for (const n of f.nearestWeekday) {
      if (n > last) continue;
      const wd = weekday(y, m, n);
      let t = n;
      if (wd === 6) t = n === 1 ? 3 : n - 1; // Saturday → Friday (or Monday when the 1st)
      else if (wd === 0) t = n === last ? n - 2 : n + 1; // Sunday → Monday (or Friday at month end)
      if (d === t) return true;
    }
  return false;
}

function dowMatch(f: Field, y: number, m: number, d: number): boolean {
  if (f.question) return true;
  const wd = weekday(y, m, d);
  if (f.values.includes(wd)) return true;
  if (f.nth?.some(([w, k]) => w === wd && Math.ceil(d / 7) === k)) return true;
  if (f.lastDow?.some((w) => w === wd && d + 7 > daysIn(y, m))) return true;
  return false;
}

function dayMatches(c: Cron, y: number, m: number, d: number): boolean {
  const { dom, dow } = c.fields;
  const domRestricted = !(dom.star || dom.question);
  const dowRestricted = !(dow.star || dow.question);
  if (c.dialect !== "unix") return domMatch(dom, y, m, d) && dowMatch(dow, y, m, d);
  // Vixie cron: when either field starts with "*" both must match; otherwise either may match.
  if (!domRestricted || !dowRestricted) return domMatch(dom, y, m, d) && dowMatch(dow, y, m, d);
  return domMatch(dom, y, m, d) || dowMatch(dow, y, m, d);
}

/* ── time zones ─────────────────────────────────────────────────────── */

const fmts = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string) {
  let f = fmts.get(tz);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" });
    } catch {
      throw new ToolError(`Unknown time zone "${tz}". Use an IANA name such as Europe/London or America/New_York.`);
    }
    fmts.set(tz, f);
  }
  return f;
}

export function wallParts(tz: string, ms: number): [number, number, number, number, number, number] {
  const p: Record<string, number> = {};
  for (const x of fmt(tz).formatToParts(new Date(ms))) if (x.type !== "literal") p[x.type] = Number(x.value);
  return [p.year, p.month, p.day, p.hour === 24 ? 0 : p.hour, p.minute, p.second];
}

function offsetAt(tz: string, ms: number): number {
  const [y, mo, d, h, mi, s] = wallParts(tz, ms);
  return Date.UTC(y, mo - 1, d, h, mi, s) - Math.floor(ms / 1000) * 1000;
}

/** Wall-clock time in tz → epoch ms; null when the time does not exist (DST gap). */
export function wallToUtc(tz: string, y: number, mo: number, d: number, h: number, mi: number, s: number): number | null {
  const wall = Date.UTC(y, mo - 1, d, h, mi, s);
  let g = wall - offsetAt(tz, wall);
  g = wall - offsetAt(tz, g);
  const back = wallParts(tz, g);
  if (Date.UTC(back[0], back[1] - 1, back[2], back[3], back[4], back[5]) !== wall) return null;
  return g;
}

export function localZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** The next `count` run times strictly after `from` (epoch ms). */
export function nextRuns(c: Cron, tz: string, from: number, count: number): { times: number[]; skipped: number } {
  const out: number[] = [];
  let skipped = 0;
  const [sy, smo, sd, sh, smi, ss] = wallParts(tz, from);
  const startWall = Date.UTC(sy, smo - 1, sd, sh, smi, ss);
  const F = c.fields;
  const years = F.year.values.length ? F.year.values.filter((y) => y >= sy) : Array.from({ length: 30 }, (_, i) => sy + i);
  const secs = F.second.values, mins = F.minute.values, hours = F.hour.values;
  for (const y of years) {
    for (const m of F.month.values) {
      if (y === sy && m < smo) continue;
      const nd = daysIn(y, m);
      for (let d = y === sy && m === smo ? sd : 1; d <= nd; d++) {
        if (!dayMatches(c, y, m, d)) continue;
        const today = y === sy && m === smo && d === sd;
        for (const h of hours) {
          if (today && h < sh) continue;
          for (const mi of mins) {
            if (today && h === sh && mi < smi) continue;
            for (const s of secs) {
              const wall = Date.UTC(y, m - 1, d, h, mi, s);
              if (wall <= startWall) continue;
              const t = wallToUtc(tz, y, m, d, h, mi, s);
              if (t === null) {
                skipped++;
                continue;
              }
              if (t <= from) continue;
              out.push(t);
              if (out.length >= count) return { times: out, skipped };
            }
          }
        }
      }
    }
  }
  return { times: out, skipped };
}

/* ── description helpers ────────────────────────────────────────────── */

function listWords(xs: string[]): string {
  if (xs.length <= 1) return xs.join("");
  return xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1];
}

const ord = (n: number) => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th");

/** Plain explanation of one field, independent of cronstrue. */
export function explainField(f: Field): string {
  const info = FIELD_INFO[f.key];
  if (f.question) return "no specific value (?) — the other day field decides";
  if (f.text === "*") return `every ${info.label.toLowerCase()}`;
  const bits: string[] = [];
  const vals = f.values;
  const fmtV = (v: number) => (f.key === "dow" ? DAY_LONG[v] : f.key === "month" ? MONTH_LONG[v - 1] : f.key === "dom" ? ord(v) : String(v));
  if (vals.length) {
    const step = /\/(\d+)$/.exec(f.text);
    if (step && vals.length > 2) bits.push(`every ${step[1]} ${info.label.toLowerCase()}${+step[1] > 1 ? "s" : ""} (${vals.slice(0, 8).map(fmtV).join(", ")}${vals.length > 8 ? ", …" : ""})`);
    else bits.push(listWords(vals.slice(0, 12).map(fmtV)) + (vals.length > 12 ? ` … (${vals.length} values)` : ""));
  }
  f.last?.forEach((o) => bits.push(o ? `${o} day${o > 1 ? "s" : ""} before the last day of the month` : "the last day of the month"));
  if (f.lastWeekday) bits.push("the last weekday (Mon–Fri) of the month");
  f.nearestWeekday?.forEach((d) => bits.push(`the weekday nearest the ${ord(d)}`));
  f.nth?.forEach(([w, k]) => bits.push(`the ${ord(k)} ${DAY_LONG[w]} of the month`));
  f.lastDow?.forEach((w) => bits.push(`the last ${DAY_LONG[w]} of the month`));
  return listWords(bits);
}

/* ── dialect conversion ─────────────────────────────────────────────── */

// Renumber day-of-week digits (not step or # counts): Unix 0/7=SUN … 6=SAT ↔ Quartz 1=SUN … 7=SAT
const quartzDowText = (t: string) => t.replace(/(^|[^#/\d])(\d)(?!\d)/g, (_m, p, d) => p + String((+d % 7) + 1));
const unixDowText = (t: string) => t.replace(/(^|[^#/\d])(\d)(?!\d)/g, (_m, p, d) => p + String((+d + 6) % 7));

export type Conversions = { unix: string; quartz: string; aws: string; warnings: Record<string, string[]> };

export function convertCron(c: Cron): Conversions {
  const F = c.fields;
  const w: Record<string, string[]> = { unix: [], quartz: [], aws: [], github: [], systemd: [], k8s: [] };
  // canonical texts in Unix numbering
  let dom = F.dom.text, dow = F.dow.text;
  if (c.dialect !== "unix") {
    dow = F.dow.question ? "*" : unixDowText(dow);
    if (F.dom.question) dom = "*";
  }
  if (c.hasSeconds && F.second.text !== "0") w.unix.push(`Seconds (${F.second.text}) cannot be expressed in 5-field cron and were dropped.`);
  if (c.hasYear && !F.year.star) w.unix.push(`The year restriction (${F.year.text}) was dropped — Unix cron has no year field.`);
  if (/[LW#]/.test(dom + dow.replace(/WED|SAT|JUL/gi, ""))) w.unix.push("L, W and # are Quartz extensions — Vixie cron and GitHub Actions reject them.");
  const unix = `${F.minute.text} ${F.hour.text} ${dom} ${F.month.text} ${dow}`;
  // Quartz: sec min hour dom mon dow [year] with ? in one day field
  let qDom = F.dom.question ? "?" : dom, qDow = F.dow.question ? "?" : c.dialect === "unix" ? quartzDowText(F.dow.text) : F.dow.text;
  const domR = !(F.dom.star || F.dom.question), dowR = !(F.dow.star || F.dow.question);
  if (c.dialect === "unix") {
    if (!dowR) qDow = "?";
    else if (!domR) qDom = "?";
    else {
      qDow = "?";
      w.quartz.push("Quartz cannot OR day-of-month with day-of-week; the day-of-week part was dropped.");
      w.aws.push("EventBridge cannot OR day-of-month with day-of-week; the day-of-week part was dropped.");
    }
  }
  const quartz = `${c.hasSeconds ? F.second.text : "0"} ${F.minute.text} ${F.hour.text} ${qDom} ${F.month.text} ${qDow}${c.hasYear ? " " + F.year.text : ""}`;
  if (c.hasSeconds && F.second.text !== "0") w.aws.push("EventBridge has minute resolution — seconds were dropped.");
  const aws = `cron(${F.minute.text} ${F.hour.text} ${qDom} ${F.month.text} ${qDow} ${c.hasYear ? F.year.text : "*"})`;
  return { unix, quartz, aws, warnings: w };
}

function compact(values: number[], all: number[], fmtV: (n: number) => string, startsAt: number): string {
  if (values.length === all.length) return "*";
  if (values.length > 2) {
    const step = values[1] - values[0];
    const isProg = values.every((v, i) => i === 0 || v - values[i - 1] === step);
    if (isProg && step > 1 && values[values.length - 1] + step > all[all.length - 1] && values[0] < startsAt + step) return `${fmtV(values[0])}/${step}`;
  }
  const out: string[] = [];
  for (let i = 0; i < values.length; ) {
    let j = i;
    while (j + 1 < values.length && values[j + 1] === values[j] + 1) j++;
    out.push(j - i >= 2 ? `${fmtV(values[i])}..${fmtV(values[j])}` : j > i ? `${fmtV(values[i])},${fmtV(values[j])}` : fmtV(values[i]));
    i = j + 1;
  }
  return out.join(",");
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** systemd OnCalendar= (best effort). */
export function toSystemd(c: Cron, tz: string): { text: string; warnings: string[] } {
  const F = c.fields;
  const warnings: string[] = [];
  const DS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  let dowPart = "";
  const dowR = !(F.dow.star || F.dow.question), domR = !(F.dom.star || F.dom.question);
  if (dowR) {
    if (F.dow.nth || F.dow.lastDow) warnings.push("Nth / last weekday (#, L) has no systemd equivalent — approximated by the weekday alone.");
    const vals = [...new Set([...F.dow.values, ...(F.dow.nth ?? []).map((x) => x[0]), ...(F.dow.lastDow ?? [])])].sort();
    // systemd weeks start on Monday; print Mon..Sun order
    const order = [1, 2, 3, 4, 5, 6, 0].filter((d) => vals.includes(d));
    const runs: string[] = [];
    for (let i = 0; i < order.length; ) {
      let j = i;
      while (j + 1 < order.length && [1, 2, 3, 4, 5, 6, 0].indexOf(order[j + 1]) === [1, 2, 3, 4, 5, 6, 0].indexOf(order[j]) + 1) j++;
      runs.push(j - i >= 2 ? `${DS[order[i]]}..${DS[order[j]]}` : order.slice(i, j + 1).map((d) => DS[d]).join(","));
      i = j + 1;
    }
    dowPart = runs.join(",") + " ";
  }
  if (dowR && domR && c.dialect === "unix") warnings.push("systemd ANDs the weekday with the date, while cron ORs day-of-month with day-of-week.");
  let day: string;
  if (F.dom.last?.length || F.dom.lastWeekday) {
    day = "~" + pad2((F.dom.last?.[0] ?? 0) + 1);
    if (F.dom.lastWeekday) warnings.push("LW (last weekday) approximated as the last day.");
  } else if (F.dom.nearestWeekday) {
    day = F.dom.nearestWeekday.map(pad2).join(",");
    warnings.push("W (nearest weekday) has no systemd equivalent — the plain day is used.");
  } else day = domR ? compact(F.dom.values, range(1, 31), pad2, 1) : "*";
  const month = compact(F.month.values, range(1, 12), pad2, 1);
  const year = F.year.star || !F.year.values.length ? "*" : compact(F.year.values, F.year.values, String, F.year.values[0]);
  const hour = compact(F.hour.values, range(0, 23), pad2, 0);
  const minute = compact(F.minute.values, range(0, 59), pad2, 0);
  const second = compact(F.second.values, range(0, 59), pad2, 0);
  const zone = tz && tz !== "UTC" ? ` ${tz}` : tz === "UTC" ? " UTC" : "";
  return { text: `${dowPart}${year}-${month}-${day} ${hour}:${minute}:${second}${zone}`, warnings };
}

/* ── editor helpers (shared with the UI) ────────────────────────────── */

export type EditorMode = "every" | "step" | "specific" | "range" | "custom";
export type EditorState = { mode: EditorMode; start: number; step: number; from: number; to: number; picks: number[] };

export function fieldEditorState(key: FieldKey, text: string, quartz: boolean): EditorState {
  const info = FIELD_INFO[key];
  const lo = key === "dow" ? 0 : info.min;
  const base: EditorState = { mode: "custom", start: lo, step: 1, from: lo, to: key === "dow" ? 6 : info.max, picks: [] };
  const T = text.toUpperCase();
  if (T === "*" || T === "?") return { ...base, mode: "every" };
  const toNum = (s: string) => {
    try {
      return nameValue(s, key, quartz);
    } catch {
      return NaN;
    }
  };
  let m = /^(\*|[A-Z0-9]+)\/(\d+)$/.exec(T);
  if (m) {
    const st = m[1] === "*" ? lo : toNum(m[1]);
    if (!Number.isNaN(st)) return { ...base, mode: "step", start: st, step: +m[2] };
  }
  m = /^([A-Z0-9]+)-([A-Z0-9]+)$/.exec(T);
  if (m) {
    const a = toNum(m[1]), b = toNum(m[2]);
    if (!Number.isNaN(a) && !Number.isNaN(b)) return { ...base, mode: "range", from: a, to: b };
  }
  if (/^[A-Z0-9]+(,[A-Z0-9]+)*$/.test(T)) {
    const picks = T.split(",").map(toNum);
    if (picks.every((x) => !Number.isNaN(x))) return { ...base, mode: "specific", picks: [...new Set(picks)].sort((a, b) => a - b) };
  }
  return base;
}

export function fieldFromEditor(key: FieldKey, s: EditorState, quartz: boolean): string {
  const v = (n: number) => (key === "dow" ? (quartz ? String(n + 1) : String(n)) : String(n));
  switch (s.mode) {
    case "every":
      return quartz && key === "dow" ? "?" : "*";
    case "step":
      return `${s.start === (key === "dow" ? 0 : FIELD_INFO[key].min) ? "*" : v(s.start)}/${Math.max(1, s.step)}`;
    case "range":
      return `${v(s.from)}-${v(s.to)}`;
    case "specific":
      return s.picks.length ? s.picks.map(v).join(",") : quartz && (key === "dom" || key === "dow") ? "?" : "*";
    default:
      return "*";
  }
}

export const PRESETS: [string, string][] = [
  ["Every minute", "* * * * *"],
  ["Every 5 minutes", "*/5 * * * *"],
  ["Every 15 min, business hours", "*/15 9-17 * * MON-FRI"],
  ["Hourly", "0 * * * *"],
  ["Daily at 02:00", "0 2 * * *"],
  ["Weekdays at 09:00", "0 9 * * 1-5"],
  ["Weekly, Monday 08:00", "0 8 * * MON"],
  ["Monthly, 1st at midnight", "0 0 1 * *"],
  ["Quarterly", "0 0 1 1,4,7,10 *"],
  ["Yearly", "@yearly"],
  ["Last day of month (Quartz)", "0 0 18 L * ?"],
  ["Every 30 seconds", "*/30 * * * * *"],
];

export const COMMON_ZONES = [
  "UTC", "Europe/London", "Europe/Berlin", "Europe/Paris", "Europe/Madrid", "Europe/Istanbul", "Europe/Moscow", "Africa/Cairo", "Africa/Johannesburg", "Africa/Lagos",
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Anchorage", "America/Toronto", "America/Mexico_City", "America/Sao_Paulo", "America/Argentina/Buenos_Aires",
  "Asia/Dubai", "Asia/Kolkata", "Asia/Dhaka", "Asia/Bangkok", "Asia/Singapore", "Asia/Shanghai", "Asia/Hong_Kong", "Asia/Tokyo", "Asia/Seoul",
  "Australia/Sydney", "Australia/Perth", "Pacific/Auckland", "Pacific/Honolulu",
];

export { DAY_LONG, MONTH_LONG };
