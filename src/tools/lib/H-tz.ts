/**
 * Time-zone helpers on top of Intl (no tz database of our own): offsets,
 * abbreviations, DST state and transitions, and wall-clock ↔ UTC conversion.
 */

export type Parts = { y: number; mo: number; d: number; h: number; mi: number; s: number; wd: number };

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function dtf(zone: string): Intl.DateTimeFormat {
  let f = dtfCache.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", weekday: "short" });
    dtfCache.set(zone, f);
  }
  return f;
}

const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function partsIn(zone: string, t: number): Parts {
  const p: Record<string, string> = {};
  for (const x of dtf(zone).formatToParts(new Date(t))) p[x.type] = x.value;
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second, wd: WD[p.weekday] ?? 0 };
}

/** Minutes east of UTC at instant t. */
export function offsetMin(zone: string, t: number): number {
  const p = partsIn(zone, t);
  const asUtc = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
  return Math.round((asUtc - Math.floor(t / 1000) * 1000) / 60000);
}

/** The instant when the wall clock in `zone` reads the given time (first match in overlaps, shifted forward in gaps). */
export function zonedToUtc(zone: string, y: number, mo: number, d: number, h: number, mi: number, s = 0): number {
  const wall = Date.UTC(y, mo - 1, d, h, mi, s);
  const o1 = offsetMin(zone, wall);
  let t = wall - o1 * 60000;
  const o2 = offsetMin(zone, t);
  t = wall - o2 * 60000;
  const pt = partsIn(zone, t);
  // In a spring-forward gap the wall time does not exist: move forward by the gap (02:30 → 03:30).
  if (Date.UTC(pt.y, pt.mo - 1, pt.d, pt.h, pt.mi, pt.s) !== wall) return wall - Math.min(o1, o2) * 60000;
  // In an overlap prefer the earlier (DST) instant.
  const earlier = t - 3600000;
  const pe = partsIn(zone, earlier);
  if (Date.UTC(pe.y, pe.mo - 1, pe.d, pe.h, pe.mi, pe.s) === wall) return earlier;
  return t;
}

export function isValidZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

export function localZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function allZones(): string[] {
  const I = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
  try {
    const z = I.supportedValuesOf?.("timeZone");
    if (z?.length) return z.includes("UTC") ? z : ["UTC", ...z];
  } catch {
    /* older engines */
  }
  return Object.values(ALIASES).filter((v, i, a) => a.indexOf(v) === i).sort();
}

export function fmtOffset(min: number): string {
  const s = min < 0 ? "−" : "+";
  const a = Math.abs(min);
  return `UTC${s}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
}

/** A short abbreviation: tries several English locales to find a letter code (PDT, BST, IST, AEST…). */
export function abbr(zone: string, t: number): string {
  let fallback = "";
  for (const loc of ["en-US", "en-GB", "en-IN", "en-AU", "en-NZ", "en-CA", "en-ZA", "en-SG", "en-IE"]) {
    try {
      const n = new Intl.DateTimeFormat(loc, { timeZone: zone, timeZoneName: "short" }).formatToParts(new Date(t)).find((p) => p.type === "timeZoneName")?.value ?? "";
      if (!fallback) fallback = n;
      if (n && !/^(GMT|UTC)[+−-]/.test(n)) return n;
    } catch {
      /* locale not available */
    }
  }
  return KNOWN_ABBR[zone]?.[dstInfo(zone, t).active ? 1 : 0] ?? fallback.replace("GMT", "UTC");
}

/** Common abbreviations Intl only prints as GMT±x in English locales. [standard, daylight] */
const KNOWN_ABBR: Record<string, [string, string]> = {
  "Asia/Tokyo": ["JST", "JDT"], "Asia/Seoul": ["KST", "KDT"], "Asia/Shanghai": ["CST", "CDT"], "Asia/Taipei": ["CST", "CDT"], "Asia/Hong_Kong": ["HKT", "HKST"],
  "Asia/Singapore": ["SGT", "SGT"], "Asia/Kuala_Lumpur": ["MYT", "MYT"], "Asia/Manila": ["PHT", "PHT"], "Asia/Jakarta": ["WIB", "WIB"], "Asia/Bangkok": ["ICT", "ICT"], "Asia/Ho_Chi_Minh": ["ICT", "ICT"],
  "Asia/Kathmandu": ["NPT", "NPT"], "Asia/Katmandu": ["NPT", "NPT"], "Asia/Dhaka": ["BST", "BST"], "Asia/Karachi": ["PKT", "PKT"], "Asia/Dubai": ["GST", "GST"], "Asia/Tehran": ["IRST", "IRDT"],
  "Asia/Colombo": ["SLST", "SLST"], "Asia/Yangon": ["MMT", "MMT"], "Asia/Riyadh": ["AST", "AST"], "Europe/Moscow": ["MSK", "MSK"], "Europe/Istanbul": ["TRT", "TRT"],
  "America/Sao_Paulo": ["BRT", "BRST"], "America/Argentina/Buenos_Aires": ["ART", "ART"], "America/Bogota": ["COT", "COT"], "America/Lima": ["PET", "PET"], "America/Santiago": ["CLT", "CLST"],
  "Pacific/Fiji": ["FJT", "FJST"], "Pacific/Kiritimati": ["LINT", "LINT"], "Africa/Nairobi": ["EAT", "EAT"], "Africa/Lagos": ["WAT", "WAT"], "Africa/Johannesburg": ["SAST", "SAST"],
};

export function longName(zone: string, t: number): string {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "long" }).formatToParts(new Date(t)).find((p) => p.type === "timeZoneName")?.value ?? zone;
  } catch {
    return zone;
  }
}

/** Standard offset = the smaller of January and July offsets; DST is anything above it. */
export function dstInfo(zone: string, t: number): { observes: boolean; active: boolean; std: number; dst: number } {
  const y = new Date(t).getUTCFullYear();
  const jan = offsetMin(zone, Date.UTC(y, 0, 1)), jul = offsetMin(zone, Date.UTC(y, 6, 1));
  const std = Math.min(jan, jul), dst = Math.max(jan, jul);
  const now = offsetMin(zone, t);
  return { observes: jan !== jul, active: jan !== jul && now === dst, std, dst };
}

/** Scan forward (day steps, then bisection) for the next offset change. */
export function nextTransition(zone: string, from: number, days = 400): { at: number; before: number; after: number } | null {
  const start = offsetMin(zone, from);
  let lo = from;
  const DAY = 86400000;
  for (let i = 1; i <= days; i++) {
    const t = from + i * DAY;
    if (offsetMin(zone, t) !== start) {
      let a = lo, b = t;
      while (b - a > 60000) {
        const m = Math.floor((a + b) / 2 / 60000) * 60000;
        if (offsetMin(zone, m) === start) a = m;
        else b = m;
      }
      return { at: b, before: start, after: offsetMin(zone, b) };
    }
    lo = t;
  }
  return null;
}

/** "Asia/Kolkata" → "Kolkata", "America/Argentina/Buenos_Aires" → "Buenos Aires". */
export function cityOf(zone: string): string {
  if (zone === "UTC" || zone === "Etc/UTC") return "UTC";
  return zone.split("/").pop()!.replace(/_/g, " ");
}

export const ALIASES: Record<string, string> = {
  utc: "UTC", gmt: "UTC", zulu: "UTC", z: "UTC",
  "san francisco": "America/Los_Angeles", sf: "America/Los_Angeles", "los angeles": "America/Los_Angeles", la: "America/Los_Angeles", seattle: "America/Los_Angeles", portland: "America/Los_Angeles", vancouver: "America/Vancouver", "silicon valley": "America/Los_Angeles",
  pst: "America/Los_Angeles", pdt: "America/Los_Angeles", pt: "America/Los_Angeles",
  denver: "America/Denver", mst: "America/Denver", mdt: "America/Denver", phoenix: "America/Phoenix",
  chicago: "America/Chicago", austin: "America/Chicago", dallas: "America/Chicago", houston: "America/Chicago", cst: "America/Chicago", cdt: "America/Chicago",
  "new york": "America/New_York", nyc: "America/New_York", boston: "America/New_York", miami: "America/New_York", atlanta: "America/New_York", washington: "America/New_York", est: "America/New_York", edt: "America/New_York", et: "America/New_York",
  toronto: "America/Toronto", montreal: "America/Toronto", "mexico city": "America/Mexico_City", "st johns": "America/St_Johns", "st. john's": "America/St_Johns", newfoundland: "America/St_Johns",
  "sao paulo": "America/Sao_Paulo", "são paulo": "America/Sao_Paulo", "buenos aires": "America/Argentina/Buenos_Aires", bogota: "America/Bogota", lima: "America/Lima", santiago: "America/Santiago",
  honolulu: "Pacific/Honolulu", hawaii: "Pacific/Honolulu", hst: "Pacific/Honolulu", anchorage: "America/Anchorage", alaska: "America/Anchorage",
  london: "Europe/London", uk: "Europe/London", bst: "Europe/London", dublin: "Europe/Dublin", lisbon: "Europe/Lisbon", reykjavik: "Atlantic/Reykjavik",
  paris: "Europe/Paris", berlin: "Europe/Berlin", amsterdam: "Europe/Amsterdam", madrid: "Europe/Madrid", rome: "Europe/Rome", zurich: "Europe/Zurich", vienna: "Europe/Vienna", stockholm: "Europe/Stockholm", oslo: "Europe/Oslo", copenhagen: "Europe/Copenhagen", brussels: "Europe/Brussels", prague: "Europe/Prague", warsaw: "Europe/Warsaw", cet: "Europe/Paris", cest: "Europe/Paris",
  athens: "Europe/Athens", helsinki: "Europe/Helsinki", kyiv: "Europe/Kyiv", kiev: "Europe/Kyiv", istanbul: "Europe/Istanbul", moscow: "Europe/Moscow", eet: "Europe/Athens", msk: "Europe/Moscow",
  cairo: "Africa/Cairo", lagos: "Africa/Lagos", nairobi: "Africa/Nairobi", johannesburg: "Africa/Johannesburg", "cape town": "Africa/Johannesburg", casablanca: "Africa/Casablanca",
  dubai: "Asia/Dubai", "abu dhabi": "Asia/Dubai", tehran: "Asia/Tehran", "tel aviv": "Asia/Jerusalem", jerusalem: "Asia/Jerusalem", riyadh: "Asia/Riyadh", karachi: "Asia/Karachi",
  bangalore: "Asia/Kolkata", bengaluru: "Asia/Kolkata", mumbai: "Asia/Kolkata", delhi: "Asia/Kolkata", "new delhi": "Asia/Kolkata", chennai: "Asia/Kolkata", hyderabad: "Asia/Kolkata", pune: "Asia/Kolkata", kolkata: "Asia/Kolkata", india: "Asia/Kolkata", ist: "Asia/Kolkata",
  kathmandu: "Asia/Kathmandu", nepal: "Asia/Kathmandu", dhaka: "Asia/Dhaka", colombo: "Asia/Colombo", yangon: "Asia/Yangon",
  bangkok: "Asia/Bangkok", hanoi: "Asia/Bangkok", "ho chi minh": "Asia/Ho_Chi_Minh", jakarta: "Asia/Jakarta", singapore: "Asia/Singapore", sgt: "Asia/Singapore", "kuala lumpur": "Asia/Kuala_Lumpur", manila: "Asia/Manila",
  "hong kong": "Asia/Hong_Kong", hkt: "Asia/Hong_Kong", shanghai: "Asia/Shanghai", beijing: "Asia/Shanghai", shenzhen: "Asia/Shanghai", china: "Asia/Shanghai", taipei: "Asia/Taipei",
  seoul: "Asia/Seoul", kst: "Asia/Seoul", tokyo: "Asia/Tokyo", osaka: "Asia/Tokyo", japan: "Asia/Tokyo", jst: "Asia/Tokyo",
  perth: "Australia/Perth", adelaide: "Australia/Adelaide", darwin: "Australia/Darwin", brisbane: "Australia/Brisbane", sydney: "Australia/Sydney", melbourne: "Australia/Melbourne", canberra: "Australia/Sydney", aest: "Australia/Sydney", aedt: "Australia/Sydney", acst: "Australia/Adelaide",
  auckland: "Pacific/Auckland", wellington: "Pacific/Auckland", nz: "Pacific/Auckland", nzst: "Pacific/Auckland", chatham: "Pacific/Chatham", fiji: "Pacific/Fiji", kiritimati: "Pacific/Kiritimati",
};

/** Resolve a user-typed zone: IANA name (any case), city, abbreviation, "local", or a fixed offset like UTC+5:30. */
export function resolveZone(q: string, zones?: string[]): string | null {
  const s = q.trim();
  if (!s) return null;
  if (/^local$/i.test(s)) return localZone();
  const lower = s.toLowerCase();
  if (ALIASES[lower]) return ALIASES[lower];
  const fixed = /^(?:utc|gmt)\s*([+-−])\s*(\d{1,2})(?::?(\d{2}))?$/i.exec(s);
  if (fixed) {
    const h = +fixed[2], m = +(fixed[3] ?? 0);
    if (m === 0) {
      // Etc/GMT signs are inverted: Etc/GMT-5 is UTC+5.
      const z = `Etc/GMT${fixed[1] === "+" ? "-" : "+"}${h}`;
      if (isValidZone(z)) return z;
    }
    const off = (fixed[1] === "+" ? 1 : -1) * (h * 60 + m);
    const hit = (zones ?? allZones()).find((z) => offsetMin(z, Date.now()) === off);
    return hit ?? null;
  }
  const list = zones ?? allZones();
  const exact = list.find((z) => z.toLowerCase() === lower);
  if (exact) return exact;
  const byCity = list.find((z) => cityOf(z).toLowerCase() === lower || z.toLowerCase().endsWith("/" + lower.replace(/ /g, "_")));
  if (byCity) return byCity;
  if (isValidZone(s)) return s;
  return null;
}

/** Search for the zone picker: aliases and IANA names, best matches first. */
export function searchZones(q: string, zones: string[], limit = 12): { zone: string; label: string }[] {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  const out: { zone: string; label: string; score: number }[] = [];
  const seen = new Set<string>();
  for (const [k, z] of Object.entries(ALIASES)) {
    if (k.length < 3 && k !== s) continue;
    const i = k.indexOf(s);
    if (i >= 0) out.push({ zone: z, label: `${k.replace(/\b\w/g, (c) => c.toUpperCase())} → ${z}`, score: i === 0 ? (k === s ? 0 : 0.5) : 3 });
  }
  for (const z of zones) {
    const zl = z.toLowerCase().replace(/_/g, " ");
    const i = zl.indexOf(s);
    if (i >= 0) out.push({ zone: z, label: z, score: cityOf(z).toLowerCase().startsWith(s) ? 1 : i === 0 ? 2 : 4 });
  }
  out.sort((a, b) => a.score - b.score || a.label.length - b.label.length);
  const res: { zone: string; label: string }[] = [];
  for (const o of out) {
    const key = o.zone + "|" + o.label;
    if (seen.has(o.zone) && o.label !== o.zone) continue;
    if (seen.has(key)) continue;
    seen.add(o.zone);
    seen.add(key);
    res.push({ zone: o.zone, label: o.label });
    if (res.length >= limit) break;
  }
  return res;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const pad2 = (n: number) => String(n).padStart(2, "0");

export function fmtTime(p: Parts, h12: boolean, secs = false): string {
  const s = secs ? ":" + pad2(p.s) : "";
  if (!h12) return `${pad2(p.h)}:${pad2(p.mi)}${s}`;
  const h = p.h % 12 || 12;
  return `${h}:${pad2(p.mi)}${s} ${p.h < 12 ? "AM" : "PM"}`;
}
export const fmtDate = (p: Parts) => `${DAYS[p.wd]} ${p.d} ${MONTHS[p.mo - 1]} ${p.y}`;
export const fmtDateShort = (p: Parts) => `${DAYS[p.wd]} ${p.d} ${MONTHS[p.mo - 1]}`;

/** Day difference between two wall dates (for "+1 day" labels). */
export function dayDelta(a: Parts, b: Parts): number {
  return Math.round((Date.UTC(b.y, b.mo - 1, b.d) - Date.UTC(a.y, a.mo - 1, a.d)) / 86400000);
}

/**
 * Parse a reference time. "now"/empty → now. A value with Z or an offset is absolute;
 * otherwise it is a wall-clock time in `zone`. Accepts "2026-09-24T09:00", "2026-09-24 9:30",
 * "09:00" (today in zone), or epoch seconds/milliseconds.
 */
export function parseRefTime(s: string, zone: string, now = Date.now()): number | null {
  const v = s.trim();
  if (!v || /^now$/i.test(v)) return now;
  if (/^\d{10}$/.test(v)) return +v * 1000;
  if (/^\d{13}$/.test(v)) return +v;
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(v) && /\d{4}-\d{2}-\d{2}T/.test(v)) {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : t;
  }
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s]+(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(am|pm)?)?$/i.exec(v);
  if (m) {
    let h = +(m[4] ?? 0);
    if (m[7]) h = (h % 12) + (/pm/i.test(m[7]) ? 12 : 0);
    return zonedToUtc(zone, +m[1], +m[2], +m[3], h, +(m[5] ?? 0), +(m[6] ?? 0));
  }
  m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(v);
  if (m && (m[2] || m[3])) {
    let h = +m[1];
    if (m[3]) h = (h % 12) + (/pm/i.test(m[3]) ? 12 : 0);
    const p = partsIn(zone, now);
    return zonedToUtc(zone, p.y, p.mo, p.d, h, +(m[2] ?? 0));
  }
  return null;
}

/** Wall-clock string for <input type="datetime-local">. */
export function toLocalInput(zone: string, t: number): string {
  const p = partsIn(zone, t);
  return `${p.y}-${pad2(p.mo)}-${pad2(p.d)}T${pad2(p.h)}:${pad2(p.mi)}`;
}

/**
 * Working-hours overlap over the 24 hours starting at `dayStart`, in 15-minute steps.
 * Returns UTC intervals where every zone's local time is within [start, end).
 */
export function overlapIntervals(zones: string[], dayStart: number, start: number, end: number): [number, number][] {
  const STEP = 15 * 60000;
  const out: [number, number][] = [];
  let cur: number | null = null;
  for (let t = dayStart; t <= dayStart + 86400000; t += STEP) {
    const ok = t < dayStart + 86400000 && zones.every((z) => {
      const p = partsIn(z, t);
      const hm = p.h + p.mi / 60;
      const wd = p.wd;
      return wd >= 1 && wd <= 5 ? (start <= end ? hm >= start && hm < end : hm >= start || hm < end) : false;
    });
    if (ok && cur === null) cur = t;
    if (!ok && cur !== null) {
      out.push([cur, t]);
      cur = null;
    }
  }
  return out;
}

/**
 * When there is no full overlap: rank the hours of the day by how far outside
 * working hours they fall across all zones (0 = everyone inside).
 */
export function bestSlots(zones: string[], dayStart: number, start: number, end: number, n = 3): { t: number; penalty: number; outside: string[] }[] {
  const res: { t: number; penalty: number; outside: string[] }[] = [];
  for (let k = 0; k < 48; k++) {
    const t = dayStart + k * 30 * 60000;
    let pen = 0;
    const outside: string[] = [];
    for (const z of zones) {
      const p = partsIn(z, t);
      const hm = p.h + p.mi / 60;
      let dist = hm >= start && hm + 0.5 <= end ? 0 : Math.min(Math.abs(hm - start), Math.abs(hm + 0.5 - end), Math.abs(hm + 24 - start), Math.abs(hm - 24 + 0.5 - end));
      if (p.wd === 0 || p.wd === 6) dist += 6;
      if (dist > 0) outside.push(z);
      pen += dist * dist;
    }
    res.push({ t, penalty: Math.round(pen * 100) / 100, outside });
  }
  return res.sort((a, b) => a.penalty - b.penalty || a.t - b.t).slice(0, n);
}

/** "Sun 1 Nov 2026 02:00 → UTC−08:00 (−1h)": the wall time just before the change, as clocks show it. */
export function fmtTransition(nx: { at: number; before: number; after: number }, h12: boolean): string {
  const w = new Date(nx.at + nx.before * 60000);
  const p: Parts = { y: w.getUTCFullYear(), mo: w.getUTCMonth() + 1, d: w.getUTCDate(), h: w.getUTCHours(), mi: w.getUTCMinutes(), s: 0, wd: w.getUTCDay() };
  const dm = nx.after - nx.before;
  const delta = `${dm > 0 ? "+" : "−"}${Math.abs(dm) % 60 ? `${Math.floor(Math.abs(dm) / 60) ? Math.floor(Math.abs(dm) / 60) + "h" : ""}${Math.abs(dm) % 60}m` : Math.abs(dm) / 60 + "h"}`;
  return `${fmtDate(p)} ${fmtTime(p, h12)} → ${fmtOffset(nx.after)} (${delta})`;
}
