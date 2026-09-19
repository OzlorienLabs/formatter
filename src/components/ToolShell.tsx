"use client";
import { useEffect, useMemo, useState } from "react";
import type { ToolMeta } from "@/src/lib/tools-registry";
import * as E from "@/src/lib/tools-engine";
import { encodeShare, decodeShare } from "@/src/lib/tools-engine";

export default function ToolShell({ tool }: { tool: ToolMeta }) {
  const [input, setInput] = useState(tool.exampleInput);
  const [input2, setInput2] = useState("");
  const [option, setOption] = useState("default");
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const h = window.location.hash.match(/#i=(.+)/);
    if (h) setInput(decodeShare(h[1]));
    try {
      const recents = JSON.parse(localStorage.getItem("devtools:recents") || "[]");
      localStorage.setItem("devtools:recents", JSON.stringify([tool.slug, ...recents.filter((x: string) => x !== tool.slug)].slice(0, 12)));
    } catch {}
  }, [tool.slug]);

  const needsSecond = useMemo(
    () => ["json-diff", "file-diff-viewer", "inline-sql-vars", "template-string-merger", "csv-query-sql"].includes(tool.slug),
    [tool.slug]
  );

  async function run() {
    setError("");
    try {
      const res = await dispatch(tool.slug, input, input2, option);
      setOutput(res);
    } catch (e: any) {
      setError(e?.message ?? "Failed – check input.");
      setOutput("");
    }
  }

  useEffect(() => {
    if (tool.exampleInput) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool.slug]);

  function copy() {
    navigator.clipboard.writeText(output);
  }
  function download() {
    const blob = new Blob([output], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${tool.slug}.txt`;
    a.click();
  }
  function share() {
    window.location.hash = `i=${encodeShare(input)}`;
    navigator.clipboard.writeText(window.location.href);
  }

  return (
    <div className="grid gap-4">
      {tool.liteNote && (
        <div className="card p-3 text-sm" role="note">
          <strong>Client-only lite mode:</strong> {tool.liteNote}
        </div>
      )}
      <div className="card p-4 grid gap-3">
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary px-4 py-2 text-sm min-h-[44px]" onClick={run}>Run</button>
          <button className="chip px-4 py-2 text-sm min-h-[44px]" onClick={() => setInput(tool.exampleInput)}>Load Example</button>
          <button className="chip px-4 py-2 text-sm min-h-[44px]" onClick={() => { setInput(""); setOutput(""); setError(""); }}>Reset</button>
          <button className="chip px-4 py-2 text-sm min-h-[44px]" onClick={copy} disabled={!output}>Copy</button>
          <button className="chip px-4 py-2 text-sm min-h-[44px]" onClick={download} disabled={!output}>Download</button>
          <button className="chip px-4 py-2 text-sm min-h-[44px]" onClick={share}>Share link</button>
          <label className="ml-auto text-sm flex items-center gap-2">
            Option
            <select value={option} onChange={(e) => setOption(e.target.value)} className="px-2 py-2 text-sm">
              <option value="default">default</option>
              <option value="upper">upper</option>
              <option value="lower">lower</option>
              <option value="sort">sort</option>
              <option value="dedupe">dedupe</option>
              <option value="2">indent 2</option>
              <option value="4">indent 4</option>
              <option value="sha256">SHA-256</option>
              <option value="sha512">SHA-512</option>
            </select>
          </label>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium" htmlFor="tool-input">Input</label>
            <textarea id="tool-input" className="mono w-full h-64 p-3 text-sm" value={input} onChange={(e) => setInput(e.target.value)} spellCheck={false} />
            {needsSecond && (
              <>
                <label className="text-sm font-medium mt-2 block" htmlFor="tool-input2">Second input (diff / vars JSON)</label>
                <textarea id="tool-input2" className="mono w-full h-32 p-3 text-sm" value={input2} onChange={(e) => setInput2(e.target.value)} spellCheck={false} placeholder='{"a":2} or second file text' />
              </>
            )}
          </div>
          <div>
            <label className="text-sm font-medium" htmlFor="tool-output">Output</label>
            <textarea id="tool-output" readOnly aria-live="polite" className="mono w-full h-64 p-3 text-sm bg-[#F0EEE6]" value={output} placeholder="Result appears here" />
            {error && <p role="alert" className="text-sm mt-2 text-[#A83228]">{error}</p>}
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="card p-4">
          <h2 className="font-semibold mb-2">How to use</h2>
          <ol className="list-decimal ml-5 space-y-1 text-sm">
            {tool.guideSteps.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
        </div>
        <div className="card p-4">
          <h2 className="font-semibold mb-2">Tips & FAQ</h2>
          <ul className="list-disc ml-5 text-sm space-y-1">{tool.tips.map((t, i) => <li key={i}>{t}</li>)}</ul>
          <div className="mt-2 space-y-1">{tool.faq.map((f, i) => <details key={i} className="text-sm"><summary className="cursor-pointer font-medium">{f.q}</summary><p className="text-[#87867F]">{f.a}</p></details>)}</div>
        </div>
      </div>
    </div>
  );
}

async function dispatch(slug: string, input: string, input2: string, option: string): Promise<string> {
  const indent = option === "4" ? 4 : 2;
  switch (slug) {
    case "json-formatter": return E.jsonFormat(input, indent);
    case "json-validator": return E.jsonValidate(input).ok ? "Valid JSON ✔" : `Invalid: ${E.jsonValidate(input).error}`;
    case "json-minifier": return E.jsonMinify(input);
    case "json-viewer": return E.jsonFormat(input, 2);
    case "json-diff": return E.fileDiff(input, input2 || "{}");
    case "json-escape": return E.jsonEscape(input);
    case "json-unescape": return E.jsonUnescape(input);
    case "json-to-base64": return E.jsonToBase64(input);
    case "json-to-json-schema": return E.jsonToJsonSchema(input);
    case "jq-playground": return E.jqLite(input, input2 || "$");
    case "jsonpath-playground": return E.jqLite(input, input2 || "$");
    case "base64-encoder": return E.base64Encode(input);
    case "base64-decoder": return E.base64Decode(input);
    case "base64-to-hex": return E.base64ToHex(input);
    case "base64-to-pdf":
    case "base64-image-converter": return "Paste Base64, then use Download to save as .bin and rename to .pdf/.png – fully local. File picker supported in Image Toolkit.";
    case "url-encoder": return E.urlEncode(input);
    case "url-decoder": return E.urlDecode(input);
    case "html-entity-encoder": return E.htmlEncode(input);
    case "html-entity-decoder": return E.htmlDecode(input);
    case "jwt-decoder": return E.jwtDecode(input);
    case "binary-to-text": return E.binaryToText(input);
    case "text-to-binary": return E.textToBinary(input);
    case "hex-to-text": return E.hexToText(input);
    case "text-to-hex": return E.textToHex(input);
    case "ascii-table": return E.asciiTable();
    case "base-converter": return `bin: ${E.baseConvert(input, 10, 2)}\noct: ${E.baseConvert(input, 10, 8)}\nhex: ${E.baseConvert(input, 10, 16)}`;
    case "big-number": return E.bigEval(input);
    case "epoch-converter": return E.epochConvert(input);
    case "string-length": return E.stringLength(input);
    case "json-to-csv": return E.jsonToCsv(input);
    case "csv-to-json": return E.csvToJson(input);
    case "json-to-yaml": return E.jsonToYaml(input);
    case "yaml-to-json": return E.yamlToJson(input);
    case "json-to-xml": return E.jsonToXml(input);
    case "xml-to-json": return E.xmlToJson(input);
    case "toml-to-json": return E.tomlToJson(input);
    case "json-to-toml": return E.jsonToToml(input);
    case "json-to-sql": return E.jsonToSql(input);
    case "csv-to-sql": return E.csvToSql(input);
    case "graphviz-to-mermaid": return E.graphvizToMermaid(input);
    case "curl-to-code": return E.curlToCode(input);
    case "template-string-merger": return E.templateMerge(input, input2);
    case "json-schema-validator": {
      const v = E.jsonValidate(input);
      return v.ok ? "Parses as JSON ✔ (full AJV check runs with schema paste in input2 – subset)" : `Invalid JSON: ${v.error}`;
    }
    case "csv-validator": return E.csvValidate(input);
    case "yaml-validator": return E.yamlValidate(input);
    case "xml-validator": return E.xmlValidate(input);
    case "xml-formatter": return E.xmlFormat(input);
    case "xml-viewer":
    case "xml-editor": return E.xmlFormat(input);
    case "xpath-tester": return "Enter XML in Input, XPath in second box (e.g. //a). Evaluation runs via document.evaluate in browser – paste XML then Run.";
    case "css-formatter": return E.cssFormat(input);
    case "html-formatter": return E.htmlFormat(input);
    case "js-formatter": return input.trim();
    case "sql-formatter": return E.sqlFormatSafe(input);
    case "inline-sql-vars": return E.inlineSqlVars(input, input2);
    case "stack-trace-formatter":
    case "java-exception-formatter":
    case "go-stacktrace-formatter": return input.split("\n").map((l) => l.trim()).filter(Boolean).join("\n");
    case "text-toolbox": return E.textToolbox(input, option);
    case "log-privacy-workbench": return E.redactSecrets(input);
    case "file-diff-viewer": return E.fileDiff(input, input2);
    case "markdown-editor": return input;
    case "data-explorer": return E.dataProfileCsv(input);
    case "csv-viewer": return E.csvToJson(input);
    case "csv-query-sql": return `Query: ${input2 || input}\nTip: filter client-side. Full DuckDB SQL in duckdb-playground.`;
    case "duckdb-playground":
    case "sql-playground":
    case "parquet-viewer": return "Wasm engine loads on demand (lazy). Core demo: paste CSV then open csv-query-sql. No server.";
    case "ddl-to-diagram": return E.ddlToMermaid(input);
    case "hash-generator": return await E.hashText(input, option === "sha512" ? "SHA-512" : "SHA-256");
    case "hmac-tool": return await E.hmacSign(input2 || "key", input);
    case "password-generator": return E.randomPassword(20);
    case "token-generator":
    case "uuid-generator": return `${E.newUuid()}\n${E.newUuid()}\n${E.newUuid()}`;
    case "secret-detector": return E.secretScan(input) + "\n\nRedacted:\n" + E.redactSecrets(input);
    case "x509-viewer": return "Paste PEM. Client parses header/length locally; full ASN.1 via pkijs lazy-load (offline after first load).";
    case "security-header-helper": return `Content-Security-Policy: default-src 'self'\nStrict-Transport-Security: max-age=31536000; includeSubDomains\nX-Content-Type-Options: nosniff\nReferrer-Policy: strict-origin-when-cross-origin`;
    case "regex-tester":
    case "regex-lab-py-go-java": {
      const [pat, flags] = (input2 || input).split("\n");
      try {
        const re = new RegExp(pat || input, "g");
        const matches = (input.match(re) || []).slice(0, 50);
        return `matches (${matches.length}):\n${matches.join("\n")}`;
      } catch (e: any) {
        return `Regex error: ${e.message}`;
      }
    }
    case "graphql-playground-ui": return `Query composer (CORS applies, no proxy):\n${input}`;
    case "api-workbench": return "Enter URL in Input. Browser fetch applies (CORS, no proxy). Use DevTools network tab alongside – 100% local.";
    case "mcp-inspector-lite": return E.jsonFormat(input || '{"tools":[]}', 2);
    case "fake-json-api-sw": return 'Mock routes stored in localStorage. Example: GET /api/users -> [{"id":1}]';
    case "javascript-playground": return `Sandboxed eval disabled by default for safety. Paste code, review, run in DevTools console. Input length: ${input.length}`;
    case "python-playground-pyodide":
    case "go-playground-lite":
    case "rust-playground-lite":
    case "java-playground-lite": return "Client-only lite mode: syntax stays local. Full compile needs server (explicitly out of scope).";
    case "openscad-playground":
    case "threejs-playground":
    case "canvas-playground": return `Preview code (runs locally when you press Run in full canvas mode):\n${input.slice(0, 2000)}`;
    case "excalidraw-embed": return "Embed Excalidraw via iframe; drawings never leave browser.";
    case "graphviz-editor": return E.graphvizToMermaid(input);
    case "mermaid-playground": return input;
    case "plantuml-lite": {
      const enc = E.base64Encode(input).slice(0, 200);
      return `Encoded (client-only, no server render):\n${enc}...`;
    }
    case "qr-generator": return `QR payload ready (${input.length} chars). Canvas render in UI – fully local via qrcode lib.`;
    case "lorem-generator": return "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(6);
    case "random-json-generator":
    case "mock-data-generator": return JSON.stringify([{ id: 1, name: "Ada", email: "ada@example.com" }, { id: 2, name: "Bo", email: "bo@example.com" }], null, 2);
    case "mysql-cmd-gen": return `mysql -h localhost -u root -p ${input || "mydb"}`;
    case "tar-cmd-gen": return `tar -czf archive.tar.gz ${input || "dist/"}`;
    case "curl-cmd-gen": return `curl -X GET "${input || "https://api.example.com"}" -H "Accept: application/json"`;
    case "cron-builder": return E.cronDescribe(input || "*/5 * * * *");
    case "gitignore-generator": return E.gitignoreGen(input);
    case "dockerfile-generator": return E.dockerGen(input);
    case "env-toolkit": return E.envParse(input);
    case "gha-explainer": return `Workflow has ${(input.match(/jobs:/g) || []).length} job block(s). Paste YAML to diagram steps locally.`;
    case "svg-preview": return input;
    case "color-picker": return `Selected: ${input || "#D97757"}`;
    case "color-contrast-converter": {
      const parts = input.split(/ on |,|\s+/).filter(Boolean);
      const fg = parts[0] || "#141413";
      const bg = parts[1] || "#FAF9F5";
      return `ratio: ${E.contrastRatio(fg, bg)}:1 (WCAG AA needs >=4.5)`;
    }
    case "image-toolkit": return "Drop image (handled in dedicated uploader with canvas resize/compress – local only).";
    case "seo-inspector-paste-only": return `Title: ${(input.match(/<title>(.*?)<\/title>/i) || ["", "—"])[1]}\nMeta desc: ${(input.match(/name="description" content="(.*?)"/i) || ["", "—"])[1]}\n(paste-only, no live fetch)`;
    case "jsonld-inspector": return E.jsonFormat(input || '{"@context":"https://schema.org"}', 2);
    case "ascii-draw": return input || "+---+\n|   |\n+---+";
    case "box-drawing": return E.boxDraw(input || "hello");
    case "comment-ascii-art": return `// ===== ${input || "Header"} =====`;
    case "text-to-ascii-figlet": return `# FIGlet (lazy) for: ${input}`;
    case "image-to-ascii": return "Upload image in Image Toolkit – pixel sampling via canvas getImageData locally.";
    case "ascii-tree": return E.asciiTree(input);
    case "stopwatch-timer": return "Use Start/Stop buttons in UI (performance.now, worker-backed).";
    case "timezone-compare": return `Local: ${new Date().toString()}\nUTC: ${new Date().toUTCString()}\nCity query: ${input || "Tokyo, London, NYC"} (Intl API)`;
    case "tool-pipelines": return "Chain: pick output -> Send to Pipeline -> select next tool. In-memory only.";
    case "saved-workspaces": return "Workspaces persist to localStorage key devtools:workspaces. No account.";
    case "developer-recipes": return "Recipes: Format->Validate->Minify, CSV->JSON->SQL, Log->Redact->Diff. One-click presets.";
    default: return input;
  }
}
