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
