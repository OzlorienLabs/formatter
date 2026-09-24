/**
 * Sandboxed runners for the Canvas and Three.js playgrounds. User code runs in
 * an <iframe sandbox="allow-scripts"> (opaque origin: no access to this page,
 * its storage or cookies). The frame talks to the page only through
 * postMessage: console relay, errors, PNG export.
 *
 * Three.js: the page fetches the self-hosted module files (same origin, cached
 * offline) and posts their text; the frame turns them into blob: URLs and an
 * import map, so `import * as THREE from "three"` works with no network.
 */

export type SandboxMode = "three" | "canvas";
export type Libs = { core: string; module: string; orbit: string; stl: string };

let libsP: Promise<Libs> | null = null;
export function threeLibs(): Promise<Libs> {
  if (!libsP) {
    const get = (p: string) =>
      fetch(p).then((r) => {
        if (!r.ok) throw new Error(`Could not load ${p} (${r.status}). Reload once while online to cache it.`);
        return r.text();
      });
    libsP = Promise.all([
      get("/vendor/three/three.core.js"),
      get("/vendor/three/three.module.js"),
      get("/vendor/three/addons/controls/OrbitControls.js"),
      get("/vendor/three/addons/loaders/STLLoader.js"),
    ]).then(([core, module, orbit, stl]) => ({ core, module, orbit, stl }));
    libsP.catch(() => (libsP = null));
  }
  return libsP;
}

/** Parse a canvas size choice: "fit" or "WxH". */
export function parseSize(s: string): { w: number; h: number } | null {
  const m = s.match(/^(\d+)x(\d+)$/);
  return m ? { w: Number(m[1]), h: Number(m[2]) } : null;
}

const BASE_CSS = `html,body{margin:0;height:100%;overflow:hidden;background:#fff;font-family:system-ui,sans-serif}
#__err{position:fixed;left:0;right:0;bottom:0;max-height:55%;overflow:auto;background:rgba(170,0,80,.94);color:#fff;font:12px/1.5 ui-monospace,Menlo,monospace;padding:8px 12px;white-space:pre-wrap;display:none;z-index:2147483647}
#__err b{display:block;margin-bottom:2px}`;

/**
 * The bootstrap document. `token` tags every message so the page can ignore
 * anything else; the page also checks event.source.
 */
export function buildSrcdoc(mode: SandboxMode, code: string, token: string, size: string, bg: string): string {
  const cfg = JSON.stringify({ mode, token, size, bg });
  const codeJson = JSON.stringify(code).replace(/</g, "\\u003c");
  const canvasCss =
    mode === "canvas"
      ? `body{display:flex;align-items:center;justify-content:center;background:${size === "fit" ? bg : "#f3f2f2 repeating-conic-gradient(#e8e6e4 0 25%, #f6f5f4 0 50%) 0 0/16px 16px"}}canvas{display:block;background:${bg};box-shadow:${size === "fit" ? "none" : "0 1px 8px rgba(0,0,0,.15)"}}`
      : "canvas{display:block}";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${BASE_CSS}${canvasCss}</style></head><body><div id="__err"></div>
<script>
(function () {
  var CFG = ${cfg};
  var CODE = ${codeJson};
  var post = function (m) { m.__fmt = CFG.token; try { parent.postMessage(m, "*"); } catch (e) {} };
  function fmt(a) {
    if (a instanceof Error) return (a.name || "Error") + ": " + a.message;
    if (typeof a === "string") return a;
    if (typeof a === "function") return "ƒ " + (a.name || "anonymous") + "()";
    if (a && typeof a === "object") {
      try {
        if (a.isObject3D || a.isMaterial || a.isBufferGeometry) return "[" + (a.type || a.constructor.name) + (a.name ? " " + a.name : "") + "]";
        if (typeof HTMLElement !== "undefined" && a instanceof HTMLElement) return "<" + a.tagName.toLowerCase() + ">";
        var cache = [];
        var s = JSON.stringify(a, function (k, v) {
          if (v && typeof v === "object") { if (cache.indexOf(v) >= 0) return "[Circular]"; cache.push(v); }
          if (typeof v === "number" && !isFinite(v)) return String(v);
          return v;
        });
        return s && s.length > 2000 ? s.slice(0, 2000) + "…" : s;
      } catch (e) { return String(a); }
    }
    return String(a);
  }
  ["log", "info", "warn", "error", "debug"].forEach(function (lvl) {
    var orig = console[lvl];
    console[lvl] = function () {
      var args = Array.prototype.slice.call(arguments);
      post({ type: "console", level: lvl, text: args.map(fmt).join(" ") });
      try { orig.apply(console, args); } catch (e) {}
    };
  });
  var errBox = document.getElementById("__err");
  function showErr(msg) { errBox.style.display = "block"; errBox.textContent += msg + "\\n"; }
  window.addEventListener("error", function (e) {
    var line = e.lineno || 0;
    var msg = (e.message || "Error").replace(/^Uncaught /, "") + (line ? " (line " + line + (e.colno ? ", col " + e.colno : "") + ")" : "");
    showErr(msg);
    post({ type: "error", text: msg, line: line });
  });
  window.addEventListener("unhandledrejection", function (e) {
    var r = e.reason;
    var msg = "Unhandled promise rejection: " + (r && r.message ? r.message : String(r));
    showErr(msg);
    post({ type: "error", text: msg });
  });
  function capture(target) {
    requestAnimationFrame(function () {
      var c = target || document.querySelector("canvas");
      if (!c) { post({ type: "png", error: "No canvas on the page." }); return; }
      try { post({ type: "png", data: c.toDataURL("image/png"), w: c.width, h: c.height }); }
      catch (e) { post({ type: "png", error: String(e && e.message || e) }); }
    });
  }
  function runScript(text, type) {
    var s = document.createElement("script");
    if (type) s.type = type;
    s.textContent = text + "\\n//# sourceURL=user-code.js";
    document.body.appendChild(s);
  }
  if (CFG.mode === "canvas") {
    var canvas = document.createElement("canvas");
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var fixed = /^(\\d+)x(\\d+)$/.exec(CFG.size);
    var W = fixed ? +fixed[1] : Math.max(1, window.innerWidth);
    var H = fixed ? +fixed[2] : Math.max(1, window.innerHeight);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    var fitCss = function () {
      var k = fixed ? Math.min(1, (window.innerWidth - 16) / W, (window.innerHeight - 16) / H) : 1;
      canvas.style.width = W * k + "px"; canvas.style.height = H * k + "px";
    };
    fitCss();
    window.addEventListener("resize", fitCss);
    document.body.appendChild(canvas);
    var ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    var frames = [];
    window.canvas = canvas; window.ctx = ctx; window.width = W; window.height = H;
    window.random = function (a, b) { if (b === undefined) { b = a === undefined ? 1 : a; a = 0; } return a + Math.random() * (b - a); };
    window.clear = function (color) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); if (color) { ctx.fillStyle = color; ctx.fillRect(0, 0, canvas.width, canvas.height); } else ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.restore(); };
    window.loop = function (fn) {
      var start = performance.now(), frame = 0, id = 0, live = true;
      function tick(now) {
        if (!live) return;
        try { fn((now - start) / 1000, frame++); } catch (e) { live = false; throw e; }
        id = requestAnimationFrame(tick);
      }
      id = requestAnimationFrame(tick);
      var stop = function () { live = false; cancelAnimationFrame(id); };
      frames.push(stop);
      return stop;
    };
    window.addEventListener("message", function (e) {
      if (e.source !== parent || !e.data || e.data.__fmt !== CFG.token) return;
      if (e.data.type === "export") capture(canvas);
      if (e.data.type === "stop") frames.forEach(function (f) { f(); });
    });
    post({ type: "ready" });
    runScript(CODE);
    post({ type: "started" });
  } else {
    window.addEventListener("message", function (e) {
      if (e.source !== parent || !e.data || e.data.__fmt !== CFG.token) return;
      var d = e.data;
      if (d.type === "export") capture();
      if (d.type === "libs") {
        try {
          var url = function (s) { return URL.createObjectURL(new Blob([s], { type: "text/javascript" })); };
          var core = url(d.libs.core);
          var mod = url(d.libs.module.replace(/(["'])\\.\\/three\\.core\\.js\\1/g, JSON.stringify(core)));
          var orbit = url(d.libs.orbit), stl = url(d.libs.stl);
          var map = { imports: {
            "three": mod,
            "three/addons/controls/OrbitControls.js": orbit,
            "three/examples/jsm/controls/OrbitControls.js": orbit,
            "three/addons/loaders/STLLoader.js": stl,
            "three/examples/jsm/loaders/STLLoader.js": stl
          } };
          var im = document.createElement("script");
          im.type = "importmap";
          im.textContent = JSON.stringify(map);
          document.head.appendChild(im);
          runScript(CODE, "module");
          post({ type: "started" });
        } catch (err) { showErr(String(err)); post({ type: "error", text: String(err) }); }
      }
    });
    post({ type: "ready" });
  }
})();
</script></body></html>`;
}

export const STOPPED_DOC = `<!doctype html><html><body style="margin:0;height:100%;display:flex;align-items:center;justify-content:center;font:14px system-ui;color:#888;background:#fafafa">Stopped — press Run</body></html>`;
