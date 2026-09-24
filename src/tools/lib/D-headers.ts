/**
 * Security headers: a builder config (CSP, HSTS, framing, referrer,
 * permissions, cross-origin isolation, CORS), emitters for ten server/host
 * formats, and an analyzer that grades pasted response headers.
 */

export const CSP_DIRECTIVES = [
  "default-src", "script-src", "style-src", "img-src", "connect-src", "font-src", "frame-src", "frame-ancestors",
  "object-src", "base-uri", "form-action", "worker-src", "manifest-src", "media-src",
] as const;

export const CSP_CHIPS = ["'self'", "'none'", "'unsafe-inline'", "'unsafe-eval'", "'strict-dynamic'", "https:", "data:", "blob:", "'nonce-{NONCE}'", "'sha256-…'", "*"];

import { PERMISSIONS, PRESETS, type HeaderConfig, type PermValue } from "./D-header-presets";

export { PERMISSIONS, PRESETS, type HeaderConfig, type PermValue };

export const defaultConfig = (): HeaderConfig => JSON.parse(JSON.stringify(PRESETS.spa.cfg));

export function parseConfig(s: string): HeaderConfig {
  const base = defaultConfig();
  if (!s.trim()) return base;
  try {
    const v = JSON.parse(s) as Partial<HeaderConfig>;
    return {
      ...base,
      ...v,
      csp: { ...base.csp, ...(v.csp ?? {}), directives: v.csp?.directives ?? base.csp.directives },
      hsts: { ...base.hsts, ...(v.hsts ?? {}) },
      cors: { ...base.cors, ...(v.cors ?? {}) },
      permissions: v.permissions ?? base.permissions,
    };
  } catch {
    return base;
  }
}

/* ── build ─────────────────────────────────────────────────────────────── */

export type Header = [name: string, value: string];

export function cspValue(c: HeaderConfig["csp"]): string {
  const parts: string[] = [];
  for (const d of CSP_DIRECTIVES) {
    const v = (c.directives[d] ?? "").trim().replace(/\s+/g, " ");
    if (v) parts.push(`${d} ${v}`);
  }
  for (const [d, v] of Object.entries(c.directives)) if (!(CSP_DIRECTIVES as readonly string[]).includes(d) && v.trim()) parts.push(`${d} ${v.trim()}`);
  if (c.upgrade && !c.reportOnly) parts.push("upgrade-insecure-requests");
  if (c.reportTo.trim()) parts.push(`report-to ${c.reportTo.trim()}`);
  return parts.join("; ");
}

const permValue = (v: PermValue) => (v === "none" ? "()" : v === "self" ? "(self)" : v === "all" ? "*" : `(self ${v.split(/[\s,]+/).filter(Boolean).map((o) => `"${o.replace(/"/g, "")}"`).join(" ")})`);

export function buildHeaders(c: HeaderConfig): { headers: Header[]; notes: string[] } {
  const h: Header[] = [];
  const notes: string[] = [];
  if (c.csp.enabled) {
    const v = cspValue(c.csp);
    if (v) h.push([c.csp.reportOnly ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy", v]);
    if (/\{NONCE\}/.test(v)) notes.push("Replace {NONCE} with a fresh random value on every response (and add it to your <script nonce> tags).");
    if (c.csp.reportTo.trim()) {
      h.push(["Reporting-Endpoints", `${c.csp.reportTo.trim()}="https://example.com/csp-reports"`]);
      notes.push("Point Reporting-Endpoints at your real collector URL.");
    }
  }
  if (c.hsts.enabled) h.push(["Strict-Transport-Security", `max-age=${c.hsts.maxAge}${c.hsts.includeSubDomains ? "; includeSubDomains" : ""}${c.hsts.preload ? "; preload" : ""}`]);
  if (c.hsts.enabled && c.hsts.preload && (c.hsts.maxAge < 31536000 || !c.hsts.includeSubDomains)) notes.push("hstspreload.org requires max-age ≥ 31536000 and includeSubDomains for preload.");
  if (c.xfo) h.push(["X-Frame-Options", c.xfo]);
  if (c.nosniff) h.push(["X-Content-Type-Options", "nosniff"]);
  if (c.referrer) h.push(["Referrer-Policy", c.referrer]);
  const perms = Object.entries(c.permissions).filter(([, v]) => v);
  if (perms.length) h.push(["Permissions-Policy", perms.map(([k, v]) => `${k}=${permValue(v)}`).join(", ")]);
  if (c.coop) h.push(["Cross-Origin-Opener-Policy", c.coop]);
  if (c.coep) h.push(["Cross-Origin-Embedder-Policy", c.coep]);
  if (c.corp) h.push(["Cross-Origin-Resource-Policy", c.corp]);
  if (c.cors.enabled) {
    const origins = c.cors.origins.split(/[\s,]+/).filter(Boolean);
    const single = origins.length === 1;
    h.push(["Access-Control-Allow-Origin", single ? origins[0] : origins[0] ?? "*"]);
    if (!single) {
      h.push(["Vary", "Origin"]);
      notes.push(`CORS allows one origin per response: echo the request's Origin when it is one of ${origins.join(", ")} (the nginx and Express outputs do this).`);
    }
    if (c.cors.methods.trim()) h.push(["Access-Control-Allow-Methods", c.cors.methods.trim()]);
    if (c.cors.headers.trim()) h.push(["Access-Control-Allow-Headers", c.cors.headers.trim()]);
    if (c.cors.expose.trim()) h.push(["Access-Control-Expose-Headers", c.cors.expose.trim()]);
    if (c.cors.credentials) h.push(["Access-Control-Allow-Credentials", "true"]);
    if (c.cors.maxAge) h.push(["Access-Control-Max-Age", String(c.cors.maxAge)]);
    if (c.cors.credentials && origins.includes("*")) notes.push("Browsers reject Access-Control-Allow-Origin: * together with credentials.");
  }
  return { headers: h, notes };
}

const js = (s: string) => JSON.stringify(s);

export const FORMATS: [string, string][] = [
  ["raw", "Raw headers"], ["nginx", "nginx"], ["apache", "Apache .htaccess"], ["caddy", "Caddy"], ["express", "Express + helmet"],
  ["next", "Next.js headers()"], ["vercel", "vercel.json"], ["netlify", "Netlify _headers"], ["cloudflare", "Cloudflare Pages _headers"], ["iis", "IIS web.config"],
];

export function render(c: HeaderConfig, fmt: string): { text: string; lang: "text" | "json" | "js" | "xml" | "ini" | "shell"; filename: string } {
  const { headers } = buildHeaders(c);
  const origins = c.cors.origins.split(/[\s,]+/).filter(Boolean);
  const multiCors = c.cors.enabled && origins.length > 1;
  switch (fmt) {
    case "nginx": {
      const lines = ["# server { … } or location / { … }  — `always` also sends them on 4xx/5xx"];
      if (multiCors)
        lines.unshift(`# in the http { } block:\nmap $http_origin $cors_origin {\n  default "";\n${origins.map((o) => `  ${js(o)} $http_origin;`).join("\n")}\n}\n`);
      for (const [k, v] of headers) lines.push(`add_header ${k} ${js(k === "Access-Control-Allow-Origin" && multiCors ? "$cors_origin" : v)} always;`);
      return { text: lines.join("\n"), lang: "shell", filename: "security-headers.conf" };
    }
    case "apache": {
      const lines = ["<IfModule mod_headers.c>"];
      if (multiCors) lines.push(`  SetEnvIf Origin "^(${origins.map((o) => o.replace(/[.]/g, "\\.")).join("|")})$" CORS_ORIGIN=$0`);
      for (const [k, v] of headers) {
        if (k === "Access-Control-Allow-Origin" && multiCors) lines.push(`  Header always set ${k} "%{CORS_ORIGIN}e" env=CORS_ORIGIN`);
        else lines.push(`  Header always set ${k} ${js(v)}`);
      }
      lines.push("  Header always unset X-Powered-By", "</IfModule>");
      return { text: lines.join("\n"), lang: "shell", filename: ".htaccess" };
    }
    case "caddy": {
      const lines = ["example.com {", "\theader {"];
      for (const [k, v] of headers) lines.push(`\t\t${k} ${js(v)}`);
      lines.push("\t\t-Server", "\t}", "\t# reverse_proxy localhost:3000", "}");
      return { text: lines.join("\n"), lang: "shell", filename: "Caddyfile" };
    }
    case "express": {
      const d = c.csp.directives;
      const camel = (s: string) => s.replace(/-([a-z])/g, (_, x) => x.toUpperCase());
      const dirs = Object.entries(d).filter(([, v]) => v.trim()).map(([k, v]) => `      ${camel(k)}: [${v.trim().split(/\s+/).map((x) => (x.includes("{NONCE}") ? "(req, res) => `'nonce-${res.locals.nonce}'`" : js(x))).join(", ")}],`);
      if (c.csp.upgrade && !c.csp.reportOnly) dirs.push("      upgradeInsecureRequests: [],");
      else dirs.push("      upgradeInsecureRequests: null,");
      const perms = Object.entries(c.permissions).filter(([, v]) => v);
      const out = [
        "// npm i express helmet" + (c.cors.enabled ? " cors" : ""),
        'const express = require("express");',
        'const helmet = require("helmet");',
        ...(c.cors.enabled ? ['const cors = require("cors");'] : []),
        ...(/\{NONCE\}/.test(cspValue(c.csp)) ? ['const crypto = require("node:crypto");'] : []),
        "",
        "const app = express();",
        'app.disable("x-powered-by");',
        ...(/\{NONCE\}/.test(cspValue(c.csp)) ? ["app.use((req, res, next) => { res.locals.nonce = crypto.randomBytes(16).toString(\"base64\"); next(); });"] : []),
        "",
        "app.use(",
        "  helmet({",
        c.csp.enabled
          ? `    contentSecurityPolicy: {\n      useDefaults: false,\n      reportOnly: ${c.csp.reportOnly},\n      directives: {\n${dirs.map((x) => "  " + x).join("\n")}\n      },\n    },`
          : "    contentSecurityPolicy: false,",
        c.hsts.enabled ? `    strictTransportSecurity: { maxAge: ${c.hsts.maxAge}, includeSubDomains: ${c.hsts.includeSubDomains}, preload: ${c.hsts.preload} },` : "    strictTransportSecurity: false,",
        c.xfo ? `    xFrameOptions: { action: ${js(c.xfo.toLowerCase())} },` : "    xFrameOptions: false,",
        `    xContentTypeOptions: ${c.nosniff},`,
        c.referrer ? `    referrerPolicy: { policy: ${js(c.referrer)} },` : "    referrerPolicy: false,",
        c.coop ? `    crossOriginOpenerPolicy: { policy: ${js(c.coop)} },` : "    crossOriginOpenerPolicy: false,",
        c.coep ? `    crossOriginEmbedderPolicy: { policy: ${js(c.coep)} },` : "    crossOriginEmbedderPolicy: false,",
        c.corp ? `    crossOriginResourcePolicy: { policy: ${js(c.corp)} },` : "    crossOriginResourcePolicy: false,",
        "  })",
        ");",
      ];
      if (perms.length) out.push("", "// helmet has no Permissions-Policy option", `app.use((req, res, next) => { res.setHeader("Permissions-Policy", ${js(perms.map(([k, v]) => `${k}=${permValue(v)}`).join(", "))}); next(); });`);
      if (c.cors.enabled)
        out.push(
          "",
          "app.use(",
          "  cors({",
          `    origin: [${origins.map(js).join(", ")}],`,
          `    methods: ${js(c.cors.methods)},`,
          `    allowedHeaders: ${js(c.cors.headers)},`,
          ...(c.cors.expose ? [`    exposedHeaders: ${js(c.cors.expose)},`] : []),
          `    credentials: ${c.cors.credentials},`,
          `    maxAge: ${c.cors.maxAge},`,
          "  })",
          ");"
        );
      return { text: out.join("\n"), lang: "js", filename: "security.js" };
    }
    case "next": {
      const list = headers.map(([k, v]) => `          { key: ${js(k)}, value: ${js(v)} },`).join("\n");
      return {
        text: `// next.config.js\n/** @type {import('next').NextConfig} */\nmodule.exports = {\n  poweredByHeader: false,\n  async headers() {\n    return [\n      {\n        source: "/(.*)",\n        headers: [\n${list}\n        ],\n      },\n    ];\n  },\n};${/\{NONCE\}/.test(cspValue(c.csp)) ? "\n\n// Nonces must be generated per request — set the CSP in middleware.ts instead of here." : ""}`,
        lang: "js",
        filename: "next.config.js",
      };
    }
    case "vercel":
      return { text: JSON.stringify({ headers: [{ source: "/(.*)", headers: headers.map(([key, value]) => ({ key, value })) }] }, null, 2), lang: "json", filename: "vercel.json" };
    case "netlify":
    case "cloudflare":
      return {
        text: `# ${fmt === "netlify" ? "Netlify" : "Cloudflare Pages"} — save as _headers in your publish directory\n/*\n${headers.map(([k, v]) => `  ${k}: ${v}`).join("\n")}${fmt === "cloudflare" ? "\n\n# Cloudflare Pages applies at most 100 header rules; values are sent verbatim." : ""}`,
        lang: "ini",
        filename: "_headers",
      };
    case "iis": {
      const x = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
      return {
        text: `<?xml version="1.0" encoding="UTF-8"?>\n<configuration>\n  <system.webServer>\n    <httpProtocol>\n      <customHeaders>\n        <remove name="X-Powered-By" />\n${headers.map(([k, v]) => `        <add name="${k}" value="${x(v)}" />`).join("\n")}\n      </customHeaders>\n    </httpProtocol>\n  </system.webServer>\n</configuration>`,
        lang: "xml",
        filename: "web.config",
      };
    }
    default:
      return { text: headers.map(([k, v]) => `${k}: ${v}`).join("\n"), lang: "text", filename: "headers.txt" };
  }
}

/* ── analyze ───────────────────────────────────────────────────────────── */

export type Check = { header: string; status: "pass" | "warn" | "fail" | "info"; value: string; points: number; max: number; message: string; fix?: string };

export function parseHeaderText(s: string): { headers: Map<string, string[]>; status?: string } {
  const headers = new Map<string, string[]>();
  let status: string | undefined;
  let last = "";
  for (const raw of s.split(/\r?\n/)) {
    const line = raw.replace(/^[<>]\s?/, ""); // curl -v prefixes
    if (!line.trim()) continue;
    if (/^HTTP\/[\d.]+\s+\d{3}/i.test(line.trim())) {
      status = line.trim();
      continue;
    }
    if (/^\s/.test(line) && last) {
      const arr = headers.get(last)!;
      arr[arr.length - 1] += " " + line.trim();
      continue;
    }
    const m = /^([A-Za-z0-9!#$%&'*+.^_`|~-]+)\s*:\s*(.*)$/.exec(line.trim());
    if (!m) continue;
    last = m[1].toLowerCase();
    headers.set(last, [...(headers.get(last) ?? []), m[2].trim()]);
  }
  return { headers, status };
}

export function parseCsp(v: string): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const part of v.split(";")) {
    const [name, ...vals] = part.trim().split(/\s+/);
    if (name) m.set(name.toLowerCase(), vals);
  }
  return m;
}

export function analyze(text: string): { checks: Check[]; score: number; grade: string; status?: string; count: number } {
  const { headers, status } = parseHeaderText(text);
  const get = (n: string) => headers.get(n)?.join(", ");
  const checks: Check[] = [];
  const add = (c: Check) => checks.push(c);

  // CSP
  const csp = get("content-security-policy");
  const cspRo = get("content-security-policy-report-only");
  let frameAncestors = false;
  if (csp) {
    const d = parseCsp(csp);
    frameAncestors = d.has("frame-ancestors");
    const script = d.get("script-src") ?? d.get("default-src") ?? [];
    let pts = 25;
    const probs: string[] = [];
    const hasNonceOrHash = script.some((x) => /^'(nonce|sha(256|384|512))-/.test(x));
    if (script.includes("'unsafe-inline'") && !hasNonceOrHash) { pts -= 10; probs.push("script-src allows 'unsafe-inline'"); }
    if (script.includes("'unsafe-eval'")) { pts -= 5; probs.push("script-src allows 'unsafe-eval'"); }
    if (script.some((x) => x === "*" || x === "https:" || x === "http:" || x === "data:")) { pts -= 5; probs.push(`script-src allows ${script.filter((x) => ["*", "https:", "http:", "data:"].includes(x)).join(" ")}`); }
    if (!d.has("default-src") && !d.has("script-src")) { pts -= 8; probs.push("no default-src or script-src — scripts are unrestricted"); }
    if (!d.has("object-src") && !(d.get("default-src") ?? []).includes("'none'")) { pts -= 2; probs.push("object-src not restricted"); }
    if (!d.has("base-uri")) { pts -= 2; probs.push("base-uri missing"); }
    add({ header: "Content-Security-Policy", status: probs.length ? (pts >= 18 ? "warn" : "fail") : "pass", value: csp, points: Math.max(0, pts), max: 25, message: probs.length ? probs.join("; ") : "Restricts script sources without unsafe keywords.", fix: probs.length ? "Use nonces or hashes instead of 'unsafe-inline', drop 'unsafe-eval', add object-src 'none' and base-uri 'self'." : undefined });
  } else if (cspRo) {
    add({ header: "Content-Security-Policy", status: "warn", value: `(report-only) ${cspRo}`, points: 8, max: 25, message: "Only a Report-Only policy is set — violations are reported, not blocked.", fix: "Enforce the policy once reports are clean." });
  } else add({ header: "Content-Security-Policy", status: "fail", value: "", points: 0, max: 25, message: "Missing. CSP is the main defence against XSS and data injection.", fix: "Start with default-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'." });

  // HSTS
  const hsts = get("strict-transport-security");
  if (hsts) {
    const age = Number(/max-age\s*=\s*"?(\d+)/i.exec(hsts)?.[1] ?? 0);
    const sub = /includesubdomains/i.test(hsts), pre = /preload/i.test(hsts);
    const pts = age >= 31536000 ? (sub ? 20 : 17) : age >= 15768000 ? 14 : age > 0 ? 8 : 0;
    add({ header: "Strict-Transport-Security", status: age >= 15768000 ? "pass" : age > 0 ? "warn" : "fail", value: hsts, points: pts, max: 20, message: `max-age ${age.toLocaleString()} s (${(age / 86400).toFixed(0)} days)${sub ? ", includeSubDomains" : ""}${pre ? ", preload" : ""}${age === 0 ? " — max-age=0 disables HSTS" : age < 15768000 ? " — shorter than 6 months" : ""}.`, fix: age < 31536000 || !sub ? "Use max-age=63072000; includeSubDomains (add preload when every subdomain is HTTPS)." : undefined });
    if (pre && (age < 31536000 || !sub)) add({ header: "Strict-Transport-Security", status: "warn", value: hsts, points: 0, max: 0, message: "preload is set but the preload list requires max-age ≥ 1 year and includeSubDomains." });
  } else add({ header: "Strict-Transport-Security", status: "fail", value: "", points: 0, max: 20, message: "Missing. Browsers may connect over plain HTTP first (SSL-stripping).", fix: "Strict-Transport-Security: max-age=63072000; includeSubDomains" });

  // nosniff
  const xcto = get("x-content-type-options");
  add(xcto && /nosniff/i.test(xcto) ? { header: "X-Content-Type-Options", status: "pass", value: xcto, points: 10, max: 10, message: "MIME sniffing disabled." } : { header: "X-Content-Type-Options", status: "fail", value: xcto ?? "", points: 0, max: 10, message: xcto ? "Only nosniff is a valid value." : "Missing. Browsers may sniff responses into executable types.", fix: "X-Content-Type-Options: nosniff" });

  // framing
  const xfo = get("x-frame-options");
  if (frameAncestors) add({ header: "Frame protection", status: "pass", value: `CSP frame-ancestors${xfo ? ` + X-Frame-Options: ${xfo}` : ""}`, points: 10, max: 10, message: "Clickjacking protection via CSP frame-ancestors." });
  else if (xfo && /^(deny|sameorigin)$/i.test(xfo.trim())) add({ header: "X-Frame-Options", status: "pass", value: xfo, points: 10, max: 10, message: "Clickjacking protection.", fix: "Also add CSP frame-ancestors, the modern equivalent." });
  else add({ header: "X-Frame-Options", status: "fail", value: xfo ?? "", points: 0, max: 10, message: xfo ? `"${xfo}" is not supported (ALLOW-FROM is obsolete).` : "Missing, and no CSP frame-ancestors — the page can be framed (clickjacking).", fix: "X-Frame-Options: DENY and/or CSP frame-ancestors 'none'" });

  // referrer
  const rp = get("referrer-policy");
  if (!rp) add({ header: "Referrer-Policy", status: "warn", value: "", points: 4, max: 10, message: "Missing — browsers default to strict-origin-when-cross-origin, but be explicit.", fix: "Referrer-Policy: strict-origin-when-cross-origin" });
  else {
    const last = rp.split(",").map((x) => x.trim().toLowerCase()).pop() ?? "";
    const weak = ["unsafe-url", "no-referrer-when-downgrade", "origin-when-cross-origin"].includes(last);
    add({ header: "Referrer-Policy", status: weak ? "warn" : "pass", value: rp, points: weak ? 3 : 10, max: 10, message: weak ? `"${last}" leaks full URLs to other sites.` : "Referrer leakage limited.", fix: weak ? "Use strict-origin-when-cross-origin or no-referrer." : undefined });
  }

  // permissions
  const pp = get("permissions-policy") ?? get("feature-policy");
  add(pp ? { header: "Permissions-Policy", status: headers.has("permissions-policy") ? "pass" : "warn", value: pp, points: headers.has("permissions-policy") ? 10 : 6, max: 10, message: headers.has("permissions-policy") ? `${pp.split(",").length} feature(s) controlled.` : "Feature-Policy is the deprecated predecessor; rename it to Permissions-Policy." } : { header: "Permissions-Policy", status: "warn", value: "", points: 0, max: 10, message: "Missing — camera, microphone, geolocation etc. follow browser defaults (and can be delegated to iframes).", fix: "Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()" });

  // isolation
  const coop = get("cross-origin-opener-policy");
  add(coop ? { header: "Cross-Origin-Opener-Policy", status: /same-origin/i.test(coop) ? "pass" : "warn", value: coop, points: /same-origin/i.test(coop) ? 5 : 2, max: 5, message: "Isolates the browsing context from cross-origin popups." } : { header: "Cross-Origin-Opener-Policy", status: "info", value: "", points: 0, max: 5, message: "Missing — cross-origin windows you open can keep a reference to yours.", fix: "Cross-Origin-Opener-Policy: same-origin" });
  const corp = get("cross-origin-resource-policy");
  add(corp ? { header: "Cross-Origin-Resource-Policy", status: "pass", value: corp, points: 5, max: 5, message: "Limits which sites can embed these resources." } : { header: "Cross-Origin-Resource-Policy", status: "info", value: "", points: 0, max: 5, message: "Missing — other sites may embed these responses (Spectre-style leaks).", fix: "Cross-Origin-Resource-Policy: same-origin" });
  const coep = get("cross-origin-embedder-policy");
  if (coep) add({ header: "Cross-Origin-Embedder-Policy", status: "pass", value: coep, points: 0, max: 0, message: coop && /same-origin/i.test(coop) ? "With COOP same-origin the page is cross-origin isolated (SharedArrayBuffer available)." : "Set, but cross-origin isolation also needs COOP: same-origin." });

  // CORS
  const acao = get("access-control-allow-origin");
  const acac = get("access-control-allow-credentials");
  if (acao) {
    if (acao.trim() === "*" && /true/i.test(acac ?? "")) add({ header: "Access-Control-Allow-Origin", status: "fail", value: `${acao} + credentials`, points: -10, max: 0, message: "Wildcard origin with credentials: browsers reject it, and it signals a misconfiguration (often origins are reflected instead).", fix: "Allow-list exact origins and add Vary: Origin." });
    else if (acao.trim() === "*") add({ header: "Access-Control-Allow-Origin", status: "warn", value: acao, points: 0, max: 0, message: "Any site can read these responses — fine for public data, not for anything user-specific." });
    else add({ header: "Access-Control-Allow-Origin", status: "pass", value: acao, points: 0, max: 0, message: `Restricted to ${acao}${get("vary")?.toLowerCase().includes("origin") ? " with Vary: Origin" : " — add Vary: Origin if this is chosen per request"}.` });
  }

  // leakage
  for (const [h, re] of [["server", /\d/], ["x-powered-by", /./], ["x-aspnet-version", /./], ["x-aspnetmvc-version", /./], ["x-generator", /./]] as const) {
    const v = get(h);
    if (v && re.test(v)) add({ header: h.replace(/(^|-)([a-z])/g, (_, a, b) => a + b.toUpperCase()).replace("Aspnet", "AspNet").replace("Aspnetmvc", "AspNetMvc"), status: "warn", value: v, points: -3, max: 0, message: "Reveals server software and version to attackers.", fix: `Remove the ${h} header (or its version number).` });
  }

  // cookies
  for (const ck of headers.get("set-cookie") ?? []) {
    const name = ck.split("=")[0];
    const miss = [!/;\s*secure/i.test(ck) && "Secure", !/;\s*httponly/i.test(ck) && "HttpOnly", !/;\s*samesite=/i.test(ck) && "SameSite"].filter(Boolean) as string[];
    add({ header: `Set-Cookie ${name}`, status: miss.length ? "warn" : "pass", value: ck.length > 90 ? ck.slice(0, 87) + "…" : ck, points: miss.length ? -2 * Math.min(miss.length, 2) : 0, max: 0, message: miss.length ? `Missing ${miss.join(", ")}.` : "Secure, HttpOnly and SameSite set.", fix: miss.length ? `Add ${miss.map((m) => (m === "SameSite" ? "SameSite=Lax" : m)).join("; ")}.` : undefined });
  }

  // deprecated
  const xxss = get("x-xss-protection");
  if (xxss && !/^0/.test(xxss.trim())) add({ header: "X-XSS-Protection", status: "info", value: xxss, points: 0, max: 0, message: "Deprecated: the XSS auditor was removed from browsers and could introduce leaks.", fix: "Send X-XSS-Protection: 0 (or remove it) and rely on CSP." });
  for (const h of ["expect-ct", "public-key-pins", "public-key-pins-report-only"]) if (get(h)) add({ header: h.replace(/(^|-)([a-z])/g, (_, a, b) => a + b.toUpperCase()), status: "info", value: get(h)!, points: 0, max: 0, message: "Obsolete header — no longer honoured by browsers.", fix: "Remove it." });

  const max = checks.reduce((a, c) => a + c.max, 0);
  const got = checks.reduce((a, c) => a + c.points, 0);
  const score = Math.max(0, Math.round((got / (max || 1)) * 100));
  const cspClean = checks.find((c) => c.header === "Content-Security-Policy")?.status === "pass";
  const hstsGood = checks.find((c) => c.header === "Strict-Transport-Security")?.status === "pass";
  const grade = score >= 95 && cspClean && hstsGood ? "A+" : score >= 85 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : score >= 40 ? "D" : score >= 25 ? "E" : "F";
  return { checks, score, grade, status, count: headers.size };
}
