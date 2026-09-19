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
  | "Image & Color & SEO"
  | "ASCII"
  | "Time"
  | "Platform";

export type ToolMeta = {
  slug: string;
  title: string;
  category: ToolCategory;
  description: string;
  guideSteps: string[];
  exampleInput: string;
  tips: string[];
  faq: { q: string; a: string }[];
  clientOnly: true;
  wasm?: boolean;
  liteNote?: string;
};

export const CATEGORIES: { slug: string; title: ToolCategory; blurb: string }[] = [
  { slug: "json", title: "JSON", blurb: "Format, validate, view, diff and query JSON." },
  { slug: "encoding", title: "Encoding", blurb: "Base64, URL, HTML entities, JWT." },
  { slug: "binary-numbers", title: "Binary & Numbers", blurb: "Binary, hex, ASCII, bases, epochs." },
  { slug: "converters", title: "Converters", blurb: "JSON/YAML/XML/CSV/TOML/SQL/cURL." },
  { slug: "validators", title: "Validators", blurb: "Schemas and syntax checks." },
  { slug: "xml", title: "XML", blurb: "Format, view, edit, XPath." },
  { slug: "formatters-text", title: "Formatters & Text", blurb: "CSS/HTML/JS/SQL, stack traces, text." },
  { slug: "sql-data", title: "SQL & Data", blurb: "CSV grids, SQL, DuckDB, Parquet." },
  { slug: "security", title: "Security", blurb: "Hashes, passwords, tokens, headers." },
  { slug: "regex-api", title: "Regex & API", blurb: "Regex labs, GraphQL/API/MCP mocks." },
  { slug: "languages", title: "Languages", blurb: "Wasm playgrounds, 100% client-only lite mode." },
  { slug: "visual-canvas", title: "Visual & Canvas", blurb: "3D, canvas, whiteboard embeds." },
  { slug: "diagrams", title: "Diagrams", blurb: "Graphviz, Mermaid, PlantUML-lite." },
  { slug: "generators-devops", title: "Generators & DevOps", blurb: "QR, UUID, mock data, CLI builders." },
  { slug: "image-color-seo", title: "Image & Color & SEO", blurb: "SVG, colors, images, SEO paste-only." },
  { slug: "ascii", title: "ASCII", blurb: "ASCII art, boxes, trees." },
  { slug: "time", title: "Time", blurb: "Timers, epochs, timezones." },
  { slug: "platform", title: "Platform", blurb: "Pipelines, workspaces, recipes." },
];

function m(
  slug: string,
  title: string,
  category: ToolCategory,
  description: string,
  exampleInput = "",
  extra: Partial<ToolMeta> = {}
): ToolMeta {
  return {
    slug,
    title,
    category,
    description,
    guideSteps: [
      `Open ${title} – everything runs locally in your browser.`,
      "Paste input or click Load Example, adjust options.",
      "Review live output, fix highlighted errors.",
      "Copy, Download, or Share via URL hash; use Send to Pipeline to chain tools.",
    ],
    exampleInput,
    tips: ["Use Load Example to learn the format.", "Copy/Download preserves your result.", "Share creates a URL hash – no server upload."],
    faq: [
      { q: "Is my data uploaded?", a: "No. All processing is client-side. Share links encode data in the URL hash locally." },
      { q: "Does it work offline?", a: "Yes after first load for core tools. Wasm tools need one-time download." },
      { q: "What are limits?", a: "Browser memory. For very large files use chunked options in Data Explorer / Log Workbench." },
    ],
    clientOnly: true,
    ...extra,
  };
}

export const TOOLS: ToolMeta[] = [
  // JSON (11)
  m("json-formatter", "JSON Formatter", "JSON", "Beautify and indent JSON.", '{\n  "name": "ada",\n  "roles": ["admin","dev"]\n}'),
  m("json-validator", "JSON Validator", "JSON", "Verify JSON syntax with line errors.", '{"a":1,}'),
  m("json-minifier", "JSON Minifier", "JSON", "Compress JSON to one line.", '{\n  "a": 1,\n  "b": [1,2]\n}'),
  m("json-viewer", "JSON Viewer", "JSON", "Collapsible tree for nested JSON.", '{"user":{"name":"ada","tags":["x","y"]}}'),
  m("json-diff", "JSON Diff & Compare", "JSON", "Side-by-side semantic diff of two JSON docs.", '{"a":1,"b":2}'),
  m("json-escape", "JSON Escape", "JSON", "Escape JSON for string embedding.", '{"q":"a\\"b\\n"}'),
  m("json-unescape", "JSON Unescape", "JSON", "Unescape embedded JSON strings.", '"{\\"a\\":1}"'),
  m("json-to-base64", "JSON to Base64", "JSON", "Encode JSON as Base64.", '{"hello":"world"}'),
  m("json-to-json-schema", "JSON to JSON Schema", "JSON", "Infer JSON Schema from sample JSON.", '{"name":"ada","age":36}'),
  m("jq-playground", "JQ Playground", "JSON", "Filter JSON with jq-style paths (client subset).", '{"users":[{"name":"ada"}]}'),
  m("jsonpath-playground", "JSONPath Playground", "JSON", "Query JSON with JSONPath.", '{"store":{"book":[{"title":"A"}]}}'),
  // Encoding (10 -> split html into 2 = 10)
  m("base64-encoder", "Base64 Encoder", "Encoding", "Encode text/files to Base64.", "Hello, world!"),
  m("base64-decoder", "Base64 Decoder", "Encoding", "Decode Base64 to text.", "SGVsbG8sIHdvcmxkIQ=="),
  m("base64-image-converter", "Base64 Image Converter", "Encoding", "Images <-> data URLs via FileReader/Canvas.", ""),
  m("base64-to-pdf", "Base64 to PDF", "Encoding", "Preview/download Base64 as PDF blob.", ""),
  m("base64-to-hex", "Base64 to Hex", "Encoding", "Base64 bytes to hex.", "SGVsbG8="),
  m("url-encoder", "URL Encoder", "Encoding", "Percent-encode URLs.", "https://x.test/?q=a b&c=ü"),
  m("url-decoder", "URL Decoder", "Encoding", "Decode percent-encoded URLs.", "https%3A%2F%2Fx.test%2F%3Fq%3Da%20b"),
  m("html-entity-encoder", "HTML Entity Encoder", "Encoding", "Escape <>&\"' to entities.", '<div class="a">A & B</div>'),
  m("html-entity-decoder", "HTML Entity Decoder", "Encoding", "Unescape entities to characters.", "&lt;div&gt;A &amp; B&lt;/div&gt;"),
  m("jwt-decoder", "JWT Decoder", "Encoding", "Decode header/payload, verify HMAC via SubtleCrypto.", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature"),
  // Binary & Numbers (9)
  m("binary-to-text", "Binary to Text", "Binary & Numbers", "8-bit binary to text.", "01001000 01101001"),
  m("text-to-binary", "Text to Binary", "Binary & Numbers", "Text to 8-bit binary.", "Hi"),
  m("hex-to-text", "Hex to Text", "Binary & Numbers", "Hex bytes to UTF-8 text.", "48656c6c6f"),
  m("text-to-hex", "Text to Hex", "Binary & Numbers", "Text to hex.", "Hello"),
  m("ascii-table", "ASCII Table", "Binary & Numbers", "Reference 0-127 dec/hex/bin/char.", ""),
  m("base-converter", "Number Base Converter", "Binary & Numbers", "Convert bin/oct/dec/hex via BigInt.", "255"),
  m("big-number", "Big Number", "Binary & Numbers", "Arbitrary precision via BigInt.", "12345678901234567890 * 2"),
  m("epoch-converter", "Timestamp Converter", "Binary & Numbers", "Unix epoch <-> ISO dates.", "1700000000"),
  m("string-length", "String Length Calculator", "Binary & Numbers", "Chars, bytes, words, lines, graphemes.", "Hello 🌍"),
  // Converters (13)
  m("json-to-csv", "JSON to CSV", "Converters", "Flatten JSON arrays to CSV.", '[{"a":1,"b":2},{"a":3,"b":4}]'),
  m("csv-to-json", "CSV to JSON", "Converters", "Parse CSV to JSON.", "a,b\n1,2\n3,4"),
  m("json-to-yaml", "JSON to YAML", "Converters", "JSON -> YAML via js-yaml.", '{"a":1,"b":[1,2]}'),
  m("yaml-to-json", "YAML to JSON", "Converters", "YAML -> JSON via js-yaml.", "a: 1\nb:\n  - 1\n  - 2"),
  m("json-to-xml", "JSON to XML", "Converters", "JSON -> XML.", '{"note":{"to":"ada"}}'),
  m("xml-to-json", "XML to JSON", "Converters", "XML -> JSON via fast-xml-parser.", "<note><to>ada</to></note>"),
  m("toml-to-json", "TOML to JSON", "Converters", "TOML -> JSON.", 'title = "x"\n[a]\nb = 1'),
  m("json-to-toml", "JSON to TOML", "Converters", "JSON -> TOML.", '{"title":"x"}'),
  m("json-to-sql", "JSON to SQL", "Converters", "Generate CREATE TABLE + INSERTs.", '[{"id":1,"name":"ada"}]'),
  m("csv-to-sql", "CSV to SQL", "Converters", "CSV -> CREATE TABLE + INSERTs.", "id,name\n1,ada"),
  m("graphviz-to-mermaid", "Graphviz to Mermaid", "Converters", "DOT -> Mermaid subset.", "digraph { a -> b; }"),
  m("curl-to-code", "cURL to Code", "Converters", "cURL -> JS/Python fetch snippets.", "curl -X POST https://api.test -H 'Content-Type: application/json' -d '{\"a\":1}'"),
  m("template-string-merger", "Template String Merger", "Converters", "Merge {{keys}} with JSON values.", "Hello {{name}}"),
  // Validators (4)
  m("json-schema-validator", "JSON Schema Validator", "Validators", "Validate JSON against Schema (subset/AJV-lite).", '{"name":"ada"}'),
  m("csv-validator", "CSV Validator", "Validators", "Check column counts, quotes, headers.", "a,b\n1,2\n3"),
  m("yaml-validator", "YAML Validator", "Validators", "YAML syntax check with line errors.", "a: 1\n b: bad"),
  m("xml-validator", "XML Validator", "Validators", "Well-formedness via DOMParser.", "<a><b></a>"),
  // XML (4)
  m("xml-formatter", "XML Formatter", "XML", "Pretty-print XML.", "<a><b>1</b></a>"),
  m("xml-viewer", "XML Viewer", "XML", "Expandable node tree.", "<root><item id=\"1\"/></root>"),
  m("xml-editor", "XML Editor", "XML", "Edit with lint + highlighting.", "<root>\n  <a>1</a>\n</root>"),
  m("xpath-tester", "XPath Tester", "XML", "Evaluate XPath via document.evaluate.", "<root><a>hi</a></root>"),
  // Formatters & Text (12)
  m("css-formatter", "CSS Formatter", "Formatters & Text", "Prettify CSS.", "a{color:red}b{margin:0}"),
  m("html-formatter", "HTML Formatter", "Formatters & Text", "Indent HTML.", "<div><p>hi</p></div>"),
  m("js-formatter", "JS Formatter", "Formatters & Text", "Format JS/TS via prettier (lazy).", "const x={a:1,b:[1,2]}"),
  m("sql-formatter", "SQL Formatter", "Formatters & Text", "Format SQL dialects.", "select a,b from t where x=1 order by a"),
  m("inline-sql-vars", "Inline SQL Variables", "Formatters & Text", "Inline ?/:vars into SQL.", "select * from t where a = ?"),
  m("stack-trace-formatter", "Stack Trace Formatter", "Formatters & Text", "Readable stack traces.", "Error: x\n    at foo (a.js:1:2)"),
  m("java-exception-formatter", "Java Exception Formatter", "Formatters & Text", "Format Java traces.", "java.lang.NPE\n\tat a.b(Foo.java:1)"),
  m("go-stacktrace-formatter", "Go Stacktrace Formatter", "Formatters & Text", "Format Go panics.", "panic: x\ngoroutine 1 [running]:"),
  m("text-toolbox", "Text Toolbox", "Formatters & Text", "Case, sort, dedupe, counts.", "b\na\nb"),
  m("log-privacy-workbench", "Log & Privacy Workbench", "Formatters & Text", "Filter + redact secrets in logs.", "INFO token=abc user=ada"),
  m("file-diff-viewer", "File Diff Viewer", "Formatters & Text", "Unified/side-by-side text diff.", "line1\nline2"),
  m("markdown-editor", "Markdown Editor", "Formatters & Text", "Live Markdown preview.", "# Hi\n\n- a\n- b"),
  // SQL & Data (7)
  m("data-explorer", "Data Explorer", "SQL & Data", "Profile CSV/JSON locally.", "a,b\n1,2\n3,4"),
  m("csv-viewer", "CSV Viewer", "SQL & Data", "Sortable grid for CSV.", "a,b\n1,2"),
  m("csv-query-sql", "CSV Query as SQL", "SQL & Data", "Subset SQL over CSV (client).", "SELECT * WHERE a > 1"),
  m("duckdb-playground", "DuckDB Playground", "SQL & Data", "Analytical SQL (wasm lazy).", "SELECT 1 as x", { wasm: true, liteNote: "Loads duckdb-wasm on demand. Offline after first load." }),
  m("sql-playground", "SQL Playground", "SQL & Data", "SQLite in-browser (sql.js lazy).", "CREATE TABLE t(a); INSERT INTO t VALUES (1); SELECT * FROM t;", { wasm: true }),
  m("parquet-viewer", "Parquet Viewer", "SQL & Data", "Inspect parquet via DuckDB-wasm.", "", { wasm: true }),
  m("ddl-to-diagram", "DDL to Diagram", "SQL & Data", "DDL -> Mermaid ER.", "CREATE TABLE users (id INT PRIMARY KEY, name TEXT);"),
  // Security (7)
  m("hash-generator", "Hash Generator", "Security", "MD5/SHA via SubtleCrypto + JS fallback.", "hello"),
  m("hmac-tool", "HMAC Tool", "Security", "HMAC-SHA256 sign/verify.", "message"),
  m("password-generator", "Password Generator", "Security", "Secure random via getRandomValues.", ""),
  m("token-generator", "Secret Token Generator", "Security", "UUID/hex/base64 tokens.", ""),
  m("secret-detector", "Secret Detector", "Security", "Regex scan + redact.", "aws_key=AKIA... token=xyz"),
  m("x509-viewer", "X.509 Viewer", "Security", "Parse PEM cert metadata (client).", "-----BEGIN CERTIFICATE-----"),
  m("security-header-helper", "Security Header Helper", "Security", "Build CSP/HSTS/CORS headers.", ""),
  // Regex & API (6)
  m("regex-tester", "Regex Tester", "Regex & API", "JS RegExp live tester.", "\\d+"),
  m("regex-lab-py-go-java", "Regex Lab (Py/Go/Java)", "Regex & API", "Compare flavors; JS engine + notes.", "\\w+"),
  m("graphql-playground-ui", "GraphQL Playground UI", "Regex & API", "Compose queries; CORS-limited.", "{ hello }"),
  m("api-workbench", "API Workbench", "Regex & API", "fetch() runner; CORS applies, no proxy.", "https://api.github.com/zen"),
  m("mcp-inspector-lite", "MCP Inspector Lite", "Regex & API", "Inspect MCP schemas paste-only.", '{"tools":[]}'),
  m("fake-json-api-sw", "Fake JSON API", "Regex & API", "Service-Worker mock endpoints.", "/api/users -> [{\"id\":1}]"),
  // Languages (5 lite)
  m("python-playground-pyodide", "Python Playground", "Languages", "Pyodide wasm; lite, no server.", "print('hi')", { wasm: true, liteNote: "Client-only Pyodide. Large download once." }),
  m("javascript-playground", "JavaScript Playground", "Languages", "Run JS in worker/iframe sandbox.", "console.log(1+1)"),
  m("go-playground-lite", "Go Playground Lite", "Languages", "Educational subset; full toolchain needs server (out of scope).", 'package main\nfunc main(){}', { liteNote: "Client-only lite mode." }),
  m("rust-playground-lite", "Rust Playground Lite", "Languages", "Snippet checks; rustc needs server (out of scope).", "fn main() {}", { liteNote: "Client-only lite mode." }),
  m("java-playground-lite", "Java Playground Lite", "Languages", "Syntax preview; JVM needs server (out of scope).", "class A {}", { liteNote: "Client-only lite mode." }),
  // Visual & Canvas (4)
  m("openscad-playground", "OpenSCAD Playground", "Visual & Canvas", "Wasm preview (lazy).", "cube(10);", { wasm: true }),
  m("threejs-playground", "Three.js Playground", "Visual & Canvas", "WebGL snippet runner.", "// three.js scene"),
  m("canvas-playground", "Canvas Playground", "Visual & Canvas", "2D canvas live code.", "ctx.fillRect(0,0,50,50)"),
  m("excalidraw-embed", "Excalidraw Embed", "Visual & Canvas", "Whiteboard embed; drawings stay local.", ""),
  // Diagrams (3)
  m("graphviz-editor", "Graphviz Editor", "Diagrams", "DOT -> SVG via hpcc-wasm.", "digraph { a -> b; }"),
  m("mermaid-playground", "Mermaid Playground", "Diagrams", "Mermaid -> SVG.", "graph TD; A-->B;"),
  m("plantuml-lite", "PlantUML Lite", "Diagrams", "Encode only; server render out of scope.", "@startuml\nA -> B\n@enduml", { liteNote: "Client encode only, no server fetch." }),
  // Generators & DevOps (13)
  m("qr-generator", "QR Generator", "Generators & DevOps", "Text/URL -> QR canvas.", "https://example.com"),
  m("lorem-generator", "Lorem Generator", "Generators & DevOps", "Placeholder text.", ""),
  m("random-json-generator", "Random JSON Generator", "Generators & DevOps", "Synthetic JSON via faker.", '{"name":"{{name}}"}'),
  m("uuid-generator", "UUID Generator", "Generators & DevOps", "v4 via randomUUID.", ""),
  m("mock-data-generator", "Mock Data Generator", "Generators & DevOps", "Tabular synthetic data.", ""),
  m("mysql-cmd-gen", "MySQL Command Generator", "Generators & DevOps", "Build mysql CLI.", ""),
  m("tar-cmd-gen", "Tar Command Generator", "Generators & DevOps", "Build tar CLI.", ""),
  m("curl-cmd-gen", "Curl Command Generator", "Generators & DevOps", "Build curl CLI.", ""),
  m("cron-builder", "Cron Builder", "Generators & DevOps", "Visual cron + plain English.", "*/5 * * * *"),
  m("gitignore-generator", "Gitignore Generator", "Generators & DevOps", "Templates concat.", "node, macos"),
  m("dockerfile-generator", "Dockerfile Generator", "Generators & DevOps", "Dockerfile + Compose wizard.", ""),
  m("env-toolkit", "Env Toolkit", "Generators & DevOps", "Validate/compare .env.", "API_KEY=xyz\nPORT=3000"),
  m("gha-explainer", "GHA Explainer", "Generators & DevOps", "Explain workflow YAML.", "jobs:\n  build:\n    runs-on: ubuntu-latest"),
  // Image/Color/SEO (6)
  m("svg-preview", "SVG Preview", "Image & Color & SEO", "Live SVG render + zoom.", '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="20" cy="20" r="10"/></svg>'),
  m("color-picker", "Color Picker", "Image & Color & SEO", "Pick/eyedropper + formats.", "#D97757"),
  m("color-contrast-converter", "Color Contrast", "Image & Color & SEO", "HEX/RGB/HSL + WCAG ratio.", "#ffffff on #D97757"),
  m("image-toolkit", "Image Toolkit", "Image & Color & SEO", "Resize/compress/convert via canvas.", ""),
  m("seo-inspector-paste-only", "SEO Inspector", "Image & Color & SEO", "Pasted HTML only; live fetch needs proxy (out of scope).", "<title>Hi</title>"),
  m("jsonld-inspector", "JSON-LD Inspector", "Image & Color & SEO", "Parse/validate JSON-LD.", '{"@context":"https://schema.org"}'),
  // ASCII (6)
  m("ascii-draw", "ASCII Draw", "ASCII", "Grid canvas for boxes/lines.", ""),
  m("box-drawing", "Box Drawing", "ASCII", "Unicode borders around text.", "hello"),
  m("comment-ascii-art", "Comment ASCII Art", "ASCII", "Banner comments.", "Header"),
  m("text-to-ascii-figlet", "Text to ASCII Art", "ASCII", "FIGlet banners.", "Hi"),
  m("image-to-ascii", "Image to ASCII", "ASCII", "Pixels -> chars via canvas.", ""),
  m("ascii-tree", "ASCII Tree", "ASCII", "Indented list -> tree.", "src\n  index.ts"),
  // Time (2)
  m("stopwatch-timer", "Stopwatch & Timer", "Time", "performance.now timers.", ""),
  m("timezone-compare", "Timezone Compare", "Time", "Intl-based world clocks.", ""),
  // Platform (3)
  m("tool-pipelines", "Tool Pipelines", "Platform", "Chain tools in-memory.", ""),
  m("saved-workspaces", "Saved Workspaces", "Platform", "Persist inputs locally.", ""),
  m("developer-recipes", "Developer Recipes", "Platform", "Preset multi-step workflows.", ""),
];

export const toolBySlug = (slug: string) => TOOLS.find((t) => t.slug === slug);
export const toolsByCategory = (c: ToolCategory) => TOOLS.filter((t) => t.category === c);
