import { readJson, caret, jsonStats, utf8Len } from "./lib/jsonparse";
import { isNode } from "./lib/vendor";
import { ToolError, bool, num, str, type SpecModule, type View } from "./types";

type Level = "error" | "warning" | "info" | "ok";
type Issue = { level: Level; message: string; line?: number; col?: number };

const byLine = (a: Issue, b: Issue) => (a.line ?? 1e9) - (b.line ?? 1e9) || (a.col ?? 0) - (b.col ?? 0);
const countOf = (items: Issue[], l: Level) => items.filter((i) => i.level === l).length;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const issueLines = (items: Issue[]) => items.map((i) => `${i.level === "error" ? "✗" : i.level === "warning" ? "!" : "·"} ${i.line ? `line ${i.line}${i.col ? `:${i.col}` : ""}: ` : ""}${i.message}`).join("\n");

/* ── JSON Schema ─────────────────────────────────────────────────────── */

const PERSON_SCHEMA = `{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Person",
  "type": "object",
  "required": ["id", "name", "email"],
  "properties": {
    "id": {"type": "integer", "minimum": 1},
    "name": {"type": "string", "minLength": 2},
    "email": {"type": "string", "format": "email"},
    "born": {"type": "string", "format": "date"},
    "website": {"type": "string", "format": "uri"},
    "role": {"enum": ["admin", "editor", "viewer"]},
    "tags": {"type": "array", "items": {"type": "string"}, "minItems": 1, "uniqueItems": true}
  },
  "additionalProperties": false
}`;

const ORDER_SCHEMA = `{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.com/order.schema.json",
  "type": "object",
  "required": ["id", "items", "shipping"],
  "properties": {
    "id": {"type": "string", "pattern": "^ORD-[0-9]{4}$"},
    "items": {"type": "array", "minItems": 1, "items": {"$ref": "#/$defs/item"}},
    "shipping": {"$ref": "#/$defs/address"},
    "billing": {"$ref": "#/$defs/address"}
  },
  "$defs": {
    "item": {
      "type": "object",
      "required": ["sku", "qty"],
      "properties": {
        "sku": {"type": "string"},
        "qty": {"type": "integer", "minimum": 1, "maximum": 99},
        "price": {"type": "number", "exclusiveMinimum": 0}
      }
    },
    "address": {
      "type": "object",
      "required": ["street", "city", "country"],
      "properties": {
        "street": {"type": "string"},
        "city": {"type": "string"},
        "country": {"type": "string", "minLength": 2, "maxLength": 2}
      }
    }
  }
}`;

const PAYMENT_SCHEMA = `{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["method"],
  "properties": {
    "method": {"enum": ["card", "iban", "paypal"]},
    "amount": {"type": "number", "multipleOf": 0.01}
  },
  "if": {"properties": {"method": {"const": "card"}}},
  "then": {"required": ["cardNumber", "expiry"], "properties": {"expiry": {"type": "string", "pattern": "^(0[1-9]|1[0-2])/[0-9]{2}$"}}},
  "else": {"if": {"properties": {"method": {"const": "iban"}}}, "then": {"required": ["iban"]}}
}`;

const SHAPE_SCHEMA = `{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "definitions": {
    "circle": {"type": "object", "required": ["radius"], "properties": {"kind": {"const": "circle"}, "radius": {"type": "number"}}},
    "rect": {"type": "object", "required": ["width", "height"], "properties": {"kind": {"const": "rect"}, "width": {"type": "number"}, "height": {"type": "number"}}}
  },
  "type": "array",
  "items": {"oneOf": [{"$ref": "#/definitions/circle"}, {"$ref": "#/definitions/rect"}]}
}`;

function typeName(v: unknown) {
  return v === null ? "null" : Array.isArray(v) ? "array" : Number.isInteger(v) ? "integer" : typeof v;
}
const short = (v: unknown) => {
  const s = JSON.stringify(v);
  return s === undefined ? "undefined" : s.length > 50 ? s.slice(0, 47) + "…" : s;
};

type AjvError = { instancePath: string; schemaPath: string; keyword: string; params: Record<string, unknown>; message?: string; data?: unknown };

function humanError(e: AjvError): string {
  const p = e.params;
  switch (e.keyword) {
    case "required": return `Missing required property "${p.missingProperty}"`;
    case "type": return `Expected ${p.type}, got ${typeName(e.data)} ${short(e.data)}`;
    case "format": return `${short(e.data)} is not a valid ${p.format}`;
    case "enum": return `${short(e.data)} is not one of ${(p.allowedValues as unknown[]).map(short).join(", ")}`;
    case "const": return `Must be ${short(p.allowedValue)}, got ${short(e.data)}`;
    case "additionalProperties": return `Unexpected property "${p.additionalProperty}" — the schema does not allow extra properties`;
    case "unevaluatedProperties": return `Unexpected property "${p.unevaluatedProperty}" (unevaluatedProperties is false)`;
    case "minItems": return `Needs at least ${p.limit} item${p.limit === 1 ? "" : "s"}, has ${(e.data as unknown[])?.length ?? 0}`;
    case "maxItems": return `Allows at most ${p.limit} items, has ${(e.data as unknown[])?.length ?? 0}`;
    case "minLength": return `Must be at least ${p.limit} characters, ${short(e.data)} has ${[...String(e.data)].length}`;
    case "maxLength": return `Must be at most ${p.limit} characters, ${short(e.data)} has ${[...String(e.data)].length}`;
    case "minimum": case "maximum": case "exclusiveMinimum": case "exclusiveMaximum": return `Must be ${p.comparison} ${p.limit}, got ${short(e.data)}`;
    case "multipleOf": return `Must be a multiple of ${p.multipleOf}, got ${short(e.data)}`;
    case "pattern": return `${short(e.data)} does not match the pattern ${p.pattern}`;
    case "uniqueItems": return `Items ${p.j} and ${p.i} are identical — items must be unique`;
    case "oneOf": return p.passingSchemas ? `Matches more than one oneOf alternative (#${(p.passingSchemas as number[]).join(" and #")}) — exactly one is allowed` : "Matches none of the oneOf alternatives";
    case "anyOf": return "Matches none of the anyOf alternatives";
    case "not": return "Must NOT match the schema in \"not\"";
    case "if": return `Fails the "${p.failingKeyword}" branch of if/then/else`;
    case "dependentRequired": case "dependencies": return `"${p.property}" requires "${p.missingProperty}" to be present too`;
    case "propertyNames": return `Property name "${p.propertyName}" is not allowed`;
    case "contains": return `Must contain at least ${p.minContains ?? 1} matching item${(p.minContains ?? 1) === 1 ? "" : "s"}`;
    case "minProperties": return `Needs at least ${p.limit} properties`;
    case "maxProperties": return `Allows at most ${p.limit} properties`;
    case "false schema": return "No value is allowed here (schema is false)";
  }
  return e.message ?? e.keyword;
}

const DRAFT_URI: Record<string, string> = {
  "07": "http://json-schema.org/draft-07/schema",
  "2019-09": "https://json-schema.org/draft/2019-09/schema",
  "2020-12": "https://json-schema.org/draft/2020-12/schema",
};

function detectDraft(s: unknown): { draft: string; declared?: string } {
  const decl = s && typeof s === "object" ? (s as Record<string, unknown>).$schema : undefined;
  if (typeof decl !== "string") return { draft: "2020-12" };
  if (decl.includes("2020-12")) return { draft: "2020-12", declared: decl };
  if (decl.includes("2019-09")) return { draft: "2019-09", declared: decl };
  if (/draft-0[67]/.test(decl)) return { draft: "07", declared: decl };
  if (/draft-0[34]/.test(decl)) return { draft: "07", declared: decl };
  return { draft: "2020-12", declared: decl };
}

/* examples reused from the converters (kept local so this module stays independent) */
const COMPOSE_YAML_V = `x-defaults: &defaults
  restart: unless-stopped
  logging:
    driver: json-file
x-unused: &legacy
  restart: always

services:
  web:
    <<: *defaults
    image: nginx:1.27
    ports:
      - "8080:80"
  api:
    <<: *defaults
    image: registry.example.com/api:2.4.1
    environment:
      RETRIES: 3
`;

const CATALOG_XML_V = `<?xml version="1.0" encoding="UTF-8"?>
<catalog xmlns:dc="http://purl.org/dc/elements/1.1/" updated="2026-09-01">
  <!-- Two books -->
  <book id="bk101" available="true">
    <dc:title>XML Developer&apos;s Guide</dc:title>
    <price currency="USD">44.95</price>
  </book>
  <book id="bk102" available="false">
    <dc:title>Midnight Rain</dc:title>
    <price currency="EUR">5.95</price>
    <summary><![CDATA[Tips & tricks for <offline> apps]]></summary>
  </book>
</catalog>`;

/* ── CSV helpers ─────────────────────────────────────────────────────── */

const DELIMS: [string, string][] = [["auto", "Auto-detect"], [",", "Comma"], [";", "Semicolon"], ["tab", "Tab"], ["|", "Pipe"]];

const specs: SpecModule = {
  "json-schema-validator": {
    inputs: [
      { id: "data", label: "JSON data", lang: "json" },
      { id: "schema", label: "JSON Schema", lang: "json", rows: 12 },
    ],
    options: [
      { id: "draft", label: "Draft", type: "select", choices: [["auto", "From $schema"], ["2020-12", "2020-12"], ["2019-09", "2019-09"], ["07", "Draft 07"]], default: "auto" },
      { id: "allErrors", label: "All errors", type: "toggle", default: true, hint: "Off: stop at the first error" },
      { id: "strict", label: "Strict schema", type: "toggle", default: false, hint: "Reject unknown keywords and ambiguous schemas (Ajv strict mode)" },
      { id: "formats", label: "Check formats", type: "toggle", default: true, hint: "email, date, uri, uuid, ipv4 … via ajv-formats" },
      { id: "coerce", label: "Coerce types", type: "toggle", default: false, hint: "\"42\" satisfies integer, \"true\" boolean — see Coerced data" },
      { id: "defaults", label: "Apply defaults", type: "toggle", default: false },
    ],
    async run({ inputs, opts }) {
      if (!inputs.data.trim()) throw new ToolError("Paste the JSON data to validate.");
      if (!inputs.schema.trim()) throw new ToolError("Paste a JSON Schema in the second editor.");
      let data: unknown, schema: unknown;
      try { data = readJson(inputs.data, true); } catch (e) { throw new ToolError(`JSON data: ${(e as Error).message}`); }
      try { schema = readJson(inputs.schema, true); } catch (e) { throw new ToolError(`JSON Schema: ${(e as Error).message}`); }
      if (typeof schema !== "boolean" && (!schema || typeof schema !== "object" || Array.isArray(schema))) throw new ToolError("The schema must be a JSON object (or true / false).");
      const notes: string[] = [];
      const detected = detectDraft(schema);
      const draft = str(opts.draft) === "auto" ? detected.draft : str(opts.draft);
      let sch = schema as Record<string, unknown>;
      if (typeof schema === "object" && detected.declared && (str(opts.draft) !== "auto" ? !detected.declared.includes(draft === "07" ? "draft-07" : draft) : /draft-0[346]/.test(detected.declared))) {
        const { $schema: _drop, ...rest } = sch;
        sch = rest;
        notes.push(`The schema declares ${detected.declared}; validated with the draft ${draft} rules.`);
      }
      const mod = draft === "2020-12" ? await import("ajv/dist/2020") : draft === "2019-09" ? await import("ajv/dist/2019") : await import("ajv");
      const AjvClass = (mod as unknown as { default: new (o: object) => unknown }).default;
      const ajv = new AjvClass({ allErrors: bool(opts.allErrors), strict: bool(opts.strict), coerceTypes: bool(opts.coerce), useDefaults: bool(opts.defaults), verbose: true, validateFormats: bool(opts.formats) }) as {
        compile: (s: unknown) => ((d: unknown) => boolean) & { errors?: AjvError[] | null };
      };
      if (bool(opts.formats)) {
        const addFormats = (await import("ajv-formats")).default as unknown as (a: unknown) => void;
        addFormats(ajv);
      }
      let validate: ReturnType<typeof ajv.compile>;
      try {
        validate = ajv.compile(sch);
      } catch (e) {
        throw new ToolError(`Schema error: ${(e as Error).message}`);
      }
      const working = JSON.parse(JSON.stringify(data));
      const ok = validate(working);
      const errors = validate.errors ?? [];
      const { locatePointers } = await import("./lib/B-jsonloc");
      const locs = locatePointers(inputs.data);
      const items: Issue[] = errors.map((e) => {
        let ptr = e.instancePath;
        let useKey = false;
        if (e.keyword === "additionalProperties") { ptr = `${ptr}/${String(e.params.additionalProperty).replace(/~/g, "~0").replace(/\//g, "~1")}`; useKey = true; }
        if (e.keyword === "unevaluatedProperties") { ptr = `${ptr}/${String(e.params.unevaluatedProperty)}`; useKey = true; }
        const loc = locs.get(ptr) ?? locs.get(e.instancePath);
        const line = useKey ? loc?.keyLine ?? loc?.line : loc?.line;
        const col = useKey ? loc?.keyCol ?? loc?.col : loc?.col;
        return { level: "error" as const, message: `${e.instancePath || "(root)"} — ${humanError(e)}  [${e.keyword}]`, line, col };
      });
      items.sort(byLine);
      const s = jsonStats(data);
      const label = `draft ${draft}`;
      const detail = ok
        ? `${Array.isArray(data) ? `Array of ${(data as unknown[]).length}` : typeName(data)} · ${s.keys} keys · depth ${s.maxDepth} · validated with ${label}`
        : `${plural(errors.length, "error")}${bool(opts.allErrors) ? "" : " (stopped at the first — turn on All errors)"} · ${label}`;
      const text = ok ? `✓ Valid — the data matches the schema (${label})` : `✗ Invalid — ${plural(errors.length, "error")}\n${issueLines(items)}`;
      const views: View[] = [
        { label: "Result", out: { kind: "status", ok, title: ok ? "Valid" : "Invalid", detail } },
        { label: `Issues (${items.length})`, out: { kind: "issues", items: ok ? [{ level: "ok", message: "The data matches the schema." }] : items } },
      ];
      if (!ok)
        views.push({
          label: "Errors",
          out: { kind: "table", columns: ["line", "instancePath", "keyword", "message", "schemaPath"], rows: errors.map((e, i) => [items.find((it) => it.message.startsWith(`${e.instancePath || "(root)"} — ${humanError(e)}`))?.line ?? null, e.instancePath || "/", e.keyword, humanError(e), e.schemaPath]) },
        });
      if (bool(opts.coerce) || bool(opts.defaults)) {
        const changed = JSON.stringify(working) !== JSON.stringify(data);
        views.push({ label: "Coerced data", out: { kind: "text", text: JSON.stringify(working, null, 2), lang: "json" } });
        if (changed) notes.push(`${bool(opts.coerce) ? "Coercion" : "Defaults"} changed the data — see Coerced data.`);
      }
      views.push({ label: "Ajv errors", out: { kind: "text", text: JSON.stringify(errors.map(({ data: _d, ...rest }) => rest), null, 2), lang: "json" } });
      return { text, views, notes };
    },
    examples: [
      { label: "Valid person", inputs: { data: '{\n  "id": 42,\n  "name": "Ada Lovelace",\n  "email": "ada@example.com",\n  "born": "1815-12-10",\n  "website": "https://example.com/ada",\n  "role": "admin",\n  "tags": ["math", "poetry"]\n}', schema: PERSON_SCHEMA }, note: "Draft 2020-12 is picked from $schema; formats are checked with ajv-formats." },
      { label: "Many problems", inputs: { data: '{\n  "id": "42",\n  "name": "A",\n  "email": "ada-at-example.com",\n  "born": "1815-13-40",\n  "role": "owner",\n  "tags": [],\n  "nickname": "Countess"\n}', schema: PERSON_SCHEMA }, error: true, note: "Wrong type, too short, bad email and date formats, enum, minItems and an extra property — each on its own line." },
      { label: "Missing required", inputs: { data: '{\n  "id": 7,\n  "name": "Grace Hopper"\n}', schema: PERSON_SCHEMA }, error: true, note: "required lists the property that is absent." },
      { label: "$ref / $defs", inputs: { data: '{\n  "id": "ORD-12",\n  "items": [\n    {"sku": "KB-01", "qty": 1, "price": 49.5},\n    {"sku": "MS-02", "qty": 0}\n  ],\n  "shipping": {"street": "1 Main St", "city": "London", "country": "GBR"}\n}', schema: ORDER_SCHEMA }, error: true, note: "Errors inside referenced definitions report the data path (/items/1/qty) and the line." },
      { label: "if / then / else", inputs: { data: '{\n  "method": "card",\n  "amount": 19.999,\n  "expiry": "13/27"\n}', schema: PAYMENT_SCHEMA }, error: true, note: "method = card switches on the then branch: cardNumber is required and expiry must look like MM/YY." },
      { label: "oneOf", inputs: { data: '[\n  {"kind": "circle", "radius": 2},\n  {"kind": "rect", "width": 3, "height": 4},\n  {"radius": 1, "width": 2, "height": 2}\n]', schema: SHAPE_SCHEMA }, error: true, note: "Draft-07 definitions; the third shape matches both alternatives, and oneOf allows exactly one." },
      { label: "Coerce & defaults", inputs: { data: '{"port": "8080", "debug": "false"}', schema: '{\n  "type": "object",\n  "properties": {\n    "port": {"type": "integer"},\n    "debug": {"type": "boolean"},\n    "host": {"type": "string", "default": "localhost"}\n  }\n}' }, opts: { coerce: true, defaults: true }, note: "Strings are coerced to integer and boolean, and the missing host gets its default — see Coerced data." },
      { label: "Strict mode", inputs: { data: '{"a": 1}', schema: '{"type": "object", "properties": {"a": {"type": "integer", "minimun": 0}}}' }, opts: { strict: true }, error: true, note: "Strict mode catches the misspelled keyword \"minimun\" that would otherwise be silently ignored." },
    ],
    steps: ["Paste the JSON data on the left and the schema below it.", "Draft is read from $schema — or pick one.", "Every error shows the data path, a readable message and the line in your data."],
  },

  "csv-validator": {
    inputs: [{ id: "csv", label: "CSV", lang: "text" }],
    options: [
      { id: "delimiter", label: "Delimiter", type: "select", choices: DELIMS, default: "auto" },
      { id: "header", label: "Header row", type: "toggle", default: true },
      { id: "required", label: "Required columns", type: "text", default: "", placeholder: "id, email", width: 140, hint: "Comma list: these columns must exist and never be empty" },
      { id: "unique", label: "Unique columns", type: "text", default: "", placeholder: "id", width: 110, hint: "Comma list: values must not repeat" },
      { id: "types", label: "Type checks", type: "toggle", default: true, hint: "Infer each column's type and flag rows that don't fit" },
      { id: "whitespace", label: "Whitespace", type: "toggle", default: true, hint: "Flag leading/trailing spaces in cells" },
    ],
    async run({ inputs, opts }) {
      const src = inputs.csv.replace(/^﻿/, "");
      if (!src.trim()) throw new ToolError("Paste some CSV to validate.");
      const Papa = (await import("papaparse")).default;
      const { inferColumnKind, kindOfText, kindFits } = await import("./lib/B-tabular");
      const d = str(opts.delimiter, "auto");
      const rows: string[][] = [];
      const starts: number[] = [];
      const issues: Issue[] = [];
      let prev = 0;
      const lineStarts = [0];
      for (let i = 0; i < src.length; i++) if (src.charCodeAt(i) === 10) lineStarts.push(i + 1);
      const lineOf = (pos: number) => {
        let lo = 0, hi = lineStarts.length - 1;
        while (lo < hi) { const m = (lo + hi + 1) >> 1; if (lineStarts[m] <= pos) lo = m; else hi = m - 1; }
        return lo + 1;
      };
      let delimiter = "";
      Papa.parse<string[]>(src, {
        delimiter: d === "auto" ? "" : d === "tab" ? "\t" : d,
        skipEmptyLines: false,
        step(r) {
          const start = prev;
          prev = r.meta.cursor;
          delimiter = r.meta.delimiter;
          rows.push(r.data);
          starts.push(start);
          for (const e of r.errors) {
            if (e.code === "UndetectableDelimiter") continue;
            const msg = e.code === "MissingQuotes" ? "Unclosed quote — the field never ends, so the rest of the file is swallowed" : e.code === "InvalidQuotes" ? "Stray quote: text follows a closing quote (escape inner quotes as \"\")" : e.message;
            issues.push({ level: "error", message: msg, line: lineOf(typeof e.index === "number" ? e.index : start) });
          }
        },
      });
      // A trailing newline produces one empty row.
      if (rows.length && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === "" && /\n$/.test(src)) { rows.pop(); starts.pop(); }
      const lineOfRow = (i: number) => lineOf(starts[i] ?? 0);
      const blank = (r: string[]) => r.length === 1 && r[0].trim() === "";
      const blanks = rows.map((r, i) => (blank(r) ? i : -1)).filter((i) => i >= 0);
      for (const i of blanks.slice(0, 10)) issues.push({ level: "warning", message: "Blank row", line: lineOfRow(i) });
      if (blanks.length > 10) issues.push({ level: "warning", message: `…and ${blanks.length - 10} more blank rows` });
      const hasHeader = bool(opts.header);
      const firstIdx = rows.findIndex((r) => !blank(r));
      if (firstIdx < 0) throw new ToolError("The CSV has no data rows.");
      const header = hasHeader ? rows[firstIdx] : [];
      const width = hasHeader ? header.length : rows[firstIdx].length;
      const names = hasHeader ? header.map((h, i) => h.trim() || `column ${i + 1}`) : Array.from({ length: width }, (_, i) => `column ${i + 1}`);
      if (hasHeader) {
        const seen = new Map<string, number>();
        header.forEach((h, i) => {
          if (!h.trim()) issues.push({ level: "error", message: `Header ${i + 1} is empty`, line: lineOfRow(firstIdx) });
          else if (h !== h.trim()) issues.push({ level: "warning", message: `Header "${h}" has leading/trailing spaces`, line: lineOfRow(firstIdx) });
          const k = h.trim().toLowerCase();
          if (k && seen.has(k)) issues.push({ level: "error", message: `Duplicate header "${h.trim()}" (columns ${seen.get(k)! + 1} and ${i + 1})`, line: lineOfRow(firstIdx) });
          if (k) seen.set(k, i);
        });
      }
      const dataIdx = rows.map((_, i) => i).filter((i) => !blank(rows[i]) && !(hasHeader && i === firstIdx));
      let ragged = 0;
      for (const i of dataIdx) {
        if (rows[i].length !== width) {
          ragged++;
          if (ragged <= 25) issues.push({ level: "error", message: `Expected ${width} fields, found ${rows[i].length}${rows[i].length > width ? ` (extra: ${JSON.stringify(rows[i].slice(width).join(delimiter)).slice(0, 40)})` : ""}`, line: lineOfRow(i) });
        }
      }
      if (ragged > 25) issues.push({ level: "error", message: `…and ${ragged - 25} more rows with the wrong number of fields` });
      if (bool(opts.whitespace)) {
        let ws = 0;
        for (const i of dataIdx) rows[i].forEach((c, j) => {
          if (c !== c.trim() && c.trim()) { ws++; if (ws <= 10) issues.push({ level: "warning", message: `Leading/trailing whitespace in ${names[j] ?? `column ${j + 1}`}: ${JSON.stringify(c)}`, line: lineOfRow(i) }); }
        });
        if (ws > 10) issues.push({ level: "warning", message: `…and ${ws - 10} more cells with surrounding whitespace` });
      }
      const colOf = (name: string) => names.findIndex((n) => n.toLowerCase() === name.toLowerCase());
      const list = (s: unknown) => str(s).split(",").map((x) => x.trim()).filter(Boolean);
      for (const rc of list(opts.required)) {
        const c = colOf(rc);
        if (c < 0) { issues.push({ level: "error", message: `Required column "${rc}" is missing${hasHeader ? "" : " (turn on Header row to check names)"}` }); continue; }
        const empty = dataIdx.filter((i) => !(rows[i][c] ?? "").trim());
        empty.slice(0, 10).forEach((i) => issues.push({ level: "error", message: `Required column "${names[c]}" is empty`, line: lineOfRow(i) }));
        if (empty.length > 10) issues.push({ level: "error", message: `…"${names[c]}" is empty in ${empty.length - 10} more rows` });
      }
      for (const uc of list(opts.unique)) {
        const c = colOf(uc);
        if (c < 0) { issues.push({ level: "error", message: `Unique column "${uc}" is missing` }); continue; }
        const seen = new Map<string, number[]>();
        for (const i of dataIdx) { const v = (rows[i][c] ?? "").trim(); if (!v) continue; seen.set(v, [...(seen.get(v) ?? []), i]); }
        let shown = 0;
        for (const [v, idx] of seen) if (idx.length > 1 && shown++ < 10) issues.push({ level: "error", message: `"${names[c]}" value ${JSON.stringify(v)} appears ${idx.length} times (lines ${idx.map(lineOfRow).join(", ")})`, line: lineOfRow(idx[1]) });
      }
      const profile: (string | number)[][] = [];
      for (let c = 0; c < width; c++) {
        const vals = dataIdx.map((i) => rows[i][c] ?? "");
        const { kind, counts } = inferColumnKind(vals);
        let bad = 0;
        if (bool(opts.types) && kind !== "text" && kind !== "empty") {
          dataIdx.forEach((i) => {
            const v = rows[i][c] ?? "";
            const k = kindOfText(v);
            if (!kindFits(k, kind)) { bad++; if (bad <= 5) issues.push({ level: "warning", message: `${names[c]}: ${JSON.stringify(v)} is not ${kind === "integer" ? "an integer" : `a${/^[aeiou]/.test(kind) ? "n" : ""} ${kind}`} like the rest of the column`, line: lineOfRow(i) }); }
          });
          if (bad > 5) issues.push({ level: "warning", message: `${names[c]}: ${bad - 5} more values don't match ${kind}` });
        }
        const nonEmpty = vals.filter((v) => v.trim()).length;
        profile.push([names[c], kind, nonEmpty, vals.length - nonEmpty, new Set(vals.filter((v) => v.trim())).size, bad, Object.entries(counts).filter(([k]) => k !== "empty").map(([k, n]) => `${k} ${n}`).join(", ")]);
      }
      issues.sort(byLine);
      const seenIssue = new Set<string>();
      for (let k = issues.length - 1; k >= 0; k--) {
        const key = `${issues[k].line}|${issues[k].message}`;
        if (seenIssue.has(key)) issues.splice(k, 1);
        seenIssue.add(key);
      }
      const errors = countOf(issues, "error"), warnings = countOf(issues, "warning");
      const ok = errors === 0;
      const delimName = delimiter === "\t" ? "Tab" : delimiter === "," ? "comma" : delimiter === ";" ? "semicolon" : delimiter === "|" ? "pipe" : JSON.stringify(delimiter);
      const title = ok ? (warnings ? "Valid CSV, with warnings" : "Valid CSV") : "Invalid CSV";
      const summary = `${dataIdx.length} rows × ${width} columns · ${delimName}-delimited${d === "auto" ? " (detected)" : ""}`;
      const text = `${ok ? "✓" : "✗"} ${title} — ${summary}${errors || warnings ? ` · ${plural(errors, "error")}, ${plural(warnings, "warning")}` : ""}${issues.length ? "\n" + issueLines(issues) : ""}`;
      const preview = dataIdx.slice(0, 1000).map((i) => [lineOfRow(i), ...Array.from({ length: Math.max(width, rows[i].length) }, (_, j) => rows[i][j] ?? null)]);
      const maxW = Math.max(width, ...dataIdx.map((i) => rows[i].length));
      return {
        text,
        views: [
          { label: "Result", out: { kind: "status", ok, title, detail: summary } },
          { label: `Issues (${issues.length})`, out: { kind: "issues", items: issues.length ? issues : [{ level: "ok", message: "No problems found." }] } },
          { label: "Columns", out: { kind: "table", columns: ["column", "type", "filled", "empty", "distinct", "type mismatches", "value kinds"], rows: profile } },
          {
            label: "Stats",
            out: {
              kind: "stats",
              items: [
                { label: "Rows", value: dataIdx.length },
                { label: "Columns", value: width },
                { label: "Delimiter", value: delimName, tone: "info" },
                { label: "Errors", value: errors, tone: errors ? "bad" : "ok" },
                { label: "Warnings", value: warnings, tone: warnings ? "warn" : "ok" },
                { label: "Blank rows", value: blanks.length, tone: blanks.length ? "warn" : "ok" },
                { label: "Ragged rows", value: ragged, tone: ragged ? "bad" : "ok" },
                { label: "Bytes", value: utf8Len(src) },
              ],
            },
          },
          { label: "Table", out: { kind: "table", columns: ["line", ...Array.from({ length: maxW }, (_, j) => names[j] ?? `extra ${j - width + 1}`)], rows: preview, caption: dataIdx.length > 1000 ? "first 1000 rows" : undefined } },
        ],
      };
    },
    examples: [
      { label: "Clean file", inputs: { csv: 'id,name,email,signup_date,plan,seats\n1,Ada Lovelace,ada@example.com,2026-01-04,pro,5\n2,"Hopper, Grace",grace@example.com,2026-02-11,team,12\n3,Alan Turing,alan@example.com,2026-02-28,free,1\n4,"Katherine ""Kay"" Johnson",kay@example.com,2026-03-09,pro,3' }, opts: { required: "id, email", unique: "id, email" }, note: "Quoted commas and doubled quotes are fine; the Columns tab shows each column's inferred type." },
      { label: "Ragged rows", inputs: { csv: "sku,name,price,qty\nKB-01,Keyboard,49.50,10\nMS-02,Mouse,19.99\nMN-27,Monitor, 27 inch,229.00,3\nCB-10,Cable,4.99,100" }, error: true, note: "A missing field and an unquoted comma both change the field count — each is reported with its line." },
      { label: "Types & uniqueness", inputs: { csv: "order_id,customer,total,placed_at,paid\n1001,ada@example.com,42.50,2026-03-14,true\n1002,grace@example.com,18.00,2026-03-15,false\n1002,alan@example.com,n/a,2026-03-16,yes\n1004,linus@example.com,99.99,16/03/2026,true\n1005, kay@example.com ,7.25,2026-03-18,false" }, opts: { unique: "order_id" }, error: true, note: "Duplicate order_id, a non-numeric total, a date in the wrong format, a non-boolean and stray spaces." },
      { label: "Header problems", inputs: { csv: "id,Name,,name,email \n1,Ada,x,ada,ada@example.com\n\n2,Alan,y,alan,alan@example.com\n" }, error: true, note: "An empty header, a case-insensitive duplicate, a header with a trailing space and a blank row." },
      { label: "Unbalanced quotes", inputs: { csv: 'id,comment\n1,"fine"\n2,"broken "quote" here"\n3,"never closed\n4,ok' }, error: true, note: "A stray quote inside a quoted field and a quote that is never closed." },
      { label: "Semicolon + required", inputs: { csv: "kunde;email;stadt\nMüller;mueller@example.de;Berlin\nSchmidt;;Hamburg\nWeber;weber@example.de;" }, opts: { required: "kunde,email,stadt" }, error: true, note: "The ; delimiter is detected; empty required cells are errors." },
    ],
  },

  "yaml-validator": {
    inputs: [{ id: "yaml", label: "YAML", lang: "yaml" }],
    options: [
      { id: "gotchas", label: "YAML 1.1 gotchas", type: "toggle", default: true, hint: "yes/no/on/off, 0755, 1:30, 1.10 — values other parsers read differently" },
      { id: "style", label: "Style checks", type: "toggle", default: true, hint: "Trailing spaces, long lines, inconsistent indentation" },
      { id: "maxLen", label: "Max line length", type: "number", default: 120, min: 40, max: 400, show: (o) => !!o.style },
    ],
    async run({ inputs, opts }) {
      const src = inputs.yaml;
      if (!src.trim()) throw new ToolError("Paste some YAML to validate.");
      const yaml = (await import("js-yaml")).default;
      const { lintYaml } = await import("./lib/B-yamllint");
      const lint = lintYaml(src, { maxLen: num(opts.maxLen, 120), style: bool(opts.style), gotchas: bool(opts.gotchas) });
      const issues: Issue[] = [...lint.issues];
      let docs: unknown[] = [];
      let parseError: { reason: string; line: number; col: number } | null = null;
      try {
        docs = yaml.loadAll(src);
      } catch (e) {
        const y = e as { name?: string; reason?: string; mark?: { line: number; column: number } };
        const err = { reason: y.reason ?? (e as Error).message, line: (y.mark?.line ?? 0) + 1, col: (y.mark?.column ?? 0) + 1 };
        if (/duplicated mapping key/.test(err.reason)) {
          // Duplicates are reported as warnings; parse again letting the last value win.
          if (!issues.some((i) => i.line === err.line && /Duplicate key/.test(i.message))) issues.push({ level: "warning", message: "Duplicate key — most parsers keep only the last value", line: err.line, col: err.col });
          try {
            docs = yaml.loadAll(src, undefined, { json: true });
          } catch (e2) {
            const y2 = e2 as { reason?: string; mark?: { line: number; column: number } };
            parseError = { reason: y2.reason ?? String(e2), line: (y2.mark?.line ?? 0) + 1, col: (y2.mark?.column ?? 0) + 1 };
          }
        } else parseError = err;
      }
      if (parseError) {
        // Drop lint findings the parse error makes redundant (e.g. undefined aliases after the error).
        const kept = issues.filter((i) => i.level !== "error" || (i.line ?? 0) < parseError!.line);
        kept.push({ level: "error", message: parseError.reason.replace(/^./, (c) => c.toUpperCase()), line: parseError.line, col: parseError.col });
        kept.sort(byLine);
        const detail = `${parseError.reason}\nLine ${parseError.line}, column ${parseError.col}\n\n${caret(src, parseError)}`;
        return {
          text: `✗ Invalid YAML: ${parseError.reason} (line ${parseError.line}, column ${parseError.col})\n${caret(src, parseError)}`,
          views: [
            { label: "Result", out: { kind: "status", ok: false, title: "Invalid YAML", detail } },
            { label: `Issues (${kept.length})`, out: { kind: "issues", items: kept } },
          ],
        };
      }
      if (docs.length > 1 && docs[docs.length - 1] === null && /---\s*$/.test(src.trimEnd())) docs.pop();
      issues.sort(byLine);
      const errors = countOf(issues, "error"), warnings = countOf(issues, "warning");
      const ok = errors === 0;
      const value = docs.length === 1 ? docs[0] : docs;
      const json = JSON.stringify(value, null, 2) ?? "null";
      const title = !ok ? "Invalid YAML" : warnings ? "Valid YAML, with warnings" : "Valid YAML";
      const detail = `${plural(docs.length, "document")} · ${src.split("\n").length} lines${lint.anchors.length ? ` · ${plural(lint.anchors.length, "anchor")}, ${lint.aliases} alias${lint.aliases === 1 ? "" : "es"}` : ""}`;
      const s = jsonStats(value);
      return {
        text: `${ok ? "✓" : "✗"} ${title} — ${detail}${issues.length ? "\n" + issueLines(issues) : ""}`,
        views: [
          { label: "Result", out: { kind: "status", ok, title, detail } },
          { label: `Issues (${issues.length})`, out: { kind: "issues", items: issues.length ? issues : [{ level: "ok", message: "No problems found." }] } },
          { label: "JSON", out: { kind: "text", text: json, lang: "json" } },
          { label: "Tree", out: { kind: "tree", value } },
          {
            label: "Stats",
            out: {
              kind: "stats",
              items: [
                { label: "Documents", value: docs.length, tone: "info" },
                { label: "Errors", value: errors, tone: errors ? "bad" : "ok" },
                { label: "Warnings", value: warnings, tone: warnings ? "warn" : "ok" },
                { label: "Anchors", value: lint.anchors.length },
                { label: "Aliases", value: lint.aliases },
                { label: "Max depth", value: s.maxDepth },
                { label: "Keys", value: s.keys },
                { label: "Lines", value: src.split("\n").length },
              ],
            },
          },
        ],
      };
    },
    examples: [
      { label: "GitHub Actions", inputs: { yaml: 'name: CI\non:\n  push:\n    branches: [main]\n  pull_request:\n\njobs:\n  test:\n    runs-on: ubuntu-latest\n    strategy:\n      matrix:\n        node: [18, 20, 22]\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: ${{ matrix.node }}\n      - run: npm ci\n      - run: npm test\n' }, note: "Valid — but the key \"on\" is flagged: YAML 1.1 tools read it as the boolean true." },
      { label: "YAML 1.1 gotchas", inputs: { yaml: "country: NO\nenabled: yes\nfile_mode: 0755\nport_mapping: 22:22\npython: 3.10\nversion: \"3.10\"\nzip: 02134\n" }, note: "The Norway problem, octal-looking numbers, base-60 22:22 and 3.10 turning into 3.1." },
      { label: "Anchors & merge keys", inputs: { yaml: COMPOSE_YAML_V }, note: "&defaults is reused by two aliases through << merge keys; an unused anchor is flagged." },
      { label: "Duplicate keys & style", inputs: { yaml: "server:\n  host: localhost\n  port: 8080\n  host: 0.0.0.0   \nlogging:\n    level: info\n    format: json\nfeatures:\n  - search\n  - export\n" }, note: "host is defined twice, there is trailing whitespace, and logging is indented by 4 where the rest uses 2." },
      { label: "Multi-document", inputs: { yaml: "---\nkind: ConfigMap\nmetadata: {name: app}\n---\nkind: Secret\nmetadata: {name: app}\ntype: Opaque\n...\n" } },
      { label: "Bad indentation", inputs: { yaml: "services:\n  web:\n    image: nginx\n   ports:\n      - 80:80\n" }, error: true, note: "The parse error shows line, column and a caret." },
      { label: "Tab indentation", inputs: { yaml: "root:\n\tchild: value\n" }, error: true, note: "YAML forbids tabs for indentation." },
    ],
  },

  "xml-validator": {
    inputs: [{ id: "xml", label: "XML", lang: "xml" }],
    options: [
      { id: "boolAttrs", label: "Allow valueless attributes", type: "toggle", default: false, hint: "HTML-style <input disabled> (not valid XML)" },
      { id: "requireDecl", label: "Require <?xml?> declaration", type: "toggle", default: false },
    ],
    async run({ inputs, opts }) {
      const src = inputs.xml;
      if (!src.trim()) throw new ToolError("Paste some XML to validate.");
      const { XMLValidator } = await import("fast-xml-parser");
      const { scanXml } = await import("./lib/B-xml");
      const r = XMLValidator.validate(src, { allowBooleanAttributes: bool(opts.boolAttrs) });
      const invalid = (msg: string, line: number, col: number, extra: Issue[] = []) => {
        const detail = `${msg}\nLine ${line}, column ${col}\n\n${caret(src, { line, col })}`;
        const items = [...extra, { level: "error" as const, message: msg, line, col }].sort(byLine);
        return {
          text: `✗ Not well-formed: ${msg} (line ${line}, column ${col})\n${caret(src, { line, col })}`,
          views: [
            { label: "Result", out: { kind: "status" as const, ok: false, title: "Not well-formed", detail } },
            { label: `Issues (${items.length})`, out: { kind: "issues" as const, items } },
          ],
        };
      };
      if (r !== true) return invalid(r.err.msg, r.err.line, r.err.col);
      const scan = scanXml(src);
      const issues: Issue[] = scan.issues.map((i) => ({ ...i }));
      if (bool(opts.requireDecl) && !scan.decl) {
        const k = issues.findIndex((i) => /No XML declaration/.test(i.message));
        if (k >= 0) issues[k] = { level: "error", message: "Missing <?xml version=\"1.0\" encoding=\"UTF-8\"?> declaration", line: 1 };
      }
      if (scan.doctype) issues.push({ level: "info", message: `DOCTYPE present${/<!ENTITY/.test(scan.doctype) ? " with entity declarations — beware of entity-expansion (XXE / billion laughs) when parsing untrusted XML" : ""}`, line: 1 });
      // In a real browser, cross-check with the native XML parser.
      if (!isNode && typeof DOMParser !== "undefined" && !issues.some((i) => i.level === "error")) {
        const doc = new DOMParser().parseFromString(src, "application/xml");
        const pe = doc.getElementsByTagName("parsererror")[0];
        if (pe) {
          const text = (pe.textContent ?? "").replace(/\s+/g, " ").trim();
          const m = /line (?:number )?(\d+)(?:,? (?:at )?column (\d+))?/i.exec(text);
          issues.push({ level: "error", message: `Browser XML parser: ${text.replace(/^This page contains the following errors:\s*/i, "").replace(/Below is a rendering.*$/i, "").slice(0, 200)}`, line: m ? Number(m[1]) : undefined, col: m?.[2] ? Number(m[2]) : undefined });
        }
      }
      issues.sort(byLine);
      const errors = countOf(issues, "error"), warnings = countOf(issues, "warning");
      if (errors) {
        const first = issues.find((i) => i.level === "error")!;
        const res = invalid(first.message, first.line ?? 1, first.col ?? 1, issues.filter((i) => i !== first));
        res.views[0].out = { kind: "status", ok: false, title: "Not valid XML", detail: `${plural(errors, "error")} — first: ${first.message}${first.line ? `\nLine ${first.line}${first.col ? `, column ${first.col}` : ""}\n\n${caret(src, { line: first.line, col: first.col ?? 1 })}` : ""}` };
        res.text = `✗ Not valid XML — ${plural(errors, "error")}\n${issueLines(issues)}`;
        return res;
      }
      const st = scan.stats;
      const title = warnings ? "Well-formed XML, with warnings" : "Well-formed XML";
      const root = /<([^\s/>!?]+)/.exec(src.replace(/<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>[]*(\[[\s\S]*?\])?\s*>/gi, ""))?.[1] ?? "?";
      const detail = `Root <${root}> · ${plural(st.elements, "element")} · depth ${st.depth}${st.namespaces.length ? ` · ${plural(st.namespaces.length, "namespace")}` : ""}${scan.decl?.encoding ? ` · ${scan.decl.encoding}` : ""}`;
      const views: View[] = [
        { label: "Result", out: { kind: "status", ok: true, title, detail } },
        { label: `Issues (${issues.length})`, out: { kind: "issues", items: issues.length ? issues : [{ level: "ok", message: "No problems found." }] } },
        { label: "Tree", out: { kind: "xmltree", xml: src } },
        {
          label: "Stats",
          out: {
            kind: "stats",
            items: [
              { label: "Elements", value: st.elements, tone: "info" },
              { label: "Distinct names", value: st.names },
              { label: "Attributes", value: st.attributes },
              { label: "Max depth", value: st.depth },
              { label: "Namespaces", value: st.namespaces.length },
              { label: "Text nodes", value: st.text },
              { label: "Comments", value: st.comments },
              { label: "CDATA", value: st.cdata },
              { label: "Processing instr.", value: st.pis },
              { label: "Entity refs", value: st.entities },
              { label: "Bytes", value: utf8Len(src) },
            ],
          },
        },
      ];
      if (st.namespaces.length) views.push({ label: "Namespaces", out: { kind: "table", columns: ["#", "namespace URI"], rows: st.namespaces.map((u, i) => [i + 1, u]) } });
      return { text: `✓ ${title} — ${detail}${issues.length ? "\n" + issueLines(issues) : ""}`, views };
    },
    examples: [
      { label: "Catalog", inputs: { xml: CATALOG_XML_V }, note: "Well-formed, with a declared dc: namespace, CDATA and a comment — see Stats and Tree." },
      { label: "Mismatched tags", inputs: { xml: '<?xml version="1.0"?>\n<order id="7">\n  <item sku="KB-01">\n    <qty>1</qty>\n  </order>\n</item>' }, error: true, note: "The closing tags are crossed; the error points at the line and column." },
      { label: "Undeclared prefix", inputs: { xml: '<?xml version="1.0" encoding="UTF-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom">\n  <entry>\n    <title>Hello</title>\n    <media:thumbnail url="https://example.com/a.png"/>\n  </entry>\n</feed>' }, error: true, note: "media: is used without an xmlns:media declaration." },
      { label: "Duplicate attribute", inputs: { xml: '<user id="1" name="ada" id="2"/>' }, error: true },
      { label: "Undefined entities", inputs: { xml: "<menu>\n  <item>Fish &chips;</item>\n  <item>Caf&eacute; au lait</item>\n  <item>Tea &amp; cake &#169; 2026</item>\n</menu>" }, error: true, note: "XML knows only &amp; &lt; &gt; &quot; &apos; and numeric references — HTML names like &eacute; need a DTD." },
      { label: "Two roots", inputs: { xml: '<?xml version="1.0"?>\n<config env="prod"/>\n<config env="dev"/>' }, error: true, note: "A document has exactly one root element — wrap both in a parent." },
      { label: "SVG", inputs: { xml: '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 100">\n  <defs><circle id="dot" r="4"/></defs>\n  <use xlink:href="#dot" x="10" y="10"/>\n  <use xlink:href="#dot" x="30" y="10"/>\n  <text x="50" y="60">A &amp; B</text>\n</svg>' }, opts: { requireDecl: true }, error: true, note: "Well-formed with two namespaces, but Require declaration is on." },
      { label: "Declaration not first", inputs: { xml: '\n<?xml version="1.0"?>\n<a/>' }, error: true, note: "Even a blank line before <?xml … ?> is an error." },
    ],
  },
};

export default specs;
