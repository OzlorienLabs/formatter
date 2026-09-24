/**
 * On-page SEO audit of pasted HTML. Parses with DOMParser (never fetches
 * anything — not even og:image) and scores weighted checks.
 */
import { entitiesOf, extractBlocks, esc } from "./F-jsonld";

export type Check = { id: string; group: string; label: string; weight: number; status: "pass" | "warn" | "fail" | "info"; detail: string; score: number };

export type SeoReport = {
  score: number;
  checks: Check[];
  title: string;
  description: string;
  canonical: string;
  lang: string;
  robots: string;
  headings: { level: number; text: string; skipped: boolean }[];
  metas: [string, string, string][];
  links: { href: string; text: string; kind: "internal" | "external" | "anchor" | "other"; rel: string }[];
  images: { src: string; alt: string | null; width: string; height: string; loading: string }[];
  og: Record<string, string>;
  twitter: Record<string, string>;
  hreflang: { lang: string; href: string }[];
  jsonld: { types: string[]; errors: string[]; values: unknown[] };
  words: number;
  favicon: string;
  host: string;
};

const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

export function auditHtml(src: string, siteOverride = ""): SeoReport {
  const doc = new DOMParser().parseFromString(src, "text/html");
  const meta = (sel: string) => clean(doc.querySelector(sel)?.getAttribute("content"));
  const title = clean(doc.querySelector("title")?.textContent);
  const description = meta('meta[name="description" i]');
  const canonical = clean(doc.querySelector('link[rel~="canonical" i]')?.getAttribute("href"));
  const robots = meta('meta[name="robots" i]') || meta('meta[name="googlebot" i]');
  const viewport = meta('meta[name="viewport" i]');
  const lang = clean(doc.documentElement.getAttribute("lang"));
  const charset = doc.querySelector("meta[charset]")?.getAttribute("charset") ?? (/charset=/i.test(meta('meta[http-equiv="content-type" i]')) ? meta('meta[http-equiv="content-type" i]').replace(/.*charset=/i, "") : "");
  const favicon = clean(doc.querySelector('link[rel~="icon" i], link[rel="shortcut icon" i], link[rel="apple-touch-icon" i]')?.getAttribute("href"));

  let host = siteOverride;
  for (const u of [canonical, meta('meta[property="og:url"]')]) {
    if (host) break;
    try {
      host = new URL(u).hostname;
    } catch {
      /* not absolute */
    }
  }

  const og: Record<string, string> = {};
  const twitter: Record<string, string> = {};
  const metas: [string, string, string][] = [];
  doc.querySelectorAll("meta").forEach((m) => {
    const key = m.getAttribute("name") ?? m.getAttribute("property") ?? m.getAttribute("http-equiv") ?? (m.hasAttribute("charset") ? "charset" : "");
    const val = m.getAttribute("content") ?? m.getAttribute("charset") ?? "";
    const attr = m.hasAttribute("property") ? "property" : m.hasAttribute("http-equiv") ? "http-equiv" : m.hasAttribute("charset") ? "charset" : "name";
    if (!key) return;
    metas.push([attr, key, val]);
    if (/^og:/i.test(key)) og[key.toLowerCase()] = val;
    if (/^twitter:/i.test(key)) twitter[key.toLowerCase()] = val;
  });
  doc.querySelectorAll("link[rel]").forEach((l) => metas.push(["link", `rel=${l.getAttribute("rel")}${l.getAttribute("hreflang") ? ` hreflang=${l.getAttribute("hreflang")}` : ""}`, l.getAttribute("href") ?? ""]));

  // Headings
  const headings: SeoReport["headings"] = [];
  let prev = 0;
  doc.querySelectorAll("h1,h2,h3,h4,h5,h6").forEach((h) => {
    const level = Number(h.tagName[1]);
    headings.push({ level, text: clean(h.textContent) || "(empty)", skipped: prev > 0 && level > prev + 1 });
    prev = level;
  });

  // Links
  const links: SeoReport["links"] = [];
  doc.querySelectorAll("a[href]").forEach((a) => {
    const href = a.getAttribute("href") ?? "";
    let kind: "internal" | "external" | "anchor" | "other" = "internal";
    if (href.startsWith("#")) kind = "anchor";
    else if (/^(mailto|tel|javascript|data):/i.test(href)) kind = "other";
    else if (/^(https?:)?\/\//i.test(href)) {
      try {
        kind = host && new URL(href, "https://x.invalid").hostname.replace(/^www\./, "") === host.replace(/^www\./, "") ? "internal" : "external";
      } catch {
        kind = "external";
      }
    }
    links.push({ href, text: clean(a.textContent) || clean(a.querySelector("img")?.getAttribute("alt")) || "", kind, rel: a.getAttribute("rel") ?? "" });
  });

  const images: SeoReport["images"] = Array.from(doc.querySelectorAll("img")).map((i) => ({
    src: i.getAttribute("src") ?? i.getAttribute("data-src") ?? "",
    alt: i.getAttribute("alt"),
    width: i.getAttribute("width") ?? "",
    height: i.getAttribute("height") ?? "",
    loading: i.getAttribute("loading") ?? "",
  }));

  const hreflang = Array.from(doc.querySelectorAll('link[rel~="alternate" i][hreflang]')).map((l) => ({ lang: l.getAttribute("hreflang") ?? "", href: l.getAttribute("href") ?? "" }));

  // JSON-LD
  const blocks = extractBlocks(Array.from(doc.querySelectorAll('script[type="application/ld+json" i]')).map((s) => `<script type="application/ld+json">${s.textContent}</script>`).join("\n"));
  const jsonld = { types: entitiesOf(blocks).map((e) => e.type), errors: blocks.filter((b) => b.error).map((b) => b.error!), values: blocks.filter((b) => b.value !== undefined).map((b) => b.value) };

  // Word count of visible body text
  const body = doc.body?.cloneNode(true) as HTMLElement | undefined;
  body?.querySelectorAll("script,style,noscript,template,svg,nav,footer").forEach((n) => n.remove());
  const text = clean(body?.textContent);
  const words = text ? text.split(" ").filter((w) => /[\p{L}\p{N}]/u.test(w)).length : 0;

  /* ── checks ── */
  const checks: Check[] = [];
  const add = (id: string, group: string, label: string, weight: number, status: Check["status"], detail: string, partial?: number) =>
    checks.push({ id, group, label, weight, status, detail, score: status === "pass" ? weight : status === "warn" ? weight * (partial ?? 0.5) : status === "info" ? weight : 0 });

  add("title", "Content", "Title tag", 10, title ? "pass" : "fail", title ? `"${title}"` : "No <title> — the most important on-page signal.");
  if (title) {
    const n = [...title].length;
    add("title-len", "Content", "Title length", 5, n >= 30 && n <= 60 ? "pass" : n < 30 ? "warn" : "warn", `${n} characters (aim for 30–60; Google truncates around 580px ≈ 60 chars).`);
  }
  add("desc", "Content", "Meta description", 10, description ? "pass" : "fail", description ? `"${description.slice(0, 90)}${description.length > 90 ? "…" : ""}"` : "No meta description — Google will improvise a snippet.");
  if (description) {
    const n = [...description].length;
    add("desc-len", "Content", "Description length", 5, n >= 70 && n <= 160 ? "pass" : "warn", `${n} characters (aim for 70–160).`);
  }
  const h1s = headings.filter((h) => h.level === 1);
  add("h1", "Content", "One H1", 8, h1s.length === 1 ? "pass" : h1s.length === 0 ? "fail" : "warn", h1s.length === 1 ? `"${h1s[0].text}"` : h1s.length ? `${h1s.length} H1 elements — use exactly one.` : "No H1 heading.");
  const skipped = headings.filter((h) => h.skipped);
  add("hierarchy", "Content", "Heading hierarchy", 4, !headings.length ? "warn" : skipped.length ? "warn" : "pass", skipped.length ? `Skipped levels at: ${skipped.map((h) => `H${h.level} "${h.text.slice(0, 30)}"`).join(", ")}` : `${headings.length} headings in order.`);
  add("words", "Content", "Content length", 4, words >= 300 ? "pass" : words >= 100 ? "warn" : "fail", `${words.toLocaleString()} words of body text${words < 300 ? " — thin content (300+ recommended)" : ""}.`);
  if (title && h1s[0] && title.toLowerCase() === h1s[0].text.toLowerCase()) add("title-h1", "Content", "Title vs H1", 0, "info", "Title and H1 are identical — fine, but a slightly different title can target more queries.");

  const noindex = /noindex/i.test(robots);
  add("robots", "Indexing", "Robots meta", 6, noindex ? "fail" : "pass", noindex ? `robots="${robots}" — this page asks not to be indexed.` : robots ? `robots="${robots}"` : "No robots meta (defaults to index, follow).");
  let canonAbs = false;
  try {
    canonAbs = !!new URL(canonical).protocol;
  } catch {
    /* relative */
  }
  add("canonical", "Indexing", "Canonical URL", 5, canonical ? (canonAbs ? "pass" : "warn") : "warn", canonical ? (canonAbs ? canonical : `"${canonical}" is relative — use an absolute URL.`) : "No rel=canonical — duplicates may split ranking signals.");
  add("lang", "Indexing", "Language", 4, lang ? "pass" : "warn", lang ? `<html lang="${lang}">` : "No lang attribute on <html>.");
  if (hreflang.length) {
    const hasDefault = hreflang.some((h) => h.lang.toLowerCase() === "x-default");
    const bad = hreflang.filter((h) => !/^(x-default|[a-z]{2,3}(-[A-Za-z]{2}|-\d{3}|-[A-Z][a-z]{3})?)$/i.test(h.lang));
    const self = canonical && hreflang.some((h) => h.href === canonical);
    const relative = hreflang.filter((h) => !/^https?:\/\//.test(h.href));
    const probs = [!hasDefault && "no x-default", bad.length && `invalid codes: ${bad.map((b) => b.lang).join(", ")}`, canonical && !self && "no self-referencing entry", relative.length && "relative URLs"].filter(Boolean);
    add("hreflang", "Indexing", "hreflang", 3, probs.length ? "warn" : "pass", `${hreflang.length} alternates (${hreflang.map((h) => h.lang).join(", ")})${probs.length ? ` — ${probs.join("; ")}` : ""}.`);
  }

  add("viewport", "Technical", "Mobile viewport", 5, viewport ? (/width=device-width/.test(viewport) ? "pass" : "warn") : "fail", viewport ? `"${viewport}"${/user-scalable=no|maximum-scale=1(\.0)?\b/.test(viewport) ? " — disabling zoom hurts accessibility" : ""}` : "No viewport meta — the page will not be mobile-friendly.");
  add("charset", "Technical", "Charset", 3, charset ? (/utf-?8/i.test(charset) ? "pass" : "warn") : "warn", charset ? `charset=${charset}` : "No <meta charset> declared.");
  add("favicon", "Technical", "Favicon", 2, favicon ? "pass" : "warn", favicon || "No icon link (Google shows a favicon next to results).");
  const missingAlt = images.filter((i) => i.alt === null);
  add("alt", "Technical", "Image alt text", 6, !images.length ? "pass" : missingAlt.length ? (missingAlt.length === images.length ? "fail" : "warn") : "pass", images.length ? `${images.length - missingAlt.length} of ${images.length} images have alt${missingAlt.length ? `; missing on ${missingAlt.slice(0, 3).map((i) => i.src.split("/").pop()).join(", ")}${missingAlt.length > 3 ? "…" : ""}` : ""}.` : "No images.", 1 - missingAlt.length / Math.max(1, images.length));
  const noDims = images.filter((i) => !i.width || !i.height);
  if (images.length) add("img-dims", "Technical", "Image dimensions", 2, noDims.length ? "warn" : "pass", noDims.length ? `${noDims.length} images lack width/height (causes layout shift).` : "All images declare width and height.");
  const internal = links.filter((l) => l.kind === "internal").length;
  const external = links.filter((l) => l.kind === "external").length;
  const nofollow = links.filter((l) => /nofollow|ugc|sponsored/i.test(l.rel)).length;
  const emptyText = links.filter((l) => !l.text && l.kind !== "anchor").length;
  add("links", "Technical", "Links", 3, internal ? (emptyText ? "warn" : "pass") : "warn", `${internal} internal, ${external} external, ${nofollow} nofollow/ugc/sponsored${emptyText ? `; ${emptyText} with no anchor text` : ""}.`);

  const ogKeys = ["og:title", "og:description", "og:image", "og:url", "og:type"];
  const ogHave = ogKeys.filter((k) => og[k]);
  add("og", "Social", "Open Graph", 8, ogHave.length === 5 ? "pass" : ogHave.length ? "warn" : "fail", ogHave.length === 5 ? "All five core og: tags present." : `Missing ${ogKeys.filter((k) => !og[k]).join(", ")}.`, ogHave.length / 5);
  if (og["og:image"] && !/^https?:\/\//.test(og["og:image"])) add("og-image", "Social", "og:image URL", 1, "warn", "og:image should be an absolute URL.");
  add("twitter", "Social", "Twitter card", 3, twitter["twitter:card"] ? "pass" : "warn", twitter["twitter:card"] ? `twitter:card=${twitter["twitter:card"]}` : "No twitter:card (X falls back to Open Graph, but the card type must be set).");

  add("jsonld", "Structured data", "JSON-LD", 5, jsonld.errors.length ? "fail" : jsonld.types.length ? "pass" : "warn", jsonld.errors.length ? `${jsonld.errors.length} block(s) do not parse: ${jsonld.errors[0]}` : jsonld.types.length ? `Types: ${jsonld.types.join(", ")}` : "No structured data — rich results need JSON-LD.");

  const total = checks.reduce((n, c) => n + (c.status === "info" ? 0 : c.weight), 0);
  const got = checks.reduce((n, c) => n + (c.status === "info" ? 0 : c.score), 0);
  const score = total ? Math.round((got / total) * 100) : 0;

  return { score, checks, title, description, canonical, lang, robots, headings, metas, links, images, og, twitter, hreflang, jsonld, words, favicon, host };
}

/* ── previews ──────────────────────────────────────────────────────── */

const trunc = (s: string, n: number) => ([...s].length > n ? [...s].slice(0, n - 1).join("").trimEnd() + " …" : s);

export function serpHtml(r: SeoReport): string {
  const url = r.canonical || r.og["og:url"] || "https://example.com/page";
  let crumbs = url;
  try {
    const u = new URL(url);
    crumbs = `${u.hostname}${u.pathname.split("/").filter(Boolean).map((p) => ` › ${p}`).join("")}`;
  } catch {
    /* keep raw */
  }
  const site = r.og["og:site_name"] || r.host || "example.com";
  const mobileTitle = trunc(r.title || "(no title)", 75);
  return `<div class="serp-wrap">
<div class="serp-lbl">Desktop</div>
<div class="serp"><div class="serp-site"><span class="serp-fav">${esc(site[0]?.toUpperCase() ?? "•")}</span><div><div class="serp-name">${esc(site)}</div><div class="serp-crumb">${esc(crumbs)}</div></div></div>
<div class="serp-title">${esc(trunc(r.title || "(no title)", 60))}</div>
<div class="serp-desc">${esc(trunc(r.description || "No meta description — Google would pick text from the page instead.", 158))}</div></div>
<div class="serp-lbl">Mobile</div>
<div class="serp serp-m"><div class="serp-site"><span class="serp-fav">${esc(site[0]?.toUpperCase() ?? "•")}</span><div><div class="serp-name">${esc(site)}</div><div class="serp-crumb">${esc(crumbs)}</div></div></div>
<div class="serp-title">${esc(mobileTitle)}</div>
<div class="serp-desc">${esc(trunc(r.description || "", 120))}</div></div>
<p class="serp-note">Title ${[...r.title].length}/60 · Description ${[...r.description].length}/160 characters. Google truncates by pixel width, so treat these as guides.</p>
</div>`;
}

export function socialHtml(r: SeoReport): string {
  const title = r.og["og:title"] || r.twitter["twitter:title"] || r.title || "(no title)";
  const desc = r.og["og:description"] || r.twitter["twitter:description"] || r.description || "";
  const img = r.og["og:image"] || r.twitter["twitter:image"] || "";
  let domain = r.host || "example.com";
  try {
    domain = new URL(r.og["og:url"] || r.canonical).hostname;
  } catch {
    /* keep */
  }
  const large = (r.twitter["twitter:card"] ?? "summary_large_image") === "summary_large_image";
  const ph = (h: number) => `<div class="sc-img" style="height:${h}px">${img ? `Image: ${esc(img.split("/").pop() ?? img)}<br><small>(not fetched — previews stay offline)</small>` : "No og:image"}</div>`;
  return `<div class="sc-wrap">
<div class="serp-lbl">Facebook / LinkedIn</div>
<div class="sc">${ph(200)}<div class="sc-body"><div class="sc-domain">${esc(domain.toUpperCase())}</div><div class="sc-title">${esc(trunc(title, 88))}</div><div class="sc-desc">${esc(trunc(desc, 110))}</div></div></div>
<div class="serp-lbl">X (Twitter) — ${esc(r.twitter["twitter:card"] ?? "no card type")}</div>
${large ? `<div class="sc sc-x">${ph(180)}<div class="sc-body"><div class="sc-title">${esc(trunc(title, 70))}</div><div class="sc-domain">From ${esc(domain)}</div></div></div>` : `<div class="sc sc-x sc-row"><div class="sc-img" style="width:120px;height:120px">${img ? "Image" : "No image"}</div><div class="sc-body"><div class="sc-domain">${esc(domain)}</div><div class="sc-title">${esc(trunc(title, 70))}</div><div class="sc-desc">${esc(trunc(desc, 100))}</div></div></div>`}
</div>`;
}

export function reportHtml(r: SeoReport): string {
  const tone = r.score >= 85 ? "#188038" : r.score >= 60 ? "#b98d00" : "#c5005e";
  const groups = [...new Set(r.checks.map((c) => c.group))];
  const icon = { pass: "✓", warn: "!", fail: "✕", info: "i" };
  const pass = r.checks.filter((c) => c.status === "pass").length;
  const warn = r.checks.filter((c) => c.status === "warn").length;
  const fail = r.checks.filter((c) => c.status === "fail").length;
  return `<div class="seo">
<div class="seo-top"><div class="seo-ring" style="background:conic-gradient(${tone} ${r.score * 3.6}deg, #eceae8 0)"><div><b style="color:${tone}">${r.score}</b><span>/ 100</span></div></div>
<div><div class="seo-h">${r.score >= 85 ? "Well optimised" : r.score >= 60 ? "Needs some work" : "Needs attention"}</div><div class="seo-sub"><span class="p">${pass} passed</span> · <span class="w">${warn} warnings</span> · <span class="f">${fail} failed</span> · ${r.words.toLocaleString()} words</div></div></div>
${groups
  .map(
    (g) => `<div class="seo-g">${esc(g)}</div>${r.checks
      .filter((c) => c.group === g)
      .map((c) => `<div class="seo-c ${c.status}"><span class="seo-i">${icon[c.status]}</span><div><b>${esc(c.label)}</b>${c.weight ? `<em>${Math.round(c.score)}/${c.weight}</em>` : ""}<div>${esc(c.detail)}</div></div></div>`)
      .join("")}`
  )
  .join("")}
</div>`;
}

export const SEO_CSS = `
.seo{max-width:760px}
.seo-top{display:flex;gap:18px;align-items:center;margin-bottom:10px}
.seo-ring{width:96px;height:96px;border-radius:50%;display:grid;place-items:center;flex:none}
.seo-ring>div{width:76px;height:76px;border-radius:50%;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center}
.seo-ring b{font-size:28px;line-height:1}.seo-ring span{font-size:11px;color:#777}
.seo-h{font-size:21px;font-weight:600}.seo-sub{font-size:14px;color:#555}.seo-sub .p{color:#188038}.seo-sub .w{color:#9a7400}.seo-sub .f{color:#c5005e}
.seo-g{margin:14px 0 6px;font-size:11.5px;letter-spacing:.1em;text-transform:uppercase;color:#777}
.seo-c{display:flex;gap:10px;padding:7px 10px;border-radius:6px;margin-bottom:4px;font-size:14px;line-height:1.45}
.seo-c b{font-weight:600;margin-right:8px}.seo-c em{font-style:normal;font-size:11.5px;color:#888;font-family:var(--font-mono)}
.seo-c div div{color:#444;word-break:break-word}
.seo-c.pass{background:rgba(0,160,90,.07)}.seo-c.warn{background:rgba(237,187,0,.12)}.seo-c.fail{background:rgba(214,0,108,.07)}.seo-c.info{background:rgba(0,136,176,.06)}
.seo-i{flex:none;width:20px;height:20px;border-radius:50%;display:grid;place-items:center;font-size:12px;font-weight:700;color:#fff}
.pass .seo-i{background:#188038}.warn .seo-i{background:#c49a00}.fail .seo-i{background:#c5005e}.info .seo-i{background:#0088b0}
.serp-wrap,.sc-wrap{max-width:640px;font-family:arial,sans-serif}
.serp-lbl{font-size:11.5px;letter-spacing:.1em;text-transform:uppercase;color:#777;margin:10px 0 6px;font-family:var(--font-sans,inherit)}
.serp{background:#fff;border:1px solid #ebebeb;border-radius:10px;padding:14px 16px}
.serp-m{max-width:400px}
.serp-site{display:flex;gap:10px;align-items:center}
.serp-fav{width:26px;height:26px;border-radius:50%;background:#f1f3f4;display:grid;place-items:center;font-size:13px;color:#5f6368;border:1px solid #e3e3e3}
.serp-name{font-size:14px;color:#202124}.serp-crumb{font-size:12px;color:#4d5156}
.serp-title{font-size:20px;color:#1a0dab;margin:6px 0 3px;line-height:1.3}
.serp-m .serp-title{font-size:18px}
.serp-desc{font-size:14px;color:#4d5156;line-height:1.58}
.serp-note{font-size:12.5px;color:#777}
.sc{border:1px solid #dadde1;background:#fff;max-width:520px;overflow:hidden}
.sc-x{border-radius:14px}.sc-row{display:flex}
.sc-img{background:repeating-linear-gradient(45deg,#e4e6eb,#e4e6eb 10px,#eef0f3 10px,#eef0f3 20px);display:flex;align-items:center;justify-content:center;text-align:center;color:#606770;font-size:13px;flex:none}
.sc-body{padding:10px 12px;background:#f0f2f5}.sc-x .sc-body{background:#fff}
.sc-domain{font-size:12px;color:#606770}.sc-title{font-size:16px;font-weight:600;color:#1d2129;margin:3px 0}.sc-desc{font-size:14px;color:#606770}
`;
