/**
 * cURL command builder: form state → curl (bash / PowerShell / cmd quoting),
 * an explanation of every flag, warnings, and the same request as HTTPie,
 * wget, JavaScript fetch and Python requests.
 */

export type KV = { k: string; v: string; on?: boolean };
export type CurlState = {
  method: string;
  url: string;
  params: KV[];
  headers: KV[];
  bodyType: "none" | "json" | "form" | "multipart" | "raw" | "binary";
  body: string;
  form: KV[];
  file: string;
  contentType: string;
  jsonFlag: boolean;
  auth: "none" | "basic" | "bearer" | "digest" | "apikey";
  user: string;
  pass: string;
  token: string;
  keyName: string;
  keyValue: string;
  keyIn: "header" | "query";
  follow: boolean;
  insecure: boolean;
  verbose: boolean;
  include: boolean;
  silent: boolean;
  fail: "none" | "fail" | "body";
  compressed: boolean;
  maxTime: string;
  connectTimeout: string;
  retry: string;
  proxy: string;
  output: "none" | "o" | "O";
  outFile: string;
  cookie: string;
  cookieJar: string;
  http: "default" | "1.1" | "2" | "3";
  userAgent: string;
};

export const CURL_DEFAULT: CurlState = {
  method: "GET",
  url: "https://api.example.com/v1/users",
  params: [],
  headers: [{ k: "Accept", v: "application/json", on: true }],
  bodyType: "none",
  body: "",
  form: [],
  file: "",
  contentType: "text/plain",
  jsonFlag: false,
  auth: "none",
  user: "",
  pass: "",
  token: "",
  keyName: "X-API-Key",
  keyValue: "",
  keyIn: "header",
  follow: true,
  insecure: false,
  verbose: false,
  include: false,
  silent: false,
  fail: "none",
  compressed: false,
  maxTime: "",
  connectTimeout: "",
  retry: "",
  proxy: "",
  output: "none",
  outFile: "",
  cookie: "",
  cookieJar: "",
  http: "default",
  userAgent: "",
};

export type Shell = "bash" | "powershell" | "cmd";
export type Explain = [flag: string, value: string, meaning: string];
export type Warn = { level: "warning" | "info" | "error"; message: string };

function q(s: string, sh: Shell): string {
  if (sh === "cmd") return `"${s.replace(/"/g, '\\"').replace(/%/g, "%%")}"`;
  if (sh === "powershell") return /^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, "''")}'`;
  return /^[\w@%+=:,./-]+$/.test(s) ? s : !s.includes("'") ? `'${s}'` : !/["$`\\!]/.test(s) ? `"${s}"` : `'${s.replace(/'/g, `'\\''`)}'`;
}

export function fullUrl(s: CurlState): string {
  let url = s.url.trim() || "https://example.com";
  const params = s.params.filter((p) => p.on !== false && p.k);
  if (s.auth === "apikey" && s.keyIn === "query" && s.keyName) params.push({ k: s.keyName, v: s.keyValue });
  if (params.length) {
    const qs = params.map((p) => `${encodeURIComponent(p.k)}=${encodeURIComponent(p.v)}`).join("&");
    url += (url.includes("?") ? "&" : "?") + qs;
  }
  return url;
}

function headersOf(s: CurlState): KV[] {
  const h = s.headers.filter((x) => x.on !== false && x.k.trim());
  if (s.auth === "bearer") h.push({ k: "Authorization", v: `Bearer ${s.token || "<token>"}` });
  if (s.auth === "apikey" && s.keyIn === "header" && s.keyName) h.push({ k: s.keyName, v: s.keyValue || "<key>" });
  return h;
}

const hasHeader = (s: CurlState, name: string) => s.headers.some((h) => h.on !== false && h.k.trim().toLowerCase() === name.toLowerCase());

export type Built = { command: string; explain: Explain[]; warnings: Warn[] };

export function buildCurl(s: CurlState, o: { multiline: boolean; shell: Shell; long: boolean }): Built {
  const sh = o.shell;
  const parts: string[][] = []; // each: tokens of one logical flag group
  const explain: Explain[] = [];
  const warnings: Warn[] = [];
  const L = o.long;
  const add = (flag: string, val: string | null, meaning: string, shortFlag?: string) => {
    const f = !L && shortFlag ? shortFlag : flag;
    parts.push(val === null ? [f] : [f, q(val, sh)]);
    explain.push([f, val ?? "", meaning]);
  };
  const method = s.method.toUpperCase();
  const hasBody = s.bodyType !== "none";
  const url = fullUrl(s);

  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s.url.trim())) warnings.push({ level: "info", message: "No scheme in the URL — curl will assume http://." });
  if (/\s/.test(s.url.trim())) warnings.push({ level: "error", message: "The URL contains spaces — percent-encode them (%20) or use the query parameter table." });

  // method
  const implied = hasBody ? (s.bodyType === "json" && s.jsonFlag ? "POST" : "POST") : "GET";
  if (method === "HEAD") add("--head", null, "Send a HEAD request: fetch the headers only", "-I");
  else if (method !== implied) add("--request", method, `Use the ${method} method`, "-X");
  if (method === "GET" && hasBody) warnings.push({ level: "warning", message: "A GET request with a body — many servers and proxies ignore or reject it. Use POST/PUT/PATCH, or move the data into query parameters." });
  if (method === "HEAD" && hasBody) warnings.push({ level: "warning", message: "HEAD requests cannot carry a body." });

  // headers
  for (const h of headersOf(s)) {
    if (s.bodyType === "json" && s.jsonFlag && /^(content-type|accept)$/i.test(h.k) && /json/i.test(h.v)) continue; // --json sets both
    add("--header", `${h.k.trim()}: ${h.v}`, `Request header ${h.k.trim()}`, "-H");
  }

  // body
  switch (s.bodyType) {
    case "json": {
      let body = s.body.trim() || "{}";
      try {
        body = JSON.stringify(JSON.parse(body));
      } catch (e) {
        warnings.push({ level: "error", message: `The JSON body does not parse: ${(e as Error).message}` });
      }
      if (s.jsonFlag) {
        add("--json", body, "Send JSON: sets Content-Type and Accept to application/json and POSTs the data (curl 7.82+)");
      } else {
        if (!hasHeader(s, "content-type")) add("--header", "Content-Type: application/json", "Tell the server the body is JSON", "-H");
        add("--data", body, "Request body (implies POST unless -X says otherwise)", "-d");
      }
      break;
    }
    case "form":
      for (const f of s.form.filter((x) => x.on !== false && x.k)) add("--data-urlencode", `${f.k}=${f.v}`, `Form field ${f.k}, URL-encoded (application/x-www-form-urlencoded)`);
      if (!s.form.some((x) => x.on !== false && x.k)) warnings.push({ level: "info", message: "Form body selected but no fields added." });
      break;
    case "multipart":
      for (const f of s.form.filter((x) => x.on !== false && x.k)) {
        const isFile = f.v.startsWith("@");
        add("--form", `${f.k}=${f.v}`, isFile ? `Upload the file ${f.v.slice(1).split(";")[0]} as part “${f.k}” (multipart/form-data)` : `Multipart text field “${f.k}”`, "-F");
      }
      if (!s.form.some((x) => x.on !== false && x.k)) warnings.push({ level: "info", message: "Multipart body selected but no parts added. Prefix a value with @ to upload a file, e.g. avatar=@photo.jpg;type=image/jpeg." });
      if (hasHeader(s, "content-type")) warnings.push({ level: "warning", message: "Do not set Content-Type yourself with -F: curl must add the multipart boundary to it." });
      break;
    case "raw":
      if (!hasHeader(s, "content-type")) add("--header", `Content-Type: ${s.contentType || "text/plain"}`, "Content type of the raw body", "-H");
      add("--data-raw", s.body, "Send the body exactly as written (no @file interpretation)");
      break;
    case "binary":
      if (!hasHeader(s, "content-type")) add("--header", `Content-Type: ${s.contentType || "application/octet-stream"}`, "Content type of the uploaded file", "-H");
      add("--data-binary", `@${s.file || "payload.bin"}`, "Send the file's bytes unchanged (newlines preserved)");
      break;
  }

  // auth
  if (s.auth === "basic" || s.auth === "digest") {
    if (s.auth === "digest") add("--digest", null, "Use HTTP Digest authentication");
    if (s.pass) {
      add("--user", `${s.user}:${s.pass}`, `${s.auth === "digest" ? "Digest" : "Basic"} auth credentials`, "-u");
      warnings.push({ level: "warning", message: "The password is on the command line — it lands in shell history and is visible in `ps`. Use -u user alone (curl prompts) or a ~/.netrc file with --netrc." });
    } else add("--user", s.user || "user", "User name — curl prompts for the password", "-u");
    if (/^http:/i.test(url) && s.auth === "basic") warnings.push({ level: "warning", message: "Basic auth over plain http:// sends the password readable by anyone on the network." });
  }
  if (s.auth === "bearer" && /^http:/i.test(url)) warnings.push({ level: "warning", message: "Bearer token over plain http:// can be intercepted." });
  if (s.auth === "bearer" && s.token && s.token.length > 12) warnings.push({ level: "info", message: "Tip: keep tokens out of history with -H @headers.txt or an environment variable: -H \"Authorization: Bearer $TOKEN\"." });

  // behaviour
  if (s.follow) add("--location", null, "Follow redirects (3xx Location headers)", "-L");
  if (s.compressed) add("--compressed", null, "Ask for gzip/deflate/br and decompress the response");
  if (s.http === "1.1") add("--http1.1", null, "Force HTTP/1.1");
  if (s.http === "2") add("--http2", null, "Use HTTP/2 (falls back to 1.1 if the server can't)");
  if (s.http === "3") {
    add("--http3", null, "Use HTTP/3 over QUIC");
    warnings.push({ level: "info", message: "--http3 needs a curl built with HTTP/3 support (check `curl -V` for HTTP3)." });
  }
  if (s.userAgent) add("--user-agent", s.userAgent, "Custom User-Agent header", "-A");
  if (s.cookie) add("--cookie", s.cookie, s.cookie.includes("=") ? "Send these cookies" : "Read cookies from this file", "-b");
  if (s.cookieJar) add("--cookie-jar", s.cookieJar, "Save cookies the server sets to this file", "-c");
  if (s.proxy) add("--proxy", s.proxy, "Send the request through this proxy", "-x");
  if (s.connectTimeout) add("--connect-timeout", s.connectTimeout, "Give up connecting after this many seconds");
  if (s.maxTime) add("--max-time", s.maxTime, "Abort the whole transfer after this many seconds", "-m");
  if (s.retry) {
    add("--retry", s.retry, "Retry transient failures (timeouts, 408, 429, 5xx) this many times");
    if (method !== "GET" && method !== "HEAD") warnings.push({ level: "info", message: "--retry repeats non-GET requests too; make sure the endpoint is idempotent." });
  }
  if (s.insecure) {
    add("--insecure", null, "Skip TLS certificate verification", "-k");
    warnings.push({ level: "warning", message: "-k disables certificate checks — anyone in the middle can read and change the traffic. Use --cacert with your CA instead." });
  }
  if (s.fail === "fail") add("--fail", null, "Exit with code 22 on HTTP 4xx/5xx instead of printing the error page", "-f");
  if (s.fail === "body") add("--fail-with-body", null, "Exit non-zero on HTTP errors but still print the body (curl 7.76+)");
  if (s.include) add("--include", null, "Print the response headers before the body", "-i");
  if (s.verbose) add("--verbose", null, "Show the full request/response conversation (on stderr)", "-v");
  if (s.silent) {
    if (L) {
      add("--silent", null, "No progress meter");
      add("--show-error", null, "…but still print errors");
    } else {
      parts.push(["-sS"]);
      explain.push(["-sS", "", "Silent (no progress meter) but still show errors"]);
    }
    if (s.verbose) warnings.push({ level: "info", message: "-v with -s: verbose output still appears; only the progress meter is hidden." });
  }
  if (s.output === "o") add("--output", s.outFile || "response.json", "Write the body to this file", "-o");
  if (s.output === "O") add("--remote-name", null, "Save to a file named like the URL's last path segment", "-O");
  if (s.output === "O" && /\/$/.test(new URL(/^[a-z]+:\/\//i.test(url) ? url : "http://" + url, "http://x").pathname)) warnings.push({ level: "warning", message: "-O needs a file name at the end of the URL path." });

  const bin = sh === "powershell" ? "curl.exe" : "curl";
  if (sh === "powershell") warnings.push({ level: "info", message: "In Windows PowerShell 5, `curl` is an alias for Invoke-WebRequest — `curl.exe` runs the real curl." });
  const urlTok = q(url, sh);
  let command: string;
  if (o.multiline && parts.length) {
    const cont = sh === "powershell" ? " `" : sh === "cmd" ? " ^" : " \\";
    command = [`${bin} ${urlTok}`, ...parts.map((p) => "  " + p.join(" "))].join(cont + "\n");
  } else command = [bin, urlTok, ...parts.map((p) => p.join(" "))].join(" ");
  explain.unshift(["URL", url, "Where to send the request" + (s.params.some((p) => p.on !== false && p.k) ? " — query parameters are URL-encoded" : "")]);
  return { command, explain, warnings };
}

/* ── other clients ──────────────────────────────────────────────────── */

const sq = (s: string) => (/^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`);

export function toHttpie(s: CurlState): string {
  const method = s.method.toUpperCase();
  const flags: string[] = [];
  if (s.follow) flags.push("--follow");
  if (s.insecure) flags.push("--verify=no");
  if (s.verbose) flags.push("--verbose");
  else if (s.include) flags.push("--print=hb");
  if (s.maxTime) flags.push(`--timeout=${s.maxTime}`);
  if (s.proxy) flags.push(`--proxy=${/^https/.test(s.proxy) ? "https" : "http"}:${s.proxy}`);
  if (s.output === "o") flags.push(`--output=${s.outFile || "response.json"}`, "--download");
  if (s.output === "O") flags.push("--download");
  if (s.bodyType === "form") flags.push("--form");
  if (s.bodyType === "multipart") flags.push("--multipart");
  if (s.auth === "basic" || s.auth === "digest") flags.push(`--auth=${sq(s.pass ? `${s.user}:${s.pass}` : s.user || "user")}`, ...(s.auth === "digest" ? ["--auth-type=digest"] : []));
  if (s.auth === "bearer") flags.push(`--auth-type=bearer`, `--auth=${sq(s.token || "<token>")}`);
  if (s.http === "2" || s.http === "3") flags.push("# (HTTPie speaks HTTP/1.1 only)");
  const items: string[] = [];
  for (const p of s.params.filter((x) => x.on !== false && x.k)) items.push(sq(`${p.k}==${p.v}`));
  if (s.auth === "apikey" && s.keyName) items.push(sq(s.keyIn === "query" ? `${s.keyName}==${s.keyValue}` : `${s.keyName}:${s.keyValue || "<key>"}`));
  for (const h of s.headers.filter((x) => x.on !== false && x.k)) items.push(sq(`${h.k}:${h.v}`));
  if (s.userAgent) items.push(sq(`User-Agent:${s.userAgent}`));
  if (s.cookie && s.cookie.includes("=")) items.push(sq(`Cookie:${s.cookie}`));
  let stdin = "";
  if (s.bodyType === "json") {
    try {
      const v = JSON.parse(s.body || "{}");
      if (v && typeof v === "object" && !Array.isArray(v) && Object.values(v).every((x) => x === null || typeof x !== "object")) {
        for (const [k, x] of Object.entries(v)) items.push(typeof x === "string" ? sq(`${k}=${x}`) : sq(`${k}:=${JSON.stringify(x)}`));
      } else flags.push(`--raw=${sq(JSON.stringify(v))}`);
    } catch {
      flags.push(`--raw=${sq(s.body)}`);
    }
  }
  if (s.bodyType === "form" || s.bodyType === "multipart") for (const f of s.form.filter((x) => x.on !== false && x.k)) items.push(sq(f.v.startsWith("@") ? `${f.k}@${f.v.slice(1).split(";")[0]}` : `${f.k}=${f.v}`));
  if (s.bodyType === "raw") flags.push(`--raw=${sq(s.body)}`);
  if (s.bodyType === "binary") stdin = ` < ${sq(s.file || "payload.bin")}`;
  const url = s.url.trim() || "https://example.com";
  const m = method === "GET" && s.bodyType === "none" ? "" : method === "POST" && s.bodyType !== "none" ? "" : method + " ";
  return `http ${flags.join(" ")}${flags.length ? " " : ""}${m}${sq(url)}${items.length ? " \\\n  " + items.join(" \\\n  ") : ""}${stdin}`;
}

export function toWget(s: CurlState): string {
  const out: string[] = ["wget"];
  const notes: string[] = [];
  const method = s.method.toUpperCase();
  if (method !== "GET") out.push(`--method=${method}`);
  for (const h of headersOf(s)) out.push(`--header=${sq(`${h.k}: ${h.v}`)}`);
  if (s.bodyType === "json") {
    if (!hasHeader(s, "content-type")) out.push(`--header=${sq("Content-Type: application/json")}`);
    let body = s.body || "{}";
    try { body = JSON.stringify(JSON.parse(body)); } catch { /* as typed */ }
    out.push(`--body-data=${sq(body)}`);
  }
  if (s.bodyType === "form") out.push(`--body-data=${sq(s.form.filter((x) => x.on !== false && x.k).map((f) => `${encodeURIComponent(f.k)}=${encodeURIComponent(f.v)}`).join("&"))}`);
  if (s.bodyType === "raw") out.push(`--header=${sq(`Content-Type: ${s.contentType || "text/plain"}`)}`, `--body-data=${sq(s.body)}`);
  if (s.bodyType === "binary") out.push(`--body-file=${sq(s.file || "payload.bin")}`);
  if (s.bodyType === "multipart") notes.push("# wget cannot build multipart/form-data bodies — use curl -F or HTTPie --multipart.");
  if (s.auth === "basic" || s.auth === "digest") out.push(`--user=${sq(s.user || "user")}`, s.pass ? `--password=${sq(s.pass)}` : "--ask-password");
  if (!s.follow) out.push("--max-redirect=0");
  if (s.insecure) out.push("--no-check-certificate");
  if (s.include || s.verbose) out.push("--server-response");
  if (s.silent) out.push("--quiet");
  if (s.maxTime) out.push(`--timeout=${s.maxTime}`);
  if (s.retry) out.push(`--tries=${Number(s.retry) + 1}`);
  if (s.userAgent) out.push(`--user-agent=${sq(s.userAgent)}`);
  if (s.cookie && s.cookie.includes("=")) out.push(`--header=${sq(`Cookie: ${s.cookie}`)}`);
  else if (s.cookie) out.push(`--load-cookies=${sq(s.cookie)}`);
  if (s.cookieJar) out.push(`--save-cookies=${sq(s.cookieJar)}`, "--keep-session-cookies");
  if (s.compressed) out.push("--compression=auto");
  if (s.proxy) notes.push(`# wget reads the proxy from the environment: export https_proxy=${s.proxy}`);
  out.push(s.output === "o" ? `--output-document=${sq(s.outFile || "response.json")}` : s.output === "O" ? "" : "--output-document=-");
  out.push(sq(fullUrl(s)));
  return [...notes, out.filter(Boolean).join(" \\\n  ")].join("\n");
}

export function toFetch(s: CurlState): string {
  const method = s.method.toUpperCase();
  const h: Record<string, string> = {};
  for (const x of headersOf(s)) h[x.k.trim()] = x.v;
  if (s.auth === "basic") h.Authorization = `Basic \${btoa(${JSON.stringify(`${s.user}:${s.pass}`)})}`;
  if (s.userAgent) h["User-Agent"] = s.userAgent;
  let body = "";
  const pre: string[] = [];
  if (s.bodyType === "json") {
    if (!Object.keys(h).some((k) => k.toLowerCase() === "content-type")) h["Content-Type"] = "application/json";
    let v: unknown = s.body;
    try { v = JSON.parse(s.body || "{}"); } catch { /* keep text */ }
    body = typeof v === "string" ? JSON.stringify(v) : `JSON.stringify(${JSON.stringify(v, null, 2).replace(/\n/g, "\n  ")})`;
  }
  if (s.bodyType === "form") body = `new URLSearchParams(${JSON.stringify(Object.fromEntries(s.form.filter((x) => x.on !== false && x.k).map((f) => [f.k, f.v])))})`;
  if (s.bodyType === "multipart") {
    pre.push("const form = new FormData();");
    for (const f of s.form.filter((x) => x.on !== false && x.k)) pre.push(f.v.startsWith("@") ? `form.append(${JSON.stringify(f.k)}, fileInput.files[0]); // ${f.v.slice(1)}` : `form.append(${JSON.stringify(f.k)}, ${JSON.stringify(f.v)});`);
    body = "form";
  }
  if (s.bodyType === "raw") body = JSON.stringify(s.body);
  if (s.bodyType === "binary") body = `await (await fetch(${JSON.stringify(s.file || "payload.bin")})).blob() /* or a File from <input type=file> */`;
  const hdr = Object.entries(h).map(([k, v]) => `    ${JSON.stringify(k)}: ${v.includes("${") ? "`" + v + "`" : JSON.stringify(v)},`).join("\n");
  const init: string[] = [`  method: ${JSON.stringify(method)},`];
  if (hdr) init.push(`  headers: {\n${hdr}\n  },`);
  if (body) init.push(`  body: ${body},`);
  if (!s.follow) init.push(`  redirect: "manual",`);
  if (s.cookie) init.push(`  credentials: "include", // browsers send cookies; set them with document.cookie or the server`);
  if (s.maxTime) init.push(`  signal: AbortSignal.timeout(${Number(s.maxTime) * 1000}),`);
  const notes: string[] = [];
  if (s.insecure) notes.push("// fetch cannot skip certificate checks; in Node use an undici Agent with connect: { rejectUnauthorized: false }.");
  if (s.proxy) notes.push("// Proxies: browsers use the system proxy; in Node pass an undici ProxyAgent as `dispatcher`.");
  const tail = s.fail !== "none" ? `\nif (!res.ok) throw new Error(\`HTTP \${res.status}: \${await res.text()}\`);` : "";
  return `${[...notes, ...pre].join("\n")}${notes.length || pre.length ? "\n" : ""}const res = await fetch(${JSON.stringify(fullUrl(s))}, {\n${init.join("\n")}\n});${tail}\nconst data = await res.${/json/i.test(Object.values(h).join()) || s.bodyType === "json" ? "json" : "text"}();\nconsole.log(res.status, data);`;
}

export function toPython(s: CurlState): string {
  const method = s.method.toLowerCase();
  const args: string[] = [JSON.stringify(s.url.trim() || "https://example.com")];
  const params = s.params.filter((x) => x.on !== false && x.k);
  if (s.auth === "apikey" && s.keyIn === "query") params.push({ k: s.keyName, v: s.keyValue });
  const py = (v: unknown): string => (v === null ? "None" : v === true ? "True" : v === false ? "False" : Array.isArray(v) ? `[${v.map(py).join(", ")}]` : typeof v === "object" ? `{${Object.entries(v as object).map(([k, x]) => `${JSON.stringify(k)}: ${py(x)}`).join(", ")}}` : JSON.stringify(v));
  if (params.length) args.push(`params=${py(Object.fromEntries(params.map((p) => [p.k, p.v])))}`);
  const h = Object.fromEntries(headersOf(s).map((x) => [x.k.trim(), x.v]));
  if (s.userAgent) h["User-Agent"] = s.userAgent;
  if (Object.keys(h).length) args.push(`headers=${py(h)}`);
  if (s.bodyType === "json") {
    try { args.push(`json=${py(JSON.parse(s.body || "{}"))}`); } catch { args.push(`data=${JSON.stringify(s.body)}`); }
  }
  if (s.bodyType === "form") args.push(`data=${py(Object.fromEntries(s.form.filter((x) => x.on !== false && x.k).map((f) => [f.k, f.v])))}`);
  if (s.bodyType === "multipart") {
    const files = s.form.filter((x) => x.on !== false && x.k && x.v.startsWith("@"));
    const data = s.form.filter((x) => x.on !== false && x.k && !x.v.startsWith("@"));
    if (data.length) args.push(`data=${py(Object.fromEntries(data.map((f) => [f.k, f.v])))}`);
    if (files.length) args.push(`files={${files.map((f) => `${JSON.stringify(f.k)}: open(${JSON.stringify(f.v.slice(1).split(";")[0])}, "rb")`).join(", ")}}`);
  }
  if (s.bodyType === "raw") args.push(`data=${JSON.stringify(s.body)}`);
  if (s.bodyType === "binary") args.push(`data=open(${JSON.stringify(s.file || "payload.bin")}, "rb")`);
  if (s.auth === "basic") args.push(`auth=(${JSON.stringify(s.user)}, ${JSON.stringify(s.pass)})`);
  if (s.auth === "digest") args.push(`auth=HTTPDigestAuth(${JSON.stringify(s.user)}, ${JSON.stringify(s.pass)})`);
  if (!s.follow) args.push("allow_redirects=False");
  if (s.insecure) args.push("verify=False");
  if (s.maxTime || s.connectTimeout) args.push(`timeout=${s.connectTimeout && s.maxTime ? `(${s.connectTimeout}, ${s.maxTime})` : s.maxTime || s.connectTimeout}`);
  if (s.proxy) args.push(`proxies={"https": ${JSON.stringify(s.proxy)}, "http": ${JSON.stringify(s.proxy)}}`);
  if (s.cookie && s.cookie.includes("=")) args.push(`cookies=${py(Object.fromEntries(s.cookie.split(/;\s*/).map((c) => c.split("=")).map(([k, ...v]) => [k, v.join("=")])))}`);
  const imp = s.auth === "digest" ? "import requests\nfrom requests.auth import HTTPDigestAuth" : "import requests";
  return `${imp}\n\nres = requests.${["get", "post", "put", "patch", "delete", "head", "options"].includes(method) ? method : `request(${JSON.stringify(method.toUpperCase())}, `}${["get", "post", "put", "patch", "delete", "head", "options"].includes(method) ? "(" : ""}\n    ${args.join(",\n    ")},\n)\n${s.fail !== "none" ? "res.raise_for_status()\n" : ""}print(res.status_code)\nprint(res.${s.bodyType === "json" || /json/i.test(JSON.stringify(h)) ? "json()" : "text"})`;
}
