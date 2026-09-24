/**
 * QR payloads: compose Wi-Fi / vCard / mailto / SMS / tel / geo / VEVENT
 * strings from form fields, parse any payload back into fields, and render a
 * QR matrix as SVG or RGBA pixels (for round-trip verification with jsQR).
 */

export type QrType = "text" | "url" | "wifi" | "vcard" | "email" | "sms" | "phone" | "geo" | "event";

export const QR_TYPES: [QrType, string][] = [
  ["url", "URL"],
  ["text", "Text"],
  ["wifi", "Wi-Fi"],
  ["vcard", "vCard"],
  ["email", "Email"],
  ["sms", "SMS"],
  ["phone", "Phone"],
  ["geo", "Location"],
  ["event", "Event"],
];

export type QrForm = { type: QrType; f: Record<string, string> };

export const FORM_FIELDS: Record<QrType, { id: string; label: string; ph?: string; kind?: "text" | "area" | "select" | "check" | "datetime-local" | "date"; choices?: [string, string][]; wide?: boolean }[]> = {
  text: [],
  url: [],
  wifi: [
    { id: "ssid", label: "Network name (SSID)", ph: "HomeNetwork" },
    { id: "password", label: "Password", ph: "correct horse battery staple" },
    { id: "auth", label: "Security", kind: "select", choices: [["WPA", "WPA / WPA2 / WPA3"], ["WEP", "WEP"], ["nopass", "None (open)"]] },
    { id: "hidden", label: "Hidden network", kind: "check" },
  ],
  vcard: [
    { id: "first", label: "First name", ph: "Ada" },
    { id: "last", label: "Last name", ph: "Lovelace" },
    { id: "org", label: "Organisation", ph: "Analytical Engines Ltd" },
    { id: "title", label: "Job title", ph: "Lead Programmer" },
    { id: "mobile", label: "Mobile phone", ph: "+44 7700 900123" },
    { id: "work", label: "Work phone", ph: "+44 20 7946 0000" },
    { id: "email", label: "Email", ph: "ada@example.com" },
    { id: "url", label: "Website", ph: "https://example.com" },
    { id: "street", label: "Street", ph: "12 St James's Square" },
    { id: "city", label: "City", ph: "London" },
    { id: "region", label: "Region / state", ph: "" },
    { id: "zip", label: "Postcode", ph: "SW1Y 4JH" },
    { id: "country", label: "Country", ph: "United Kingdom" },
    { id: "note", label: "Note", kind: "area", wide: true },
  ],
  email: [
    { id: "to", label: "To", ph: "hello@example.com" },
    { id: "cc", label: "Cc", ph: "" },
    { id: "subject", label: "Subject", ph: "Hello from a QR code" },
    { id: "body", label: "Body", kind: "area", wide: true },
    { id: "style", label: "Format", kind: "select", choices: [["mailto", "mailto: URI"], ["matmsg", "MATMSG (Docomo)"]] },
  ],
  sms: [
    { id: "number", label: "Phone number", ph: "+15551234567" },
    { id: "message", label: "Message", kind: "area", wide: true },
    { id: "style", label: "Format", kind: "select", choices: [["smsto", "SMSTO: (widest support)"], ["sms", "sms: URI"]] },
  ],
  phone: [{ id: "number", label: "Phone number", ph: "+1 555 123 4567" }],
  geo: [
    { id: "lat", label: "Latitude", ph: "51.5007" },
    { id: "lng", label: "Longitude", ph: "-0.1246" },
    { id: "alt", label: "Altitude (m, optional)", ph: "" },
    { id: "q", label: "Label / query (optional)", ph: "Big Ben" },
  ],
  event: [
    { id: "summary", label: "Title", ph: "Team offsite" },
    { id: "start", label: "Starts", kind: "datetime-local" },
    { id: "end", label: "Ends", kind: "datetime-local" },
    { id: "allday", label: "All-day event", kind: "check" },
    { id: "utc", label: "Times are UTC", kind: "check" },
    { id: "location", label: "Location", ph: "Room 4.02" },
    { id: "description", label: "Description", kind: "area", wide: true },
  ],
};

/** Escape for WIFI: and MECARD-style payloads: \ ; , : " are backslash-escaped. */
const wesc = (s: string) => s.replace(/([\\;,:"])/g, "\\$1");
/** vCard / iCalendar text escaping. */
const vesc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([;,])/g, "\\$1");

function icsDate(v: string, allDay: boolean, utc: boolean): string {
  if (!v) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(v);
  if (!m) return v.replace(/[-:]/g, "");
  if (allDay) return `${m[1]}${m[2]}${m[3]}`;
  return `${m[1]}${m[2]}${m[3]}T${m[4] ?? "00"}${m[5] ?? "00"}${m[6] ?? "00"}${utc ? "Z" : ""}`;
}

export function composePayload(form: QrForm): string {
  const f = form.f;
  const v = (k: string) => (f[k] ?? "").trim();
  switch (form.type) {
    case "text":
    case "url":
      return f.text ?? "";
    case "wifi": {
      const auth = v("auth") || "WPA";
      return `WIFI:T:${auth};S:${wesc(v("ssid"))};${auth === "nopass" ? "" : `P:${wesc(f.password ?? "")};`}${v("hidden") === "true" ? "H:true;" : ""};`;
    }
    case "vcard": {
      const L = ["BEGIN:VCARD", "VERSION:3.0", `N:${vesc(v("last"))};${vesc(v("first"))};;;`, `FN:${vesc([v("first"), v("last")].filter(Boolean).join(" "))}`];
      if (v("org")) L.push(`ORG:${vesc(v("org"))}`);
      if (v("title")) L.push(`TITLE:${vesc(v("title"))}`);
      if (v("mobile")) L.push(`TEL;TYPE=CELL:${v("mobile")}`);
      if (v("work")) L.push(`TEL;TYPE=WORK,VOICE:${v("work")}`);
      if (v("email")) L.push(`EMAIL;TYPE=INTERNET:${v("email")}`);
      if (v("url")) L.push(`URL:${v("url")}`);
      if (v("street") || v("city") || v("zip") || v("country") || v("region")) L.push(`ADR;TYPE=WORK:;;${vesc(v("street"))};${vesc(v("city"))};${vesc(v("region"))};${vesc(v("zip"))};${vesc(v("country"))}`);
      if (v("note")) L.push(`NOTE:${vesc(v("note"))}`);
      L.push("END:VCARD");
      return L.join("\n");
    }
    case "email": {
      if (v("style") === "matmsg") return `MATMSG:TO:${wesc(v("to"))};SUB:${wesc(v("subject"))};BODY:${wesc(f.body ?? "")};;`;
      const q: string[] = [];
      if (v("cc")) q.push(`cc=${encodeURIComponent(v("cc"))}`);
      if (v("subject")) q.push(`subject=${encodeURIComponent(v("subject"))}`);
      if ((f.body ?? "").trim()) q.push(`body=${encodeURIComponent(f.body ?? "")}`);
      return `mailto:${v("to")}${q.length ? "?" + q.join("&") : ""}`;
    }
    case "sms": {
      const num = v("number").replace(/[\s()-]/g, "");
      if (v("style") === "sms") return `sms:${num}${(f.message ?? "").trim() ? `?body=${encodeURIComponent(f.message ?? "")}` : ""}`;
      return `SMSTO:${num}:${f.message ?? ""}`;
    }
    case "phone":
      return `tel:${v("number").replace(/[\s()-]/g, "")}`;
    case "geo":
      return `geo:${v("lat") || "0"},${v("lng") || "0"}${v("alt") ? "," + v("alt") : ""}${v("q") ? `?q=${encodeURIComponent(v("q"))}` : ""}`;
    case "event": {
      const all = v("allday") === "true", utc = v("utc") === "true";
      const L = ["BEGIN:VEVENT", `SUMMARY:${vesc(v("summary"))}`];
      const s = icsDate(v("start"), all, utc), e = icsDate(v("end"), all, utc);
      if (s) L.push(all ? `DTSTART;VALUE=DATE:${s}` : `DTSTART:${s}`);
      if (e) L.push(all ? `DTEND;VALUE=DATE:${e}` : `DTEND:${e}`);
      if (v("location")) L.push(`LOCATION:${vesc(v("location"))}`);
      if (v("description")) L.push(`DESCRIPTION:${vesc(v("description"))}`);
      L.push("END:VEVENT");
      return L.join("\n");
    }
  }
}

/* ── parsing any payload ────────────────────────────────────────────── */

export type Parsed = { type: string; qrType: QrType; fields: [string, string][]; form?: Record<string, string>; issues: string[] };

function splitEsc(s: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\" && i + 1 < s.length) { cur += s[++i]; continue; }
    if (s[i] === sep) { out.push(cur); cur = ""; continue; }
    cur += s[i];
  }
  out.push(cur);
  return out;
}

const unv = (s: string) => s.replace(/\\n/gi, "\n").replace(/\\([;,\\])/g, "$1");

function fromIcs(d: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(d.trim());
  if (!m) return d;
  return m[4] ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}` : `${m[1]}-${m[2]}-${m[3]}`;
}

export function parsePayload(p: string): Parsed {
  const issues: string[] = [];
  const t = p.trim();
  if (/^WIFI:/i.test(t)) {
    const body = t.slice(5).replace(/;;$/, ";");
    const kv: Record<string, string> = {};
    for (const part of splitEsc(body, ";")) {
      const i = part.indexOf(":");
      if (i > 0) kv[part.slice(0, i).toUpperCase()] = part.slice(i + 1);
    }
    if (!kv.S) issues.push("Missing S: (network name).");
    if (kv.T && kv.T !== "nopass" && !kv.P) issues.push("Security is set but there is no P: password.");
    return {
      type: "Wi-Fi network",
      qrType: "wifi",
      fields: [["SSID", kv.S ?? ""], ["Security", kv.T || "nopass"], ["Password", kv.P ?? ""], ["Hidden", kv.H === "true" ? "yes" : "no"]],
      form: { ssid: kv.S ?? "", password: kv.P ?? "", auth: kv.T === "WEP" ? "WEP" : kv.T === "nopass" || !kv.T ? "nopass" : "WPA", hidden: kv.H === "true" ? "true" : "" },
      issues,
    };
  }
  if (/^BEGIN:VCARD/i.test(t)) {
    const fields: [string, string][] = [];
    const form: Record<string, string> = {};
    for (const line of t.replace(/\r?\n[ \t]/g, "").split(/\r?\n/)) {
      const i = line.indexOf(":");
      if (i < 0) continue;
      const [prop, ...params] = line.slice(0, i).split(";");
      const val = line.slice(i + 1);
      const P = prop.toUpperCase();
      if (P === "BEGIN" || P === "END") continue;
      fields.push([P + (params.length ? ` (${params.join(";")})` : ""), unv(val)]);
      if (P === "N") {
        const [last, first] = splitEsc(val, ";");
        form.last = last ?? "";
        form.first = first ?? "";
      }
      if (P === "ORG") form.org = unv(val);
      if (P === "TITLE") form.title = unv(val);
      if (P === "TEL") form[/WORK/i.test(params.join()) ? "work" : "mobile"] = val;
      if (P === "EMAIL") form.email = val;
      if (P === "URL") form.url = val;
      if (P === "NOTE") form.note = unv(val);
      if (P === "ADR") {
        const a = splitEsc(val, ";");
        Object.assign(form, { street: a[2] ?? "", city: a[3] ?? "", region: a[4] ?? "", zip: a[5] ?? "", country: a[6] ?? "" });
      }
    }
    if (!/VERSION:/i.test(t)) issues.push("vCard has no VERSION line.");
    if (!/END:VCARD/i.test(t)) issues.push("vCard is missing END:VCARD.");
    return { type: "Contact (vCard)", qrType: "vcard", fields, form, issues };
  }
  if (/^MECARD:/i.test(t)) {
    const fields = splitEsc(t.slice(7), ";").filter(Boolean).map((x) => { const i = x.indexOf(":"); return [x.slice(0, i), x.slice(i + 1)] as [string, string]; });
    return { type: "Contact (MeCard)", qrType: "text", fields, issues };
  }
  if (/^BEGIN:(VEVENT|VCALENDAR)/i.test(t)) {
    const fields: [string, string][] = [];
    const form: Record<string, string> = {};
    for (const line of t.split(/\r?\n/)) {
      const i = line.indexOf(":");
      if (i < 0) continue;
      const [prop, ...params] = line.slice(0, i).split(";");
      const val = line.slice(i + 1);
      const P = prop.toUpperCase();
      if (P === "BEGIN" || P === "END" || P === "VERSION" || P === "PRODID") continue;
      fields.push([P, P.startsWith("DT") ? `${val} → ${fromIcs(val)}${val.endsWith("Z") ? " UTC" : ""}` : unv(val)]);
      if (P === "SUMMARY") form.summary = unv(val);
      if (P === "DTSTART") { form.start = fromIcs(val); form.allday = params.join().includes("DATE") && !params.join().includes("DATE-TIME") ? "true" : ""; form.utc = val.endsWith("Z") ? "true" : ""; }
      if (P === "DTEND") form.end = fromIcs(val);
      if (P === "LOCATION") form.location = unv(val);
      if (P === "DESCRIPTION") form.description = unv(val);
    }
    if (!/DTSTART/i.test(t)) issues.push("Event has no DTSTART.");
    return { type: "Calendar event", qrType: "event", fields, form, issues };
  }
  if (/^MATMSG:/i.test(t)) {
    const kv: Record<string, string> = {};
    for (const part of splitEsc(t.slice(7), ";")) {
      const i = part.indexOf(":");
      if (i > 0) kv[part.slice(0, i).toUpperCase()] = part.slice(i + 1);
    }
    return { type: "Email (MATMSG)", qrType: "email", fields: [["To", kv.TO ?? ""], ["Subject", kv.SUB ?? ""], ["Body", kv.BODY ?? ""]], form: { to: kv.TO ?? "", subject: kv.SUB ?? "", body: kv.BODY ?? "", style: "matmsg" }, issues };
  }
  if (/^mailto:/i.test(t)) {
    const [addr, q = ""] = t.slice(7).split("?");
    const sp = new URLSearchParams(q);
    const fields: [string, string][] = [["To", decodeURIComponent(addr)]];
    for (const [k, v] of sp) fields.push([k[0].toUpperCase() + k.slice(1), v]);
    return { type: "Email", qrType: "email", fields, form: { to: decodeURIComponent(addr), cc: sp.get("cc") ?? "", subject: sp.get("subject") ?? "", body: sp.get("body") ?? "", style: "mailto" }, issues };
  }
  let m = /^SMSTO:([^:]*):?([\s\S]*)$/i.exec(t);
  if (m) return { type: "SMS", qrType: "sms", fields: [["Number", m[1]], ["Message", m[2]]], form: { number: m[1], message: m[2], style: "smsto" }, issues };
  m = /^sms:([^?]*)(?:\?body=([\s\S]*))?$/i.exec(t);
  if (m) {
    const body = m[2] ? decodeURIComponent(m[2]) : "";
    return { type: "SMS", qrType: "sms", fields: [["Number", m[1]], ["Message", body]], form: { number: m[1], message: body, style: "sms" }, issues };
  }
  m = /^tel:(.+)$/i.exec(t);
  if (m) {
    if (!/^\+?[\d*#-]+$/.test(m[1])) issues.push("Phone numbers in tel: URIs should contain only digits (and a leading +).");
    return { type: "Phone number", qrType: "phone", fields: [["Number", m[1]]], form: { number: m[1] }, issues };
  }
  m = /^geo:(-?[\d.]+),(-?[\d.]+)(?:,(-?[\d.]+))?(?:\?q=(.*))?$/i.exec(t);
  if (m) {
    const lat = +m[1], lng = +m[2];
    if (Math.abs(lat) > 90) issues.push("Latitude must be between −90 and 90.");
    if (Math.abs(lng) > 180) issues.push("Longitude must be between −180 and 180.");
    const q = m[4] ? decodeURIComponent(m[4]) : "";
    return { type: "Geo location", qrType: "geo", fields: [["Latitude", m[1]], ["Longitude", m[2]], ...(m[3] ? [["Altitude", m[3]] as [string, string]] : []), ...(q ? [["Label", q] as [string, string]] : [])], form: { lat: m[1], lng: m[2], alt: m[3] ?? "", q }, issues };
  }
  if (/^otpauth:\/\//i.test(t)) {
    try {
      const u = new URL(t);
      const fields: [string, string][] = [["Kind", u.host], ["Label", decodeURIComponent(u.pathname.slice(1))]];
      for (const [k, v] of u.searchParams) fields.push([k, k === "secret" ? v.slice(0, 4) + "…" : v]);
      return { type: "2FA / OTP secret", qrType: "text", fields, issues: ["Contains a one-time-password secret — treat the QR code like a password."] };
    } catch {
      /* fall through */
    }
  }
  if (/^https?:\/\/\S+$/i.test(t)) {
    try {
      const u = new URL(t);
      const fields: [string, string][] = [["URL", t], ["Host", u.host], ["Path", u.pathname]];
      for (const [k, v] of u.searchParams) fields.push([`?${k}`, v]);
      if (u.protocol === "http:") issues.push("Plain http:// — phones may warn; prefer https://.");
      return { type: "URL", qrType: "url", fields, form: { text: t }, issues };
    } catch {
      /* fall through */
    }
  }
  return { type: "Text", qrType: "text", fields: [["Text", t.length > 200 ? t.slice(0, 200) + "…" : t], ["Characters", String([...t].length)]], form: { text: p }, issues };
}

/* ── rendering ──────────────────────────────────────────────────────── */

export type Matrix = { size: number; get: (x: number, y: number) => boolean };

export function matrixSvg(m: Matrix, o: { margin: number; dark: string; light: string; px: number }): string {
  const n = m.size + o.margin * 2;
  let d = "";
  for (let y = 0; y < m.size; y++) {
    let x = 0;
    while (x < m.size) {
      if (!m.get(x, y)) { x++; continue; }
      let w = 1;
      while (x + w < m.size && m.get(x + w, y)) w++;
      d += `M${x + o.margin} ${y + o.margin}h${w}v1h-${w}z`;
      x += w;
    }
  }
  const px = o.px;
  const bg = /^#?(transparent|none)$/i.test(o.light) || /^#[0-9a-f]{8}$/i.test(o.light) && o.light.slice(7) === "00" ? "" : `<rect width="${n}" height="${n}" fill="${o.light}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="${px}" height="${px}" shape-rendering="crispEdges">${bg}<path fill="${o.dark}" d="${d}"/></svg>`;
}

/** Black-on-white RGBA pixels, `scale` px per module — input for jsQR. */
export function matrixPixels(m: Matrix, scale = 4, margin = 4): { data: Uint8ClampedArray; width: number; height: number } {
  const n = (m.size + margin * 2) * scale;
  const data = new Uint8ClampedArray(n * n * 4).fill(255);
  for (let y = 0; y < m.size; y++)
    for (let x = 0; x < m.size; x++) {
      if (!m.get(x, y)) continue;
      for (let dy = 0; dy < scale; dy++)
        for (let dx = 0; dx < scale; dx++) {
          const i = (((y + margin) * scale + dy) * n + (x + margin) * scale + dx) * 4;
          data[i] = data[i + 1] = data[i + 2] = 0;
        }
    }
  return { data, width: n, height: n };
}

/** WCAG relative-luminance contrast between two hex colours. */
export function contrast(a: string, b: string): number {
  const lum = (h: string) => {
    const x = h.replace("#", "");
    const full = x.length === 3 ? x.split("").map((c) => c + c).join("") : x.slice(0, 6);
    const [r, g, bl] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
