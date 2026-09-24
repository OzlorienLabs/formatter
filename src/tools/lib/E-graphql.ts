/**
 * Offline GraphQL: validate and execute a query against an SDL schema with
 * resolvers derived from mock JSON data. Fields missing from the data are
 * auto-mocked deterministically from their type and name.
 */
import type * as G from "graphql";

type GQL = typeof import("graphql");

export type GqlIssue = { level: "error" | "warning" | "info"; message: string; line?: number; col?: number; source: "schema" | "query" | "variables" | "execution" };

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const NAMES = ["Ada Lovelace", "Grace Hopper", "Alan Turing", "Margaret Hamilton", "Linus Torvalds", "Barbara Liskov", "Ken Thompson", "Radia Perlman"];
const WORDS = ["offline", "schema", "resolver", "vector", "harbor", "quartz", "meadow", "signal", "lantern", "copper", "orbit", "delta"];
const CITIES = ["London", "Helsinki", "Boston", "Vienna", "Kyoto", "Lagos", "Lima", "Oslo"];

function plural(s: string) {
  if (/(s|x|ch|sh)$/i.test(s)) return s + "es";
  if (/[^aeiou]y$/i.test(s)) return s.slice(0, -1) + "ies";
  return s + "s";
}
const lcFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

function mockScalar(typeName: string, field: string, h: number): unknown {
  const f = field.toLowerCase();
  switch (typeName) {
    case "ID":
      return String((h % 900) + 100);
    case "Int":
      if (/age/.test(f)) return 18 + (h % 60);
      if (/year/.test(f)) return 1990 + (h % 36);
      if (/(count|total|likes|views|stars|stock|quantity|qty)/.test(f)) return h % 500;
      return h % 100;
    case "Float":
      if (/(price|amount|cost|total|balance)/.test(f)) return Math.round((h % 50000) / 100 * 100) / 100 + 0.99;
      if (/(lat)/.test(f)) return Math.round(((h % 18000) / 100 - 90) * 1000) / 1000;
      if (/(lng|lon)/.test(f)) return Math.round(((h % 36000) / 100 - 180) * 1000) / 1000;
      return Math.round((h % 10000) / 100) / 1;
    case "Boolean":
      return h % 2 === 0;
  }
  // Strings and custom scalars: guess by name.
  const w = (k: number) => WORDS[hash(`${h}:${k}`) % WORDS.length];
  if (/(date|time|at)$/i.test(field) || /^(last|next)[A-Z]|deploy|updated|created|expires|published(at|on)/i.test(field) || /^(DateTime|Date|Time|Timestamp)$/.test(typeName)) {
    const d = new Date(Date.UTC(2026, h % 9, 1 + (h % 27), h % 24, (h >> 3) % 60));
    return typeName === "Date" || /date$/i.test(field) ? d.toISOString().slice(0, 10) : d.toISOString();
  }
  if (/email/.test(f)) return `${NAMES[h % NAMES.length].split(" ")[0].toLowerCase()}@example.com`;
  if (/(username|login|handle)/.test(f)) return NAMES[h % NAMES.length].split(" ")[0].toLowerCase() + (h % 90);
  if (/(firstname)/.test(f)) return NAMES[h % NAMES.length].split(" ")[0];
  if (/(lastname|surname)/.test(f)) return NAMES[h % NAMES.length].split(" ")[1];
  if (/name/.test(f)) return NAMES[h % NAMES.length];
  if (/(url|website|link|href|avatar|image|photo)/.test(f) || typeName === "URL") return `https://example.com/${w(0)}/${h % 1000}`;
  if (/(title|headline|subject)/.test(f)) return `${w(0)[0].toUpperCase()}${w(0).slice(1)} ${w(3)} ${w(6)}`;
  if (/(body|content|description|text|summary|bio|comment)/.test(f)) return `${w(0)[0].toUpperCase()}${w(0).slice(1)} ${w(2)} ${w(4)} ${w(6)} ${w(8)}.`;
  if (/(city|town)/.test(f)) return CITIES[h % CITIES.length];
  if (/country/.test(f)) return ["GB", "FI", "US", "AT", "JP", "NG"][h % 6];
  if (/(phone|mobile)/.test(f)) return `+1 555 01${String(h % 100).padStart(2, "0")}`;
  if (/(color|colour)/.test(f)) return "#" + (h % 0xffffff).toString(16).padStart(6, "0");
  if (/(slug)/.test(f)) return `${w(0)}-${w(4)}`;
  if (/(uuid|guid)/.test(f) || typeName === "UUID") {
    const hex = (hash(String(h)) >>> 0).toString(16).padStart(8, "0") + h.toString(16).padStart(8, "0");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(1, 4)}-${hex.slice(0, 12).padEnd(12, "0")}`;
  }
  if (typeName === "JSON") return { mock: true, field };
  return `${field} ${h % 1000}`;
}

export type GqlRun = {
  issues: GqlIssue[];
  result?: { data?: unknown; errors?: unknown[] };
  formatted?: string;
  schemaRows?: (string | number | null)[][];
  introspection?: unknown;
  operations: string[];
  operationUsed?: string;
  mocked: number;
};

function loc(e: { locations?: readonly { line: number; column: number }[] }) {
  const l = e.locations?.[0];
  return l ? { line: l.line, col: l.column } : {};
}

export async function runGraphql(opts: { query: string; sdl: string; data: string; variables: string; operation: string; execute: boolean }): Promise<GqlRun> {
  const g: GQL = await import("graphql");
  const issues: GqlIssue[] = [];
  const out: GqlRun = { issues, operations: [], mocked: 0 };

  // Schema.
  let schema: G.GraphQLSchema | null = null;
  if (opts.sdl.trim()) {
    try {
      schema = g.buildSchema(opts.sdl);
      const errs = g.validateSchema(schema);
      for (const e of errs) issues.push({ level: "error", message: `Schema: ${e.message}`, ...loc(e), source: "schema" });
      if (errs.length) schema = null;
    } catch (e) {
      const ge = e as G.GraphQLError;
      issues.push({ level: "error", message: `Schema: ${ge.message}`, ...loc(ge), source: "schema" });
    }
  } else issues.push({ level: "warning", message: "No schema SDL — the query is only parsed and formatted.", source: "schema" });

  // Query.
  let doc: G.DocumentNode | null = null;
  try {
    doc = g.parse(opts.query);
    out.formatted = g.print(doc);
  } catch (e) {
    const ge = e as G.GraphQLError;
    issues.push({ level: "error", message: ge.message.replace(/^Syntax Error: /, "Syntax error: "), ...loc(ge), source: "query" });
  }
  if (doc) {
    out.operations = doc.definitions.filter((d): d is G.OperationDefinitionNode => d.kind === "OperationDefinition").map((d) => d.name?.value ?? `(anonymous ${d.operation})`);
  }

  if (schema) {
    out.schemaRows = schemaRows(g, schema);
    out.introspection = g.introspectionFromSchema(schema);
  }

  let variables: Record<string, unknown> | undefined;
  if (opts.variables.trim()) {
    try {
      variables = JSON.parse(opts.variables);
    } catch (e) {
      issues.push({ level: "error", message: `Variables are not valid JSON: ${(e as Error).message}`, source: "variables" });
    }
  }

  let data: Record<string, unknown> = {};
  if (opts.data.trim()) {
    try {
      data = JSON.parse(opts.data);
    } catch (e) {
      issues.push({ level: "error", message: `Mock data is not valid JSON: ${(e as Error).message}`, source: "execution" });
    }
  }

  if (!schema || !doc) return out;
  const vErrs = g.validate(schema, doc);
  for (const e of vErrs) issues.push({ level: "error", message: e.message, ...loc(e), source: "query" });
  issues.sort((a, b) => (a.source === b.source ? (a.line ?? 0) - (b.line ?? 0) : 0));
  if (vErrs.length || !opts.execute || issues.some((i) => i.source === "variables" && i.level === "error")) return out;

  // Pick the operation.
  const ops = doc.definitions.filter((d): d is G.OperationDefinitionNode => d.kind === "OperationDefinition");
  let operationName: string | undefined = opts.operation.trim() || undefined;
  if (operationName && !ops.some((o) => o.name?.value === operationName)) {
    issues.push({ level: "error", message: `No operation named "${operationName}". Available: ${out.operations.join(", ")}`, source: "query" });
    return out;
  }
  if (!operationName && ops.length > 1) {
    operationName = ops[0].name?.value;
    issues.push({ level: "info", message: `The document has ${ops.length} operations; ran the first (${operationName}). Set Operation to pick another.`, source: "query" });
  }
  out.operationUsed = operationName ?? out.operations[0];

  const db = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
  let mocked = 0;

  const collectionFor = (typeName: string): Record<string, unknown>[] | null => {
    const cands = [plural(lcFirst(typeName)), lcFirst(typeName), lcFirst(typeName) + "List", typeName, plural(typeName)];
    for (const c of cands) if (Array.isArray(db[c])) return db[c] as Record<string, unknown>[];
    for (const v of Object.values(db)) if (Array.isArray(v) && v.some((x) => x && typeof x === "object" && (x as Record<string, unknown>).__typename === typeName)) return v as Record<string, unknown>[];
    return null;
  };

  const eq = (a: unknown, b: unknown) => a !== undefined && b !== undefined && String(a) === String(b);
  const PAGING = new Set(["first", "last", "limit", "offset", "skip", "take", "after", "before", "orderBy", "sort"]);

  const filterList = (list: unknown[], args: Record<string, unknown>) => {
    let l = list;
    for (const [k, v] of Object.entries(args)) {
      if (PAGING.has(k) || v === undefined || v === null || typeof v === "object") continue;
      if (k === "search" || k === "q" || k === "query") {
        const needle = String(v).toLowerCase();
        l = l.filter((x) => JSON.stringify(x).toLowerCase().includes(needle));
        continue;
      }
      l = l.filter((x) => x && typeof x === "object" && (!(k in (x as object)) || eq((x as Record<string, unknown>)[k], v)));
    }
    const off = Number(args.offset ?? args.skip ?? 0) || 0;
    const n = args.first ?? args.limit ?? args.take;
    l = l.slice(off, n != null ? off + Number(n) : undefined);
    if (args.last != null) l = l.slice(-Number(args.last));
    return l;
  };

  const mock = (type: G.GraphQLOutputType, path: string, field: string): unknown => {
    mocked++;
    const h = hash(path);
    if (g.isNonNullType(type)) return mock(type.ofType, path, field);
    if (g.isListType(type)) return [0, 1].map((i) => mock(type.ofType, `${path}.${i}`, field));
    if (g.isEnumType(type)) {
      const vals = type.getValues();
      return vals[h % vals.length].value;
    }
    if (g.isScalarType(type)) return mockScalar(type.name, field, h);
    if (g.isObjectType(type)) return { __typename: type.name, __mockSeed: path };
    if (g.isAbstractType(type)) {
      const poss = schema!.getPossibleTypes(type);
      return { __typename: poss[h % poss.length].name, __mockSeed: path };
    }
    return null;
  };

  const pathKey = (p: G.ResponsePath | undefined): string => {
    const parts: (string | number)[] = [];
    while (p) {
      parts.unshift(p.key);
      p = p.prev;
    }
    return parts.join(".");
  };

  const mutationType = schema.getMutationType();

  const mutate = (field: string, args: Record<string, unknown>, rt: G.GraphQLOutputType, info: G.GraphQLResolveInfo): unknown => {
    const named = g.getNamedType(rt);
    const input = (args.input && typeof args.input === "object" ? args.input : Object.fromEntries(Object.entries(args).filter(([k]) => k !== "id"))) as Record<string, unknown>;
    const typeName = g.isObjectType(named) ? named.name : field.replace(/^(create|add|insert|update|edit|delete|remove)/i, "");
    let list = collectionFor(typeName);
    if (!list) {
      list = [];
      db[plural(lcFirst(typeName))] = list;
    }
    if (/^(create|add|insert|new)/i.test(field)) {
      const id = list.reduce((n, r) => Math.max(n, Number(r.id) || 0), 0) + 1;
      const item: Record<string, unknown> = { id: String(id), ...input };
      list.push(item);
      return item;
    }
    if (/^(update|edit|set|patch)/i.test(field)) {
      const item = list.find((r) => eq(r.id, args.id));
      if (!item) throw new Error(`${typeName} with id ${String(args.id)} not found`);
      Object.assign(item, input);
      return item;
    }
    if (/^(delete|remove)/i.test(field)) {
      const i = list.findIndex((r) => eq(r.id, args.id));
      if (i < 0) throw new Error(`${typeName} with id ${String(args.id)} not found`);
      const [gone] = list.splice(i, 1);
      if (g.isScalarType(named) && named.name === "Boolean") return true;
      if (g.isScalarType(named) && named.name === "ID") return gone.id;
      return gone;
    }
    return mock(rt, pathKey(info.path), field);
  };

  const fieldResolver: G.GraphQLFieldResolver<unknown, unknown> = (source, args, _ctx, info) => {
    const key = info.fieldName;
    const rt = info.returnType;
    const named = g.getNamedType(rt);
    const isList = g.isListType(g.getNullableType(rt));
    if (mutationType && info.parentType === mutationType) {
      const own = (db as Record<string, unknown>)[key];
      if (typeof own !== "undefined" && !Array.isArray(own)) return own;
      return mutate(key, args as Record<string, unknown>, rt, info);
    }
    const src = (source ?? {}) as Record<string, unknown>;
    let v = src[key];
    const isRoot = info.parentType === schema!.getQueryType() || info.parentType === schema!.getSubscriptionType();
    if (v === undefined && g.isObjectType(named) || (v === undefined && g.isAbstractType(named))) {
      const coll = collectionFor(named.name);
      if (coll) {
        if (isRoot) {
          if (isList) v = coll;
          else {
            const a = args as Record<string, unknown>;
            const keys = Object.keys(a).filter((k) => a[k] !== undefined && typeof a[k] !== "object");
            v = keys.length ? coll.find((r) => keys.every((k) => eq(r[k], a[k]))) ?? null : coll[0] ?? null;
          }
        } else {
          const parentId = src.id;
          const parentName = lcFirst(info.parentType.name);
          if (isList) {
            const fks = [`${parentName}Id`, "authorId", "ownerId", "userId", "parentId"];
            const found = coll.filter((r) => fks.some((fk) => fk in r && eq(r[fk], parentId)));
            const idList = src[`${key.replace(/s$/, "")}Ids`];
            v = Array.isArray(idList) ? coll.filter((r) => idList.some((x) => eq(x, r.id))) : found.length || coll.some((r) => fks.some((fk) => fk in r)) ? found : undefined;
          } else {
            const fk = src[`${key}Id`] ?? src[`${lcFirst(named.name)}Id`];
            if (fk !== undefined) v = coll.find((r) => eq(r.id, fk)) ?? null;
          }
        }
      }
    }
    if (typeof v === "function") v = (v as (a: unknown) => unknown)(args);
    if (v !== undefined) {
      if (Array.isArray(v) && Object.keys(args).length) v = filterList(v, args as Record<string, unknown>);
      if (isRoot && !isList && Array.isArray(v) && (args as Record<string, unknown>).id !== undefined) v = v.find((r) => eq((r as Record<string, unknown>).id, (args as Record<string, unknown>).id)) ?? null;
      return v;
    }
    const seed = typeof src.__mockSeed === "string" ? `${src.__mockSeed}.${key}` : pathKey(info.path);
    return mock(rt, seed + JSON.stringify(args), key);
  };

  try {
    const res = await g.execute({
      schema,
      document: doc,
      rootValue: db,
      variableValues: variables,
      operationName,
      fieldResolver,
      typeResolver: (value, _c, _i, abstract) => {
        const v = value as Record<string, unknown>;
        if (typeof v?.__typename === "string") return v.__typename;
        const poss = schema!.getPossibleTypes(abstract);
        const hit = poss.find((t) => Object.keys(v ?? {}).every((k) => k in t.getFields() || k === "id"));
        return (hit ?? poss[0]).name;
      },
    });
    out.result = JSON.parse(JSON.stringify(res));
    for (const e of res.errors ?? []) issues.push({ level: "error", message: `${e.message}${e.path ? ` (at ${e.path.join(".")})` : ""}`, ...loc(e), source: "execution" });
  } catch (e) {
    issues.push({ level: "error", message: (e as Error).message, source: "execution" });
  }
  out.mocked = mocked;
  return out;
}

function typeStr(t: G.GraphQLType): string {
  return String(t);
}

function schemaRows(g: GQL, schema: G.GraphQLSchema): (string | number | null)[][] {
  const rows: (string | number | null)[][] = [];
  const roots = [schema.getQueryType(), schema.getMutationType(), schema.getSubscriptionType()].filter(Boolean) as G.GraphQLObjectType[];
  const types = Object.values(schema.getTypeMap()).filter((t) => !t.name.startsWith("__") && !["String", "Int", "Float", "Boolean", "ID"].includes(t.name));
  types.sort((a, b) => (roots.includes(a as G.GraphQLObjectType) ? -1 : 0) - (roots.includes(b as G.GraphQLObjectType) ? -1 : 0));
  for (const t of types) {
    const kind = g.isObjectType(t) ? (roots.includes(t) ? "root" : "type") : g.isInterfaceType(t) ? "interface" : g.isUnionType(t) ? "union" : g.isEnumType(t) ? "enum" : g.isInputObjectType(t) ? "input" : "scalar";
    if (g.isObjectType(t) || g.isInterfaceType(t)) {
      for (const f of Object.values(t.getFields())) rows.push([t.name, kind, f.name, f.args.map((a) => `${a.name}: ${typeStr(a.type)}${a.defaultValue !== undefined ? ` = ${JSON.stringify(a.defaultValue)}` : ""}`).join(", ") || null, typeStr(f.type), f.deprecationReason ? `DEPRECATED: ${f.deprecationReason}` : f.description ?? null]);
    } else if (g.isInputObjectType(t)) {
      for (const f of Object.values(t.getFields())) rows.push([t.name, kind, f.name, null, typeStr(f.type), f.description ?? null]);
    } else if (g.isEnumType(t)) {
      rows.push([t.name, kind, null, null, t.getValues().map((v) => v.name).join(" | "), t.description ?? null]);
    } else if (g.isUnionType(t)) {
      rows.push([t.name, kind, null, null, t.getTypes().map((x) => x.name).join(" | "), t.description ?? null]);
    } else rows.push([t.name, kind, null, null, null, t.description ?? null]);
  }
  return rows;
}
