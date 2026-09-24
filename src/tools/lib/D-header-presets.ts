/**
 * Security-header builder presets and config type. Small on purpose: the
 * category module imports it for examples; the emitters live in D-headers.
 */
export const PERMISSIONS = ["camera", "microphone", "geolocation", "payment", "usb", "fullscreen", "display-capture", "accelerometer", "gyroscope", "magnetometer", "autoplay", "clipboard-write", "interest-cohort", "browsing-topics"] as const;

export type PermValue = "none" | "self" | "all" | string;

export type HeaderConfig = {
  csp: { enabled: boolean; reportOnly: boolean; directives: Record<string, string>; upgrade: boolean; reportTo: string };
  hsts: { enabled: boolean; maxAge: number; includeSubDomains: boolean; preload: boolean };
  xfo: string;
  nosniff: boolean;
  referrer: string;
  permissions: Record<string, PermValue>;
  coop: string;
  coep: string;
  corp: string;
  cors: { enabled: boolean; origins: string; methods: string; headers: string; expose: string; credentials: boolean; maxAge: number };
};

const allNone = () => Object.fromEntries(PERMISSIONS.map((p) => [p, p === "fullscreen" || p === "autoplay" || p === "clipboard-write" ? "self" : "none"])) as Record<string, PermValue>;
const noCors = { enabled: false, origins: "https://app.example.com", methods: "GET, POST, PUT, DELETE, OPTIONS", headers: "Content-Type, Authorization", expose: "", credentials: false, maxAge: 600 };

export const PRESETS: Record<string, { label: string; describe: string; cfg: HeaderConfig }> = {
  strict: {
    label: "Strict",
    describe: "Locks everything down: only same-origin resources, no framing, cross-origin isolated.",
    cfg: {
      csp: { enabled: true, reportOnly: false, upgrade: true, reportTo: "", directives: { "default-src": "'none'", "script-src": "'self'", "style-src": "'self'", "img-src": "'self'", "connect-src": "'self'", "font-src": "'self'", "manifest-src": "'self'", "frame-ancestors": "'none'", "object-src": "'none'", "base-uri": "'none'", "form-action": "'self'" } },
      hsts: { enabled: true, maxAge: 63072000, includeSubDomains: true, preload: true },
      xfo: "DENY", nosniff: true, referrer: "no-referrer", permissions: allNone(), coop: "same-origin", coep: "require-corp", corp: "same-origin", cors: { ...noCors },
    },
  },
  spa: {
    label: "SPA",
    describe: "A React/Vue/Svelte app calling an API, with nonce-based scripts and inline styles from CSS-in-JS.",
    cfg: {
      csp: { enabled: true, reportOnly: false, upgrade: true, reportTo: "csp-endpoint", directives: { "default-src": "'self'", "script-src": "'self' 'nonce-{NONCE}' 'strict-dynamic'", "style-src": "'self' 'unsafe-inline'", "img-src": "'self' data: https:", "connect-src": "'self' https://api.example.com wss://realtime.example.com", "font-src": "'self' data:", "worker-src": "'self' blob:", "frame-ancestors": "'none'", "object-src": "'none'", "base-uri": "'self'", "form-action": "'self'" } },
      hsts: { enabled: true, maxAge: 31536000, includeSubDomains: true, preload: false },
      xfo: "DENY", nosniff: true, referrer: "strict-origin-when-cross-origin", permissions: allNone(), coop: "same-origin-allow-popups", coep: "", corp: "same-origin", cors: { ...noCors },
    },
  },
  static: {
    label: "Static site",
    describe: "A blog or docs site on a CDN: same-origin scripts, images from anywhere over HTTPS.",
    cfg: {
      csp: { enabled: true, reportOnly: false, upgrade: true, reportTo: "", directives: { "default-src": "'self'", "script-src": "'self'", "style-src": "'self' 'unsafe-inline'", "img-src": "'self' data: https:", "font-src": "'self'", "frame-src": "https://www.youtube-nocookie.com", "frame-ancestors": "'self'", "object-src": "'none'", "base-uri": "'self'", "form-action": "'self'" } },
      hsts: { enabled: true, maxAge: 31536000, includeSubDomains: false, preload: false },
      xfo: "SAMEORIGIN", nosniff: true, referrer: "strict-origin-when-cross-origin", permissions: allNone(), coop: "same-origin", coep: "", corp: "", cors: { ...noCors },
    },
  },
  api: {
    label: "API",
    describe: "A JSON API: no content should ever render, CORS for a known front-end origin with credentials.",
    cfg: {
      csp: { enabled: true, reportOnly: false, upgrade: false, reportTo: "", directives: { "default-src": "'none'", "frame-ancestors": "'none'" } },
      hsts: { enabled: true, maxAge: 63072000, includeSubDomains: true, preload: false },
      xfo: "DENY", nosniff: true, referrer: "no-referrer", permissions: {}, coop: "", coep: "", corp: "same-site",
      cors: { enabled: true, origins: "https://app.example.com, https://admin.example.com", methods: "GET, POST, PATCH, DELETE, OPTIONS", headers: "Content-Type, Authorization, X-Request-Id", expose: "X-Request-Id, RateLimit-Remaining", credentials: true, maxAge: 7200 },
    },
  },
  legacy: {
    label: "Legacy-friendly",
    describe: "An older app with inline scripts and third-party widgets: CSP in report-only mode while you clean up.",
    cfg: {
      csp: { enabled: true, reportOnly: true, upgrade: false, reportTo: "csp-endpoint", directives: { "default-src": "'self' https: data:", "script-src": "'self' 'unsafe-inline' 'unsafe-eval' https:", "style-src": "'self' 'unsafe-inline' https:", "img-src": "* data: blob:", "frame-ancestors": "'self'", "object-src": "'none'" } },
      hsts: { enabled: true, maxAge: 86400, includeSubDomains: false, preload: false },
      xfo: "SAMEORIGIN", nosniff: true, referrer: "strict-origin-when-cross-origin", permissions: { camera: "none", microphone: "none", geolocation: "self", "interest-cohort": "none" }, coop: "", coep: "", corp: "", cors: { ...noCors },
    },
  },
};

