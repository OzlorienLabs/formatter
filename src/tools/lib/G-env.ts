/**
 * .env parsing with dotenv semantics (export prefix, quotes, multi-line
 * values, inline comments, ${VAR} expansion), validation, comparison and
 * conversion to a dozen deployment formats.
 */

export type Issue = { level: "error" | "warning" | "info" | "ok"; message: string; line?: number; col?: number };
export type EnvEntry = { key: string; value: string; raw: string; line: number; quote: "" | '"' | "'" | "`"; exported: boolean; comment?: string };

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function parseEnv(src: string): { entries: EnvEntry[]; issues: Issue[] } {
  const entries: EnvEntry[] = [];
  const issues: Issue[] = [];
  const text = src.replace(/^\uFEFF/, "");
  if (text !== src) issues.push({ level: "info", message: "File starts with a UTF-8 byte-order mark — some loaders read it as part of the first key.", line: 1 });
  if (/\r\n/.test(text)) issues.push({ level: "info", message: "Windows (CRLF) line endings — fine for dotenv, but `source .env` in bash keeps the \\r in values." });
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const line = lines[i];
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    let rest = t;
    let exported = false;
    if (/^export\s+/.test(rest)) {
      exported = true;
      rest = rest.replace(/^export\s+/, "");
    }
    const eq = rest.indexOf("=");
    if (eq < 0) {
      issues.push({ level: "error", message: `Line ${lineNo}: "${t.length > 40 ? t.slice(0, 40) + "…" : t}" has no "=" — expected KEY=value.`, line: lineNo, col: 1 });
      continue;
    }
    const rawKey = rest.slice(0, eq);
    const key = rawKey.trim();
    const col = line.indexOf(key) + 1;
    if (rawKey !== key || /^\s/.test(rest.slice(eq + 1)) && rest.slice(eq + 1).trim()) {
      issues.push({ level: "warning", message: `${key}: spaces around "=" — dotenv accepts it, but \`source .env\` in a shell and Docker --env-file do not.`, line: lineNo, col: col + key.length });
    }
    if (!key) {
      issues.push({ level: "error", message: `Line ${lineNo}: missing variable name before "=".`, line: lineNo, col: 1 });
      continue;
    }
    if (!NAME.test(key)) {
      if (/^[\w.-]+$/.test(key) && !/^\d/.test(key)) issues.push({ level: "warning", message: `${key}: "." and "-" work in dotenv but are not valid shell variable names.`, line: lineNo, col });
      else issues.push({ level: "error", message: `${key}: invalid name — use letters, digits and underscores, not starting with a digit.`, line: lineNo, col });
    } else if (key !== key.toUpperCase()) {
      issues.push({ level: "info", message: `${key}: convention is UPPER_SNAKE_CASE.`, line: lineNo, col });
    }
    let v = rest.slice(eq + 1).replace(/^\s+/, "");
    let value = "";
    let quote: EnvEntry["quote"] = "";
    let comment: string | undefined;
    const q = v[0];
    if (q === '"' || q === "'" || q === "`") {
      quote = q as EnvEntry["quote"];
      // find the closing quote, possibly on a later line
      let body = v.slice(1);
      let end = findClose(body, q);
      let j = i;
      // a multi-line value continues until its closing quote — but never across a line that starts a new KEY=
      while (end < 0 && j + 1 < lines.length && !/^\s*(export\s+)?[A-Za-z_][\w.-]*\s*=/.test(lines[j + 1])) {
        j++;
        body += "\n" + lines[j];
        end = findClose(body, q);
      }
      if (end < 0) {
        issues.push({ level: "error", message: `${key}: unterminated ${q === '"' ? "double" : q === "'" ? "single" : "backtick"} quote — add the closing ${q}.`, line: lineNo, col: line.indexOf(q) + 1 });
        value = v.slice(1);
      } else {
        value = body.slice(0, end);
        const after = body.slice(end + 1).trim();
        if (after && !after.startsWith("#")) issues.push({ level: "warning", message: `${key}: unexpected text after the closing quote: ${after.slice(0, 30)}`, line: j + 1 });
        if (after.startsWith("#")) comment = after.slice(1).trim();
        if (j > i) issues.push({ level: "info", message: `${key}: multi-line value (${j - i + 1} lines).`, line: lineNo });
        i = j;
      }
      if (q === '"') value = value.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    } else {
      const hash = v.search(/\s#/);
      if (hash >= 0) {
        comment = v.slice(hash).trim().slice(1).trim();
        v = v.slice(0, hash);
      }
      value = v.trim();
      if (/\s/.test(value)) issues.push({ level: "warning", message: `${key}: unquoted value contains spaces — quote it so shells read it as one word.`, line: lineNo });
      if (/^["'`]|["'`]$/.test(value) && value.length > 1 && value[0] !== value[value.length - 1]) issues.push({ level: "warning", message: `${key}: mismatched quotes in value.`, line: lineNo });
    }
    const raw = value;
    entries.push({ key, value, raw, line: lineNo, quote, exported, comment });
  }

  // duplicates
  const seen = new Map<string, number>();
  for (const e of entries) {
    const prev = seen.get(e.key);
    if (prev !== undefined) issues.push({ level: "warning", message: `${e.key} is defined again (first on line ${prev}) — the last value wins in dotenv, the first in some other loaders.`, line: e.line });
    seen.set(e.key, e.line);
  }
  return { entries, issues };
}

function findClose(body: string, q: string): number {
  for (let k = 0; k < body.length; k++) {
    if (body[k] === "\\" && q === '"') { k++; continue; }
    if (body[k] === q) return k;
  }
  return -1;
}

/** dotenv-expand: ${VAR}, ${VAR:-default}, $VAR in unquoted and double-quoted values. */
export function expand(entries: EnvEntry[], issues?: Issue[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const e of entries) {
    if (e.quote === "'") {
      out.set(e.key, e.value);
      continue;
    }
    const v = e.value.replace(/\\\$/g, "\u0000").replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)(?::?-([^}]*))?\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (m, a, def, b) => {
      const name = a ?? b;
      if (out.has(name)) return out.get(name)!;
      if (def !== undefined) return def;
      issues?.push({ level: "warning", message: `${e.key} references \${${name}}, which is not defined above it — it expands to an empty string.`, line: e.line });
      return "";
    });
    out.set(e.key, v.replace(/\u0000/g, "$"));
  }
  return out;
}

export function validateExtras(entries: EnvEntry[], issues: Issue[]) {
  for (const e of entries) {
    if (e.value === "") issues.push(/SECRET|PASSWORD|TOKEN|KEY/i.test(e.key) ? { level: "warning", message: `${e.key} is empty — the app may start without a secret (or fall back to an insecure default).`, line: e.line } : { level: "info", message: `${e.key} is empty.`, line: e.line });
    if (/(SECRET|PASSWORD|PASSWD|TOKEN|PRIVATE_KEY|API_KEY)/i.test(e.key) && e.value && /^(changeme|password|secret|admin|123456|test|xxx+|todo)$/i.test(e.value))
      issues.push({ level: "warning", message: `${e.key} looks like a placeholder secret ("${e.value}").`, line: e.line });
    if (/^(true|false|yes|no)$/i.test(e.value) && e.value !== e.value.toLowerCase()) issues.push({ level: "info", message: `${e.key}: booleans are usually lowercase — string comparisons are case-sensitive.`, line: e.line });
    if (/^https?:\/\/[^\s/]+:[^\s@/]+@/.test(e.value)) issues.push({ level: "info", message: `${e.key}: URL embeds credentials.`, line: e.line });
  }
}

export const mask = (v: string) => (v.length <= 4 ? "****" : v.slice(0, 2) + "*".repeat(Math.min(12, v.length - 4)) + v.slice(-2));

/* ── conversion ─────────────────────────────────────────────────────── */

const sq = (s: string) => (/^[A-Za-z0-9_@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`);
const yq = (s: string) => {
  if (s === "") return '""';
  if (/^[A-Za-z_./-][A-Za-z0-9_ ./:@-]*$/.test(s) && !/^(true|false|yes|no|on|off|null|~)$/i.test(s) && !/:\s|\s$|^\s/.test(s)) return s;
  return JSON.stringify(s);
};
const b64 = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  bytes.forEach((x) => (bin += String.fromCharCode(x)));
  return btoa(bin);
};
const dns = (s: string) => s.toLowerCase().replace(/[^a-z0-9.-]+/g, "-").replace(/^-+|-+$/g, "") || "app-config";

function placeholder(key: string, v: string): string {
  if (/PASSWORD|SECRET|TOKEN|KEY|PRIVATE/i.test(key)) return "";
  if (/^\d+$/.test(v)) return v;
  if (/^(true|false)$/i.test(v)) return v;
  if (/^https?:\/\//.test(v)) return v.replace(/\/\/[^/]*@/, "//user:password@").replace(/\/\/(?![^/]*@)[^/:]+/, "//localhost");
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) return v.replace(/:\/\/[^/]*@/, "://user:password@");
  if (/^[a-z][a-z0-9_-]{0,15}$/.test(v) && !/USER|NAME|HOST|EMAIL/i.test(key)) return v; // simple settings such as production / info
  return `<${key.toLowerCase().replace(/_/g, "-")}>`;
}

export const TARGETS: [string, string][] = [
  ["json", "JSON"],
  ["yaml", "YAML"],
  ["docker", "docker run -e"],
  ["envfile", "Docker --env-file (normalised)"],
  ["compose", "docker-compose environment"],
  ["configmap", "Kubernetes ConfigMap"],
  ["secret", "Kubernetes Secret (base64)"],
  ["shell", "Shell export"],
  ["gha", "GitHub Actions env:"],
  ["powershell", "PowerShell $env:"],
  ["cmd", "Windows cmd set"],
  ["example", ".env.example"],
];

export function convert(entries: EnvEntry[], values: Map<string, string>, to: string, o: { mask: boolean; name: string }): { text: string; lang: "json" | "yaml" | "shell" | "text" | "ini" } {
  // last value wins, first position kept
  const keys = [...new Set(entries.map((e) => e.key))];
  const val = (k: string) => {
    const v = values.get(k) ?? "";
    return o.mask ? mask(v) : v;
  };
  const name = dns(o.name || "app-config");
  switch (to) {
    case "json":
      return { text: JSON.stringify(Object.fromEntries(keys.map((k) => [k, val(k)])), null, 2), lang: "json" };
    case "yaml":
      return { text: keys.map((k) => `${k}: ${yq(val(k))}`).join("\n"), lang: "yaml" };
    case "docker":
      return { text: `docker run --rm \\\n${keys.map((k) => `  -e ${sq(`${k}=${val(k)}`)} \\`).join("\n")}\n  ${name}:latest`, lang: "shell" };
    case "envfile":
      // docker --env-file takes values literally: no quotes, no expansion, one line each
      return { text: keys.map((k) => `${k}=${val(k).replace(/\n/g, "\\n")}`).join("\n"), lang: "ini" };
    case "compose":
      return { text: `services:\n  ${name.replace(/\./g, "-")}:\n    image: ${name}:latest\n    environment:\n${keys.map((k) => `      ${k}: ${yq(val(k))}`).join("\n")}`, lang: "yaml" };
    case "configmap":
      return { text: `apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: ${name}\ndata:\n${keys.map((k) => `  ${k}: ${JSON.stringify(val(k))}`).join("\n")}`, lang: "yaml" };
    case "secret":
      return { text: `apiVersion: v1\nkind: Secret\nmetadata:\n  name: ${name}\ntype: Opaque\ndata:\n${keys.map((k) => `  ${k}: ${b64(val(k))}`).join("\n")}`, lang: "yaml" };
    case "shell":
      return { text: keys.map((k) => `export ${k}=${sq(val(k))}`).join("\n"), lang: "shell" };
    case "gha":
      return { text: `env:\n${keys.map((k) => (/SECRET|PASSWORD|TOKEN|KEY/i.test(k) ? `  ${k}: \${{ secrets.${k} }}` : `  ${k}: ${yq(val(k))}`)).join("\n")}`, lang: "yaml" };
    case "powershell":
      return { text: keys.map((k) => `$env:${k} = '${val(k).replace(/'/g, "''")}'`).join("\n"), lang: "shell" };
    case "cmd":
      return { text: keys.map((k) => `set "${k}=${val(k).replace(/([%^&|<>])/g, "^$1")}"`).join("\n"), lang: "shell" };
    case "example": {
      const out: string[] = [];
      const done = new Set<string>();
      for (const e of entries) {
        if (done.has(e.key)) continue;
        done.add(e.key);
        out.push(`${e.key}=${placeholder(e.key, values.get(e.key) ?? "")}${e.comment ? `  # ${e.comment}` : ""}`);
      }
      return { text: out.join("\n"), lang: "ini" };
    }
  }
  return { text: "", lang: "text" };
}
