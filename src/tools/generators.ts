/**
 * Generators & DevOps. Every tool's heavy logic lives in lib/G-*.ts and is
 * imported lazily inside `run`; custom UIs live in ui/G-*.tsx.
 */
import { ToolError, bool, num, str, type Result, type SpecModule, type View } from "./types";
import { isNode } from "./lib/vendor";

/* ── shared helpers ──────────────────────────────────────────────────── */

type Faker = import("@faker-js/faker").Faker;

async function seededFaker(seedText: string): Promise<{ f: Faker; rnd: () => number; seed: number }> {
  const [{ faker }, { mulberry32, seedFrom }] = await Promise.all([import("@faker-js/faker/locale/en"), import("./lib/G-rand")]);
  const seed = seedFrom(seedText);
  faker.seed(seed);
  faker.setDefaultRefDate(new Date("2026-01-01T00:00:00Z"));
  return { f: faker, rnd: mulberry32(seed ^ 0x9e3779b9), seed };
}

function tableOf(rows: Record<string, unknown>[], cols?: string[]): View | null {
  if (!rows.length) return null;
  const columns = cols ?? [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return {
    label: "Table",
    out: {
      kind: "table",
      columns,
      rows: rows.map((r) => columns.map((c) => {
        const v = r[c];
        return v === undefined ? null : v !== null && typeof v === "object" ? JSON.stringify(v) : (v as string | number | boolean | null);
      })),
    },
  };
}

const indentOf = (o: unknown) => (o === "tab" ? "\t" : o === "0" ? undefined : Number(o) || 2);
const bytes = (s: string) => new TextEncoder().encode(s).length;
const fmtBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(2)} MB`);

/* ── example data ────────────────────────────────────────────────────── */

const ENV_APP = `# ── App ─────────────────────────────
NODE_ENV=production
PORT=3000
APP_URL=https://app.example.com
LOG_LEVEL=info

# ── Database ────────────────────────
DB_HOST=db.internal
DB_PORT=5432
DB_USER=billing
DB_PASSWORD="s3cr3t-p@ss#1"   # quoted so the # is kept
DATABASE_URL=postgres://\${DB_USER}:\${DB_PASSWORD}@\${DB_HOST}:\${DB_PORT}/billing

# ── Integrations ────────────────────
export STRIPE_SECRET_KEY=${"sk_" + "test_" + "4eC39HqLyjWDarjtT1zdp7dc"}
REDIS_URL=redis://cache.internal:6379/0
FEATURE_FLAGS=checkout,beta-dashboard
PRIVATE_KEY="-----BEGIN KEY-----
MIIBOgIBAAJBAKj34GkxFhD90vcNLYLInFEX6Ppy1tPf9Cnzj4p4WGeKLs1Pt8Qu
-----END KEY-----"`;

const ENV_BROKEN = `APP_NAME=My App
PORT = 8080
2FA_SECRET=abc
api-key=xyz
DEBUG=True
DB_PASSWORD=changeme
PORT=9090
GREETING="Hello, world
SESSION_SECRET=
CALLBACK_URL=\${BASE_URL}/auth/callback
this line has no equals sign`;

const ENV_PROD = `NODE_ENV=production
PORT=8080
APP_URL=https://app.example.com
LOG_LEVEL=warn
DB_HOST=db-prod.internal
DB_PORT=5432
DB_USER=billing
DB_PASSWORD="another-secret"
REDIS_URL=redis://cache-prod.internal:6379/0
SENTRY_DSN=https://abc123@o1.ingest.sentry.io/42`;

/* ── specs ───────────────────────────────────────────────────────────── */

const specs: SpecModule = {
  /* ── Lorem ipsum ─────────────────────────────────────────────────── */
  "lorem-generator": {
    generator: true,
    inputs: [],
    options: [
      { id: "unit", label: "Unit", type: "select", choices: [["paragraphs", "Paragraphs"], ["sentences", "Sentences"], ["words", "Words"], ["list", "List items"], ["headings", "Headings"]], default: "paragraphs" },
      { id: "count", label: "Count", type: "number", default: 3, min: 1, max: 5000 },
      { id: "length", label: "Length", type: "segment", choices: [["short", "Short"], ["medium", "Medium"], ["long", "Long"]], default: "medium", hint: "Words per sentence and sentences per paragraph" },
      { id: "vocab", label: "Vocabulary", type: "select", choices: [["latin", "Classic Latin"], ["english", "English-like"], ["tech", "Tech jargon"], ["business", "Business"]], default: "latin" },
      { id: "format", label: "Format", type: "segment", choices: [["plain", "Plain"], ["html", "HTML"], ["markdown", "Markdown"], ["json", "JSON"]], default: "plain" },
      { id: "start", label: "Start with the classic opener", type: "toggle", default: true },
      { id: "seed", label: "Seed", type: "text", default: "", placeholder: "random", width: 90, hint: "Any text or number: the same seed always gives the same text" },
    ],
    async run({ opts }) {
      const { generateLorem } = await import("./lib/G-lorem");
      const o = {
        unit: str(opts.unit, "paragraphs") as "paragraphs",
        count: Math.round(num(opts.count, 3)),
        start: bool(opts.start),
        vocab: str(opts.vocab, "latin"),
        format: str(opts.format, "plain") as "plain",
        length: str(opts.length, "medium") as "medium",
        seed: str(opts.seed),
      };
      if (o.count < 1) throw new ToolError("Count must be at least 1.");
      const { text, items, seed } = generateLorem(o);
      const words = items.join(" ").split(/\s+/).filter(Boolean).length;
      const sentences = (items.join(" ").match(/[.?!](\s|$)/g) ?? []).length;
      const lang = o.format === "html" ? "html" : o.format === "markdown" ? "markdown" : o.format === "json" ? "json" : "text";
      let preview: string;
      if (o.format === "html") preview = text;
      else if (o.format === "markdown") {
        const MarkdownIt = (await import("markdown-it")).default;
        preview = new MarkdownIt().render(text);
      } else {
        const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
        preview =
          o.unit === "list" ? `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` :
          o.unit === "headings" ? items.map((h, i) => `<h${(i % 3) + 1}>${esc(h)}</h${(i % 3) + 1}>`).join("") :
          o.unit === "paragraphs" ? items.map((p) => `<p>${esc(p)}</p>`).join("") : `<p>${esc(items.join(" "))}</p>`;
      }
      return {
        text,
        lang,
        filename: `lorem.${o.format === "html" ? "html" : o.format === "markdown" ? "md" : o.format === "json" ? "json" : "txt"}`,
        views: [
          { label: "Text", out: { kind: "text", text, lang, wrap: o.format !== "json" } },
          { label: "Preview", out: { kind: "html", html: preview } },
          {
            label: "Stats",
            out: {
              kind: "stats",
              items: [
                { label: o.unit === "list" ? "Items" : o.unit[0].toUpperCase() + o.unit.slice(1), value: items.length },
                { label: "Words", value: words },
                { label: "Sentences", value: sentences },
                { label: "Characters", value: text.length },
                { label: "Reading time", value: `${Math.max(1, Math.round(words / 230))} min`, tone: "info" },
                { label: "Seed", value: str(opts.seed) || String(seed), tone: str(opts.seed) ? "ok" : "info" },
              ],
            },
          },
        ],
        notes: str(opts.seed) ? undefined : [`Random seed ${seed} — type it into Seed to get this exact text again.`],
      };
    },
    examples: [
      { label: "3 paragraphs", opts: { unit: "paragraphs", count: 3, seed: "42" }, note: "The classic: Latin paragraphs opening with “Lorem ipsum dolor sit amet”. A fixed seed makes it reproducible." },
      { label: "HTML list", opts: { unit: "list", count: 6, format: "html", vocab: "english", seed: "list" }, note: "A <ul> of English-like list items, ready to paste into a template. See the Preview tab." },
      { label: "Markdown article", opts: { unit: "paragraphs", count: 4, format: "markdown", vocab: "tech", length: "long", seed: "blog" }, note: "Long tech-jargon paragraphs as Markdown — useful for blog and CMS fixtures." },
      { label: "Headings", opts: { unit: "headings", count: 6, format: "markdown", vocab: "business", seed: "7" }, note: "Title-cased business-speak headings at levels 1–3." },
      { label: "JSON words", opts: { unit: "words", count: 25, format: "json", start: false, seed: "words" }, note: "A JSON array of 25 words — handy as test data for tag pickers or autocomplete." },
      { label: "Short sentences", opts: { unit: "sentences", count: 5, length: "short", vocab: "english", start: false, seed: "" }, note: "No seed: every Generate gives new text." },
    ],
    steps: ["Pick a unit (paragraphs, sentences, words, list items or headings) and a count.", "Choose a vocabulary and an output format.", "Set a seed to get the same text every time — useful for snapshot tests.", "Copy, download, or open the Preview tab."],
  },

  /* ── UUID ────────────────────────────────────────────────────────── */
  "uuid-generator": {
    generator: true,
    inputs: [{ id: "input", label: "UUIDs to inspect · or names for v3/v5", lang: "text", placeholder: "Inspect: paste UUIDs, one per line.\nv3 / v5: type names (one UUID per line)." }],
    options: [
      { id: "mode", label: "Mode", type: "segment", choices: [["generate", "Generate"], ["inspect", "Inspect"]], default: "generate" },
      { id: "version", label: "Version", type: "select", choices: [["v4", "v4 · random"], ["v7", "v7 · time-ordered"], ["v1", "v1 · time + node"], ["v6", "v6 · reordered time"], ["v5", "v5 · SHA-1 name"], ["v3", "v3 · MD5 name"], ["nil", "Nil"], ["max", "Max"]], default: "v4", show: (o) => o.mode !== "inspect" },
      { id: "count", label: "Count", type: "number", default: 5, min: 1, max: 10000, show: (o) => o.mode !== "inspect" },
      { id: "format", label: "Format", type: "select", choices: [["standard", "Standard"], ["upper", "UPPERCASE"], ["nohyphen", "No hyphens"], ["braces", "{Braces}"], ["urn", "urn:uuid:"], ["base64", "Base64"], ["base64url", "Base64 URL"], ["int", "Integer"]], default: "standard", show: (o) => o.mode !== "inspect" },
      { id: "ns", label: "Namespace", type: "select", choices: [["dns", "DNS"], ["url", "URL"], ["oid", "OID"], ["x500", "X.500"], ["custom", "Custom…"]], default: "dns", show: (o) => o.mode !== "inspect" && (o.version === "v3" || o.version === "v5") },
      { id: "customNs", label: "Namespace UUID", type: "text", default: "", placeholder: "uuid", width: 290, show: (o) => o.mode !== "inspect" && (o.version === "v3" || o.version === "v5") && o.ns === "custom" },
    ],
    async run({ inputs, opts }) {
      const U = await import("./lib/G-uuid");
      if (opts.mode === "inspect") {
        const lines = inputs.input.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        if (!lines.length) throw new ToolError("Paste one or more UUIDs (one per line) to inspect them.");
        const rs = lines.map((l) => U.inspect(l));
        const bad = rs.filter((r) => !r.valid).length;
        const text = rs
          .map((r) => r.valid
            ? `${r.canonical}\n  version: ${r.versionName}\n  variant: ${r.variant}${r.time ? `\n  time:    ${r.time}` : ""}${r.clockSeq !== undefined ? `\n  clock:   ${r.clockSeq}` : ""}${r.node ? `\n  node:    ${r.node}` : ""}${r.notes.length ? "\n  " + r.notes.join("\n  ") : ""}`
            : `✗ ${r.input}\n  invalid: ${r.notes[0]}`)
          .join("\n\n");
        return {
          text,
          views: [
            { label: "Inspection", out: { kind: "table", columns: ["input", "valid", "version", "variant", "timestamp (UTC)", "clock seq", "node", "notes"], rows: rs.map((r) => [r.input, r.valid ? "✓" : "✗ invalid", r.versionName ?? null, r.variant ?? null, r.time ?? null, r.clockSeq ?? null, r.node ?? null, r.notes.join(" ")]) } },
            { label: "Report", out: { kind: "text", text } },
            { label: "Summary", out: { kind: "stats", items: [{ label: "UUIDs", value: rs.length }, { label: "Valid", value: rs.length - bad, tone: "ok" }, { label: "Invalid", value: bad, tone: bad ? "bad" : "ok" }, { label: "Time-based", value: rs.filter((r) => r.time).length, tone: "info" }] } },
          ],
        };
      }
      const count = Math.max(1, Math.min(10000, Math.round(num(opts.count, 5))));
      const v = str(opts.version, "v4");
      const fmt = str(opts.format, "standard");
      const ids: string[] = [];
      let names: string[] = [];
      const notes: string[] = [];
      if (v === "v3" || v === "v5") {
        const ns = opts.ns === "custom" ? U.normaliseUuid(str(opts.customNs)) : U.NAMESPACES[str(opts.ns, "dns")];
        if (!ns) throw new ToolError("The custom namespace must be a UUID, e.g. 6ba7b810-9dad-11d1-80b4-00c04fd430c8.");
        names = inputs.input.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        if (!names.length) {
          names = ["www.example.com"];
          notes.push("No names given — using “www.example.com”. Type names (one per line) into the input to hash your own.");
        }
        const hash = v === "v3" ? (await import("@noble/hashes/legacy.js")).md5 : (await import("@noble/hashes/legacy.js")).sha1;
        for (const n of names) ids.push(U.nameBased(hash, v === "v3" ? 3 : 5, ns, n));
        if (count !== 5 && count !== names.length) notes.push("Name-based UUIDs are deterministic: one per name, so Count is ignored.");
      } else {
        const gen = v === "v1" ? U.v1 : v === "v6" ? U.v6 : v === "v7" ? U.v7 : v === "nil" ? () => U.NIL : v === "max" ? () => U.MAX : U.v4;
        for (let i = 0; i < count; i++) ids.push(gen());
      }
      const out = ids.map((u) => U.formatUuid(u, fmt));
      const text = out.join("\n");
      const rows = ids.map((u, i) => {
        const r = U.inspect(u);
        return [i + 1, out[i], ...(names.length ? [names[i]] : []), r.time ?? null];
      });
      return {
        text,
        filename: "uuids.txt",
        notes: notes.length ? notes : undefined,
        views: [
          { label: `UUIDs (${ids.length})`, out: { kind: "text", text } },
          { label: "Table", out: { kind: "table", columns: ["#", "uuid", ...(names.length ? ["name"] : []), "embedded time"], rows } },
          { label: "JSON", out: { kind: "text", text: JSON.stringify(out, null, 2), lang: "json" } },
          { label: "Anatomy", out: { kind: "text", text: U.inspect(ids[0]).notes.join("\n") + `\n\n${ids[0]}\n${" ".repeat(14)}^ version nibble (${ids[0][14]})\n${" ".repeat(19)}^ variant bits (${ids[0][19]} → 10xx = RFC 9562)` } },
        ],
      };
    },
    examples: [
      { label: "5 × v4", opts: { version: "v4", count: 5 }, note: "Random v4 UUIDs from the browser's cryptographic RNG — the everyday choice." },
      { label: "v7 for databases", opts: { version: "v7", count: 8 }, note: "v7 starts with a millisecond timestamp, so IDs sort by creation time and keep B-tree indexes compact." },
      { label: "v5 from names", inputs: { input: "www.example.com\napi.example.com\nexample.org" }, opts: { version: "v5", ns: "dns" }, note: "Name-based: the same namespace + name always gives the same UUID (try it twice)." },
      { label: "v1 · braces", opts: { version: "v1", count: 3, format: "braces" }, note: "v1 embeds a 100-ns timestamp and a (here random) node ID; braces are the Windows GUID style." },
      { label: "Base64 v4", opts: { version: "v4", count: 4, format: "base64url" }, note: "22-character URL-safe Base64 — the same 128 bits in a shorter string." },
      {
        label: "Inspect mixed",
        inputs: { input: "f47ac10b-58cc-4372-a567-0e02b2c3d479\n{C232AB00-9414-11EC-B3C8-9F6BDECED846}\n017f22e2-79b0-7cc3-98c4-dc0c0c07398f\nurn:uuid:1ec9414c-232a-6b00-b3c8-9f6bdeced846\n886313e1-3b8a-5372-9b90-0c9aee199e5d\n00000000-0000-0000-0000-000000000000\nnot-a-uuid-1234" },
        opts: { mode: "inspect" },
        note: "Version, variant and the embedded timestamp of v1 / v6 / v7 UUIDs, in any common notation. The last line is invalid on purpose.",
      },
    ],
    tips: ["v4 for opaque IDs, v7 for database keys, v5 when the same input must always give the same ID.", "Inspect accepts braces, urn:uuid:, no-hyphen, Base64 and decimal forms."],
  },

  /* ── Env toolkit ─────────────────────────────────────────────────── */
  "env-toolkit": {
    inputs: [
      { id: "env", label: ".env file", lang: "ini", placeholder: "KEY=value\nexport OTHER=\"quoted value\"" },
      { id: "other", label: "Compare with (B)", lang: "ini", rows: 7, placeholder: "Paste a second .env (e.g. production) for Compare mode" },
    ],
    options: [
      { id: "mode", label: "Mode", type: "segment", choices: [["validate", "Validate"], ["compare", "Compare"], ["convert", "Convert"]], default: "validate" },
      { id: "to", label: "To", type: "select", choices: [["json", "JSON"], ["yaml", "YAML"], ["docker", "docker run -e"], ["envfile", "Docker --env-file"], ["compose", "docker-compose"], ["configmap", "K8s ConfigMap"], ["secret", "K8s Secret"], ["shell", "Shell export"], ["gha", "GitHub Actions env"], ["powershell", "PowerShell"], ["cmd", "Windows cmd"], ["example", ".env.example"]], default: "json", show: (o) => o.mode === "convert" },
      { id: "name", label: "Name", type: "text", default: "app-config", width: 120, show: (o) => o.mode === "convert" && ["configmap", "secret", "compose", "docker"].includes(String(o.to)), hint: "Resource / service / image name" },
      { id: "expand", label: "Expand ${VAR}", type: "toggle", default: true, hint: "Resolve ${VAR} and $VAR references (dotenv-expand)" },
      { id: "mask", label: "Mask values", type: "toggle", default: false, hint: "Hide values in the output — safe to share" },
    ],
    async run({ inputs, opts }) {
      const E = await import("./lib/G-env");
      if (!inputs.env.trim()) throw new ToolError("Paste a .env file to begin.");
      const mode = str(opts.mode, "validate");
      const { entries, issues } = E.parseEnv(inputs.env);
      const values = bool(opts.expand) ? E.expand(entries, issues) : new Map(entries.map((e) => [e.key, e.value]));
      const shown = (v: string) => (bool(opts.mask) ? E.mask(v) : v);
      const varsTable: View = {
        label: `Variables (${new Set(entries.map((e) => e.key)).size})`,
        out: { kind: "table", columns: ["line", "key", "value", "quoted", "export", "comment"], rows: entries.map((e) => [e.line, e.key, shown(values.get(e.key) ?? e.value).replace(/\n/g, "⏎"), e.quote || null, e.exported ? "yes" : null, e.comment ?? null]) },
      };
      if (mode === "compare") {
        if (!inputs.other.trim()) throw new ToolError("Compare mode: paste the second file into “Compare with (B)”.");
        const b = E.parseEnv(inputs.other);
        const bv = bool(opts.expand) ? E.expand(b.entries) : new Map(b.entries.map((e) => [e.key, e.value]));
        const keys = [...new Set([...entries.map((e) => e.key), ...b.entries.map((e) => e.key)])];
        const rows: (string | null)[][] = [];
        const counts = { missing: 0, extra: 0, changed: 0, same: 0 };
        for (const k of keys) {
          const inA = values.has(k), inB = bv.has(k);
          const st = !inB ? "missing in B" : !inA ? "only in B" : values.get(k) === bv.get(k) ? "same" : "changed";
          counts[st === "missing in B" ? "missing" : st === "only in B" ? "extra" : st === "changed" ? "changed" : "same"]++;
          rows.push([k, st, inA ? shown(values.get(k)!) : null, inB ? shown(bv.get(k)!) : null]);
        }
        const order: Record<string, number> = { "missing in B": 0, "only in B": 1, changed: 2, same: 3 };
        rows.sort((x, y) => order[x[1]!] - order[y[1]!] || String(x[0]).localeCompare(String(y[0])));
        const text =
          `${keys.length} keys: ${counts.missing} missing in B, ${counts.extra} only in B, ${counts.changed} changed, ${counts.same} same\n\n` +
          rows.filter((r) => r[1] !== "same").map((r) => `${r[1] === "missing in B" ? "-" : r[1] === "only in B" ? "+" : "~"} ${r[0]}${r[1] === "changed" ? `: ${r[2]} → ${r[3]}` : ""}`).join("\n");
        return {
          text: text.trim(),
          views: [
            { label: "Differences", out: { kind: "table", columns: ["key", "status", "A", "B"], rows } },
            { label: "Summary", out: { kind: "stats", items: [{ label: "Missing in B", value: counts.missing, tone: counts.missing ? "bad" : "ok" }, { label: "Only in B", value: counts.extra, tone: counts.extra ? "warn" : "ok" }, { label: "Changed", value: counts.changed, tone: "info" }, { label: "Same", value: counts.same, tone: "ok" }] } },
            { label: "Report", out: { kind: "text", text: text.trim() } },
          ],
        };
      }
      if (mode === "convert") {
        const errs = issues.filter((i) => i.level === "error");
        const { text, lang } = E.convert(entries, values, str(opts.to, "json"), { mask: bool(opts.mask), name: str(opts.name) });
        const ext = { json: "json", yaml: "yaml", shell: "sh", ini: "env", text: "txt" }[lang];
        return {
          text,
          lang,
          filename: opts.to === "example" ? ".env.example" : `env.${ext}`,
          notes: errs.length ? [`${errs.length} line(s) could not be parsed and were skipped — switch to Validate to see them.`] : undefined,
          views: [{ label: "Output", out: { kind: "text", text, lang } }, varsTable],
        };
      }
      E.validateExtras(entries, issues);
      issues.sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
      const errs = issues.filter((i) => i.level === "error").length, warns = issues.filter((i) => i.level === "warning").length;
      const ok = errs === 0;
      const title = !ok ? `Invalid .env: ${errs} error${errs > 1 ? "s" : ""}` : warns ? `Valid, with ${warns} warning${warns > 1 ? "s" : ""}` : "Valid .env";
      const text = `${title}\n${issues.map((i) => `${i.level}${i.line ? ` (line ${i.line})` : ""}: ${i.message}`).join("\n")}`.trim();
      return {
        text,
        views: [
          { label: `Issues (${issues.length})`, out: { kind: "issues", items: issues } },
          varsTable,
          { label: "Summary", out: { kind: "stats", items: [{ label: "Variables", value: new Set(entries.map((e) => e.key)).size }, { label: "Errors", value: errs, tone: errs ? "bad" : "ok" }, { label: "Warnings", value: warns, tone: warns ? "warn" : "ok" }, { label: "Exported", value: entries.filter((e) => e.exported).length, tone: "info" }, { label: "Multi-line", value: entries.filter((e) => e.value.includes("\n")).length, tone: "info" }, { label: "References", value: entries.filter((e) => /\$\{?[A-Za-z_]/.test(e.value) && e.quote !== "'").length, tone: "info" }] } },
          { label: "Resolved", out: { kind: "tree", value: Object.fromEntries([...values].map(([k, v]) => [k, shown(v)])) } },
        ],
      };
    },
    examples: [
      { label: "App .env", inputs: { env: ENV_APP }, note: "Comments, export prefix, quoted values with #, a multi-line key and ${VAR} references resolved in the Resolved tab." },
      { label: "Common mistakes", inputs: { env: ENV_BROKEN }, note: "Spaces around =, invalid names, duplicates, an unterminated quote, an undefined ${VAR} and a line without =.", error: true },
      { label: "Dev vs prod", inputs: { env: ENV_APP, other: ENV_PROD }, opts: { mode: "compare", mask: true }, note: "Keys missing from production, extra keys and changed values — masked so the report is safe to paste." },
      { label: "→ K8s Secret", inputs: { env: ENV_APP }, opts: { mode: "convert", to: "secret", name: "billing-api" }, note: "A Kubernetes Secret manifest with base64-encoded values (base64 is encoding, not encryption)." },
      { label: "→ docker run", inputs: { env: ENV_PROD }, opts: { mode: "convert", to: "docker", name: "billing-api" }, note: "Each variable becomes a correctly shell-quoted -e flag." },
      { label: "→ .env.example", inputs: { env: ENV_APP }, opts: { mode: "convert", to: "example" }, note: "Secrets blanked, URLs neutralised, other values replaced with placeholders — commit this one." },
      { label: "→ GitHub Actions", inputs: { env: ENV_PROD }, opts: { mode: "convert", to: "gha" }, note: "Secret-looking keys become ${{ secrets.NAME }} references instead of literal values." },
    ],
    tips: ["Validate follows dotenv rules; warnings flag what breaks `source .env` or Docker --env-file.", "Compare treats the first box as A (e.g. .env.example) and the second as B (e.g. production)."],
  },

  /* ── Random JSON ─────────────────────────────────────────────────── */
  "random-json-generator": {
    inputs: [{ id: "template", label: "Template (JSON with {{tokens}})", lang: "json", placeholder: '{\n  "users": ["{{repeat 3}}", {\n    "id": "{{index 1}}",\n    "name": "{{name}}",\n    "email": "{{email}}"\n  }]\n}' }],
    options: [
      { id: "seed", label: "Seed", type: "text", default: "", placeholder: "random", width: 90, hint: "Same seed + same template = same output" },
      { id: "copies", label: "Documents", type: "number", default: 1, min: 1, max: 1000, hint: "Generate several documents (wrapped in an array)" },
      { id: "indent", label: "Indent", type: "segment", choices: [["2", "2"], ["4", "4"], ["tab", "Tab"], ["0", "Min"]], default: "2" },
    ],
    outLang: "json",
    async run({ inputs, opts }) {
      const R = await import("./lib/G-rjson");
      const src = inputs.template;
      if (!src.trim()) throw new ToolError('Type a JSON template, e.g. {"name": "{{name}}", "age": "{{int 18 90}}"} — or pick an example.');
      const { parseJson, JsonSyntaxError } = await import("./lib/jsonparse");
      let tpl: unknown;
      try {
        tpl = parseJson(src, { tolerant: true });
      } catch (e) {
        if (e instanceof JsonSyntaxError) throw new ToolError(`Template is not valid JSON: ${e.issue.message} (line ${e.issue.line}, column ${e.issue.col})`);
        throw e;
      }
      const { f, rnd, seed } = await seededFaker(str(opts.seed));
      const copies = Math.max(1, Math.min(1000, Math.round(num(opts.copies, 1))));
      let value: unknown;
      let stats = { nodes: 0, tokens: 0, repeats: 0 };
      if (copies === 1) ({ value, stats } = R.generate(tpl, f, rnd));
      else {
        const arr: unknown[] = [];
        for (let i = 0; i < copies; i++) {
          const g = R.generate(tpl, f, rnd);
          arr.push(g.value);
          stats = { nodes: stats.nodes + g.stats.nodes, tokens: stats.tokens + g.stats.tokens, repeats: stats.repeats + g.stats.repeats };
        }
        value = arr;
      }
      const text = JSON.stringify(value, null, indentOf(opts.indent));
      const views: View[] = [{ label: "JSON", out: { kind: "text", text, lang: "json" } }, { label: "Tree", out: { kind: "tree", value } }];
      const firstArr = Array.isArray(value) ? value : value && typeof value === "object" ? Object.values(value as object).find((x) => Array.isArray(x) && x.length && x.every((r) => r && typeof r === "object" && !Array.isArray(r))) : null;
      if (Array.isArray(firstArr) && firstArr.every((r) => r && typeof r === "object" && !Array.isArray(r))) {
        const t = tableOf(firstArr as Record<string, unknown>[]);
        if (t) views.push(t);
      }
      const docs = R.tokenDocs();
      views.push(
        { label: "Tokens", out: { kind: "table", columns: ["token", "arguments", "what it makes"], rows: docs.map((d) => [d.token, d.args || null, d.desc]) } },
        { label: "Stats", out: { kind: "stats", items: [{ label: "Tokens filled", value: stats.tokens }, { label: "Repeat blocks", value: stats.repeats }, { label: "Values", value: stats.nodes }, { label: "Size", value: fmtBytes(bytes(text)), tone: "info" }, { label: "Seed", value: str(opts.seed) || String(seed), tone: str(opts.seed) ? "ok" : "info" }] } }
      );
      return { text, views, filename: "random.json" };
    },
    examples: [
      {
        label: "Users",
        inputs: { template: `{\n  "users": ["{{repeat 4}}", {\n    "id": "{{index 1}}",\n    "uuid": "{{uuid}}",\n    "firstName": "{{firstName}}",\n    "lastName": "{{lastName}}",\n    "email": "{{email}}",\n    "age": "{{int 18 80}}",\n    "active": "{{bool 80}}",\n    "role": "{{pick admin editor viewer}}",\n    "address": {\n      "street": "{{street}}",\n      "city": "{{city}}",\n      "country": "{{country}}"\n    },\n    "joined": "{{date 2021-01-01 2025-12-31}}",\n    "avatar": "{{avatar}}"\n  }]\n}` },
        opts: { seed: "users" },
        note: "A lone token keeps its type — ages are numbers, active is a boolean — and the email follows each user's name.",
      },
      {
        label: "E-commerce orders",
        inputs: { template: `["{{repeat 3}}", {\n  "orderId": "{{pattern ORD-####-AA}}",\n  "placedAt": "{{datetime 2025-01-01 2025-12-31}}",\n  "customer": { "name": "{{name}}", "email": "{{email}}", "phone": "{{phone}}" },\n  "status": "{{weighted delivered:60 shipped:25 cancelled:15}}",\n  "items": ["{{repeat 1 4}}", {\n    "sku": "{{pattern SKU-[A-Z]{3}-###}}",\n    "product": "{{product}}",\n    "qty": "{{int 1 5}}",\n    "price": "{{price 3 250}}"\n  }],\n  "shipping": { "method": "{{pick standard express \\"next day\\"}}", "address": "{{address}}" },\n  "note": "Gift wrap for {{firstName}}? {{bool 30}}"\n}]` },
        opts: { seed: "shop" },
        note: "{{repeat 1 4}} gives each order a random number of items; tokens inside text are interpolated as strings.",
      },
      {
        label: "Paginated API",
        inputs: { template: `{\n  "data": ["{{repeat 5}}", {\n    "id": "{{objectId}}",\n    "type": "article",\n    "attributes": {\n      "title": "{{title}}",\n      "slug": "{{slug}}",\n      "tags": "{{tags 1 3}}",\n      "readingMinutes": "{{int 2 15}}"\n    }\n  }],\n  "meta": { "page": 1, "perPage": 5, "total": "{{int 40 400}}", "requestId": "{{uuid}}" },\n  "links": { "self": "/articles?page=1", "next": "/articles?page=2" }\n}` },
        opts: { seed: "api", indent: "4" },
        note: "A JSON:API-style page — literal values pass through untouched, {{tags}} makes a real array.",
      },
      {
        label: "IoT readings",
        inputs: { template: `{\n  "device": "{{pattern sensor-[a-f0-9]{8}}}",\n  "firmware": "{{semver}}",\n  "location": { "lat": "{{lat}}", "lng": "{{lng}}" },\n  "readings": ["{{repeat 6}}", {\n    "seq": "{{index}}",\n    "at": "{{datetime 2025-09-01 2025-09-02}}",\n    "tempC": "{{float -5 35 2}}",\n    "humidity": "{{float 20 90 1}}",\n    "battery": "{{int 10 100}}",\n    "ok": "{{bool 95}}"\n  }]\n}` },
        opts: { seed: "iot", copies: 2 },
        note: "Documents = 2 wraps two independent device payloads in an array — handy for batch-ingest tests.",
      },
      {
        label: "Blog + comments",
        inputs: { template: `{\n  "posts": ["{{repeat 2}}", {\n    "id": "{{index 1}}",\n    "title": "{{title}}",\n    "author": { "name": "{{name}}", "username": "{{username}}" },\n    "body": "{{paragraph 2}}",\n    "published": "{{date 2024-01-01 2025-12-31}}",\n    "comments": ["{{repeat 0 3}}", {\n      "id": "{{uuid}}",\n      "by": "{{username}}",\n      "text": "{{sentence}}",\n      "likes": "{{int 0 40}}"\n    }]\n  }]\n}` },
        opts: { seed: "blog" },
        note: "Nested repeats: every post gets 0–3 comments, and {{index}} counts within its own array.",
      },
      { label: "Unknown token", inputs: { template: '{\n  "name": "{{fullname}}",\n  "mail": "{{emial}}"\n}' }, note: "A misspelt token is reported with its JSONPath and suggestions.", error: true },
    ],
    steps: ["Write JSON where string values contain {{tokens}} — see the Tokens tab for all of them.", 'Put "{{repeat n}}" (or "{{repeat min max}}") as the first element of an array to repeat the next element.', "Set a seed for reproducible output, or leave it blank for fresh data each run."],
    tips: ['A value that is exactly one token keeps its type: "{{int 1 9}}" becomes 7, not "7".', "Emails and usernames follow the firstName / lastName / name generated earlier in the same object."],
  },
};

export default specs;

export type { Result };
