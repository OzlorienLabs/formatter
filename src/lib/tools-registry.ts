export type ToolCategory =
  | "JSON"
  | "Encoding"
  | "Binary & Numbers"
  | "Converters"
  | "Validators"
  | "XML"
  | "Formatters & Text"
  | "SQL & Data"
  | "Security"
  | "Regex & API"
  | "Languages"
  | "Visual & Canvas"
  | "Diagrams"
  | "Generators & DevOps"
  | "Image, Colour & SEO"
  | "ASCII"
  | "Time"
  | "Platform";

export type Plate = "c" | "m" | "y" | "k";

export type ToolMeta = {
  slug: string;
  title: string;
  category: ToolCategory;
  description: string;
  /** Phosphor icon name, kebab-case, no weight suffix. */
  icon: string;
  guideSteps: string[];
  exampleInput: string;
  tips: string[];
  faq: { q: string; a: string }[];
  clientOnly: true;
  wasm?: boolean;
  liteNote?: string;
};

export type CategoryMeta = {
  slug: string;
  title: ToolCategory;
  /** Short label for filter chips and the rail. */
  short: string;
  blurb: string;
  plate: Plate;
};

export const CATEGORIES: CategoryMeta[] = [
  { slug: "json", title: "JSON", short: "JSON", blurb: "Format, validate, view, diff and query JSON.", plate: "c" },
  { slug: "encoding", title: "Encoding", short: "Encoding", blurb: "Base64, URL, HTML entities, JWT.", plate: "m" },
  { slug: "binary-numbers", title: "Binary & Numbers", short: "Binary", blurb: "Bits, hex, bases, epochs, string stats.", plate: "k" },
  { slug: "converters", title: "Converters", short: "Convert", blurb: "JSON, YAML, XML, CSV, TOML, SQL, cURL.", plate: "c" },
  { slug: "validators", title: "Validators", short: "Validate", blurb: "Schemas and syntax checks.", plate: "y" },
  { slug: "xml", title: "XML", short: "XML", blurb: "Format, view, edit, XPath.", plate: "m" },
  { slug: "formatters-text", title: "Formatters & Text", short: "Format", blurb: "CSS, HTML, JS, SQL, stack traces, text.", plate: "k" },
  { slug: "sql-data", title: "SQL & Data", short: "Data", blurb: "CSV grids, SQL, DuckDB, Parquet.", plate: "c" },
  { slug: "security", title: "Security", short: "Security", blurb: "Hashes, passwords, tokens, headers.", plate: "m" },
  { slug: "regex-api", title: "Regex & API", short: "Regex & API", blurb: "Regex labs, GraphQL, API and MCP mocks.", plate: "y" },
  { slug: "languages", title: "Languages", short: "Languages", blurb: "Wasm playgrounds, client-only lite mode.", plate: "k" },
  { slug: "visual-canvas", title: "Visual & Canvas", short: "Canvas", blurb: "3D, canvas, whiteboard.", plate: "m" },
  { slug: "diagrams", title: "Diagrams", short: "Diagrams", blurb: "Graphviz, Mermaid and PlantUML, rendered locally.", plate: "c" },
  { slug: "generators-devops", title: "Generators & DevOps", short: "Generate", blurb: "QR, UUID, mock data, CLI builders.", plate: "y" },
  { slug: "image-color-seo", title: "Image, Colour & SEO", short: "Image & Colour", blurb: "SVG, colours, images, SEO.", plate: "m" },
  { slug: "ascii", title: "ASCII", short: "ASCII", blurb: "ASCII art, boxes, trees.", plate: "k" },
  { slug: "time", title: "Time", short: "Time", blurb: "Timers, epochs, timezones.", plate: "c" },
  { slug: "platform", title: "Platform", short: "Platform", blurb: "Pipelines, workspaces, recipes.", plate: "k" },
];

function m(
  slug: string,
  title: string,
  category: ToolCategory,
  description: string,
  icon: string,
  exampleInput = "",
  extra: Partial<ToolMeta> = {}
): ToolMeta {
  return {
    slug,
    title,
    category,
    description,
    icon,
    guideSteps: [
      `Open ${title} — everything runs locally in your browser.`,
      "Paste input or press Example, then adjust the options.",
      "Read the output as it updates; errors appear above it.",
      "Copy, Download or Share via the URL fragment; Pipeline chains tools.",
    ],
    exampleInput,
    tips: [
      "Press Example to learn the input format.",
      "Copy and Download both preserve the exact result.",
      "Share writes the payload into the URL fragment — nothing is transmitted.",
    ],
    faq: [
      { q: "Is my data uploaded?", a: "No. All processing is client-side. Share links encode data in the URL fragment, which browsers never send to a server." },
      { q: "Does it work offline?", a: "Yes, after the first load. Wasm tools need one download before they do." },
      { q: "What are the limits?", a: "Browser memory. For very large files use the chunked options in Data Explorer and Log Workbench." },
    ],
    clientOnly: true,
    ...extra,
  };
}

export const TOOLS: ToolMeta[] = [
  // JSON (11)
  m("json-formatter", "JSON Formatter", "JSON", "Beautify and indent JSON.", "brackets-curly", '{\n  "name": "ada",\n  "roles": ["admin","dev"]\n}'),
  m("json-validator", "JSON Validator", "JSON", "Verify syntax with line-level errors.", "seal-check", '{"a":1,}'),
  m("json-minifier", "JSON Minifier", "JSON", "Compress JSON to a single line.", "arrows-in-line-horizontal", '{\n  "a": 1,\n  "b": [1,2]\n}'),
  m("json-viewer", "JSON Viewer", "JSON", "Collapsible tree for nested JSON.", "tree-view", '{"user":{"name":"ada","tags":["x","y"]}}'),
  m("json-diff", "JSON Diff", "JSON", "Side-by-side semantic diff of two documents.", "git-diff", '{"a":1,"b":2}'),
  m("json-escape", "JSON Escape", "JSON", "Escape JSON for string embedding.", "quotes", '{"q":"a\\"b\\n"}'),
  m("json-unescape", "JSON Unescape", "JSON", "Unescape an embedded JSON string.", "quotes", '"{\\"a\\":1}"'),
  m("json-to-base64", "JSON to Base64", "JSON", "Encode a JSON document as Base64.", "binary", '{"hello":"world"}'),
  m("json-to-json-schema", "JSON to Schema", "JSON", "Infer a JSON Schema from a sample.", "blueprint", '{"name":"ada","age":36}'),
  m("jq-playground", "jq Playground", "JSON", "Filter JSON with jq-style paths.", "funnel", '{"users":[{"name":"ada"}]}'),
  m("jsonpath-playground", "JSONPath", "JSON", "Query JSON with JSONPath expressions.", "path", '{"store":{"book":[{"title":"A"}]}}'),
  // Encoding (10)
  m("base64-encoder", "Base64 Encode", "Encoding", "Encode text or files to Base64: URL-safe, MIME wrap, data URLs.", "binary", "Hello, world!"),
  m("base64-decoder", "Base64 Decode", "Encoding", "Decode Base64 to text, hex or a file; detects PNG, PDF, ZIP, GZIP.", "binary", "SGVsbG8sIHdvcmxkIQ=="),
  m("base64-image-converter", "Base64 Image", "Encoding", "Images to data URLs, CSS, <img> and Markdown, and back.", "image", ""),
  m("base64-to-pdf", "Base64 to PDF", "Encoding", "Preview, inspect and download a Base64 PDF.", "file-pdf", ""),
  m("base64-to-hex", "Base64 to Hex", "Encoding", "Base64 bytes as hex, C arrays or a hex dump.", "hash-straight", "SGVsbG8="),
  m("url-encoder", "URL Encode", "Encoding", "Percent-encode components, full URLs, form data or path segments.", "link", "https://x.test/?q=a b&c=ü"),
  m("url-decoder", "URL Decode", "Encoding", "Decode percent-encoding (even double-encoded) and inspect query params.", "link-break", "https%3A%2F%2Fx.test%2F%3Fq%3Da%20b"),
  m("html-entity-encoder", "HTML Entities", "Encoding", "Escape HTML as named, decimal or hex entities.", "code", '<div class="a">A & B</div>'),
  m("html-entity-decoder", "HTML Unescape", "Encoding", "Decode every HTML5 named and numeric entity.", "code", "&lt;div&gt;A &amp; B&lt;/div&gt;"),
  m("jwt-decoder", "JWT Decoder", "Encoding", "Decode, verify (HS/RS/PS/ES) and sign JSON Web Tokens.", "identification-card", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature"),
  // Binary & Numbers (9)
  m("binary-to-text", "Binary to Text", "Binary & Numbers", "Binary (8- or 7-bit, spaced or continuous) back to text.", "binary", "01001000 01101001"),
  m("text-to-binary", "Text to Binary", "Binary & Numbers", "Text as UTF-8 bits, bytes or nibbles.", "binary", "Hi"),
  m("hex-to-text", "Hex to Text", "Binary & Numbers", "Hex, \\x, 0x or xxd dumps back to text.", "hash-straight", "48656c6c6f"),
  m("text-to-hex", "Text to Hex", "Binary & Numbers", "Text to hex bytes, C arrays and hex dumps.", "hash-straight", "Hello"),
  m("ascii-table", "ASCII Table", "Binary & Numbers", "Searchable ASCII chart, 0–127 plus Latin-1.", "table", ""),
  m("base-converter", "Base Converter", "Binary & Numbers", "Bases 2–36, fractions, two's complement, IEEE 754.", "number-square-two", "255"),
  m("big-number", "Big Number", "Binary & Numbers", "Arbitrary-precision calculator: huge integers, exact fractions, variables.", "infinity", "12345678901234567890 * 2"),
  m("epoch-converter", "Epoch Converter", "Binary & Numbers", "Unix timestamps (s/ms/µs/ns) to dates in any time zone, and back.", "clock-countdown", "1700000000"),
  m("string-length", "String Stats", "Binary & Numbers", "Characters, bytes, words, lines, graphemes.", "ruler", "Hello 🌍"),
  // Converters (13)
  m("json-to-csv", "JSON to CSV", "Converters", "Flatten nested JSON into CSV — dot-path columns, exploded arrays, any delimiter.", "table", '[{"a":1,"b":2},{"a":3,"b":4}]'),
  m("csv-to-json", "CSV to JSON", "Converters", "Parse CSV into typed JSON: objects, arrays, keyed or NDJSON.", "brackets-square", "a,b\n1,2\n3,4"),
  m("json-to-yaml", "JSON to YAML", "Converters", "Convert JSON to YAML with indent, quoting and flow-style control.", "file-text", '{"a":1,"b":[1,2]}'),
  m("yaml-to-json", "YAML to JSON", "Converters", "Convert YAML — multi-document, anchors and merge keys — into JSON.", "brackets-curly", "a: 1\nb:\n  - 1\n  - 2"),
  m("json-to-xml", "JSON to XML", "Converters", "Convert JSON to XML with attributes, text nodes and CDATA.", "file-code", '{"note":{"to":"ada"}}'),
  m("xml-to-json", "XML to JSON", "Converters", "Convert XML to JSON — attributes, arrays and namespaces.", "brackets-curly", "<note><to>ada</to></note>"),
  m("toml-to-json", "TOML to JSON", "Converters", "Convert TOML into JSON, keeping dates and big integers.", "file-text", 'title = "x"\n[a]\nb = 1'),
  m("json-to-toml", "JSON to TOML", "Converters", "Convert JSON into TOML tables and arrays of tables.", "file-text", '{"title":"x"}'),
  m("json-to-sql", "JSON to SQL", "Converters", "CREATE TABLE and INSERTs for PostgreSQL, MySQL, SQLite, SQL Server and Oracle.", "database", '[{"id":1,"name":"ada"}]'),
  m("csv-to-sql", "CSV to SQL", "Converters", "CSV to typed CREATE TABLE and batched INSERTs for 5 dialects.", "database", "id,name\n1,ada"),
  m("graphviz-to-mermaid", "DOT to Mermaid", "Converters", "Convert Graphviz DOT into a Mermaid flowchart, with preview.", "graph", "digraph { a -> b; }"),
  m("curl-to-code", "cURL to Code", "Converters", "Turn a cURL command into code for 13 HTTP clients.", "terminal-window", "curl -X POST https://api.test -H 'Content-Type: application/json' -d '{\"a\":1}'"),
  m("template-string-merger", "Template Merge", "Converters", "Handlebars-style templates and mail merge from JSON.", "brackets-curly", "Hello {{name}}"),
  // Validators (4)
  m("json-schema-validator", "Schema Validator", "Validators", "Validate JSON against a JSON Schema (draft 07, 2019-09, 2020-12).", "seal-check", '{"name":"ada"}'),
  m("csv-validator", "CSV Validator", "Validators", "Check column counts, quotes, headers, types and uniqueness.", "seal-check", "a,b\n1,2\n3"),
  m("yaml-validator", "YAML Validator", "Validators", "YAML syntax errors plus YAML 1.1 gotchas and style checks.", "seal-check", "a: 1\n b: bad"),
  m("xml-validator", "XML Validator", "Validators", "Well-formedness, namespaces and entities, with line numbers.", "seal-check", "<a><b></a>"),
  // XML (4)
  m("xml-formatter", "XML Formatter", "XML", "Pretty-print or minify XML — comments, CDATA and namespaces kept.", "file-code", "<a><b>1</b></a>"),
  m("xml-viewer", "XML Viewer", "XML", "Tree, stats, element counts and every XPath.", "tree-view", "<root><item id=\"1\"/></root>"),
  m("xml-editor", "XML Editor", "XML", "Edit XML with live validation, format, sort and → JSON.", "pencil-simple", "<root>\n  <a>1</a>\n</root>"),
  m("xpath-tester", "XPath Tester", "XML", "XPath 1.0 with namespaces — node tables or values.", "path", "<root><a>hi</a></root>"),
  // Formatters & Text (12)
  m("css-formatter", "CSS Formatter", "Formatters & Text", "Format CSS, SCSS or Less — or minify.", "paint-brush", "a{color:red}b{margin:0}"),
  m("html-formatter", "HTML Formatter", "Formatters & Text", "Format or minify HTML, with a live preview.", "code", "<div><p>hi</p></div>"),
  m("js-formatter", "JS Formatter", "Formatters & Text", "Prettier for JS, JSX, TypeScript and Flow.", "brackets-curly", "const x={a:1,b:[1,2]}"),
  m("sql-formatter", "SQL Formatter", "Formatters & Text", "Format or minify SQL in 20 dialects.", "database", "select a,b from t where x=1 order by a"),
  m("inline-sql-vars", "Inline SQL Vars", "Formatters & Text", "Inline ?, $1, :name params from JSON or ORM logs.", "database", "select * from t where a = ?"),
  m("stack-trace-formatter", "JS Stack Traces", "Formatters & Text", "Clean Node, Chrome, Firefox and Safari traces.", "list-bullets", "Error: x\n    at foo (a.js:1:2)"),
  m("java-exception-formatter", "Java Traces", "Formatters & Text", "Collapse framework frames and find the root cause.", "list-bullets", "java.lang.NPE\n\tat a.b(Foo.java:1)"),
  m("go-stacktrace-formatter", "Go Panics", "Formatters & Text", "Tidy Go panics and group goroutine dumps.", "list-bullets", "panic: x\ngoroutine 1 [running]:"),
  m("text-toolbox", "Text Toolbox", "Formatters & Text", "40+ case, line and text operations.", "text-aa", "b\na\nb"),
  m("log-privacy-workbench", "Log Workbench", "Formatters & Text", "Parse and filter logs, redact PII and secrets.", "funnel", "INFO token=abc user=ada"),
  m("file-diff-viewer", "File Diff", "Formatters & Text", "Split or unified diff, with a downloadable patch.", "git-diff", "line1\nline2"),
  m("markdown-editor", "Markdown Editor", "Formatters & Text", "Live GFM preview, TOC and HTML export.", "article", "# Hi\n\n- a\n- b"),
  // SQL & Data (7)
  m("data-explorer", "Data Explorer", "SQL & Data", "Profile a CSV or JSON file locally.", "chart-bar", "a,b\n1,2\n3,4"),
  m("csv-viewer", "CSV Viewer", "SQL & Data", "Sortable grid for CSV.", "table", "a,b\n1,2"),
  m("csv-query-sql", "Query CSV", "SQL & Data", "Run real SQL (SQLite) over CSV, TSV or JSON.", "database", "SELECT * WHERE a > 1"),
  m("duckdb-playground", "SQL Analytics", "SQL & Data", "Load CSV/JSON as tables and run analytical SQL locally.", "database", "SELECT 1 as x", { wasm: true }),
  m("sql-playground", "SQLite", "SQL & Data", "SQLite scripts, schema browser and .sqlite import/export.", "database", "CREATE TABLE t(a); INSERT INTO t VALUES (1); SELECT * FROM t;", { wasm: true }),
  m("parquet-viewer", "Parquet Viewer", "SQL & Data", "Inspect Parquet schema, metadata and rows locally.", "table", ""),
  m("ddl-to-diagram", "DDL to ER Diagram", "SQL & Data", "Turn DDL into a Mermaid ER diagram.", "graph", "CREATE TABLE users (id INT PRIMARY KEY, name TEXT);"),
  // Security (7)
  m("hash-generator", "Hash Generator", "Security", "MD5, SHA-2/3, BLAKE, CRC32 and more — verify checksums.", "fingerprint", "hello"),
  m("hmac-tool", "HMAC", "Security", "Sign and verify HMACs — GitHub, Slack, Stripe, AWS.", "key", "message"),
  m("password-generator", "Password Generator", "Security", "Secure random passwords.", "password", ""),
  m("token-generator", "Token Generator", "Security", "Hex, Base64, UUID v4/v7, ULID, NanoID, API keys.", "key", ""),
  m("secret-detector", "Secret Detector", "Security", "Scan for keys and redact them.", "eye-slash", "aws_key=AKIA... token=xyz"),
  m("x509-viewer", "X.509 Viewer", "Security", "Read PEM certificate metadata.", "certificate", "-----BEGIN CERTIFICATE-----"),
  m("security-header-helper", "Security Headers", "Security", "Build CSP, HSTS, CORS headers — or grade existing ones.", "shield-check", ""),
  // Regex & API (6)
  m("regex-tester", "Regex Tester", "Regex & API", "Test JavaScript regular expressions with live highlighting, groups, replace, split and a plain-English explanation.", "asterisk", "\\d+"),
  m("regex-lab-py-go-java", "Regex Flavours", "Regex & API", "Compare regex support across JavaScript, Python, Go, Java, PCRE, .NET and Rust, with escaped code snippets.", "flask", "\\w+"),
  m("graphql-playground-ui", "GraphQL Playground", "Regex & API", "Validate and run GraphQL offline against a schema and mock data — or send it to your endpoint.", "graph", "{ hello }"),
  m("api-workbench", "API Workbench", "Regex & API", "Build and send HTTP requests with an offline mock API; export as curl, fetch or Python.", "paper-plane-tilt", "https://api.github.com/zen"),
  m("mcp-inspector-lite", "MCP Inspector", "Regex & API", "Lint MCP tool schemas, build tools/call requests and read JSON-RPC transcripts.", "plugs", '{"tools":[]}'),
  m("fake-json-api-sw", "Fake JSON API", "Regex & API", "Design offline mock REST endpoints with templates and stateful CRUD collections.", "cloud-arrow-down", "/api/users -> [{\"id\":1}]"),
  // Languages (5)
  m("python-playground-pyodide", "Python", "Languages", "Real CPython in your browser (Pyodide) — stdin, tracebacks and the full standard library.", "file-py", "print('hi')", { wasm: true }),
  m("javascript-playground", "JavaScript", "Languages", "Run JavaScript in an isolated worker with console, tables, top-level await and error line links.", "file-js", "console.log(1+1)"),
  m("go-playground-lite", "Go", "Languages", "Format, lint and outline Go — offline, no compiler.", "file-code", 'package main\nfunc main(){}', { liteNote: "Offline lite mode: formatter and heuristic checks, no compiler." }),
  m("rust-playground-lite", "Rust", "Languages", "Format, lint and outline Rust — offline, no compiler.", "file-code", "fn main() {}", { liteNote: "Offline lite mode: formatter and heuristic checks, no compiler." }),
  m("java-playground-lite", "Java", "Languages", "Format, lint and outline Java — offline, no compiler.", "file-code", "class A {}", { liteNote: "Offline lite mode: formatter and heuristic checks, no compiler." }),
  // Visual & Canvas (4)
  m("openscad-playground", "OpenSCAD", "Visual & Canvas", "Real OpenSCAD in WebAssembly: 3D preview, customizer sliders, STL export.", "cube", "cube(10);", { wasm: true }),
  m("threejs-playground", "Three.js", "Visual & Canvas", "Run three.js modules in a sandbox, with OrbitControls, console and PNG snapshots.", "cube-transparent", "// three.js scene"),
  m("canvas-playground", "Canvas", "Visual & Canvas", "Live 2D canvas coding with animation helpers and PNG export.", "paint-brush-broad", "ctx.fillRect(0,0,50,50)"),
  m("excalidraw-embed", "Whiteboard", "Visual & Canvas", "Sketch diagrams and wireframes; drawings stay in your browser.", "scribble", ""),
  // Diagrams (3)
  m("graphviz-editor", "Graphviz", "Diagrams", "Graphviz DOT rendered to SVG with all 8 layout engines.", "graph", "digraph { a -> b; }"),
  m("mermaid-playground", "Mermaid", "Diagrams", "Mermaid diagrams — 17 types — rendered to SVG with themes.", "flow-arrow", "graph TD; A-->B;"),
  m("plantuml-lite", "PlantUML", "Diagrams", "PlantUML rendered locally via a Mermaid translation; plus server encoding.", "diamonds-four", "@startuml\nA -> B\n@enduml", { liteNote: "Translated to Mermaid and rendered in your browser — no PlantUML server is contacted." }),
  // Generators & DevOps (13)
  m("qr-generator", "QR Generator", "Generators & DevOps", "QR codes for URLs, Wi-Fi, vCards, events and more — and a QR reader.", "qr-code", "https://example.com"),
  m("lorem-generator", "Lorem Ipsum", "Generators & DevOps", "Placeholder text in four vocabularies, as plain text, HTML, Markdown or JSON.", "text-align-left", ""),
  m("random-json-generator", "Random JSON", "Generators & DevOps", "Realistic JSON from a template with {{tokens}} and repeat blocks.", "shuffle", '{"name":"{{name}}"}'),
  m("uuid-generator", "UUID Generator", "Generators & DevOps", "Generate UUID v1/v3/v4/v5/v6/v7 and inspect existing ones.", "fingerprint", ""),
  m("mock-data-generator", "Mock Data", "Generators & DevOps", "Build a schema, get up to 10k rows as JSON, CSV, SQL, XML or YAML.", "table", ""),
  m("mysql-cmd-gen", "MySQL Command", "Generators & DevOps", "mysql / mysqldump commands for backups, restores, CSV and users.", "terminal-window", ""),
  m("tar-cmd-gen", "Tar Command", "Generators & DevOps", "tar commands to create, extract and list archives, plus the zip equivalent.", "terminal-window", ""),
  m("curl-cmd-gen", "cURL Command", "Generators & DevOps", "Build curl requests, plus HTTPie, wget, fetch and Python versions.", "terminal-window", ""),
  m("cron-builder", "Cron Builder", "Generators & DevOps", "Visual cron editor: plain English, next runs by time zone, six output formats.", "calendar-dots", "*/5 * * * *"),
  m("gitignore-generator", "Gitignore", "Generators & DevOps", "Combine 50+ .gitignore templates and test which rule ignores a path.", "git-branch", "node, macos"),
  m("dockerfile-generator", "Dockerfile", "Generators & DevOps", "Dockerfile, .dockerignore and Compose for 11 stacks, with lint hints.", "shipping-container", ""),
  m("env-toolkit", "Env Toolkit", "Generators & DevOps", "Validate, compare and convert .env files (Docker, Kubernetes, CI).", "sliders", "API_KEY=xyz\nPORT=3000"),
  m("gha-explainer", "Actions Explainer", "Generators & DevOps", "Explain a GitHub Actions workflow: jobs, matrix, graph and security lint.", "gear-six", "jobs:\n  build:\n    runs-on: ubuntu-latest"),
  // Image, Colour & SEO (6)
  m("svg-preview", "SVG Preview", "Image, Colour & SEO", "Preview, optimise and convert SVG to data URI, JSX or CSS.", "bezier-curve", '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="20" cy="20" r="10"/></svg>'),
  m("color-picker", "Colour Picker", "Image, Colour & SEO", "Any CSS colour in every format, with scales, harmonies and an eyedropper.", "eyedropper", "#d6006c"),
  m("color-contrast-converter", "Contrast Checker", "Image, Colour & SEO", "WCAG and APCA contrast, fixes, colour-blindness previews and palette matrices.", "circle-half", "#ffffff on #0088b0"),
  m("image-toolkit", "Image Toolkit", "Image, Colour & SEO", "Resize, crop, rotate, filter and convert images to PNG, JPEG, WebP or AVIF.", "image", ""),
  m("seo-inspector-paste-only", "SEO Inspector", "Image, Colour & SEO", "Score pasted HTML: meta tags, headings, social cards and SERP preview.", "magnifying-glass", "<title>Hi</title>"),
  m("jsonld-inspector", "JSON-LD Inspector", "Image, Colour & SEO", "Validate structured data against Google rich-result rules for ~20 types.", "brackets-curly", '{"@context":"https://schema.org"}'),
  // ASCII (6)
  m("ascii-draw", "ASCII Draw", "ASCII", "Draw boxes, lines and arrows on a character grid.", "grid-four", ""),
  m("box-drawing", "Box Drawing", "ASCII", "Frame text or tables with Unicode or ASCII borders.", "square", "hello"),
  m("comment-ascii-art", "Banner Comments", "ASCII", "Section headers and FIGlet banners in any comment syntax.", "text-h", "Header"),
  m("text-to-ascii-figlet", "FIGlet Banner", "ASCII", "38 bundled FIGlet fonts, fully offline.", "text-aa", "Hi"),
  m("image-to-ascii", "Image to ASCII", "ASCII", "Pictures as ASCII, blocks or braille — with colour.", "image", ""),
  m("ascii-tree", "ASCII Tree", "ASCII", "Paths, indented lists or JSON into a file tree — and back.", "tree-structure", "src\n  index.ts"),
  // Time (2)
  m("stopwatch-timer", "Stopwatch & Timers", "Time", "Stopwatch, countdown, Pomodoro, intervals and duration converter.", "timer", ""),
  m("timezone-compare", "Timezone Compare", "Time", "Meeting planner: world clocks, overlap and DST.", "globe-hemisphere-west", ""),
  // Platform (3)
  m("tool-pipelines", "Pipelines", "Platform", "Chain tools together in memory.", "flow-arrow", ""),
  m("saved-workspaces", "Workspaces", "Platform", "Persist inputs and options locally.", "folders", ""),
  m("developer-recipes", "Recipes", "Platform", "Preset multi-step workflows.", "cards-three", ""),
];

export const toolBySlug = (slug: string) => TOOLS.find((t) => t.slug === slug);
export const toolsByCategory = (c: ToolCategory) => TOOLS.filter((t) => t.category === c);
export const categoryBySlug = (slug: string) => CATEGORIES.find((c) => c.slug === slug);
export const categoryByTitle = (title: ToolCategory) => CATEGORIES.find((c) => c.title === title);
export const categoryOfTool = (t: ToolMeta) => categoryByTitle(t.category)!;
export const toolCountIn = (slug: string) =>
  TOOLS.filter((t) => categoryOfTool(t).slug === slug).length;

/** The badge shown on cards and in the tool header. */
export function toolBadge(t: ToolMeta): "live" | "wasm" | "lite" {
  if (t.wasm) return "wasm";
  if (t.liteNote) return "lite";
  return "live";
}

export const plateInk = (p: Plate) => `var(--plate-${p})`;
export const plateTint = (p: Plate) => `var(--plate-${p}-tint)`;

/**
 * Lowercase, split on whitespace. Every word must appear somewhere in
 * name + slug + description + category title. Each word scores 6 for a name
 * prefix match, 4 for a name substring, 2 for a slug substring, 1 otherwise.
 * Results sort by total score, descending.
 */
export function searchTools(query: string): ToolMeta[] {
  const s = query.trim().toLowerCase();
  if (!s) return TOOLS;
  const words = s.split(/\s+/);
  const scored: { t: ToolMeta; score: number }[] = [];
  for (const t of TOOLS) {
    const name = t.title.toLowerCase();
    const hay = `${name} ${t.slug} ${t.description} ${t.category}`.toLowerCase();
    let score = 0;
    let ok = true;
    for (const w of words) {
      if (!hay.includes(w)) { ok = false; break; }
      if (name.startsWith(w)) score += 6;
      else if (name.includes(w)) score += 4;
      else if (t.slug.includes(w)) score += 2;
      else score += 1;
    }
    if (ok) scored.push({ t, score });
  }
  return scored.sort((a, b) => b.score - a.score).map((x) => x.t);
}
