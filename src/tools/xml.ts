import { ToolError, bool, num, str, type Result, type SpecModule, type View } from "./types";
import type { XDoc } from "./lib/C-xml";

/* ── shared examples ─────────────────────────────────────────────────── */

const CATALOG = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Sample catalog: attributes, text, an entity and a comment -->
<catalog xmlns:dc="http://purl.org/dc/elements/1.1/" updated="2026-09-01">
<book id="bk101" lang="en"><author>Gambardella, Matthew</author><title>XML Developer's Guide</title><genre>Computer</genre><price currency="USD">44.95</price><dc:date>2000-10-01</dc:date><description>An in-depth look at creating applications with XML &amp; XSLT.</description></book>
<book id="bk102" lang="en"><author>Ralls, Kim</author><title>Midnight Rain</title><genre>Fantasy</genre><price currency="USD">5.95</price><dc:date>2000-12-16</dc:date><description>A former architect battles corporate zombies, an evil sorceress, and her own childhood to become queen of the world.</description></book>
<book id="bk103" lang="fr"><author>Corets, Eva</author><title>Maeve Ascendant</title><genre>Fantasy</genre><price currency="EUR">5.95</price><dc:date>2000-11-17</dc:date><description/></book>
<!-- out of stock -->
<book id="bk104" lang="en" available="false"><author>Knorr, Stefan</author><title>Creepy Crawlies</title><genre>Horror</genre><price currency="USD">4.95</price><dc:date>2000-12-06</dc:date><description></description></book>
</catalog>`;

const SOAP = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:m="http://www.example.org/stock"><soap:Header><m:Auth soap:mustUnderstand="1"><m:Token>abc123</m:Token></m:Auth></soap:Header><soap:Body><m:GetStockPriceResponse><m:Price currency="USD">34.5</m:Price><m:Symbol>IBM</m:Symbol><m:History><m:Point day="1">33.1</m:Point><m:Point day="2">34.0</m:Point><m:Point day="3">34.5</m:Point></m:History></m:GetStockPriceResponse></soap:Body></soap:Envelope>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
  <title>Example Engineering Blog</title>
  <link href="https://blog.example.com/"/>
  <updated>2026-09-20T18:30:02Z</updated>
  <id>urn:uuid:60a76c80-d399-11d9-b93C-0003939e0af6</id>
  <entry>
    <title>Shipping offline-first tools</title>
    <link href="https://blog.example.com/offline"/>
    <id>urn:uuid:1225c695-cfb8-4ebb-aaaa-80da344efa6a</id>
    <updated>2026-09-20T18:30:02Z</updated>
    <author><name>Ada</name></author>
    <category term="engineering"/>
    <media:thumbnail url="https://blog.example.com/img/offline.png" width="640"/>
  </entry>
  <entry>
    <title>XPath in five minutes</title>
    <link href="https://blog.example.com/xpath"/>
    <id>urn:uuid:3f0b3c4e-7d1a-4b8e-9f00-1b2c3d4e5f60</id>
    <updated>2026-09-12T09:00:00Z</updated>
    <author><name>Grace</name></author>
    <category term="xml"/>
    <category term="tutorial"/>
  </entry>
</feed>`;

const POM = `<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd"><modelVersion>4.0.0</modelVersion><groupId>com.example</groupId><artifactId>billing-api</artifactId><version>2.3.0</version><packaging>jar</packaging><properties><java.version>21</java.version><spring.version>3.3.2</spring.version></properties><dependencies><dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-web</artifactId><version>\${spring.version}</version></dependency><dependency><groupId>org.postgresql</groupId><artifactId>postgresql</artifactId><scope>runtime</scope></dependency><!-- test only --><dependency><groupId>org.junit.jupiter</groupId><artifactId>junit-jupiter</artifactId><scope>test</scope></dependency></dependencies></project>`;

const RSS_CDATA = `<?xml version="1.0"?>
<?xml-stylesheet type="text/xsl" href="rss.xsl"?>
<!DOCTYPE rss [
  <!ENTITY brand "Formatter">
]>
<rss version="2.0"><channel><title>&brand; releases</title><item><title>v2.3</title><description><![CDATA[<p>New <b>XML</b> tools & faster diffs.</p>]]></description><pubDate>Tue, 22 Sep 2026 10:00:00 GMT</pubDate></item><item><title>v2.2</title><description><![CDATA[Bug fixes]]></description></item></channel></rss>`;

const ANDROID = `<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android" android:layout_width="match_parent" android:layout_height="match_parent" android:orientation="vertical" android:padding="16dp"><TextView android:id="@+id/title" android:layout_width="wrap_content" android:layout_height="wrap_content" android:text="@string/app_name" android:textSize="20sp"/><Button android:id="@+id/go" android:layout_width="match_parent" android:layout_height="wrap_content" android:text="Go"></Button></LinearLayout>`;

const PRESERVE = `<doc><title>  Spaces   matter  here? </title><code xml:space="preserve">
def hello():
    print("indentation is data")
</code><para>Mixed <b>bold</b> and <i>italic</i> content.</para></doc>`;

const BROKEN = `<?xml version="1.0"?>
<order id="42">
  <customer>Ada</customer>
  <items>
    <item sku="KB-01">Keyboard</item>
    <item sku="MS-02">Mouse</itm>
  </items>
</order>`;

const XPATH_BOOKS = `<?xml version="1.0"?>
<library>
  <shelf genre="fiction">
    <book id="b1" year="1851"><title>Moby Dick</title><author>Herman Melville</author><price>8.99</price></book>
    <book id="b2" year="1954"><title>The Lord of the Rings</title><author>J. R. R. Tolkien</author><price>22.99</price></book>
    <book id="b3" year="1945"><title>Sword of Honour</title><author>Evelyn Waugh</author><price>12.99</price></book>
  </shelf>
  <shelf genre="reference">
    <book id="b4" year="1998"><title>Sayings of the Century</title><author>Nigel Rees</author><price>8.95</price></book>
    <book id="b5" year="2008"><title>XML in a Nutshell</title><author>Elliotte Rusty Harold</author><price>39.99</price></book>
  </shelf>
  <!-- the magazine rack -->
  <rack><item kind="magazine">Wired</item><item kind="magazine">Byte</item><item kind="paper">The Times</item></rack>
</library>`;

/* ── helpers ─────────────────────────────────────────────────────────── */

const lib = () => import("./lib/C-xml");

async function parseOrThrow(src: string): Promise<XDoc> {
  if (!src.trim()) throw new ToolError("Paste some XML to begin.");
  const { parseStrict, XmlError } = await lib();
  try {
    return parseStrict(src);
  } catch (e) {
    if (e instanceof XmlError) throw new ToolError(e.message);
    throw e;
  }
}

const indentOf = (v: unknown) => (v === "tab" ? "\t" : " ".repeat(Number(v) || 2));
const fmtFormat = (o: Record<string, unknown>) => str(o.mode) !== "minify";

/* ── DOM XPath helpers (xpath-tester) ────────────────────────────────── */

function domPath(n: Node, prefixOf: (uri: string | null) => string | undefined): string {
  if (n.nodeType === 9) return "/";
  if (n.nodeType === 2) {
    const a = n as Attr;
    return domPath(a.ownerElement!, prefixOf) + "/@" + a.name;
  }
  const parent = n.parentNode;
  const sibs = parent ? Array.from(parent.childNodes) : [n];
  let step: string;
  if (n.nodeType === 1) {
    const el = n as Element;
    const same = sibs.filter((s) => s.nodeType === 1 && (s as Element).localName === el.localName && (s as Element).namespaceURI === el.namespaceURI);
    const pfx = el.prefix ?? (el.namespaceURI ? prefixOf(el.namespaceURI) : undefined);
    step = (pfx ? pfx + ":" : "") + el.localName + (same.length > 1 ? `[${same.indexOf(el) + 1}]` : "");
  } else {
    const kind = n.nodeType === 8 ? "comment()" : n.nodeType === 7 ? `processing-instruction('${(n as ProcessingInstruction).target}')` : "text()";
    const same = sibs.filter((s) => (n.nodeType === 3 || n.nodeType === 4 ? s.nodeType === 3 || s.nodeType === 4 : s.nodeType === n.nodeType));
    step = kind + (same.length > 1 ? `[${same.indexOf(n as ChildNode) + 1}]` : "");
  }
  return (parent && parent.nodeType !== 9 ? domPath(parent, prefixOf) : "") + "/" + step;
}

function xpathHint(expr: string): string | null {
  const pairs: [string, string][] = [["[", "]"], ["(", ")"]];
  const noStr = expr.replace(/"[^"]*"|'[^']*'/g, "");
  if ((expr.replace(/[^"]/g, "").length % 2) || (expr.replace(/[^']/g, "").length % 2)) return "A string literal is not closed — check your quotes.";
  for (const [o, c] of pairs) {
    const d = noStr.split(o).length - noStr.split(c).length;
    if (d > 0) return `Missing ${d} closing "${c}".`;
    if (d < 0) return `Unexpected "${c}" — there is no matching "${o}".`;
  }
  if (/\/\/\/|\/$/.test(noStr)) return "A path step is missing after “/”.";
  if (/(^|[^\w)\]'"*.@])(=|!=|<|>)/.test(noStr.trim())) return "An operator is missing its left-hand side.";
  return null;
}

const NODE_KIND: Record<number, string> = { 1: "element", 2: "attribute", 3: "text", 4: "cdata", 7: "pi", 8: "comment", 9: "document" };
const clip = (s: string, n = 120) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/* ── specs ───────────────────────────────────────────────────────────── */

const specs: SpecModule = {
  "xml-formatter": {
    inputs: [{ id: "xml", label: "XML", lang: "xml", placeholder: "Paste XML — comments, CDATA, DOCTYPE and namespaces are all kept" }],
    options: [
      { id: "mode", label: "Mode", type: "segment", choices: [["format", "Format"], ["minify", "Minify"]], default: "format" },
      { id: "indent", label: "Indent", type: "segment", choices: [["2", "2"], ["4", "4"], ["tab", "Tab"]], default: "2", show: fmtFormat },
      { id: "attrWrap", label: "Attrs per line when >", type: "number", default: 0, min: 0, max: 20, hint: "Put each attribute on its own line when an element has more than N attributes (0 = never)", show: fmtFormat },
      { id: "empty", label: "Empty elements", type: "select", choices: [["preserve", "As written"], ["self", "Self-close <a/>"], ["expand", "Expand <a></a>"]], default: "preserve", show: fmtFormat },
      { id: "width", label: "Inline width", type: "number", default: 100, min: 20, max: 400, hint: "Text-only elements stay on one line when it fits this width", show: fmtFormat },
      { id: "space", label: "Space before />", type: "toggle", default: false, show: fmtFormat },
      { id: "comments", label: "Keep comments", type: "toggle", default: true },
    ],
    outLang: "xml",
    async run({ inputs, opts, pipeline }) {
      const doc = await parseOrThrow(inputs.xml);
      const { formatXml, minifyXml, xmlStats } = await lib();
      const minify = str(opts.mode) === "minify";
      const text = minify
        ? minifyXml(doc, { comments: bool(opts.comments) })
        : formatXml(doc, { indent: indentOf(opts.indent), attrWrap: num(opts.attrWrap), empty: str(opts.empty, "preserve") as "preserve", width: num(opts.width, 100), comments: bool(opts.comments), spaceSelfClose: bool(opts.space) });
      if (pipeline) return { text, lang: "xml" };
      const s = xmlStats(doc);
      const { utf8Bytes, savings } = await import("./lib/C-util");
      const before = utf8Bytes(inputs.xml), after = utf8Bytes(text);
      return {
        text,
        lang: "xml",
        filename: minify ? "minified.xml" : "formatted.xml",
        views: [
          { label: minify ? "Minified" : "Formatted", out: { kind: "text", text, lang: "xml", wrap: minify } },
          { label: "Tree", out: { kind: "xmltree", xml: text } },
          {
            label: "Stats",
            out: {
              kind: "stats",
              items: [
                { label: "Input bytes", value: before },
                { label: "Output bytes", value: after, tone: "info" },
                { label: "Size change", value: savings(before, after), tone: after <= before ? "ok" : "warn" },
                { label: "Lines", value: text.split("\n").length },
                { label: "Elements", value: s.elements },
                { label: "Attributes", value: s.attributes },
                { label: "Comments", value: s.comments },
                { label: "CDATA sections", value: s.cdata },
                { label: "Max depth", value: s.maxDepth },
              ],
            },
          },
        ],
      };
    },
    examples: [
      { label: "Book catalog", inputs: { xml: CATALOG }, note: "Comments, namespaces, entities and attribute order survive; short text-only elements stay inline." },
      { label: "SOAP envelope", inputs: { xml: SOAP }, opts: { indent: "4" }, note: "A one-line SOAP response expanded with four-space indent; prefixes are untouched." },
      { label: "Android layout", inputs: { xml: ANDROID }, opts: { attrWrap: 2, empty: "self", space: true }, note: "More than two attributes → one per line, and <Button></Button> becomes <Button />." },
      { label: "RSS + CDATA + DOCTYPE", inputs: { xml: RSS_CDATA }, note: "The DOCTYPE with its internal entity, the stylesheet PI and CDATA blocks are printed verbatim." },
      { label: "xml:space", inputs: { xml: PRESERVE }, note: 'Content inside xml:space="preserve" is left exactly as written; mixed content goes one child per line.' },
      { label: "Minify", inputs: { xml: CATALOG }, opts: { mode: "minify", comments: false }, note: "Minify drops indentation and (with Keep comments off) comments — see the Stats tab for the savings." },
      { label: "Maven POM", inputs: { xml: POM }, opts: { attrWrap: 1 }, note: "Default-namespace POM with the schema attributes wrapped one per line." },
      { label: "Mismatched tag", inputs: { xml: BROKEN }, note: "Errors name the expected tag, where it was opened, and show a code frame.", error: true },
    ],
    steps: ["Paste XML or drop a .xml file.", "Pick indent, attribute wrapping and how empty elements should look — or switch to Minify.", "Check the Tree and Stats tabs; copy or download the result."],
    tips: ["The formatter uses its own lossless tokenizer, so nothing is reordered or re-escaped.", 'Add xml:space="preserve" to an element to keep its content byte-for-byte.'],
  },

  "xml-viewer": {
    inputs: [{ id: "xml", label: "XML", lang: "xml" }],
    options: [
      { id: "text", label: "Show text in outline", type: "toggle", default: true },
      { id: "len", label: "Text preview", type: "number", default: 50, min: 10, max: 400, hint: "Characters of text shown per element", show: (o) => bool(o.text) },
    ],
    async run({ inputs, opts }) {
      const doc = await parseOrThrow(inputs.xml);
      const { xmlStats, outline } = await lib();
      const s = xmlStats(doc);
      const text = outline(doc, num(opts.len, 50), bool(opts.text));
      const names = [...s.names.entries()].sort((a, b) => b[1].count - a[1].count);
      const views: View[] = [
        { label: "Tree", out: { kind: "xmltree", xml: inputs.xml.replace(/^﻿/, "") } },
        { label: "Outline", out: { kind: "text", text } },
        {
          label: "Stats",
          out: {
            kind: "stats",
            items: [
              { label: "Elements", value: s.elements, tone: "info" },
              { label: "Attributes", value: s.attributes },
              { label: "Text nodes", value: s.texts },
              { label: "Max depth", value: s.maxDepth },
              { label: "Distinct names", value: s.names.size },
              { label: "Namespaces", value: s.namespaces.length },
              { label: "Comments", value: s.comments },
              { label: "CDATA", value: s.cdata },
              { label: "Processing instr.", value: s.pis },
              { label: "Bytes", value: new TextEncoder().encode(inputs.xml).length },
            ],
          },
        },
        {
          label: `Elements (${names.length})`,
          out: { kind: "table", columns: ["element", "count", "attributes", "with text", "depths", "parents"], rows: names.map(([k, v]) => [k, v.count, [...v.attrs].join(", "), v.withText, [...v.depths].join(", "), [...v.parents].join(", ")]) },
        },
        { label: "XPaths", out: { kind: "table", columns: ["xpath", "depth", "attributes", "text"], rows: s.paths.map((p) => [p.xpath, p.depth, p.attrs, p.text]) } },
      ];
      if (s.namespaces.length) views.push({ label: "Namespaces", out: { kind: "table", columns: ["prefix", "uri"], rows: s.namespaces } });
      return { text, views };
    },
    examples: [
      { label: "Book catalog", inputs: { xml: CATALOG }, note: "Expand the tree, then open Elements and XPaths for a structural summary." },
      { label: "Atom feed", inputs: { xml: ATOM }, note: "A default namespace plus media: — listed in the Namespaces tab." },
      { label: "SOAP envelope", inputs: { xml: SOAP } },
      { label: "Maven POM", inputs: { xml: POM }, opts: { text: false }, note: "Outline without text: just the element skeleton." },
      { label: "Library", inputs: { xml: XPATH_BOOKS }, opts: { len: 20 }, note: "XPaths index repeated siblings, e.g. /library/shelf[1]/book[2]." },
    ],
  },

  "xml-editor": {
    inputs: [{ id: "xml", label: "XML", lang: "xml" }],
    options: [
      { id: "indent", label: "Indent", type: "segment", choices: [["2", "2"], ["4", "4"], ["tab", "Tab"]], default: "2" },
      { id: "attrWrap", label: "Attrs per line when >", type: "number", default: 0, min: 0, max: 20, hint: "Used by Format (0 = never wrap)" },
      { id: "empty", label: "Empty elements", type: "select", choices: [["preserve", "As written"], ["self", "Self-close"], ["expand", "Expand"]], default: "preserve" },
    ],
    outLang: "xml",
    custom: () => import("./ui/C-XmlEditor"),
    async run({ inputs, opts }) {
      const src = inputs.xml;
      if (!src.trim()) throw new ToolError("Type or paste XML to edit.");
      const { parseXml, formatXml, xmlToJson } = await lib();
      const doc = parseXml(src);
      const errors = doc.issues.filter((x) => x.level === "error");
      const items = doc.issues.map((x) => ({ level: x.level, message: x.message, line: x.line, col: x.col }));
      if (errors.length) {
        return {
          text: `Invalid XML — ${errors.length} error${errors.length > 1 ? "s" : ""}\n` + errors.map((e) => `line ${e.line}, col ${e.col}: ${e.message}`).join("\n"),
          views: [
            { label: `Issues (${items.length})`, out: { kind: "issues", items } },
            { label: "Result", out: { kind: "status", ok: false, title: "Not well-formed", detail: `${errors[0].message}\nLine ${errors[0].line}, column ${errors[0].col}` } },
          ],
        };
      }
      const text = formatXml(doc, { indent: indentOf(opts.indent), attrWrap: num(opts.attrWrap), empty: str(opts.empty, "preserve") as "preserve", width: 100, comments: true });
      return {
        text,
        lang: "xml",
        views: [
          { label: "Formatted", out: { kind: "text", text, lang: "xml" } },
          { label: `Issues (${items.length})`, out: { kind: "issues", items: items.length ? items : [{ level: "ok", message: "Well-formed XML" }] } },
          { label: "Tree", out: { kind: "xmltree", xml: text } },
          { label: "JSON", out: { kind: "text", text: JSON.stringify(xmlToJson(doc), null, 2), lang: "json" } },
        ],
      };
    },
    examples: [
      { label: "Book catalog", inputs: { xml: CATALOG }, note: "Use the toolbar to format, minify, sort attributes or strip comments in place." },
      { label: "Needs fixing", inputs: { xml: `<config>\n  <server host=localhost port="80">\n    <name>api & web</name>\n  </server>\n  <flag enabled>\n</config>` }, note: "Several problems at once: unquoted value, bare &, attribute with no value, unclosed element.", error: true },
      { label: "Unsorted attributes", inputs: { xml: `<svg xmlns="http://www.w3.org/2000/svg" width="120" viewBox="0 0 120 40" height="40">\n  <rect y="4" x="4" width="112" rx="6" height="32" fill="#0088b0"/>\n  <text y="26" x="60" text-anchor="middle" fill="#fff">OK</text>\n</svg>` }, note: "Press “Sort attributes” — only the attribute order changes, whitespace stays." },
      { label: "Atom feed", inputs: { xml: ATOM }, note: "Open the JSON tab for an @attribute / #text mapping of the document." },
      { label: "Undeclared prefix", inputs: { xml: `<root xmlns:a="urn:a">\n  <a:item>ok</a:item>\n  <b:item>no binding for b</b:item>\n</root>` }, error: true },
    ],
    steps: ["Edit on the left — issues update as you type.", "Toolbar buttons rewrite the document in place (Format, Minify, Sort attributes, Remove comments).", "Click an issue to jump to its line; the side panel also shows the Tree and a JSON view."],
  },

  "xpath-tester": {
    inputs: [
      { id: "xml", label: "XML", lang: "xml" },
      { id: "xpath", label: "XPath 1.0 expression", kind: "text", placeholder: "//book[price > 10]/title" },
    ],
    options: [
      { id: "type", label: "Result type", type: "segment", choices: [["auto", "Auto"], ["string", "String"], ["number", "Number"], ["boolean", "Boolean"]], default: "auto" },
      { id: "output", label: "Copy as", type: "segment", choices: [["value", "Values"], ["xml", "XML"], ["path", "XPaths"]], default: "value", hint: "What the text output contains for node-sets", show: (o) => str(o.type) === "auto" },
      { id: "ns", label: "Extra namespaces", type: "text", default: "", placeholder: "p=urn:uri q=urn:other", width: 220, hint: "Prefixes declared in the document are registered automatically; the default namespace is bound to d:" },
    ],
    async run({ inputs, opts }) {
      const src = inputs.xml.replace(/^﻿/, "");
      if (!src.trim()) throw new ToolError("Paste an XML document to query.");
      const expr = inputs.xpath.trim() || "/*";
      const doc = new DOMParser().parseFromString(src, "application/xml");
      if (doc.getElementsByTagName("parsererror").length) {
        const { parseXml } = await lib();
        const e = parseXml(src).issues.find((x) => x.level === "error");
        throw new ToolError(e ? `The XML is not well-formed: ${e.message} (line ${e.line}, column ${e.col})` : "The XML is not well-formed.");
      }
      // Namespaces: every xmlns:p in the document, the default namespace as d:, then user extras.
      const ns = new Map<string, string>();
      let defaultNs = "";
      doc.querySelectorAll("*").forEach((el) => {
        for (const a of Array.from(el.attributes)) {
          if (a.name === "xmlns" && a.value && !defaultNs) defaultNs = a.value;
          else if (a.name.startsWith("xmlns:") && !ns.has(a.name.slice(6))) ns.set(a.name.slice(6), a.value);
        }
      });
      if (defaultNs && !ns.has("d")) ns.set("d", defaultNs);
      for (const m of str(opts.ns).matchAll(/([A-Za-z_][\w.-]*)\s*=\s*("[^"]*"|'[^']*'|\S+)/g)) ns.set(m[1], m[2].replace(/^["']|["']$/g, ""));
      const resolver = (p: string | null) => (p ? ns.get(p) ?? null : null);
      const uriToPrefix = (u: string | null) => [...ns.entries()].find(([, v]) => v === u)?.[0];
      const want = str(opts.type);
      const typeCode = { auto: 0, number: 1, string: 2, boolean: 3 }[want] ?? 0;
      let r: XPathResult;
      try {
        r = doc.evaluate(expr, doc, resolver as XPathNSResolver, typeCode, null);
      } catch (e) {
        const raw = ((e as Error).message || "").replace(/^Failed to execute 'evaluate' on 'Document':\s*/, "");
        const hint = xpathHint(expr) ?? (/namespace|prefix/i.test(raw) ? `Unknown prefix. Registered prefixes: ${[...ns.keys()].join(", ") || "none"}.` : "");
        throw new ToolError(`Invalid XPath expression: ${raw && raw !== "Error" ? raw : `“${expr}” could not be parsed.`}${hint ? "\n" + hint : ""}`);
      }
      const nsTable: View = { label: "Namespaces", out: { kind: "table", columns: ["prefix", "uri"], rows: [...ns.entries()].map(([p, u]) => [p + (p === "d" && u === defaultNs ? "  (default)" : ""), u]) } };
      const notes: string[] = [];
      if (r.resultType === 1 || r.resultType === 2 || r.resultType === 3) {
        const v = r.resultType === 1 ? r.numberValue : r.resultType === 2 ? r.stringValue : r.booleanValue;
        const kind = r.resultType === 1 ? "number" : r.resultType === 2 ? "string" : "boolean";
        const text = String(v);
        return {
          text,
          views: [
            { label: "Result", out: { kind: "stats", items: [{ label: `${kind} result`, value: text === "" ? "(empty string)" : text, tone: kind === "boolean" ? (v ? "ok" : "bad") : "info" }] } },
            ...(ns.size ? [nsTable] : []),
          ],
        };
      }
      const nodes: Node[] = [];
      const snap = doc.evaluate(expr, doc, resolver as XPathNSResolver, 7, null);
      for (let k = 0; k < snap.snapshotLength; k++) nodes.push(snap.snapshotItem(k)!);
      const ser = new XMLSerializer();
      const valueOf = (n: Node) => (n.nodeType === 1 || n.nodeType === 9 ? (n.textContent ?? "").trim().replace(/\s+/g, " ") : n.nodeType === 2 ? (n as Attr).value : n.nodeValue ?? "");
      const nameOf = (n: Node) => (n.nodeType === 1 || n.nodeType === 2 ? (n as Element).nodeName : n.nodeType === 7 ? (n as ProcessingInstruction).target : "");
      const outer = (n: Node) => (n.nodeType === 2 ? `${(n as Attr).name}="${(n as Attr).value}"` : ser.serializeToString(n));
      const rows = nodes.map((n, k) => [k + 1, NODE_KIND[n.nodeType] ?? String(n.nodeType), nameOf(n), clip(valueOf(n)), domPath(n, uriToPrefix), clip(outer(n).replace(/\s+xmlns(:\w+)?="[^"]*"/g, ""), 200)]);
      if (!nodes.length && defaultNs && !/\bd:/.test(expr) && /(^|\/)[A-Za-z_]/.test(expr))
        notes.push(`No match. This document has a default namespace (${defaultNs}) — unprefixed names only match elements in no namespace. Use the d: prefix, e.g. //d:${doc.documentElement.localName}.`);
      const out = str(opts.output);
      const text = nodes.map((n) => (out === "xml" ? outer(n) : out === "path" ? domPath(n, uriToPrefix) : valueOf(n))).join("\n");
      return {
        text,
        notes,
        views: [
          { label: `Nodes (${nodes.length})`, out: nodes.length ? { kind: "table", columns: ["type", "name", "value / text", "xpath", "outer xml"], rows: rows.map((r) => r.slice(1)) } : { kind: "status", ok: false, title: "No nodes matched", detail: `Expression: ${expr}` } },
          { label: "Text", out: { kind: "text", text, lang: out === "xml" ? "xml" : "text" } },
          ...(ns.size ? [nsTable] : []),
        ],
      };
    },
    examples: [
      { label: "Filter by price", inputs: { xml: XPATH_BOOKS, xpath: "//book[price > 10]/title" }, note: "A predicate compares a child element's number value." },
      { label: "count()", inputs: { xml: XPATH_BOOKS, xpath: "count(//book)" }, note: "Functions return numbers, strings or booleans instead of nodes." },
      { label: "Attributes", inputs: { xml: XPATH_BOOKS, xpath: "//book[@year < 1950]/@id" }, note: "Select attribute nodes with @; compare them numerically." },
      { label: "contains()", inputs: { xml: XPATH_BOOKS, xpath: "//book[contains(title, 'the') or starts-with(author, 'J.')]/title" } },
      { label: "Axes", inputs: { xml: XPATH_BOOKS, xpath: "//title[.='Moby Dick']/ancestor::shelf/@genre | //book[@id='b1']/following-sibling::book/title" }, opts: { output: "path" }, note: "ancestor:: climbs up, following-sibling:: moves right; | unions two node-sets." },
      { label: "position() / last()", inputs: { xml: XPATH_BOOKS, xpath: "//shelf/book[last()]/title | //rack/item[position() <= 2]" } },
      { label: "SOAP (prefixes)", inputs: { xml: SOAP, xpath: "//m:Point[@day > 1]" }, opts: { output: "xml" }, note: "soap: and m: are registered from the document's own xmlns declarations." },
      { label: "Atom (default ns)", inputs: { xml: ATOM, xpath: "//d:entry[d:category/@term='xml']/d:title" }, note: "The default namespace is bound to d: — unprefixed //entry would match nothing." },
      { label: "Sum as string", inputs: { xml: XPATH_BOOKS, xpath: "concat('Total: ', sum(//price))" } },
      { label: "Bad expression", inputs: { xml: XPATH_BOOKS, xpath: "//book[" }, error: true },
    ],
    steps: ["Paste XML and type an XPath 1.0 expression.", "Node-sets become a table with each node's own XPath and outer XML; functions return a single value.", "Namespaced documents: use the document's prefixes, or d: for the default namespace."],
  },
};

export default specs;

export type { Result };
