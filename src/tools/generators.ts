/**
 * Generators & DevOps. Every tool's heavy logic lives in lib/G-*.ts and is
 * imported lazily inside `run`; custom UIs live in ui/G-*.tsx.
 */
import { ToolError, bool, num, str, type Result, type SpecModule, type View } from "./types";
import { isNode } from "./lib/vendor";
import { PRESETS as MOCK } from "./lib/G-mock-presets";

/* ── shared helpers ──────────────────────────────────────────────────── */

type Faker = import("@faker-js/faker").Faker;
type LoremOpts = import("./lib/G-lorem").LoremOpts;

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

const CRON_ZONES: [string, string][] = [
  ["UTC", "UTC"], ["local", "Local (this browser)"], ["Europe/London", "Europe/London"], ["Europe/Berlin", "Europe/Berlin"], ["Europe/Paris", "Europe/Paris"],
  ["Europe/Istanbul", "Europe/Istanbul"], ["Africa/Johannesburg", "Africa/Johannesburg"], ["America/New_York", "America/New_York"], ["America/Chicago", "America/Chicago"],
  ["America/Denver", "America/Denver"], ["America/Los_Angeles", "America/Los_Angeles"], ["America/Sao_Paulo", "America/Sao_Paulo"], ["Asia/Dubai", "Asia/Dubai"],
  ["Asia/Kolkata", "Asia/Kolkata"], ["Asia/Singapore", "Asia/Singapore"], ["Asia/Shanghai", "Asia/Shanghai"], ["Asia/Tokyo", "Asia/Tokyo"], ["Australia/Sydney", "Australia/Sydney"], ["Pacific/Auckland", "Pacific/Auckland"],
];

function toHex8(c: string): string {
  if (!/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(c)) throw new ToolError(`“${c}” is not a hex colour — use #rrggbb.`);
  return c;
}

async function decodeImage(dataUrl: string): Promise<string> {
  const { readQrFromDataUrl } = await import("./lib/G-qr-read");
  return readQrFromDataUrl(dataUrl);
}


/** Parse a JSON form state from an input, merged over defaults. */
function readForm<T extends object>(raw: string, defaults: T): T {
  if (!raw?.trim()) return { ...defaults };
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("not an object");
    return { ...defaults, ...v };
  } catch (e) {
    throw new ToolError(`The form state is not valid JSON (${(e as Error).message}). Use the form above, or Clear to start again.`);
  }
}

const form = (o: object) => JSON.stringify(o, null, 2);

function cmdResult(command: string, explain: [string, string, string][], warnings: { level: "error" | "warning" | "info"; message: string }[], extra: View[]): Result {
  const errs = warnings.filter((w) => w.level === "error");
  if (errs.length) throw new ToolError(errs.map((e) => e.message).join("\n"));
  return {
    text: command,
    lang: "shell",
    views: [
      { label: "Command", out: { kind: "text", text: command, lang: "shell", wrap: true } },
      { label: `Explained (${explain.length})`, out: { kind: "table", columns: ["flag", "value", "meaning"], rows: explain } },
      { label: `Warnings (${warnings.length})`, out: { kind: "issues", items: warnings.length ? warnings : [{ level: "ok", message: "Nothing to flag." }] } },
      ...extra,
    ],
  };
}

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


const GHA_CI = `name: CI

on:
  push:
    branches: [main]
    paths-ignore: ["docs/**", "*.md"]
  pull_request:
    branches: [main, "release/**"]

permissions:
  contents: read

concurrency:
  group: ci-\${{ github.ref }}
  cancel-in-progress: true

env:
  FORCE_COLOR: "1"

jobs:
  test:
    name: Test (Node \${{ matrix.node }}, \${{ matrix.os }})
    runs-on: \${{ matrix.os }}
    timeout-minutes: 15
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, windows-latest]
        node: [18, 20, 22]
        exclude:
          - os: windows-latest
            node: 18
        include:
          - node: 22
            coverage: true
          - os: macos-14
            node: 22
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: \${{ matrix.node }}
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm test -- --coverage=\${{ matrix.coverage || false }}
      - uses: actions/upload-artifact@v4
        if: matrix.coverage
        with:
          name: coverage
          path: coverage/
          retention-days: 7

  build:
    needs: test
    runs-on: ubuntu-latest
    timeout-minutes: 10
    outputs:
      version: \${{ steps.meta.outputs.version }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci && npm run build
      - id: meta
        run: echo "version=$(node -p 'require(\\"./package.json\\").version')" >> "$GITHUB_OUTPUT"
      - uses: actions/upload-artifact@v4
        with:
          name: dist
          path: dist/
`;

const GHA_DEPLOY = `name: Deploy

on:
  push:
    tags: ["v*.*.*"]

permissions:
  id-token: write
  contents: read

concurrency:
  group: deploy-production
  cancel-in-progress: false

jobs:
  image:
    runs-on: ubuntu-24.04
    timeout-minutes: 30
    outputs:
      tags: \${{ steps.meta.outputs.tags }}
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789012:role/gha-deploy
          aws-region: eu-west-2
      - id: ecr
        uses: aws-actions/amazon-ecr-login@v2
      - uses: docker/setup-qemu-action@v3
      - uses: docker/setup-buildx-action@v3
      - id: meta
        uses: docker/metadata-action@v5
        with:
          images: \${{ steps.ecr.outputs.registry }}/shop-api
      - uses: docker/build-push-action@v6
        with:
          context: .
          platforms: linux/amd64,linux/arm64
          push: true
          tags: \${{ steps.meta.outputs.tags }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy:
    needs: image
    runs-on: ubuntu-24.04
    timeout-minutes: 20
    environment:
      name: production
      url: https://shop.example.com
    steps:
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789012:role/gha-deploy
          aws-region: eu-west-2
      - name: Roll out
        run: |
          aws ecs update-service --cluster prod --service shop-api --force-new-deployment
          aws ecs wait services-stable --cluster prod --services shop-api
`;

const GHA_DISPATCH = `name: Nightly data sync

on:
  schedule:
    - cron: "30 2 * * 1-5"
  workflow_dispatch:
    inputs:
      environment:
        description: Target environment
        type: choice
        options: [staging, production]
        default: staging
        required: true
      dry_run:
        description: Only report what would change
        type: boolean
        default: true

permissions:
  contents: read

jobs:
  sync:
    uses: acme/platform-workflows/.github/workflows/data-sync.yml@v3.2.0
    with:
      environment: \${{ inputs.environment || 'staging' }}
      dry-run: \${{ inputs.dry_run || false }}
    secrets: inherit

  notify:
    needs: sync
    if: failure()
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: slackapi/slack-github-action@v1.27.0
        with:
          channel-id: C0123456789
          slack-message: "Nightly sync failed: \${{ github.server_url }}/\${{ github.repository }}/actions/runs/\${{ github.run_id }}"
        env:
          SLACK_BOT_TOKEN: \${{ secrets.SLACK_BOT_TOKEN }}
`;

const GHA_INSECURE = `name: PR preview

on:
  pull_request_target:
    types: [opened, synchronize]

jobs:
  preview:
    runs-on: ubuntu-20.04
    steps:
      - uses: actions/checkout@v3
        with:
          ref: \${{ github.event.pull_request.head.sha }}
      - uses: some-org/setup-preview@master
      - uses: peaceiris/actions-gh-pages@v4
        with:
          publish_dir: ./public
      - name: Build
        run: |
          echo "Building \${{ github.event.pull_request.title }}"
          npm install && npm run build
          echo "::set-output name=url::https://preview.example.com/\${{ github.event.number }}"
      - uses: actions/upload-artifact@v3
        with:
          name: site
          path: public/
`;

const GHA_PAGES = `name: Deploy site to Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: ./dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    timeout-minutes: 5
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
`;

/* ── specs ───────────────────────────────────────────────────────────── */

const specs: SpecModule = {
  /* ── Lorem ipsum ─────────────────────────────────────────────────── */
  "lorem-generator": {
    generator: true,
    layout: "stack",
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
      const o: LoremOpts = {
        unit: str(opts.unit, "paragraphs") as LoremOpts["unit"],
        count: Math.round(num(opts.count, 3)),
        start: bool(opts.start),
        vocab: str(opts.vocab, "latin"),
        format: str(opts.format, "plain") as LoremOpts["format"],
        length: str(opts.length, "medium") as LoremOpts["length"],
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
        {
          label: "Tokens",
          out: {
            kind: "table",
            columns: ["token", "what it makes", "example", "arguments"],
            rows: docs.map((d) => {
              let ex = "";
              if (!d.token.startsWith("[")) {
                try {
                  ex = JSON.stringify(R.generate(d.token, f, rnd).value);
                } catch {
                  ex = "";
                }
              }
              return [d.token, d.desc, ex.length > 60 ? ex.slice(0, 57) + "…" : ex, d.args];
            }),
          },
        },
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

  /* ── Mock data ───────────────────────────────────────────────────── */
  "mock-data-generator": {
    inputs: [{ id: "schema", label: "Schema (JSON)", lang: "json", placeholder: '{"fields": [{"name": "id", "type": "increment"}, {"name": "email", "type": "email"}]}' }],
    options: [
      { id: "rows", label: "Rows", type: "number", default: 25, min: 1, max: 10000 },
      { id: "format", label: "Format", type: "select", choices: [["json", "JSON"], ["ndjson", "NDJSON"], ["csv", "CSV"], ["tsv", "TSV"], ["sql", "SQL INSERT"], ["xml", "XML"], ["markdown", "Markdown table"], ["yaml", "YAML"]], default: "json" },
      { id: "table", label: "Table", type: "text", default: "mock_data", width: 110, show: (o) => o.format === "sql" || o.format === "xml", hint: "Table name (SQL) or root element (XML)" },
      { id: "dialect", label: "Dialect", type: "select", choices: [["postgres", "PostgreSQL"], ["mysql", "MySQL"], ["sqlite", "SQLite"], ["mssql", "SQL Server"]], default: "postgres", show: (o) => o.format === "sql" },
      { id: "batch", label: "Rows / INSERT", type: "number", default: 100, min: 1, max: 1000, show: (o) => o.format === "sql" },
      { id: "ddl", label: "CREATE TABLE", type: "toggle", default: true, show: (o) => o.format === "sql" },
      { id: "seed", label: "Seed", type: "text", default: "", placeholder: "random", width: 90, hint: "Same seed + schema = same rows" },
    ],
    custom: () => import("./ui/G-MockBuilder"),
    async run({ inputs, opts, pipeline }) {
      const [M, ctx] = await Promise.all([import("./lib/G-mock"), seededFaker(str(opts.seed))]);
      const schema = M.readSchema(inputs.schema);
      if (!schema.fields.length) throw new ToolError("The schema has no fields yet — add one with “Add field”.");
      const n = Math.max(1, Math.min(10000, Math.round(num(opts.rows, 25))));
      const t0 = Date.now();
      const { rows, nulls } = M.generateRows(schema, n, ctx.f, ctx.rnd);
      const names = schema.fields.map((f) => f.name);
      const out = await M.renderRows(rows, names, { format: str(opts.format, "json"), table: str(opts.table, "mock_data"), dialect: str(opts.dialect, "postgres"), ddl: bool(opts.ddl), batch: Math.round(num(opts.batch, 100)) });
      const views: View[] = [{ label: str(opts.format, "json").toUpperCase(), out: { kind: "text", text: out.text, lang: out.lang } }];
      if (!pipeline) {
        const t = tableOf(rows, names);
        if (t) views.push({ ...t, label: `Table (${rows.length})` });
        views.push({
          label: "Stats",
          out: {
            kind: "stats",
            items: [
              { label: "Rows", value: rows.length },
              { label: "Fields", value: names.length },
              { label: "Nulls", value: nulls, tone: nulls ? "info" : "ok" },
              { label: "Output", value: fmtBytes(bytes(out.text)), tone: "info" },
              { label: "Generated in", value: `${Date.now() - t0} ms` },
              { label: "Seed", value: str(opts.seed) || String(ctx.seed), tone: str(opts.seed) ? "ok" : "info" },
            ],
          },
        });
      }
      return { text: out.text, lang: out.lang, views, filename: `${str(opts.table, "mock_data") || "mock_data"}.${out.ext}` };
    },
    examples: [
      { label: "Users", inputs: { schema: MOCK.users }, opts: { seed: "users", rows: 25 }, note: "Emails and usernames follow each row's name; plan is a weighted enum (60/30/10); 20% of phones are null." },
      { label: "Orders → SQL", inputs: { schema: MOCK.orders }, opts: { seed: "orders", rows: 50, format: "sql", table: "orders", dialect: "postgres" }, note: "Formula fields compute subtotal, tax and total from earlier columns; CREATE TABLE types are inferred." },
      { label: "Products → CSV", inputs: { schema: MOCK.products }, opts: { seed: "products", rows: 40, format: "csv" }, note: "Pattern SKUs ([A-Z]{3}-####) kept unique, margins computed by formula." },
      { label: "Transactions", inputs: { schema: MOCK.transactions }, opts: { seed: "txn", rows: 100, format: "ndjson" }, note: "Signed amounts via a conditional formula — type == \"credit\" ? amount : -amount." },
      { label: "IoT readings", inputs: { schema: MOCK.iot }, opts: { seed: "iot", rows: 200, format: "markdown" }, note: "Sensor readings with an alert flag computed from temperature and battery." },
      { label: "Blog posts → YAML", inputs: { schema: MOCK.posts }, opts: { seed: "posts", rows: 5, format: "yaml" }, note: "Slugs derived from titles with slug(); 25% of drafts have no publish date." },
      { label: "Employees → XML", inputs: { schema: MOCK.employees }, opts: { seed: "staff", rows: 12, format: "xml", table: "employees" }, note: "full_name built with concat(); XML uses the table name as the root element." },
      { label: "Bad formula", inputs: { schema: '{"fields": [\n  {"name": "price", "type": "price"},\n  {"name": "total", "type": "formula", "formula": "price * qty"}\n]}' }, note: "Formulas may only refer to fields defined before them.", error: true },
    ],
    steps: ["Pick a preset from Examples or add fields one by one: name, type, options.", "Use enum for weighted choices (active:70,inactive:30), pattern for codes (INV-####), formula to compute from earlier fields.", "Choose the row count, output format and a seed; the table preview shows the first rows."],
    tips: ["Nullable % makes a share of values null; Unique retries until each value is distinct.", "Formula functions: round, floor, ceil, abs, min, max, upper, lower, concat, len, slug, initials, pad, if, adddays, year, coalesce."],
  },

  /* ── Cron ────────────────────────────────────────────────────────── */
  "cron-builder": {
    inputs: [{ id: "expr", label: "Cron expression", kind: "text", placeholder: "*/5 * * * *" }],
    options: [
      { id: "tz", label: "Time zone", type: "select", choices: CRON_ZONES, default: "UTC" },
      { id: "count", label: "Next runs", type: "number", default: 10, min: 1, max: 100 },
      { id: "format", label: "Output", type: "select", choices: [["plain", "Cron line"], ["quartz", "Quartz"], ["github", "GitHub Actions"], ["k8s", "Kubernetes CronJob"], ["systemd", "systemd timer"], ["aws", "AWS EventBridge"]], default: "plain" },
    ],
    custom: () => import("./ui/G-CronBuilder"),
    async run({ inputs, opts }) {
      const C = await import("./lib/G-cron");
      const expr = inputs.expr.trim();
      const c = C.parseCron(expr);
      const tz = str(opts.tz, "UTC") === "local" ? C.localZone() : str(opts.tz, "UTC");
      const count = Math.max(1, Math.min(100, Math.round(num(opts.count, 10))));
      const { times, skipped } = C.nextRuns(c, tz, Date.now(), count);
      const cronstrue = (await import("cronstrue")).default;
      const conv = C.convertCron(c);
      let english = "";
      try {
        english = cronstrue.toString(c.dialect === "unix" ? (c.hasSeconds ? `${c.fields.second.text} ${conv.unix}` : conv.unix) : conv.quartz, { use24HourTimeFormat: true, dayOfWeekStartIndexZero: c.dialect === "unix", verbose: false });
      } catch {
        english = "";
      }
      const fmtTime = (t: number) => {
        const [y, mo, d, h, mi, sec] = C.wallParts(tz, t);
        const wd = C.DAY_LONG[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()].slice(0, 3);
        return `${wd} ${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")} ${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}${c.hasSeconds ? ":" + String(sec).padStart(2, "0") : ""}`;
      };
      const rel = (t: number) => {
        const m = Math.round((t - Date.now()) / 60000);
        return m < 60 ? `in ${m} min` : m < 1440 * 2 ? `in ${Math.round(m / 60)} h` : `in ${Math.round(m / 1440)} days`;
      };
      const sd = C.toSystemd(c, tz);
      const formats: Record<string, string> = {
        plain: c.hasSeconds ? `${c.fields.second.text} ${conv.unix}` : conv.unix,
        quartz: conv.quartz,
        github: `on:\n  schedule:\n    # ${english || expr} (GitHub always uses UTC)\n    - cron: "${conv.unix}"`,
        k8s: `apiVersion: batch/v1\nkind: CronJob\nmetadata:\n  name: my-job\nspec:\n  schedule: "${conv.unix}"\n  timeZone: "${tz}"\n  concurrencyPolicy: Forbid\n  startingDeadlineSeconds: 300\n  successfulJobsHistoryLimit: 3\n  failedJobsHistoryLimit: 1\n  jobTemplate:\n    spec:\n      backoffLimit: 2\n      template:\n        spec:\n          restartPolicy: OnFailure\n          containers:\n            - name: job\n              image: busybox:1.36\n              command: ["/bin/sh", "-c", "date; echo Hello from the CronJob"]`,
        systemd: `# /etc/systemd/system/my-job.timer\n[Unit]\nDescription=${english || expr}\n\n[Timer]\nOnCalendar=${sd.text}\nPersistent=true\nUnit=my-job.service\n\n[Install]\nWantedBy=timers.target\n\n# Check with: systemd-analyze calendar "${sd.text}"`,
        aws: conv.aws,
      };
      const fmtWarn: Record<string, string[]> = {
        plain: conv.warnings.unix,
        quartz: conv.warnings.quartz,
        github: [...conv.warnings.unix, ...(tz !== "UTC" ? [`GitHub Actions schedules run in UTC — the times below are in ${tz}.`] : [])],
        k8s: [...conv.warnings.unix, "spec.timeZone needs Kubernetes 1.27+."],
        systemd: sd.warnings,
        aws: [...conv.warnings.aws, "EventBridge Scheduler can take a time zone; classic EventBridge rules run in UTC."],
      };
      const fmtKey = str(opts.format, "plain");
      const primary = formats[fmtKey] ?? formats.plain;
      const notes = [...c.warnings, ...(fmtWarn[fmtKey] ?? [])];
      if (skipped) notes.push(`${skipped} run time(s) fall into a daylight-saving gap in ${tz} and were skipped.`);
      if (!times.length) notes.push("No run times in the next 30 years — this schedule never fires.");
      const fieldsRows = (["second", "minute", "hour", "dom", "month", "dow", "year"] as const)
        .filter((k) => (k !== "second" || c.hasSeconds) && (k !== "year" || c.hasYear))
        .map((k) => [C.FIELD_INFO[k].label, c.fields[k].text, C.explainField(c.fields[k])]);
      const text = `${english ? english + "\n" : ""}${primary}\n\nNext ${times.length} run${times.length === 1 ? "" : "s"} (${tz}):\n${times.map((t) => "  " + fmtTime(t)).join("\n")}`;
      return {
        text,
        notes: notes.length ? notes : undefined,
        views: [
          { label: "Next runs", out: { kind: "table", columns: [`time (${tz})`, "UTC", "from now"], rows: times.map((t) => [fmtTime(t), new Date(t).toISOString().replace(".000Z", "Z"), rel(t)]) } },
          { label: "Fields", out: { kind: "table", columns: ["field", "value", "meaning"], rows: fieldsRows } },
          { label: "Output", out: { kind: "text", text: primary, lang: fmtKey === "k8s" || fmtKey === "github" ? "yaml" : fmtKey === "systemd" ? "ini" : "text" } },
          { label: "All formats", out: { kind: "table", columns: ["target", "expression"], rows: [["Cron (5 field)", conv.unix], ["Quartz / Spring", conv.quartz], ["AWS EventBridge", conv.aws], ["systemd OnCalendar", sd.text], ["GitHub Actions", `cron: "${conv.unix}"`], ["Kubernetes", `schedule: "${conv.unix}"`]] } },
          { label: "Summary", out: { kind: "text", text, wrap: true } },
        ],
      };
    },
    examples: [
      { label: "Every 5 minutes", inputs: { expr: "*/5 * * * *" }, note: "The */n step: every fifth minute (0, 5, 10 … 55)." },
      { label: "Weekdays 09:30", inputs: { expr: "30 9 * * MON-FRI" }, opts: { tz: "Europe/London" }, note: "Names and ranges; next runs shown in London time (DST-aware)." },
      { label: "Business hours", inputs: { expr: "*/15 9-17 * * 1-5" }, opts: { format: "github" }, note: "Every 15 minutes, 09:00–17:45 on weekdays, as a GitHub Actions schedule block." },
      { label: "Quarterly report", inputs: { expr: "0 6 1 1,4,7,10 *" }, opts: { format: "k8s", tz: "America/New_York" }, note: "Lists in the month field; rendered as a Kubernetes CronJob with timeZone." },
      { label: "Last Friday (Quartz)", inputs: { expr: "0 0 18 ? * 6L" }, opts: { format: "aws" }, note: "Quartz 6-field syntax with seconds: 18:00 on the last Friday (6L) of each month; ? in day-of-month." },
      { label: "15th or Mondays", inputs: { expr: "0 12 15 * MON" }, opts: { format: "systemd" }, note: "Standard cron ORs day-of-month and day-of-week: the 15th AND every Monday. systemd can't express the OR — see the warning." },
      { label: "Nearest weekday", inputs: { expr: "0 0 8 15W * ?" }, opts: { format: "quartz" }, note: "15W: the weekday closest to the 15th (Friday the 14th if the 15th is a Saturday)." },
      { label: "@daily macro", inputs: { expr: "@daily" }, opts: { tz: "Asia/Tokyo", format: "systemd" }, note: "Macros expand to plain cron (@daily = 0 0 * * *)." },
      { label: "Out of range", inputs: { expr: "0 25 * * *" }, note: "Validation names the field and the allowed range.", error: true },
    ],
    steps: ["Type an expression or start from a preset.", "Use the field editors to switch between every / step / specific values / range.", "Pick a time zone to see the next run times, and an output format for your scheduler."],
    tips: ["5 fields = minute hour day month weekday; 6 = with seconds first; 7 = Quartz with year.", "Quartz and AWS number weekdays 1–7 from Sunday; standard cron uses 0–6 (and 7) from Sunday."],
  },

  /* ── .gitignore ──────────────────────────────────────────────────── */
  "gitignore-generator": {
    inputs: [
      { id: "templates", label: "Templates", kind: "text", placeholder: "node, macos, vscode" },
      { id: "custom", label: "Custom rules", lang: "text", rows: 5, placeholder: "# your own patterns\n/secrets/\n!keep.me" },
      { id: "test", label: "Test paths", lang: "text", rows: 4, placeholder: "node_modules/react/index.js\nsrc/app.ts\n.env" },
    ],
    options: [
      { id: "comments", label: "Section comments", type: "toggle", default: true },
      { id: "dedupe", label: "Remove duplicates", type: "toggle", default: true, hint: "Drop a rule already written by an earlier template" },
    ],
    custom: () => import("./ui/G-Gitignore"),
    async run({ inputs, opts }) {
      const G = await import("./lib/G-gitignore");
      const names = inputs.templates.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
      if (!names.length && !inputs.custom.trim()) throw new ToolError("Pick at least one template (e.g. node, python, macos) or write custom rules.");
      const b = G.buildGitignore(names, inputs.custom, { comments: bool(opts.comments), dedupe: bool(opts.dedupe) });
      if (b.unknown.length && !b.used.length && !inputs.custom.trim()) throw new ToolError(`Unknown template${b.unknown.length > 1 ? "s" : ""}: ${b.unknown.map((u) => `${u}${G.suggest(u) ? ` (did you mean ${G.suggest(u)}?)` : ""}`).join(", ")}.`);
      const notes: string[] = [];
      if (b.unknown.length) notes.push(`Skipped unknown template${b.unknown.length > 1 ? "s" : ""}: ${b.unknown.map((u) => `${u}${G.suggest(u) ? ` — did you mean ${G.suggest(u)}?` : ""}`).join("; ")}`);
      const views: View[] = [{ label: ".gitignore", out: { kind: "text", text: b.text, lang: "shell" } }];
      const tests = inputs.test.split(/\r?\n/).map((x) => x.trim()).filter((x) => x && !x.startsWith("#"));
      if (tests.length) {
        const rules = G.parseRules(b.text, ".gitignore");
        const rows = tests.map((p) => {
          const v = G.checkPath(rules, p);
          const src = v.rule ? b.lineSource.get(v.rule.line) || "" : "";
          return [p, v.ignored ? "ignored" : v.rule ? "re-included" : "tracked", v.rule ? v.rule.text : null, v.rule ? v.rule.line : null, src || null, v.via ? `parent ${v.via} is ignored${v.blockedNegation ? ` — “${v.blockedNegation.text}” cannot re-include it` : ""}` : null];
        });
        views.unshift({ label: `Path tests (${tests.length})`, out: { kind: "table", columns: ["path", "result", "matching rule", "line", "template", "note"], rows } });
      }
      views.push(
        { label: "Templates", out: { kind: "table", columns: ["template", "group", "rules"], rows: b.used.map((t) => [t.name, t.group, t.body.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#")).length]) } },
        { label: "Stats", out: { kind: "stats", items: [{ label: "Templates", value: b.used.length }, { label: "Rules", value: b.rules }, { label: "Duplicates removed", value: b.dupes, tone: b.dupes ? "ok" : "info" }, { label: "Lines", value: b.text.split("\n").length - 1 }] } }
      );
      return { text: b.text, views, filename: ".gitignore", lang: "shell", notes: notes.length ? notes : undefined };
    },
    examples: [
      { label: "Node + macOS + VS Code", inputs: { templates: "node, macos, vscode", test: "node_modules/react/index.js\n.vscode/settings.json\n.vscode/launch.json.bak\n.DS_Store\nsrc/.env.local\n.env.example\ndist/app.js" }, note: "Three templates merged; the test paths show which rule decides each file — including !negations." },
      { label: "Python data science", inputs: { templates: "python, jupyter, env, macos", test: "notebooks/.ipynb_checkpoints/a.ipynb\nsrc/__pycache__/x.pyc\n.venv/bin/python\ndata/raw.parquet\nrequirements.txt" }, note: "Virtualenvs, caches and notebook checkpoints; large data files ignored by the Jupyter template." },
      { label: "Next.js monorepo", inputs: { templates: "nextjs, node, jetbrains, windows", custom: "# monorepo\n/apps/*/out/\n!apps/docs/out/robots.txt\n*.local.json", test: "apps/web/.next/cache/x\napps/docs/out/robots.txt\napps/docs/out/index.html\nconfig.local.json" }, note: "Dedupe removes node_modules/ etc. that both Next.js and Node define. robots.txt stays ignored: its parent directory is excluded, so the ! rule cannot bring it back." },
      { label: "Go + Terraform + Docker", inputs: { templates: "go, terraform, docker, linux", test: "infra/.terraform/providers/x\ninfra/prod.tfvars\ninfra/.terraform.lock.hcl\nbin/server.exe\ndocker-compose.override.yml" }, note: "State files and tfvars ignored, the lock file kept." },
      { label: "Unity game", inputs: { templates: "unity, visualstudio, windows", test: "Library/ShaderCache/a\nAssets/Scripts/Player.cs\nAssets/Scripts/Player.cs.meta\nBuilds/game.exe" }, opts: { comments: false }, note: "Section comments off: rules only." },
      { label: "Unknown name", inputs: { templates: "nodejs, pyhton, macOS" }, note: "Aliases resolve (nodejs → Node); typos get a suggestion." },
    ],
    steps: ["Tick templates (search by language, framework, editor or OS).", "Add custom rules if needed.", "Type paths under “Test a path” to see which rule ignores them — negations, directory-only rules and ** globs follow git's semantics."],
    tips: ["A file inside an ignored directory cannot be re-included with ! — un-ignore the directory first (dir/* then !dir/keep).", "Leading / anchors a rule to the repository root; a trailing / matches directories only."],
  },

  /* ── QR ──────────────────────────────────────────────────────────── */
  "qr-generator": {
    inputs: [
      { id: "text", label: "Payload", lang: "text", wrap: true, placeholder: "https://example.com" },
      { id: "form", label: "Form state", lang: "json", rows: 3 },
      { id: "image", label: "QR image to read", kind: "file", accept: "image/*", read: "dataurl" },
    ],
    options: [
      { id: "mode", label: "Mode", type: "segment", choices: [["generate", "Generate"], ["read", "Read QR"]], default: "generate" },
      { id: "ecc", label: "Error correction", type: "segment", choices: [["L", "L 7%"], ["M", "M 15%"], ["Q", "Q 25%"], ["H", "H 30%"]], default: "M", show: (o) => o.mode !== "read", hint: "Higher levels survive more damage (or a logo on top) but need a denser code" },
      { id: "size", label: "Size px", type: "number", default: 320, min: 64, max: 2048, step: 16, show: (o) => o.mode !== "read" },
      { id: "margin", label: "Quiet zone", type: "number", default: 4, min: 0, max: 16, show: (o) => o.mode !== "read", hint: "Border in modules — the spec asks for 4" },
      { id: "dark", label: "Dark", type: "color", default: "#1f1d1c", show: (o) => o.mode !== "read" },
      { id: "light", label: "Light", type: "color", default: "#ffffff", show: (o) => o.mode !== "read" },
    ],
    custom: () => import("./ui/G-QrStudio"),
    async run({ inputs, opts }) {
      const Q = await import("./lib/G-qr");
      if (opts.mode === "read") {
        if (!inputs.image) throw new ToolError("Choose or drop an image that contains a QR code.");
        if (isNode) throw new ToolError("Reading QR images needs a browser canvas.");
        const text = await decodeImage(inputs.image);
        const p = Q.parsePayload(text);
        return {
          text,
          views: [
            { label: "Decoded", out: { kind: "text", text, wrap: true } },
            { label: `Parsed · ${p.type}`, out: { kind: "table", columns: ["field", "value"], rows: p.fields } },
            ...(p.issues.length ? [{ label: "Notes", out: { kind: "issues" as const, items: p.issues.map((m) => ({ level: "warning" as const, message: m })) } }] : []),
          ],
        };
      }
      const payload = inputs.text;
      if (!payload) throw new ToolError("Type a URL or text, or fill in one of the forms (Wi-Fi, vCard, email …).");
      const QR = (await import("qrcode")).default;
      const ecc = str(opts.ecc, "M") as "L" | "M" | "Q" | "H";
      let qr: ReturnType<typeof QR.create>;
      try {
        qr = QR.create(payload, { errorCorrectionLevel: ecc });
      } catch (e) {
        throw new ToolError(`${(e as Error).message}. A QR code holds at most ~2,950 bytes at level L (${ecc === "L" ? "" : "less at " + ecc + "; "}try a lower error-correction level or a shorter payload).`);
      }
      const size = Math.max(64, Math.min(2048, Math.round(num(opts.size, 320))));
      const margin = Math.max(0, Math.min(16, Math.round(num(opts.margin, 4))));
      const dark = str(opts.dark, "#1f1d1c"), light = str(opts.light, "#ffffff");
      const m = { size: qr.modules.size, get: (x: number, y: number) => !!qr.modules.get(y, x) };
      const svg = Q.matrixSvg(m, { margin, dark, light, px: size });
      const png = await QR.toDataURL(payload, { errorCorrectionLevel: ecc, margin, width: size, color: { dark: toHex8(dark), light: toHex8(light) } });
      const b64 = png.split(",")[1];
      const bin = atob(b64);
      const blob = new Blob([Uint8Array.from(bin, (c) => c.charCodeAt(0))], { type: "image/png" });
      // round-trip: decode our own matrix with jsQR
      const jsQR = (await import("jsqr")).default;
      const px = Q.matrixPixels(m, 4, 4);
      const back = jsQR(px.data, px.width, px.height);
      const ok = back?.data === payload;
      const parsed = Q.parsePayload(payload);
      const cr = Q.contrast(dark, light);
      const issues: { level: "error" | "warning" | "info" | "ok"; message: string }[] = [
        ok ? { level: "ok", message: "Verified: the generated matrix decodes back to exactly this payload (jsQR)." } : { level: "error", message: "Self-check failed: the matrix did not decode back to the payload." },
        ...parsed.issues.map((message) => ({ level: "warning" as const, message })),
      ];
      if (cr < 3) issues.push({ level: "error", message: `Contrast between dark and light is only ${cr.toFixed(1)}:1 — many scanners need 4:1 or more.` });
      else if (cr < 4.5) issues.push({ level: "warning", message: `Contrast ${cr.toFixed(1)}:1 is on the low side for camera scanning.` });
      if (Q.contrast(dark, "#000000") > Q.contrast(light, "#000000")) issues.push({ level: "warning", message: "Inverted colours (light modules on dark) — some older scanners can't read them." });
      if (margin < 2) issues.push({ level: "warning", message: "A quiet zone under 2 modules makes the code hard to find for scanners; 4 is the standard." });
      if (qr.version > 15) issues.push({ level: "info", message: `Version ${qr.version} (${qr.modules.size}×${qr.modules.size}) is dense — print it at least ${Math.ceil(qr.modules.size * 0.5)} mm wide, or shorten the payload (e.g. a short URL).` });
      const bytesLen = new TextEncoder().encode(payload).length;
      const modes = [...new Set(qr.segments.map((sg: { mode: { id: string } }) => sg.mode.id))].join(", ");
      return {
        text: svg,
        lang: "xml",
        blob,
        filename: "qr-code.png",
        views: [
          { label: "QR code", out: { kind: "image", src: png, name: "qr-code.png", alt: `QR code for ${parsed.type}` } },
          { label: "SVG", out: { kind: "svg", svg, name: "qr-code" } },
          { label: `Payload · ${parsed.type}`, out: { kind: "table", columns: ["field", "value"], rows: [...parsed.fields, ["Raw payload", payload]] } },
          { label: "Details", out: { kind: "stats", items: [{ label: "Version", value: qr.version }, { label: "Modules", value: `${qr.modules.size}×${qr.modules.size}` }, { label: "Error correction", value: ecc }, { label: "Mask pattern", value: qr.maskPattern ?? "—" }, { label: "Payload bytes", value: bytesLen }, { label: "Encoding", value: modes || "byte", tone: "info" }, { label: "Contrast", value: `${cr.toFixed(1)}:1`, tone: cr >= 4.5 ? "ok" : cr >= 3 ? "warn" : "bad" }, { label: "Round-trip", value: ok ? "✓ decodes" : "✗ failed", tone: ok ? "ok" : "bad" }] } },
          { label: "Checks", out: { kind: "issues", items: issues } },
          { label: "Markup", out: { kind: "text", text: svg, lang: "xml", wrap: true } },
        ],
      };
    },
    examples: [
      { label: "Website URL", inputs: { text: "https://example.com/menu?table=12", form: JSON.stringify({ type: "url", f: { text: "https://example.com/menu?table=12" } }) }, note: "A URL — the most common QR code. The Checks tab verifies it decodes back exactly." },
      { label: "Wi-Fi", inputs: { text: "WIFI:T:WPA;S:Cafe Guest;P:espresso\\;2024;;", form: JSON.stringify({ type: "wifi", f: { ssid: "Cafe Guest", password: "espresso;2024", auth: "WPA", hidden: "" } }) }, note: "Phones join the network when scanned. Note the escaped ; in the password." },
      { label: "vCard contact", inputs: { text: "BEGIN:VCARD\nVERSION:3.0\nN:Lovelace;Ada;;;\nFN:Ada Lovelace\nORG:Analytical Engines Ltd\nTITLE:Lead Programmer\nTEL;TYPE=CELL:+44 7700 900123\nEMAIL;TYPE=INTERNET:ada@example.com\nURL:https://example.com\nADR;TYPE=WORK:;;12 St James's Square;London;;SW1Y 4JH;United Kingdom\nEND:VCARD", form: JSON.stringify({ type: "vcard", f: { first: "Ada", last: "Lovelace", org: "Analytical Engines Ltd", title: "Lead Programmer", mobile: "+44 7700 900123", email: "ada@example.com", url: "https://example.com", street: "12 St James's Square", city: "London", zip: "SW1Y 4JH", country: "United Kingdom" } }) }, opts: { ecc: "Q" }, note: "A vCard 3.0 business card at error-correction level Q." },
      { label: "Calendar event", inputs: { text: "BEGIN:VEVENT\nSUMMARY:Team offsite\nDTSTART:20261015T090000\nDTEND:20261015T170000\nLOCATION:Room 4.02\nDESCRIPTION:Bring a laptop\\, lunch provided\nEND:VEVENT", form: JSON.stringify({ type: "event", f: { summary: "Team offsite", start: "2026-10-15T09:00", end: "2026-10-15T17:00", location: "Room 4.02", description: "Bring a laptop, lunch provided" } }) }, note: "An iCalendar VEVENT — scanning offers to add it to the calendar." },
      { label: "Email", inputs: { text: "mailto:support@example.com?subject=Order%20%23A-1042&body=Hi%2C%20my%20parcel%20has%20not%20arrived.", form: JSON.stringify({ type: "email", f: { to: "support@example.com", subject: "Order #A-1042", body: "Hi, my parcel has not arrived.", style: "mailto" } }) }, opts: { dark: "#0b4f6c", light: "#f4fbff" }, note: "A mailto: link with a pre-filled subject and body, in brand colours." },
      { label: "Location", inputs: { text: "geo:51.50073,-0.12463?q=Big%20Ben", form: JSON.stringify({ type: "geo", f: { lat: "51.50073", lng: "-0.12463", q: "Big Ben" } }) }, opts: { ecc: "H", margin: 2 }, note: "A geo: URI opens the maps app; level H survives 30% damage." },
      { label: "Low contrast", inputs: { text: "https://example.com", form: JSON.stringify({ type: "url", f: { text: "https://example.com" } }) }, opts: { dark: "#9bb7c4", light: "#ffffff" }, note: "Pale modules: the Checks tab warns that cameras may fail to read it." },
    ],
    steps: ["Choose a content type (URL, Wi-Fi, vCard, email, SMS, phone, location, event) and fill in the form — the payload is composed for you.", "Adjust error correction, size, quiet zone and colours.", "Download the PNG or SVG. Switch Mode to Read QR to decode an uploaded image."],
    tips: ["Use error correction H if you plan to put a logo over the centre.", "Shorter payloads give smaller, easier-to-scan codes."],
  },

  /* ── cURL ────────────────────────────────────────────────────────── */
  "curl-cmd-gen": {
    inputs: [{ id: "form", label: "Request (JSON form state)", lang: "json" }],
    options: [
      { id: "multiline", label: "Multi-line", type: "toggle", default: true, hint: "One option per line with line continuations" },
      { id: "shell", label: "Shell", type: "segment", choices: [["bash", "bash/zsh"], ["powershell", "PowerShell"], ["cmd", "cmd.exe"]], default: "bash", hint: "Quoting and line-continuation rules differ per shell" },
      { id: "long", label: "Long flags", type: "toggle", default: false, hint: "--header instead of -H — self-documenting in scripts" },
    ],
    custom: () => import("./ui/G-CmdBuilder"),
    async run({ inputs, opts }) {
      const C = await import("./lib/G-curl");
      const st = readForm(inputs.form, C.CURL_DEFAULT);
      const b = C.buildCurl(st, { multiline: bool(opts.multiline), shell: str(opts.shell, "bash") as "bash", long: bool(opts.long) });
      return cmdResult(b.command, b.explain, b.warnings, [
        { label: "HTTPie", out: { kind: "text", text: C.toHttpie(st), lang: "shell" } },
        { label: "wget", out: { kind: "text", text: C.toWget(st), lang: "shell" } },
        { label: "fetch", out: { kind: "text", text: C.toFetch(st), lang: "js" } },
        { label: "Python", out: { kind: "text", text: C.toPython(st), lang: "python" } },
      ]);
    },
    examples: [
      { label: "GET with params", inputs: { form: form({ method: "GET", url: "https://api.github.com/search/repositories", params: [{ k: "q", v: "formatter language:typescript" }, { k: "sort", v: "stars" }, { k: "per_page", v: "5" }], headers: [{ k: "Accept", v: "application/vnd.github+json" }, { k: "X-GitHub-Api-Version", v: "2022-11-28" }], compressed: true, silent: true, fail: "body" }) }, note: "Query parameters are URL-encoded for you (the space becomes %20); -sS keeps errors but hides the progress bar." },
      { label: "POST JSON + token", inputs: { form: form({ method: "POST", url: "https://api.example.com/v1/orders", headers: [{ k: "Accept", v: "application/json" }, { k: "Idempotency-Key", v: "3f2a9c1e-order-1042" }], bodyType: "json", body: '{\n  "customer": "cus_1042",\n  "items": [{"sku": "KB-01", "qty": 2}],\n  "express": true\n}', auth: "bearer", token: "eyJhbGciOiJIUzI1NiJ9." + "x".repeat(20), retry: "3", maxTime: "30", fail: "body" }) }, note: "A JSON body with a bearer token, retries and a timeout. Compare the HTTPie, fetch and Python tabs." },
      { label: "Multipart upload", inputs: { form: form({ method: "POST", url: "https://upload.example.com/v2/files", headers: [], bodyType: "multipart", form: [{ k: "file", v: "@report-2026-q3.pdf;type=application/pdf" }, { k: "folder", v: "finance/reports" }, { k: "public", v: "false" }], auth: "basic", user: "ada", pass: "", verbose: true }) }, note: "-F builds multipart/form-data; @ uploads a file. With -u and no password curl prompts instead of leaking it." },
      { label: "Form login + cookies", inputs: { form: form({ method: "POST", url: "https://intranet.example.com/login", headers: [], bodyType: "form", form: [{ k: "username", v: "grace" }, { k: "password", v: "p@ss word&1" }, { k: "remember", v: "on" }], cookieJar: "cookies.txt", follow: true, include: true }) }, note: "URL-encoded form fields (the & and space are escaped) and a cookie jar to reuse the session." },
      { label: "Download via proxy", inputs: { form: form({ method: "GET", url: "https://releases.example.com/tool/v2.4.1/tool-linux-amd64.tar.gz", headers: [], output: "O", follow: true, retry: "5", connectTimeout: "10", proxy: "http://proxy.corp.local:3128", fail: "fail", http: "2" }) }, opts: { long: true }, note: "-O keeps the remote file name; long flags make scripts self-explaining." },
      { label: "PowerShell PATCH", inputs: { form: form({ method: "PATCH", url: "https://api.example.com/v1/users/42", headers: [{ k: "Accept", v: "application/json" }], bodyType: "json", body: '{"displayName": "Ada O\'Brien"}', auth: "apikey", keyName: "X-API-Key", keyValue: "demo-key-123", insecure: true }) }, opts: { shell: "powershell" }, note: "PowerShell quoting doubles the apostrophe and uses the backtick for line breaks; -k gets a warning." },
    ],
    steps: ["Set the method and URL; add query parameters and headers in the tables.", "Pick a body type (JSON, form, multipart with @files, raw, binary file) and authentication.", "Toggle behaviour flags; copy the command — or the HTTPie / wget / fetch / Python equivalent."],
  },

  /* ── MySQL ───────────────────────────────────────────────────────── */
  "mysql-cmd-gen": {
    inputs: [{ id: "form", label: "Command (JSON form state)", lang: "json" }],
    options: [
      { id: "multiline", label: "Multi-line", type: "toggle", default: true },
      { id: "docker", label: "docker exec", type: "toggle", default: false, hint: "Run the client inside a MySQL container instead of on the host" },
    ],
    custom: () => import("./ui/G-CmdBuilder"),
    async run({ inputs, opts }) {
      const M = await import("./lib/G-mysql");
      const st = readForm(inputs.form, M.MYSQL_DEFAULT);
      const b = M.buildMysql(st, { multiline: bool(opts.multiline) });
      const docker = b.docker ?? "";
      if (bool(opts.docker)) b.warnings.push({ level: "info", message: `Inside the container the client connects to its own server, so -h/-P are dropped; the password comes from $MYSQL_ROOT_PASSWORD (set by the official image). No -t with redirects: a TTY corrupts binary output.` });
      return cmdResult(bool(opts.docker) ? docker : b.command, b.explain, b.warnings, [{ label: bool(opts.docker) ? "Host command" : "docker exec", out: { kind: "text", text: bool(opts.docker) ? b.command : docker, lang: "shell" } }]);
    },
    examples: [
      { label: "Nightly backup", inputs: { form: form({ action: "dump", host: "db.internal", user: "backup", auth: "loginPath", loginPath: "backup", database: "shop", gzip: true, routines: true, triggers: true, events: true }) }, note: "--single-transaction snapshot, routines/triggers/events, gzip on the fly; credentials from --login-path (never in history)." },
      { label: "One table, filtered", inputs: { form: form({ action: "dumpTable", database: "shop", table: "orders", where: "created_at >= '2026-01-01'", gzip: false }) }, note: "--where exports a slice of a table — handy for fixtures." },
      { label: "Restore gz dump", inputs: { form: form({ action: "restore", host: "127.0.0.1", port: "3307", database: "shop_staging", file: "shop-2026-09-24.sql.gz", gzip: true }) }, note: "gunzip streams the dump into mysql; 127.0.0.1 forces TCP instead of the socket." },
      { label: "Query → CSV", inputs: { form: form({ action: "exportCsv", database: "crm", query: "SELECT id, email, country, created_at FROM customers WHERE created_at >= '2025-01-01'", csvFile: "customers-2025.csv", csvHeader: true }) }, note: "--batch output turned into quoted CSV with sed; see the warning about tabs and newlines." },
      { label: "Import CSV", inputs: { form: form({ action: "importCsv", database: "crm", table: "leads", csvFile: "leads.csv", csvHeader: true, ssl: "REQUIRED", host: "mysql.example.com" }) }, note: "LOAD DATA LOCAL INFILE with header skip; needs local_infile on both client and server." },
      { label: "App user + grants", inputs: { form: form({ action: "createUser", database: "shop", newUser: "shop_app", newUserHost: "10.0.%", newPassword: "", privileges: "SELECT, INSERT, UPDATE, DELETE" }) }, note: "A least-privilege application account limited to one database and a subnet." },
      { label: "Docker dump", inputs: { form: form({ action: "dump", database: "wordpress", container: "wp-db", gzip: true }) }, opts: { docker: true }, note: "The same dump run through docker exec against the official MySQL image." },
    ],
    steps: ["Choose what to do (dump, restore, CSV export/import, users, processlist, check).", "Fill in the connection; prefer the password prompt or --login-path.", "Tick the dump options you need; copy the command or its docker exec variant."],
  },

  /* ── tar ─────────────────────────────────────────────────────────── */
  "tar-cmd-gen": {
    inputs: [{ id: "form", label: "Command (JSON form state)", lang: "json" }],
    options: [
      { id: "multiline", label: "Multi-line", type: "toggle", default: false },
    ],
    custom: () => import("./ui/G-CmdBuilder"),
    async run({ inputs, opts }) {
      const T = await import("./lib/G-tar");
      const st = readForm(inputs.form, T.TAR_DEFAULT);
      const b = T.buildTar(st, { multiline: bool(opts.multiline) });
      return cmdResult(b.command, b.explain, b.warnings.concat(b.bsd.map((m) => ({ level: "info" as const, message: m }))), [{ label: "zip / unzip", out: { kind: "text", text: b.zip, lang: "shell" } }]);
    },
    examples: [
      { label: "Backup a project", inputs: { form: form({ op: "create", compression: "gzip", archive: "project-2026-09-24.tar.gz", paths: "src/ public/ package.json README.md", excludes: "node_modules\n*.log\n.env", excludeVcs: true, verbose: true }) }, note: "-czvf with excludes placed before the paths (GNU tar applies them in order)." },
      { label: "Extract a release", inputs: { form: form({ op: "extract", compression: "auto", archive: "node-v22.9.0-linux-x64.tar.xz", dir: "/opt/node", strip: 1, verbose: false, paths: "", excludes: "" }) }, note: "--strip-components=1 drops the top-level folder; -C picks the destination." },
      { label: "List contents", inputs: { form: form({ op: "list", compression: "zstd", archive: "logs-2026-09.tar.zst", verbose: true, paths: "", excludes: "" }) }, note: "-tvf: permissions, owners, sizes and dates without extracting." },
      { label: "macOS → Linux", inputs: { form: form({ op: "create", compression: "xz", archive: "site.tar.xz", paths: "public/", excludes: ".DS_Store", flavor: "bsd", dir: "build", follow: true }) }, note: "bsdtar on macOS: COPYFILE_DISABLE=1 keeps ._ AppleDouble files out; -h follows symlinks." },
      { label: "Pick files, keep old", inputs: { form: form({ op: "extract", compression: "gzip", archive: "backup.tar.gz", members: "etc/nginx/nginx.conf etc/nginx/sites-enabled/", keepOld: true, preserve: true, paths: "", excludes: "" }) }, opts: { multiline: true }, note: "Extract only two members, never overwrite, restore permissions — multi-line for readability." },
      { label: "Append to .tar.gz", inputs: { form: form({ op: "append", compression: "gzip", archive: "logs.tar.gz", paths: "app-2026-09-24.log", excludes: "" }) }, note: "tar cannot append to a compressed archive — the error explains the workaround.", error: true },
    ],
    steps: ["Choose the operation and the compression.", "Name the archive and list paths (create) or members (extract/list).", "Add excludes, a -C directory and --strip-components; check GNU vs BSD notes and the zip equivalent."],
  },

  /* ── Dockerfile ──────────────────────────────────────────────────── */
  "dockerfile-generator": {
    generator: true,
    inputs: [{ id: "config", label: "Configuration (JSON)", lang: "json" }],
    options: [],
    custom: () => import("./ui/G-DockerWizard"),
    async run({ inputs }) {
      const D = await import("./lib/G-docker");
      const stack = (() => {
        try {
          return JSON.parse(inputs.config || "{}").stack ?? "node";
        } catch {
          return "node";
        }
      })();
      const cfg = readForm(inputs.config, D.dockerDefaults(stack));
      if (!D.STACKS.some((x) => x.id === cfg.stack)) throw new ToolError(`Unknown stack “${cfg.stack}”. Choose one of: ${D.STACKS.map((x) => x.id).join(", ")}.`);
      const out = D.generateDocker(cfg);
      const warn = out.issues.filter((i) => i.level === "warning").length;
      const views: View[] = [
        { label: "Dockerfile", out: { kind: "text", text: out.dockerfile, lang: "shell" } },
        { label: ".dockerignore", out: { kind: "text", text: out.dockerignore, lang: "shell" } },
        { label: "docker-compose.yml", out: { kind: "text", text: out.compose, lang: "yaml" } },
      ];
      if (out.nginx) views.push({ label: "nginx.conf", out: { kind: "text", text: out.nginx, lang: "text" } });
      views.push(
        { label: `Lint (${warn ? `${warn} ⚠` : "✓"})`, out: { kind: "issues", items: out.issues } },
        { label: "Commands", out: { kind: "text", lang: "shell", text: `# build and run\ndocker build -t ${cfg.name || "app"}:dev .\ndocker run --rm -p ${cfg.port || "8080"}:${cfg.stack === "static" && cfg.nonroot ? "8080" : cfg.port || "8080"} ${cfg.name || "app"}:dev\n\n# or with the compose file\ndocker compose up --build\n\n# check size and layers\ndocker image ls ${cfg.name || "app"}\ndocker history ${cfg.name || "app"}:dev` } }
      );
      return { text: out.dockerfile, views, filename: "Dockerfile", lang: "shell" };
    },
    examples: [
      { label: "Node + Postgres", inputs: { config: form({ stack: "node", pm: "pnpm", version: "22", flavour: "alpine", port: "3000", start: "node dist/server.js", build: "pnpm run build", services: ["postgres", "redis"], name: "api" }) }, note: "Three stages (deps → build → prod-deps) with a pnpm store cache mount; Compose adds Postgres and Redis with health checks." },
      { label: "FastAPI + uv", inputs: { config: form({ stack: "python", pm: "uv", version: "3.12", flavour: "slim", port: "8000", start: "uvicorn app.main:app --host 0.0.0.0 --port 8000", build: "", env: "LOG_LEVEL=info", services: ["postgres"], name: "api" }) }, note: "uv sync into a virtualenv, copied into a slim runtime; the health check uses Python itself (slim has no curl)." },
      { label: "Go → distroless", inputs: { config: form({ stack: "go", pm: "mod", version: "1.23", flavour: "distroless", port: "8080", build: 'go build -trimpath -ldflags="-s -w" -o /out/app ./cmd/server', start: "/app", healthcheck: true, env: "", services: [], name: "server" }) }, note: "A ~10 MB image: static binary on distroless/static:nonroot. No shell, so no HEALTHCHECK (see Lint)." },
      { label: "Spring Boot (Gradle)", inputs: { config: form({ stack: "java", pm: "gradle", version: "21", flavour: "alpine", port: "8080", start: "java -XX:MaxRAMPercentage=75 -jar app.jar", env: "SPRING_PROFILES_ACTIVE=prod", services: ["mysql"], name: "shop" }) }, note: "Gradle build with a cache mount, JRE-only runtime, container-aware heap sizing." },
      { label: "Static SPA + nginx", inputs: { config: form({ stack: "static", pm: "npm", version: "1.27", flavour: "alpine", port: "80", build: "npm run build", start: "", services: [], name: "web" }) }, note: "Vite build served by unprivileged nginx on 8080, with an SPA-fallback nginx.conf." },
      { label: "Rails (root, secrets)", inputs: { config: form({ stack: "ruby", pm: "bundler", version: "3.3", flavour: "slim", port: "3000", nonroot: false, healthcheck: false, env: "RAILS_LOG_TO_STDOUT=1\nSECRET_KEY_BASE=abc123", services: ["postgres", "redis", "nginx"], name: "rails" }) }, note: "Deliberately risky settings: the Lint tab flags root, a baked-in secret and the missing health check." },
      { label: ".NET 8 chiseled", inputs: { config: form({ stack: "dotnet", pm: "dotnet", version: "8.0", flavour: "distroless", port: "8080", start: "dotnet Shop.Api.dll", env: "", services: ["postgres"], name: "shop-api" }) }, note: "SDK build stage, Ubuntu chiseled ASP.NET runtime, non-root $APP_UID." },
    ],
    steps: ["Pick a stack and package manager — sensible versions, ports and commands fill in.", "Choose a base flavour (alpine / slim / distroless / full) and toggle multi-stage, non-root, health check and cache mounts.", "Add backing services for docker-compose; check the Lint tab before you ship."],
  },

  /* ── GitHub Actions ──────────────────────────────────────────────── */
  "gha-explainer": {
    inputs: [{ id: "yaml", label: "Workflow YAML", lang: "yaml", placeholder: "on: push\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4" }],
    options: [
      { id: "graph", label: "Graph direction", type: "segment", choices: [["LR", "Left → right"], ["TD", "Top → down"]], default: "LR" },
      { id: "infos", label: "Show info hints", type: "toggle", default: true, hint: "Include low-priority suggestions (timeouts, notes) in Issues" },
    ],
    async run({ inputs, opts, pipeline }) {
      const src = inputs.yaml;
      if (!src.trim()) throw new ToolError("Paste a GitHub Actions workflow (.github/workflows/*.yml).");
      const yaml = await import("js-yaml");
      let wf: unknown;
      try {
        wf = yaml.load(src);
      } catch (e) {
        const m = (e as { mark?: { line: number; column: number }; reason?: string }).mark;
        throw new ToolError(`YAML error: ${(e as { reason?: string }).reason ?? (e as Error).message}${m ? ` (line ${m.line + 1}, column ${m.column + 1})` : ""}`);
      }
      if (!wf || typeof wf !== "object" || Array.isArray(wf)) throw new ToolError("A workflow is a YAML mapping with on: and jobs: keys.");
      const G = await import("./lib/G-gha");
      const a = await G.analyse(wf as Record<string, unknown>, src);
      const mermaid = a.mermaid.replace(/^flowchart LR/, `flowchart ${str(opts.graph, "LR")}`);
      const issues = bool(opts.infos) ? a.issues : a.issues.filter((i) => i.level !== "info");
      const errs = issues.filter((i) => i.level === "error").length, warns = issues.filter((i) => i.level === "warning").length;
      const views: View[] = [
        { label: "Summary", out: { kind: "html", html: a.summaryHtml, css: ".prose h4{margin:1em 0 .2em}.prose ol{margin:.3em 0 1em;padding-left:1.4em}.prose li{margin:.15em 0}" } },
        { label: `Jobs (${a.jobs.length})`, out: { kind: "table", columns: ["job", "name", "runs-on", "needs", "if", "matrix", "timeout", "environment", "services", "outputs", "steps"], rows: a.jobs.map((j) => [j.id, j.name, j.runsOn, j.needs.join(", ") || null, j.if || null, j.matrix || null, j.timeout || null, j.environment || null, j.services || null, j.outputs || null, j.steps.length]) } },
      ];
      for (const m of a.matrices) {
        if (m.combos.length) views.push({ label: `Matrix · ${m.job} (${m.combos.length})`, out: { kind: "table", columns: ["#", ...m.keys], rows: m.combos.map((c, i) => [i + 1, ...m.keys.map((k) => (c[k] === undefined ? null : typeof c[k] === "object" ? JSON.stringify(c[k]) : (c[k] as string | number | boolean)))]) } });
        else if (m.note) views.push({ label: `Matrix · ${m.job}`, out: { kind: "status", ok: true, title: "Dynamic matrix", detail: m.note } });
      }
      views.push({ label: `Issues (${errs ? `${errs} ✗ ` : ""}${warns ? `${warns} ⚠` : errs ? "" : "✓"})`.replace(" )", ")"), out: { kind: "issues", items: issues } });
      if (!pipeline && !isNode) {
        try {
          const { renderMermaid } = await import("./lib/mermaid");
          // Mermaid caps the width at its natural size; small workflow graphs read better a little larger
          const svg = (await renderMermaid(mermaid)).replace(/max-width:\s*([\d.]+)px/, (_m, w) => `max-width: ${Math.round(Math.min(1100, Number(w) * 1.5))}px`);
          views.push({ label: "Graph", out: { kind: "svg", svg, name: "workflow-graph" } });
        } catch (e) {
          views.push({ label: "Graph", out: { kind: "status", ok: false, title: "Graph could not be drawn", detail: (e as Error).message } });
        }
      }
      views.push({ label: "Graph source", out: { kind: "text", text: mermaid, lang: "mermaid" } }, { label: "Explanation", out: { kind: "text", text: a.text, lang: "markdown", wrap: true } });
      const text = `${a.text}\n\n## Issues (${errs} errors, ${warns} warnings)\n${issues.filter((i) => i.level !== "ok").map((i) => `- ${i.level}${i.line ? ` (line ${i.line})` : ""}: ${i.message}`).join("\n")}`;
      return { text, views };
    },
    examples: [
      { label: "Node CI matrix", inputs: { yaml: GHA_CI }, note: "push/PR triggers with path filters, a 3×2 matrix with exclude/include, caching, artifacts and a dependent job." },
      { label: "Docker → ECR deploy", inputs: { yaml: GHA_DEPLOY }, note: "Tag trigger, OIDC to AWS, Buildx multi-arch push, an environment with approval, concurrency." },
      { label: "Reusable + dispatch", inputs: { yaml: GHA_DISPATCH }, note: "workflow_dispatch inputs (choice, boolean), a schedule explained in English, and a reusable workflow call." },
      { label: "Insecure workflow", inputs: { yaml: GHA_INSECURE }, note: "pull_request_target + PR checkout, script injection from the PR title, set-output, @master and unpinned actions.", error: true },
      { label: "Pages deploy", inputs: { yaml: GHA_PAGES }, opts: { graph: "TD" }, note: "The standard build → deploy pattern for GitHub Pages, with minimal permissions." },
      { label: "Broken YAML", inputs: { yaml: "on: push\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n     - run: echo bad indent" }, note: "Parse errors point at the line and column.", error: true },
    ],
    steps: ["Paste a workflow file from .github/workflows/.", "Read the Summary for a plain-English walk-through; Jobs, Matrix and Graph show structure.", "Fix what the Issues tab flags — pinning, permissions, injection risks, deprecated commands."],
  },
};

export default specs;

export type { Result };
