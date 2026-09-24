import { createElement } from "react";
import { ToolError, bool, str, type Result, type SpecModule, type View } from "./types";
import { execRegex, regexMeta, RegexTimeout, explainRegex, type RxOut, type RxReq } from "./lib/E-regex";

/* ── shared ──────────────────────────────────────────────────────────── */

const FLAGS = ["g", "i", "m", "s", "u", "y", "d"] as const;
const FLAG_HINT: Record<string, string> = {
  g: "global — every match, not just the first",
  i: "ignore case",
  m: "multiline — ^ and $ match at each line",
  s: "dotAll — . matches newlines too",
  u: "unicode — code points, \\u{…}, \\p{…}",
  y: "sticky — match only at lastIndex (0)",
  d: "indices — include group start/end in JSON output",
};

function timeoutError(ms: number) {
  return new ToolError(
    `Timed out after ${ms / 1000} s — the pattern is almost certainly backtracking catastrophically.\n` +
      "Nested quantifiers such as (a+)+, (\\w+\\s?)+ or (.*)* try exponentially many ways to fail on a near-miss.\n" +
      "Fix: remove the nesting (a+ instead of (a+)+), make alternatives mutually exclusive, or anchor and bound the repetition."
  );
}

async function runRegex(req: RxReq, ms = 1000): Promise<RxOut> {
  let out: RxOut;
  try {
    out = await execRegex(req, ms);
  } catch (e) {
    if (e instanceof RegexTimeout) throw timeoutError(ms);
    throw e;
  }
  if (out.error) throw new ToolError(`Invalid regular expression: ${out.error.replace(/^Invalid regular expression: /, "")}`);
  return out;
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const MATRIX_CSS = `
.e-cm { border-collapse: separate; border-spacing: 0; width: 100%; font-size: 13.5px; }
.prose .e-cm th, .prose .e-cm td { border: 0; border-bottom: 1px solid rgba(32,30,29,.08); padding: 6px 8px; vertical-align: top; }
.e-cm th { font-size: 11.5px; letter-spacing: .06em; text-transform: uppercase; color: var(--color-neutral-600); font-weight: 500; text-align: center; white-space: nowrap; }
.e-cm th:first-child, .e-cm td:first-child { text-align: left; }
.prose .e-cm td.c { text-align: center; font-family: var(--font-mono); font-weight: 700; width: 1%; min-width: 34px; padding: 6px 3px; font-size: 14.5px; }
.prose .e-cm th { padding: 6px 3px; letter-spacing: .02em; font-size: 11px; }
.e-cm td:first-child { min-width: 170px; }
.e-cm-wrap { overflow-x: auto; }
.e-cm td.yes { color: oklch(48% .12 150); background: rgba(0,160,90,.07); }
.e-cm td.no { color: var(--color-accent-2-700); background: rgba(214,0,108,.07); }
.e-cm td.partial { color: oklch(50% .12 70); background: rgba(237,187,0,.12); }
.e-cm tr.v td:first-child { font-weight: 600; }
.e-cm tr.v td { border-bottom: 2px solid rgba(32,30,29,.14); }
.e-cm small { display: block; color: var(--color-neutral-600); font-size: 12px; line-height: 1.4; margin-top: 2px; }
.e-cm .dot { color: var(--color-accent-700); }
.e-cm-legend { font-size: 12.5px; color: var(--color-neutral-600); margin: 10px 0 0; }
`;

function matrixHtml(rows: (string | number)[][], names: string[], used: number): string {
  const short: Record<string, string> = { JavaScript: "JS", "Python re": "Python", "Go RE2": "Go", "Rust regex": "Rust" };
  const cell = (v: string) => {
    const cls = v.startsWith("✓") ? "yes" : v.startsWith("✗") ? "no" : "partial";
    return `<td class="c ${cls}">${esc(v.charAt(0))}</td>`;
  };
  const body = rows
    .map((r, i) => {
      const label = String(r[0]);
      const dot = label.startsWith("● ");
      const name = dot ? label.slice(2) : label;
      const note = String(r[r.length - 1] ?? "");
      return `<tr class="${i < 2 ? "v" : ""}"><td>${dot ? '<span class="dot">● </span>' : ""}${esc(name)}${note ? `<small>${esc(note)}</small>` : ""}</td>${r.slice(1, -1).map((c) => cell(String(c))).join("")}</tr>`;
    })
    .join("");
  return `<div class="e-cm-wrap"><table class="e-cm"><thead><tr><th>Construct</th>${names.map((n) => `<th title="${esc(n)}">${esc(short[n] ?? n)}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table></div><p class="e-cm-legend">✓ supported · ◐ partly or version-dependent · ✗ missing · ● used by this pattern${used ? "" : " (none — only portable syntax)"}</p>`;
}

const matchRows = (out: RxOut) =>
  out.matches.map((m, i) => [i + 1, m.i, m.e, m.t, m.g.map((g, k) => `${g?.name ?? k + 1}=${g ? JSON.stringify(g.t) : "∅"}`).join("  ") || null]);

/* ── examples ────────────────────────────────────────────────────────── */

const CONTACTS = `Team directory — updated 2026-09-24

Ada Lovelace     <ada@example.com>        Engineering
Grace Hopper     grace.hopper+navy@mail.example.org   Compilers
Alan Turing      alan@turing.example.co.uk  Research
Linus T.         linus@kernel            (missing TLD — no match)
Support desk:    help@formatter.dev, billing@formatter.dev`;

const RELEASES = `v2.3.0 released 2026-08-30 (hotfix 2026-09-02)
v2.2.0 released 2026-06-15
v2.1.0 released 2026-03-01; next review 2026-12-01`;

const LOG = `2026-09-24T10:00:01Z [INFO] server started on :8080
2026-09-24T10:00:02Z [WARN] slow query users.find 812ms
2026-09-24T10:00:03Z [INFO] GET /api/users 200 14ms
2026-09-24T10:00:04Z [ERROR] connection reset by peer (db-2)
2026-09-24T10:00:05Z [WARN] retrying in 250ms`;

const PRICES = `Keyboard $129.00, mouse $49.99, dock €1,299.50
Shipping: $0 · Gift card £25 · SKU-4411 (not a price)`;

/* ── specs ───────────────────────────────────────────────────────────── */

const specs: SpecModule = {
  "regex-tester": {
    inputs: [
      { id: "text", label: "Test string", lang: "text", placeholder: "Text to search" },
      { id: "pattern", label: "Pattern", kind: "text", placeholder: "\\b\\w+@\\w+\\.\\w+" },
      { id: "replacement", label: "Replacement", kind: "text", placeholder: "$1, $<name>, $&" },
    ],
    options: [
      ...FLAGS.map((f) => ({ id: f, label: f, type: "toggle" as const, default: f === "g", hint: FLAG_HINT[f] })),
      { id: "mode", label: "Mode", type: "segment", choices: [["match", "Match"], ["replace", "Replace"], ["split", "Split"]], default: "match" },
      { id: "format", label: "Output", type: "segment", choices: [["lines", "Lines"], ["json", "JSON"]], default: "lines", show: (o) => o.mode === "match" },
    ],
    custom: () => import("./ui/E-RegexTester"),
    async run({ inputs, opts, pipeline }) {
      const pattern = inputs.pattern ?? "";
      if (!pattern) throw new ToolError("Type a pattern — or pick one from the library.");
      const flags = FLAGS.filter((f) => bool(opts[f])).join("");
      const req: RxReq = { pattern, flags, text: inputs.text ?? "", replacement: inputs.replacement ?? "" };
      const out = await runRegex(req);
      const mode = str(opts.mode, "match");
      let text: string;
      if (mode === "replace") text = out.replaced;
      else if (mode === "split") text = out.split.map((s) => (s === undefined ? "" : s)).join("\n");
      else if (opts.format === "json")
        text = JSON.stringify(
          out.matches.map((m) => {
            const o: Record<string, unknown> = { match: m.t, index: m.i };
            if (m.g.length) o.captures = m.g.map((g) => (g ? g.t : null));
            const named = m.g.filter((g) => g?.name);
            if (named.length) o.groups = Object.fromEntries(named.map((g) => [g!.name, g!.t]));
            if (flags.includes("d")) o.indices = [[m.i, m.e], ...m.g.map((g) => (g ? [g.s, g.e] : null))];
            return o;
          }),
          null,
          2
        );
      else text = out.matches.map((m) => m.t).join("\n");
      const views: View[] = [];
      if (!pipeline) {
        views.push({ label: mode === "match" ? "Matches" : mode === "replace" ? "Replaced" : "Split", out: { kind: "text", text, lang: opts.format === "json" && mode === "match" ? "json" : "text" } });
        views.push({ label: `Table (${out.matches.length})`, out: { kind: "table", columns: ["#", "start", "end", "match", "groups"], rows: matchRows(out) } });
        views.push({ label: "Explain", out: { kind: "table", columns: ["token", "meaning"], rows: explainRegex(pattern, flags).map((t) => ["  ".repeat(t.depth) + t.text, t.desc]) } });
      }
      const res: Result = {
        text,
        views,
        notes: out.truncated ? [`Stopped after ${out.matches.length.toLocaleString()} matches.`] : !flags.includes("g") && mode !== "split" && out.matches.length ? ["Without the g flag only the first match is used."] : undefined,
      };
      regexMeta.set(res, { out, req });
      return res;
    },
    examples: [
      { label: "Emails", inputs: { text: CONTACTS, pattern: "[\\w.%+-]+@[A-Za-z0-9-]+(?:\\.[A-Za-z0-9-]+)*\\.[A-Za-z]{2,}", replacement: "" }, note: "Character classes, a repeated non-capturing group and a TLD of 2+ letters — linus@kernel is correctly skipped." },
      { label: "Reformat dates", inputs: { text: RELEASES, pattern: "(?<year>\\d{4})-(?<month>\\d{2})-(?<day>\\d{2})", replacement: "$<day>/$<month>/$<year>" }, opts: { mode: "replace" }, note: "Named groups referenced in the replacement with $<name> turn ISO dates into DD/MM/YYYY." },
      { label: "Log lines (multiline)", inputs: { text: LOG, pattern: "^(?<ts>\\S+) \\[(?<level>WARN|ERROR)\\] (?<msg>.*)$", replacement: "" }, opts: { m: true, format: "json" }, note: "With m, ^ and $ anchor each line; JSON output lists the named groups of every WARN/ERROR line." },
      { label: "Split on delimiters", inputs: { text: "alpha, beta;gamma |delta ,  epsilon;;zeta", pattern: "\\s*[,;|]+\\s*", replacement: "" }, opts: { mode: "split" }, note: "Split mode breaks the text wherever the pattern matches, swallowing surrounding spaces." },
      { label: "Duplicate words", inputs: { text: "This is is a test of the the duplicate finder.\nParis in the The spring is lovely lovely.", pattern: "\\b(\\w+)\\s+\\1\\b", replacement: "$1" }, opts: { i: true, mode: "replace" }, note: "A backreference \\1 matches the same text group 1 captured; with i it also catches 'the The'." },
      { label: "Lookbehind prices", inputs: { text: PRICES, pattern: "(?<=[$€£])\\d{1,3}(?:,\\d{3})*(?:\\.\\d{2})?", replacement: "" }, note: "A lookbehind requires a currency sign before the number without including it in the match." },
      { label: "Unicode names", inputs: { text: "Zoë Ångström met Łukasz and Ñandú in Αθήνα; ALL CAPS and lowercase are skipped.", pattern: "\\p{Lu}\\p{Ll}+", replacement: "" }, opts: { u: true }, note: "\\p{Lu}\\p{Ll}+ = one uppercase then lowercase letters in any script (needs the u flag)." },
      { label: "Catastrophic backtracking", inputs: { text: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!", pattern: "^(a+)+$", replacement: "" }, note: "Nested quantifiers explode on a near-miss; the worker is stopped after 1 s instead of freezing the page.", error: true },
    ],
    steps: ["Type a pattern in the /…/ bar or load one from the Library.", "Paste text into the test string — matches highlight live; hover a match to see its groups.", "Toggle flags, switch Match / Replace / Split, and read the token-by-token explanation."],
    tips: ["Runs in a Worker with a 1 s limit, so a runaway pattern never freezes the tab.", "In replacements: $& whole match, $1 numbered group, $<name> named group, $$ a dollar sign."],
  },

  "regex-lab-py-go-java": {
    inputs: [
      { id: "pattern", label: "Pattern", kind: "text", placeholder: "(?P<year>\\d{4})-(?P<month>\\d\\d)" },
      { id: "text", label: "Test string", rows: 9 },
    ],
    options: [
      { id: "flavour", label: "Written for", type: "select", choices: [["js", "JavaScript"], ["python", "Python re"], ["go", "Go RE2"], ["java", "Java"], ["pcre", "PCRE"], ["dotnet", ".NET"], ["rust", "Rust regex"]], default: "python" },
      { id: "target", label: "Snippet", type: "select", choices: [["python", "Python"], ["go", "Go"], ["java", "Java"], ["js", "JavaScript"], ["csharp", "C#"], ["rust", "Rust"], ["php", "PHP"]], default: "go" },
      { id: "i", label: "i", type: "toggle", default: false, hint: "Ignore case" },
      { id: "m", label: "m", type: "toggle", default: false, hint: "Multiline: ^ $ per line" },
      { id: "s", label: "s", type: "toggle", default: false, hint: "Dot matches newline" },
      { id: "x", label: "x", type: "toggle", default: false, hint: "Verbose: ignore whitespace and # comments" },
      { id: "all", label: "All constructs", type: "toggle", default: false, hint: "Show the full compatibility reference, not only what this pattern uses" },
    ],
    async run({ inputs, opts }) {
      const { toJs, detectConstructs, CONSTRUCTS, FLAVOURS, snippet, SNIPPET_LANGS, stripExtended } = await import("./lib/E-flavours");
      const pattern = inputs.pattern ?? "";
      if (!pattern.trim()) throw new ToolError("Type a pattern to compare across flavours.");
      const flavour = str(opts.flavour, "python") as import("./lib/E-flavours").Flavour;
      const base = ["i", "m", "s", "x"].filter((f) => bool(opts[f])).join("");
      const tr = toJs(pattern, flavour, base);
      const views: View[] = [];

      // Compatibility matrix.
      const found = detectConstructs(pattern, flavour);
      const rows = (bool(opts.all) ? CONSTRUCTS : found).map((c) => [(found.includes(c) ? "● " : "") + c.label, ...FLAVOURS.map(([f]) => (c.support[f] === "yes" ? "✓" : c.support[f] === "no" ? "✗" : "◐")), c.note]);
      const verdict = FLAVOURS.map(([f]) => (found.some((c) => c.support[f] === "no") ? "✗ no" : found.some((c) => c.support[f] === "partial") ? "◐ check" : "✓ yes"));
      const semantic = found.filter((c) => !c.syntax);
      const verdict2 = FLAVOURS.map(([f]) => (semantic.some((c) => c.support[f] === "no") ? "✗ no" : semantic.some((c) => c.support[f] === "partial") ? "◐ check" : "✓ yes"));
      rows.unshift(
        ["Compiles as written?", ...verdict, found.length ? `${found.length} notable construct(s) detected (●)` : "Only portable syntax — works everywhere"],
        ["Works after syntax translation?", ...verdict2, "Named-group spelling, inline flags, \\A/\\z, POSIX classes and \\x{…} can be rewritten; missing features cannot"]
      );

      // Matches (run as JavaScript).
      let out: RxOut | null = null;
      const notes = tr.notes.map((n) => ({ level: n.level, message: n.message }));
      if (tr.runnable) {
        try {
          out = await runRegex({ pattern: tr.source, flags: tr.flags, text: inputs.text ?? "", replacement: "" });
        } catch (e) {
          if (e instanceof ToolError && /Invalid regular expression/.test(e.message)) throw new ToolError(`${e.message}\nAfter translation to JavaScript: /${tr.source}/${tr.flags}`);
          throw e;
        }
      }
      // Snippets: from the source syntax, with leading inline flags turned into options.
      let neutral = pattern;
      let fl = base;
      const lead = /^\(\?([imsx]+)\)/.exec(neutral);
      if (lead) {
        neutral = neutral.slice(lead[0].length);
        fl += lead[1];
      }
      const names = [...neutral.matchAll(/\(\?P?<([A-Za-z_]\w*)>/g)].map((m) => m[1]);
      const sample = (inputs.text ?? "").split("\n").find((l) => l.trim()) ?? "";
      const snip = (lang: import("./lib/E-flavours").SnippetLang) => snippet(lang, (lang === "go" || lang === "js") && fl.includes("x") ? stripExtended(neutral) : neutral, (lang === "go" || lang === "js") ? fl.replace("x", "") : fl, sample, names);
      const target = str(opts.target, "go") as import("./lib/E-flavours").SnippetLang;
      const text = snip(target);
      const langOf: Record<string, "python" | "go" | "java" | "js" | "rust" | "text"> = { python: "python", go: "go", java: "java", js: "js", rust: "rust", csharp: "java", php: "text" };

      views.push({ label: "Compatibility", out: { kind: "html", html: matrixHtml(rows, FLAVOURS.map(([, n]) => n), found.length), css: MATRIX_CSS } });
      if (out) {
        views.push({
          label: `Matches (${out.matches.length})`,
          out: { kind: "table", columns: ["#", "start", "end", "match", ...Array.from({ length: out.groupCount }, (_, k) => out!.names[k + 1] ?? `$${k + 1}`)], rows: out.matches.map((m, i) => [i + 1, m.i, m.e, m.t, ...m.g.map((g) => (g ? g.t : null))]) },
        });
      }
      views.push({ label: `${SNIPPET_LANGS.find(([k]) => k === target)?.[1]} snippet`, out: { kind: "text", text, lang: langOf[target] } });
      views.push({ label: "All snippets", out: { kind: "text", text: SNIPPET_LANGS.map(([k, n]) => `${"─".repeat(3)} ${n} ${"─".repeat(60 - n.length)}\n${snip(k)}`).join("\n"), lang: "text" } });
      views.push({
        label: "Translation",
        out: {
          kind: "issues",
          items: [
            { level: tr.runnable ? "ok" : "error", message: tr.runnable ? `Runs here as /${tr.source}/${tr.flags}` : "Cannot run in JavaScript — matches are not shown." },
            ...notes,
          ],
        },
      });
      return { text, views, notes: tr.runnable ? undefined : ["This pattern uses features JavaScript lacks, so only the matrix and snippets are shown."] };
    },
    examples: [
      { label: "Python named groups", inputs: { pattern: "(?P<year>\\d{4})-(?P<month>\\d{2})-(?P<day>\\d{2})", text: "Invoices dated 2026-09-24 and 2026-10-01; draft 2026-1-5 skipped." }, opts: { flavour: "python", target: "go" }, note: "(?P<name>…) is Python/Go/Rust syntax; JavaScript and Java need (?<name>…). The Go snippet keeps P, Java drops it." },
      { label: "Backreference quotes", inputs: { pattern: "(?P<q>['\"])(?P<body>.*?)(?P=q)", text: `say('hello') then say("it's fine") and 'mixed"` }, opts: { flavour: "python", target: "rust" }, note: "(?P=q) repeats the opening quote. Go RE2 and Rust have no backreferences — see the ✗ and the warning in the Rust snippet." },
      { label: "Java possessive", inputs: { pattern: "\"(?:[^\"\\\\]++|\\\\.)*+\"", text: 'log("path \\"C:\\\\tmp\\"") and "plain" and "unterminated' }, opts: { flavour: "java", target: "java" }, note: "Possessive quantifiers never backtrack (fast failure). JavaScript runs a greedy approximation; the Java snippet shows the double escaping." },
      { label: "PCRE \\K", inputs: { pattern: "(?i)price=\\K\\d+(?:\\.\\d\\d)?", text: "sku=41 PRICE=19.99 qty=2 price=5" }, opts: { flavour: "pcre", target: "php" }, note: "\\K drops what matched so far — rewritten as a lookbehind for JavaScript; the leading (?i) becomes the i flag." },
      { label: "Verbose (?x)", inputs: { pattern: "(?x)\n  (?P<user>[\\w.+-]+)   # local part\n  @\n  (?P<domain>[\\w-]+(?:\\.[\\w-]+)+)  # domain", text: "ada@example.com, grace.hopper@navy.example.mil" }, opts: { flavour: "python", target: "python" }, note: "Extended mode ignores whitespace and # comments; they are stripped for JavaScript and Go, kept with re.VERBOSE in Python." },
      { label: "Go key=value", inputs: { pattern: "(?P<key>[a-z_]+)=(?P<val>\"[^\"]*\"|\\S+)", text: `level=info msg="request done" status=200 took=14ms path=/api/users` }, opts: { flavour: "go", target: "js" }, note: "Portable syntax — everything is ✓. The JavaScript snippet converts the groups to (?<name>…)." },
      { label: ".NET lookbehind", inputs: { pattern: "(?<=\\$\\s*)\\d+(?:\\.\\d\\d)?", text: "Total: $ 42.50, tip $7, EUR 10" }, opts: { flavour: "dotnet", target: "csharp", all: true }, note: "Variable-length lookbehind works in .NET and JS, not in Python; All constructs shows the full reference table." },
      { label: "Unclosed group", inputs: { pattern: "(?P<year>\\d{4}-(\\d{2})", text: "2026-09" }, note: "An error names the problem after translation to JavaScript.", error: true },
    ],
    steps: ["Enter a pattern written for Python, Go, Java, PCRE, .NET or Rust and pick that flavour.", "Read the compatibility matrix: ✓ supported, ◐ partly, ✗ missing — per construct and flavour.", "Matches run here after translation to JavaScript; copy a correctly escaped snippet for your language."],
  },

  "graphql-playground-ui": {
    inputs: [
      { id: "query", label: "Query", lang: "graphql", placeholder: "{ users { id name } }" },
      { id: "schema", label: "Schema (SDL)", lang: "graphql", rows: 9 },
      { id: "data", label: "Mock data (JSON)", lang: "json", rows: 7 },
      { id: "variables", label: "Variables (JSON)", lang: "json", rows: 3 },
    ],
    options: [
      { id: "mode", label: "Mode", type: "segment", choices: [["local", "Local mock"], ["remote", "Remote"]], default: "local" },
      { id: "endpoint", label: "Endpoint", type: "text", default: "", placeholder: "https://api.example.com/graphql", width: 260, show: (o) => o.mode === "remote" },
      { id: "operation", label: "Operation", type: "text", default: "", placeholder: "first", width: 130 },
    ],
    outLang: "json",
    async run({ inputs, opts }) {
      const { runGraphql } = await import("./lib/E-graphql");
      if (!inputs.query?.trim()) throw new ToolError("Write a query — e.g. { users { id name } }.");
      const remote = opts.mode === "remote";
      const r = await runGraphql({ query: inputs.query, sdl: inputs.schema ?? "", data: inputs.data ?? "", variables: inputs.variables ?? "", operation: str(opts.operation), execute: !remote });
      const issues = r.issues;
      const blocking = issues.filter((i) => i.level === "error");
      const views: View[] = [];
      const issueView: View = { label: `Issues (${issues.length})`, out: { kind: "issues", items: issues.length ? issues.map((i) => ({ level: i.level, message: i.message, line: i.line, col: i.col })) : [{ level: "ok", message: "Query is valid against the schema." }] } };
      if (remote) {
        let variables: unknown = undefined;
        try {
          variables = inputs.variables?.trim() ? JSON.parse(inputs.variables) : undefined;
        } catch {
          /* reported in issues */
        }
        const payload = { query: r.formatted ?? inputs.query, ...(variables ? { variables } : {}), ...(str(opts.operation) ? { operationName: str(opts.operation) } : {}) };
        const text = JSON.stringify(payload, null, 2);
        const { default: Remote } = await import("./ui/E-GqlRemote");
        views.push({ label: "Send", out: { kind: "react", node: createElement(Remote, { endpoint: str(opts.endpoint), payload: text }) } });
        views.push(issueView);
        if (r.formatted) views.push({ label: "Formatted", out: { kind: "text", text: r.formatted, lang: "graphql" } });
        views.push({ label: "Request body", out: { kind: "text", text, lang: "json" } });
        return { text, views, notes: ["Remote mode sends nothing until you press Send — the request goes to the endpoint you typed, straight from your browser."] };
      }
      if (blocking.length && !r.result) {
        const text = JSON.stringify({ errors: blocking.map((i) => ({ message: i.message, ...(i.line ? { locations: [{ line: i.line, column: i.col }] } : {}) })) }, null, 2);
        views.push(issueView, { label: "Errors JSON", out: { kind: "text", text, lang: "json" } });
        if (r.formatted) views.push({ label: "Formatted", out: { kind: "text", text: r.formatted, lang: "graphql" } });
        if (r.schemaRows) views.push({ label: "Schema", out: { kind: "table", columns: ["type", "kind", "field", "arguments", "returns", "description"], rows: r.schemaRows } });
        return { text, views };
      }
      const text = JSON.stringify(r.result ?? {}, null, 2);
      views.push({ label: "Result", out: { kind: "tree", value: r.result } });
      views.push({ label: "JSON", out: { kind: "text", text, lang: "json" } });
      views.push(issueView);
      if (r.formatted) views.push({ label: "Formatted", out: { kind: "text", text: r.formatted, lang: "graphql" } });
      if (r.schemaRows) views.push({ label: "Schema", out: { kind: "table", columns: ["type", "kind", "field", "arguments", "returns", "description"], rows: r.schemaRows } });
      if (r.introspection) views.push({ label: "Introspection", out: { kind: "tree", value: r.introspection } });
      const notes: string[] = [];
      if (r.mocked) notes.push(`${r.mocked} value${r.mocked === 1 ? " was" : "s were"} not in the mock data and ${r.mocked === 1 ? "was" : "were"} auto-mocked from the schema types.`);
      return { text, views, notes: notes.length ? notes : undefined, filename: "result.json" };
    },
    examples: [], // filled below
    steps: ["Edit the query (Ctrl/⌘+Enter runs it); the schema, mock data and variables sit underneath.", "Local mode validates against the schema and executes with resolvers built from the mock data.", "Remote mode builds the request and sends it only when you press Send."],
    tips: ["List fields with an id argument, like user(id: 2), look the item up in the matching array (users).", "Nested fields follow foreign keys: Post.author uses authorId, User.posts finds posts with authorId = user.id.", "Anything missing from the data is mocked deterministically by type and field name."],
  },

  "api-workbench": {
    inputs: [{ id: "request", label: "Request (JSON)", lang: "json" }],
    autorun: false,
    pipe: false,
    action: "Send",
    custom: () => import("./ui/E-ApiWorkbench"),
    async run({ inputs }) {
      const { parseState, send, pushHistory, responseMeta, prettyBody, NetworkError, fmtBytes } = await import("./lib/E-http");
      const st = parseState(inputs.request ?? "");
      let r;
      try {
        r = await send(st);
      } catch (e) {
        if (e instanceof NetworkError) throw new ToolError(e.message);
        throw e;
      }
      pushHistory(st, r);
      const pb = prettyBody(r);
      const views: View[] = [];
      if (pb.json !== undefined) views.push({ label: "Body", out: { kind: "tree", value: pb.json } });
      views.push({ label: "Raw", out: { kind: "text", text: pb.text, lang: pb.json !== undefined ? "json" : /html/.test(r.contentType) ? "html" : /xml/.test(r.contentType) ? "xml" : "text" } });
      views.push({ label: `Headers (${r.headers.length})`, out: { kind: "table", columns: ["header", "value"], rows: r.headers } });
      views.push({ label: "Summary", out: { kind: "stats", items: [{ label: "Status", value: `${r.status} ${r.statusText}`, tone: r.status < 300 ? "ok" : r.status < 400 ? "info" : "bad" }, { label: "Time", value: `${Math.round(r.ms)} ms` }, { label: "Size", value: fmtBytes(r.size) }, { label: "Source", value: r.mock ? "offline mock" : "network", tone: "info" }] } });
      const res: Result = { text: pb.text, views, notes: r.notes.length ? r.notes : undefined, filename: /json/.test(r.contentType) ? "response.json" : "response.txt" };
      responseMeta.set(res, r);
      return res;
    },
    examples: [], // filled below
    steps: ["Pick a method and URL — /mock-api/… answers offline from the built-in mock API.", "Add query params, headers, a body and auth in the tabs.", "Send, then read the status, timing, headers and body; export as curl, fetch or Python."],
    tips: ["Real URLs are fetched only when you press Send, straight from your browser — the server must allow CORS.", "History keeps your last 50 requests in this browser only."],
  },

  "mcp-inspector-lite": {
    inputs: [
      { id: "mcp", label: "MCP JSON", lang: "json", placeholder: '{"tools": [...]} · a server manifest · or one JSON-RPC message per line' },
      { id: "args", label: "Arguments for tools/call (JSON)", lang: "json", rows: 5, placeholder: "Leave empty to use generated example arguments" },
    ],
    options: [
      { id: "tool", label: "Tool", type: "text", default: "", placeholder: "first tool", width: 150 },
      { id: "example", label: "Example args", type: "segment", choices: [["required", "Required"], ["all", "All"]], default: "all" },
      { id: "rpcId", label: "Request id", type: "number", default: 1, min: 1, max: 99999 },
    ],
    outLang: "json",
    async run({ inputs, opts }) {
      const { readMcp, lintTools, exampleFor, schemaSummary, validateArgs } = await import("./lib/E-mcp");
      if (!inputs.mcp?.trim()) throw new ToolError("Paste a tools/list result, a server manifest or a JSON-RPC transcript.");
      let doc;
      try {
        doc = readMcp(inputs.mcp);
      } catch (e) {
        throw new ToolError((e as Error).message);
      }
      const { issues, perTool } = await lintTools(doc.tools);
      const allIssues = [...doc.transcriptIssues, ...issues];
      const views: View[] = [];
      const toolRows = doc.tools.map((t, i) => {
        const c = perTool.get(i)!;
        return [String(t.name ?? "?"), typeof t.description === "string" ? t.description : null, schemaSummary(t.inputSchema), Array.isArray((t.inputSchema as Record<string, unknown> | undefined)?.required) ? ((t.inputSchema as Record<string, unknown>).required as string[]).join(", ") : null, c.errors ? `✗ ${c.errors} error(s)` : c.warnings ? `⚠ ${c.warnings} warning(s)` : "✓"];
      });

      let text = "";
      const want = str(opts.tool).trim();
      const tool = want ? doc.tools.find((t) => t.name === want) : doc.tools[0];
      if (want && !tool) allIssues.unshift({ level: "error", message: `No tool named "${want}". Available: ${doc.tools.map((t) => String(t.name)).join(", ") || "none"}.` });
      if (tool && !(doc.kind === "transcript" && !want)) {
        let args: unknown;
        let argIssues: { level: "error" | "warning" | "info" | "ok"; message: string }[] = [];
        if (inputs.args?.trim()) {
          try {
            args = JSON.parse(inputs.args);
          } catch (e) {
            throw new ToolError(`Arguments are not valid JSON: ${(e as Error).message}`);
          }
        } else args = exampleFor(tool.inputSchema, "args", opts.example !== "required");
        argIssues = await validateArgs(tool.inputSchema ?? { type: "object" }, args);
        argIssues = argIssues.map((i) => ({ ...i, message: `${String(tool.name)} ${inputs.args?.trim() ? "arguments" : "example arguments"}: ${i.message.replace(/^arguments/, "").trim() || "ok"}` }));
        allIssues.unshift(...argIssues);
        const req = { jsonrpc: "2.0", id: Number(opts.rpcId) || 1, method: "tools/call", params: { name: tool.name, arguments: args } };
        text = JSON.stringify(req, null, 2);
      } else if (doc.kind === "transcript") {
        text = doc.exchanges.map((e) => `${e.n}. ${e.kind === "notification" ? "notify" : `#${String(e.id)}`} ${e.method} → ${e.status}${e.ms != null ? ` (${e.ms} ms)` : ""}${e.summary ? `  ${e.summary}` : ""}`).join("\n");
      } else text = JSON.stringify({ resources: doc.resources, prompts: doc.prompts }, null, 2);

      if (doc.tools.length) views.push({ label: `Tools (${doc.tools.length})`, out: { kind: "table", columns: ["name", "description", "arguments", "required", "lint"], rows: toolRows } });
      views.push({ label: `Issues (${allIssues.filter((i) => i.level !== "ok").length})`, out: { kind: "issues", items: allIssues.length ? allIssues : [{ level: "ok", message: "Every tool schema compiles and is well described." }] } });
      if (tool && text.startsWith("{")) views.push({ label: "tools/call request", out: { kind: "text", text, lang: "json" } });
      if (doc.exchanges.length) views.push({ label: `Transcript (${doc.exchanges.length})`, out: { kind: "table", columns: ["dir", "id", "method", "status", "ms", "summary", "kind"], rows: doc.exchanges.map((e) => [e.dir ?? null, e.id === null ? null : String(e.id), e.method, e.status, e.ms, e.summary, e.kind]) } });
      if (doc.resources.length || doc.resourceTemplates.length)
        views.push({ label: `Resources (${doc.resources.length + doc.resourceTemplates.length})`, out: { kind: "table", columns: ["uri", "name", "mimeType", "description"], rows: [...doc.resources.map((r) => [String(r.uri ?? ""), r.name ? String(r.name) : null, r.mimeType ? String(r.mimeType) : null, r.description ? String(r.description) : null]), ...doc.resourceTemplates.map((r) => [String(r.uriTemplate ?? ""), r.name ? String(r.name) : null, r.mimeType ? String(r.mimeType) : null, `template · ${String(r.description ?? "")}`])] } });
      if (doc.prompts.length)
        views.push({ label: `Prompts (${doc.prompts.length})`, out: { kind: "table", columns: ["name", "description", "arguments"], rows: doc.prompts.map((p) => [String(p.name ?? ""), p.description ? String(p.description) : null, Array.isArray(p.arguments) ? (p.arguments as Record<string, unknown>[]).map((a) => `${String(a.name)}${a.required ? "*" : ""}`).join(", ") : null]) } });
      views.push({ label: "Tree", out: { kind: "tree", value: doc.kind === "transcript" ? { server: doc.server, tools: doc.tools, resources: doc.resources, prompts: doc.prompts } : JSON.parse(inputs.mcp) } });
      if (doc.server) views.push({ label: "Server", out: { kind: "tree", value: doc.server } });
      return { text: text || "No tools found.", views, filename: "tools-call.json" };
    },
    examples: [], // filled below
    steps: ["Paste a tools/list result, a server manifest, or a JSON-RPC transcript (one message per line).", "Check Issues: every inputSchema is compiled with Ajv and linted for names, types and descriptions.", "Pick a tool by name to get a ready tools/call request; paste arguments to validate them."],
  },

  "fake-json-api-sw": {
    inputs: [{ id: "request", label: "Request", lang: "text", placeholder: "GET /mock-api/users/2\n\n(optional JSON body after a blank line)" }],
    options: [{ id: "show", label: "Output", type: "segment", choices: [["body", "Body"], ["full", "Full response"]], default: "body" }],
    custom: () => import("./ui/E-FakeApi"),
    async run({ inputs, opts }) {
      const { resolveMock, statusText } = await import("./lib/mockapi");
      const { mockMeta, parseRequestText } = await import("./lib/E-mockui");
      const req = parseRequestText(inputs.request ?? "");
      const r = await resolveMock(req.method, req.url, req.headers, req.body);
      if (!r) throw new ToolError(`No enabled mock route matches ${req.method} ${req.url.split("?")[0]}. Add a route, enable it, or reset to the defaults.`);
      const head = `HTTP/1.1 ${r.status} ${statusText(r.status)}\n${Object.entries(r.headers).map(([k, v]) => `${k}: ${v}`).join("\n")}`;
      const text = opts.show === "full" ? `${head}\n\n${r.body}` : r.body;
      let json: unknown;
      try {
        json = r.body ? JSON.parse(r.body) : undefined;
      } catch {
        json = undefined;
      }
      const views: View[] = [
        { label: "Response", out: { kind: "text", text, lang: opts.show === "full" || json === undefined ? "text" : "json" } },
        ...(json !== undefined ? [{ label: "Tree", out: { kind: "tree" as const, value: json } }] : []),
        { label: "Headers", out: { kind: "table", columns: ["header", "value"], rows: [["Status", `${r.status} ${statusText(r.status)}`], ...Object.entries(r.headers)] } },
      ];
      const res: Result = { text, views, notes: r.delay ? [`Answered after a ${r.delay} ms simulated delay.`] : undefined };
      mockMeta.set(res, { req, res: r });
      return res;
    },
    examples: [
      { label: "Get one user", inputs: { request: "GET /mock-api/users/2" }, note: "The :id segment picks one item from the stateful users collection." },
      { label: "Filter posts", inputs: { request: "GET /mock-api/posts?userId=1" }, note: "Any query field filters the collection — here, posts written by user 1." },
      { label: "Paginate", inputs: { request: "GET /mock-api/products?page=2&limit=5" }, opts: { show: "full" }, note: "?page= returns an envelope with meta and links; X-Total-Count is in the headers." },
      { label: "Create (POST)", inputs: { request: 'POST /mock-api/users\nContent-Type: application/json\n\n{\n  "name": "Katherine Johnson",\n  "email": "katherine@example.com",\n  "role": "editor"\n}' }, note: "POST persists into the collection (localStorage); GET /mock-api/users now includes it." },
      { label: "Patch", inputs: { request: 'PATCH /mock-api/users/1\n\n{"role": "owner", "active": true}' }, note: "PATCH merges fields into an existing item and returns it." },
      { label: "Template data", inputs: { request: "GET /mock-api/people?count=3" }, note: "{{#repeat}}, {{uuid}}, {{name}} and {{int}} build deterministic fake records." },
      { label: "Echo", inputs: { request: 'POST /mock-api/echo?debug=1\nX-Trace-Id: abc-123\nContent-Type: application/json\n\n{"hello": "mock"}' }, note: "The echo route reflects method, query, headers and body — handy for checking what a client sends." },
      { label: "Status 503", inputs: { request: "GET /mock-api/status/503" }, opts: { show: "full" }, note: "@status {{params.code}} sets the response status from the path." },
      { label: "No route", inputs: { request: "GET /mock-api/nothing-here" }, note: "Unmatched paths report which request had no route.", error: true },
    ],
    steps: ["Browse, edit and toggle routes — each has a method, a path with :params, status, delay, headers and a body template.", "Try requests in the test console; the response pane shows status, headers and body.", "Create a stateful collection to get full CRUD, or import/export all routes as JSON."],
    tips: ["Everything lives in this browser (localStorage) — export the routes to share them.", "fetch('/mock-api/…') from any tool in this app is answered by the same routes."],
  },
};

/* ── GraphQL examples ────────────────────────────────────────────────── */

const GQL_SCHEMA = `"""Someone who writes posts."""
type User {
  id: ID!
  name: String!
  email: String!
  role: Role!
  posts(first: Int): [Post!]!
  avatarUrl: String
  joinedAt: String
}

type Post {
  id: ID!
  title: String!
  body: String
  likes: Int!
  published: Boolean!
  tags: [String!]!
  author: User!
  comments: [Comment!]!
}

type Comment {
  id: ID!
  text: String!
  author: User
}

enum Role { ADMIN EDITOR VIEWER }

union SearchResult = User | Post

type Stats {
  users: Int!
  posts: Int!
  uptimeSeconds: Float!
  lastDeploy: String!
}

input NewPost {
  title: String!
  body: String
  authorId: ID!
  tags: [String!]
}

type Query {
  users(role: Role, first: Int): [User!]!
  user(id: ID!): User
  posts(published: Boolean, first: Int, offset: Int): [Post!]!
  post(id: ID!): Post
  search(term: String!): [SearchResult!]!
  stats: Stats!
}

type Mutation {
  createPost(input: NewPost!): Post!
  deletePost(id: ID!): Boolean!
}`;

const GQL_DATA = `{
  "users": [
    { "id": "1", "name": "Ada Lovelace", "email": "ada@example.com", "role": "ADMIN" },
    { "id": "2", "name": "Grace Hopper", "email": "grace@example.com", "role": "EDITOR" },
    { "id": "3", "name": "Alan Turing", "email": "alan@example.com", "role": "EDITOR" }
  ],
  "posts": [
    { "id": "10", "authorId": "1", "title": "Notes on the Analytical Engine", "likes": 120, "published": true, "tags": ["history", "math"] },
    { "id": "11", "authorId": "2", "title": "Compilers are for people", "likes": 87, "published": true, "tags": ["compilers"] },
    { "id": "12", "authorId": "2", "title": "Draft: nanoseconds explained", "likes": 3, "published": false, "tags": [] },
    { "id": "13", "authorId": "3", "title": "On computable numbers", "likes": 256, "published": true, "tags": ["theory"] }
  ],
  "comments": [
    { "id": "c1", "postId": "10", "authorId": "2", "text": "Visionary." },
    { "id": "c2", "postId": "10", "authorId": "3", "text": "The first program!" },
    { "id": "c3", "postId": "11", "authorId": "1", "text": "Agreed." }
  ]
}`;

const gq = (query: string, extra: { variables?: string } = {}) => ({ query, schema: GQL_SCHEMA, data: GQL_DATA, variables: extra.variables ?? "" });

specs["graphql-playground-ui"].examples = [
  {
    label: "Nested relations",
    inputs: gq(`query UsersWithPosts {
  users {
    id
    name
    role
    posts {
      title
      likes
      comments { text author { name } }
    }
  }
}`),
    note: "User.posts follows authorId, Post.comments follows postId, Comment.author follows authorId — all from plain JSON arrays.",
  },
  {
    label: "Fragments & aliases",
    inputs: gq(`{
  ada: user(id: 1) { ...Card }
  grace: user(id: 2) { ...Card }
}

fragment Card on User {
  name
  email
  posts(first: 1) { title }
}`),
    note: "user(id: 1) finds the item in users; aliases rename results and the fragment is reused. posts(first: 1) slices the list.",
  },
  {
    label: "Variables",
    inputs: gq(
      `query Published($published: Boolean!, $first: Int = 2) {
  posts(published: $published, first: $first) {
    id
    title
    likes
    author { name }
  }
}`,
      { variables: '{\n  "published": true,\n  "first": 3\n}' }
    ),
    note: "Arguments that name a field filter the list (published), first limits it; variables come from the JSON below.",
  },
  {
    label: "Mutation",
    inputs: gq(`mutation {
  createPost(input: {
    title: "Offline GraphQL"
    body: "Runs entirely in the browser."
    authorId: 3
    tags: ["graphql", "offline"]
  }) {
    id
    title
    published
    author { name email }
  }
}`),
    note: "createX inserts into the matching array with the next id (per run); the author resolves from authorId; published is auto-mocked.",
  },
  {
    label: "Enums, unions, auto-mock",
    inputs: gq(`{
  editors: users(role: EDITOR) { name role joinedAt avatarUrl }
  stats { users posts uptimeSeconds lastDeploy }
  search(term: "compilers") {
    __typename
    ... on User { name }
    ... on Post { title likes }
  }
}`),
    note: "role: EDITOR filters by enum; joinedAt, avatarUrl, stats and search are not in the data, so they are mocked by type and name.",
  },
  {
    label: "Pick an operation",
    inputs: gq(`query AllUsers { users { name } }

query PostDetail {
  post(id: 11) {
    title
    author { name }
    comments { text }
  }
}`),
    opts: { operation: "PostDetail" },
    note: "With several operations in one document, Operation chooses which to run.",
  },
  {
    label: "Invalid query",
    inputs: gq(`{
  user {
    name
    age
    posts { titel }
  }
}`),
    note: "Validation reports each problem with its line and column: a missing required argument and unknown fields.",
    error: true,
  },
];

/* ── API Workbench examples ──────────────────────────────────────────── */

const req = (o: Record<string, unknown>) => JSON.stringify({ method: "GET", headers: [{ k: "Accept", v: "application/json", on: true }], bodyType: "none", body: "", form: [], ...o });

specs["api-workbench"].examples = [
  { label: "List users", inputs: { request: req({ url: "/mock-api/users" }) }, note: "GET the users collection from the offline mock API — no network involved." },
  { label: "Get by id", inputs: { request: req({ url: "/mock-api/users/2" }) }, note: "A path parameter selects one item." },
  { label: "Query params", inputs: { request: req({ url: "/mock-api/products?page=2&limit=5", params: [{ k: "page", v: "2", on: true }, { k: "limit", v: "5", on: true }, { k: "category", v: "mouse", on: false }] }) }, note: "The Params table and the URL stay in sync; the disabled row is kept but not sent." },
  {
    label: "Create (POST JSON)",
    inputs: { request: req({ method: "POST", url: "/mock-api/users", bodyType: "json", body: '{\n  "name": "Hedy Lamarr",\n  "email": "hedy@example.com",\n  "role": "editor"\n}' }) },
    note: "A JSON body creates a user: 201 Created with a Location header. GET the list again to see it.",
  },
  { label: "404 Not Found", inputs: { request: req({ url: "/mock-api/users/999" }) }, note: "Errors are ordinary responses — status, headers and a JSON error body." },
  { label: "Slow endpoint", inputs: { request: req({ url: "/mock-api/slow?ms=900" }) }, note: "The mock waits ?ms= milliseconds; watch the timing." },
  {
    label: "Echo + auth",
    inputs: {
      request: req({
        method: "POST",
        url: "/mock-api/echo?debug=1",
        headers: [{ k: "Accept", v: "application/json", on: true }, { k: "X-Request-Id", v: "req-7f3a", on: true }, { k: "X-Disabled", v: "not sent", on: false }],
        bodyType: "form",
        form: [{ k: "name", v: "Ada", on: true }, { k: "lang", v: "en", on: true }],
        auth: { type: "bearer", token: "demo-" + "token-" + "1234", user: "", pass: "", key: "X-API-Key", value: "", in: "header" },
      }),
    },
    note: "The echo route reflects exactly what was sent: headers (incl. Authorization), query and the form body.",
  },
  { label: "Teapot 418", inputs: { request: req({ method: "DELETE", url: "/mock-api/status/418" }) }, note: "Any status code on demand — useful for testing client error handling." },
];

/* ── MCP examples ────────────────────────────────────────────────────── */

const MCP_TOOLS = `{
  "tools": [
    {
      "name": "get_weather",
      "title": "Current weather",
      "description": "Get the current weather for a city. Use when the user asks about temperature, rain or wind right now.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "city": { "type": "string", "description": "City name, e.g. London" },
          "units": { "type": "string", "enum": ["celsius", "fahrenheit"], "default": "celsius", "description": "Temperature unit" },
          "days": { "type": "integer", "minimum": 1, "maximum": 7, "description": "Forecast length" }
        },
        "required": ["city"],
        "additionalProperties": false
      },
      "outputSchema": {
        "type": "object",
        "properties": { "tempC": { "type": "number" }, "summary": { "type": "string" } },
        "required": ["tempC", "summary"]
      },
      "annotations": { "readOnlyHint": true, "openWorldHint": true }
    },
    {
      "name": "search_issues",
      "description": "Full-text search over the issue tracker; returns up to limit issues ordered by relevance.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "query": { "type": "string", "minLength": 2, "description": "Search terms" },
          "labels": { "type": "array", "items": { "type": "string" }, "description": "Only issues with all these labels" },
          "state": { "type": "string", "enum": ["open", "closed", "all"], "description": "Issue state" },
          "limit": { "type": "integer", "minimum": 1, "maximum": 100, "default": 20 }
        },
        "required": ["query"]
      }
    }
  ]
}`;

const MCP_MANIFEST = `{
  "name": "workspace-files",
  "version": "1.4.0",
  "description": "Read-only access to a project workspace.",
  "tools": [
    {
      "name": "read_file",
      "description": "Read a UTF-8 text file from the workspace and return its contents.",
      "inputSchema": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "path": { "type": "string", "description": "Path relative to the workspace root" },
          "range": {
            "type": "object",
            "description": "Optional line range",
            "properties": { "start": { "type": "integer", "minimum": 1 }, "end": { "type": "integer", "minimum": 1 } }
          }
        },
        "required": ["path"]
      },
      "annotations": { "readOnlyHint": true }
    },
    {
      "name": "list_dir",
      "description": "List the entries of a directory, optionally recursively up to a depth.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "path": { "type": "string", "default": "." },
          "depth": { "type": "integer", "minimum": 0, "maximum": 5, "default": 1 },
          "include_hidden": { "type": "boolean" }
        }
      }
    }
  ],
  "resources": [
    { "uri": "file:///workspace/README.md", "name": "README", "mimeType": "text/markdown", "description": "Project readme" },
    { "uri": "file:///workspace/package.json", "name": "package.json", "mimeType": "application/json" }
  ],
  "resourceTemplates": [
    { "uriTemplate": "file:///workspace/{path}", "name": "Any file", "description": "Read any workspace file by path" }
  ],
  "prompts": [
    { "name": "summarise_file", "description": "Summarise a file for a code review", "arguments": [{ "name": "path", "required": true }, { "name": "audience" }] },
    { "name": "explain_error", "description": "Explain a stack trace", "arguments": [{ "name": "trace", "required": true }] }
  ]
}`;

const MCP_TRANSCRIPT = [
  { ts: "2026-09-24T10:00:00.000Z", dir: "→", message: { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "inspector", version: "0.9" } } } },
  { ts: "2026-09-24T10:00:00.084Z", dir: "←", message: { jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-06-18", capabilities: { tools: { listChanged: true } }, serverInfo: { name: "weather", version: "2.1.0" } } } },
  { ts: "2026-09-24T10:00:00.090Z", dir: "→", message: { jsonrpc: "2.0", method: "notifications/initialized" } },
  { ts: "2026-09-24T10:00:00.100Z", dir: "→", message: { jsonrpc: "2.0", id: 2, method: "tools/list" } },
  { ts: "2026-09-24T10:00:00.131Z", dir: "←", message: { jsonrpc: "2.0", id: 2, result: { tools: [{ name: "get_weather", description: "Current weather for a city.", inputSchema: { type: "object", properties: { city: { type: "string" } }, required: ["city"] } }] } } },
  { ts: "2026-09-24T10:00:01.500Z", dir: "→", message: { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_weather", arguments: { city: "London" } } } },
  { ts: "2026-09-24T10:00:02.212Z", dir: "←", message: { jsonrpc: "2.0", id: 3, result: { content: [{ type: "text", text: "London: 14°C, light rain" }], isError: false } } },
  { ts: "2026-09-24T10:00:03.000Z", dir: "→", message: { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "get_forecast", arguments: { city: "Oslo" } } } },
  { ts: "2026-09-24T10:00:03.020Z", dir: "←", message: { jsonrpc: "2.0", id: 4, error: { code: -32602, message: "Unknown tool: get_forecast" } } },
  { ts: "2026-09-24T10:00:04.000Z", dir: "→", message: { jsonrpc: "2.0", id: 5, method: "resources/list" } },
]
  .map((l) => JSON.stringify(l))
  .join("\n");

const MCP_BROKEN = `{
  "tools": [
    {
      "name": "send email",
      "inputSchema": {
        "type": "object",
        "properties": {
          "to": { "type": "string", "format": "email" },
          "cc": { "type": "array" },
          "body": { "description": "Plain text" }
        },
        "required": ["to", "subject"]
      }
    },
    {
      "name": "delete_all",
      "description": "Delete",
      "inputSchema": { "type": "array", "items": { "type": "strin" } },
      "annotations": { "readOnlyHint": true, "destructiveHint": true }
    },
    {
      "name": "get_weather",
      "description": "Duplicate of a tool name elsewhere in the list.",
      "inputSchema": { "type": "object", "properties": { "n": { "type": "integer", "minimum": "one" } } }
    },
    {
      "name": "get_weather",
      "description": "Second tool with the same name, which clients cannot tell apart.",
      "inputSchema": { "type": "object" }
    }
  ]
}`;

specs["mcp-inspector-lite"].examples = [
  { label: "tools/list result", inputs: { mcp: MCP_TOOLS, args: "" }, note: "Two well-formed tools; the tools/call request uses generated example arguments (defaults, enums, sensible values)." },
  { label: "Validate arguments", inputs: { mcp: MCP_TOOLS, args: '{\n  "query": "x",\n  "state": "archived",\n  "limit": 500,\n  "extra": true\n}' }, opts: { tool: "search_issues" }, note: "Your arguments are checked against the tool's schema with Ajv: too short, not in the enum, above the maximum." },
  { label: "Server manifest", inputs: { mcp: MCP_MANIFEST, args: "" }, opts: { tool: "read_file", example: "required" }, note: "Tools, resources, resource templates and prompts; Required-only example arguments; a 2020-12 $schema." },
  { label: "JSON-RPC transcript", inputs: { mcp: MCP_TRANSCRIPT, args: "" }, note: "NDJSON lines paired by id with durations from timestamps; the failed call and the unanswered request are flagged." },
  { label: "Broken schemas", inputs: { mcp: MCP_BROKEN, args: "" }, note: "Invalid names, missing descriptions and types, required fields not in properties, a schema that does not compile and duplicate names." },
  { label: "Not JSON", inputs: { mcp: '{"tools": [ {"name": "a", } ]', args: "" }, note: "Input that is neither JSON nor NDJSON is rejected with the line that failed.", error: true },
];

export default specs;
