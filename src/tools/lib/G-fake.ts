/**
 * The faker-backed field catalog shared by Mock Data (schema fields) and
 * Random JSON (template tokens). Faker itself is imported lazily by callers
 * and passed in, so this module stays light.
 */
import type { Faker } from "@faker-js/faker";
import { evalFormula } from "./G-expr";

export type FieldArgs = {
  min?: number;
  max?: number;
  decimals?: number;
  values?: string;
  pattern?: string;
  formula?: string;
  from?: string;
  to?: string;
  value?: string;
  n?: number;
  prob?: number;
};

/** row: values generated so far in this record (by field name); byType: the same keyed by field type, so an email can follow the name whatever the columns are called. */
export type Ctx = { index: number; row: Record<string, unknown>; rnd: () => number; byType?: Record<string, unknown> };

function names(c: Ctx): { first?: string; last?: string } {
  const bt = c.byType ?? {};
  let first = (bt.firstName ?? c.row.firstName ?? c.row.first_name) as string | undefined;
  let last = (bt.lastName ?? c.row.lastName ?? c.row.last_name) as string | undefined;
  const full = (bt.fullName ?? c.row.fullName ?? c.row.name) as string | undefined;
  if ((!first || !last) && typeof full === "string" && full.includes(" ")) {
    const parts = full.replace(/^(Mr|Mrs|Ms|Miss|Dr)\.?\s+/i, "").split(/\s+/);
    first ??= parts[0];
    last ??= parts[parts.length - 1];
  }
  return { first: typeof first === "string" ? first : undefined, last: typeof last === "string" ? last : undefined };
}

export type FieldType = {
  key: string;
  label: string;
  group: string;
  /** Which args the builder shows for this type. */
  args?: (keyof FieldArgs)[];
  gen: (f: Faker, a: FieldArgs, c: Ctx) => unknown;
};

const n = (v: unknown, d: number) => (v === undefined || v === null || v === "" || !Number.isFinite(Number(v)) ? d : Number(v));

function toDate(s: string | undefined, d: Date): Date {
  if (!s) return d;
  const t = new Date(s);
  return Number.isNaN(t.getTime()) ? d : t;
}

/** Regex-ish patterns: # digit, A upper, a lower, ? letter, * alnum, X hex, [a-z0-9] classes, {n} / {m,n} repeats, \ escapes. */
export function fromPattern(p: string, rnd: () => number): string {
  const pick = (s: string) => s[Math.floor(rnd() * s.length)];
  const U = "ABCDEFGHIJKLMNOPQRSTUVWXYZ", L = "abcdefghijklmnopqrstuvwxyz", D = "0123456789";
  let out = "";
  let i = 0;
  while (i < p.length) {
    let pool: string | null = null;
    let lit = "";
    const c = p[i];
    if (c === "\\" && i + 1 < p.length) {
      lit = p[i + 1];
      i += 2;
    } else if (c === "[") {
      const end = p.indexOf("]", i + 1);
      if (end < 0) {
        lit = c;
        i++;
      } else {
        const body = p.slice(i + 1, end);
        let set = "";
        for (let k = 0; k < body.length; k++) {
          if (body[k + 1] === "-" && k + 2 < body.length) {
            const a = body.charCodeAt(k), b = body.charCodeAt(k + 2);
            for (let x = Math.min(a, b); x <= Math.max(a, b); x++) set += String.fromCharCode(x);
            k += 2;
          } else set += body[k];
        }
        pool = set || " ";
        i = end + 1;
      }
    } else {
      pool = c === "#" ? D : c === "A" ? U : c === "a" ? L : c === "?" ? U + L : c === "*" ? U + L + D : c === "X" ? "0123456789ABCDEF" : c === "x" ? "0123456789abcdef" : null;
      if (!pool) lit = c;
      i++;
    }
    let reps = 1;
    const m = /^\{(\d+)(?:,(\d+))?\}/.exec(p.slice(i));
    if (m) {
      const lo = Number(m[1]), hi = m[2] ? Number(m[2]) : lo;
      reps = lo + Math.floor(rnd() * (Math.max(hi, lo) - lo + 1));
      i += m[0].length;
    }
    for (let r = 0; r < reps; r++) out += pool ? pick(pool) : lit;
  }
  return out;
}

function ulid(ms: number, rnd: () => number): string {
  const E = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  let t = "";
  let x = ms;
  for (let i = 0; i < 10; i++) {
    t = E[x % 32] + t;
    x = Math.floor(x / 32);
  }
  for (let i = 0; i < 16; i++) t += E[Math.floor(rnd() * 32)];
  return t;
}

const G = {
  person: "Person",
  internet: "Internet",
  location: "Location",
  commerce: "Commerce & company",
  finance: "Finance",
  date: "Date & time",
  lorem: "Text",
  number: "Number",
  id: "Identifiers",
  other: "Other",
  logic: "Logic",
};

export const FIELD_TYPES: FieldType[] = [
  // person
  { key: "firstName", label: "First name", group: G.person, gen: (f) => f.person.firstName() },
  { key: "lastName", label: "Last name", group: G.person, gen: (f) => f.person.lastName() },
  { key: "fullName", label: "Full name", group: G.person, gen: (f) => f.person.fullName() },
  { key: "gender", label: "Sex", group: G.person, gen: (f) => f.person.sex() },
  { key: "prefix", label: "Name prefix", group: G.person, gen: (f) => f.person.prefix() },
  { key: "jobTitle", label: "Job title", group: G.person, gen: (f) => f.person.jobTitle() },
  { key: "age", label: "Age", group: G.person, args: ["min", "max"], gen: (f, a) => f.number.int({ min: n(a.min, 18), max: n(a.max, 90) }) },
  { key: "birthdate", label: "Birthdate", group: G.person, gen: (f) => f.date.birthdate({ min: 18, max: 80, mode: "age" }).toISOString().slice(0, 10) },
  { key: "bio", label: "Short bio", group: G.person, gen: (f) => f.person.bio() },
  { key: "phone", label: "Phone number", group: G.person, gen: (f) => f.phone.number() },
  // internet
  { key: "email", label: "Email", group: G.internet, gen: (f, _a, c) => { const n = names(c); return (n.first ? f.internet.email({ firstName: n.first, lastName: n.last }) : f.internet.email()).toLowerCase(); } },
  { key: "companyEmail", label: "Email (example.com)", group: G.internet, gen: (f, _a, c) => { const n = names(c); return (n.first ? f.internet.exampleEmail({ firstName: n.first, lastName: n.last }) : f.internet.exampleEmail()).toLowerCase(); } },
  { key: "username", label: "Username", group: G.internet, gen: (f, _a, c) => { const n = names(c); return n.first ? f.internet.userName({ firstName: n.first, lastName: n.last }) : f.internet.userName(); } },
  { key: "password", label: "Password", group: G.internet, args: ["n"], gen: (f, a) => f.internet.password({ length: n(a.n, 14) }) },
  { key: "url", label: "URL", group: G.internet, gen: (f) => f.internet.url() },
  { key: "domain", label: "Domain name", group: G.internet, gen: (f) => f.internet.domainName() },
  { key: "ipv4", label: "IPv4 address", group: G.internet, gen: (f) => f.internet.ipv4() },
  { key: "ipv6", label: "IPv6 address", group: G.internet, gen: (f) => f.internet.ipv6() },
  { key: "mac", label: "MAC address", group: G.internet, gen: (f) => f.internet.mac() },
  { key: "port", label: "Port", group: G.internet, gen: (f) => f.internet.port() },
  { key: "userAgent", label: "User agent", group: G.internet, gen: (f) => f.internet.userAgent() },
  { key: "httpStatus", label: "HTTP status code", group: G.internet, gen: (f) => f.internet.httpStatusCode() },
  { key: "avatar", label: "Avatar URL", group: G.internet, gen: (f) => f.image.avatar() },
  { key: "emoji", label: "Emoji", group: G.internet, gen: (f) => f.internet.emoji() },
  // location
  { key: "street", label: "Street address", group: G.location, gen: (f) => f.location.streetAddress() },
  { key: "city", label: "City", group: G.location, gen: (f) => f.location.city() },
  { key: "state", label: "State", group: G.location, gen: (f) => f.location.state() },
  { key: "zip", label: "Postcode", group: G.location, gen: (f) => f.location.zipCode() },
  { key: "country", label: "Country", group: G.location, gen: (f) => f.location.country() },
  { key: "countryCode", label: "Country code", group: G.location, gen: (f) => f.location.countryCode() },
  { key: "latitude", label: "Latitude", group: G.location, gen: (f) => f.location.latitude({ precision: 5 }) },
  { key: "longitude", label: "Longitude", group: G.location, gen: (f) => f.location.longitude({ precision: 5 }) },
  { key: "timezone", label: "Time zone", group: G.location, gen: (f) => f.location.timeZone() },
  { key: "address", label: "Full address", group: G.location, gen: (f) => `${f.location.streetAddress()}, ${f.location.city()}, ${f.location.state({ abbreviated: true })} ${f.location.zipCode()}` },
  // commerce
  { key: "product", label: "Product name", group: G.commerce, gen: (f) => f.commerce.productName() },
  { key: "productAdjective", label: "Product adjective", group: G.commerce, gen: (f) => f.commerce.productAdjective() },
  { key: "department", label: "Department", group: G.commerce, gen: (f) => f.commerce.department() },
  { key: "price", label: "Price", group: G.commerce, args: ["min", "max"], gen: (f, a) => Number(f.commerce.price({ min: n(a.min, 1), max: n(a.max, 500), dec: 2 })) },
  { key: "company", label: "Company", group: G.commerce, gen: (f) => f.company.name() },
  { key: "catchPhrase", label: "Catch phrase", group: G.commerce, gen: (f) => f.company.catchPhrase() },
  { key: "colorName", label: "Colour name", group: G.commerce, gen: (f) => f.color.human() },
  // finance
  { key: "amount", label: "Amount", group: G.finance, args: ["min", "max", "decimals"], gen: (f, a) => Number(f.finance.amount({ min: n(a.min, 0), max: n(a.max, 1000), dec: n(a.decimals, 2) })) },
  { key: "currency", label: "Currency code", group: G.finance, gen: (f) => f.finance.currencyCode() },
  { key: "iban", label: "IBAN", group: G.finance, gen: (f) => f.finance.iban() },
  { key: "bic", label: "BIC / SWIFT", group: G.finance, gen: (f) => f.finance.bic() },
  { key: "creditCard", label: "Card number (test)", group: G.finance, gen: (f) => f.finance.creditCardNumber() },
  { key: "accountNumber", label: "Account number", group: G.finance, gen: (f) => f.finance.accountNumber() },
  { key: "transactionType", label: "Transaction type", group: G.finance, gen: (f) => f.finance.transactionType() },
  { key: "bitcoin", label: "Bitcoin address", group: G.finance, gen: (f) => f.finance.bitcoinAddress() },
  // date
  { key: "date", label: "Date (between)", group: G.date, args: ["from", "to"], gen: (f, a) => f.date.between({ from: toDate(a.from, new Date("2020-01-01")), to: toDate(a.to, new Date("2025-12-31")) }).toISOString().slice(0, 10) },
  { key: "datetime", label: "Date-time ISO (between)", group: G.date, args: ["from", "to"], gen: (f, a) => f.date.between({ from: toDate(a.from, new Date("2020-01-01")), to: toDate(a.to, new Date("2025-12-31")) }).toISOString() },
  { key: "past", label: "Past date-time", group: G.date, gen: (f) => f.date.past({ refDate: "2026-01-01T00:00:00Z" }).toISOString() },
  { key: "future", label: "Future date-time", group: G.date, gen: (f) => f.date.future({ refDate: "2026-01-01T00:00:00Z" }).toISOString() },
  { key: "time", label: "Time (HH:MM)", group: G.date, gen: (f) => `${String(f.number.int(23)).padStart(2, "0")}:${String(f.number.int(59)).padStart(2, "0")}` },
  { key: "unix", label: "Unix timestamp", group: G.date, args: ["from", "to"], gen: (f, a) => Math.floor(f.date.between({ from: toDate(a.from, new Date("2020-01-01")), to: toDate(a.to, new Date("2025-12-31")) }).getTime() / 1000) },
  { key: "weekday", label: "Weekday", group: G.date, gen: (f) => f.date.weekday() },
  { key: "month", label: "Month", group: G.date, gen: (f) => f.date.month() },
  // text
  { key: "word", label: "Word", group: G.lorem, gen: (f) => f.word.noun() },
  { key: "words", label: "Words", group: G.lorem, args: ["n"], gen: (f, a) => f.lorem.words(n(a.n, 3)) },
  { key: "sentence", label: "Sentence", group: G.lorem, gen: (f) => f.lorem.sentence() },
  { key: "paragraph", label: "Paragraph", group: G.lorem, gen: (f) => f.lorem.paragraph() },
  { key: "title", label: "Title", group: G.lorem, gen: (f) => { const s = f.lorem.words(f.number.int({ min: 3, max: 6 })); return s.replace(/\b\w/g, (c) => c.toUpperCase()); } },
  { key: "slug", label: "Slug", group: G.lorem, gen: (f) => f.lorem.slug(3) },
  { key: "hackerPhrase", label: "Tech phrase", group: G.lorem, gen: (f) => f.hacker.phrase() },
  // number
  { key: "int", label: "Integer", group: G.number, args: ["min", "max"], gen: (f, a) => f.number.int({ min: n(a.min, 0), max: n(a.max, 1000) }) },
  { key: "float", label: "Decimal", group: G.number, args: ["min", "max", "decimals"], gen: (f, a) => f.number.float({ min: n(a.min, 0), max: n(a.max, 100), fractionDigits: n(a.decimals, 2) }) },
  { key: "percent", label: "Percentage", group: G.number, gen: (f) => f.number.float({ min: 0, max: 100, fractionDigits: 1 }) },
  { key: "rating", label: "Rating 1–5", group: G.number, gen: (f) => f.number.int({ min: 1, max: 5 }) },
  // logic
  { key: "bool", label: "Boolean", group: G.logic, args: ["prob"], gen: (f, a) => f.datatype.boolean({ probability: n(a.prob, 50) / 100 }) },
  { key: "enum", label: "One of (list)", group: G.logic, args: ["values"], gen: (f, a) => pickWeighted(f, a.values || "a,b,c") },
  { key: "pattern", label: "Pattern (#, A, a, [..]{n})", group: G.logic, args: ["pattern"], gen: (_f, a, c) => fromPattern(a.pattern || "AA-####", c.rnd) },
  { key: "formula", label: "Formula (other fields)", group: G.logic, args: ["formula"], gen: (_f, a, c) => evalFormula(a.formula || "0", c.row, c.index) },
  { key: "constant", label: "Constant value", group: G.logic, args: ["value"], gen: (_f, a) => autoType(a.value ?? "") },
  // ids
  { key: "increment", label: "Auto-increment", group: G.id, args: ["min", "n"], gen: (_f, a, c) => n(a.min, 1) + c.index * n(a.n, 1) },
  { key: "uuid", label: "UUID v4", group: G.id, gen: (f) => f.string.uuid() },
  { key: "ulid", label: "ULID", group: G.id, gen: (f, _a, c) => ulid(f.date.recent({ days: 30, refDate: "2026-01-01T00:00:00Z" }).getTime(), c.rnd) },
  { key: "nanoid", label: "Nano ID", group: G.id, gen: (f) => f.string.nanoid() },
  { key: "objectId", label: "MongoDB ObjectId", group: G.id, gen: (f) => f.database.mongodbObjectId() },
  { key: "hex", label: "Hex string", group: G.id, args: ["n"], gen: (f, a) => f.string.hexadecimal({ length: n(a.n, 16), casing: "lower", prefix: "" }) },
  { key: "sha", label: "Git commit SHA", group: G.id, gen: (f) => f.git.commitSha() },
  // other
  { key: "hexColor", label: "Hex colour", group: G.other, gen: (f) => f.color.rgb({ format: "hex", casing: "lower" }) },
  { key: "fileName", label: "File name", group: G.other, gen: (f) => f.system.commonFileName() },
  { key: "mimeType", label: "MIME type", group: G.other, gen: (f) => f.system.mimeType() },
  { key: "semver", label: "Semver", group: G.other, gen: (f) => f.system.semver() },
  { key: "vehicle", label: "Vehicle", group: G.other, gen: (f) => f.vehicle.vehicle() },
  { key: "animal", label: "Animal (dog breed)", group: G.other, gen: (f) => f.animal.dog() },
  { key: "genre", label: "Music genre", group: G.other, gen: (f) => f.music.genre() },
];

export const TYPE_BY_KEY: Record<string, FieldType> = Object.fromEntries(FIELD_TYPES.map((t) => [t.key, t]));

/** `a,b,c` or weighted `active:70,inactive:20,banned:10`. */
export function pickWeighted(f: Faker, spec: string): unknown {
  const items = spec.split(/[,|]/).map((s) => s.trim()).filter(Boolean);
  const parsed = items.map((s) => {
    const m = /^(.*):(\d+(?:\.\d+)?)$/.exec(s);
    return m ? { v: m[1], w: Number(m[2]) } : { v: s, w: 1 };
  });
  if (!parsed.length) return null;
  const weighted = parsed.map((p) => ({ weight: p.w, value: autoType(p.v) }));
  return f.helpers.weightedArrayElement(weighted);
}

/** "42" → 42, "true" → true, "null" → null, else the string. */
export function autoType(s: string): unknown {
  const t = s.trim();
  if (/^-?\d+(\.\d+)?$/.test(t) && t.length < 16) return Number(t);
  if (t === "true") return true;
  if (t === "false") return false;
  if (t === "null") return null;
  return s;
}
