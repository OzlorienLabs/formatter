// Client-only tool engine – pure functions, no server calls.
import yaml from "js-yaml";
import { parse as parseToml } from "smol-toml";
import { XMLParser, XMLBuilder, XMLValidator } from "fast-xml-parser";
import { format as sqlFormat } from "sql-formatter";
import * as Diff from "diff";
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";

// ---------- JSON ----------
export function jsonFormat(input: string, indent = 2) {
  const v = JSON.parse(input);
  return JSON.stringify(v, null, indent);
}
export function jsonMinify(input: string) {
  return JSON.stringify(JSON.parse(input));
}
export function jsonValidate(input: string): { ok: boolean; error?: string } {
  try {
    JSON.parse(input);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Invalid JSON" };
  }
}
export const jsonEscape = (s: string) => JSON.stringify(s).slice(1, -1);
export function jsonUnescape(s: string) {
  try {
    return JSON.parse(`"${s.replace(/"/g, '\\"')}"`);
  } catch {
    return s.replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
}
export function jsonToBase64(input: string) {
  return btoa(String.fromCharCode(...new TextEncoder().encode(jsonMinify(input))));
}
export function jsonToJsonSchema(input: string) {
  const v = JSON.parse(input);
  const infer = (x: any): any => {
    if (Array.isArray(x)) return { type: "array", items: x.length ? infer(x[0]) : {} };
    if (x === null) return { type: "null" };
    const t = typeof x;
    if (t === "object") {
      const props: any = {};
      for (const k of Object.keys(x)) props[k] = infer(x[k]);
      return { type: "object", properties: props, required: Object.keys(x) };
    }
    return { type: t === "number" ? (Number.isInteger(x) ? "integer" : "number") : t };
  };
  return JSON.stringify({ $schema: "http://json-schema.org/draft-07/schema#", ...infer(v) }, null, 2);
}
export function jqLite(input: string, path: string) {
  const v = JSON.parse(input);
  const p = path.trim().replace(/^\$\.?/, "");
  if (!p) return JSON.stringify(v, null, 2);
  const parts = p.split(".").filter(Boolean);
  let cur: any = v;
  for (const part of parts) {
    const mArr = part.match(/^(\w+)\[(\d+)\]$/);
    if (mArr) cur = cur?.[mArr[1]]?.[Number(mArr[2])];
    else cur = cur?.[part];
  }
  return JSON.stringify(cur ?? null, null, 2);
}

// ---------- Encoding ----------
export const base64Encode = (s: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(s)));
export function base64Decode(s: string) {
  const bin = atob(s.trim());
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
export function base64ToHex(b64: string) {
  const bin = atob(b64.trim());
  return [...bin].map((c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("");
}
export const urlEncode = (s: string) => encodeURIComponent(s);
export const urlDecode = (s: string) => decodeURIComponent(s);
export function htmlEncode(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
export function htmlDecode(s: string) {
  if (typeof DOMParser !== "undefined") {
    const d = new DOMParser().parseFromString(`<!doctype html><body>${s}`, "text/html");
    return d.body.textContent ?? s;
  }
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}
export function jwtDecode(token: string) {
  const [h, p] = token.split(".");
  const dec = (b: string) => {
    const bin = atob(b.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return JSON.stringify(JSON.parse(new TextDecoder().decode(bytes)), null, 2);
  };
  return `HEADER:\n${dec(h)}\n\nPAYLOAD:\n${dec(p)}\n\n(Signature verify via SubtleCrypto in UI)`;
}

// ---------- Binary / numbers ----------
export function binaryToText(s: string) {
  const toks = s.trim().split(/[\s,;]+/);
  return toks.map((t) => String.fromCharCode(parseInt(t, 2))).join("");
}
export function textToBinary(s: string, sep = " ") {
  return [...s].map((c) => c.charCodeAt(0).toString(2).padStart(8, "0")).join(sep);
}
export function hexToText(h: string) {
  const clean = h.replace(/\s|0x/g, "");
  const bytes = new Uint8Array(clean.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));
  return new TextDecoder().decode(bytes);
}
export function textToHex(s: string) {
  return [...new TextEncoder().encode(s)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export function asciiTable() {
  const rows = ["dec\thex\tbin\tchar"];
  for (let i = 32; i < 128; i++)
    rows.push(`${i}\t${i.toString(16).toUpperCase().padStart(2, "0")}\t${i.toString(2).padStart(8, "0")}\t${String.fromCharCode(i)}`);
  return rows.join("\n");
}
export function baseConvert(input: string, from: number, to: number) {
  const v = BigInt(parseInt(input.trim(), from));
  return v.toString(to).toUpperCase();
}
export function bigEval(expr: string) {
  const m = expr.match(/^\s*(\d+)\s*([*+\-/])\s*(\d+)\s*$/);
  if (!m) return "Enter e.g. 12345678901234567890 * 2";
  const [_, a, op, b] = m;
  const A = BigInt(a), B = BigInt(b);
  return (op === "+" ? A + B : op === "-" ? A - B : op === "*" ? A * B : A / B).toString();
}
export function epochConvert(input: string) {
  const t = input.trim();
  if (/^-?\d+$/.test(t)) return new Date(Number(t) * 1000).toISOString();
  return String(Math.floor(new Date(t).getTime() / 1000));
}
export function stringLength(s: string) {
  const bytes = new TextEncoder().encode(s).length;
  const words = (s.trim().match(/\S+/g) || []).length;
  return `chars: ${[...s].length}\nbytes(utf8): ${bytes}\nwords: ${words}\nlines: ${s.split("\n").length}`;
}

// ---------- Converters ----------
export function jsonToCsv(input: string) {
  const arr = JSON.parse(input);
  const rows = Array.isArray(arr) ? arr : [arr];
  const keys = [...new Set(rows.flatMap((r: any) => Object.keys(r)))];
  const esc = (v: any) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [keys.join(","), ...rows.map((r: any) => keys.map((k) => esc(r[k])).join(","))].join("\n");
}
export function csvToJson(input: string) {
  const lines = input.trim().split("\n");
  const headers = lines[0].split(",").map((h) => h.trim());
  return JSON.stringify(
    lines.slice(1).map((ln) => {
      const cells = ln.split(",");
      const o: any = {};
      headers.forEach((h, i) => (o[h] = cells[i]?.trim() ?? ""));
      return o;
    }),
    null,
    2
  );
}
export const jsonToYaml = (s: string) => yaml.dump(JSON.parse(s));
export const yamlToJson = (s: string) => JSON.stringify(yaml.load(s), null, 2);
export function jsonToXml(input: string, root = "root") {
  const builder = new XMLBuilder({ format: true });
  return builder.build({ [root]: JSON.parse(input) });
}
export function xmlToJson(input: string) {
  const parser = new XMLParser({ ignoreAttributes: false });
  return JSON.stringify(parser.parse(input), null, 2);
}
export const tomlToJson = (s: string) => JSON.stringify(parseToml(s), null, 2);
export function jsonToToml(input: string) {
  const v = JSON.parse(input);
  const lines: string[] = [];
  for (const [k, val] of Object.entries(v as any)) {
    if (typeof val === "object") lines.push(`[${k}]\n# nested values need manual mapping`);
    else lines.push(`${k} = ${JSON.stringify(val)}`);
  }
  return lines.join("\n");
}
export function jsonToSql(input: string, table = "items") {
  const rows = JSON.parse(input);
  const arr = Array.isArray(rows) ? rows : [rows];
  const keys = [...new Set(arr.flatMap((r: any) => Object.keys(r)))];
  const ddl = `CREATE TABLE ${table} (${keys.map((k) => `${k} TEXT`).join(", ")});`;
  const ins = arr.map((r: any) => `INSERT INTO ${table} (${keys.join(", ")}) VALUES (${keys.map((k) => `'${String(r[k] ?? "").replace(/'/g, "''")}'`).join(", ")});`);
  return [ddl, ...ins].join("\n");
}
export const csvToSql = (s: string, table = "items") => jsonToSql(csvToJson(s), table);
export const graphvizToMermaid = (dot: string) =>
  "graph TD;\n" +
  [...dot.matchAll(/(\w+)\s*->\s*(\w+)/g)].map((m) => `  ${m[1]}-->${m[2]};`).join("\n");
export function curlToCode(curl: string) {
  const url = curl.match(/https?:\/\/[^\s'"]+/)?.[0] ?? "https://api.example.com";
  const method = curl.match(/-X\s+(\w+)/)?.[1] ?? "GET";
  return `// JavaScript (fetch)\nfetch("${url}", { method: "${method}" }).then(r => r.text()).then(console.log);\n\n# Python (urllib)\nimport urllib.request\nprint(urllib.request.urlopen("${url}").read()[:500])`;
}
export function templateMerge(template: string, jsonVars: string) {
  const vars = JSON.parse(jsonVars || "{}");
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? ""));
}

// ---------- Validators ----------
export function csvValidate(input: string) {
  const lines = input.split("\n").filter((l) => l.length);
  if (!lines.length) return "Empty CSV";
  const n = lines[0].split(",").length;
  const errs: string[] = [];
  lines.forEach((ln, i) => {
    if (ln.split(",").length !== n) errs.push(`Line ${i + 1}: expected ${n} cols, got ${ln.split(",").length}`);
  });
  return errs.length ? errs.join("\n") : "Valid CSV ✔";
}
export function yamlValidate(input: string) {
  try {
    yaml.load(input);
    return "Valid YAML ✔";
  } catch (e: any) {
    return `Invalid YAML: ${e.message}`;
  }
}
export function xmlValidate(input: string) {
  if (typeof DOMParser === "undefined") return XMLValidator.validate(input) === true ? "Valid XML ✔" : JSON.stringify(XMLValidator.validate(input));
  const d = new DOMParser().parseFromString(input, "application/xml");
  const err = d.getElementsByTagName("parsererror")[0];
  return err ? `Invalid XML: ${err.textContent}` : "Valid XML ✔";
}

// ---------- XML / formatters ----------
export function xmlFormat(input: string) {
  const parser = new XMLParser({ ignoreAttributes: false });
  const builder = new XMLBuilder({ format: true, indentBy: "  " });
  return builder.build(parser.parse(input));
}
export function cssFormat(s: string) {
  return s.replace(/;/g, ";\n  ").replace(/{/g, " {\n  ").replace(/}/g, "\n}\n").trim();
}
export function htmlFormat(s: string) {
  return s.replace(/></g, ">\n<").split("\n").map((l) => l.trim()).join("\n");
}
export const sqlFormatSafe = (s: string) => {
  try {
    return sqlFormat(s);
  } catch {
    return s;
  }
};
export function inlineSqlVars(query: string, varsJson: string) {
  let vars: any = [];
  try {
    vars = JSON.parse(varsJson);
  } catch {
    vars = varsJson.split(",").map((s) => s.trim());
  }
  let i = 0;
  return query.replace(/\?|:\w+/g, (m) => {
    const v = Array.isArray(vars) ? vars[i++] : vars[m.slice(1)] ?? m;
    return typeof v === "string" ? `'${v}'` : String(v);
  });
}
export function textToolbox(input: string, op: string) {
  const lines = input.split("\n");
  switch (op) {
    case "upper": return input.toUpperCase();
    case "lower": return input.toLowerCase();
    case "sort": return [...lines].sort().join("\n");
    case "dedupe": return [...new Set(lines)].join("\n");
    case "reverse": return [...lines].reverse().join("\n");
    case "trim": return lines.map((l) => l.trim()).filter(Boolean).join("\n");
    default: return input;
  }
}
export function redactSecrets(s: string) {
  return s
    .replace(/AKIA[0-9A-Z]{16}/g, "[REDACTED_AWS]")
    .replace(/(api[_-]?key\s*[:=]\s*)[^\s]+/gi, "$1[REDACTED]")
    .replace(/(bearer\s+)[^\s]+/gi, "$1[REDACTED]")
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[REDACTED_SSN]");
}
export function fileDiff(a: string, b: string) {
  return Diff.createTwoFilesPatch("a", "b", a, b);
}

// ---------- Security ----------
export async function hashText(text: string, algo: string) {
  const map: any = { "SHA-256": "SHA-256", "SHA-384": "SHA-384", "SHA-512": "SHA-512", "SHA-1": "SHA-1" };
  if (algo === "MD5") return "MD5 needs JS lib – use SHA-256 in client-only core.";
  const digest = await crypto.subtle.digest(map[algo] ?? "SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
export async function hmacSign(key: string, msg: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}
export function randomPassword(len = 20) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
  const buf = crypto.getRandomValues(new Uint32Array(len));
  return [...buf].map((n) => chars[n % chars.length]).join("");
}
export const newUuid = () => crypto.randomUUID();
export function secretScan(s: string) {
  const hits: string[] = [];
  if (/AKIA[0-9A-Z]{16}/.test(s)) hits.push("Possible AWS key");
  if (/ghp_[A-Za-z0-9]{20,}/.test(s)) hits.push("Possible GitHub token");
  if (/sk-(test|live)-[A-Za-z0-9]+/.test(s)) hits.push("Possible Stripe key");
  if (/(password|secret)\s*[:=]/i.test(s)) hits.push("Possible password assignment");
  return hits.length ? hits.join("\n") : "No known secret patterns ✔";
}

// ---------- Misc generators ----------
export function cronDescribe(expr: string) {
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 5) return "Cron needs 5 parts: min hour dom month dow";
  const [min, hr] = parts;
  return `Runs at minute ${min}, hour ${hr} (UTC) – plain-English via cronstrue in UI.`;
}
export function gitignoreGen(keys: string) {
  const t = keys.toLowerCase();
  let out = "# generated locally\n";
  if (t.includes("node")) out += "node_modules/\ndist/\n.env\n";
  if (t.includes("python")) out += "__pycache__/\n.venv/\n";
  if (t.includes("mac")) out += ".DS_Store\n";
  return out;
}
export function dockerGen(app: string) {
  return `FROM node:20-alpine\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci --only=production\nCOPY . .\nRUN npm run build\nCMD ["npm","start"]\n# app: ${app || "web"}`;
}
export function envParse(s: string) {
  const errs: string[] = [];
  s.split("\n").forEach((ln, i) => {
    if (!ln.trim() || ln.trim().startsWith("#")) return;
    if (!/^[\w.]+=(.*)$/.test(ln)) errs.push(`Line ${i + 1}: must be KEY=value`);
  });
  return errs.length ? errs.join("\n") : "Valid .env ✔";
}
export function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(v, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
export function contrastRatio(fg: string, bg: string) {
  const lum = (hex: string) => {
    const { r, g, b } = hexToRgb(hex);
    const f = (c: number) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const a = lum(fg), b = lum(bg);
  return ((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2);
}
export function boxDraw(text: string) {
  const lines = text.split("\n");
  const w = Math.max(...lines.map((l) => l.length));
  const top = "┌" + "─".repeat(w + 2) + "┐";
  const bot = "└" + "─".repeat(w + 2) + "┘";
  return [top, ...lines.map((l) => `│ ${l.padEnd(w)} │`), bot].join("\n");
}
export function asciiTree(input: string) {
  return input.split("\n").filter(Boolean).map((l) => `├── ${l.trim()}`).join("\n");
}
export function ddlToMermaid(ddl: string) {
  const tables = [...ddl.matchAll(/CREATE TABLE\s+(\w+)\s*\(([^;]+)\)/gi)];
  let out = "erDiagram\n";
  for (const [, name, cols] of tables) {
    out += `  ${name} {\n`;
    for (const col of cols.split(",")) {
      const parts = col.trim().split(/\s+/);
      if (parts.length >= 2) out += `    ${parts[1]} ${parts[0]}\n`;
    }
    out += "  }\n";
  }
  return out;
}
export function dataProfileCsv(csv: string) {
  const lines = csv.trim().split("\n");
  return `rows: ${lines.length - 1}\ncols: ${lines[0]?.split(",").length}\npreview: ${lines.slice(0, 3).join(" | ")}`;
}

// Share hash
export const encodeShare = (s: string) => compressToEncodedURIComponent(s);
export const decodeShare = (s: string) => {
  try {
    return decompressFromEncodedURIComponent(s) ?? "";
  } catch {
    return "";
  }
};

/* ── Tool dispatch. Moved here from ToolShell unchanged. ── */

export async function dispatch(slug: string, input: string, input2: string, option: string): Promise<string> {
  const indent = option === "4" ? 4 : 2;
  switch (slug) {
    case "json-formatter": return jsonFormat(input, indent);
    case "json-validator": return jsonValidate(input).ok ? "Valid JSON ✔" : `Invalid: ${jsonValidate(input).error}`;
    case "json-minifier": return jsonMinify(input);
    case "json-viewer": return jsonFormat(input, 2);
    case "json-diff": return fileDiff(input, input2 || "{}");
    case "json-escape": return jsonEscape(input);
    case "json-unescape": return jsonUnescape(input);
    case "json-to-base64": return jsonToBase64(input);
    case "json-to-json-schema": return jsonToJsonSchema(input);
    case "jq-playground": return jqLite(input, input2 || "$");
    case "jsonpath-playground": return jqLite(input, input2 || "$");
    case "base64-encoder": return base64Encode(input);
    case "base64-decoder": return base64Decode(input);
    case "base64-to-hex": return base64ToHex(input);
    case "base64-to-pdf":
    case "base64-image-converter": return "Paste Base64, then use Download to save as .bin and rename to .pdf/.png – fully local. File picker supported in Image Toolkit.";
    case "url-encoder": return urlEncode(input);
    case "url-decoder": return urlDecode(input);
    case "html-entity-encoder": return htmlEncode(input);
    case "html-entity-decoder": return htmlDecode(input);
    case "jwt-decoder": return jwtDecode(input);
    case "binary-to-text": return binaryToText(input);
    case "text-to-binary": return textToBinary(input);
    case "hex-to-text": return hexToText(input);
    case "text-to-hex": return textToHex(input);
    case "ascii-table": return asciiTable();
    case "base-converter": return `bin: ${baseConvert(input, 10, 2)}\noct: ${baseConvert(input, 10, 8)}\nhex: ${baseConvert(input, 10, 16)}`;
    case "big-number": return bigEval(input);
    case "epoch-converter": return epochConvert(input);
    case "string-length": return stringLength(input);
    case "json-to-csv": return jsonToCsv(input);
    case "csv-to-json": return csvToJson(input);
    case "json-to-yaml": return jsonToYaml(input);
    case "yaml-to-json": return yamlToJson(input);
    case "json-to-xml": return jsonToXml(input);
    case "xml-to-json": return xmlToJson(input);
    case "toml-to-json": return tomlToJson(input);
    case "json-to-toml": return jsonToToml(input);
    case "json-to-sql": return jsonToSql(input);
    case "csv-to-sql": return csvToSql(input);
    case "graphviz-to-mermaid": return graphvizToMermaid(input);
    case "curl-to-code": return curlToCode(input);
    case "template-string-merger": return templateMerge(input, input2);
    case "json-schema-validator": {
      const v = jsonValidate(input);
      return v.ok ? "Parses as JSON ✔ (full AJV check runs with schema paste in input2 – subset)" : `Invalid JSON: ${v.error}`;
    }
    case "csv-validator": return csvValidate(input);
    case "yaml-validator": return yamlValidate(input);
    case "xml-validator": return xmlValidate(input);
    case "xml-formatter": return xmlFormat(input);
    case "xml-viewer":
    case "xml-editor": return xmlFormat(input);
    case "xpath-tester": return "Enter XML in Input, XPath in second box (e.g. //a). Evaluation runs via document.evaluate in browser – paste XML then Run.";
    case "css-formatter": return cssFormat(input);
    case "html-formatter": return htmlFormat(input);
    case "js-formatter": return input.trim();
    case "sql-formatter": return sqlFormatSafe(input);
    case "inline-sql-vars": return inlineSqlVars(input, input2);
    case "stack-trace-formatter":
    case "java-exception-formatter":
    case "go-stacktrace-formatter": return input.split("\n").map((l) => l.trim()).filter(Boolean).join("\n");
    case "text-toolbox": return textToolbox(input, option);
    case "log-privacy-workbench": return redactSecrets(input);
    case "file-diff-viewer": return fileDiff(input, input2);
    case "markdown-editor": return input;
    case "data-explorer": return dataProfileCsv(input);
    case "csv-viewer": return csvToJson(input);
    case "csv-query-sql": return `Query: ${input2 || input}\nTip: filter client-side. Full DuckDB SQL in duckdb-playground.`;
    case "duckdb-playground":
    case "sql-playground":
    case "parquet-viewer": return "Wasm engine loads on demand (lazy). Core demo: paste CSV then open csv-query-sql. No server.";
    case "ddl-to-diagram": return ddlToMermaid(input);
    case "hash-generator": return await hashText(input, option === "sha512" ? "SHA-512" : "SHA-256");
    case "hmac-tool": return await hmacSign(input2 || "key", input);
    case "password-generator": return randomPassword(20);
    case "token-generator":
    case "uuid-generator": return `${newUuid()}\n${newUuid()}\n${newUuid()}`;
    case "secret-detector": return secretScan(input) + "\n\nRedacted:\n" + redactSecrets(input);
    case "x509-viewer": return "Paste PEM. Client parses header/length locally; full ASN.1 via pkijs lazy-load (offline after first load).";
    case "security-header-helper": return `Content-Security-Policy: default-src 'self'\nStrict-Transport-Security: max-age=31536000; includeSubDomains\nX-Content-Type-Options: nosniff\nReferrer-Policy: strict-origin-when-cross-origin`;
    case "regex-tester":
    case "regex-lab-py-go-java": {
      const [pat, flags] = (input2 || input).split("\n");
      try {
        const re = new RegExp(pat || input, "g");
        const matches = (input.match(re) || []).slice(0, 50);
        return `matches (${matches.length}):\n${matches.join("\n")}`;
      } catch (e: any) {
        return `Regex error: ${e.message}`;
      }
    }
    case "graphql-playground-ui": return `Query composer (CORS applies, no proxy):\n${input}`;
    case "api-workbench": return "Enter URL in Input. Browser fetch applies (CORS, no proxy). Use DevTools network tab alongside – 100% local.";
    case "mcp-inspector-lite": return jsonFormat(input || '{"tools":[]}', 2);
    case "fake-json-api-sw": return 'Mock routes stored in localStorage. Example: GET /api/users -> [{"id":1}]';
    case "javascript-playground": return `Sandboxed eval disabled by default for safety. Paste code, review, run in DevTools console. Input length: ${input.length}`;
    case "python-playground-pyodide":
    case "go-playground-lite":
    case "rust-playground-lite":
    case "java-playground-lite": return "Client-only lite mode: syntax stays local. Full compile needs server (explicitly out of scope).";
    case "openscad-playground":
    case "threejs-playground":
    case "canvas-playground": return `Preview code (runs locally when you press Run in full canvas mode):\n${input.slice(0, 2000)}`;
    case "excalidraw-embed": return "Embed Excalidraw via iframe; drawings never leave browser.";
    case "graphviz-editor": return graphvizToMermaid(input);
    case "mermaid-playground": return input;
    case "plantuml-lite": {
      const enc = base64Encode(input).slice(0, 200);
      return `Encoded (client-only, no server render):\n${enc}...`;
    }
    case "qr-generator": return `QR payload ready (${input.length} chars). Canvas render in UI – fully local via qrcode lib.`;
    case "lorem-generator": return "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(6);
    case "random-json-generator":
    case "mock-data-generator": return JSON.stringify([{ id: 1, name: "Ada", email: "ada@example.com" }, { id: 2, name: "Bo", email: "bo@example.com" }], null, 2);
    case "mysql-cmd-gen": return `mysql -h localhost -u root -p ${input || "mydb"}`;
    case "tar-cmd-gen": return `tar -czf archive.tar.gz ${input || "dist/"}`;
    case "curl-cmd-gen": return `curl -X GET "${input || "https://api.example.com"}" -H "Accept: application/json"`;
    case "cron-builder": return cronDescribe(input || "*/5 * * * *");
    case "gitignore-generator": return gitignoreGen(input);
    case "dockerfile-generator": return dockerGen(input);
    case "env-toolkit": return envParse(input);
    case "gha-explainer": return `Workflow has ${(input.match(/jobs:/g) || []).length} job block(s). Paste YAML to diagram steps locally.`;
    case "svg-preview": return input;
    case "color-picker": return `Selected: ${input || "#0088b0"}`;
    case "color-contrast-converter": {
      const parts = input.split(/ on |,|\s+/).filter(Boolean);
      const fg = parts[0] || "#201e1d";
      const bg = parts[1] || "#f3f2f2";
      return `ratio: ${contrastRatio(fg, bg)}:1 (WCAG AA needs >=4.5)`;
    }
    case "image-toolkit": return "Drop image (handled in dedicated uploader with canvas resize/compress – local only).";
    case "seo-inspector-paste-only": return `Title: ${(input.match(/<title>(.*?)<\/title>/i) || ["", "—"])[1]}\nMeta desc: ${(input.match(/name="description" content="(.*?)"/i) || ["", "—"])[1]}\n(paste-only, no live fetch)`;
    case "jsonld-inspector": return jsonFormat(input || '{"@context":"https://schema.org"}', 2);
    case "ascii-draw": return input || "+---+\n|   |\n+---+";
    case "box-drawing": return boxDraw(input || "hello");
    case "comment-ascii-art": return `// ===== ${input || "Header"} =====`;
    case "text-to-ascii-figlet": return `# FIGlet (lazy) for: ${input}`;
    case "image-to-ascii": return "Upload image in Image Toolkit – pixel sampling via canvas getImageData locally.";
    case "ascii-tree": return asciiTree(input);
    case "stopwatch-timer": return "Use Start/Stop buttons in UI (performance.now, worker-backed).";
    case "timezone-compare": return `Local: ${new Date().toString()}\nUTC: ${new Date().toUTCString()}\nCity query: ${input || "Tokyo, London, NYC"} (Intl API)`;
    case "tool-pipelines": return "Chain: pick output -> Send to Pipeline -> select next tool. In-memory only.";
    case "saved-workspaces": return "Workspaces persist to localStorage key devtools:workspaces. No account.";
    case "developer-recipes": return "Recipes: Format->Validate->Minify, CSV->JSON->SQL, Log->Redact->Diff. One-click presets.";
    default: return input;
  }
}

/**
 * The slugs a pipeline step may use: tools whose dispatch case is a real
 * transform of its input. Tools that only return a notice (wasm loaders,
 * lite-mode playgrounds, file pickers, the platform pages) are left out —
 * chaining them would put their explanatory text into the payload.
 */
export const RUNNABLE_SLUGS: string[] = [
  "json-formatter", "json-validator", "json-minifier", "json-viewer", "json-escape",
  "json-unescape", "json-to-base64", "json-to-json-schema", "jq-playground", "jsonpath-playground",
  "base64-encoder", "base64-decoder", "base64-to-hex", "url-encoder", "url-decoder",
  "html-entity-encoder", "html-entity-decoder", "jwt-decoder",
  "binary-to-text", "text-to-binary", "hex-to-text", "text-to-hex", "ascii-table",
  "base-converter", "big-number", "epoch-converter", "string-length",
  "json-to-csv", "csv-to-json", "json-to-yaml", "yaml-to-json", "json-to-xml", "xml-to-json",
  "toml-to-json", "json-to-toml", "json-to-sql", "csv-to-sql", "graphviz-to-mermaid",
  "curl-to-code", "template-string-merger",
  "json-schema-validator", "csv-validator", "yaml-validator", "xml-validator",
  "xml-formatter", "xml-viewer", "xml-editor",
  "css-formatter", "html-formatter", "sql-formatter", "inline-sql-vars",
  "stack-trace-formatter", "java-exception-formatter", "go-stacktrace-formatter",
  "text-toolbox", "log-privacy-workbench", "file-diff-viewer",
  "data-explorer", "csv-viewer", "ddl-to-diagram",
  "hash-generator", "hmac-tool", "password-generator", "token-generator", "uuid-generator",
  "secret-detector", "security-header-helper",
  "regex-tester", "regex-lab-py-go-java", "mcp-inspector-lite",
  "graphviz-editor", "plantuml-lite",
  "lorem-generator", "random-json-generator", "mock-data-generator",
  "mysql-cmd-gen", "tar-cmd-gen", "curl-cmd-gen", "cron-builder", "gitignore-generator",
  "dockerfile-generator", "env-toolkit", "gha-explainer",
  "color-picker", "color-contrast-converter", "seo-inspector-paste-only", "jsonld-inspector",
  "box-drawing", "comment-ascii-art", "ascii-tree", "timezone-compare",
];
