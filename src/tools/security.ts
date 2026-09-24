import { ToolError, bool, num, str, type Result, type SpecModule, type View } from "./types";
import { PRESETS } from "./lib/D-header-presets";
import { CSR, DEMO_CHAIN, ED25519_CERT, EXPIRED, ISRG_ROOT_X1, SELF_SIGNED } from "./lib/D-certs";

const hashLib = () => import("./lib/D-hash");

/* ── randomness (no modulo bias) ─────────────────────────────────────── */

function randomInt(n: number): number {
  if (n <= 0) throw new ToolError("Empty character set.");
  if (n === 1) return 0;
  const limit = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % n;
  }
}
const pick = (s: string | string[]) => s[randomInt(s.length)];
function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const randomBytes = (n: number) => crypto.getRandomValues(new Uint8Array(n));

/* ── strength ────────────────────────────────────────────────────────── */

function duration(sec: number): string {
  if (!Number.isFinite(sec) || sec > 1e30) return "longer than the universe";
  if (sec < 1) return "instant";
  const units: [number, string][] = [[31557600e9, "billion years"], [31557600e6, "million years"], [31557600e3, "thousand years"], [31557600 * 100, "centuries"], [31557600, "years"], [2629800, "months"], [86400, "days"], [3600, "hours"], [60, "minutes"], [1, "seconds"]];
  for (const [s, name] of units) if (sec >= s) {
    const v = sec / s;
    return `${v >= 100 ? Math.round(v).toLocaleString("en-US") : v.toFixed(v < 10 ? 1 : 0)} ${name}`;
  }
  return "instant";
}
const strength = (bits: number) => (bits < 28 ? "very weak" : bits < 36 ? "weak" : bits < 60 ? "fair" : bits < 80 ? "strong" : bits < 128 ? "very strong" : "overkill");
const crack = (bits: number, perSec: number) => duration(Math.pow(2, bits - 1) / perSec);
const OFFLINE = 1e11; // fast unsalted hash on a GPU rig
const ONLINE = 100 / 3600; // throttled login form: 100 guesses/hour

/* ── password building blocks ────────────────────────────────────────── */

const SETS = { upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ", lower: "abcdefghijklmnopqrstuvwxyz", digits: "0123456789" };
const AMBIGUOUS = /[Il1O0o|`'"]/g;
const CONS = "bcdfghjklmnprstvwz";
const VOWELS = "aeiou";
const B62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function b62(bytes: Uint8Array, len: number): string {
  let out = "";
  for (let i = 0; i < len; i++) out += B62[randomInt(62)];
  void bytes;
  return out;
}

function uuid4(): string {
  const b = randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

let lastMs = 0, seq = 0;
function uuid7(): string {
  let ms = Date.now();
  if (ms <= lastMs) { seq++; ms = lastMs; } else { seq = randomInt(0x800); lastMs = ms; }
  const b = randomBytes(16);
  for (let i = 0; i < 6; i++) b[i] = Math.floor(ms / Math.pow(2, 8 * (5 - i))) & 0xff;
  b[6] = 0x70 | ((seq >> 8) & 0x0f);
  b[7] = seq & 0xff;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function ulid(): string {
  let ms = Date.now();
  let t = "";
  for (let i = 0; i < 10; i++) {
    t = CROCKFORD[ms % 32] + t;
    ms = Math.floor(ms / 32);
  }
  let r = "";
  for (let i = 0; i < 16; i++) r += CROCKFORD[randomInt(32)];
  return t + r;
}

/* ── X.509 helpers ───────────────────────────────────────────────────── */

const colonHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0").toUpperCase()).join(":");
const days = (ms: number) => Math.floor(ms / 86400000);

/* ── sample texts ────────────────────────────────────────────────────── */

const fake = {
  ghp: () => "ghp_" + "R8x2kQ9vLm4pT7wZ1nB5cY3hJ6dF0sGaUe2W",
  aws: () => "AKIA" + "IOSFODNN7EXAMPLE",
  awsSecret: () => "wJalrXUtnFEMI/K7MDENG/" + "bPxRfiCYEXAMPLEKEY",
  stripe: () => "sk_" + "live_" + "51Hd2kLqW9eXz3VbN8pRtY6uIo",
  slackHook: () => "https://hooks.slack.com/services/" + "T024BE7LD/B01A2B3C4D5/" + "q7Wm2Xz9Rk4Lp8Vn3Bt6Yc1H",
  openai: () => "sk-" + "proj-" + "Zq3vN8xK2mB7wR4tY9pL1cF6hJ0dS5aGeU2iO8nM4kQ7rT1v",
  anthropic: () => "sk-" + "ant-api03-" + "k8Rz2Lq9Wv4Xn7Bt1Mc6Yp3Hd0Fs5Ga8Je2Ku9Iw4Oy7Ul1Nr6Tx3Qb0Vm5Zc8Pf2Sh7Dk4Aj9Gi6Ee1Lo3Wn5Ry8-" + "AbCdEfAA",
  sendgrid: () => "SG." + "kQ8m2Rz4Xv7Lp1Wn9Bt3Yc." + "Hd6Fs0Ga5Je8Ku2Iw4Oy7Ul1Nr6Tx3Qb0Vm5Zc8Pf2S",
  npm: () => "npm_" + "Tq7Wm2Xz9Rk4Lp8Vn3Bt6Yc1Hd5Fs0Ga8Je2",
  gitlab: () => "glpat-" + "x9Rk4Lp8Vn3Bt6Yc1Hd5F",
  google: () => "AIza" + "SyD8mK2xR9vQ4wL7nB1pT5cY3hJ6dF0sGa2",
  twilio: () => "SK" + "2b7f4c9e1a6d8f3b5c0e7a9d4f1b6c8e",
  jwt: () => "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" + ".eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkFkYSIsImlhdCI6MTcxNjIzOTAyMn0" + ".4Adcj3UFYzPUVaVF43FmMab6RlaQD8A9V8wFzzht-KQ",
  pem: () => "-----BEGIN " + "PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7VJTUt9Us8cKj\nMzEfYyjiWA4R4/M2bS1GB4t7NXp98C3SC6dVMvDuictGeurT8jNbvJZHtCSuYEvu\nNMoSfm76oqFvAp8Gy0iz5sxjZmSnXyCdPEovGhLa0VzMaQ8s+CLOyS56YyCFGeJZ\n-----END " + "PRIVATE KEY-----",
  pg: () => "postgres://app_user:" + "S3cr3t-Pa55w0rd!" + "@db.internal.example.com:5432/orders",
};

/* ── specs ───────────────────────────────────────────────────────────── */

const specs: SpecModule = {
  "hash-generator": {
    inputs: [
      { id: "text", label: "Text", lang: "text", wrap: true, placeholder: "Type or paste text — or drop a file below" },
      { id: "file", label: "File (optional — overrides the text)", kind: "file", read: "base64" },
      { id: "expected", label: "Expected hash (optional)", kind: "text", placeholder: "Paste a published checksum to verify" },
    ],
    options: [
      { id: "alg", label: "Algorithm", type: "select", choices: [["all", "All algorithms"], ["md5", "MD5"], ["sha1", "SHA-1"], ["sha224", "SHA-224"], ["sha256", "SHA-256"], ["sha384", "SHA-384"], ["sha512", "SHA-512"], ["sha512_256", "SHA-512/256"], ["sha3_256", "SHA3-256"], ["sha3_512", "SHA3-512"], ["keccak256", "Keccak-256"], ["blake2b", "BLAKE2b-512"], ["blake2s", "BLAKE2s-256"], ["blake3", "BLAKE3"], ["ripemd160", "RIPEMD-160"], ["crc32", "CRC32"], ["adler32", "Adler-32"]], default: "all" },
      { id: "enc", label: "Output", type: "segment", choices: [["hex", "hex"], ["HEX", "HEX"], ["base64", "Base64"], ["base64url", "Base64url"]], default: "hex" },
      { id: "input", label: "Input is", type: "segment", choices: [["text", "Text (UTF-8)"], ["hex", "Hex"], ["base64", "Base64"]], default: "text" },
      { id: "lines", label: "Hash each line", type: "toggle", default: false, hint: "One digest per input line (text input only)" },
    ],
    async run({ inputs, opts }) {
      const H = await hashLib();
      const fromFile = !!inputs.file;
      const enc = str(opts.enc);
      const alg = str(opts.alg);
      const algs = alg === "all" ? H.HASHES.map((h) => h[0]) : [alg];
      const fns = await Promise.all(algs.map((a) => H.hasher(a)));
      const expected = (inputs.expected ?? "").trim();
      if (bool(opts.lines) && !fromFile) {
        const a = alg === "all" ? "sha256" : alg;
        const fn = await H.hasher(a);
        const lines = inputs.text.split(/\r?\n/);
        const rows = lines.map((l, i) => [i + 1, l.length > 40 ? l.slice(0, 39) + "…" : l, H.encodeOut(fn(H.decodeInput(l, str(opts.input))), enc)]);
        const text = rows.map((r) => `${r[2]}  ${lines[(r[0] as number) - 1]}`).join("\n");
        return { text, views: [{ label: `${H.hashName(a)} per line`, out: { kind: "table", columns: ["line", "input", H.hashName(a)], rows } }, { label: "Text", out: { kind: "text", text } }], notes: alg === "all" ? ["Per-line mode uses SHA-256 when All is selected."] : undefined };
      }
      const data = fromFile ? H.fromB64(inputs.file) : H.decodeInput(inputs.text, str(opts.input));
      const digests = fns.map((f) => f(data));
      const rows = algs.map((a, i) => [H.hashName(a), H.encodeOut(digests[i], enc), digests[i].length * 8]);
      const views: View[] = [];
      let text: string;
      if (alg === "all") {
        const w = Math.max(...rows.map((r) => String(r[0]).length));
        text = rows.map((r) => `${String(r[0]).padEnd(w)}  ${r[1]}`).join("\n");
        views.push({ label: "All digests", out: { kind: "table", columns: ["algorithm", "digest", "bits"], rows } });
      } else {
        text = String(rows[0][1]);
        views.push({ label: H.hashName(alg), out: { kind: "text", text, wrap: true } });
      }
      if (expected) {
        const hit = algs.findIndex((_, i) => H.matchesDigest(expected, digests[i]));
        const ok = hit >= 0;
        views.unshift({ label: ok ? "✓ Match" : "✗ Mismatch", out: { kind: "status", ok, title: ok ? `Match — ${H.hashName(algs[hit])}` : "Mismatch", detail: ok ? `The expected value equals the ${H.hashName(algs[hit])} digest.` : `None of the ${algs.length === 1 ? H.hashName(alg) : `${algs.length} computed`} digests equals\n${expected}\nCheck the algorithm, the input encoding and trailing newlines.` } });
        text = (ok ? `✓ match (${H.hashName(algs[hit])})` : "✗ mismatch") + "\n" + text;
      }
      views.push({
        label: "Input",
        out: { kind: "stats", items: [{ label: "Source", value: fromFile ? inputs["file:name"] || "file" : `${str(opts.input)} input` }, { label: "Bytes hashed", value: data.length.toLocaleString(), tone: "info" }, { label: "Algorithms", value: algs.length }, { label: "Output encoding", value: enc }] },
      });
      return { text, views, notes: fromFile && inputs.text.trim() ? ["Hashing the file — the text field is ignored while a file is loaded."] : undefined };
    },
    examples: [
      { label: "All of “hello”", inputs: { text: "hello" }, note: "Every algorithm at once. MD5 5d41402a…, SHA-256 2cf24dba… — compare with `echo -n hello | sha256sum`." },
      { label: "SHA-256 Base64", inputs: { text: "The quick brown fox jumps over the lazy dog" }, opts: { alg: "sha256", enc: "base64" }, note: "Base64 digests appear in SRI attributes and HTTP Digest headers." },
      { label: "Verify a checksum", inputs: { text: "formatter-2.3.0.tar.gz contents\n", expected: "SHA256:84dbcb2b088ac4cdaa5bdc1a0951d99a29f9f169818f9d590bdd22c550030965" }, opts: { alg: "all" }, note: "Paste a published checksum: it is compared with every algorithm and the matching one is named." },
      { label: "Hex bytes → Keccak", inputs: { text: "0xdeadbeef" }, opts: { alg: "keccak256", input: "hex" }, note: "Hex input hashes the raw bytes DE AD BE EF — Keccak-256 is Ethereum's hash (not SHA3-256)." },
      { label: "Per-line MD5", inputs: { text: "alice@example.com\nbob@example.com\ncarol@example.com" }, opts: { alg: "md5", lines: true }, note: "One digest per line — e.g. Gravatar-style email hashes." },
      { label: "Empty input", inputs: { text: "" }, opts: { alg: "sha1", enc: "HEX" }, note: "The digest of zero bytes is still defined: SHA-1 DA39A3EE…" },
      { label: "File (Base64)", inputs: { file: "UmVsZWFzZSBub3RlcyB2Mi4zLjAKLSBPZmZsaW5lIG1vZGUKLSBQaXBlbGluZXMK", "file:name": "notes.txt · 48 B" }, opts: { alg: "blake3" }, note: "A dropped file wins over the text field; BLAKE3 is the fastest modern hash." },
      { label: "Wrong checksum", inputs: { text: "hello", expected: "5d41402abc4b2a76b9719d911017c593" }, opts: { alg: "md5" }, note: "One digit off: reported as a mismatch.", error: true },
    ],
  },

  "hmac-tool": {
    inputs: [
      { id: "message", label: "Message (the exact bytes that were signed)", lang: "text", wrap: true },
      { id: "key", label: "Secret key", kind: "text", placeholder: "Signing secret" },
      { id: "expected", label: "Signature to verify (optional)", kind: "text", placeholder: "hex or base64 — prefixes like sha256= and v0= are fine" },
    ],
    options: [
      { id: "alg", label: "Hash", type: "select", choices: [["SHA-256", "SHA-256"], ["SHA-1", "SHA-1"], ["SHA-384", "SHA-384"], ["SHA-512", "SHA-512"], ["MD5", "MD5"], ["SHA3-256", "SHA3-256"], ["SHA3-512", "SHA3-512"]], default: "SHA-256" },
      { id: "keyEnc", label: "Key is", type: "segment", choices: [["text", "Text"], ["hex", "Hex"], ["base64", "Base64"]], default: "text" },
      { id: "enc", label: "Output", type: "segment", choices: [["hex", "hex"], ["base64", "Base64"], ["base64url", "Base64url"]], default: "hex" },
      { id: "prefix", label: "Header format", type: "select", choices: [["", "Plain"], ["sha256=", "GitHub  sha256=…"], ["v0=", "Slack  v0=…"], ["v1=", "Stripe  v1=…"]], default: "" },
    ],
    async run({ inputs, opts }) {
      const H = await hashLib();
      if (!inputs.key) throw new ToolError("Enter the secret key.");
      const key = H.decodeInput(inputs.key, str(opts.keyEnc));
      const msg = H.utf8(inputs.message);
      const alg = str(opts.alg);
      let mac: Uint8Array;
      const subtle = globalThis.crypto?.subtle;
      if (subtle && /^SHA-(1|256|384|512)$/.test(alg)) {
        const k = await subtle.importKey("raw", key as BufferSource, { name: "HMAC", hash: alg }, false, ["sign"]);
        mac = new Uint8Array(await subtle.sign("HMAC", k, msg as BufferSource));
      } else {
        const { hmac } = await import("@noble/hashes/hmac.js");
        const fn = await H.hasher({ "SHA-1": "sha1", "SHA-256": "sha256", "SHA-384": "sha384", "SHA-512": "sha512", MD5: "md5", "SHA3-256": "sha3_256", "SHA3-512": "sha3_512" }[alg] ?? "sha256");
        mac = hmac(fn as never, key, msg);
      }
      const sig = H.encodeOut(mac, str(opts.enc));
      const text = `${str(opts.prefix)}${sig}`;
      const views: View[] = [{ label: `HMAC-${alg}`, out: { kind: "text", text, wrap: true } }];
      const exp = (inputs.expected ?? "").trim();
      let verdict = "";
      if (exp) {
        // Accept "sha256=…", "v0=…", and Stripe's "t=…,v1=…,v0=…"
        const candidates = exp.split(",").map((p) => p.trim().replace(/^(sha\d+|v\d|md5)=/i, "")).filter((p) => !/^t=/.test(p));
        let expBytes: Uint8Array | null = null;
        const ok = candidates.some((c) => {
          try {
            expBytes = /^[0-9a-f]+$/i.test(c) && c.length % 2 === 0 ? H.fromHex(c) : H.fromB64(c);
          } catch {
            return false;
          }
          return H.timingSafeEqual(expBytes, mac);
        });
        verdict = ok ? "✓ Signature valid" : "✗ Signature mismatch";
        views.unshift({ label: ok ? "✓ Valid" : "✗ Mismatch", out: { kind: "status", ok, title: verdict, detail: ok ? "Compared in constant time against the computed HMAC." : `Expected ${exp}\nComputed ${text}\nCheck the secret, the hash, the key encoding and that the message is byte-for-byte what was signed (raw body, no reformatting).` } });
      }
      views.push({
        label: "Details",
        out: { kind: "table", columns: ["field", "value"], rows: [["algorithm", `HMAC-${alg}`], ["key bytes", key.length], ["message bytes", msg.length], ["mac bytes", mac.length], ["hex", H.toHex(mac)], ["base64", H.toB64(mac)], ["base64url", H.toB64url(mac)]] },
      });
      return { text: verdict ? `${verdict}\n${text}` : text, views };
    },
    examples: [
      { label: "GitHub webhook", inputs: { message: "Hello, World!", key: "It's a Secret to Everybody", expected: "sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17" }, opts: { prefix: "sha256=" }, note: "GitHub's documented example: X-Hub-Signature-256 is sha256= plus the hex HMAC of the raw request body." },
      {
        label: "Slack signing",
        inputs: {
          message: "v0:1531420618:token=xyzz0WbapA4vBCDEFasx0q6G&team_id=T1DC2JH3J&team_domain=testteamnow&channel_id=G8PSS9T3V&channel_name=foobar&user_id=U2CERLKJA&user_name=roadrunner&command=%2Fwebhook-collect&text=&response_url=https%3A%2F%2Fhooks.slack.com%2Fcommands%2FT1DC2JH3J%2F397700885554%2F96rGlfmibIGlgcZRskXaIFfN&trigger_id=398738663015.47445629121.803a0bc887a14d10d2c447fce8b6703c",
          key: "8f742231b10e8888abcd99yyyzzz85a5",
          expected: "v0=a2114d57b48eac39b9ad189dd8316235a7b4a8d21a10bd27519666489c69b503",
        },
        opts: { prefix: "v0=" },
        note: "Slack signs the base string v0:{X-Slack-Request-Timestamp}:{raw body}; compare with X-Slack-Signature.",
      },
      {
        label: "Stripe-style",
        inputs: {
          message: '1726128000.{"id":"evt_1QdemoXYZ","object":"event","type":"payment_intent.succeeded","data":{"object":{"id":"pi_3Qdemo","amount":2000,"currency":"eur"}}}',
          key: "whsec_" + "MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw",
          expected: "t=1726128000,v1=572582dcaabb59a63aa945055558b8bc97f6bc8831ea1540d373b35f5e124313",
        },
        opts: { prefix: "v1=" },
        note: "Stripe signs {t}.{payload} with the endpoint secret; the whole Stripe-Signature header can be pasted to verify.",
      },
      {
        label: "AWS SigV4 (hex key)",
        inputs: {
          message: "AWS4-HMAC-SHA256\n20150830T123600Z\n20150830/us-east-1/iam/aws4_request\nf536975d06c0309214f805bb90ccff089219ecd68b2577efef23edd43b7e1a59",
          key: "c4afb1cc5771d871763a393e44b703571b55cc28424d1a5e86da6ed3c154a4b9",
          expected: "5d672d79c15b13162d9279b0855cfba6789a8edb4c82c400e06b5924a6f2b5d7",
        },
        opts: { keyEnc: "hex" },
        note: "The last step of AWS Signature V4: HMAC the string-to-sign with the derived signing key, given as hex bytes (AWS docs example).",
      },
      { label: "HMAC-SHA1 Base64", inputs: { message: "The quick brown fox jumps over the lazy dog", key: "key" }, opts: { alg: "SHA-1", enc: "base64" }, note: "Classic test vector: 3nybhbi3iqa8ino29wqQcBydtNk= (OAuth 1.0 style)." },
      { label: "HMAC-SHA3-256", inputs: { message: "The quick brown fox jumps over the lazy dog", key: "key" }, opts: { alg: "SHA3-256" }, note: "SHA3 and MD5 HMACs use @noble/hashes; SHA-1/2 use the browser's SubtleCrypto." },
      { label: "Tampered body", inputs: { message: "Hello, World?", key: "It's a Secret to Everybody", expected: "sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17" }, opts: { prefix: "sha256=" }, note: "One changed character in the body → signature mismatch.", error: true },
    ],
  },

  "password-generator": {
    inputs: [],
    generator: true,
    options: [
      { id: "mode", label: "Mode", type: "segment", choices: [["random", "Random"], ["passphrase", "Passphrase"], ["pin", "PIN"], ["pronounceable", "Pronounceable"]], default: "random" },
      { id: "length", label: "Length", type: "number", default: 20, min: 4, max: 256, show: (o) => o.mode !== "passphrase" },
      { id: "count", label: "Count", type: "number", default: 5, min: 1, max: 200 },
      { id: "upper", label: "A–Z", type: "toggle", default: true, show: (o) => o.mode === "random" },
      { id: "lower", label: "a–z", type: "toggle", default: true, show: (o) => o.mode === "random" },
      { id: "digits", label: "0–9", type: "toggle", default: true, show: (o) => o.mode === "random" || o.mode === "pronounceable" },
      { id: "symbols", label: "Symbols", type: "toggle", default: true, show: (o) => o.mode === "random" || o.mode === "pronounceable" },
      { id: "symbolSet", label: "Symbol set", type: "text", default: "!@#$%^&*()-_=+[]{};:,.?/", width: 150, show: (o) => o.mode === "random" || o.mode === "pronounceable" },
      { id: "noAmbiguous", label: "No look-alikes (Il1O0)", type: "toggle", default: false, show: (o) => o.mode === "random" },
      { id: "requireAll", label: "Use every set", type: "toggle", default: true, show: (o) => o.mode === "random" },
      { id: "words", label: "Words", type: "number", default: 5, min: 2, max: 16, show: (o) => o.mode === "passphrase" },
      { id: "separator", label: "Separator", type: "select", choices: [["-", "hyphen -"], [" ", "space"], [".", "dot ."], ["_", "underscore _"], ["", "none"], ["digit", "random digit"]], default: "-", show: (o) => o.mode === "passphrase" },
      { id: "capitalize", label: "Capitalize", type: "toggle", default: false, show: (o) => o.mode === "passphrase" || o.mode === "pronounceable" },
      { id: "addNumber", label: "+ number", type: "toggle", default: false, show: (o) => o.mode === "passphrase" },
      { id: "addSymbol", label: "+ symbol", type: "toggle", default: false, show: (o) => o.mode === "passphrase" },
    ],
    action: "Generate",
    async run({ opts }) {
      const mode = str(opts.mode);
      const count = Math.max(1, Math.min(200, num(opts.count, 5)));
      const len = Math.max(4, Math.min(256, num(opts.length, 20)));
      const out: { pw: string; bits: number }[] = [];
      const symbolSet = [...new Set(str(opts.symbolSet, "!@#$%^&*").replace(/\s/g, ""))].join("");
      if (mode === "random") {
        let sets: string[] = [];
        if (bool(opts.upper)) sets.push(SETS.upper);
        if (bool(opts.lower)) sets.push(SETS.lower);
        if (bool(opts.digits)) sets.push(SETS.digits);
        if (bool(opts.symbols) && symbolSet) sets.push(symbolSet);
        if (bool(opts.noAmbiguous)) sets = sets.map((s) => s.replace(AMBIGUOUS, "")).filter(Boolean);
        if (!sets.length) throw new ToolError("Turn on at least one character set.");
        const pool = [...new Set(sets.join(""))].join("");
        if (bool(opts.requireAll) && sets.length > len) throw new ToolError(`Length ${len} is too short to include all ${sets.length} character sets.`);
        for (let n = 0; n < count; n++) {
          const chars: string[] = [];
          if (bool(opts.requireAll)) for (const s of sets) chars.push(pick(s));
          while (chars.length < len) chars.push(pick(pool));
          out.push({ pw: shuffle(chars).join(""), bits: len * Math.log2(pool.length) });
        }
      } else if (mode === "passphrase") {
        const { WORDS } = await import("./lib/D-words");
        const words = Math.max(2, Math.min(16, num(opts.words, 5)));
        const sep = str(opts.separator);
        const syms = symbolSet || "!@#$%";
        for (let n = 0; n < count; n++) {
          const w = Array.from({ length: words }, () => {
            const x = pick(WORDS);
            return bool(opts.capitalize) ? x[0].toUpperCase() + x.slice(1) : x;
          });
          let bits = words * Math.log2(WORDS.length);
          let pw = sep === "digit" ? w.reduce((a, x, i) => (i ? `${a}${randomInt(10)}${x}` : x), "") : w.join(sep);
          if (sep === "digit") bits += (words - 1) * Math.log2(10);
          if (bool(opts.addNumber)) { pw += (sep === "digit" ? "" : sep) + String(randomInt(100)); bits += Math.log2(100); }
          if (bool(opts.addSymbol)) { pw += pick(syms); bits += Math.log2(syms.length); }
          out.push({ pw, bits });
        }
      } else if (mode === "pin") {
        for (let n = 0; n < count; n++) out.push({ pw: Array.from({ length: len }, () => String(randomInt(10))).join(""), bits: len * Math.log2(10) });
      } else {
        // Pronounceable: consonant–vowel syllables, optional digit/symbol at the end
        for (let n = 0; n < count; n++) {
          let pw = "";
          let bits = 0;
          const tail = (bool(opts.digits) ? 2 : 0) + (bool(opts.symbols) && symbolSet ? 1 : 0);
          while (pw.length < len - tail) {
            const cons = pw.length % 2 === 0;
            const src = cons ? CONS : VOWELS;
            let ch = pick(src);
            bits += Math.log2(src.length);
            if (bool(opts.capitalize) && pw.length === 0) ch = ch.toUpperCase();
            pw += ch;
          }
          if (bool(opts.digits)) { pw += String(randomInt(10)) + String(randomInt(10)); bits += 2 * Math.log2(10); }
          if (bool(opts.symbols) && symbolSet) { pw += pick(symbolSet); bits += Math.log2(symbolSet.length); }
          out.push({ pw: pw.slice(0, Math.max(len, pw.length)), bits });
        }
      }
      const text = out.map((o) => o.pw).join("\n");
      const avg = out.reduce((a, o) => a + o.bits, 0) / out.length;
      return {
        text,
        views: [
          { label: `Passwords (${out.length})`, out: { kind: "text", text } },
          { label: "Strength", out: { kind: "table", columns: ["password", "length", "entropy (bits)", "strength", "offline fast hash (1e11/s)", "online throttled (100/h)"], rows: out.map((o) => [o.pw, o.pw.length, Number(o.bits.toFixed(1)), strength(o.bits), crack(o.bits, OFFLINE), crack(o.bits, ONLINE)]) } },
          { label: "Summary", out: { kind: "stats", items: [{ label: "Entropy", value: `${avg.toFixed(1)} bits`, tone: avg >= 60 ? "ok" : avg >= 36 ? "warn" : "bad" }, { label: "Strength", value: strength(avg), tone: avg >= 60 ? "ok" : avg >= 36 ? "warn" : "bad" }, { label: "Offline crack (avg)", value: crack(avg, OFFLINE) }, { label: "Online crack (avg)", value: crack(avg, ONLINE) }, { label: "Generator", value: "crypto.getRandomValues, rejection sampling" }] } },
        ],
        filename: "passwords.txt",
      };
    },
    examples: [
      { label: "20 chars, all sets", opts: { mode: "random", length: 20 }, note: "~130 bits: every set guaranteed, no modulo bias (rejection sampling)." },
      { label: "Passphrase", opts: { mode: "passphrase", words: 5, separator: "-" }, note: "Five words from a ~2,400-word list ≈ 56 bits — easy to type, hard to guess." },
      { label: "Memorable+", opts: { mode: "passphrase", words: 4, separator: "digit", capitalize: true, addSymbol: true }, note: "Capitalized words joined by random digits, plus a symbol — satisfies most password rules." },
      { label: "No look-alikes", opts: { mode: "random", length: 14, symbols: false, noAmbiguous: true, count: 8 }, note: "Drops I, l, 1, O, 0 and o — for passwords read aloud or typed from paper." },
      { label: "6-digit PINs", opts: { mode: "pin", length: 6, count: 10 }, note: "20 bits: only safe where attempts are rate-limited (compare the online column)." },
      { label: "Pronounceable", opts: { mode: "pronounceable", length: 14, capitalize: true }, note: "Consonant–vowel syllables plus digits and a symbol — easier to remember, fewer bits per character." },
      { label: "Custom symbols", opts: { mode: "random", length: 32, symbolSet: "-_.~", count: 3 }, note: "Only URL-safe symbols, for systems that reject quotes or brackets." },
    ],
  },

  "token-generator": {
    inputs: [],
    generator: true,
    options: [
      { id: "type", label: "Type", type: "select", choices: [["hex", "Hex"], ["base64", "Base64"], ["base64url", "Base64url"], ["alnum", "Alphanumeric (base62)"], ["uuid4", "UUID v4"], ["uuid7", "UUID v7 (time-ordered)"], ["ulid", "ULID"], ["nanoid", "NanoID"], ["apikey", "Prefixed API key"], ["otp", "Numeric OTP"]], default: "hex" },
      { id: "count", label: "Count", type: "number", default: 5, min: 1, max: 500 },
      { id: "bytes", label: "Bytes", type: "number", default: 32, min: 4, max: 256, show: (o) => ["hex", "base64", "base64url"].includes(String(o.type)) },
      { id: "length", label: "Length", type: "number", default: 32, min: 4, max: 256, show: (o) => ["alnum", "apikey"].includes(String(o.type)) },
      { id: "alphabet", label: "Alphabet", type: "text", default: "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict", width: 170, show: (o) => o.type === "nanoid" },
      { id: "size", label: "Size", type: "number", default: 21, min: 2, max: 128, show: (o) => o.type === "nanoid" },
      { id: "prefix", label: "Prefix", type: "text", default: "sk_live_", width: 100, show: (o) => o.type === "apikey" },
      { id: "checksum", label: "CRC32 checksum", type: "toggle", default: true, show: (o) => o.type === "apikey", hint: "Append 6 base62 chars of CRC32 so typos and truncation are caught offline (like GitHub tokens)" },
      { id: "digits", label: "Digits", type: "number", default: 6, min: 4, max: 12, show: (o) => o.type === "otp" },
    ],
    action: "Generate",
    async run({ opts }) {
      const H = await hashLib();
      const type = str(opts.type);
      const count = Math.max(1, Math.min(500, num(opts.count, 5)));
      const bytes = Math.max(4, Math.min(256, num(opts.bytes, 32)));
      const length = Math.max(4, Math.min(256, num(opts.length, 32)));
      let bits = 0;
      let describe = "";
      const gen = (): string => {
        switch (type) {
          case "hex": bits = bytes * 8; describe = `${bytes} random bytes as hex`; return H.toHex(randomBytes(bytes));
          case "base64": bits = bytes * 8; describe = `${bytes} random bytes, Base64 (RFC 4648)`; return H.toB64(randomBytes(bytes));
          case "base64url": bits = bytes * 8; describe = `${bytes} random bytes, URL-safe Base64 without padding`; return H.toB64url(randomBytes(bytes));
          case "alnum": bits = length * Math.log2(62); describe = `${length} characters from [0-9A-Za-z]`; return b62(new Uint8Array(), length);
          case "uuid4": bits = 122; describe = "RFC 9562 version 4: 122 random bits"; return uuid4();
          case "uuid7": bits = 74; describe = "RFC 9562 version 7: 48-bit Unix ms timestamp + 12-bit counter + 62 random bits — sorts by creation time"; return uuid7();
          case "ulid": bits = 80; describe = "48-bit timestamp + 80 random bits, Crockford Base32, lexicographically sortable"; return ulid();
          case "nanoid": {
            const alpha = [...new Set(str(opts.alphabet) || "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict")];
            if (alpha.length < 2) throw new ToolError("The NanoID alphabet needs at least two distinct characters.");
            const size = Math.max(2, Math.min(128, num(opts.size, 21)));
            bits = size * Math.log2(alpha.length);
            describe = `${size} characters from a ${alpha.length}-symbol alphabet`;
            return Array.from({ length: size }, () => pick(alpha)).join("");
          }
          case "apikey": {
            const prefix = str(opts.prefix);
            const body = b62(new Uint8Array(), length);
            bits = length * Math.log2(62);
            describe = `${prefix || "(no prefix)"} + ${length} base62 chars${bool(opts.checksum) ? " + 6-char CRC32 checksum" : ""} — the prefix makes leaked keys easy to scan for`;
            if (!bool(opts.checksum)) return prefix + body;
            let c = H.crc32(H.utf8(body));
            let cs = "";
            for (let i = 0; i < 6; i++) { cs = B62[c % 62] + cs; c = Math.floor(c / 62); }
            return prefix + body + cs;
          }
          case "otp": {
            const d = Math.max(4, Math.min(12, num(opts.digits, 6)));
            bits = d * Math.log2(10);
            describe = `${d}-digit one-time code, uniformly random (not TOTP)`;
            return Array.from({ length: d }, () => String(randomInt(10))).join("");
          }
        }
        throw new ToolError(`Unknown token type ${type}.`);
      };
      const tokens = Array.from({ length: count }, gen);
      const text = tokens.join("\n");
      const rows = tokens.map((t) => {
        const r: (string | number)[] = [t, t.length];
        if (type === "uuid7") r.push(new Date(parseInt(t.replace(/-/g, "").slice(0, 12), 16)).toISOString());
        else if (type === "ulid") r.push(new Date([...t.slice(0, 10)].reduce((a, ch) => a * 32 + CROCKFORD.indexOf(ch), 0)).toISOString());
        return r;
      });
      return {
        text,
        filename: "tokens.txt",
        views: [
          { label: `Tokens (${count})`, out: { kind: "text", text } },
          { label: "Table", out: { kind: "table", columns: ["token", "length", ...(type === "uuid7" || type === "ulid" ? ["embedded time"] : [])], rows } },
          { label: "Entropy", out: { kind: "stats", items: [{ label: "Entropy per token", value: `${bits.toFixed(1)} bits`, tone: bits >= 128 ? "ok" : bits >= 64 ? "info" : "warn" }, { label: "Format", value: describe }, { label: "Collision odds (1M tokens)", value: bits > 60 ? `≈ 1 in ${Math.pow(2, bits - 39).toExponential(1)}` : "check your volume" }, { label: "Source", value: "crypto.getRandomValues" }] } },
        ],
      };
    },
    examples: [
      { label: "256-bit hex secret", opts: { type: "hex", bytes: 32 }, note: "The classic session secret / signing key: 64 hex characters." },
      { label: "Base64url", opts: { type: "base64url", bytes: 24, count: 3 }, note: "32 URL-safe characters — good for reset links and CSRF tokens." },
      { label: "UUID v7", opts: { type: "uuid7", count: 6 }, note: "Time-ordered UUIDs: database-friendly primary keys; the table decodes the embedded timestamp." },
      { label: "ULID", opts: { type: "ulid", count: 6 }, note: "26 Crockford-Base32 characters that sort by time." },
      { label: "Stripe-style API key", opts: { type: "apikey", prefix: "sk_live_", length: 32, count: 3 }, note: "A recognisable prefix plus a CRC32 checksum, so secret scanners can find leaks and typos are caught." },
      { label: "Short NanoID", opts: { type: "nanoid", alphabet: "0123456789abcdefghjkmnpqrstvwxyz", size: 10, count: 8 }, note: "A custom lowercase alphabet without look-alikes for short share codes." },
      { label: "UUID v4", opts: { type: "uuid4", count: 10 } },
      { label: "8-digit OTP", opts: { type: "otp", digits: 8, count: 4 } },
    ],
  },

  "secret-detector": {
    inputs: [{ id: "text", label: "Code, config or logs to scan", lang: "text", placeholder: "Paste .env files, source code, YAML, JSON, shell history or logs" }],
    options: [
      { id: "mask", label: "Redact as", type: "segment", choices: [["stars", "****"], ["partial", "ab12****ef"], ["label", "[REDACTED:rule]"], ["fixed", "********"]], default: "label" },
      { id: "entropy", label: "Entropy scan", type: "toggle", default: true, hint: "Also flag random-looking strings no rule recognises" },
      { id: "threshold", label: "Entropy ≥", type: "number", default: 4.3, min: 2.5, max: 6, step: 0.1, show: (o) => !!o.entropy },
      { id: "minLen", label: "Min length", type: "number", default: 20, min: 8, max: 200, show: (o) => !!o.entropy },
      { id: "low", label: "Include low severity", type: "toggle", default: true, hint: "Publishable keys and other low-risk identifiers" },
    ],
    async run({ inputs, opts }) {
      const S = await import("./lib/D-secrets");
      const text = inputs.text;
      if (!text.trim()) throw new ToolError("Paste text to scan for secrets.");
      const findings = S.scan(text, { entropy: bool(opts.entropy), threshold: num(opts.threshold, 4.3), minLen: num(opts.minLen, 20), low: bool(opts.low) });
      const redacted = S.redact(text, findings, str(opts.mask));
      const level = (s: string) => (s === "critical" || s === "high" ? "error" : s === "medium" ? "warning" : "info") as "error" | "warning" | "info";
      const bySev = (s: string) => findings.filter((f) => f.severity === s).length;
      const preview = (f: (typeof findings)[number]) => {
        const s = f.secret.replace(/\n[\s\S]*/, "…");
        return s.length <= 10 ? s.slice(0, 2) + "…" : `${s.slice(0, 6)}…${s.slice(-3)} (${f.secret.length} chars)`;
      };
      return {
        text: redacted,
        filename: "redacted.txt",
        views: [
          { label: "Redacted", out: { kind: "text", text: redacted } },
          {
            label: `Findings (${findings.length})`,
            out: findings.length
              ? { kind: "table", columns: ["line", "col", "severity", "rule", "preview", "entropy", "what to do"], rows: findings.map((f) => [f.line, f.col, f.severity, f.name, preview(f), Number(f.entropy.toFixed(2)), f.hint]) }
              : { kind: "status", ok: true, title: "No secrets found", detail: `Checked ${S.RULES.length} rules${bool(opts.entropy) ? ` and entropy ≥ ${num(opts.threshold, 4.3)}` : ""}.` },
          },
          { label: "Issues", out: { kind: "issues", items: findings.length ? findings.map((f) => ({ level: level(f.severity), message: `${f.name} (${f.severity}) — ${f.hint}`, line: f.line, col: f.col })) : [{ level: "ok", message: "Nothing that looks like a credential." }] } },
          { label: "Summary", out: { kind: "stats", items: [{ label: "Findings", value: findings.length, tone: findings.length ? "bad" : "ok" }, { label: "Critical", value: bySev("critical"), tone: bySev("critical") ? "bad" : undefined }, { label: "High", value: bySev("high"), tone: bySev("high") ? "bad" : undefined }, { label: "Medium", value: bySev("medium"), tone: bySev("medium") ? "warn" : undefined }, { label: "Low", value: bySev("low") }, { label: "Lines scanned", value: text.split("\n").length }] } },
        ],
      };
    },
    examples: [
      {
        label: ".env file",
        inputs: {
          text: `# Production environment — DO NOT COMMIT
NODE_ENV=production
DATABASE_URL=${fake.pg()}
AWS_ACCESS_KEY_ID=${fake.aws()}
AWS_SECRET_ACCESS_KEY=${fake.awsSecret()}
STRIPE_SECRET_KEY=${fake.stripe()}
STRIPE_PUBLISHABLE_KEY=pk_live_${"51Hd2kLqW9eXz3VbN8pRtY6uIo"}
GITHUB_TOKEN=${fake.ghp()}
SLACK_WEBHOOK=${fake.slackHook()}
SENTRY_DSN_ENABLED=true
LOG_LEVEL=info`,
        },
        note: "A leaked .env: database URL password, AWS key pair, Stripe live key, GitHub PAT, Slack webhook. Low-severity publishable key included.",
      },
      {
        label: "Source code",
        inputs: {
          text: `import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

// TODO: move to env before release
const openai = new OpenAI({ apiKey: "${fake.openai()}" });
const anthropic = new Anthropic({ apiKey: "${fake.anthropic()}" });

const config = {
  sendgridKey: "${fake.sendgrid()}",
  maps: { key: "${fake.google()}" },
  password: process.env.DB_PASSWORD,   // fine: read from the environment
  retries: 3,
};

export const adminPassword = "Tr0ub4dor&3xtra";`,
        },
        opts: { mask: "partial" },
        note: "AI provider keys, SendGrid and Google keys and a hard-coded password; process.env references are not flagged.",
      },
      {
        label: "Kubernetes YAML",
        inputs: {
          text: `apiVersion: v1
kind: Secret
metadata:
  name: ci-credentials
type: Opaque
stringData:
  npm_token: ${fake.npm()}
  gitlab_token: ${fake.gitlab()}
  twilio_api_key: ${fake.twilio()}
  registry_password: "hunter2-but-longer!"
---
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
        - name: api
          env:
            - name: SESSION_SECRET
              valueFrom: { secretKeyRef: { name: app, key: session } }`,
        },
        note: "Tokens in a Secret manifest; the secretKeyRef reference is correctly ignored.",
      },
      {
        label: "Service account JSON",
        inputs: {
          text: `{
  "type": "service_account",
  "project_id": "demo-project-42",
  "private_key_id": "3f1c2b9a7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a",
  "private_key": "${fake.pem().replace(/\n/g, "\\n")}",
  "client_email": "deployer@demo-project-42.iam.gserviceaccount.com",
  "client_id": "104823456789012345678"
}`,
        },
        opts: { mask: "stars" },
        note: "A private key inside JSON (escaped newlines) plus a random key ID caught by the entropy scan.",
      },
      {
        label: "Shell history & logs",
        inputs: {
          text: `$ curl -H "Authorization: Bearer ${fake.jwt()}" https://api.example.com/v1/me
$ git clone https://deploy:${"glpat-" + "Zx8Rk4Lp8Vn3Bt6Yc1Hd"}@gitlab.example.com/team/app.git
$ mysql -h db.local -u root --password=CorrectHorseBattery9
2026-09-24T08:00:12Z INFO request id=5f0c8e0e-6a4b-4d2e-9f3a-2b1c0d9e8f7a user=ada
2026-09-24T08:00:13Z DEBUG cache key=v2:9b1d7c3e5a8f2b4d6e0c1a9f7b3d5e8c2a4f6b0d1e3c5a7f9b2d4e6a8c0e1f3a5`,
        },
        opts: { mask: "fixed" },
        note: "A bearer JWT, a token inside a git URL and a password flag; the request UUID is skipped, the long hex cache key is flagged by entropy.",
      },
      { label: "Clean config", inputs: { text: "server:\n  port: 8080\n  host: 0.0.0.0\nlogging:\n  level: info\ndatabase:\n  password: ${DB_PASSWORD}\n  url: postgres://app@db:5432/app\nfeature_flags:\n  new_checkout: true" }, note: "Placeholders like ${DB_PASSWORD} are recognised: nothing to report." },
      { label: "Entropy only", inputs: { text: "legacy_value = 'Qm9vdHN0cmFwLUtleS0yMDI2LTA5LTI0LXByb2Q9NGY3YQ'\nbuild_hash = 1f3870be274f6c49b3e31a0c6728957f\nmessage = 'hello world this is fine'" }, opts: { threshold: 4.0 }, note: "No known prefix, but random-looking: base64 and hex strings above the entropy threshold." },
    ],
    steps: ["Paste code, config, logs or a diff.", "Review Findings: rule, severity, line and column, and what to do.", "Copy the redacted text (the primary output) to share it safely."],
    tips: ["Nothing leaves your browser — but treat any real secret you find as leaked and rotate it."],
  },

  "x509-viewer": {
    inputs: [{ id: "pem", label: "PEM certificate(s), CSR, or Base64 DER", lang: "text", placeholder: "-----BEGIN CERTIFICATE-----\n…\n-----END CERTIFICATE-----" }],
    options: [
      { id: "index", label: "Show certificate #", type: "number", default: 1, min: 1, max: 20 },
      { id: "verify", label: "Verify signatures", type: "toggle", default: true, hint: "Check each signature with the next certificate's public key (SubtleCrypto)" },
      { id: "at", label: "Validity at", type: "text", default: "", placeholder: "now (or 2027-01-01)", width: 130 },
    ],
    async run({ inputs, opts }) {
      const A = await import("./lib/D-asn1");
      const src = inputs.pem.trim();
      if (!src) throw new ToolError("Paste a PEM certificate (or a chain, or a CSR).");
      const blocks = A.readPem(src).filter((b) => /CERTIFICATE|DER/.test(b.label));
      if (!blocks.length) {
        if (/PRIVATE KEY/.test(src)) throw new ToolError("That is a private key, not a certificate. Never paste private keys into online tools — this one is offline, but still.");
        throw new ToolError("No certificate found. Expected -----BEGIN CERTIFICATE----- … -----END CERTIFICATE----- (or a CERTIFICATE REQUEST, or raw Base64 DER).");
      }
      const certs = blocks.map((b, i) => {
        try {
          return A.decodeCert(b.der);
        } catch (e) {
          throw new ToolError(`Block ${i + 1} (${b.label}, line ${b.line}): ${(e as Error).message}`);
        }
      });
      const atStr = str(opts.at).trim();
      const now = atStr ? new Date(atStr) : new Date();
      if (Number.isNaN(now.getTime())) throw new ToolError(`"${atStr}" is not a date. Use e.g. 2027-01-01.`);
      const idx = Math.min(certs.length, Math.max(1, num(opts.index, 1))) - 1;
      const c = certs[idx];
      const [sha1, sha256] = await Promise.all([A.digest("SHA-1", c.der), A.digest("SHA-256", c.der)]);
      const spkiSha = await A.digest("SHA-256", c.spki);
      const status = c.kind === "csr" ? "Certificate signing request" : now < c.notBefore! ? "Not yet valid" : now > c.notAfter! ? "Expired" : "Valid";
      const remaining = c.notAfter ? days(c.notAfter.getTime() - now.getTime()) : 0;
      const selfSigned = c.kind === "certificate" && A.dnKey(c.subject) === A.dnKey(c.issuer);
      // signatures
      const verdicts: (boolean | null)[] = [];
      if (bool(opts.verify))
        for (let i = 0; i < certs.length; i++) {
          const cur = certs[i];
          const issuer = cur.kind === "csr" || A.dnKey(cur.subject) === A.dnKey(cur.issuer) ? cur : certs[i + 1];
          verdicts.push(issuer ? await A.verifySignature(cur, issuer) : null);
        }
      const sigText = (v: boolean | null | undefined) => (v === true ? "✓ verified" : v === false ? "✗ INVALID" : "not checked");
      const dn = (r: typeof c.subject) => r.map((x) => `${x.name}=${x.value}`).join(", ");
      const summary: [string, string][] = [
        ["Type", c.kind === "csr" ? "PKCS#10 certificate request" : `X.509 v${c.version} certificate${c.isCA ? " (CA)" : ""}${selfSigned ? ", self-signed" : ""}`],
        ["Status", c.kind === "csr" ? "—" : `${status}${status === "Valid" ? ` · ${remaining} days remaining` : status === "Expired" ? ` · expired ${-remaining} days ago` : ` · starts in ${days(c.notBefore!.getTime() - now.getTime())} days`}`],
        ["Subject", dn(c.subject)],
        ...(c.kind === "certificate" ? [["Issuer", dn(c.issuer)] as [string, string]] : []),
        ...c.subject.map((r) => [`  ${r.name}`, r.value] as [string, string]),
        ...(c.serial ? [["Serial", c.serial] as [string, string]] : []),
        ...(c.notBefore ? [["Not before", c.notBefore.toISOString().replace(".000Z", "Z")] as [string, string], ["Not after", c.notAfter!.toISOString().replace(".000Z", "Z")] as [string, string], ["Lifetime", `${days(c.notAfter!.getTime() - c.notBefore.getTime())} days`] as [string, string]] : []),
        ["Public key", `${c.keyAlg} — ${c.keyDetail}`],
        ["Signature algorithm", `${c.sigAlg} (${c.sigAlgOid})`],
        ...(bool(opts.verify) ? [["Signature", sigText(verdicts[idx]) + (c.kind === "csr" ? " (self-signature)" : selfSigned ? " (self-signed)" : idx + 1 < certs.length ? " by next certificate" : " — issuer not in input")] as [string, string]] : []),
        ["Subject Alt Names", c.san.join(", ") || "—"],
        ["SHA-256 fingerprint", colonHex(sha256)],
        ["SHA-1 fingerprint", colonHex(sha1)],
        ["SPKI SHA-256 (pin)", btoa(String.fromCharCode(...spkiSha))],
      ];
      const extRows = c.extensions.map((x) => [x.name, x.critical ? "critical" : "", x.value, x.oid]);
      const chainRows = certs.map((x, i) => {
        const next = certs[i + 1];
        const self = x.kind === "certificate" && A.dnKey(x.subject) === A.dnKey(x.issuer);
        const link = x.kind === "csr" ? "CSR" : self ? "self-signed (root)" : !next ? "issuer not supplied" : A.dnKey(x.issuer) === A.dnKey(next.subject) ? (x.aki && next.ski && x.aki !== next.ski ? "✗ name matches, key id differs" : "✓ issued by next") : "✗ issuer ≠ next subject";
        const st = x.kind === "csr" ? "—" : now < x.notBefore! ? "not yet valid" : now > x.notAfter! ? "EXPIRED" : `valid (${days(x.notAfter!.getTime() - now.getTime())} d)`;
        return [i + 1, x.subject.find((r) => r.name === "CN")?.value ?? A.dnString(x.subject), x.kind === "csr" ? "—" : x.issuer.find((r) => r.name === "CN")?.value ?? A.dnString(x.issuer), x.isCA ? "CA" : x.kind === "csr" ? "CSR" : "leaf", `${x.keyAlg} ${x.keyBits ?? ""}`.trim(), st, link, bool(opts.verify) ? sigText(verdicts[i]) : "off"];
      });
      const chainOk = certs.every((x, i) => i === certs.length - 1 || x.kind === "csr" || A.dnKey(x.issuer) === A.dnKey(certs[i + 1].subject));
      const b64 = btoa(String.fromCharCode(...c.der));
      const derInfo = [
        `Block:        ${idx + 1} of ${certs.length} (${blocks[idx].label}, PEM line ${blocks[idx].line})`,
        `DER size:     ${c.der.length} bytes`,
        `TBS size:     ${c.tbs.length} bytes`,
        `Signature:    ${c.signature.length} bytes`,
        `Base64:       ${b64.length} chars`,
        "",
        "DER (first 256 bytes):",
        ...Array.from({ length: Math.ceil(Math.min(256, c.der.length) / 16) }, (_, r) => {
          const row = c.der.subarray(r * 16, r * 16 + 16);
          return `${(r * 16).toString(16).padStart(4, "0")}  ${Array.from(row, (x) => x.toString(16).padStart(2, "0")).join(" ").padEnd(47)}  ${Array.from(row, (x) => (x >= 32 && x < 127 ? String.fromCharCode(x) : ".")).join("")}`;
        }),
        "",
        `-----BEGIN ${c.kind === "csr" ? "CERTIFICATE REQUEST" : "CERTIFICATE"}-----`,
        ...(b64.match(/.{1,64}/g) ?? []),
        `-----END ${c.kind === "csr" ? "CERTIFICATE REQUEST" : "CERTIFICATE"}-----`,
      ].join("\n");
      const text = [
        ...summary.filter(([k]) => !k.startsWith("  ")).map(([k, v]) => `${k.padEnd(20)} ${v}`),
        "",
        "Extensions:",
        ...c.extensions.map((x) => `  ${x.name}${x.critical ? " (critical)" : ""}: ${x.value}`),
        ...(certs.length > 1 ? ["", "Chain:", ...chainRows.map((r) => `  ${r[0]}. ${r[1]} ← ${r[2]} · ${r[5]} · ${r[6]}${bool(opts.verify) ? ` · ${r[7]}` : ""}`)] : []),
      ].join("\n");
      const expiredAny = certs.some((x) => x.kind === "certificate" && now > x.notAfter!);
      const views: View[] = [
        { label: "Summary", out: { kind: "table", columns: ["field", "value"], rows: summary } },
        { label: `Extensions (${c.extensions.length})`, out: c.extensions.length ? { kind: "table", columns: ["extension", "critical", "value", "OID"], rows: extRows } : { kind: "status", ok: true, title: "No extensions", detail: c.version < 3 ? "Version 1/2 certificates carry no extensions." : "" } },
      ];
      if (certs.length > 1) views.push({ label: `Chain (${certs.length})`, out: { kind: "table", columns: ["#", "subject CN", "issuer CN", "role", "key", "validity", "link", "signature"], rows: chainRows } });
      views.push(
        { label: "Status", out: { kind: "status", ok: c.kind === "csr" || (status === "Valid" && chainOk && !verdicts.includes(false)), title: c.kind === "csr" ? "Certificate signing request" : `${status}${expiredAny && status === "Valid" ? " (another certificate in the chain is expired)" : ""}${!chainOk ? " — chain order broken" : ""}`, detail: c.kind === "csr" ? `Requests ${dn(c.subject)}${c.san.length ? `\nSANs: ${c.san.join(", ")}` : ""}` : `${c.notBefore!.toUTCString()} → ${c.notAfter!.toUTCString()}\nChecked at ${now.toUTCString()}` } },
        { label: "ASN.1 tree", out: { kind: "tree", value: c.tree } },
        { label: "PEM / DER", out: { kind: "text", text: derInfo } },
        { label: "Text", out: { kind: "text", text } }
      );
      return { text, views, notes: certs.length > 1 && idx === 0 ? [`${certs.length} certificates found — use "Show certificate #" to inspect the others.`] : undefined };
    },
    examples: [], // set below (the PEMs load lazily)
    steps: ["Paste a PEM certificate, a whole chain, a CSR or raw Base64 DER.", "Summary shows subject, issuer, validity, key, SANs and fingerprints.", "Chain checks that each issuer matches the next subject and verifies signatures.", "Explore every byte in the ASN.1 tree."],
  },

  "security-header-helper": {
    inputs: [
      { id: "headers", label: "Response headers to analyze", lang: "text", placeholder: "HTTP/2 200\ncontent-security-policy: …\nstrict-transport-security: …" },
      { id: "config", label: "Builder state (JSON)", lang: "json", rows: 6 },
    ],
    options: [
      { id: "mode", label: "Mode", type: "segment", choices: [["build", "Build"], ["analyze", "Analyze"]], default: "build" },
      { id: "format", label: "Output", type: "select", choices: [["raw", "Raw headers"], ["nginx", "nginx"], ["apache", "Apache .htaccess"], ["caddy", "Caddy"], ["express", "Express + helmet"], ["next", "Next.js headers()"], ["vercel", "vercel.json"], ["netlify", "Netlify _headers"], ["cloudflare", "Cloudflare Pages _headers"], ["iis", "IIS web.config"]], default: "raw", show: (o) => o.mode !== "analyze" },
    ],
    custom: () => import("./ui/D-SecurityHeaders"),
    layout: "stack",
    async run({ inputs, opts }) {
      const Hd = await import("./lib/D-headers");
      if (str(opts.mode) === "analyze") {
        if (!inputs.headers.trim()) throw new ToolError("Paste response headers (from DevTools → Network, or curl -I https://…).");
        const r = Hd.analyze(inputs.headers);
        if (!r.count) throw new ToolError("No headers found. Paste lines like \"Content-Security-Policy: default-src 'self'\".");
        const lines = r.checks.map((c) => `${c.status === "pass" ? "✓" : c.status === "fail" ? "✗" : c.status === "warn" ? "!" : "i"} ${c.header}: ${c.message}${c.fix ? `\n    → ${c.fix}` : ""}`);
        const text = `Grade ${r.grade} (${r.score}/100)${r.status ? ` · ${r.status}` : ""}\n\n${lines.join("\n")}`;
        const tone = (g: string) => (g.startsWith("A") ? "ok" : g === "B" || g === "C" ? "warn" : "bad") as "ok" | "warn" | "bad";
        return {
          text,
          views: [
            { label: `Grade ${r.grade}`, out: { kind: "stats", items: [{ label: "Grade", value: r.grade, tone: tone(r.grade) }, { label: "Score", value: `${r.score}/100`, tone: tone(r.grade) }, { label: "Passed", value: r.checks.filter((c) => c.status === "pass").length, tone: "ok" }, { label: "Warnings", value: r.checks.filter((c) => c.status === "warn").length, tone: "warn" }, { label: "Failed", value: r.checks.filter((c) => c.status === "fail").length, tone: "bad" }, { label: "Headers seen", value: r.count }] } },
            { label: "Checks", out: { kind: "table", columns: ["header", "result", "points", "value", "finding", "recommendation"], rows: r.checks.map((c) => [c.header, c.status, c.max ? `${c.points}/${c.max}` : c.points ? String(c.points) : "", c.value.length > 80 ? c.value.slice(0, 77) + "…" : c.value, c.message, c.fix ?? ""]) } },
            { label: "Issues", out: { kind: "issues", items: r.checks.map((c) => ({ level: c.status === "pass" ? "ok" : c.status === "fail" ? "error" : c.status === "warn" ? "warning" : "info", message: `${c.header}: ${c.message}${c.fix ? ` → ${c.fix}` : ""}` })) } },
            { label: "Report", out: { kind: "text", text } },
          ],
        };
      }
      const cfg = Hd.parseConfig(inputs.config);
      const out = Hd.render(cfg, str(opts.format));
      const { headers, notes } = Hd.buildHeaders(cfg);
      const self = Hd.analyze(headers.map(([k, v]) => `${k}: ${v}`).join("\n"));
      return {
        text: out.text,
        lang: out.lang,
        filename: out.filename,
        notes: notes.length ? notes : undefined,
        views: [
          { label: out.filename, out: { kind: "text", text: out.text, lang: out.lang } },
          { label: `Headers (${headers.length})`, out: { kind: "table", columns: ["header", "value"], rows: headers } },
          { label: `Self-check: ${self.grade}`, out: { kind: "table", columns: ["header", "result", "finding"], rows: self.checks.map((c) => [c.header, c.status, c.message]) } },
        ],
      };
    },
    examples: [], // set below
    steps: ["Build: pick a preset, then tune CSP directives, HSTS, framing, referrer, permissions, isolation and CORS.", "Choose the output — raw headers, nginx, Apache, Caddy, Express/helmet, Next.js, Vercel, Netlify, Cloudflare or IIS.", "Analyze: paste real response headers (DevTools or curl -I) to get a grade with fixes."],
  },
};

/* ── examples that need the lazily-built samples ─────────────────────── */

const presetJson = (id: keyof typeof PRESETS) => JSON.stringify(PRESETS[id].cfg, null, 1);

const GOOD_HEADERS = `HTTP/2 200
content-type: text/html; charset=utf-8
content-security-policy: default-src 'self'; script-src 'self' 'nonce-r4nd0m'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests
strict-transport-security: max-age=63072000; includeSubDomains; preload
x-content-type-options: nosniff
referrer-policy: strict-origin-when-cross-origin
permissions-policy: camera=(), microphone=(), geolocation=(), payment=()
cross-origin-opener-policy: same-origin
cross-origin-resource-policy: same-origin
set-cookie: __Host-session=abc123; Path=/; Secure; HttpOnly; SameSite=Lax`;

const TYPICAL_HEADERS = `HTTP/1.1 200 OK
Server: nginx/1.18.0 (Ubuntu)
Date: Thu, 24 Sep 2026 08:00:00 GMT
Content-Type: text/html; charset=UTF-8
X-Powered-By: PHP/7.4.3
Strict-Transport-Security: max-age=86400
X-Frame-Options: SAMEORIGIN
X-XSS-Protection: 1; mode=block
Set-Cookie: PHPSESSID=9f1c2b; path=/
Set-Cookie: remember_me=1; expires=Fri, 24 Sep 2027 08:00:00 GMT; path=/; secure`;

const API_HEADERS = `< HTTP/2 200
< content-type: application/json
< access-control-allow-origin: *
< access-control-allow-credentials: true
< access-control-allow-headers: Authorization, Content-Type
< x-content-type-options: nosniff
< cache-control: no-store
< content-security-policy-report-only: default-src 'self'; report-uri /csp`;

specs["security-header-helper"].examples = [
  { label: "SPA (build)", inputs: { config: presetJson("spa") }, opts: { mode: "build", format: "raw" }, note: "The default preset: nonce-based CSP with strict-dynamic, HSTS, framing off, permissions locked down." },
  { label: "Strict → nginx", inputs: { config: presetJson("strict") }, opts: { mode: "build", format: "nginx" }, note: "Everything same-origin, cross-origin isolated, HSTS preload — as nginx add_header … always lines." },
  { label: "API + CORS → Express", inputs: { config: presetJson("api") }, opts: { mode: "build", format: "express" }, note: "A JSON API with an origin allow-list and credentials, as helmet + cors middleware." },
  { label: "Legacy → Netlify", inputs: { config: presetJson("legacy") }, opts: { mode: "build", format: "netlify" }, note: "Report-only CSP for an app with inline scripts; Netlify _headers file." },
  { label: "Strict → Next.js", inputs: { config: presetJson("strict") }, opts: { mode: "build", format: "next" } },
  { label: "Analyze: A+ site", inputs: { headers: GOOD_HEADERS }, opts: { mode: "analyze" }, note: "A hardened response: nonce CSP, 2-year HSTS with preload, isolation headers and a __Host- cookie." },
  { label: "Analyze: typical PHP site", inputs: { headers: TYPICAL_HEADERS }, opts: { mode: "analyze" }, note: "Version leaks, a one-day HSTS, no CSP and cookies without Secure/HttpOnly/SameSite." },
  { label: "Analyze: curl -v API", inputs: { headers: API_HEADERS }, opts: { mode: "analyze" }, note: "curl -v output (< prefixes are fine): wildcard CORS with credentials and a report-only CSP." },
];

specs["x509-viewer"].examples = [
  { label: "Chain (leaf → root)", inputs: { pem: DEMO_CHAIN }, note: "A 3-certificate chain: EC P-256 leaf with SANs, SCTs, AIA and CRL points → EC P-384 issuing CA → RSA root. Signatures verified link by link." },
  { label: "Intermediate CA", inputs: { pem: DEMO_CHAIN }, opts: { index: 2 }, note: "Certificate #2 of the chain: CA:TRUE with pathlen 0, keyCertSign/cRLSign, anyPolicy." },
  { label: "ISRG Root X1", inputs: { pem: ISRG_ROOT_X1 }, note: "Let's Encrypt's public root: RSA 4096, self-signed, valid until 2035." },
  { label: "Self-signed dev cert", inputs: { pem: SELF_SIGNED }, note: "A localhost certificate: SANs for localhost, app.test, 127.0.0.1 and ::1; subject with ST, L, OU and emailAddress." },
  { label: "Ed25519", inputs: { pem: ED25519_CERT }, note: "An Ed25519 key and signature, with DC and serialNumber attributes in the subject." },
  { label: "CSR", inputs: { pem: CSR }, note: "A PKCS#10 request: the SANs and key usages it asks for, and its self-signature." },
  { label: "Expired", inputs: { pem: EXPIRED }, note: "Valid 2023-01-15 → 2024-01-15: the status shows how long ago it expired." },
  { label: "Check a future date", inputs: { pem: DEMO_CHAIN }, opts: { at: "2032-01-01" }, note: "Validity at a chosen date: by 2032 the leaf and issuing CA have expired." },
  { label: "Truncated PEM", inputs: { pem: DEMO_CHAIN.slice(0, 900) }, note: "A copy-paste that lost its END line.", error: true },
];

export default specs;

export type { Result };
