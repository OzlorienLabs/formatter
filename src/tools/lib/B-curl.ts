/**
 * cURL → code. A shell tokenizer (POSIX quoting, $'…', backslash and Windows
 * cmd `^` continuations), a curl option parser producing a request model, and
 * code generators for 13 HTTP clients.
 */
import { ToolError } from "../types";

/* ── tokenizer ─────────────────────────────────────────────────────── */

export function shellSplit(input: string): { tokens: string[]; notes: string[] } {
  const notes: string[] = [];
  let src = input.replace(/\r\n?/g, "\n").trim();
  src = src.replace(/^\s*(?:\$|>|PS [^>]*>|C:\\[^>]*>)\s+(?=curl)/i, "");
  // Windows cmd: `^` escapes and `^\n` continuations (Chrome's "Copy as cURL (cmd)").
  const cmd = /\^\n/.test(src) || /\^"/.test(src);
  if (cmd) return { tokens: winSplit(src.replace(/\^\n/g, " ").replace(/\^(.)/g, "$1")), notes: ["Parsed as a Windows cmd command (^ escapes)."] };
  // PowerShell backtick continuations.
  src = src.replace(/`\n/g, " ");
  const tokens: string[] = [];
  let cur = "";
  let has = false;
  let vars = false;
  let i = 0;
  const n = src.length;
  const push = () => {
    if (has) tokens.push(cur);
    cur = "";
    has = false;
  };
  while (i < n) {
    const c = src[i];
    if (c === "\\" && src[i + 1] === "\n") { i += 2; continue; }
    if (c === " " || c === "\t" || c === "\n") { push(); i++; continue; }
    if (!has && c === "#") { while (i < n && src[i] !== "\n") i++; continue; }
    if (c === "|" || c === ";" || c === ">" || c === "<" || (c === "&" && (src[i + 1] === "&" || src[i + 1] === undefined || /\s/.test(src[i + 1])))) {
      if (c === ">" && has && /^\d$/.test(cur)) { cur = ""; has = false; }
      push();
      notes.push(`Stopped at the shell operator "${c === "&" && src[i + 1] === "&" ? "&&" : c}" — only the curl command is converted.`);
      break;
    }
    if (c === "\\") { cur += src[i + 1] ?? ""; has = true; i += 2; continue; }
    if (c === "'") {
      const end = src.indexOf("'", i + 1);
      if (end < 0) throw new ToolError("Unterminated single quote in the command.");
      cur += src.slice(i + 1, end);
      has = true;
      i = end + 1;
      continue;
    }
    if (c === "$" && src[i + 1] === "'") {
      i += 2;
      for (;;) {
        if (i >= n) throw new ToolError("Unterminated $'…' string in the command.");
        const d = src[i];
        if (d === "'") { i++; break; }
        if (d === "\\") {
          const e = src[i + 1];
          const simple: Record<string, string> = { n: "\n", t: "\t", r: "\r", "\\": "\\", "'": "'", '"': '"', a: "\x07", b: "\b", e: "\x1b", E: "\x1b", f: "\f", v: "\v", "?": "?" };
          if (e in simple) { cur += simple[e]; i += 2; continue; }
          let m: RegExpExecArray | null;
          if ((m = /^x([0-9a-fA-F]{1,2})/.exec(src.slice(i + 1)))) { cur += String.fromCharCode(parseInt(m[1], 16)); i += 1 + m[0].length; continue; }
          if ((m = /^u([0-9a-fA-F]{1,4})/.exec(src.slice(i + 1))) || (m = /^U([0-9a-fA-F]{1,8})/.exec(src.slice(i + 1)))) { cur += String.fromCodePoint(parseInt(m[1], 16)); i += 1 + m[0].length; continue; }
          if ((m = /^([0-7]{1,3})/.exec(src.slice(i + 1)))) { cur += String.fromCharCode(parseInt(m[1], 8)); i += 1 + m[0].length; continue; }
          cur += "\\" + (e ?? "");
          i += 2;
          continue;
        }
        cur += d;
        i++;
      }
      has = true;
      continue;
    }
    if (c === '"') {
      i++;
      for (;;) {
        if (i >= n) throw new ToolError("Unterminated double quote in the command.");
        const d = src[i];
        if (d === '"') { i++; break; }
        if (d === "\\" && i + 1 < n) {
          const e = src[i + 1];
          if (e === "\n") { i += 2; continue; }
          if ('$`"\\'.includes(e)) { cur += e; i += 2; continue; }
        }
        if (d === "$" && /[A-Za-z_{]/.test(src[i + 1] ?? "")) vars = true;
        cur += d;
        i++;
      }
      has = true;
      continue;
    }
    if (c === "$" && /[A-Za-z_{(]/.test(src[i + 1] ?? "")) vars = true;
    cur += c;
    has = true;
    i++;
  }
  push();
  if (vars) notes.push("Shell variables ($NAME) are left as literal text.");
  return { tokens, notes };
}

/** Windows argv rules: double quotes group, \" is a literal quote. */
function winSplit(src: string): string[] {
  const out: string[] = [];
  let cur = "", has = false, q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "\\") {
      let k = i;
      while (src[k] === "\\") k++;
      const count = k - i;
      if (src[k] === '"') {
        cur += "\\".repeat(Math.floor(count / 2));
        if (count % 2) { cur += '"'; i = k; }
        else i = k - 1;
      } else { cur += "\\".repeat(count); i = k - 1; }
      has = true;
      continue;
    }
    if (c === '"') {
      if (q && src[i + 1] === '"') { cur += '"'; i++; continue; }
      q = !q;
      has = true;
      continue;
    }
    if (!q && /\s/.test(c)) {
      if (has) out.push(cur);
      cur = "";
      has = false;
      continue;
    }
    cur += c;
    has = true;
  }
  if (has) out.push(cur);
  return out;
}

/* ── request model ─────────────────────────────────────────────────── */

export type Part = { name: string; value?: string; file?: string; type?: string; filename?: string; fromFile?: boolean };
export type Body =
  | { kind: "none" }
  | { kind: "raw"; text: string; file?: string }
  | { kind: "form"; fields: [string, string][]; text: string }
  | { kind: "json"; text: string; value: unknown }
  | { kind: "multipart"; parts: Part[] };

export type Req = {
  method: string;
  url: string;
  base: string;
  query: [string, string][];
  headers: [string, string][];
  auth?: { type: "basic" | "digest" | "ntlm"; user: string; pass: string };
  bearer?: string;
  body: Body;
  insecure: boolean;
  follow: boolean;
  compressed: boolean;
  timeout?: number;
  connectTimeout?: number;
  output?: string;
  proxy?: string;
  head: boolean;
  notes: string[];
};

const SHORT_VAL = new Set("XHdFubAeomxTwcDrEKCyYzQPtU".split(""));
const SHORT_BOOL = new Set("kLIGsSvifgNj0Oln46ZRqJ#MV".split(""));
const LONG_VAL = new Set([
  "request", "header", "data", "data-raw", "data-binary", "data-ascii", "data-urlencode", "json", "form", "form-string", "user", "cookie",
  "user-agent", "referer", "url", "output", "max-time", "connect-timeout", "proxy", "upload-file", "write-out", "cookie-jar", "dump-header",
  "range", "cert", "key", "cacert", "oauth2-bearer", "retry", "limit-rate", "interface", "resolve", "max-redirs", "aws-sigv4", "config",
  "proxy-user", "retry-delay", "retry-max-time", "ciphers", "capath", "dns-servers", "expect100-timeout", "keepalive-time", "local-port",
  "request-target", "unix-socket", "variable", "url-query", "stderr", "trace", "trace-ascii", "continue-at", "time-cond", "speed-limit", "speed-time",
]);
const SHORT_LONG: Record<string, string> = {
  X: "request", H: "header", d: "data", F: "form", u: "user", b: "cookie", A: "user-agent", e: "referer", o: "output", m: "max-time",
  x: "proxy", T: "upload-file", w: "write-out", c: "cookie-jar", D: "dump-header", r: "range", E: "cert", K: "config",
  k: "insecure", L: "location", I: "head", G: "get", s: "silent", S: "show-error", v: "verbose", i: "include", f: "fail", O: "remote-name",
};

function encodeURIComponentCurl(s: string) {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

export function parseCurl(input: string): Req {
  if (!input.trim()) throw new ToolError("Paste a curl command, e.g. curl https://api.example.com");
  const { tokens, notes } = shellSplit(input);
  if (!tokens.length || !/^curl(\.exe)?$/i.test(tokens[0].replace(/^.*[\\/]/, ""))) throw new ToolError(`The command must start with "curl" (found ${JSON.stringify(tokens[0] ?? "")}).`);
  const headers: [string, string][] = [];
  const data: { mode: string; v: string }[] = [];
  const parts: Part[] = [];
  const urls: string[] = [];
  let method = "";
  let user: string | undefined;
  let authType: "basic" | "digest" | "ntlm" = "basic";
  let bearer: string | undefined;
  const cookies: string[] = [];
  let insecure = false, follow = false, compressed = false, get = false, head = false;
  let timeout: number | undefined, connectTimeout: number | undefined;
  let output: string | undefined, proxy: string | undefined, upload: string | undefined;
  const ignored = new Set<string>();

  const apply = (name: string, val: string | undefined) => {
    switch (name) {
      case "request": method = val!.toUpperCase(); break;
      case "header": {
        const idx = val!.indexOf(":");
        if (idx < 0) {
          if (val!.endsWith(";")) headers.push([val!.slice(0, -1), ""]);
          else if (val!.startsWith("@")) notes.push(`Headers from file ${val!.slice(1)} are not read.`);
          break;
        }
        const k = val!.slice(0, idx).trim();
        const v = val!.slice(idx + 1).trim();
        if (!v) { notes.push(`"${k}:" with no value removes a default header in curl; it was dropped.`); break; }
        headers.push([k, v]);
        break;
      }
      case "data": case "data-ascii": data.push({ mode: "data", v: val! }); break;
      case "data-raw": data.push({ mode: "raw", v: val! }); break;
      case "data-binary": data.push({ mode: "binary", v: val! }); break;
      case "data-urlencode": data.push({ mode: "urlencode", v: val! }); break;
      case "json": data.push({ mode: "json", v: val! }); break;
      case "form": case "form-string": {
        const eq = val!.indexOf("=");
        if (eq < 0) throw new ToolError(`-F expects name=value, got ${JSON.stringify(val)}`);
        const p: Part = { name: val!.slice(0, eq) };
        let rest = val!.slice(eq + 1);
        if (name === "form" && (rest.startsWith("@") || rest.startsWith("<"))) {
          const segs = rest.slice(1).split(";");
          p.file = segs[0];
          p.fromFile = rest.startsWith("<");
          for (const s of segs.slice(1)) {
            const m = /^\s*(type|filename)=(.*)$/.exec(s);
            if (m) p[m[1] as "type" | "filename"] = m[2].replace(/^"|"$/g, "");
          }
        } else {
          if (name === "form") {
            const m = /;type=([^;]+)$/.exec(rest);
            if (m) { p.type = m[1]; rest = rest.slice(0, m.index); }
          }
          p.value = rest;
        }
        parts.push(p);
        break;
      }
      case "user": user = val; break;
      case "digest": authType = "digest"; break;
      case "ntlm": authType = "ntlm"; break;
      case "basic": authType = "basic"; break;
      case "oauth2-bearer": bearer = val; break;
      case "cookie":
        if (val!.includes("=")) cookies.push(val!.replace(/;\s*$/, ""));
        else notes.push(`-b ${val} reads cookies from a file; it is not included.`);
        break;
      case "user-agent": headers.push(["User-Agent", val!]); break;
      case "referer": headers.push(["Referer", val!.replace(/;auto$/, "")]); break;
      case "url": urls.push(val!); break;
      case "output": output = val; break;
      case "remote-name": output = "(remote file name)"; break;
      case "max-time": timeout = Number(val); break;
      case "connect-timeout": connectTimeout = Number(val); break;
      case "proxy": proxy = val; break;
      case "upload-file": upload = val; break;
      case "insecure": insecure = true; break;
      case "location": case "location-trusted": follow = true; break;
      case "compressed": compressed = true; break;
      case "get": get = true; break;
      case "head": head = true; break;
      case "silent": case "show-error": case "verbose": case "include": case "fail": case "globoff": case "no-buffer": case "http1.1": case "http2": case "http2-prior-knowledge": case "http3": case "tlsv1.2": case "tlsv1.3": case "path-as-is": case "fail-with-body": case "progress-bar": case "no-progress-meter": case "no-keepalive": case "anyauth":
        break;
      default:
        ignored.add(name);
    }
  };

  let endOpts = false;
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (!endOpts && t === "--") { endOpts = true; continue; }
    if (!endOpts && t.startsWith("--") && t.length > 2) {
      let name = t.slice(2);
      let val: string | undefined;
      const eq = name.indexOf("=");
      if (eq > 0 && LONG_VAL.has(name.slice(0, eq))) { val = name.slice(eq + 1); name = name.slice(0, eq); }
      if (name.startsWith("no-") && !LONG_VAL.has(name)) continue; // --no-progress-meter etc.
      if (LONG_VAL.has(name) && val === undefined) {
        if (i + 1 >= tokens.length) throw new ToolError(`--${name} needs a value.`);
        val = tokens[++i];
      }
      apply(name, val);
      continue;
    }
    if (!endOpts && t.startsWith("-") && t.length > 1) {
      for (let j = 1; j < t.length; j++) {
        const ch = t[j];
        if (SHORT_VAL.has(ch)) {
          let val = t.slice(j + 1);
          if (!val) {
            if (i + 1 >= tokens.length) throw new ToolError(`-${ch} needs a value.`);
            val = tokens[++i];
          }
          if (SHORT_LONG[ch]) apply(SHORT_LONG[ch], val);
          else ignored.add("-" + ch);
          break;
        }
        if (SHORT_BOOL.has(ch)) {
          if (SHORT_LONG[ch]) apply(SHORT_LONG[ch], undefined);
          continue;
        }
        ignored.add("-" + ch);
      }
      continue;
    }
    urls.push(t);
  }

  if (!urls.length) throw new ToolError("No URL found in the curl command.");
  if (urls.length > 1) notes.push(`${urls.length} URLs given; only the first is converted.`);
  let url = urls[0];
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) url = "http://" + url;

  // Assemble the body from -d / --data-* / --json in order.
  let body: Body = { kind: "none" };
  let json = false;
  const pieces: string[] = [];
  let file: string | undefined;
  for (const d of data) {
    if (d.mode === "json") json = true;
    if (d.mode === "urlencode") {
      const v = d.v;
      const at = v.indexOf("@"), eq = v.indexOf("=");
      if (eq === 0) pieces.push(encodeURIComponentCurl(v.slice(1)));
      else if (eq > 0 && (at < 0 || eq < at)) pieces.push(v.slice(0, eq) + "=" + encodeURIComponentCurl(v.slice(eq + 1)));
      else if (at >= 0) { pieces.push(`${at > 0 ? v.slice(0, at) + "=" : ""}<urlencoded contents of ${v.slice(at + 1)}>`); notes.push(`--data-urlencode reads ${v.slice(at + 1)}; the file contents are not available here.`); }
      else pieces.push(encodeURIComponentCurl(v));
      continue;
    }
    if (d.mode !== "raw" && d.v.startsWith("@")) {
      file = d.v.slice(1);
      pieces.push(`<contents of ${file}>`);
      continue;
    }
    pieces.push(d.v);
  }
  if (upload) {
    if (!method) method = "PUT";
    file = upload;
    notes.push(`-T uploads ${upload} as the request body.`);
  }

  const hasHeader = (k: string) => headers.some(([h]) => h.toLowerCase() === k.toLowerCase());
  const u = new URL(url);
  if (get && pieces.length) {
    const qs = pieces.join("&");
    u.search = u.search ? u.search + "&" + qs : "?" + qs;
    pieces.length = 0;
    file = undefined;
  }

  if (parts.length) {
    body = { kind: "multipart", parts };
    if (pieces.length) notes.push("-d and -F cannot be combined; the -d data was ignored.");
  } else if (file && pieces.length <= 1) {
    body = { kind: "raw", text: `<contents of ${file}>`, file };
  } else if (pieces.length) {
    const text = json ? pieces.join("") : pieces.join("&");
    const ctHeader = headers.find(([h]) => h.toLowerCase() === "content-type")?.[1] ?? "";
    let parsed: unknown;
    let isJson = false;
    if (json || /json/i.test(ctHeader)) {
      try { parsed = JSON.parse(text); isJson = true; } catch { /* keep raw */ }
    } else if (!ctHeader && /^\s*[[{]/.test(text)) {
      try { parsed = JSON.parse(text); notes.push("The data looks like JSON but no Content-Type was set; curl sends it as application/x-www-form-urlencoded."); } catch { /* raw */ }
    }
    if (isJson) body = { kind: "json", text, value: parsed };
    else if ((!ctHeader || /x-www-form-urlencoded/i.test(ctHeader)) && text.split("&").every((p) => /^[^=&]+=[^&]*$/.test(p) && !/<contents of/.test(p))) {
      const fields = text.split("&").map((p) => {
        const eq = p.indexOf("=");
        const dec = (s: string) => { try { return decodeURIComponent(s.replace(/\+/g, " ")); } catch { return s; } };
        return [dec(p.slice(0, eq)), dec(p.slice(eq + 1))] as [string, string];
      });
      body = { kind: "form", fields, text };
    } else body = { kind: "raw", text, file };
    if (!hasHeader("Content-Type")) headers.push(["Content-Type", json ? "application/json" : "application/x-www-form-urlencoded"]);
    if (json && !hasHeader("Accept")) headers.push(["Accept", "application/json"]);
  }
  if (cookies.length) headers.push(["Cookie", cookies.join("; ")]);

  if (!method) method = head ? "HEAD" : body.kind !== "none" ? "POST" : "GET";
  if (head && method !== "HEAD") notes.push("-I (HEAD) combined with -X: the explicit method wins.");

  let auth: Req["auth"];
  if (user !== undefined) {
    const c = user.indexOf(":");
    auth = { type: authType, user: c < 0 ? user : user.slice(0, c), pass: c < 0 ? "" : user.slice(c + 1) };
    if (c < 0) notes.push("-u without a password: curl would prompt for it; an empty password is used.");
  }
  if (proxy) notes.push(`Proxy ${proxy} is not carried over to every target.`);
  if (ignored.size) notes.push(`Ignored options: ${[...ignored].map((x) => (x.startsWith("-") ? x : "--" + x)).join(", ")}`);

  const query: [string, string][] = [...u.searchParams.entries()];
  const base = u.origin === "null" ? url.split("?")[0] : u.origin + u.pathname;
  return {
    method,
    url: u.toString(),
    base,
    query,
    headers,
    auth,
    bearer,
    body,
    insecure,
    follow,
    compressed,
    timeout: Number.isFinite(timeout) ? timeout : undefined,
    connectTimeout: Number.isFinite(connectTimeout) ? connectTimeout : undefined,
    output,
    proxy,
    head: method === "HEAD",
    notes,
  };
}

/* ── string literal helpers ────────────────────────────────────────── */

const jsS = (s: string) => JSON.stringify(s);
const pyS = (s: string) =>
  "'" +
  s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t").replace(/[\x00-\x1f\x7f]/g, (c) => "\\x" + c.charCodeAt(0).toString(16).padStart(2, "0")) +
  "'";
const phpS = (s: string) => "'" + s.replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";
const goS = (s: string) => (!s.includes("`") && !s.includes("\r") && (s.includes('"') || s.includes("\n")) ? "`" + s + "`" : JSON.stringify(s));
const rustS = (s: string) => {
  if (/["\\\n]/.test(s) && !s.includes('"#')) return `r#"${s}"#`;
  return '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, (c) => `\\u{${c.charCodeAt(0).toString(16)}}`) + '"';
};
const psS = (s: string) => "'" + s.replace(/'/g, "''") + "'";
export const shS = (s: string) => (/^[A-Za-z0-9_@%+=:,./-]+$/.test(s) ? s : "'" + s.replace(/'/g, "'\\''") + "'");
const b64 = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
};

function toPy(v: unknown, ind = 0): string {
  const pad = "    ".repeat(ind + 1), end = "    ".repeat(ind);
  if (v === null) return "None";
  if (v === true) return "True";
  if (v === false) return "False";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return pyS(v);
  if (Array.isArray(v)) return !v.length ? "[]" : inlineable(v) ? `[${v.map((x) => toPy(x)).join(", ")}]` : `[\n${v.map((x) => pad + toPy(x, ind + 1)).join(",\n")},\n${end}]`;
  const e = Object.entries(v as object);
  return e.length ? `{\n${e.map(([k, x]) => `${pad}${pyS(k)}: ${toPy(x, ind + 1)}`).join(",\n")},\n${end}}` : "{}";
}

function toJs(v: unknown, ind = 0): string {
  const pad = "  ".repeat(ind + 1), end = "  ".repeat(ind);
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return !v.length ? "[]" : inlineable(v) ? `[${v.map((x) => JSON.stringify(x)).join(", ")}]` : `[\n${v.map((x) => pad + toJs(x, ind + 1)).join(",\n")},\n${end}]`;
  const e = Object.entries(v as object);
  return e.length ? `{\n${e.map(([k, x]) => `${pad}${/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k)}: ${toJs(x, ind + 1)}`).join(",\n")},\n${end}}` : "{}";
}

const indentRest = (s: string, pad: string) => s.replace(/\n/g, "\n" + pad);
/** The JSON body as sent, pretty-printed only when it is one long line. */
const prettyJson = (b: Extract<Body, { kind: "json" }>) => (b.text.length > 80 && !b.text.includes("\n") ? JSON.stringify(b.value, null, 2) : b.text);
const inlineable = (v: unknown[]) => v.every((x) => x === null || typeof x !== "object") && JSON.stringify(v).length <= 60;
const keyJs = (k: string) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k));

/** Headers minus the ones a target sets itself. */
function hdrs(r: Req, drop: string[] = []): [string, string][] {
  const d = new Set(drop.map((x) => x.toLowerCase()));
  return r.headers.filter(([k]) => !d.has(k.toLowerCase()));
}
const ctOf = (r: Req) => r.headers.find(([k]) => k.toLowerCase() === "content-type")?.[1];
const basicHeader = (r: Req) => (r.auth ? "Basic " + b64(`${r.auth.user}:${r.auth.pass}`) : "");
const fileName = (p: string) => p.replace(/^.*[\\/]/, "");
const wantsJson = (r: Req) => r.headers.some(([k, v]) => /^accept$/i.test(k) && /json/i.test(v)) || r.body.kind === "json";

/* ── generators ────────────────────────────────────────────────────── */

export const TARGETS: [string, string][] = [
  ["fetch", "JavaScript fetch"],
  ["axios", "Node.js axios"],
  ["requests", "Python requests"],
  ["httpx", "Python httpx"],
  ["go", "Go net/http"],
  ["php", "PHP cURL"],
  ["ruby", "Ruby Net::HTTP"],
  ["java", "Java HttpClient"],
  ["csharp", "C# HttpClient"],
  ["rust", "Rust reqwest"],
  ["powershell", "PowerShell"],
  ["httpie", "HTTPie"],
  ["wget", "wget"],
];

export const TARGET_LANG: Record<string, "js" | "python" | "go" | "text" | "java" | "rust" | "shell"> = {
  fetch: "js", axios: "js", requests: "python", httpx: "python", go: "go", php: "text", ruby: "text", java: "java", csharp: "text", rust: "rust", powershell: "text", httpie: "shell", wget: "shell",
};

export function generate(target: string, r: Req): string {
  switch (target) {
    case "fetch": return genFetch(r);
    case "axios": return genAxios(r);
    case "requests": return genPython(r, "requests");
    case "httpx": return genPython(r, "httpx");
    case "go": return genGo(r);
    case "php": return genPhp(r);
    case "ruby": return genRuby(r);
    case "java": return genJava(r);
    case "csharp": return genCSharp(r);
    case "rust": return genRust(r);
    case "powershell": return genPowerShell(r);
    case "httpie": return genHttpie(r);
    case "wget": return genWget(r);
  }
  throw new ToolError(`Unknown target ${target}`);
}

function genFetch(r: Req): string {
  const pre: string[] = [];
  const opts: string[] = [];
  const multipart = r.body.kind === "multipart";
  const h = hdrs(r, multipart ? ["content-type"] : []);
  if (r.auth?.type === "basic") h.push(["Authorization", `\u0000"Basic " + btoa(${jsS(`${r.auth.user}:${r.auth.pass}`)})`]);
  if (r.bearer) h.push(["Authorization", `Bearer ${r.bearer}`]);
  if (r.method !== "GET") opts.push(`method: ${jsS(r.method)}`);
  if (h.length) opts.push(`headers: {\n${h.map(([k, v]) => `    ${keyJs(k)}: ${v.startsWith("\u0000") ? v.slice(1) : jsS(v)}`).join(",\n")},\n  }`);
  const b = r.body;
  if (b.kind === "json") opts.push(`body: JSON.stringify(${indentRest(toJs(b.value), "  ")})`);
  else if (b.kind === "form") {
    const dup = new Set(b.fields.map(([k]) => k)).size !== b.fields.length;
    opts.push(dup ? `body: new URLSearchParams([\n${b.fields.map(([k, v]) => `    [${jsS(k)}, ${jsS(v)}]`).join(",\n")},\n  ])` : `body: new URLSearchParams({\n${b.fields.map(([k, v]) => `    ${keyJs(k)}: ${jsS(v)}`).join(",\n")},\n  })`);
  } else if (b.kind === "raw") opts.push(b.file ? `body: file, // contents of ${b.file}` : `body: ${jsS(b.text)}`);
  else if (b.kind === "multipart") {
    pre.push("const form = new FormData();");
    for (const p of b.parts) {
      if (p.file && !p.fromFile) pre.push(`form.append(${jsS(p.name)}, fileInput.files[0], ${jsS(p.filename ?? fileName(p.file))}); // ${p.file}${p.type ? ` (${p.type})` : ""}`);
      else if (p.file) pre.push(`form.append(${jsS(p.name)}, await fileInput.files[0].text()); // contents of ${p.file}`);
      else pre.push(`form.append(${jsS(p.name)}, ${p.type ? `new Blob([${jsS(p.value ?? "")}], { type: ${jsS(p.type)} })` : jsS(p.value ?? "")});`);
    }
    opts.push("body: form");
  }
  if (r.timeout) opts.push(`signal: AbortSignal.timeout(${Math.round(r.timeout * 1000)})`);
  if (!r.follow && r.method !== "GET" && r.method !== "HEAD") { /* fetch follows by default like browsers; curl does not */ }
  const lines = [...pre, ...(pre.length ? [""] : [])];
  if (r.insecure) lines.push("// -k: fetch cannot skip TLS verification; trust the certificate instead.");
  lines.push(`const response = await fetch(${jsS(r.url)}${opts.length ? `, {\n  ${opts.join(",\n  ")},\n}` : ""});`);
  if (r.head) lines.push("console.log(response.status, Object.fromEntries(response.headers));");
  else {
    lines.push("if (!response.ok) throw new Error(`HTTP ${response.status}`);");
    lines.push(wantsJson(r) ? "const data = await response.json();" : "const data = await response.text();");
    lines.push("console.log(data);");
  }
  return lines.join("\n");
}

function genAxios(r: Req): string {
  const imports = ['import axios from "axios";'];
  const pre: string[] = [];
  const cfg: string[] = [`method: ${jsS(r.method.toLowerCase())}`, `url: ${jsS(r.query.length ? r.base : r.url)}`];
  if (r.query.length) {
    const dup = new Set(r.query.map(([k]) => k)).size !== r.query.length;
    cfg.push(dup ? `params: new URLSearchParams([\n${r.query.map(([k, v]) => `    [${jsS(k)}, ${jsS(v)}]`).join(",\n")},\n  ])` : `params: {\n${r.query.map(([k, v]) => `    ${keyJs(k)}: ${jsS(v)}`).join(",\n")},\n  }`);
  }
  const h = hdrs(r, r.body.kind === "multipart" ? ["content-type"] : []);
  if (r.bearer) h.push(["Authorization", `Bearer ${r.bearer}`]);
  if (h.length) cfg.push(`headers: {\n${h.map(([k, v]) => `    ${keyJs(k)}: ${jsS(v)}`).join(",\n")},\n  }`);
  if (r.auth) cfg.push(`auth: {\n    username: ${jsS(r.auth.user)},\n    password: ${jsS(r.auth.pass)},\n  }`);
  const b = r.body;
  if (b.kind === "json") cfg.push(`data: ${indentRest(toJs(b.value), "  ")}`);
  else if (b.kind === "form") cfg.push(`data: new URLSearchParams([\n${b.fields.map(([k, v]) => `    [${jsS(k)}, ${jsS(v)}]`).join(",\n")},\n  ])`);
  else if (b.kind === "raw") {
    if (b.file) { imports.push('import fs from "node:fs";'); cfg.push(`data: fs.readFileSync(${jsS(b.file)})`); }
    else cfg.push(`data: ${jsS(b.text)}`);
  } else if (b.kind === "multipart") {
    if (b.parts.some((p) => p.file)) imports.push('import fs from "node:fs";');
    pre.push("const form = new FormData();");
    for (const p of b.parts) {
      if (p.file && !p.fromFile) pre.push(`form.append(${jsS(p.name)}, await fs.openAsBlob(${jsS(p.file)}${p.type ? `, { type: ${jsS(p.type)} }` : ""}), ${jsS(p.filename ?? fileName(p.file))});`);
      else if (p.file) pre.push(`form.append(${jsS(p.name)}, fs.readFileSync(${jsS(p.file)}, "utf8"));`);
      else pre.push(`form.append(${jsS(p.name)}, ${jsS(p.value ?? "")});`);
    }
    cfg.push("data: form");
  }
  if (r.timeout) cfg.push(`timeout: ${Math.round(r.timeout * 1000)}`);
  if (r.insecure) { imports.push('import https from "node:https";'); cfg.push("httpsAgent: new https.Agent({ rejectUnauthorized: false })"); }
  if (r.compressed) cfg.push("decompress: true");
  if (r.output) { if (!imports.some((i) => i.includes("node:fs"))) imports.push('import fs from "node:fs";'); cfg.push('responseType: "arraybuffer"'); }
  const lines = [...imports, "", ...pre, ...(pre.length ? [""] : []), `const response = await axios({\n  ${cfg.join(",\n  ")},\n});`];
  if (r.output) lines.push(`fs.writeFileSync(${jsS(r.output)}, response.data);`);
  else lines.push(r.head ? "console.log(response.status, response.headers);" : "console.log(response.data);");
  return lines.join("\n");
}

function genPython(r: Req, lib: "requests" | "httpx"): string {
  const imports = [`import ${lib}`];
  const blocks: string[] = [];
  const args: string[] = [];
  const url = r.query.length ? r.base : r.url;
  if (r.query.length) {
    const dup = new Set(r.query.map(([k]) => k)).size !== r.query.length;
    blocks.push(dup ? `params = [\n${r.query.map(([k, v]) => `    (${pyS(k)}, ${pyS(v)}),`).join("\n")}\n]` : `params = {\n${r.query.map(([k, v]) => `    ${pyS(k)}: ${pyS(v)},`).join("\n")}\n}`);
    args.push("params=params");
  }
  const b = r.body;
  const drop = ["cookie"];
  if (b.kind === "multipart") drop.push("content-type");
  if (b.kind === "json" && /^application\/json$/i.test(ctOf(r) ?? "")) drop.push("content-type");
  const h = hdrs(r, drop);
  if (r.bearer) h.push(["Authorization", `Bearer ${r.bearer}`]);
  const cookie = r.headers.find(([k]) => k.toLowerCase() === "cookie")?.[1];
  if (cookie) {
    blocks.push(`cookies = {\n${cookie.split(/;\s*/).filter(Boolean).map((c) => { const i = c.indexOf("="); return `    ${pyS(c.slice(0, i))}: ${pyS(c.slice(i + 1))},`; }).join("\n")}\n}`);
  }
  if (h.length) { blocks.push(`headers = {\n${h.map(([k, v]) => `    ${pyS(k)}: ${pyS(v)},`).join("\n")}\n}`); args.push("headers=headers"); }
  if (cookie) args.push("cookies=cookies");
  if (b.kind === "json") { blocks.push(`json_data = ${toPy(b.value)}`); args.push("json=json_data"); }
  else if (b.kind === "form") {
    const dup = new Set(b.fields.map(([k]) => k)).size !== b.fields.length;
    blocks.push(dup ? `data = [\n${b.fields.map(([k, v]) => `    (${pyS(k)}, ${pyS(v)}),`).join("\n")}\n]` : `data = {\n${b.fields.map(([k, v]) => `    ${pyS(k)}: ${pyS(v)},`).join("\n")}\n}`);
    args.push("data=data");
  } else if (b.kind === "raw") {
    if (b.file) blocks.push(`with open(${pyS(b.file)}, 'rb') as f:\n    data = f.read()`);
    else blocks.push(`data = ${pyS(b.text)}${/[^\x00-\x7f]/.test(b.text) ? ".encode()" : ""}`);
    args.push(lib === "httpx" ? "content=data" : "data=data");
  } else if (b.kind === "multipart") {
    const files = b.parts.map((p) => {
      if (p.file && !p.fromFile) return `    ${pyS(p.name)}: (${pyS(p.filename ?? fileName(p.file))}, open(${pyS(p.file)}, 'rb')${p.type ? `, ${pyS(p.type)}` : ""}),`;
      if (p.file) return `    ${pyS(p.name)}: (None, open(${pyS(p.file)}).read()),`;
      return `    ${pyS(p.name)}: (None, ${pyS(p.value ?? "")}${p.type ? `, ${pyS(p.type)}` : ""}),`;
    });
    blocks.push(`files = {\n${files.join("\n")}\n}`);
    args.push("files=files");
  }
  if (r.auth) {
    if (r.auth.type === "digest") { imports.push(lib === "requests" ? "from requests.auth import HTTPDigestAuth" : ""); args.push(`auth=${lib === "requests" ? "HTTPDigestAuth" : "httpx.DigestAuth"}(${pyS(r.auth.user)}, ${pyS(r.auth.pass)})`); }
    else args.push(`auth=(${pyS(r.auth.user)}, ${pyS(r.auth.pass)})`);
  }
  if (r.timeout) args.push(`timeout=${r.timeout}`);
  if (r.insecure) args.push("verify=False");
  if (lib === "httpx" && r.follow) args.push("follow_redirects=True");
  if (r.proxy) args.push(lib === "requests" ? `proxies={'https': ${pyS(r.proxy)}, 'http': ${pyS(r.proxy)}}` : `proxy=${pyS(r.proxy)}`);
  const m = r.method.toLowerCase();
  const call = ["get", "post", "put", "patch", "delete", "head", "options"].includes(m) ? `${lib}.${m}(${pyS(url)}` : `${lib}.request(${pyS(r.method)}, ${pyS(url)}`;
  const argStr = args.length ? `${call}, ${args.join(", ")})` : `${call})`;
  const lines = [imports.filter(Boolean).join("\n"), "", ...blocks.flatMap((x) => [x, ""])];
  lines.push(`response = ${argStr.length > 100 ? `${call},\n    ${args.join(",\n    ")},\n)` : argStr}`);
  if (r.output) lines.push(`with open(${pyS(r.output)}, 'wb') as out:\n    out.write(response.content)`);
  else if (r.head) lines.push("print(response.status_code, dict(response.headers))");
  else lines.push("response.raise_for_status()", wantsJson(r) ? "print(response.json())" : "print(response.text)");
  return lines.join("\n");
}

function genGo(r: Req): string {
  const imp = new Set(["fmt", "io", "log", "net/http"]);
  const L: string[] = [];
  const b = r.body;
  let bodyVar = "nil";
  if (b.kind === "json" || b.kind === "raw" || b.kind === "form") {
    if (b.kind === "raw" && b.file) {
      imp.add("os");
      L.push(`\tbody, err := os.Open(${JSON.stringify(b.file)})`, "\tif err != nil {", "\t\tlog.Fatal(err)", "\t}", "\tdefer body.Close()");
    } else if (b.kind === "form") {
      imp.add("net/url").add("strings");
      L.push("\tform := url.Values{}");
      for (const [k, v] of b.fields) L.push(`\tform.Add(${JSON.stringify(k)}, ${JSON.stringify(v)})`);
      L.push("\tbody := strings.NewReader(form.Encode())");
    } else {
      imp.add("strings");
      L.push(`\tbody := strings.NewReader(${goS(b.kind === "json" ? prettyJson(b) : b.text)})`);
    }
    bodyVar = "body";
  } else if (b.kind === "multipart") {
    imp.add("bytes").add("mime/multipart");
    L.push("\tvar buf bytes.Buffer", "\tw := multipart.NewWriter(&buf)");
    b.parts.forEach((p, i) => {
      if (p.file && !p.fromFile) {
        imp.add("os").add("path/filepath");
        L.push(
          `\tf${i}, err := os.Open(${JSON.stringify(p.file)})`, "\tif err != nil {", "\t\tlog.Fatal(err)", "\t}", `\tdefer f${i}.Close()`,
          `\tpart${i}, err := w.CreateFormFile(${JSON.stringify(p.name)}, filepath.Base(${JSON.stringify(p.filename ?? p.file)}))`, "\tif err != nil {", "\t\tlog.Fatal(err)", "\t}",
          `\tif _, err := io.Copy(part${i}, f${i}); err != nil {`, "\t\tlog.Fatal(err)", "\t}"
        );
      } else if (p.file) {
        imp.add("os");
        L.push(`\tv${i}, _ := os.ReadFile(${JSON.stringify(p.file)})`, `\tw.WriteField(${JSON.stringify(p.name)}, string(v${i}))`);
      } else L.push(`\tw.WriteField(${JSON.stringify(p.name)}, ${JSON.stringify(p.value ?? "")})`);
    });
    L.push("\tw.Close()");
    bodyVar = "&buf";
  }
  L.push(`\treq, err := http.NewRequest(${JSON.stringify(r.method)}, ${JSON.stringify(r.url)}, ${bodyVar})`, "\tif err != nil {", "\t\tlog.Fatal(err)", "\t}");
  for (const [k, v] of hdrs(r, b.kind === "multipart" ? ["content-type"] : [])) L.push(`\treq.Header.Set(${JSON.stringify(k)}, ${JSON.stringify(v)})`);
  if (b.kind === "multipart") L.push('\treq.Header.Set("Content-Type", w.FormDataContentType())');
  if (r.bearer) L.push(`\treq.Header.Set("Authorization", ${JSON.stringify("Bearer " + r.bearer)})`);
  if (r.auth) L.push(`\treq.SetBasicAuth(${JSON.stringify(r.auth.user)}, ${JSON.stringify(r.auth.pass)})${r.auth.type !== "basic" ? " // Go has no built-in " + r.auth.type + " auth" : ""}`);
  const client: string[] = [];
  if (r.timeout) { imp.add("time"); client.push(`\t\tTimeout: ${r.timeout} * time.Second,`); }
  if (r.insecure) { imp.add("crypto/tls"); client.push("\t\tTransport: &http.Transport{TLSClientConfig: &tls.Config{InsecureSkipVerify: true}},"); }
  L.push("", client.length ? `\tclient := &http.Client{\n${client.join("\n")}\n\t}` : "\tclient := &http.Client{}");
  L.push("\tresp, err := client.Do(req)", "\tif err != nil {", "\t\tlog.Fatal(err)", "\t}", "\tdefer resp.Body.Close()");
  if (r.output) {
    imp.add("os");
    L.push(`\tout, err := os.Create(${JSON.stringify(r.output)})`, "\tif err != nil {", "\t\tlog.Fatal(err)", "\t}", "\tdefer out.Close()", "\tif _, err := io.Copy(out, resp.Body); err != nil {", "\t\tlog.Fatal(err)", "\t}");
  } else L.push("\tbodyText, err := io.ReadAll(resp.Body)", "\tif err != nil {", "\t\tlog.Fatal(err)", "\t}", '\tfmt.Printf("%s %s\\n", resp.Status, bodyText)');
  if (r.output) imp.delete("fmt");
  const imports = [...imp].sort();
  return `package main\n\nimport (\n${imports.map((i) => `\t"${i}"`).join("\n")}\n)\n\nfunc main() {\n${L.join("\n")}\n}`;
}

function genPhp(r: Req): string {
  const L = ["<?php", "", "$ch = curl_init();", `curl_setopt($ch, CURLOPT_URL, ${phpS(r.url)});`, "curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);"];
  if (r.method === "POST") L.push("curl_setopt($ch, CURLOPT_POST, true);");
  else if (r.method === "HEAD") L.push("curl_setopt($ch, CURLOPT_NOBODY, true);");
  else if (r.method !== "GET") L.push(`curl_setopt($ch, CURLOPT_CUSTOMREQUEST, ${phpS(r.method)});`);
  const b = r.body;
  const h = hdrs(r, ["cookie", ...(b.kind === "multipart" ? ["content-type"] : [])]);
  if (r.bearer) h.push(["Authorization", `Bearer ${r.bearer}`]);
  if (h.length) L.push(`curl_setopt($ch, CURLOPT_HTTPHEADER, [\n${h.map(([k, v]) => `    ${phpS(`${k}: ${v}`)},`).join("\n")}\n]);`);
  const cookie = r.headers.find(([k]) => k.toLowerCase() === "cookie")?.[1];
  if (cookie) L.push(`curl_setopt($ch, CURLOPT_COOKIE, ${phpS(cookie)});`);
  if (r.auth) {
    L.push(`curl_setopt($ch, CURLOPT_USERPWD, ${phpS(`${r.auth.user}:${r.auth.pass}`)});`);
    if (r.auth.type !== "basic") L.push(`curl_setopt($ch, CURLOPT_HTTPAUTH, CURLAUTH_${r.auth.type.toUpperCase()});`);
  }
  if (b.kind === "json") L.push(`curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode(${phpArr(b.value, 0)}));`);
  else if (b.kind === "form") L.push(`curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query([\n${b.fields.map(([k, v]) => `    ${phpS(k)} => ${phpS(v)},`).join("\n")}\n]));`);
  else if (b.kind === "raw") L.push(`curl_setopt($ch, CURLOPT_POSTFIELDS, ${b.file ? `file_get_contents(${phpS(b.file)})` : phpS(b.text)});`);
  else if (b.kind === "multipart")
    L.push(`curl_setopt($ch, CURLOPT_POSTFIELDS, [\n${b.parts.map((p) => `    ${phpS(p.name)} => ${p.file && !p.fromFile ? `new CURLFile(${phpS(p.file)}${p.type ? `, ${phpS(p.type)}` : ", null"}, ${phpS(p.filename ?? fileName(p.file))})` : p.file ? `file_get_contents(${phpS(p.file)})` : phpS(p.value ?? "")},`).join("\n")}\n]);`);
  if (r.follow) L.push("curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);");
  if (r.insecure) L.push("curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);", "curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0);");
  if (r.compressed) L.push("curl_setopt($ch, CURLOPT_ENCODING, '');");
  if (r.timeout) L.push(`curl_setopt($ch, CURLOPT_TIMEOUT, ${r.timeout});`);
  if (r.connectTimeout) L.push(`curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, ${r.connectTimeout});`);
  if (r.proxy) L.push(`curl_setopt($ch, CURLOPT_PROXY, ${phpS(r.proxy)});`);
  L.push("", "$response = curl_exec($ch);", "if ($response === false) {", "    throw new RuntimeException(curl_error($ch));", "}", "$status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);", "curl_close($ch);", "", 'echo "HTTP $status\\n";');
  if (r.output) L.push(`file_put_contents(${phpS(r.output)}, $response);`);
  else L.push(wantsJson(r) ? "var_dump(json_decode($response, true));" : "echo $response;");
  return L.join("\n");
}

function phpArr(v: unknown, ind: number): string {
  const pad = "    ".repeat(ind + 1), end = "    ".repeat(ind);
  if (v === null) return "null";
  if (typeof v === "boolean" || typeof v === "number") return String(v);
  if (typeof v === "string") return phpS(v);
  if (Array.isArray(v)) return !v.length ? "[]" : inlineable(v) ? `[${v.map((x) => phpArr(x, 0)).join(", ")}]` : `[\n${v.map((x) => pad + phpArr(x, ind + 1) + ",").join("\n")}\n${end}]`;
  const e = Object.entries(v as object);
  return e.length ? `[\n${e.map(([k, x]) => `${pad}${phpS(k)} => ${phpArr(x, ind + 1)},`).join("\n")}\n${end}]` : "new stdClass()";
}

function genRuby(r: Req): string {
  const req = ["require 'net/http'", "require 'uri'"];
  const b = r.body;
  const L: string[] = [];
  L.push(`uri = URI(${phpS(r.url)})`);
  const cls: Record<string, string> = { GET: "Get", POST: "Post", PUT: "Put", PATCH: "Patch", DELETE: "Delete", HEAD: "Head", OPTIONS: "Options" };
  L.push(cls[r.method] ? `request = Net::HTTP::${cls[r.method]}.new(uri)` : `request = Net::HTTPGenericRequest.new(${phpS(r.method)}, ${b.kind !== "none"}, true, uri)`);
  for (const [k, v] of hdrs(r, b.kind === "multipart" || b.kind === "form" ? ["content-type"] : [])) L.push(`request[${phpS(k)}] = ${phpS(v)}`);
  if (r.bearer) L.push(`request['Authorization'] = ${phpS("Bearer " + r.bearer)}`);
  if (r.auth) L.push(`request.basic_auth(${phpS(r.auth.user)}, ${phpS(r.auth.pass)})`);
  if (b.kind === "json") {
    req.push("require 'json'");
    L.push(`request.body = JSON.dump(${rubyLit(b.value, 0)})`);
  } else if (b.kind === "form") L.push(`request.set_form_data(${b.fields.map(([k, v]) => `${phpS(k)} => ${phpS(v)}`).join(", ")})`);
  else if (b.kind === "raw") L.push(b.file ? `request.body = File.binread(${phpS(b.file)})` : `request.body = ${phpS(b.text)}`);
  else if (b.kind === "multipart") {
    L.push(
      `request.set_form(\n  [\n${b.parts.map((p) => `    [${phpS(p.name)}, ${p.file && !p.fromFile ? `File.open(${phpS(p.file)})${p.type || p.filename ? `, { ${[p.filename ? `filename: ${phpS(p.filename)}` : "", p.type ? `content_type: ${phpS(p.type)}` : ""].filter(Boolean).join(", ")} }` : ""}` : p.file ? `File.read(${phpS(p.file)})` : phpS(p.value ?? "")}],`).join("\n")}\n  ],\n  'multipart/form-data'\n)`
    );
  }
  const opts = ["use_ssl: uri.scheme == 'https'"];
  if (r.insecure) { opts.push("verify_mode: OpenSSL::SSL::VERIFY_NONE"); req.push("require 'openssl'"); }
  if (r.timeout) opts.push(`read_timeout: ${r.timeout}`);
  if (r.connectTimeout) opts.push(`open_timeout: ${r.connectTimeout}`);
  L.push("", `response = Net::HTTP.start(uri.hostname, uri.port, ${opts.join(", ")}) do |http|`, "  http.request(request)", "end", "");
  if (r.follow) L.unshift("# -L: Net::HTTP does not follow redirects; check response['location'] and repeat.");
  if (r.output) L.push(`File.binwrite(${phpS(r.output)}, response.body)`);
  else L.push("puts response.code", r.head ? "puts response.to_hash" : "puts response.body");
  return [...req, "", ...L].join("\n");
}

function rubyLit(v: unknown, ind: number): string {
  const pad = "  ".repeat(ind + 1), end = "  ".repeat(ind);
  if (v === null) return "nil";
  if (typeof v === "boolean" || typeof v === "number") return String(v);
  if (typeof v === "string") return phpS(v);
  if (Array.isArray(v)) return !v.length ? "[]" : inlineable(v) ? `[${v.map((x) => rubyLit(x, 0)).join(", ")}]` : `[\n${v.map((x) => pad + rubyLit(x, ind + 1)).join(",\n")}\n${end}]`;
  const e = Object.entries(v as object);
  return e.length ? `{\n${e.map(([k, x]) => `${pad}${phpS(k)} => ${rubyLit(x, ind + 1)}`).join(",\n")}\n${end}}` : "{}";
}

function genJava(r: Req): string {
  const imp = new Set(["java.net.URI", "java.net.http.HttpClient", "java.net.http.HttpRequest", "java.net.http.HttpResponse"]);
  const pre: string[] = [];
  const clientB: string[] = [];
  if (r.follow) clientB.push(".followRedirects(HttpClient.Redirect.NORMAL)");
  if (r.connectTimeout) { imp.add("java.time.Duration"); clientB.push(`.connectTimeout(Duration.ofSeconds(${r.connectTimeout}))`); }
  const rb: string[] = [`.uri(URI.create(${jsS(r.url)}))`];
  const b = r.body;
  for (const [k, v] of hdrs(r, b.kind === "multipart" ? ["content-type"] : [])) rb.push(`.header(${jsS(k)}, ${jsS(v)})`);
  if (r.bearer) rb.push(`.header("Authorization", ${jsS("Bearer " + r.bearer)})`);
  if (r.auth) {
    imp.add("java.util.Base64");
    rb.push(`.header("Authorization", "Basic " + Base64.getEncoder().encodeToString(${jsS(`${r.auth.user}:${r.auth.pass}`)}.getBytes()))`);
  }
  if (r.timeout) { imp.add("java.time.Duration"); rb.push(`.timeout(Duration.ofSeconds(${r.timeout}))`); }
  let publisher = "HttpRequest.BodyPublishers.noBody()";
  if (b.kind === "json" || b.kind === "raw" || b.kind === "form") {
    if (b.kind === "raw" && b.file) { imp.add("java.nio.file.Path"); publisher = `HttpRequest.BodyPublishers.ofFile(Path.of(${jsS(b.file)}))`; }
    else {
      const text = b.kind === "json" ? prettyJson(b) : b.text;
      publisher = text.includes("\n") ? `HttpRequest.BodyPublishers.ofString("""\n            ${text.replace(/\\/g, "\\\\").replace(/"""/g, '\\"""').split("\n").join("\n            ")}""")` : `HttpRequest.BodyPublishers.ofString(${jsS(text)})`;
    }
  } else if (b.kind === "multipart") {
    imp.add("java.util.ArrayList").add("java.util.List");
    pre.push('String boundary = "----JavaFormBoundary" + System.currentTimeMillis();', "List<byte[]> parts = new ArrayList<>();");
    for (const p of b.parts) {
      if (p.file && !p.fromFile) {
        imp.add("java.nio.file.Files").add("java.nio.file.Path");
        pre.push(`parts.add(("--" + boundary + "\\r\\nContent-Disposition: form-data; name=\\"${p.name}\\"; filename=\\"${p.filename ?? fileName(p.file)}\\"\\r\\nContent-Type: ${p.type ?? "application/octet-stream"}\\r\\n\\r\\n").getBytes());`, `parts.add(Files.readAllBytes(Path.of(${jsS(p.file)})));`, 'parts.add("\\r\\n".getBytes());');
      } else pre.push(`parts.add(("--" + boundary + "\\r\\nContent-Disposition: form-data; name=\\"${p.name}\\"\\r\\n\\r\\n" + ${p.file ? `Files.readString(Path.of(${jsS(p.file)}))` : jsS(p.value ?? "")} + "\\r\\n").getBytes());`);
      if (p.file && p.fromFile) imp.add("java.nio.file.Files").add("java.nio.file.Path");
    }
    pre.push('parts.add(("--" + boundary + "--\\r\\n").getBytes());');
    rb.push('.header("Content-Type", "multipart/form-data; boundary=" + boundary)');
    publisher = "HttpRequest.BodyPublishers.ofByteArrays(parts)";
  }
  if (r.method === "GET" && b.kind === "none") rb.push(".GET()");
  else if (r.method === "DELETE" && b.kind === "none") rb.push(".DELETE()");
  else if (r.method === "POST") rb.push(`.POST(${publisher})`);
  else if (r.method === "PUT") rb.push(`.PUT(${publisher})`);
  else rb.push(`.method(${jsS(r.method)}, ${publisher})`);
  const ind = "        ";
  const body = [
    ...(r.insecure ? [`${ind}// -k: skipping TLS verification needs a custom SSLContext that trusts all certificates.`] : []),
    `${ind}HttpClient client = HttpClient.newBuilder()${clientB.map((x) => `\n${ind}    ${x}`).join("")}\n${ind}    .build();`,
    "",
    ...pre.map((x) => ind + x),
    ...(pre.length ? [""] : []),
    `${ind}HttpRequest request = HttpRequest.newBuilder()${rb.map((x) => `\n${ind}    ${x}`).join("")}\n${ind}    .build();`,
    "",
  ];
  if (r.output) { imp.add("java.nio.file.Path"); body.push(`${ind}HttpResponse<Path> response = client.send(request, HttpResponse.BodyHandlers.ofFile(Path.of(${jsS(r.output)})));`, `${ind}System.out.println(response.statusCode());`); }
  else body.push(`${ind}HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());`, `${ind}System.out.println(response.statusCode());`, `${ind}System.out.println(${r.head ? "response.headers().map()" : "response.body()"});`);
  return `${[...imp].sort().map((i) => `import ${i};`).join("\n")}\n\npublic class Main {\n    public static void main(String[] args) throws Exception {\n${body.join("\n")}\n    }\n}`;
}

function genCSharp(r: Req): string {
  const using = new Set(["System.Net.Http"]);
  const handler: string[] = [];
  if (r.insecure) handler.push("    ServerCertificateCustomValidationCallback = HttpClientHandler.DangerousAcceptAnyServerCertificateValidator,");
  if (r.compressed) { using.add("System.Net"); handler.push("    AutomaticDecompression = DecompressionMethods.All,"); }
  const cookie = r.headers.find(([k]) => k.toLowerCase() === "cookie");
  if (cookie) handler.push("    UseCookies = false,");
  const L: string[] = [];
  if (handler.length) L.push(`var handler = new HttpClientHandler\n{\n${handler.join("\n")}\n};`);
  L.push(`using var client = new HttpClient(${handler.length ? "handler" : ""})${r.timeout ? ` { Timeout = TimeSpan.FromSeconds(${r.timeout}) }` : ""};`, "");
  const m: Record<string, string> = { GET: "Get", POST: "Post", PUT: "Put", PATCH: "Patch", DELETE: "Delete", HEAD: "Head", OPTIONS: "Options" };
  L.push(`using var request = new HttpRequestMessage(${m[r.method] ? `HttpMethod.${m[r.method]}` : `new HttpMethod(${jsS(r.method)})`}, ${jsS(r.url)});`);
  const contentHeaders = new Set(["content-type", "content-length", "content-language", "content-encoding", "content-disposition", "content-md5", "content-range", "expires", "last-modified", "allow"]);
  const b = r.body;
  for (const [k, v] of r.headers) {
    if (contentHeaders.has(k.toLowerCase())) continue;
    L.push(`request.Headers.TryAddWithoutValidation(${jsS(k)}, ${jsS(v)});`);
  }
  if (r.bearer) { using.add("System.Net.Http.Headers"); L.push(`request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", ${jsS(r.bearer)});`); }
  if (r.auth) {
    using.add("System.Net.Http.Headers").add("System.Text");
    L.push(`request.Headers.Authorization = new AuthenticationHeaderValue("Basic", Convert.ToBase64String(Encoding.UTF8.GetBytes(${jsS(`${r.auth.user}:${r.auth.pass}`)})));`);
  }
  const ct = ctOf(r);
  const media = (ct ?? "text/plain").split(";")[0].trim();
  if (b.kind === "json" || (b.kind === "raw" && !b.file)) {
    using.add("System.Text");
    const text = b.kind === "json" ? prettyJson(b) : b.text;
    const lit = text.includes("\n") ? `"""\n    ${text.split("\n").join("\n    ")}\n    """` : jsS(text);
    L.push(`request.Content = new StringContent(${lit}, Encoding.UTF8, ${jsS(media)});`);
  } else if (b.kind === "raw") {
    using.add("System.Net.Http.Headers");
    L.push(`request.Content = new ByteArrayContent(File.ReadAllBytes(${jsS(b.file!)}));`, `request.Content.Headers.ContentType = MediaTypeHeaderValue.Parse(${jsS(ct ?? "application/octet-stream")});`);
  } else if (b.kind === "form") {
    L.push(`request.Content = new FormUrlEncodedContent(new[]\n{\n${b.fields.map(([k, v]) => `    new KeyValuePair<string, string>(${jsS(k)}, ${jsS(v)}),`).join("\n")}\n});`);
  } else if (b.kind === "multipart") {
    L.push("var content = new MultipartFormDataContent();");
    b.parts.forEach((p, i) => {
      if (p.file && !p.fromFile) {
        L.push(`var file${i} = new ByteArrayContent(File.ReadAllBytes(${jsS(p.file)}));`);
        if (p.type) { using.add("System.Net.Http.Headers"); L.push(`file${i}.Headers.ContentType = MediaTypeHeaderValue.Parse(${jsS(p.type)});`); }
        L.push(`content.Add(file${i}, ${jsS(p.name)}, ${jsS(p.filename ?? fileName(p.file))});`);
      } else L.push(`content.Add(new StringContent(${p.file ? `File.ReadAllText(${jsS(p.file)})` : jsS(p.value ?? "")}), ${jsS(p.name)});`);
    });
    L.push("request.Content = content;");
  }
  for (const [k, v] of r.headers) if (contentHeaders.has(k.toLowerCase()) && k.toLowerCase() !== "content-type" && b.kind !== "none") L.push(`request.Content.Headers.TryAddWithoutValidation(${jsS(k)}, ${jsS(v)});`);
  L.push("", "using var response = await client.SendAsync(request);", "response.EnsureSuccessStatusCode();");
  if (r.output) L.push(`await File.WriteAllBytesAsync(${jsS(r.output)}, await response.Content.ReadAsByteArrayAsync());`);
  else L.push("var body = await response.Content.ReadAsStringAsync();", "Console.WriteLine(body);");
  return `${[...using].sort().map((u) => `using ${u};`).join("\n")}\n\n${L.join("\n")}`;
}

function genRust(r: Req): string {
  const b = r.body;
  const cb: string[] = [];
  if (r.insecure) cb.push(".danger_accept_invalid_certs(true)");
  if (r.timeout) cb.push(`.timeout(std::time::Duration::from_secs(${r.timeout}))`);
  if (r.connectTimeout) cb.push(`.connect_timeout(std::time::Duration::from_secs(${r.connectTimeout}))`);
  if (r.compressed) cb.push(".gzip(true)");
  if (r.proxy) cb.push(`.proxy(reqwest::Proxy::all(${rustS(r.proxy)})?)`);
  const L: string[] = [];
  const h = hdrs(r, b.kind === "multipart" ? ["content-type"] : []);
  if (h.length) {
    L.push("    let mut headers = header::HeaderMap::new();");
    for (const [k, v] of h) L.push(`    headers.insert(${rustS(k.toLowerCase())}, ${rustS(v)}.parse()?);`);
    L.push("");
  }
  if (b.kind === "multipart") {
    L.push("    let form = reqwest::multipart::Form::new()");
    for (const p of b.parts) {
      if (p.file && !p.fromFile) L.push(`        .part(${rustS(p.name)}, reqwest::multipart::Part::bytes(std::fs::read(${rustS(p.file)})?).file_name(${rustS(p.filename ?? fileName(p.file))})${p.type ? `.mime_str(${rustS(p.type)})?` : ""})`);
      else L.push(`        .text(${rustS(p.name)}, ${p.file ? `std::fs::read_to_string(${rustS(p.file)})?` : rustS(p.value ?? "")})`);
    }
    L[L.length - 1] += ";";
    L.push("");
  }
  L.push(`    let client = reqwest::Client::builder()${cb.map((x) => `\n        ${x}`).join("")}\n        .build()?;`);
  const m = r.method.toLowerCase();
  const chain: string[] = [["get", "post", "put", "patch", "delete", "head"].includes(m) ? `.${m}(${rustS(r.url)})` : `.request(reqwest::Method::from_bytes(b${JSON.stringify(r.method)})?, ${rustS(r.url)})`];
  if (h.length) chain.push(".headers(headers)");
  if (r.bearer) chain.push(`.bearer_auth(${rustS(r.bearer)})`);
  if (r.auth) chain.push(`.basic_auth(${rustS(r.auth.user)}, Some(${rustS(r.auth.pass)}))`);
  if (b.kind === "json") chain.push(`.body(${rustS(prettyJson(b))})`);
  else if (b.kind === "form") chain.push(`.form(&[${b.fields.map(([k, v]) => `(${rustS(k)}, ${rustS(v)})`).join(", ")}])`);
  else if (b.kind === "raw") chain.push(b.file ? `.body(std::fs::read(${rustS(b.file)})?)` : `.body(${rustS(b.text)})`);
  else if (b.kind === "multipart") chain.push(".multipart(form)");
  chain.push(".send()", ".await?");
  L.push("", `    let res = client\n        ${chain.join("\n        ")};`, "", '    println!("{}", res.status());');
  if (r.output) L.push(`    std::fs::write(${rustS(r.output)}, res.bytes().await?)?;`);
  else L.push('    println!("{}", res.text().await?);');
  return `${h.length ? "use reqwest::header;\n\n" : ""}#[tokio::main]\nasync fn main() -> Result<(), Box<dyn std::error::Error>> {\n${L.join("\n")}\n    Ok(())\n}`;
}

function genPowerShell(r: Req): string {
  const L: string[] = [];
  const b = r.body;
  const h = hdrs(r, ["content-type", "user-agent"]);
  if (r.bearer) h.push(["Authorization", `Bearer ${r.bearer}`]);
  if (r.auth) h.push(["Authorization", `Basic ${b64(`${r.auth.user}:${r.auth.pass}`)}`]);
  if (h.length) L.push(`$headers = @{\n${h.map(([k, v]) => `    ${psS(k)} = ${psS(v)}`).join("\n")}\n}`);
  const p: string[] = [`Uri = ${psS(r.url)}`, `Method = ${psS(r.method[0] + r.method.slice(1).toLowerCase())}`];
  if (h.length) p.push("Headers = $headers");
  const ua = r.headers.find(([k]) => k.toLowerCase() === "user-agent")?.[1];
  if (ua) p.push(`UserAgent = ${psS(ua)}`);
  const ct = ctOf(r);
  if (b.kind === "json" || b.kind === "raw") {
    if (b.kind === "raw" && b.file) p.push(`InFile = ${psS(b.file)}`);
    else {
      const text = b.kind === "json" ? prettyJson(b) : b.text;
      L.push(text.includes("\n") ? `$body = @'\n${text}\n'@` : `$body = ${psS(text)}`);
      p.push("Body = $body");
    }
    if (ct) p.push(`ContentType = ${psS(ct)}`);
  } else if (b.kind === "form") {
    L.push(`$body = @{\n${b.fields.map(([k, v]) => `    ${psS(k)} = ${psS(v)}`).join("\n")}\n}`);
    p.push("Body = $body", `ContentType = ${psS(ct ?? "application/x-www-form-urlencoded")}`);
  } else if (b.kind === "multipart") {
    L.push(`$form = @{\n${b.parts.map((x) => `    ${psS(x.name)} = ${x.file && !x.fromFile ? `Get-Item -Path ${psS(x.file)}` : x.file ? `Get-Content -Raw ${psS(x.file)}` : psS(x.value ?? "")}`).join("\n")}\n}`);
    p.push("Form = $form");
  }
  if (r.insecure) p.push("SkipCertificateCheck = $true");
  if (r.timeout) p.push(`TimeoutSec = ${Math.ceil(r.timeout)}`);
  if (r.proxy) p.push(`Proxy = ${psS(r.proxy)}`);
  if (r.output) p.push(`OutFile = ${psS(r.output)}`);
  L.push(`$params = @{\n${p.map((x) => "    " + x).join("\n")}\n}`, r.output ? "Invoke-RestMethod @params" : "$response = Invoke-RestMethod @params\n$response | ConvertTo-Json -Depth 10");
  return L.join("\n\n");
}

function genHttpie(r: Req): string {
  const flags: string[] = [];
  const items: string[] = [];
  const b = r.body;
  if (b.kind === "form") flags.push("--form");
  if (b.kind === "multipart") flags.push("--multipart");
  if (r.follow) flags.push("--follow");
  if (r.insecure) flags.push("--verify=no");
  if (r.timeout) flags.push(`--timeout=${r.timeout}`);
  if (r.proxy) flags.push(`--proxy=${shS((r.url.startsWith("https") ? "https:" : "http:") + r.proxy)}`);
  if (r.auth) flags.push(...(r.auth.type === "digest" ? ["--auth-type=digest"] : []), `--auth=${shS(`${r.auth.user}:${r.auth.pass}`)}`);
  if (r.bearer) flags.push("--auth-type=bearer", `--auth=${shS(r.bearer)}`);
  if (r.output) flags.push("--download", `--output=${shS(r.output)}`);
  let raw: string | undefined;
  let flatJson = false;
  if (b.kind === "json" && b.value && typeof b.value === "object" && !Array.isArray(b.value)) {
    flatJson = true;
    for (const [k, v] of Object.entries(b.value as object)) items.push(typeof v === "string" ? shS(`${k}=${v}`) : shS(`${k}:=${JSON.stringify(v)}`));
  } else if (b.kind === "json") raw = b.text;
  else if (b.kind === "form") for (const [k, v] of b.fields) items.push(shS(`${k}=${v}`));
  else if (b.kind === "multipart") for (const p of b.parts) items.push(p.file && !p.fromFile ? shS(`${p.name}@${p.file}${p.type ? `;type=${p.type}` : ""}`) : p.file ? shS(`${p.name}=@${p.file}`) : shS(`${p.name}=${p.value ?? ""}`));
  else if (b.kind === "raw" && !b.file) raw = b.text;
  const dropCt = flatJson && /^application\/json$/i.test(ctOf(r) ?? "") ? ["content-type"] : b.kind === "form" || b.kind === "multipart" ? ["content-type"] : [];
  for (const [k, v] of hdrs(r, dropCt)) items.push(shS(`${k}:${v}`));
  for (const [k, v] of r.query) items.push(shS(`${k}==${v}`));
  const inferred = b.kind === "none" ? "GET" : "POST";
  const method = r.method !== inferred ? r.method + " " : "";
  if (raw !== undefined) flags.push(`--raw=${shS(raw)}`);
  const head = `${b.kind === "raw" && b.file ? `http ${flags.join(" ")}${flags.length ? " " : ""}${method}${shS(r.query.length ? r.base : r.url)} < ${shS(b.file)}` : `http ${flags.join(" ")}${flags.length ? " " : ""}${method}${shS(r.query.length ? r.base : r.url)}`}`;
  const all = [head.replace(/\s+/g, " "), ...items];
  return all.join(" \\\n  ");
}

function genWget(r: Req): string {
  const a: string[] = [];
  const b = r.body;
  if (r.method !== "GET" || b.kind !== "none") a.push(`--method=${r.method}`);
  for (const [k, v] of r.headers) a.push(`--header=${shS(`${k}: ${v}`)}`);
  if (r.bearer) a.push(`--header=${shS(`Authorization: Bearer ${r.bearer}`)}`);
  if (r.auth) a.push(`--user=${shS(r.auth.user)}`, `--password=${shS(r.auth.pass)}`, "--auth-no-challenge");
  if (b.kind === "json") a.push(`--body-data=${shS(b.text)}`);
  else if (b.kind === "form" || (b.kind === "raw" && !b.file)) a.push(`--body-data=${shS(b.text)}`);
  else if (b.kind === "raw" && b.file) a.push(`--body-file=${shS(b.file)}`);
  const notes: string[] = [];
  if (b.kind === "multipart") notes.push("# wget cannot build multipart/form-data bodies; use curl or HTTPie for -F uploads.");
  if (r.insecure) a.push("--no-check-certificate");
  if (r.timeout) a.push(`--timeout=${r.timeout}`);
  if (r.compressed) a.push("--compression=auto");
  if (r.proxy) a.push("-e use_proxy=yes", `-e ${shS(`https_proxy=${r.proxy}`)}`);
  a.push(r.output ? `--output-document=${shS(r.output)}` : "--quiet --output-document=-");
  if (r.head) a.push("--server-response");
  return [...notes, [`wget ${a[0] ?? ""}`.trim(), ...a.slice(1), shS(r.url)].join(" \\\n  ")].join("\n");
}
