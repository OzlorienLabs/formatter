/**
 * MCP Inspector helpers: read tools/list results, server manifests and
 * JSON-RPC transcripts; lint tool schemas with Ajv; generate example
 * arguments; build tools/call requests.
 */

export type McpTool = { name?: unknown; title?: unknown; description?: unknown; inputSchema?: unknown; outputSchema?: unknown; annotations?: Record<string, unknown> };
export type McpIssue = { level: "error" | "warning" | "info" | "ok"; message: string; line?: number };
export type RpcMsg = Record<string, unknown> & { jsonrpc?: string; id?: string | number | null; method?: string; params?: unknown; result?: unknown; error?: { code?: number; message?: string; data?: unknown } };
export type Exchange = { n: number; id: string | number | null; method: string; kind: "request" | "notification" | "orphan response"; line: number; ms: number | null; status: string; summary: string; dir?: string };

export type McpDoc = {
  kind: "tools/list" | "manifest" | "transcript" | "initialize" | "single tool";
  tools: McpTool[];
  resources: Record<string, unknown>[];
  resourceTemplates: Record<string, unknown>[];
  prompts: Record<string, unknown>[];
  server?: Record<string, unknown>;
  exchanges: Exchange[];
  transcriptIssues: McpIssue[];
};

function tsOf(o: Record<string, unknown>): number | null {
  const v = o.ts ?? o.timestamp ?? o.time ?? o.t;
  if (typeof v === "number") return v > 1e12 ? v : v * 1000;
  if (typeof v === "string") {
    const n = Date.parse(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function unwrap(o: Record<string, unknown>): { msg: RpcMsg; ts: number | null; dir?: string } {
  const ts = tsOf(o);
  const dir = typeof o.dir === "string" ? o.dir : typeof o.direction === "string" ? o.direction : undefined;
  for (const k of ["message", "msg", "data", "payload"]) {
    const inner = o[k];
    if (inner && typeof inner === "object" && ("jsonrpc" in (inner as object) || "method" in (inner as object) || "result" in (inner as object))) return { msg: inner as RpcMsg, ts, dir };
  }
  return { msg: o as RpcMsg, ts, dir };
}

const short = (v: unknown, n = 90) => {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  if (s === undefined) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
};

export function readMcp(src: string): McpDoc {
  const text = src.trim();
  const doc: McpDoc = { kind: "tools/list", tools: [], resources: [], resourceTemplates: [], prompts: [], exchanges: [], transcriptIssues: [] };
  let whole: unknown;
  let parsedWhole = false;
  try {
    whole = JSON.parse(text);
    parsedWhole = true;
  } catch {
    /* maybe NDJSON */
  }

  let lines: { v: Record<string, unknown>; line: number }[] | null = null;
  if (parsedWhole && Array.isArray(whole) && whole.every((x) => x && typeof x === "object" && ("jsonrpc" in x || "method" in x || "message" in x))) {
    lines = (whole as Record<string, unknown>[]).map((v, i) => ({ v, line: i + 1 }));
  } else if (!parsedWhole) {
    lines = [];
    const raw = text.split(/\r?\n/);
    for (let i = 0; i < raw.length; i++) {
      const l = raw[i].trim();
      if (!l || l.startsWith("//") || l.startsWith("#")) continue;
      // Allow "→ {…}" / "<- {…}" prefixes from logs.
      const m = /^(->|<-|→|←|>>|<<|send|recv|out|in)?\s*[:|]?\s*(\{.*\})\s*$/i.exec(l);
      const body = m ? m[2] : l;
      try {
        const v = JSON.parse(body);
        if (m?.[1] && v && typeof v === "object" && !("dir" in v)) (v as Record<string, unknown>).dir = /^(->|→|>>|send|out)$/i.test(m[1]) ? "→" : "←";
        lines.push({ v, line: i + 1 });
      } catch (e) {
        throw new Error(`Line ${i + 1} is not valid JSON: ${(e as Error).message}. Paste a JSON document, or one JSON-RPC message per line (NDJSON).`);
      }
    }
    if (!lines.length) throw new Error("Paste a tools/list result, a server manifest or a JSON-RPC transcript.");
  }

  if (lines) {
    doc.kind = "transcript";
    const reqs = new Map<string, { ex: Exchange; ts: number | null; msg: RpcMsg }>();
    let n = 0;
    for (const { v, line } of lines) {
      const { msg, ts, dir } = unwrap(v);
      if (msg.jsonrpc !== "2.0") doc.transcriptIssues.push({ level: "warning", message: `Line ${line}: "jsonrpc": "2.0" is missing or wrong.`, line });
      if (typeof msg.method === "string") {
        const isReq = msg.id !== undefined && msg.id !== null;
        const ex: Exchange = { n: ++n, id: isReq ? (msg.id as string | number) : null, method: msg.method, kind: isReq ? "request" : "notification", line, ms: null, status: isReq ? "pending" : "—", summary: short(msg.params ?? ""), dir };
        doc.exchanges.push(ex);
        if (isReq) {
          const key = String(msg.id);
          if (reqs.has(key) && reqs.get(key)!.ex.status === "pending") doc.transcriptIssues.push({ level: "warning", message: `Line ${line}: id ${key} reused while an earlier request with it is still pending.`, line });
          reqs.set(key, { ex, ts, msg });
        }
        if (msg.method === "tools/call" && msg.params && typeof msg.params === "object") {
          const p = msg.params as Record<string, unknown>;
          ex.summary = `${String(p.name)}(${short(p.arguments ?? {}, 70)})`;
        }
      } else if ("result" in msg || "error" in msg) {
        const key = String(msg.id);
        const req = reqs.get(key);
        if (!req) {
          doc.exchanges.push({ n: ++n, id: msg.id ?? null, method: "?", kind: "orphan response", line, ms: null, status: msg.error ? `error ${msg.error.code ?? ""}` : "ok", summary: short(msg.result ?? msg.error), dir });
          doc.transcriptIssues.push({ level: "warning", message: `Line ${line}: response id ${key} has no matching request.`, line });
          continue;
        }
        const ex = req.ex;
        if (ts != null && req.ts != null) ex.ms = Math.round(ts - req.ts);
        if (msg.error) {
          ex.status = `error ${msg.error.code ?? ""}`.trim();
          ex.summary = `${ex.summary ? ex.summary + " → " : ""}${msg.error.message ?? "error"}`;
          doc.transcriptIssues.push({ level: "error", message: `Line ${line}: ${ex.method} (id ${key}) failed: ${msg.error.code ?? ""} ${msg.error.message ?? ""}`.trim(), line });
        } else {
          const r = msg.result as Record<string, unknown> | undefined;
          ex.status = r && r.isError === true ? "tool error" : "ok";
          if (r && r.isError === true) doc.transcriptIssues.push({ level: "warning", message: `Line ${line}: ${ex.summary || ex.method} returned isError: true.`, line });
          ex.summary = `${ex.summary ? ex.summary + " → " : ""}${summariseResult(ex.method, r)}`;
          absorb(doc, ex.method, r);
        }
      } else doc.transcriptIssues.push({ level: "warning", message: `Line ${line}: not a JSON-RPC request, notification or response.`, line });
    }
    for (const { ex } of reqs.values()) if (ex.status === "pending") doc.transcriptIssues.push({ level: "warning", message: `Line ${ex.line}: ${ex.method} (id ${String(ex.id)}) never got a response.`, line: ex.line });
    return doc;
  }

  // A single JSON document.
  let v = whole as Record<string, unknown>;
  if (!v || typeof v !== "object") throw new Error("Expected a JSON object with tools, resources or prompts.");
  if ("result" in v && v.result && typeof v.result === "object") v = v.result as Record<string, unknown>;
  if (Array.isArray(v)) {
    doc.tools = v as McpTool[];
    return doc;
  }
  if ("inputSchema" in v && "name" in v) {
    doc.kind = "single tool";
    doc.tools = [v as McpTool];
    return doc;
  }
  if (v.capabilities || v.serverInfo) {
    doc.kind = "initialize";
    doc.server = v;
  }
  if (Array.isArray(v.tools)) doc.tools = v.tools as McpTool[];
  if (Array.isArray(v.resources)) doc.resources = v.resources as Record<string, unknown>[];
  if (Array.isArray(v.resourceTemplates)) doc.resourceTemplates = v.resourceTemplates as Record<string, unknown>[];
  if (Array.isArray(v.prompts)) doc.prompts = v.prompts as Record<string, unknown>[];
  if (doc.resources.length || doc.prompts.length || doc.resourceTemplates.length || v.name || v.serverInfo) doc.kind = doc.kind === "initialize" ? "initialize" : "manifest";
  if (v.name && !doc.server) doc.server = { name: v.name, version: v.version, description: v.description };
  if (!doc.tools.length && !doc.resources.length && !doc.prompts.length && doc.kind !== "initialize") throw new Error('No "tools", "resources" or "prompts" found. Paste a tools/list result ({"tools": [...]}) or a JSON-RPC response.');
  return doc;
}

function summariseResult(method: string, r: Record<string, unknown> | undefined): string {
  if (!r) return "ok";
  if (method === "initialize") {
    const si = r.serverInfo as Record<string, unknown> | undefined;
    return `${si?.name ?? "server"} ${si?.version ?? ""} · protocol ${r.protocolVersion ?? "?"}`.trim();
  }
  if (Array.isArray(r.tools)) return `${r.tools.length} tools`;
  if (Array.isArray(r.resources)) return `${r.resources.length} resources`;
  if (Array.isArray(r.prompts)) return `${r.prompts.length} prompts`;
  if (Array.isArray(r.content)) {
    const first = (r.content as Record<string, unknown>[])[0];
    return first?.type === "text" ? short(first.text, 70) : `${r.content.length} content item(s)`;
  }
  if (Array.isArray(r.contents)) return `${r.contents.length} content item(s)`;
  if (Array.isArray(r.messages)) return `${r.messages.length} message(s)`;
  return short(r, 70);
}

function absorb(doc: McpDoc, method: string, r: Record<string, unknown> | undefined) {
  if (!r) return;
  if (method === "tools/list" && Array.isArray(r.tools)) doc.tools.push(...(r.tools as McpTool[]));
  if (method === "resources/list" && Array.isArray(r.resources)) doc.resources.push(...(r.resources as Record<string, unknown>[]));
  if (method === "resources/templates/list" && Array.isArray(r.resourceTemplates)) doc.resourceTemplates.push(...(r.resourceTemplates as Record<string, unknown>[]));
  if (method === "prompts/list" && Array.isArray(r.prompts)) doc.prompts.push(...(r.prompts as Record<string, unknown>[]));
  if (method === "initialize") doc.server = r;
}

/* ── schema linting ──────────────────────────────────────────────────── */

type AjvLike = { compile: (s: object) => ((d: unknown) => boolean) & { errors?: { instancePath: string; message?: string; params?: Record<string, unknown> }[] | null } };

let ajvP: Promise<{ a2020: AjvLike; a07: AjvLike }> | null = null;
export function ajvs() {
  if (!ajvP) {
    ajvP = (async () => {
      const [{ default: Ajv2020 }, { default: Ajv07 }, { default: addFormats }] = await Promise.all([import("ajv/dist/2020"), import("ajv"), import("ajv-formats")]);
      const a2020 = new Ajv2020({ allErrors: true, strict: false, validateFormats: true });
      const a07 = new Ajv07({ allErrors: true, strict: false });
      addFormats(a2020 as never);
      addFormats(a07 as never);
      return { a2020: a2020 as unknown as AjvLike, a07: a07 as unknown as AjvLike };
    })();
  }
  return ajvP;
}

export function pickAjv(a: { a2020: AjvLike; a07: AjvLike }, schema: Record<string, unknown>): AjvLike {
  const s = String(schema.$schema ?? "");
  return /draft-0[4-7]/.test(s) ? a.a07 : a.a2020;
}

const NAME_RE = /^[A-Za-z0-9_.-]{1,128}$/;

export async function lintTools(tools: McpTool[]): Promise<{ issues: McpIssue[]; perTool: Map<number, { errors: number; warnings: number }> }> {
  const a = await ajvs();
  const issues: McpIssue[] = [];
  const perTool = new Map<number, { errors: number; warnings: number }>();
  const seen = new Map<string, number>();
  tools.forEach((t, i) => {
    const counts = { errors: 0, warnings: 0 };
    const label = typeof t.name === "string" && t.name ? `${t.name}` : `tools[${i}]`;
    const add = (level: McpIssue["level"], message: string) => {
      if (level === "error") counts.errors++;
      if (level === "warning") counts.warnings++;
      issues.push({ level, message: `${label}: ${message}` });
    };
    if (typeof t.name !== "string" || !t.name) add("error", "missing \"name\".");
    else {
      if (!NAME_RE.test(t.name)) add("error", `name "${t.name}" should be 1–128 characters of A–Z a–z 0–9 _ - . (no spaces).`);
      else if (t.name.length > 64) add("warning", "name is longer than 64 characters — some clients truncate or reject it.");
      if (seen.has(t.name)) add("error", `duplicate name (also tools[${seen.get(t.name)}]).`);
      seen.set(t.name, i);
    }
    if (typeof t.description !== "string" || !t.description.trim()) add("warning", "no description — the model has only the name to decide when to call it.");
    else if (t.description.trim().length < 20) add("info", `description is very short ("${t.description.trim()}") — say what it does and when to use it.`);
    const s = t.inputSchema as Record<string, unknown> | undefined;
    if (!s || typeof s !== "object") add("error", "missing inputSchema (use {\"type\": \"object\"} for no arguments).");
    else {
      if (s.type !== "object") add("error", `inputSchema.type must be "object" (found ${JSON.stringify(s.type)}).`);
      try {
        pickAjv(a, s).compile(s);
      } catch (e) {
        add("error", `inputSchema does not compile: ${(e as Error).message}`);
      }
      const props = (s.properties ?? {}) as Record<string, Record<string, unknown>>;
      if (s.properties !== undefined && (typeof s.properties !== "object" || Array.isArray(s.properties))) add("error", "properties must be an object.");
      for (const [k, p] of Object.entries(props)) {
        if (!p || typeof p !== "object") {
          add("error", `property "${k}" is not a schema object.`);
          continue;
        }
        if (!("type" in p) && !("$ref" in p) && !("enum" in p) && !("const" in p) && !("anyOf" in p) && !("oneOf" in p) && !("allOf" in p)) add("warning", `property "${k}" has no type.`);
        if (!p.description && !p.title) add("info", `property "${k}" has no description.`);
        if (p.type === "array" && !p.items) add("warning", `array property "${k}" has no items schema.`);
      }
      const req = s.required;
      if (req !== undefined) {
        if (!Array.isArray(req)) add("error", "required must be an array of property names.");
        else for (const r of req) if (!(String(r) in props)) add("error", `required lists "${String(r)}" which is not in properties.`);
      }
      if (!Object.keys(props).length && s.type === "object" && s.additionalProperties !== false) add("info", "takes no declared arguments — add \"additionalProperties\": false to make that explicit.");
    }
    if (t.outputSchema !== undefined) {
      const o = t.outputSchema as Record<string, unknown>;
      if (!o || typeof o !== "object") add("error", "outputSchema must be an object schema.");
      else {
        if (o.type !== "object") add("warning", `outputSchema.type should be "object" (structuredContent is an object).`);
        try {
          pickAjv(a, o).compile(o);
        } catch (e) {
          add("error", `outputSchema does not compile: ${(e as Error).message}`);
        }
      }
    }
    const an = t.annotations;
    if (an && typeof an === "object") {
      if (an.readOnlyHint === true && an.destructiveHint === true) add("warning", "annotations say both readOnlyHint and destructiveHint — pick one.");
    }
    perTool.set(i, counts);
  });
  return { issues, perTool };
}

/* ── example arguments ───────────────────────────────────────────────── */

export function exampleFor(schema: unknown, name = "value", all = true, depth = 0, root?: Record<string, unknown>): unknown {
  const s = (schema && typeof schema === "object" ? schema : {}) as Record<string, unknown>;
  const r = root ?? s;
  if (depth > 6) return null;
  if (typeof s.$ref === "string") {
    const target = s.$ref.replace(/^#\//, "").split("/").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[decodeURIComponent(k)] : undefined), r);
    return exampleFor(target, name, all, depth + 1, r);
  }
  if ("default" in s) return s.default;
  if ("const" in s) return s.const;
  if (Array.isArray(s.examples) && s.examples.length) return s.examples[0];
  if (Array.isArray(s.enum) && s.enum.length) return s.enum[0];
  for (const k of ["anyOf", "oneOf"]) if (Array.isArray(s[k]) && (s[k] as unknown[]).length) {
    const opts = (s[k] as Record<string, unknown>[]).filter((o) => o.type !== "null");
    return exampleFor(opts[0] ?? (s[k] as unknown[])[0], name, all, depth + 1, r);
  }
  if (Array.isArray(s.allOf)) return Object.assign({}, ...(s.allOf as unknown[]).map((x) => exampleFor(x, name, all, depth + 1, r)));
  const type = Array.isArray(s.type) ? (s.type as string[]).find((t) => t !== "null") : (s.type as string | undefined) ?? (s.properties ? "object" : undefined);
  const n = name.toLowerCase();
  switch (type) {
    case "object": {
      const props = (s.properties ?? {}) as Record<string, unknown>;
      const req = new Set(Array.isArray(s.required) ? (s.required as string[]) : []);
      const o: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(props)) if (all || req.has(k)) o[k] = exampleFor(v, k, all, depth + 1, r);
      return o;
    }
    case "array": {
      const min = Number(s.minItems ?? 1) || 1;
      return Array.from({ length: Math.min(Math.max(1, min), 3) }, () => exampleFor(s.items, name.replace(/s$/, ""), all, depth + 1, r));
    }
    case "integer":
    case "number": {
      const min = typeof s.minimum === "number" ? s.minimum : typeof s.exclusiveMinimum === "number" ? s.exclusiveMinimum + 1 : undefined;
      const max = typeof s.maximum === "number" ? s.maximum : undefined;
      let v = /limit|count|max|size|top|n$/.test(n) ? 10 : /page/.test(n) ? 1 : /lat/.test(n) ? 51.5072 : /lon|lng/.test(n) ? -0.1276 : 42;
      if (min !== undefined && v < min) v = min;
      if (max !== undefined && v > max) v = max;
      return type === "integer" ? Math.round(v) : v;
    }
    case "boolean":
      return false;
    case "null":
      return null;
    case "string": {
      const f = String(s.format ?? "");
      if (f === "date-time") return "2026-09-24T12:00:00Z";
      if (f === "date") return "2026-09-24";
      if (f === "time") return "12:00:00";
      if (f === "email") return "ada@example.com";
      if (f === "uri" || f === "url") return "https://example.com/resource";
      if (f === "uuid") return "3f2b8c1e-9d4a-4c6b-8e2f-1a2b3c4d5e6f";
      if (f === "ipv4") return "192.168.1.10";
      if (/path|file|dir/.test(n)) return "/workspace/README.md";
      if (/url|uri|link/.test(n)) return "https://example.com";
      if (/email/.test(n)) return "ada@example.com";
      if (/city|location|place/.test(n)) return "London";
      if (/query|search|q$|prompt|text/.test(n)) return "offline developer tools";
      if (/lang|locale/.test(n)) return "en";
      if (/unit/.test(n)) return "celsius";
      if (/id$/.test(n)) return "abc123";
      if (/name/.test(n)) return "example";
      const min = Number(s.minLength ?? 0);
      const base = `example ${name}`;
      return base.length < min ? base.padEnd(min, "x") : base;
    }
  }
  return null;
}

export function schemaSummary(schema: unknown): string {
  const s = (schema && typeof schema === "object" ? schema : {}) as Record<string, unknown>;
  const props = (s.properties ?? {}) as Record<string, Record<string, unknown>>;
  const req = new Set(Array.isArray(s.required) ? (s.required as string[]) : []);
  const parts = Object.entries(props).map(([k, p]) => {
    const t = p?.enum ? (p.enum as unknown[]).map((x) => JSON.stringify(x)).join("|") : Array.isArray(p?.type) ? (p.type as string[]).join("|") : String(p?.type ?? (p?.$ref ? "ref" : "any"));
    return `${k}${req.has(k) ? "" : "?"}: ${t}${p?.type === "array" && p.items && typeof p.items === "object" ? `<${String((p.items as Record<string, unknown>).type ?? "any")}>` : ""}`;
  });
  return parts.length ? `{ ${parts.join(", ")} }` : "{ }";
}

export async function validateArgs(schema: unknown, args: unknown): Promise<McpIssue[]> {
  const a = await ajvs();
  try {
    const v = pickAjv(a, schema as Record<string, unknown>).compile(schema as object);
    if (v(args)) return [{ level: "ok", message: "Arguments match the tool's inputSchema." }];
    return (v.errors ?? []).map((e) => ({ level: "error" as const, message: `arguments${e.instancePath || ""} ${e.message ?? "is invalid"}${e.params && "allowedValues" in e.params ? `: ${JSON.stringify(e.params.allowedValues)}` : e.params && "additionalProperty" in e.params ? ` ("${String(e.params.additionalProperty)}")` : ""}` }));
  } catch (e) {
    return [{ level: "error", message: `Cannot validate — the schema does not compile: ${(e as Error).message}` }];
  }
}
