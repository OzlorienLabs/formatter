/**
 * Mock Data: a schema of typed fields → N seeded rows → JSON / NDJSON / CSV /
 * TSV / SQL / XML / Markdown / YAML. Shared by the spec's run and the builder UI.
 */
import type { Faker } from "@faker-js/faker";
import { ToolError } from "../types";
import { TYPE_BY_KEY, type FieldArgs } from "./G-fake";
import { parseJson, JsonSyntaxError } from "./jsonparse";

export type MockField = FieldArgs & { name: string; type: string; nullable?: number; unique?: boolean };
export type Schema = { fields: MockField[] };

export function readSchema(src: string): Schema {
  if (!src.trim()) throw new ToolError("Add fields to the schema (or pick a preset from Examples).");
  let v: unknown;
  try {
    v = parseJson(src, { tolerant: true });
  } catch (e) {
    if (e instanceof JsonSyntaxError) throw new ToolError(`Schema JSON: ${e.issue.message} (line ${e.issue.line}, column ${e.issue.col})`);
    throw e;
  }
  const fields = Array.isArray(v) ? v : (v as Schema)?.fields;
  if (!Array.isArray(fields)) throw new ToolError('The schema must be {"fields": [{"name": "id", "type": "increment"}, …]} or an array of fields.');
  const seen = new Set<string>();
  fields.forEach((f: MockField, i) => {
    if (!f || typeof f !== "object") throw new ToolError(`Field ${i + 1} is not an object.`);
    if (!f.name || typeof f.name !== "string") throw new ToolError(`Field ${i + 1} has no "name".`);
    if (seen.has(f.name)) throw new ToolError(`Two fields are called "${f.name}" — names must be unique.`);
    seen.add(f.name);
    if (!TYPE_BY_KEY[f.type]) throw new ToolError(`Field "${f.name}": unknown type "${f.type}". Pick one from the type list (e.g. firstName, email, int, enum, pattern, formula).`);
  });
  return { fields: fields as MockField[] };
}

export function generateRows(schema: Schema, n: number, f: Faker, rnd: () => number): { rows: Record<string, unknown>[]; nulls: number } {
  const rows: Record<string, unknown>[] = [];
  const uniq = new Map<string, Set<string>>();
  let nulls = 0;
  for (let i = 0; i < n; i++) {
    const row: Record<string, unknown> = {};
    const byType: Record<string, unknown> = {};
    for (const fd of schema.fields) {
      const t = TYPE_BY_KEY[fd.type];
      const nullable = Number(fd.nullable) || 0;
      if (nullable > 0 && rnd() * 100 < nullable) {
        row[fd.name] = null;
        nulls++;
        continue;
      }
      let v: unknown;
      try {
        v = t.gen(f, fd, { index: i, row, rnd, byType });
        if (fd.unique) {
          let set = uniq.get(fd.name);
          if (!set) uniq.set(fd.name, (set = new Set()));
          let tries = 0;
          while (set.has(JSON.stringify(v))) {
            if (++tries > 200) throw new ToolError(`Field "${fd.name}" ran out of unique values after ${set.size.toLocaleString()} rows — widen its range, turn off Unique, or generate fewer rows.`);
            v = t.gen(f, fd, { index: i, row, rnd, byType });
          }
          set.add(JSON.stringify(v));
        }
      } catch (e) {
        if (e instanceof ToolError) throw e;
        throw new ToolError(`Field "${fd.name}" (${t.label}): ${(e as Error).message}`);
      }
      row[fd.name] = v;
      byType[fd.type] = v;
    }
    rows.push(row);
  }
  return { rows, nulls };
}

/* ── output formats ─────────────────────────────────────────────────── */

export const FORMATS: [string, string][] = [
  ["json", "JSON"],
  ["ndjson", "NDJSON"],
  ["csv", "CSV"],
  ["tsv", "TSV"],
  ["sql", "SQL INSERT"],
  ["xml", "XML"],
  ["markdown", "Markdown table"],
  ["yaml", "YAML"],
];

const csvCell = (v: unknown) => {
  if (v === null || v === undefined) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const tsvCell = (v: unknown) => (v === null || v === undefined ? "" : (typeof v === "object" ? JSON.stringify(v) : String(v)).replace(/[\t\n\r]/g, " "));
const xmlEsc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const xmlName = (s: string) => (/^[A-Za-z_][\w.-]*$/.test(s) ? s : "_" + s.replace(/[^\w.-]/g, "_"));

function sqlIdent(s: string, d: string) {
  if (d === "mysql") return "`" + s.replace(/`/g, "``") + "`";
  if (d === "mssql") return "[" + s.replace(/]/g, "]]") + "]";
  return '"' + s.replace(/"/g, '""') + '"';
}
function sqlVal(v: unknown, d: string): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "boolean") return d === "postgres" ? (v ? "TRUE" : "FALSE") : v ? "1" : "0";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  const body = s.replace(/'/g, "''");
  return d === "mysql" ? `'${body.replace(/\\/g, "\\\\")}'` : d === "mssql" && /[^\x00-\x7f]/.test(s) ? `N'${body}'` : `'${body}'`;
}

function sqlType(values: unknown[], d: string): string {
  const vs = values.filter((v) => v !== null && v !== undefined);
  if (!vs.length) return "TEXT";
  if (vs.every((v) => typeof v === "boolean")) return d === "postgres" ? "BOOLEAN" : d === "mssql" ? "BIT" : d === "sqlite" ? "INTEGER" : "TINYINT(1)";
  if (vs.every((v) => typeof v === "number" && Number.isInteger(v))) return Math.max(...vs.map((v) => Math.abs(v as number))) > 2147483647 ? "BIGINT" : "INTEGER";
  if (vs.every((v) => typeof v === "number")) return d === "sqlite" ? "REAL" : "DECIMAL(12,2)";
  if (vs.every((v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v))) return "DATE";
  if (vs.every((v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z?$/.test(v))) return d === "postgres" ? "TIMESTAMPTZ" : d === "mssql" ? "DATETIME2" : d === "sqlite" ? "TEXT" : "DATETIME";
  if (vs.every((v) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v))) return d === "postgres" ? "UUID" : d === "mssql" ? "UNIQUEIDENTIFIER" : "CHAR(36)";
  const max = Math.max(...vs.map((v) => String(v).length));
  if (d === "sqlite") return "TEXT";
  if (max > 255) return d === "mssql" ? "NVARCHAR(MAX)" : "TEXT";
  const len = max <= 16 ? 32 : max <= 50 ? 100 : 255;
  return d === "mssql" ? `NVARCHAR(${len})` : `VARCHAR(${len})`;
}

export type RenderOpts = { format: string; table: string; dialect: string; ddl: boolean; batch: number };

export async function renderRows(rows: Record<string, unknown>[], fields: string[], o: RenderOpts): Promise<{ text: string; lang: "json" | "sql" | "xml" | "markdown" | "yaml" | "text"; ext: string }> {
  const table = o.table.trim() || "mock_data";
  switch (o.format) {
    case "ndjson":
      return { text: rows.map((r) => JSON.stringify(r)).join("\n"), lang: "json", ext: "ndjson" };
    case "csv":
      return { text: [fields.map(csvCell).join(","), ...rows.map((r) => fields.map((k) => csvCell(r[k])).join(","))].join("\n"), lang: "text", ext: "csv" };
    case "tsv":
      return { text: [fields.join("\t"), ...rows.map((r) => fields.map((k) => tsvCell(r[k])).join("\t"))].join("\n"), lang: "text", ext: "tsv" };
    case "sql": {
      const d = o.dialect;
      const cols = fields.map((c) => sqlIdent(c, d)).join(", ");
      const out: string[] = [];
      if (o.ddl) {
        out.push(`CREATE TABLE ${sqlIdent(table, d)} (\n${fields.map((c) => `  ${sqlIdent(c, d)} ${sqlType(rows.map((r) => r[c]), d)}${rows.every((r) => r[c] !== null) ? " NOT NULL" : ""}`).join(",\n")}\n);\n`);
      }
      const batch = Math.max(1, o.batch || 1);
      const per = d === "mssql" ? Math.min(batch, 1000) : batch; // SQL Server caps a VALUES list at 1000 rows
      for (let i = 0; i < rows.length; i += per) {
        const chunk = rows.slice(i, i + per);
        if (per === 1) out.push(`INSERT INTO ${sqlIdent(table, d)} (${cols}) VALUES (${fields.map((k) => sqlVal(chunk[0][k], d)).join(", ")});`);
        else out.push(`INSERT INTO ${sqlIdent(table, d)} (${cols}) VALUES\n${chunk.map((r) => `  (${fields.map((k) => sqlVal(r[k], d)).join(", ")})`).join(",\n")};`);
      }
      return { text: out.join("\n"), lang: "sql", ext: "sql" };
    }
    case "xml": {
      const root = xmlName(table);
      const body = rows
        .map((r) => `  <row>\n${fields.map((k) => (r[k] === null || r[k] === undefined ? `    <${xmlName(k)}/>` : `    <${xmlName(k)}>${xmlEsc(typeof r[k] === "object" ? JSON.stringify(r[k]) : String(r[k]))}</${xmlName(k)}>`)).join("\n")}\n  </row>`)
        .join("\n");
      return { text: `<?xml version="1.0" encoding="UTF-8"?>\n<${root}>\n${body}\n</${root}>`, lang: "xml", ext: "xml" };
    }
    case "markdown": {
      const esc = (v: unknown) => (v === null || v === undefined ? "" : String(typeof v === "object" ? JSON.stringify(v) : v).replace(/\|/g, "\\|").replace(/\n/g, " "));
      const numeric = fields.map((k) => rows.every((r) => r[k] === null || typeof r[k] === "number"));
      return {
        text: [`| ${fields.join(" | ")} |`, `| ${numeric.map((n) => (n ? "---:" : "---")).join(" | ")} |`, ...rows.map((r) => `| ${fields.map((k) => esc(r[k])).join(" | ")} |`)].join("\n"),
        lang: "markdown",
        ext: "md",
      };
    }
    case "yaml": {
      const yaml = await import("js-yaml");
      return { text: yaml.dump(rows, { lineWidth: -1, noRefs: true }).trimEnd(), lang: "yaml", ext: "yaml" };
    }
    default:
      return { text: JSON.stringify(rows, null, 2), lang: "json", ext: "json" };
  }
}

/* ── presets ────────────────────────────────────────────────────────── */

const S = (fields: MockField[]) => JSON.stringify({ fields }, null, 2);

export const PRESETS: Record<string, string> = {
  users: S([
    { name: "id", type: "increment" },
    { name: "first_name", type: "firstName" },
    { name: "last_name", type: "lastName" },
    { name: "email", type: "email", unique: true },
    { name: "username", type: "username" },
    { name: "age", type: "age", min: 18, max: 75 },
    { name: "city", type: "city" },
    { name: "country", type: "countryCode" },
    { name: "plan", type: "enum", values: "free:60,pro:30,enterprise:10" },
    { name: "active", type: "bool", prob: 85 },
    { name: "signed_up", type: "date", from: "2022-01-01", to: "2025-12-31" },
    { name: "phone", type: "phone", nullable: 20 },
  ]),
  orders: S([
    { name: "order_id", type: "pattern", pattern: "ORD-2025-#####", unique: true },
    { name: "customer", type: "fullName" },
    { name: "email", type: "email" },
    { name: "product", type: "product" },
    { name: "unit_price", type: "price", min: 5, max: 400 },
    { name: "quantity", type: "int", min: 1, max: 6 },
    { name: "subtotal", type: "formula", formula: "round(unit_price * quantity, 2)" },
    { name: "tax", type: "formula", formula: "round(subtotal * 0.2, 2)" },
    { name: "total", type: "formula", formula: "round(subtotal + tax, 2)" },
    { name: "status", type: "enum", values: "delivered:55,shipped:20,processing:15,cancelled:6,refunded:4" },
    { name: "ordered_at", type: "datetime", from: "2025-01-01", to: "2025-12-31" },
  ]),
  products: S([
    { name: "sku", type: "pattern", pattern: "[A-Z]{3}-####", unique: true },
    { name: "name", type: "product" },
    { name: "department", type: "department" },
    { name: "price", type: "price", min: 2, max: 900 },
    { name: "cost", type: "formula", formula: "round(price * 0.55, 2)" },
    { name: "margin_pct", type: "formula", formula: "round((price - cost) / price * 100, 1)" },
    { name: "stock", type: "int", min: 0, max: 500 },
    { name: "in_stock", type: "formula", formula: "stock > 0" },
    { name: "rating", type: "float", min: 1, max: 5, decimals: 1 },
    { name: "colour", type: "colorName" },
    { name: "discontinued", type: "bool", prob: 8 },
  ]),
  transactions: S([
    { name: "txn_id", type: "uuid" },
    { name: "account", type: "iban" },
    { name: "type", type: "enum", values: "debit:65,credit:30,fee:5" },
    { name: "amount", type: "amount", min: 1, max: 2500, decimals: 2 },
    { name: "signed_amount", type: "formula", formula: 'type == "credit" ? amount : -amount' },
    { name: "currency", type: "enum", values: "GBP:50,EUR:30,USD:20" },
    { name: "merchant", type: "company" },
    { name: "card", type: "pattern", pattern: "**** **** **** ####" },
    { name: "booked_at", type: "datetime", from: "2025-06-01", to: "2025-06-30" },
    { name: "flagged", type: "bool", prob: 3 },
  ]),
  iot: S([
    { name: "reading_id", type: "increment", min: 100000 },
    { name: "device", type: "pattern", pattern: "sensor-[a-f0-9]{6}" },
    { name: "site", type: "enum", values: "warehouse-a,warehouse-b,cold-store,loading-bay" },
    { name: "recorded_at", type: "datetime", from: "2025-09-01", to: "2025-09-02" },
    { name: "temperature_c", type: "float", min: -4, max: 31, decimals: 2 },
    { name: "humidity_pct", type: "float", min: 20, max: 90, decimals: 1 },
    { name: "battery_pct", type: "int", min: 5, max: 100 },
    { name: "alert", type: "formula", formula: "temperature_c > 28 || battery_pct < 10" },
    { name: "lat", type: "latitude" },
    { name: "lng", type: "longitude" },
    { name: "firmware", type: "semver" },
  ]),
  posts: S([
    { name: "id", type: "increment" },
    { name: "title", type: "title" },
    { name: "slug", type: "formula", formula: "slug(title)" },
    { name: "author", type: "fullName" },
    { name: "author_email", type: "email" },
    { name: "excerpt", type: "sentence" },
    { name: "body", type: "paragraph" },
    { name: "tags", type: "enum", values: "javascript,devops,design,career,databases,security" },
    { name: "published", type: "bool", prob: 75 },
    { name: "published_at", type: "datetime", from: "2024-01-01", to: "2025-12-31", nullable: 25 },
    { name: "views", type: "int", min: 0, max: 50000 },
    { name: "likes", type: "formula", formula: "floor(views * 0.04)" },
  ]),
  employees: S([
    { name: "employee_id", type: "pattern", pattern: "E####", unique: true },
    { name: "first_name", type: "firstName" },
    { name: "last_name", type: "lastName" },
    { name: "full_name", type: "formula", formula: 'concat(first_name, " ", last_name)' },
    { name: "email", type: "companyEmail" },
    { name: "job_title", type: "jobTitle" },
    { name: "department", type: "enum", values: "Engineering:35,Sales:20,Support:15,Marketing:10,Finance:10,HR:10" },
    { name: "salary", type: "int", min: 32000, max: 165000 },
    { name: "hired", type: "date", from: "2012-01-01", to: "2025-06-30" },
    { name: "remote", type: "bool", prob: 40 },
    { name: "manager_id", type: "pattern", pattern: "E####", nullable: 10 },
  ]),
};
