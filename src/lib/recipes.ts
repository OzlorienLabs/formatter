/**
 * Recipes: curated, explained pipelines. `featured` ones double as the
 * examples on the Pipelines page. Option ids must match the tool specs —
 * src/lib/recipes.test.ts runs every recipe end to end.
 */
import type { PipelineStep } from "./collections";

export type Recipe = {
  id: string;
  title: string;
  summary: string;
  /** Why you'd do this — shown on the recipe card. */
  why: string;
  area: "Data" | "API & Web" | "Security" | "DevOps" | "Text & Code";
  level: "Starter" | "Intermediate" | "Advanced";
  source: string;
  steps: PipelineStep[];
  featured?: boolean;
  /** What to look at in the output. */
  expect?: string;
};

export const RECIPES: Recipe[] = [
  {
    id: "json-clean-minify",
    title: "Validate, tidy and minify JSON",
    summary: "Accept sloppy JSON5, sort its keys and ship it compact.",
    why: "Config files written by hand drift: comments, trailing commas, random key order. This normalises them into canonical, diff-friendly minified JSON.",
    area: "Data",
    level: "Starter",
    featured: true,
    source: `// service config\n{\n  name: 'billing-api',\n  port: 8080,\n  features: { retries: 3, timeouts: [100, 250, 1000,], },\n  debug: false,\n}`,
    steps: [
      { slug: "json-formatter", opts: { tolerant: true, sort: true } },
      { slug: "json-minifier", opts: {} },
    ],
    expect: "A single line of strict JSON with keys in alphabetical order.",
  },
  {
    id: "json-query-base64",
    title: "Extract with jq, then Base64 it",
    summary: "Pull a sub-document out of an API response and encode it for a header.",
    why: "Many APIs expect a Base64 JSON blob in a header (e.g. X-Context). jq picks exactly the part you need.",
    area: "API & Web",
    level: "Intermediate",
    featured: true,
    source: `{"data":{"repository":{"name":"formatter","owner":{"login":"ozlorienlabs","type":"Organization"},"stars":1280}},"meta":{"requestId":"b7f3c2"}}`,
    steps: [
      { slug: "jq-playground", inputs: { filter: ".data.repository | {name, owner: .owner.login}" }, opts: { compact: true } },
      { slug: "json-to-base64", opts: { variant: "url" } },
    ],
    expect: "A URL-safe Base64 string of {\"name\":\"formatter\",\"owner\":\"ozlorienlabs\"}.",
  },
  {
    id: "csv-to-yaml-config",
    title: "Spreadsheet rows to a YAML config",
    summary: "Turn a CSV export into typed JSON, then into YAML you can commit.",
    why: "Feature flags and environment matrices often live in a spreadsheet. Typed parsing keeps numbers and booleans as real values in the YAML.",
    area: "DevOps",
    level: "Starter",
    featured: true,
    source: "service,replicas,public,region\napi,3,true,eu-west-1\nworker,5,false,eu-west-1\nweb,2,true,us-east-1",
    steps: [
      { slug: "csv-to-json", opts: { typed: true } },
      { slug: "json-to-yaml", opts: { indent: "2" } },
    ],
    expect: "A YAML list where replicas are numbers and public is a boolean.",
  },
  {
    id: "csv-seed-sql",
    title: "CSV to a formatted MySQL seed script",
    summary: "Infer column types, generate CREATE TABLE and INSERTs, then pretty-print it.",
    why: "Seeding a dev database from a CSV export is a daily chore; inferring types saves writing the DDL by hand.",
    area: "Data",
    level: "Starter",
    featured: true,
    source: "id,name,email,signup_date,plan,mrr\n1,Ada Lovelace,ada@example.com,2024-01-12,pro,49.00\n2,Grace Hopper,grace@example.com,2024-02-03,team,199.00\n3,Linus Torvalds,linus@example.com,2024-03-21,free,0",
    steps: [
      { slug: "csv-to-sql", opts: { dialect: "mysql", table: "customers", drop: true } },
      { slug: "sql-formatter", opts: { language: "mysql", keywordCase: "upper" } },
    ],
    expect: "DROP/CREATE TABLE with INT, VARCHAR, DATE and DECIMAL columns, then one multi-row INSERT.",
  },
  {
    id: "csv-report-table",
    title: "SQL over a CSV, printed as a table",
    summary: "Aggregate a CSV with real SQL, then frame the result as a box-drawn table.",
    why: "Quick reports for a README, a ticket or a terminal — no database, no spreadsheet.",
    area: "Data",
    level: "Intermediate",
    featured: true,
    source: "region,rep,deal,amount\nEMEA,Ada,Acme,12000\nEMEA,Grace,Globex,8500\nAPAC,Linus,Initech,15000\nAMER,Ada,Umbrella,4300\nAPAC,Grace,Hooli,9900\nAMER,Linus,Vandelay,7100",
    steps: [
      { slug: "csv-query-sql", inputs: { sql: "SELECT region, COUNT(*) AS deals, SUM(amount) AS total\nFROM data GROUP BY region ORDER BY total DESC" }, opts: { out: "csv" } },
      { slug: "box-drawing", opts: { mode: "table", style: "rounded" } },
    ],
    expect: "A rounded box table: APAC first with 24,900.",
  },
  {
    id: "api-to-csv",
    title: "Flatten an API response into CSV",
    summary: "Select the records with jq and flatten nested fields into dot-path columns.",
    why: "Analysts want a spreadsheet; the API gives nested JSON wrapped in metadata.",
    area: "API & Web",
    level: "Intermediate",
    source: '{"meta":{"page":1,"total":3},"data":[{"id":1,"user":{"name":"Ada","country":"UK"},"tags":["admin","dev"]},{"id":2,"user":{"name":"Grace","country":"US"},"tags":["dev"]},{"id":3,"user":{"name":"Linus","country":"FI"},"tags":[]}]}',
    steps: [
      { slug: "jq-playground", inputs: { filter: ".data" } },
      { slug: "json-to-csv", opts: { flatten: true, arrays: "join", joiner: "|" } },
    ],
    expect: "Columns id, user.name, user.country, tags.",
  },
  {
    id: "decode-url-base64-json",
    title: "Decode a URL-encoded Base64 JSON blob",
    summary: "Percent-decode a query value, Base64-decode it and pretty-print the JSON inside.",
    why: "State, redirect and tracking parameters often hide JSON behind two layers of encoding.",
    area: "API & Web",
    level: "Starter",
    source: "eyJyZXR1cm5UbyI6Ii9jaGVja291dD9zdGVwPTIiLCJjYXJ0IjpbeyJza3UiOiJLQi0wMSIsInF0eSI6MX1dfQ%3D%3D",
    steps: [
      { slug: "url-decoder", opts: {} },
      { slug: "base64-decoder", opts: { show: "text" } },
      { slug: "json-formatter", opts: { indent: "2" } },
    ],
    expect: "An object with returnTo and a cart array.",
  },
  {
    id: "redact-then-scan",
    title: "Redact logs, then prove nothing leaked",
    summary: "Mask PII and credentials in logs, then run the secret scanner over the result.",
    why: "Before attaching logs to a ticket or sharing them with a vendor, redact — and double-check with a second, independent scanner.",
    area: "Security",
    level: "Intermediate",
    featured: true,
    source: [
      '2026-09-24T08:12:03Z INFO  login ok user=ada@example.com ip=203.0.113.7',
      '2026-09-24T08:12:05Z WARN  retrying payment card=4111 1111 1111 1111 attempt=2',
      '2026-09-24T08:12:09Z ERROR upstream 401 Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl',
      "2026-09-24T08:12:10Z DEBUG config password=hunter2 region=eu-west-1",
    ].join("\n"),
    steps: [
      { slug: "log-privacy-workbench", opts: { mask: "label" } },
      { slug: "secret-detector", opts: {} },
    ],
    expect: "Emails, the IP, the card, the bearer token and the password are all [REDACTED:…]; the scanner finds nothing left.",
  },
  {
    id: "canonical-json-hash",
    title: "Fingerprint JSON canonically",
    summary: "Sort keys, minify, then SHA-256 — so equal documents hash equally.",
    why: "Cache keys, idempotency keys and change detection need a hash that ignores key order and whitespace.",
    area: "Security",
    level: "Intermediate",
    source: '{\n  "b": [3, 2, 1],\n  "a": {"y": true, "x": null}\n}',
    steps: [
      { slug: "json-minifier", opts: { sort: true } },
      { slug: "hash-generator", opts: { alg: "sha256" } },
    ],
    expect: "The SHA-256 of {\"a\":{\"x\":null,\"y\":true},\"b\":[3,2,1]}.",
  },
  {
    id: "orm-log-to-sql",
    title: "Replay a query from an ORM log",
    summary: "Inline the bound parameters from a Hibernate log, then format the SQL.",
    why: "To reproduce a slow or failing query in a SQL client you need the literal statement, not placeholders.",
    area: "Text & Code",
    level: "Intermediate",
    source: "select o.id, o.total from orders o where o.customer_id = ? and o.status in (?, ?) and o.created_at > ? order by o.created_at desc limit ?",
    steps: [
      { slug: "inline-sql-vars", inputs: { values: '[42, "shipped", "pending", "2026-01-01", 20]' }, opts: { dialect: "postgresql", format: false } },
      { slug: "sql-formatter", opts: { language: "postgresql" } },
    ],
    expect: "A runnable, formatted SELECT with 42, 'shipped', 'pending', '2026-01-01' and 20 inlined.",
  },
  {
    id: "xml-feed-to-csv",
    title: "RSS/XML feed to a CSV of items",
    summary: "Convert XML to JSON, pick the items with jq, then flatten to CSV.",
    why: "Legacy systems speak XML; your spreadsheet doesn't.",
    area: "Data",
    level: "Advanced",
    source: '<?xml version="1.0"?>\n<rss version="2.0"><channel><title>Release notes</title>\n<item><title>v2.3.0</title><pubDate>2026-08-30</pubDate><category>feature</category></item>\n<item><title>v2.2.1</title><pubDate>2026-07-12</pubDate><category>fix</category></item>\n<item><title>v2.2.0</title><pubDate>2026-06-01</pubDate><category>feature</category></item>\n</channel></rss>',
    steps: [
      { slug: "xml-to-json", opts: { parse: false, arrays: "item" } },
      { slug: "jq-playground", inputs: { filter: ".rss.channel.item" } },
      { slug: "json-to-csv", opts: {} },
    ],
    expect: "Three rows with title, pubDate and category.",
  },
  {
    id: "yaml-schema-check",
    title: "Validate a YAML config against a JSON Schema",
    summary: "Parse YAML to JSON, then validate it with Ajv against your schema.",
    why: "Catch a typo'd key or a string where a number belongs before the deploy does.",
    area: "DevOps",
    level: "Advanced",
    source: "name: billing-api\nreplicas: three\nport: 8080\nenv:\n  LOG_LEVEL: debug",
    steps: [
      { slug: "yaml-to-json", opts: { docs: "first" } },
      {
        slug: "json-schema-validator",
        inputs: {
          schema: JSON.stringify(
            {
              $schema: "https://json-schema.org/draft/2020-12/schema",
              type: "object",
              required: ["name", "replicas", "port"],
              properties: {
                name: { type: "string" },
                replicas: { type: "integer", minimum: 1 },
                port: { type: "integer", maximum: 65535 },
                env: { type: "object", additionalProperties: { type: "string" } },
              },
              additionalProperties: false,
            },
            null,
            2
          ),
        },
      },
    ],
    expect: "Invalid: /replicas must be integer — change it to 3 in the source and run again.",
  },
  {
    id: "toml-deps",
    title: "List dependencies from pyproject.toml",
    summary: "Parse TOML, then query it with jq like any JSON document.",
    why: "Auditing dependencies across repos is easier once config is JSON.",
    area: "DevOps",
    level: "Starter",
    source: '[project]\nname = "reporting"\nversion = "1.4.0"\ndependencies = ["httpx>=0.27", "pydantic>=2.7", "rich"]\n\n[project.optional-dependencies]\ndev = ["pytest", "ruff"]',
    steps: [
      { slug: "toml-to-json", opts: {} },
      { slug: "jq-playground", inputs: { filter: '[.project.dependencies[], (.project["optional-dependencies"] | to_entries[] | .key as $g | .value[] | "\\(.) (\\($g))")] | .[]' }, opts: { raw: true } },
    ],
    expect: "One dependency per line, dev ones tagged (dev).",
  },
  {
    id: "outline-to-tree",
    title: "Indented outline to a framed file tree",
    summary: "Turn an indented list into a tree, then put a titled box around it.",
    why: "Project structures for READMEs and design docs, without drawing a single line by hand.",
    area: "Text & Code",
    level: "Starter",
    source: "my-app\n  src\n    components\n      Button.tsx\n      Modal.tsx\n    lib\n      api.ts\n    index.ts\n  public\n    favicon.svg\n  package.json\n  README.md",
    steps: [
      { slug: "ascii-tree", opts: { from: "indent", style: "unicode" } },
      { slug: "box-drawing", opts: { mode: "box", style: "rounded", title: "Project layout" } },
    ],
    expect: "A ├── tree inside a rounded box titled Project layout.",
  },
  {
    id: "headlines-to-slugs",
    title: "Headlines to unique, sorted URL slugs",
    summary: "Slugify each line, drop duplicates and sort.",
    why: "Generating routes or anchors from a list of titles.",
    area: "Text & Code",
    level: "Starter",
    source: "Hello, World!\nWhat's new in v2.3?\nCafé & Crème: a guide\nHello World\nZero-downtime deploys",
    steps: [
      { slug: "text-toolbox", opts: { op: "slugify" } },
      { slug: "text-toolbox", opts: { op: "dedupe" } },
      { slug: "text-toolbox", opts: { op: "sort-az" } },
    ],
    expect: "cafe-creme-a-guide, hello-world (once), whats-new-in-v2-3, zero-downtime-deploys.",
  },
];

export const recipeById = (id: string) => RECIPES.find((r) => r.id === id);
