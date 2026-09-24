/**
 * JSON-LD extraction and validation against Google's rich-result guidelines
 * (required vs recommended properties per type). Pure functions: used by the
 * JSON-LD Inspector and the SEO Inspector.
 */

export type Level = "error" | "warning" | "info" | "ok";
export type Issue = { level: Level; message: string; path: string; line?: number };
export type Block = { index: number; raw: string; line: number; value?: unknown; error?: string; errorLine?: number };
export type Entity = { path: string; type: string; node: Record<string, unknown>; block: number; line: number };

/* ── extraction ────────────────────────────────────────────────────── */

const lineAt = (src: string, pos: number) => src.slice(0, pos).split("\n").length;

/** Blocks of JSON-LD from raw JSON or from HTML with <script type="application/ld+json">. */
export function extractBlocks(src: string): Block[] {
  const t = src.trim();
  if (!t) return [];
  if (t.startsWith("{") || t.startsWith("[")) return [parseBlock(0, t, lineAt(src, src.indexOf(t)))];
  const blocks: Block[] = [];
  const re = /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script\s*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const bodyStart = m.index + m[0].indexOf(">") + 1;
    blocks.push(parseBlock(blocks.length, m[1], lineAt(src, bodyStart)));
  }
  return blocks;
}

function parseBlock(index: number, raw: string, line: number): Block {
  const body = raw.replace(/^\s*<!\[CDATA\[/, "").replace(/\]\]>\s*$/, "").replace(/^\s*<!--/, "").replace(/-->\s*$/, "");
  try {
    return { index, raw: body.trim(), line, value: JSON.parse(body) };
  } catch (e) {
    const msg = (e as Error).message;
    const pos = Number(msg.match(/position (\d+)/)?.[1] ?? NaN);
    const lc = msg.match(/line (\d+) column (\d+)/);
    const rel = lc ? Number(lc[1]) : Number.isFinite(pos) ? lineAt(body, pos) : undefined;
    return { index, raw: body.trim(), line, error: msg.replace(/^JSON\.parse: /, ""), errorLine: rel != null ? line + rel - 1 : undefined };
  }
}

const typesOf = (n: Record<string, unknown>): string[] => {
  const t = n["@type"];
  return (Array.isArray(t) ? t : t ? [t] : []).map((x) => String(x).replace(/^https?:\/\/schema\.org\//, ""));
};

/** Top-level entities (with @graph flattened). Nested typed objects are validated by their parent's rules. */
export function entitiesOf(blocks: Block[]): Entity[] {
  const out: Entity[] = [];
  for (const b of blocks) {
    if (b.value === undefined) continue;
    const roots = Array.isArray(b.value) ? b.value : [b.value];
    roots.forEach((r, i) => {
      if (!r || typeof r !== "object") return;
      const rec = r as Record<string, unknown>;
      const base = Array.isArray(b.value) ? `block${b.index + 1}[${i}]` : `block${b.index + 1}`;
      if (Array.isArray(rec["@graph"])) {
        (rec["@graph"] as unknown[]).forEach((g, j) => {
          if (g && typeof g === "object") out.push({ path: `${base}.@graph[${j}]`, type: typesOf(g as Record<string, unknown>).join(", ") || "(no @type)", node: g as Record<string, unknown>, block: b.index, line: b.line });
        });
      } else out.push({ path: base, type: typesOf(rec).join(", ") || "(no @type)", node: rec, block: b.index, line: b.line });
    });
  }
  return out;
}

/* ── value checks ──────────────────────────────────────────────────── */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const ISO_DURATION = /^P(?!$)(\d+Y)?(\d+M)?(\d+W)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+(\.\d+)?S)?)?$/;
const isUrl = (s: unknown) => typeof s === "string" && /^https?:\/\/[^\s]+$/i.test(s);
const present = (v: unknown) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0);
const first = (v: unknown): unknown => (Array.isArray(v) ? v[0] : v);
const asObj = (v: unknown): Record<string, unknown> | null => {
  const f = first(v);
  return f && typeof f === "object" ? (f as Record<string, unknown>) : null;
};
export const textOf = (v: unknown): string => {
  const f = first(v);
  if (f == null) return "";
  if (typeof f === "object") {
    const o = f as Record<string, unknown>;
    return String(o.name ?? o["@id"] ?? o.url ?? o.text ?? "");
  }
  return String(f);
};

type Ctx = { issues: Issue[]; path: string };
const add = (c: Ctx, level: Level, message: string, sub = "") => c.issues.push({ level, message, path: sub ? `${c.path}.${sub}` : c.path });

function need(c: Ctx, n: Record<string, unknown>, props: string[], level: "error" | "warning", what: string) {
  for (const p of props) {
    const alts = p.split("|");
    if (!alts.some((a) => present(n[a]))) add(c, level, `${level === "error" ? "Missing required" : "Missing recommended"} property ${alts.map((a) => `"${a}"`).join(" or ")} for ${what}.`);
  }
}

function checkDate(c: Ctx, n: Record<string, unknown>, prop: string, withTime = false) {
  const v = n[prop];
  if (!present(v)) return;
  const s = String(first(v));
  if (!ISO_DATE.test(s)) add(c, "error", `"${prop}" should be an ISO 8601 date (e.g. 2026-09-24${withTime ? "T09:00:00+01:00" : ""}); got "${s}".`, prop);
  else if (withTime && !s.includes("T")) add(c, "warning", `"${prop}" has no time — add a time and timezone offset for accuracy.`, prop);
  else if (s.includes("T") && !/(Z|[+-]\d{2}:?\d{2})$/.test(s)) add(c, "warning", `"${prop}" has a time but no timezone offset.`, prop);
}

function checkDuration(c: Ctx, n: Record<string, unknown>, prop: string) {
  const v = n[prop];
  if (present(v) && !ISO_DURATION.test(String(v))) add(c, "error", `"${prop}" should be an ISO 8601 duration like PT1H30M; got "${String(v)}".`, prop);
}

function checkUrl(c: Ctx, n: Record<string, unknown>, prop: string) {
  const v = n[prop];
  if (!present(v)) return;
  for (const x of Array.isArray(v) ? v : [v]) {
    const u = typeof x === "object" && x ? (x as Record<string, unknown>).url ?? (x as Record<string, unknown>)["@id"] : x;
    if (u !== undefined && !isUrl(u)) add(c, "warning", `"${prop}" should be an absolute URL; got "${String(u)}".`, prop);
  }
}

function checkImage(c: Ctx, n: Record<string, unknown>, prop = "image") {
  checkUrl(c, n, prop);
}

function checkPerson(c: Ctx, v: unknown, prop: string) {
  if (!present(v)) return;
  for (const a of Array.isArray(v) ? v : [v]) {
    if (typeof a === "string") {
      add(c, "warning", `"${prop}" is a plain string — use a Person or Organization object with "name" (and "url").`, prop);
      continue;
    }
    const o = a as Record<string, unknown>;
    const t = typesOf(o);
    if (!t.length) add(c, "warning", `"${prop}" has no @type — use Person or Organization.`, prop);
    if (!present(o.name)) add(c, "error", `"${prop}" needs a "name".`, prop);
    if (typeof o.name === "string" && /^(by |posted by )/i.test(o.name)) add(c, "warning", `"${prop}.name" should hold only the name, not "${o.name}".`, prop);
  }
}

function checkRating(c: Ctx, v: unknown, prop: string, aggregate: boolean) {
  const o = asObj(v);
  if (!o) {
    if (present(v)) add(c, "error", `"${prop}" must be an object.`, prop);
    return;
  }
  const sub: Ctx = { issues: c.issues, path: `${c.path}.${prop}` };
  if (!present(o.ratingValue)) add(sub, "error", `Missing required "ratingValue".`);
  const val = Number(o.ratingValue);
  const best = present(o.bestRating) ? Number(o.bestRating) : 5;
  const worst = present(o.worstRating) ? Number(o.worstRating) : 1;
  if (present(o.ratingValue) && !Number.isFinite(val)) add(sub, "error", `"ratingValue" must be a number; got "${String(o.ratingValue)}".`);
  else if (present(o.ratingValue) && (val > best || val < worst)) add(sub, "error", `"ratingValue" ${val} is outside ${worst}–${best} (set bestRating/worstRating if your scale differs).`);
  if (aggregate && !present(o.ratingCount) && !present(o.reviewCount)) add(sub, "error", `AggregateRating needs "ratingCount" or "reviewCount".`);
  if (aggregate && Number(o.ratingCount ?? o.reviewCount) === 0) add(sub, "warning", "A rating count of 0 is not eligible for review stars.");
}

function checkOffers(c: Ctx, v: unknown, prop = "offers") {
  const list = Array.isArray(v) ? v : [v];
  list.forEach((x, i) => {
    const o = asObj(x);
    const sub: Ctx = { issues: c.issues, path: `${c.path}.${prop}${list.length > 1 ? `[${i}]` : ""}` };
    if (!o) return add(sub, "error", "Offer must be an object.");
    const t = typesOf(o);
    if (t.includes("AggregateOffer")) {
      if (!present(o.lowPrice)) add(sub, "error", `AggregateOffer needs "lowPrice".`);
      if (!present(o.priceCurrency)) add(sub, "error", `Missing required "priceCurrency".`);
      return;
    }
    if (!present(o.price) && !present(o.priceSpecification)) add(sub, "error", `Offer needs "price" (or "priceSpecification").`);
    if (present(o.price)) {
      const p = String(o.price);
      if (!/^\d+(\.\d+)?$/.test(p)) add(sub, "error", `"price" should be a plain number like 19.99 — no currency symbols or commas; got "${p}".`);
    }
    if (!present(o.priceCurrency) && !present(o.priceSpecification)) add(sub, "error", `Missing required "priceCurrency" (ISO 4217, e.g. "USD").`);
    else if (present(o.priceCurrency) && !/^[A-Z]{3}$/.test(String(o.priceCurrency))) add(sub, "error", `"priceCurrency" must be a 3-letter ISO 4217 code; got "${String(o.priceCurrency)}".`);
    if (!present(o.availability)) add(sub, "warning", `Missing recommended "availability" (e.g. https://schema.org/InStock).`);
    else if (!/schema\.org\/(InStock|OutOfStock|PreOrder|BackOrder|Discontinued|InStoreOnly|LimitedAvailability|OnlineOnly|PreSale|SoldOut|Reserved|MadeToOrder)$/.test(String(o.availability)))
      add(sub, "warning", `"availability" should be a schema.org ItemAvailability URL; got "${String(o.availability)}".`);
    if (present(o.priceValidUntil)) {
      checkDate(sub, o, "priceValidUntil");
      if (new Date(String(o.priceValidUntil)).getTime() < Date.now()) add(sub, "warning", `"priceValidUntil" is in the past — the offer may be ignored.`);
    }
    if (present(o.url)) checkUrl(sub, o, "url");
  });
}

function checkAddress(c: Ctx, v: unknown, prop = "address", required = false) {
  if (!present(v)) {
    if (required) add(c, "error", `Missing required "${prop}".`);
    return;
  }
  if (typeof first(v) === "string") {
    add(c, "warning", `"${prop}" is a string — a PostalAddress object (streetAddress, addressLocality, postalCode, addressCountry) is preferred.`, prop);
    return;
  }
  const o = asObj(v)!;
  const sub: Ctx = { issues: c.issues, path: `${c.path}.${prop}` };
  need(sub, o, ["streetAddress", "addressLocality", "postalCode", "addressCountry"], "warning", "PostalAddress");
}

/* ── per-type rules ────────────────────────────────────────────────── */

type Rule = (c: Ctx, n: Record<string, unknown>) => void;

const article: Rule = (c, n) => {
  need(c, n, ["headline", "image", "datePublished", "author"], "warning", "Article rich results");
  need(c, n, ["dateModified", "publisher"], "warning", "Article");
  if (typeof n.headline === "string" && n.headline.length > 110) add(c, "warning", `"headline" is ${n.headline.length} characters; keep it under 110.`, "headline");
  checkDate(c, n, "datePublished", true);
  checkDate(c, n, "dateModified", true);
  if (present(n.datePublished) && present(n.dateModified) && String(n.dateModified) < String(n.datePublished)) add(c, "error", `"dateModified" is earlier than "datePublished".`);
  checkImage(c, n);
  checkPerson(c, n.author, "author");
};

const product: Rule = (c, n) => {
  need(c, n, ["name"], "error", "Product");
  if (!present(n.offers) && !present(n.review) && !present(n.aggregateRating)) add(c, "error", `Product needs at least one of "offers", "review" or "aggregateRating".`);
  need(c, n, ["image", "description", "brand", "sku"], "warning", "Product");
  if (!["gtin", "gtin8", "gtin12", "gtin13", "gtin14", "mpn", "isbn"].some((k) => present(n[k]))) add(c, "info", `Add a global identifier ("gtin13", "mpn"…) to help Google match the product.`);
  for (const k of ["gtin8", "gtin12", "gtin13", "gtin14", "gtin"]) if (present(n[k]) && !/^\d{8,14}$/.test(String(n[k]))) add(c, "error", `"${k}" must contain 8–14 digits; got "${String(n[k])}".`, k);
  checkImage(c, n);
  if (present(n.offers)) checkOffers(c, n.offers);
  if (present(n.aggregateRating)) checkRating(c, n.aggregateRating, "aggregateRating", true);
  if (present(n.review))
    (Array.isArray(n.review) ? n.review : [n.review]).forEach((r, i) => {
      const o = asObj(r);
      const sub: Ctx = { issues: c.issues, path: `${c.path}.review[${i}]` };
      if (!o) return;
      if (!present(o.author)) add(sub, "error", `Review needs an "author".`);
      else checkPerson(sub, o.author, "author");
      if (!present(o.reviewRating)) add(sub, "error", `Review needs a "reviewRating".`);
      else checkRating(sub, o.reviewRating, "reviewRating", false);
      if (!present(o.datePublished)) add(sub, "warning", `Missing recommended "datePublished".`);
    });
  if (present(n.brand) && typeof n.brand === "string") add(c, "info", `"brand" is a string; a Brand object {"@type":"Brand","name":…} is preferred.`, "brand");
};

const organization: Rule = (c, n) => {
  need(c, n, ["name", "url"], "warning", "Organization");
  need(c, n, ["logo", "sameAs"], "warning", "Organization knowledge panel");
  checkUrl(c, n, "url");
  checkUrl(c, n, "logo");
  checkUrl(c, n, "sameAs");
  if (present(n.address)) checkAddress(c, n.address);
  if (present(n.contactPoint)) {
    const cp = asObj(n.contactPoint);
    if (cp && !present(cp.telephone) && !present(cp.email)) add(c, "warning", `"contactPoint" needs a "telephone" or "email".`, "contactPoint");
    if (cp && !present(cp.contactType)) add(c, "warning", `"contactPoint" should have a "contactType" (e.g. "customer service").`, "contactPoint");
  }
};

const localBusiness: Rule = (c, n) => {
  need(c, n, ["name"], "error", "LocalBusiness");
  checkAddress(c, n.address, "address", true);
  need(c, n, ["telephone", "openingHoursSpecification|openingHours", "geo", "url", "image", "priceRange"], "warning", "LocalBusiness");
  const g = asObj(n.geo);
  if (g) {
    const lat = Number(g.latitude), lon = Number(g.longitude);
    if (!(Math.abs(lat) <= 90) || !(Math.abs(lon) <= 180)) add(c, "error", `"geo" needs numeric latitude (−90…90) and longitude (−180…180).`, "geo");
    else if (String(g.latitude).split(".")[1]?.length < 5) add(c, "info", "Use at least 5 decimal places of latitude/longitude precision.", "geo");
  }
  if (present(n.openingHoursSpecification))
    (Array.isArray(n.openingHoursSpecification) ? n.openingHoursSpecification : [n.openingHoursSpecification]).forEach((o, i) => {
      const s = asObj(o);
      if (s && (!present(s.opens) || !present(s.closes) || !present(s.dayOfWeek))) add(c, "error", `openingHoursSpecification[${i}] needs dayOfWeek, opens and closes.`, "openingHoursSpecification");
      if (s && present(s.opens) && !/^\d{2}:\d{2}(:\d{2})?$/.test(String(s.opens))) add(c, "error", `"opens" should be HH:MM; got "${String(s.opens)}".`, "openingHoursSpecification");
    });
  if (present(n.aggregateRating)) checkRating(c, n.aggregateRating, "aggregateRating", true);
  checkImage(c, n);
};

const breadcrumbs: Rule = (c, n) => {
  const items = n.itemListElement;
  if (!Array.isArray(items) || !items.length) return add(c, "error", `BreadcrumbList needs a non-empty "itemListElement" array.`);
  if (items.length < 2) add(c, "warning", "A breadcrumb trail should have at least two items.");
  items.forEach((it, i) => {
    const o = asObj(it);
    const sub: Ctx = { issues: c.issues, path: `${c.path}.itemListElement[${i}]` };
    if (!o) return add(sub, "error", "ListItem must be an object.");
    if (!typesOf(o).includes("ListItem")) add(sub, "warning", `Items should be "@type": "ListItem".`);
    if (!present(o.position)) add(sub, "error", `Missing required "position".`);
    else if (Number(o.position) !== i + 1) add(sub, "warning", `"position" is ${String(o.position)}, expected ${i + 1}.`);
    const name = o.name ?? asObj(o.item)?.name;
    if (!present(name)) add(sub, "error", `Missing required "name".`);
    const item = typeof o.item === "string" ? o.item : asObj(o.item)?.["@id"];
    if (!present(item) && i < items.length - 1) add(sub, "error", `Missing required "item" URL (only the last crumb may omit it).`);
    else if (present(item) && !isUrl(item)) add(sub, "warning", `"item" should be an absolute URL; got "${String(item)}".`);
  });
};

const faq: Rule = (c, n) => {
  const q = n.mainEntity;
  const list = Array.isArray(q) ? q : q ? [q] : [];
  if (!list.length) return add(c, "error", `FAQPage needs "mainEntity" with Question items.`);
  list.forEach((x, i) => {
    const o = asObj(x);
    const sub: Ctx = { issues: c.issues, path: `${c.path}.mainEntity[${i}]` };
    if (!o) return add(sub, "error", "Question must be an object.");
    if (!typesOf(o).includes("Question")) add(sub, "error", `Items must be "@type": "Question".`);
    if (!present(o.name)) add(sub, "error", `Question needs "name" (the question text).`);
    const a = asObj(o.acceptedAnswer);
    if (!a) add(sub, "error", `Question needs "acceptedAnswer".`);
    else if (!present(a.text)) add(sub, "error", `"acceptedAnswer" needs "text".`);
  });
  add(c, "info", "Since 2023 Google shows FAQ rich results only for well-known government and health sites.");
};

const howTo: Rule = (c, n) => {
  need(c, n, ["name", "step"], "error", "HowTo");
  need(c, n, ["image", "totalTime", "supply", "tool", "estimatedCost"], "warning", "HowTo");
  checkDuration(c, n, "totalTime");
  const steps = Array.isArray(n.step) ? n.step : n.step ? [n.step] : [];
  steps.forEach((s, i) => {
    if (typeof s === "string") return;
    const o = s as Record<string, unknown>;
    const sub: Ctx = { issues: c.issues, path: `${c.path}.step[${i}]` };
    if (typesOf(o).includes("HowToSection")) {
      if (!present(o.itemListElement)) add(sub, "error", `HowToSection needs "itemListElement".`);
    } else if (!present(o.text) && !present(o.itemListElement)) add(sub, "error", `HowToStep needs "text".`);
  });
  add(c, "info", "Google retired HowTo rich results in 2023; the markup is still valid schema.org.");
};

const event: Rule = (c, n) => {
  need(c, n, ["name", "startDate", "location"], "error", "Event");
  need(c, n, ["description", "endDate", "eventStatus", "image", "offers", "organizer", "performer"], "warning", "Event");
  checkDate(c, n, "startDate", true);
  checkDate(c, n, "endDate", true);
  if (present(n.startDate) && present(n.endDate) && String(n.endDate) < String(n.startDate)) add(c, "error", `"endDate" is before "startDate".`);
  const loc = asObj(n.location);
  if (loc) {
    const t = typesOf(loc);
    if (t.includes("VirtualLocation")) {
      if (!present(loc.url)) add(c, "error", `VirtualLocation needs a "url".`, "location");
    } else {
      if (!present(loc.name)) add(c, "warning", `"location" should have a "name".`, "location");
      checkAddress({ issues: c.issues, path: `${c.path}.location` }, loc.address, "address", true);
    }
  }
  if (present(n.eventAttendanceMode) && !/schema\.org\/(Offline|Online|Mixed)EventAttendanceMode$/.test(String(n.eventAttendanceMode))) add(c, "warning", `"eventAttendanceMode" should be a schema.org EventAttendanceModeEnumeration URL.`);
  if (present(n.eventStatus) && !/schema\.org\/Event(Scheduled|Cancelled|Postponed|Rescheduled|MovedOnline)$/.test(String(n.eventStatus))) add(c, "warning", `"eventStatus" should be a schema.org EventStatusType URL.`);
  if (present(n.offers)) checkOffers(c, n.offers);
  checkImage(c, n);
  checkPerson(c, n.organizer, "organizer");
};

const recipe: Rule = (c, n) => {
  need(c, n, ["name", "image"], "error", "Recipe");
  need(c, n, ["recipeIngredient", "recipeInstructions", "author", "datePublished", "description", "prepTime", "cookTime", "totalTime", "recipeYield", "recipeCategory", "recipeCuisine", "keywords"], "warning", "Recipe");
  for (const k of ["prepTime", "cookTime", "totalTime"]) checkDuration(c, n, k);
  checkImage(c, n);
  checkPerson(c, n.author, "author");
  if (present(n.recipeIngredient) && !Array.isArray(n.recipeIngredient)) add(c, "error", `"recipeIngredient" must be an array of strings.`, "recipeIngredient");
  if (typeof n.recipeInstructions === "string") add(c, "warning", `"recipeInstructions" is one string; use HowToStep items for step-by-step results.`, "recipeInstructions");
  if (present(n.aggregateRating)) checkRating(c, n.aggregateRating, "aggregateRating", true);
  const nut = asObj(n.nutrition);
  if (nut && present(nut.calories) && !/^\d+(\.\d+)?\s*(calories|kcal|cal)$/i.test(String(nut.calories))) add(c, "warning", `"nutrition.calories" should look like "270 calories".`, "nutrition");
};

const jobPosting: Rule = (c, n) => {
  need(c, n, ["title", "description", "datePosted", "hiringOrganization"], "error", "JobPosting");
  const remote = String(n.jobLocationType ?? "") === "TELECOMMUTE";
  if (!present(n.jobLocation) && !remote) add(c, "error", `Missing required "jobLocation" (or "jobLocationType": "TELECOMMUTE" with "applicantLocationRequirements").`);
  if (remote && !present(n.applicantLocationRequirements)) add(c, "error", `Remote jobs need "applicantLocationRequirements".`);
  need(c, n, ["validThrough", "employmentType", "baseSalary", "identifier"], "warning", "JobPosting");
  checkDate(c, n, "datePosted");
  checkDate(c, n, "validThrough", true);
  if (present(n.validThrough) && new Date(String(n.validThrough)).getTime() < Date.now()) add(c, "warning", `"validThrough" is in the past — the posting has expired.`);
  const loc = asObj(n.jobLocation);
  if (loc) checkAddress({ issues: c.issues, path: `${c.path}.jobLocation` }, loc.address, "address", true);
  const sal = asObj(n.baseSalary);
  if (sal) {
    if (!present(sal.currency)) add(c, "warning", `"baseSalary" needs "currency".`, "baseSalary");
    const v = asObj(sal.value);
    if (v && !present(v.unitText)) add(c, "warning", `"baseSalary.value" needs "unitText" (HOUR, DAY, WEEK, MONTH, YEAR).`, "baseSalary");
  }
  if (typeof n.description === "string" && n.description.length < 100) add(c, "warning", "The job description is very short.", "description");
  const et = n.employmentType;
  const valid = ["FULL_TIME", "PART_TIME", "CONTRACTOR", "TEMPORARY", "INTERN", "VOLUNTEER", "PER_DIEM", "OTHER"];
  for (const e of Array.isArray(et) ? et : et ? [et] : []) if (!valid.includes(String(e))) add(c, "warning", `"employmentType" "${String(e)}" is not one of ${valid.join(", ")}.`, "employmentType");
};

const website: Rule = (c, n) => {
  need(c, n, ["name", "url"], "warning", "WebSite (site name)");
  checkUrl(c, n, "url");
  const pa = asObj(n.potentialAction);
  if (pa && typesOf(pa).includes("SearchAction")) {
    const target = typeof pa.target === "string" ? pa.target : String(asObj(pa.target)?.urlTemplate ?? "");
    if (!target) add(c, "error", `SearchAction needs "target" with a urlTemplate.`, "potentialAction");
    else if (!target.includes("{search_term_string}")) add(c, "error", `SearchAction target must contain "{search_term_string}".`, "potentialAction");
    const qi = String(pa["query-input"] ?? "");
    if (!/required\s+name=search_term_string/.test(qi)) add(c, "error", `"query-input" should be "required name=search_term_string".`, "potentialAction");
    add(c, "info", "Google retired the sitelinks search box in 2024; SearchAction is still valid schema.org.");
  }
};

const person: Rule = (c, n) => {
  need(c, n, ["name"], "error", "Person");
  need(c, n, ["url", "image", "sameAs", "jobTitle"], "warning", "Person");
  checkUrl(c, n, "url");
  checkUrl(c, n, "sameAs");
};

const video: Rule = (c, n) => {
  need(c, n, ["name", "thumbnailUrl", "uploadDate"], "error", "VideoObject");
  need(c, n, ["description", "duration", "contentUrl|embedUrl"], "warning", "VideoObject");
  checkDate(c, n, "uploadDate", true);
  checkDuration(c, n, "duration");
  checkUrl(c, n, "thumbnailUrl");
  checkUrl(c, n, "contentUrl");
  checkUrl(c, n, "embedUrl");
};

const software: Rule = (c, n) => {
  need(c, n, ["name", "offers"], "error", "SoftwareApplication");
  if (!present(n.aggregateRating) && !present(n.review)) add(c, "error", `SoftwareApplication needs "aggregateRating" or "review".`);
  need(c, n, ["applicationCategory", "operatingSystem"], "warning", "SoftwareApplication");
  if (present(n.offers)) {
    const o = asObj(n.offers);
    if (o && !present(o.price)) add(c, "error", `"offers.price" is required (use 0 for free apps).`, "offers");
    if (o && present(o.price) && !present(o.priceCurrency) && Number(o.price) > 0) add(c, "error", `"offers.priceCurrency" is required for paid apps.`, "offers");
  }
  if (present(n.aggregateRating)) checkRating(c, n.aggregateRating, "aggregateRating", true);
  if (present(n.applicationCategory) && !/Application$|^(Game|SocialNetworking|Travel|Shopping|Sports|Lifestyle|Business|Design|Developer|Driver|Educational|Health|Finance|Security|Browser|Communication|DesktopEnhancement|Entertainment|Multimedia|Home|Utilities|Reference)/.test(String(n.applicationCategory)))
    add(c, "info", `"applicationCategory" is usually a value like "DeveloperApplication" or "GameApplication".`);
};

const course: Rule = (c, n) => {
  need(c, n, ["name", "description", "provider"], "error", "Course");
  need(c, n, ["offers", "hasCourseInstance"], "warning", "Course info");
  const p = asObj(n.provider);
  if (p && !present(p.name)) add(c, "error", `"provider" needs a "name".`, "provider");
  if (typeof n.description === "string" && n.description.length > 60 * 10) add(c, "info", "Descriptions over ~60 words are truncated in the course carousel.");
};

const RULES: Record<string, Rule> = {
  Article: article, NewsArticle: article, BlogPosting: article, TechArticle: article, Report: article,
  Product: product, ProductGroup: product,
  Organization: organization, Corporation: organization, NGO: organization, OnlineStore: organization, EducationalOrganization: organization,
  LocalBusiness: localBusiness, Restaurant: localBusiness, Store: localBusiness, Dentist: localBusiness, MedicalBusiness: localBusiness, AutoRepair: localBusiness, CafeOrCoffeeShop: localBusiness, Bakery: localBusiness, Hotel: localBusiness, BarOrPub: localBusiness,
  BreadcrumbList: breadcrumbs, FAQPage: faq, HowTo: howTo,
  Event: event, MusicEvent: event, BusinessEvent: event, EducationEvent: event, SportsEvent: event, TheaterEvent: event, Festival: event,
  Recipe: recipe, JobPosting: jobPosting, WebSite: website, Person: person, VideoObject: video,
  SoftwareApplication: software, MobileApplication: software, WebApplication: software, VideoGame: software,
  Course: course,
};

export const SUPPORTED_TYPES = [...new Set(Object.keys(RULES))];

export function validateEntity(e: Entity, blocks: Block[]): Issue[] {
  const c: Ctx = { issues: [], path: e.path };
  const n = e.node;
  const ctxOwner = blocks[e.block]?.value as Record<string, unknown> | undefined;
  const context = n["@context"] ?? (ctxOwner && !Array.isArray(ctxOwner) ? ctxOwner["@context"] : undefined);
  if (!context) add(c, "error", `Missing "@context" — use "https://schema.org".`);
  else if (!/schema\.org/.test(JSON.stringify(context))) add(c, "warning", `"@context" is ${JSON.stringify(context)}, not schema.org.`);
  else if (/http:\/\/schema\.org/.test(JSON.stringify(context))) add(c, "info", `"@context" uses http://; https://schema.org is preferred.`);
  const types = typesOf(n);
  if (!types.length) {
    add(c, "error", `Missing "@type".`);
    return c.issues;
  }
  let known = false;
  for (const t of types) {
    const r = RULES[t];
    if (r) {
      r(c, n);
      known = true;
    }
  }
  if (!known) add(c, "info", `No rich-result rules for "${types.join(", ")}" — only generic checks ran.`);
  // Generic: empty strings and placeholder text.
  for (const [k, v] of Object.entries(n)) {
    if (v === "") add(c, "warning", `"${k}" is an empty string.`, k);
    if (typeof v === "string" && /lorem ipsum|TODO|\{\{.*\}\}|\[insert/i.test(v)) add(c, "warning", `"${k}" looks like placeholder text: "${v.slice(0, 40)}".`, k);
  }
  if (!c.issues.some((i) => i.level === "error" || i.level === "warning")) add(c, "ok", `${types.join(", ")} looks complete for rich results.`);
  return c.issues.map((i) => ({ ...i, line: e.line }));
}

/** Key properties worth showing in a table for a given entity. */
export function keyProps(n: Record<string, unknown>): string {
  const keys = ["name", "headline", "title", "url", "price", "startDate", "datePublished", "ratingValue"];
  const parts: string[] = [];
  for (const k of keys) if (present(n[k])) parts.push(`${k}: ${textOf(n[k]).slice(0, 60)}`);
  const o = asObj(n.offers);
  if (o && present(o.price)) parts.push(`price: ${String(o.price)} ${String(o.priceCurrency ?? "")}`.trim());
  const ar = asObj(n.aggregateRating);
  if (ar) parts.push(`rating: ${String(ar.ratingValue)}/${String(ar.bestRating ?? 5)} (${String(ar.ratingCount ?? ar.reviewCount ?? "?")})`);
  if (Array.isArray(n.itemListElement)) parts.push(`${n.itemListElement.length} items`);
  if (Array.isArray(n.mainEntity)) parts.push(`${n.mainEntity.length} questions`);
  return parts.join(" · ") || Object.keys(n).filter((k) => !k.startsWith("@")).slice(0, 5).join(", ");
}

/* ── rich-result preview (escaped HTML) ───────────────────────────── */

export const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const host = (u: unknown) => {
  try {
    return new URL(String(u)).hostname.replace(/^www\./, "");
  } catch {
    return "example.com";
  }
};
const stars = (v: number, best = 5) => {
  const n = Math.max(0, Math.min(5, Math.round((v / (best || 5)) * 5 * 2) / 2 || 0));
  return "★".repeat(Math.floor(n)) + (n % 1 ? "⯪" : "") + "☆".repeat(5 - Math.ceil(n));
};
const fmtDate = (s: unknown) => {
  const d = new Date(String(s));
  return Number.isNaN(d.getTime()) ? esc(s) : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};
const dur = (s: unknown) => {
  const m = String(s ?? "").match(/^PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!m) return "";
  return [m[1] && `${m[1]} hr`, m[2] && `${m[2]} min`].filter(Boolean).join(" ");
};
const thumb = (label: string) => `<div class="rr-thumb">${esc(label)}</div>`;

export function richPreview(e: Entity): string {
  const n = e.node;
  const t = typesOf(n);
  const url = textOf(n.url ?? n["@id"] ?? n.mainEntityOfPage ?? asObj(n.offers)?.url);
  const crumbs = `<div class="rr-url">${esc(host(url))} › ${esc(t[0] ?? "")}</div>`;
  const is = (...xs: string[]) => xs.some((x) => t.includes(x));
  const rating = (v: unknown) => {
    const r = asObj(v);
    if (!r) return "";
    const val = Number(r.ratingValue), best = Number(r.bestRating ?? 5);
    return `<div class="rr-rating"><span class="rr-stars">${stars(val, best)}</span> Rating: ${esc(r.ratingValue)} · ${esc(r.ratingCount ?? r.reviewCount ?? "")} ${r.reviewCount ? "reviews" : "votes"}</div>`;
  };
  if (is("Product", "ProductGroup", "SoftwareApplication", "MobileApplication", "WebApplication")) {
    const o = asObj(n.offers);
    const price = o ? (o.price !== undefined ? `${esc(o.priceCurrency ?? "")} ${esc(o.price)}` : o.lowPrice !== undefined ? `From ${esc(o.priceCurrency ?? "")} ${esc(o.lowPrice)}` : "") : "";
    const avail = o?.availability ? String(o.availability).replace(/.*\//, "").replace(/([a-z])([A-Z])/g, "$1 $2") : "";
    return `<div class="rr">${thumb("image")}<div>${crumbs}<div class="rr-title">${esc(textOf(n.name))}</div>${rating(n.aggregateRating)}<div class="rr-meta">${price ? `<b>${price}</b>` : ""}${avail ? ` · <span class="rr-ok">${esc(avail)}</span>` : ""}${n.brand ? ` · ${esc(textOf(n.brand))}` : ""}</div><div class="rr-desc">${esc(String(n.description ?? "").slice(0, 160))}</div></div></div>`;
  }
  if (is("Article", "NewsArticle", "BlogPosting", "TechArticle")) {
    return `<div class="rr">${thumb("image")}<div>${crumbs}<div class="rr-title">${esc(textOf(n.headline ?? n.name))}</div><div class="rr-meta">${n.datePublished ? fmtDate(n.datePublished) : ""}${n.author ? ` — ${esc(textOf(n.author))}` : ""}</div><div class="rr-desc">${esc(String(n.description ?? "").slice(0, 160))}</div></div></div>`;
  }
  if (is("Recipe")) {
    const time = dur(n.totalTime ?? n.cookTime);
    return `<div class="rr rr-card">${thumb("photo")}<div><div class="rr-title">${esc(textOf(n.name))}</div>${rating(n.aggregateRating)}<div class="rr-meta">${time ? esc(time) : ""}${asObj(n.nutrition)?.calories ? ` · ${esc(asObj(n.nutrition)!.calories)}` : ""}${n.recipeYield ? ` · ${esc(textOf(n.recipeYield))}` : ""}</div><div class="rr-desc">${Array.isArray(n.recipeIngredient) ? esc((n.recipeIngredient as unknown[]).slice(0, 4).join(", ")) + "…" : ""}</div></div></div>`;
  }
  if (is("Event", "MusicEvent", "BusinessEvent", "EducationEvent", "SportsEvent", "TheaterEvent", "Festival")) {
    const loc = asObj(n.location);
    const d = new Date(String(n.startDate));
    const day = Number.isNaN(d.getTime()) ? "?" : String(d.getDate());
    const mon = Number.isNaN(d.getTime()) ? "" : d.toLocaleString("en-GB", { month: "short" }).toUpperCase();
    return `<div class="rr">${crumbs}</div><div class="rr-event"><div class="rr-date"><b>${esc(day)}</b><span>${esc(mon)}</span></div><div><div class="rr-title">${esc(textOf(n.name))}</div><div class="rr-meta">${esc(textOf(loc?.name ?? loc?.url))}${loc && asObj(loc.address) ? `, ${esc(textOf(asObj(loc.address)!.addressLocality))}` : ""}</div></div></div>`;
  }
  if (is("FAQPage")) {
    const qs = (Array.isArray(n.mainEntity) ? n.mainEntity : [n.mainEntity]).filter(Boolean).slice(0, 4) as Record<string, unknown>[];
    return `<div class="rr">${crumbs}<div class="rr-title">Frequently asked questions</div>${qs.map((q) => `<details class="rr-faq"><summary>${esc(q.name)}</summary><p>${esc(textOf(asObj(q.acceptedAnswer)?.text))}</p></details>`).join("")}</div>`;
  }
  if (is("BreadcrumbList")) {
    const items = (n.itemListElement as Record<string, unknown>[]) ?? [];
    return `<div class="rr"><div class="rr-url">${items.map((i) => esc(textOf(i.name ?? asObj(i.item)?.name))).join(" › ")}</div><div class="rr-title">Page title</div><div class="rr-desc">Breadcrumbs replace the URL line in the search result.</div></div>`;
  }
  if (is("HowTo")) {
    const steps = (Array.isArray(n.step) ? n.step : [n.step]).filter(Boolean).slice(0, 5);
    return `<div class="rr">${crumbs}<div class="rr-title">${esc(textOf(n.name))}</div><div class="rr-meta">${esc(dur(n.totalTime))}</div><ol class="rr-steps">${steps.map((s) => `<li>${esc(typeof s === "string" ? s : textOf((s as Record<string, unknown>).name ?? (s as Record<string, unknown>).text))}</li>`).join("")}</ol></div>`;
  }
  if (is("JobPosting")) {
    const org = textOf(n.hiringOrganization);
    const loc = asObj(asObj(n.jobLocation)?.address);
    const sal = asObj(n.baseSalary);
    const sv = asObj(sal?.value);
    return `<div class="rr rr-card"><div><div class="rr-title">${esc(textOf(n.title))}</div><div class="rr-meta">${esc(org)} · ${esc(loc ? textOf(loc.addressLocality) : n.jobLocationType === "TELECOMMUTE" ? "Remote" : "")}</div><div class="rr-meta">${sv ? `${esc(sal!.currency)} ${esc(sv.value ?? `${sv.minValue ?? ""}–${sv.maxValue ?? ""}`)} per ${esc(String(sv.unitText ?? "").toLowerCase())}` : ""}${n.employmentType ? ` · ${esc(textOf(n.employmentType).replace("_", " ").toLowerCase())}` : ""}</div><div class="rr-desc">Posted ${fmtDate(n.datePosted)}</div></div></div>`;
  }
  if (is("VideoObject")) {
    return `<div class="rr">${thumb("▶ " + (dur(n.duration) || "video"))}<div>${crumbs}<div class="rr-title">${esc(textOf(n.name))}</div><div class="rr-meta">${n.uploadDate ? fmtDate(n.uploadDate) : ""}</div><div class="rr-desc">${esc(String(n.description ?? "").slice(0, 140))}</div></div></div>`;
  }
  if (is("Course")) {
    return `<div class="rr rr-card"><div><div class="rr-meta">Course · ${esc(textOf(n.provider))}</div><div class="rr-title">${esc(textOf(n.name))}</div><div class="rr-desc">${esc(String(n.description ?? "").slice(0, 160))}</div></div></div>`;
  }
  if (is("LocalBusiness", "Restaurant", "Store", "Dentist", "CafeOrCoffeeShop", "Bakery", "Hotel", "BarOrPub", "AutoRepair", "MedicalBusiness")) {
    const a = asObj(n.address);
    return `<div class="rr rr-card"><div><div class="rr-title">${esc(textOf(n.name))}</div>${rating(n.aggregateRating)}<div class="rr-meta">${esc(t[0])}${n.priceRange ? ` · ${esc(n.priceRange)}` : ""}</div><div class="rr-desc">${a ? esc([a.streetAddress, a.addressLocality, a.postalCode].filter(Boolean).join(", ")) : esc(textOf(n.address))}${n.telephone ? ` · ${esc(n.telephone)}` : ""}</div></div></div>`;
  }
  if (is("Organization", "Corporation", "Person", "WebSite", "NGO", "EducationalOrganization", "OnlineStore")) {
    return `<div class="rr rr-card">${thumb(is("Person") ? "photo" : "logo")}<div><div class="rr-title">${esc(textOf(n.name))}</div><div class="rr-meta">${esc(is("Person") ? textOf(n.jobTitle) : t[0])}</div><div class="rr-desc">${esc(host(n.url))}${Array.isArray(n.sameAs) ? ` · ${(n.sameAs as unknown[]).length} profiles` : ""}</div></div></div>`;
  }
  return `<div class="rr">${crumbs}<div class="rr-title">${esc(textOf(n.name ?? n.headline) || t.join(", "))}</div><div class="rr-desc">No rich-result layout for this type.</div></div>`;
}

export const RICH_CSS = `
.rr{display:flex;gap:14px;padding:14px 16px;border:1px solid #e3e3e3;border-radius:10px;background:#fff;margin:0 0 12px;font-family:arial,sans-serif;max-width:640px;flex-wrap:wrap}
.rr>div{flex:1;min-width:200px}
.rr-thumb{flex:none!important;min-width:0!important;width:92px;height:92px;border-radius:8px;background:repeating-linear-gradient(45deg,#e8eaed,#e8eaed 8px,#f1f3f4 8px,#f1f3f4 16px);display:flex;align-items:center;justify-content:center;color:#70757a;font-size:12px}
.rr-url{font-size:12.5px;color:#4d5156;margin-bottom:2px}
.rr-title{font-size:19px;color:#1a0dab;line-height:1.3;margin:2px 0}
.rr-meta{font-size:13.5px;color:#4d5156;margin:2px 0}
.rr-desc{font-size:13.5px;color:#4d5156;line-height:1.5}
.rr-rating{font-size:13px;color:#70757a}.rr-stars{color:#e7711b;letter-spacing:1px}
.rr-ok{color:#188038}
.rr-event{display:flex;gap:14px;align-items:center;padding:10px 16px;border:1px solid #e3e3e3;border-top:0;margin:-12px 0 12px;border-radius:0 0 10px 10px;max-width:640px;background:#fff;font-family:arial,sans-serif}
.rr-date{display:flex;flex-direction:column;align-items:center;min-width:44px;padding:4px;border-radius:8px;background:#e8f0fe;color:#1967d2}.rr-date b{font-size:20px}.rr-date span{font-size:11px}
.rr-faq{border-top:1px solid #eee;padding:6px 0;font-size:14px}.rr-faq summary{cursor:pointer;color:#202124}.rr-faq p{margin:6px 0 0;color:#4d5156}
.rr-steps{margin:6px 0 0;padding-left:20px;font-size:13.5px;color:#4d5156}
`;
