import {
  b64decode,
  b64encode,
  blobOf,
  decodeBytes,
  encodeText,
  fmtSize,
  hex2,
  hexdump,
  hexFormat,
  HEX_SEP_CHOICES,
  imageSize,
  objectUrl,
  showChar,
  sniff,
  utf8Encode,
  utf8Error,
  utf8Strict,
  where,
  type Charset,
} from "./lib/A-bytes";
import { decodeEntities, entityName } from "./lib/A-entities";
import * as FX from "./lib/A-fixtures";
import { ToolError, bool, num, str, type Result, type SpecModule, type View } from "./types";

/* ── shared ──────────────────────────────────────────────────────────── */

type Stat = { label: string; value: string | number; tone?: "ok" | "warn" | "bad" | "info" };
const stats = (label: string, items: Stat[]): View => ({ label, out: { kind: "stats", items } });

const b64Text = (s: string, cs: Charset = "utf8") => b64encode(encodeText(s, cs));
const dataUrl = (mime: string, b64: string) => `data:${mime};base64,${b64}`;
const fromB64 = (s: string) => b64decode(s).bytes;

function need(src: string, what: string) {
  if (!src.trim()) throw new ToolError(what);
}

/** Revoke the previous blob URL a tool handed out, so repeated runs don't leak. */
const liveUrls = new Map<string, string>();
function freshUrl(slot: string, bytes: Uint8Array, mime: string) {
  const old = liveUrls.get(slot);
  if (old?.startsWith("blob:")) URL.revokeObjectURL(old);
  const u = objectUrl(bytes, mime);
  liveUrls.set(slot, u);
  return u;
}

function b64Notes(d: ReturnType<typeof b64decode>): string[] {
  const n: string[] = [];
  if (d.dataUrl) n.push(`Stripped a data: URL prefix (${d.dataUrl.mime}).`);
  if (d.mixed) n.push("The input mixes the standard (+ /) and URL-safe (- _) alphabets — it was probably assembled from two sources.");
  else if (d.urlSafe) n.push("URL-safe alphabet detected (- and _ instead of + and /).");
  if (d.missingPad) n.push(`Padding was missing; ${d.missingPad} "=" assumed.`);
  if (d.whitespace) n.push(`Ignored ${d.whitespace} whitespace character(s) — line breaks from MIME/PEM wrapping are fine.`);
  return n;
}

function infoItems(d: ReturnType<typeof b64decode>, src: string): Stat[] {
  return [
    { label: "Decoded bytes", value: d.bytes.length, tone: "info" },
    { label: "Base64 characters", value: (d.dataUrl ? src.slice(src.indexOf(",") + 1) : src).replace(/\s/g, "").length },
    { label: "Alphabet", value: d.mixed ? "Mixed" : d.urlSafe ? "URL-safe" : "Standard" },
    { label: "Padding", value: d.padded ? "Present" : d.missingPad ? `Missing (${d.missingPad})` : "Not needed", tone: d.missingPad ? "warn" : undefined },
  ];
}

/** A pixelated, enlarged copy of a small image — icons are hard to judge at 1×. */
function zoomView(url: string, dims: { w: number; h: number } | null): View[] {
  if (!dims || !dims.w || !dims.h || Math.max(dims.w, dims.h) >= 128) return [];
  const k = Math.max(2, Math.floor(256 / Math.max(dims.w, dims.h)));
  const checker = "background:#fff;background-image:linear-gradient(45deg,#eee 25%,transparent 25%),linear-gradient(-45deg,#eee 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#eee 75%),linear-gradient(-45deg,transparent 75%,#eee 75%);background-size:16px 16px;background-position:0 0,0 8px,8px -8px,-8px 0";
  return [
    {
      label: `Zoom ${k}×`,
      out: { kind: "html", html: `<div style="display:inline-block;padding:8px;border-radius:6px;${checker}"><img src="${url}" width="${Math.round(dims.w * k)}" height="${Math.round(dims.h * k)}" style="image-rendering:pixelated;display:block" alt="Enlarged preview"></div><p>${dims.w} × ${dims.h} px, shown at ${k}×</p>` },
    },
  ];
}

/** Parse a URL-ish string into rows for the URL parts and query tables. */
function urlViews(s: string): View[] {
  const t = s.trim();
  if (!t || /\s/.test(t) || !/^[a-z][a-z0-9+.-]*:/i.test(t)) return [];
  let u: URL;
  try {
    u = new URL(t);
  } catch {
    return [];
  }
  const dec = (x: string) => {
    try {
      return decodeURIComponent(x);
    } catch {
      return x;
    }
  };
  const rows: [string, string][] = [
    ["protocol", u.protocol],
    ["origin", u.origin === "null" ? "(opaque)" : u.origin],
    ["username", u.username ? dec(u.username) : ""],
    ["password", u.password ? "•".repeat(Math.min(8, u.password.length)) : ""],
    ["hostname", u.hostname],
    ["port", u.port || (({ "http:": "80 (default)", "https:": "443 (default)", "ftp:": "21 (default)", "ws:": "80 (default)", "wss:": "443 (default)" } as Record<string, string>)[u.protocol] ?? "")],
    ["pathname", u.pathname],
    ["path (decoded)", dec(u.pathname)],
    ["search", u.search],
    ["hash", u.hash ? `${u.hash}  →  ${dec(u.hash)}` : ""],
  ];
  u.pathname.split("/").filter(Boolean).forEach((seg, i) => rows.push([`segment ${i + 1}`, dec(seg)]));
  const views: View[] = [{ label: "URL parts", out: { kind: "table", columns: ["part", "value"], rows: rows.filter((r) => r[1] !== "") } }];
  const params = [...u.searchParams.entries()];
  if (params.length) {
    const raw = u.search.slice(1).split("&");
    views.push({ label: `Query (${params.length})`, out: { kind: "table", columns: ["key", "value (decoded)", "raw"], rows: params.map(([k, v], i) => [k, v, raw[i] ?? ""]) } });
  }
  return views;
}

/* ── URL encoding ────────────────────────────────────────────────────── */

const KEEP: Record<string, RegExp> = {
  component: /[A-Za-z0-9\-_.!~*'()]/,
  uri: /[A-Za-z0-9\-_.!~*'();/?:@&=+$,#]/,
  form: /[A-Za-z0-9*\-._]/,
  path: /[A-Za-z0-9\-._~!$&'()*+,;=:@]/,
  strict: /[A-Za-z0-9\-._~]/,
  all: /(?!)/,
};

function pctEncode(s: string, mode: string, lower: boolean, keepPct: boolean, base = 0, whole = s): { out: string; count: number } {
  const keep = KEEP[mode] ?? KEEP.component;
  let out = "";
  let count = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const code = s.charCodeAt(i);
    if (keepPct && c === "%" && /^[0-9a-fA-F]{2}$/.test(s.slice(i + 1, i + 3))) {
      out += s.slice(i, i + 3);
      i += 2;
      continue;
    }
    if (keep.test(c)) {
      out += c;
      continue;
    }
    if (mode === "form" && c === " ") {
      out += "+";
      count++;
      continue;
    }
    let cp = code;
    if (code >= 0xd800 && code <= 0xdbff) {
      const lo = s.charCodeAt(i + 1);
      if (!(lo >= 0xdc00 && lo <= 0xdfff)) throw new ToolError(`Lone high surrogate U+${code.toString(16).toUpperCase()} at ${where(whole, base + i)} — it cannot be encoded as UTF-8. The text was probably cut in the middle of an emoji.`);
      cp = s.codePointAt(i)!;
      i++;
    } else if (code >= 0xdc00 && code <= 0xdfff) throw new ToolError(`Lone low surrogate U+${code.toString(16).toUpperCase()} at ${where(whole, base + i)} — it cannot be encoded as UTF-8.`);
    for (const b of utf8Encode(String.fromCodePoint(cp))) out += "%" + (lower ? hex2(b) : hex2(b).toUpperCase());
    count++;
  }
  return { out, count };
}

type Piece = { lit?: string; bytes?: number[]; pos: number[] };

function pctDecode(s: string, plus: boolean, lenient: boolean): string {
  const pieces: Piece[] = [];
  let cur: Piece | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "%") {
      const h = s.slice(i + 1, i + 3);
      if (/^[0-9a-fA-F]{2}$/.test(h)) {
        if (!cur || !cur.bytes) {
          cur = { bytes: [], pos: [] };
          pieces.push(cur);
        }
        cur.bytes!.push(parseInt(h, 16));
        cur.pos.push(i);
        i += 2;
        continue;
      }
      if (!lenient)
        throw new ToolError(`Malformed escape "%${s.slice(i + 1, i + 3).replace(/\n.*/s, "")}" at ${where(s, i)}: "%" must be followed by two hex digits. A literal percent sign is written %25 (turn on Lenient to keep it as-is).`);
    }
    const ch = c === "+" && plus ? " " : c;
    if (!cur || cur.bytes) {
      cur = { lit: "", pos: [] };
      pieces.push(cur);
    }
    cur.lit += ch;
  }
  let out = "";
  for (const p of pieces) {
    if (p.lit !== undefined) {
      out += p.lit;
      continue;
    }
    const b = Uint8Array.from(p.bytes!);
    const err = utf8Error(b);
    if (err && !lenient) {
      const at = p.pos[err.at];
      const seq = p.bytes!.slice(Math.max(0, err.at - 1), err.at + 2).map((x) => "%" + hex2(x).toUpperCase()).join("");
      throw new ToolError(`Invalid UTF-8 at ${where(s, at)} (${seq}): ${err.why}. The text was probably percent-encoded from Latin-1/Windows-1252 — turn on Lenient to substitute U+FFFD.`);
    }
    out += new TextDecoder().decode(b);
  }
  return out;
}

/* ── HTML entities ───────────────────────────────────────────────────── */

function entityFor(cp: number, format: string): string {
  if (format === "named") {
    const n = entityName(cp);
    if (n) return `&${n};`;
    return `&#${cp};`;
  }
  return format === "hex" ? `&#x${cp.toString(16).toUpperCase()};` : `&#${cp};`;
}

/* ── specs ───────────────────────────────────────────────────────────── */

const PNG_RING_URL = dataUrl("image/png", FX.PNG_RING);
const SVG_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect x="4" y="4" width="56" height="56" rx="12" fill="#0088b0"/><path d="M20 34l8 8 16-18" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const SVG_URL = dataUrl("image/svg+xml", b64Text(SVG_ICON));
const JPEG_URL = dataUrl("image/jpeg", FX.JPEG_GRADIENT);
const PDF_TRUNCATED = (() => {
  const b = fromB64(FX.PDF_HELLO);
  return b64encode(b.subarray(0, b.length - 180));
})();
const MIME_TEXT = `Dear Ada,

Thank you for the analytical engine notes. The figures in section G are correct, and the Bernoulli table now runs end to end.

— Charles`;

const HEX_OPTS = [
  { id: "sep", label: "Separator", type: "select" as const, choices: HEX_SEP_CHOICES, default: "space" },
  { id: "case", label: "Case", type: "segment" as const, choices: [["lower", "abc"], ["upper", "ABC"]] as [string, string][], default: "lower" },
  { id: "per", label: "Bytes / line", type: "number" as const, default: 16, min: 0, max: 1024, hint: "0 keeps everything on one line" },
];

const specs: SpecModule = {
  "base64-encoder": {
    inputs: [
      { id: "text", label: "Text", lang: "text", wrap: true, placeholder: "Type or paste text to encode" },
      { id: "file", label: "…or encode a file", kind: "file", read: "base64", placeholder: "Drop any file — when set, it wins over the text" },
    ],
    options: [
      { id: "alphabet", label: "Alphabet", type: "segment", choices: [["std", "Standard"], ["url", "URL-safe"]], default: "std", hint: "URL-safe swaps + / for - _ (JWTs, filenames, query strings)" },
      { id: "pad", label: "Padding =", type: "toggle", default: true },
      { id: "wrap", label: "Wrap", type: "select", choices: [["0", "None"], ["64", "64 (PEM)"], ["76", "76 (MIME)"]], default: "0" },
      { id: "charset", label: "Text as", type: "select", choices: [["utf8", "UTF-8"], ["latin1", "Latin-1"], ["utf16le", "UTF-16LE"]], default: "utf8", hint: "How the text becomes bytes before encoding" },
      { id: "dataurl", label: "Data URL", type: "toggle", default: false },
    ],
    run({ inputs, opts }) {
      const file = inputs.file ?? "";
      const notes: string[] = [];
      let bytes: Uint8Array;
      let mime = "text/plain;charset=utf-8";
      let source: string;
      if (file) {
        bytes = fromB64(file);
        const name = (inputs["file:name"] ?? "").split(" · ")[0];
        mime = sniff(bytes)?.mime ?? "application/octet-stream";
        source = name || "file";
        if (inputs.text?.trim()) notes.push("Encoding the file — the text box is ignored while a file is loaded.");
      } else {
        const cs = str(opts.charset, "utf8") as Charset;
        bytes = encodeText(inputs.text ?? "", cs);
        if (cs !== "utf8") mime = cs === "latin1" ? "text/plain;charset=iso-8859-1" : "text/plain;charset=utf-16le";
        source = `text (${cs === "utf8" ? "UTF-8" : cs === "latin1" ? "Latin-1" : "UTF-16LE"})`;
      }
      const url = opts.alphabet === "url";
      const wrap = Number(opts.wrap) || 0;
      const du = bool(opts.dataurl);
      if (du && wrap) notes.push("Line wrap is not applied to data URLs — a line break would break the URL.");
      const b64 = b64encode(bytes, { url, pad: bool(opts.pad), wrap: du ? 0 : wrap });
      const text = du ? dataUrl(mime, b64encode(bytes, { url, pad: bool(opts.pad) })) : b64;
      const padChars = (b64.match(/=/g) ?? []).length;
      return {
        text,
        filename: file ? `${source}.b64.txt` : "encoded.b64.txt",
        notes,
        views: [
          { label: "Base64", out: { kind: "text", text, wrap: !wrap || du } },
          stats("Stats", [
            { label: "Source", value: source },
            { label: "Bytes in", value: bytes.length },
            { label: "Characters out", value: text.length, tone: "info" },
            { label: "Size ratio", value: bytes.length ? `${(text.length / bytes.length).toFixed(3)}×` : "—", tone: "warn" },
            { label: "Padding chars", value: padChars },
            { label: "Lines", value: text.split("\n").length },
          ]),
        ],
      };
    },
    examples: [
      { label: "Hello, world!", inputs: { text: "Hello, world!" }, note: "13 bytes → 20 characters: every 3 bytes become 4 characters, padded with =." },
      { label: "Unicode (UTF-8)", inputs: { text: "Grüße aus Zürich 👋 — naïve café" }, note: "Non-ASCII characters take 2–4 bytes each in UTF-8 before encoding." },
      { label: "URL-safe, unpadded", inputs: { text: '{"sub":"1234567890","name":"Ada","admin":true}' }, opts: { alphabet: "url", pad: false }, note: "The Base64URL form JWT segments and many URL tokens use." },
      { label: "MIME, wrapped at 76", inputs: { text: MIME_TEXT }, opts: { wrap: "76" }, note: "Email bodies (RFC 2045) wrap Base64 at 76 characters per line." },
      { label: "PowerShell -EncodedCommand", inputs: { text: 'Write-Host "Hello from PowerShell"; Get-Date' }, opts: { charset: "utf16le" }, note: "powershell -EncodedCommand expects UTF-16LE bytes, not UTF-8." },
      { label: "Latin-1 bytes", inputs: { text: "Café crème, £5, 25°C" }, opts: { charset: "latin1" }, note: "One byte per character — shorter than UTF-8, but only covers U+0000–U+00FF." },
      { label: "File → data URL", inputs: { text: "", file: FX.PNG_RING, "file:name": "ring.png · 205 B" }, opts: { dataurl: true }, note: "A dropped file wins over the text; Data URL adds the sniffed MIME type." },
    ],
    steps: ["Type text or drop a file (the file wins when both are set).", "Pick the alphabet, padding and line wrap your target expects.", "Choose how text becomes bytes: UTF-8 almost always, UTF-16LE for PowerShell.", "Copy the result, or turn on Data URL to embed it directly."],
  },

  "base64-decoder": {
    inputs: [{ id: "b64", label: "Base64", lang: "text", wrap: true, placeholder: "Paste Base64, Base64URL or a data: URL — whitespace and missing padding are fine" }],
    options: [
      { id: "show", label: "Show as", type: "segment", choices: [["auto", "Auto"], ["text", "Text"], ["hex", "Hex dump"]], default: "auto" },
      { id: "charset", label: "Text encoding", type: "select", choices: [["utf8", "UTF-8"], ["latin1", "Latin-1"], ["utf16le", "UTF-16LE"], ["utf16be", "UTF-16BE"]], default: "utf8" },
    ],
    run({ inputs, opts }) {
      const src = inputs.b64 ?? "";
      need(src, "Paste some Base64 to decode.");
      const d = b64decode(src);
      const bytes = d.bytes;
      const notes = b64Notes(d);
      const magic = sniff(bytes) ?? (d.dataUrl && !/^text\//.test(d.dataUrl.mime) ? { mime: d.dataUrl.mime, ext: d.dataUrl.mime.split("/")[1]?.split("+")[0] ?? "bin", label: d.dataUrl.mime } : null);
      const textual = !magic || /json|xml|html|svg/.test(magic.mime);
      const cs = str(opts.charset, "utf8") as Charset;
      const show = str(opts.show, "auto");
      let decoded: string | null = null;
      if (show !== "hex" && (textual || show === "text")) {
        if (cs === "utf8") {
          decoded = utf8Strict(bytes);
          if (decoded === null) {
            const e = utf8Error(bytes)!;
            if (show === "text") {
              decoded = new TextDecoder().decode(bytes);
              notes.push(`Not valid UTF-8 (byte ${e.at + 1}: ${e.why}); invalid bytes shown as U+FFFD. Try Latin-1.`);
            } else notes.push(`The bytes are not valid UTF-8 (byte ${e.at + 1}: ${e.why}), so they are shown as a hex dump. Pick Latin-1 or UTF-16 if this is text in another encoding.`);
          }
        } else decoded = decodeBytes(bytes, cs, false);
      }
      const dump = hexdump(bytes);
      const views: View[] = [];
      if (decoded !== null) views.push({ label: "Decoded", out: { kind: "text", text: decoded, lang: magic?.ext === "json" ? "json" : magic?.ext === "svg" || magic?.ext === "xml" ? "xml" : magic?.ext === "html" ? "html" : "text", wrap: true } });
      else views.push({ label: "Hex dump", out: { kind: "text", text: dump } });
      const dims = magic?.image ? imageSize(bytes, magic.mime) : null;
      if (magic?.image) {
        const u = dataUrl(magic.mime, b64encode(bytes));
        views.push({ label: "Image", out: { kind: "image", src: u, name: `decoded.${magic.ext}` } }, ...zoomView(u, dims));
      }
      if (magic?.mime === "application/pdf") views.push({ label: "PDF", out: { kind: "pdf", src: freshUrl("b64pdf", bytes, "application/pdf") } });
      if (decoded !== null) views.push({ label: "Hex dump", out: { kind: "text", text: dump } });
      views.push(
        stats("Info", [
          ...infoItems(d, src),
          { label: "Detected type", value: magic ? magic.label : decoded !== null ? "Text" : "Binary (unknown)", tone: "ok" },
          ...(dims ? [{ label: "Dimensions", value: `${dims.w} × ${dims.h}` }] : []),
          ...(d.dataUrl ? [{ label: "Data URL type", value: d.dataUrl.mime }] : []),
        ])
      );
      const binary = decoded === null;
      return {
        text: binary ? dump : decoded!,
        views,
        notes,
        blob: binary || !textual ? blobOf(bytes, magic?.mime ?? "application/octet-stream") : undefined,
        filename: magic ? `decoded.${magic.ext}` : binary ? "decoded.bin" : "decoded.txt",
      };
    },
    examples: [
      { label: "Hello, world!", inputs: { b64: "SGVsbG8sIHdvcmxkIQ==" } },
      { label: "UTF-8 text", inputs: { b64: b64Text("Grüße aus Zürich 👋 — naïve café") }, note: "Multi-byte UTF-8 sequences decode back to accented letters and emoji." },
      { label: "JWT segment (URL-safe)", inputs: { b64: "eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ" }, note: "URL-safe alphabet and missing padding are detected automatically." },
      { label: "MIME-wrapped email", inputs: { b64: b64encode(utf8Encode(MIME_TEXT), { wrap: 76 }) }, note: "Line breaks from 76-column wrapping are ignored." },
      { label: "PNG data URL", inputs: { b64: PNG_RING_URL }, note: "Magic bytes say PNG: open the Image tab; Download saves decoded.png." },
      { label: "PDF", inputs: { b64: FX.PDF_HELLO }, note: "Detected as a PDF — preview it in the PDF tab." },
      { label: "GZIP (binary)", inputs: { b64: FX.GZIP_LOG }, note: "Not text: shown as a hex dump; 1f 8b is the gzip signature. Download saves decoded.gz." },
      { label: "Latin-1 bytes", inputs: { b64: b64Text("Café crème, £5", "latin1") }, opts: { charset: "latin1" }, note: "0xE9 is é in Latin-1 but invalid alone in UTF-8 — switch Text encoding to UTF-8 to see the difference." },
      { label: "Invalid character", inputs: { b64: "SGVsbG8*IHdvcmxkIQ==" }, note: "The error names the offending character and its position.", error: true },
    ],
  },

  "base64-image-converter": {
    inputs: [
      { id: "file", label: "Image file", kind: "file", read: "dataurl", accept: "image/*,.svg,.ico", placeholder: "Drop an image: PNG, JPEG, GIF, WebP, SVG, ICO, AVIF…" },
      { id: "b64", label: "Base64 or data URL (Base64 → image)", lang: "text", wrap: true, rows: 6, placeholder: "data:image/png;base64,iVBORw0… or raw Base64" },
    ],
    options: [
      { id: "mode", label: "Mode", type: "segment", choices: [["toData", "File → data URL"], ["toImage", "Base64 → image"]], default: "toData" },
      { id: "snippet", label: "Copy as", type: "select", choices: [["dataurl", "Data URL"], ["base64", "Raw Base64"], ["css", "CSS background"], ["html", "HTML <img>"], ["md", "Markdown"]], default: "dataurl", show: (o) => o.mode !== "toImage" },
      { id: "alt", label: "Alt text", type: "text", default: "", placeholder: "for <img> / Markdown", show: (o) => o.mode !== "toImage" },
    ],
    run({ inputs, opts }) {
      const file = inputs.file ?? "";
      const pasted = inputs.b64 ?? "";
      const notes: string[] = [];
      let mode = str(opts.mode, "toData");
      if (mode === "toData" && !file && pasted.trim()) {
        mode = "toImage";
        notes.push("No file loaded — decoding the pasted Base64 instead.");
      } else if (mode === "toImage" && !pasted.trim() && file) {
        mode = "toData";
        notes.push("Nothing pasted — encoding the loaded file instead.");
      }
      const src = mode === "toData" ? file : pasted;
      need(src, mode === "toData" ? "Drop an image file (or switch to Base64 → image and paste a data URL)." : "Paste Base64 or a data:image/… URL.");
      const d = b64decode(src);
      const bytes = d.bytes;
      const magic = sniff(bytes);
      const declared = d.dataUrl?.mime;
      if (!magic?.image) {
        const what = magic ? `a ${magic.label}` : utf8Strict(bytes) !== null ? `${bytes.length} bytes of text (“${new TextDecoder().decode(bytes.subarray(0, 40))}${bytes.length > 40 ? "…" : ""}”)` : `${bytes.length} bytes of unknown binary (starts ${Array.from(bytes.subarray(0, 8), hex2).join(" ")})`;
        throw new ToolError(`That decodes to ${what}, not an image. Supported: PNG, JPEG, GIF, WebP, BMP, ICO, AVIF and SVG.`);
      }
      if (declared && declared !== magic.mime) notes.push(`The data URL says ${declared} but the bytes are ${magic.label} — using ${magic.mime}.`);
      const b64 = b64encode(bytes);
      const url = dataUrl(magic.mime, b64);
      const dims = imageSize(bytes, magic.mime);
      const info = stats("Info", [
        { label: "MIME type", value: magic.mime, tone: "info" },
        { label: "Dimensions", value: dims ? `${dims.w} × ${dims.h}` : "unknown" },
        ...(dims?.extra ? [{ label: "Details", value: dims.extra }] : []),
        { label: "File size", value: fmtSize(bytes.length) },
        { label: "Data URL length", value: url.length },
        { label: "Overhead", value: `+${Math.round((url.length / bytes.length - 1) * 100)}%`, tone: "warn" },
      ]);
      if (mode === "toImage") {
        const name = `image.${magic.ext}`;
        return {
          text: url,
          blob: blobOf(bytes, magic.mime),
          filename: name,
          notes: [...notes, ...b64Notes(d).filter((n) => !n.startsWith("Stripped"))],
          views: [
            { label: "Image", out: { kind: "image", src: url, name, alt: "Decoded image" } },
            ...zoomView(url, dims),
            info,
            { label: "Hex", out: { kind: "text", text: hexdump(bytes, { limit: 512 }) } },
          ],
        };
      }
      const alt = str(opts.alt) || (inputs["file:name"] ?? "").split(" · ")[0].replace(/\.[a-z0-9]+$/i, "") || "image";
      const size = dims ? ` width="${dims.w}" height="${dims.h}"` : "";
      const snippets: Record<string, string> = {
        dataurl: url,
        base64: b64,
        css: `.image {\n  background-image: url("${url}");\n  background-repeat: no-repeat;\n  background-size: contain;${dims ? `\n  width: ${dims.w}px;\n  height: ${dims.h}px;` : ""}\n}`,
        html: `<img src="${url}" alt="${alt.replace(/"/g, "&quot;")}"${size}>`,
        md: `![${alt.replace(/[[\]]/g, "")}](${url})`,
      };
      const labels: Record<string, string> = { dataurl: "Data URL", base64: "Raw Base64", css: "CSS background", html: "HTML <img>", md: "Markdown" };
      const pick = str(opts.snippet, "dataurl");
      const all = Object.entries(snippets).map(([k, v]) => `── ${labels[k]} ──\n${v}`).join("\n\n");
      return {
        text: snippets[pick] ?? url,
        notes,
        filename: `image.${pick === "css" ? "css" : pick === "html" ? "html" : pick === "md" ? "md" : "txt"}`,
        views: [
          { label: labels[pick] ?? "Data URL", out: { kind: "text", text: snippets[pick] ?? url, wrap: true, lang: pick === "css" ? "css" : pick === "html" ? "html" : pick === "md" ? "markdown" : "text" } },
          { label: "Preview", out: { kind: "image", src: url, name: (inputs["file:name"] ?? "").split(" · ")[0] || `image.${magic.ext}`, alt } },
          ...zoomView(url, dims),
          info,
          { label: "All snippets", out: { kind: "text", text: all, wrap: true } },
        ],
      };
    },
    examples: [
      { label: "PNG → data URL", inputs: { file: PNG_RING_URL, "file:name": "ring.png · 205 B" }, note: "A 32×32 RGBA PNG; the Info tab reads dimensions straight from the IHDR header." },
      { label: "SVG → CSS", inputs: { file: SVG_URL, "file:name": "check.svg · 283 B" }, opts: { snippet: "css" }, note: "An SVG icon as a CSS background — no extra HTTP request." },
      { label: "JPEG → <img>", inputs: { file: JPEG_URL, "file:name": "gradient.jpg · 716 B" }, opts: { snippet: "html", alt: "Colour gradient" }, note: "Width and height come from the JPEG SOF marker, so the page doesn't reflow." },
      { label: "Markdown", inputs: { file: dataUrl("image/png", FX.PNG_CHECKER), "file:name": "checker.png · 97 B" }, opts: { snippet: "md", alt: "Checkerboard" }, note: "Embed a tiny image in a README without hosting it." },
      { label: "Base64 → image", inputs: { b64: FX.PNG_CHECKER }, opts: { mode: "toImage" }, note: "Raw Base64 without a prefix: the type is sniffed from the magic bytes. Download saves image.png." },
      { label: "GIF data URL", inputs: { b64: dataUrl("image/gif", FX.GIF_PIXEL) }, opts: { mode: "toImage" }, note: "The classic 1×1 transparent tracking pixel — 43 bytes." },
      { label: "Not an image", inputs: { b64: "SGVsbG8sIHdvcmxkIQ==" }, opts: { mode: "toImage" }, note: "Text is recognised and rejected with a clear message.", error: true },
    ],
    tips: ["Data URLs are about 33% larger than the file — inline only small images (icons, sprites under a few KB)."],
  },

  "base64-to-pdf": {
    inputs: [{ id: "b64", label: "Base64 PDF", lang: "text", wrap: true, placeholder: "JVBERi0xLj… or data:application/pdf;base64,…" }],
    options: [{ id: "name", label: "File name", type: "text", default: "document.pdf", width: 160 }],
    run({ inputs, opts }) {
      const src = inputs.b64 ?? "";
      need(src, "Paste a Base64-encoded PDF (it starts with JVBERi0 — that's %PDF- in Base64).");
      const d = b64decode(src);
      const bytes = d.bytes;
      const head = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
      if (!head.includes("%PDF-")) {
        const m = sniff(bytes);
        throw new ToolError(`Not a PDF: the data has no %PDF- header${m ? ` — it is a ${m.label}` : ""} (first bytes: ${Array.from(bytes.subarray(0, 8), hex2).join(" ") || "none"}). Base64 PDFs start with "JVBERi0".`);
      }
      return import("./lib/A-pdf").then(({ scanPdf }) => {
        const p = scanPdf(bytes);
        let name = str(opts.name).trim() || "document.pdf";
        if (!/\.pdf$/i.test(name)) name += ".pdf";
        const rows: [string, string][] = [
          ["PDF version", p.catalogVersion ? `${p.catalogVersion} (catalog overrides header ${p.version})` : p.version],
          ["Pages", p.pages == null ? "unknown" : String(p.pages)],
          ["Page size", p.pageSize ?? "—"],
          ...Object.entries(p.info).map(([k, v]) => [k, v] as [string, string]),
          ["File size", `${fmtSize(bytes.length)} (${bytes.length.toLocaleString()} bytes)`],
          ["Objects", String(p.objects)],
          ["Cross-reference", p.xref === "table" ? "classic xref table" : p.xref === "stream" ? "xref stream (PDF 1.5+)" : "missing"],
          ["Fonts", p.fonts.join(", ") || "none"],
          ["Images", String(p.images)],
          ["Encrypted", p.encrypted ? "yes" : "no"],
          ["Linearized (fast web view)", p.linearized ? "yes" : "no"],
          ["Forms / JavaScript", `${p.forms ? "AcroForm" : "no forms"} · ${p.javascript ? "contains JavaScript" : "no JavaScript"}`],
        ];
        const checks = [
          { level: "ok" as const, message: `Valid %PDF-${p.version} header${p.headerOffset ? ` at offset ${p.headerOffset}` : ""}` },
          ...(p.hasEof ? [{ level: "ok" as const, message: "Ends with %%EOF" }] : []),
          ...(p.xref !== "missing" ? [{ level: "ok" as const, message: `startxref points at a ${p.xref === "table" ? "cross-reference table" : "cross-reference stream"}` }] : []),
          ...p.warnings.map((w) => ({ level: "warning" as const, message: w })),
          ...(p.encrypted ? [{ level: "info" as const, message: "Encrypted: viewers may ask for a password; metadata strings are encrypted too." }] : []),
          ...(p.javascript ? [{ level: "warning" as const, message: "Contains JavaScript actions — open untrusted files with care." }] : []),
        ];
        const text = [`PDF ${p.version} · ${p.pages ?? "?"} page(s) · ${fmtSize(bytes.length)}`, ...rows.slice(3, 3 + Object.keys(p.info).length).map(([k, v]) => `${k}: ${v}`), ...p.warnings.map((w) => `warning: ${w}`)].join("\n");
        return {
          text,
          blob: blobOf(bytes, "application/pdf"),
          filename: name,
          notes: b64Notes(d),
          views: [
            { label: "Preview", out: { kind: "pdf", src: freshUrl("pdf", bytes, "application/pdf") } },
            { label: "Info", out: { kind: "table", columns: ["property", "value"], rows } },
            { label: `Checks (${checks.length})`, out: { kind: "issues", items: checks } },
            { label: "Hex", out: { kind: "text", text: hexdump(bytes, { limit: 1024 }) } },
          ],
        } satisfies Result;
      });
    },
    examples: [
      { label: "Hello, PDF", inputs: { b64: FX.PDF_HELLO }, note: "A hand-written one-page PDF 1.4 with a correct xref table and an Info dictionary." },
      { label: "Two-page report", inputs: { b64: FX.PDF_REPORT }, opts: { name: "q3-report.pdf" }, note: "PDF 1.7, A4 pages; the title is a UTF-16 hex string (<FEFF…>) decoded for you." },
      { label: "Data URL", inputs: { b64: dataUrl("application/pdf", FX.PDF_HELLO) }, note: "A data:application/pdf;base64, prefix is stripped automatically." },
      { label: "MIME attachment", inputs: { b64: b64encode(fromB64(FX.PDF_REPORT), { wrap: 76 }) }, note: "Line-wrapped Base64, as found in an .eml file, decodes just the same." },
      { label: "Truncated file", inputs: { b64: PDF_TRUNCATED }, note: "The last bytes are missing: no %%EOF and a broken startxref — see the Checks tab." },
      { label: "Not a PDF", inputs: { b64: FX.PNG_RING }, note: "A PNG is recognised and rejected.", error: true },
    ],
  },

  "base64-to-hex": {
    inputs: [{ id: "b64", label: "Base64", lang: "text", wrap: true }],
    options: HEX_OPTS,
    run({ inputs, opts }) {
      need(inputs.b64 ?? "", "Paste Base64 to convert to hex.");
      const d = b64decode(inputs.b64);
      const upper = opts.case === "upper";
      const text = hexFormat(d.bytes, { upper, sep: str(opts.sep), perLine: num(opts.per, 16) });
      return {
        text,
        notes: b64Notes(d),
        views: [
          { label: "Hex", out: { kind: "text", text, wrap: !num(opts.per) } },
          { label: "Hex dump", out: { kind: "text", text: hexdump(d.bytes, { upper }) } },
          stats("Info", [...infoItems(d, inputs.b64), { label: "Hex digits", value: d.bytes.length * 2 }, { label: "Detected type", value: sniff(d.bytes)?.label ?? (utf8Strict(d.bytes) !== null ? "Text" : "Binary") }]),
        ],
      };
    },
    examples: [
      { label: "Hello", inputs: { b64: "SGVsbG8=" } },
      { label: "SHA-256 digest", inputs: { b64: "LPJNul+wow4m6DsqxbninhsWHlwfp0JecwQzYpOLmCQ=" }, opts: { sep: "none", per: 0 }, note: "Checksums are often published in Base64 (SRI hashes) — this is sha256(\"hello\") in hex." },
      { label: "Key fingerprint", inputs: { b64: "q7gKx0bE1Tz2V1w6cC9aJg==" }, opts: { sep: "colon", case: "upper", per: 0 }, note: "Colon-separated upper-case hex, the way certificate fingerprints are shown." },
      { label: "PNG header → C array", inputs: { b64: FX.PNG_CHECKER }, opts: { sep: "c", per: 12 }, note: "Paste straight into firmware or a C test fixture." },
      { label: "Shell printf", inputs: { b64: b64Text("tab\there\n") }, opts: { sep: "escape", per: 0 }, note: "\\x escapes work in printf, echo -e, Python and JS strings." },
      { label: "Bad input", inputs: { b64: "SGVsbG8=\nV29y!bGQ=" }, error: true, note: "Errors give the line and column of the bad character." },
    ],
  },

  "url-encoder": {
    inputs: [{ id: "text", label: "Text or URL", lang: "text", wrap: true }],
    options: [
      {
        id: "mode",
        label: "Mode",
        type: "select",
        choices: [
          ["component", "Component (encodeURIComponent)"],
          ["uri", "Full URI (encodeURI)"],
          ["form", "Form (x-www-form-urlencoded)"],
          ["path", "Path segment"],
          ["strict", "RFC 3986 strict"],
          ["all", "Encode everything"],
        ],
        default: "component",
      },
      { id: "lines", label: "Per line", type: "toggle", default: false, hint: "Encode each line on its own and keep the line breaks" },
      { id: "keep", label: "Keep existing %XX", type: "toggle", default: false, hint: "Don't double-encode sequences that are already percent-encoded" },
      { id: "lower", label: "Lower-case hex", type: "toggle", default: false },
    ],
    run({ inputs, opts }) {
      const src = inputs.text ?? "";
      const mode = str(opts.mode, "component");
      const lower = bool(opts.lower), keep = bool(opts.keep);
      let text: string;
      let count = 0;
      if (bool(opts.lines)) {
        let base = 0;
        text = src
          .split("\n")
          .map((line) => {
            const r = pctEncode(line, mode, lower, keep, base, src);
            base += line.length + 1;
            count += r.count;
            return r.out;
          })
          .join("\n");
      } else {
        const r = pctEncode(src, mode, lower, keep);
        text = r.out;
        count = r.count;
      }
      const views: View[] = [{ label: "Encoded", out: { kind: "text", text, wrap: true } }];
      views.push(...urlViews(mode === "uri" ? text : src));
      views.push(
        stats("Stats", [
          { label: "Characters in", value: src.length },
          { label: "Characters out", value: text.length, tone: "info" },
          { label: "Characters encoded", value: count, tone: count ? "warn" : "ok" },
          { label: "UTF-8 bytes", value: utf8Encode(src).length },
        ])
      );
      return { text, views };
    },
    examples: [
      { label: "Query value", inputs: { text: "cats & dogs = best friends? ü" }, note: "encodeURIComponent: everything but A–Z a–z 0–9 - _ . ! ~ * ' ( ) is escaped." },
      { label: "Full URL", inputs: { text: "https://example.com/search results/?q=naïve café&lang=fr#top" }, opts: { mode: "uri" }, note: "encodeURI keeps the URL structure (: / ? & = #) and escapes only what is illegal. See the URL parts and Query tabs." },
      { label: "Form body", inputs: { text: "Ada Lovelace & Co. — 50% off!" }, opts: { mode: "form" }, note: "HTML forms send spaces as + and escape ~ ! ' ( ) too." },
      { label: "Path segment", inputs: { text: "reports/2026 Q3 (final).pdf" }, opts: { mode: "path" }, note: "One segment: the / must be escaped (%2F), while ( ) : @ may stay." },
      { label: "RFC 3986 strict", inputs: { text: "It's (really) *great*!" }, opts: { mode: "strict" }, note: "Only unreserved characters survive — what OAuth 1.0 signatures and AWS SigV4 require." },
      { label: "Per line", inputs: { text: "東京 🍣\nsan francisco, ca\nC# & F#" }, opts: { lines: true }, note: "Each line is encoded on its own — handy for lists of search terms." },
      { label: "No double-encoding", inputs: { text: "https://example.com/a%20file/new file.txt" }, opts: { mode: "uri", keep: true }, note: "Existing %20 stays as-is; only the raw space is encoded." },
      { label: "Encode everything", inputs: { text: "admin@example.com" }, opts: { mode: "all", lower: true }, note: "Every byte as %xx — sometimes used to obfuscate addresses." },
    ],
  },

  "url-decoder": {
    inputs: [{ id: "text", label: "Encoded text or URL", lang: "text", wrap: true }],
    options: [
      { id: "plus", label: "+ as space", type: "toggle", default: true, hint: "Form encoding (application/x-www-form-urlencoded) uses + for spaces" },
      { id: "repeat", label: "Decode repeatedly", type: "toggle", default: false, hint: "Unwrap double- and triple-encoded strings" },
      { id: "lenient", label: "Lenient", type: "toggle", default: false, hint: "Keep malformed % sequences and substitute U+FFFD for invalid UTF-8 instead of stopping" },
    ],
    run({ inputs, opts }) {
      const src = inputs.text ?? "";
      const plus = bool(opts.plus), lenient = bool(opts.lenient);
      let text = pctDecode(src, plus, lenient);
      const rounds = [src, text];
      if (bool(opts.repeat)) {
        while (/%[0-9a-fA-F]{2}/.test(text) && rounds.length < 12) {
          const next = pctDecode(text, false, lenient);
          if (next === text) break;
          text = next;
          rounds.push(text);
        }
      }
      const views: View[] = [{ label: "Decoded", out: { kind: "text", text, wrap: true } }];
      views.push(...urlViews(src.trim().includes("\n") ? "" : src.trim()));
      if (!views.some((v) => v.label.startsWith("Query")) && /^[^\s=&]+=[^\s]*(&|$)/.test(src.trim())) {
        const params = [...new URLSearchParams(src.trim().replace(/^\?/, "")).entries()];
        if (params.length) views.push({ label: `Params (${params.length})`, out: { kind: "table", columns: ["key", "value"], rows: params } });
      }
      if (rounds.length > 2) views.push({ label: `Rounds (${rounds.length - 1})`, out: { kind: "table", columns: ["round", "text"], rows: rounds.map((r, i) => [i, r]) } });
      const leftover = /%[0-9a-fA-F]{2}/.test(text) && !bool(opts.repeat);
      return {
        text,
        views,
        notes: [
          ...(rounds.length > 2 ? [`Decoded ${rounds.length - 1} layers of encoding.`] : []),
          ...(leftover ? ["The result still contains %XX sequences — it was probably encoded twice. Turn on Decode repeatedly."] : []),
        ],
      };
    },
    examples: [
      { label: "Encoded URL", inputs: { text: "https%3A%2F%2Fexample.com%2Fsearch%3Fq%3Dna%C3%AFve%20caf%C3%A9%26lang%3Dfr" }, note: "%C3%AF is the two-byte UTF-8 sequence for ï." },
      { label: "Form data", inputs: { text: "name=Ada+Lovelace&msg=2%2B2+%3D+4&tags=math%2Cpoetry" }, note: "+ means space in form bodies; %2B is a literal plus. See the Params tab." },
      { label: "Tracking link", inputs: { text: "https://l.example.com/?u=https%3A%2F%2Fshop.example.com%2Fcart%3Fitem%3D42%26ref%3Dmail&h=AT0x9f" }, note: "The Query tab decodes the nested redirect URL." },
      { label: "Double-encoded", inputs: { text: "%2525E2%252582%2525AC%252520price" }, opts: { repeat: true }, note: "Encoded three times: %25 is an encoded %. Rounds shows each layer." },
      { label: "Japanese", inputs: { text: "%E6%9D%B1%E4%BA%AC%E3%82%BF%E3%83%AF%E3%83%BC" } },
      { label: "Latin-1 escape", inputs: { text: "caf%E9 cr%E8me" }, note: "%E9 is é in Latin-1 but not valid UTF-8 on its own: the error points at it. Lenient substitutes U+FFFD.", error: true },
      { label: "Malformed %", inputs: { text: "save 100% now&discount=20%off" }, note: "A bare % must be written %25.", error: true },
    ],
  },

  "html-entity-encoder": {
    inputs: [{ id: "text", label: "Text or HTML", lang: "html", wrap: true }],
    options: [
      { id: "format", label: "Format", type: "segment", choices: [["named", "Named"], ["decimal", "Decimal"], ["hex", "Hex"]], default: "named" },
      { id: "scope", label: "Encode", type: "segment", choices: [["minimal", "& < > \" '"], ["nonascii", "+ non-ASCII"], ["all", "Everything"]], default: "minimal" },
      { id: "nl", label: "Keep newlines", type: "toggle", default: true, hint: "Off: encode line breaks and tabs too (for attribute values)" },
    ],
    run({ inputs, opts }) {
      const src = inputs.text ?? "";
      const format = str(opts.format, "named"), scope = str(opts.scope, "minimal"), keepNl = bool(opts.nl);
      const counts = new Map<string, { ent: string; n: number }>();
      let out = "";
      for (const ch of src) {
        const cp = ch.codePointAt(0)!;
        const ws = ch === "\n" || ch === "\r" || ch === "\t";
        const enc = ws ? !keepNl : scope === "all" ? true : '&<>"\''.includes(ch) || (scope === "nonascii" && cp > 126);
        if (!enc) {
          out += ch;
          continue;
        }
        const ent = entityFor(cp, format);
        out += ent;
        const c = counts.get(ch);
        if (c) c.n++;
        else counts.set(ch, { ent, n: 1 });
      }
      const rows = [...counts.entries()].map(([ch, { ent, n }]) => [ch === "\n" ? "\\n" : ch === "\t" ? "\\t" : ch === "\r" ? "\\r" : ch, `U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`, ent, n] as (string | number)[]);
      const total = rows.reduce((a, r) => a + (r[3] as number), 0);
      return {
        text: out,
        lang: "html",
        views: [
          { label: "Encoded", out: { kind: "text", text: out, lang: "html", wrap: true } },
          { label: "Rendered", out: { kind: "html", html: `<p style="white-space:pre-wrap">${out}</p>` } },
          { label: `Replacements (${rows.length})`, out: { kind: "table", columns: ["char", "code point", "entity", "count"], rows } },
          stats("Stats", [
            { label: "Characters in", value: [...src].length },
            { label: "Characters encoded", value: total, tone: "info" },
            { label: "Length out", value: out.length },
            { label: "Growth", value: src.length ? `${Math.round((out.length / src.length - 1) * 100)}%` : "0%", tone: "warn" },
          ]),
        ],
      };
    },
    examples: [
      { label: "HTML snippet", inputs: { text: '<a href="/search?q=cats&dogs">Tom & Jerry\'s "best" bits</a>' }, note: "The five characters that matter in HTML text and attributes. The Rendered tab shows it displays as literal text." },
      { label: "Typography", inputs: { text: "“Smart quotes” — em dash… café, 5 × 3 ≠ 16, 20 °C, © 2026 ✓" }, opts: { scope: "nonascii" }, note: "Named entities where HTML defines them (&ldquo; &mdash; &times;), numeric otherwise." },
      { label: "Decimal for XML", inputs: { text: "Größe: 42 € <netto>" }, opts: { format: "decimal", scope: "nonascii" }, note: "XML knows only 5 named entities — numeric references always work." },
      { label: "Hex references", inputs: { text: "Emoji 🚀 and CJK 漢字 in ASCII-only HTML" }, opts: { format: "hex", scope: "nonascii" }, note: "Astral-plane characters become one reference (&#x1F680;), not two surrogates." },
      { label: "Obfuscate an email", inputs: { text: "ada@example.com" }, opts: { format: "decimal", scope: "all" }, note: "Everything encoded — browsers render it normally, naive scrapers see numbers." },
      { label: "Attribute value", inputs: { text: 'Line one\nLine "two"\tand a tab' }, opts: { nl: false }, note: "Newlines as &NewLine; and tabs as &Tab; — safe inside a title=\"…\" attribute." },
    ],
  },

  "html-entity-decoder": {
    inputs: [{ id: "text", label: "HTML with entities", lang: "html", wrap: true }],
    options: [
      { id: "repeat", label: "Decode repeatedly", type: "toggle", default: false, hint: "For double-escaped text such as &amp;lt;" },
      { id: "nbsp", label: "NBSP → space", type: "toggle", default: false, hint: "Turn non-breaking spaces into ordinary spaces" },
    ],
    run({ inputs, opts }) {
      const src = inputs.text ?? "";
      let text = decodeEntities(src);
      let rounds = 1;
      if (bool(opts.repeat))
        while (/&(#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);/i.test(text) && rounds < 10) {
          const next = decodeEntities(text);
          if (next === text) break;
          text = next;
          rounds++;
        }
      if (bool(opts.nbsp)) text = text.replace(/\u00a0/g, " ");
      const found = new Map<string, { ch: string; n: number }>();
      for (const m of src.matchAll(/&(#[xX][0-9a-fA-F]+|#\d+|[A-Za-z][A-Za-z0-9]*);?/g)) {
        const f = found.get(m[0]);
        if (f) f.n++;
        else found.set(m[0], { ch: decodeEntities(m[0]), n: 1 });
      }
      const rows = [...found.entries()].map(([ent, { ch, n }]) => {
        const known = ch !== ent;
        const kind = ent[1] === "#" ? (ent[2] === "x" || ent[2] === "X" ? "hex" : "decimal") : "named";
        const cps = known ? [...ch].map((c) => `U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`).join(" ") : "";
        const status = !known ? "unknown — left as-is" : !ent.endsWith(";") ? "legacy, no semicolon" : ch === "\uFFFD" ? "invalid code point" : "ok";
        return [ent, known ? (ch === "\u00a0" ? "(nbsp)" : ch === "\n" ? "\\n" : ch) : "", cps, kind, n, status];
      });
      const unknown = rows.filter((r) => String(r[5]).startsWith("unknown")).length;
      return {
        text,
        notes: [...(rounds > 1 ? [`Decoded ${rounds} layers.`] : []), ...(unknown ? [`${unknown} unknown entit${unknown > 1 ? "ies were" : "y was"} left untouched.`] : [])],
        views: [
          { label: "Decoded", out: { kind: "text", text, wrap: true } },
          { label: `Entities (${rows.length})`, out: { kind: "table", columns: ["entity", "char", "code point", "kind", "count", "status"], rows } },
          stats("Stats", [
            { label: "References found", value: rows.reduce((a, r) => a + (r[4] as number), 0), tone: "info" },
            { label: "Distinct", value: rows.length },
            { label: "Unknown", value: unknown, tone: unknown ? "warn" : "ok" },
            { label: "Length in → out", value: `${src.length} → ${text.length}` },
          ]),
        ],
      };
    },
    examples: [
      { label: "Escaped HTML", inputs: { text: "&lt;div class=&quot;note&quot;&gt;Tom &amp; Jerry&#39;s &lt;b&gt;best&lt;/b&gt;&lt;/div&gt;" } },
      { label: "HTML5 named", inputs: { text: "&forall;x &isin; &Ropf;: x&sup2; &ge; 0 &rArr; &check; &nbsp;&hearts; &frac34; &NotEqualTilde;" }, note: "All 2,231 HTML5 names work — including two-code-point ones like &NotEqualTilde;." },
      { label: "Numeric", inputs: { text: "Rocket: &#128640; = &#x1F680; · Euro: &#8364; · Invalid: &#xD800; &#0;" }, note: "Decimal and hex references; surrogates and NUL become U+FFFD, as browsers do." },
      { label: "Double-escaped", inputs: { text: "&amp;lt;p&amp;gt;Fish &amp;amp; chips&amp;lt;/p&amp;gt;" }, opts: { repeat: true }, note: "Escaped twice (common in RSS feeds and CMS exports)." },
      { label: "Legacy & unknown", inputs: { text: "AT&T &copy 2026 &bogus; &lt3 &notit;" }, note: "&copy and &lt work without a semicolon; &bogus; is unknown and stays. Gotcha: &notit; becomes ¬it; via the legacy &not prefix." },
      { label: "Non-breaking spaces", inputs: { text: "Price:&nbsp;42&nbsp;€ &mdash; 10&thinsp;kg" }, opts: { nbsp: true }, note: "NBSP → space normalises text copied from web pages." },
    ],
  },

  "jwt-decoder": {
    inputs: [
      { id: "token", label: "JWT", lang: "text", wrap: true, placeholder: "eyJhbGciOi…" },
      { id: "key", label: "Secret or public key", lang: "text", rows: 6, placeholder: "HS*: the shared secret · RS/PS/ES: PEM public key, certificate or JWK" },
      { id: "header", label: "Header (sign mode)", lang: "json", rows: 4 },
      { id: "payload", label: "Payload (sign mode)", lang: "json", rows: 8 },
    ],
    options: [
      { id: "mode", label: "Mode", type: "segment", choices: [["decode", "Decode & verify"], ["sign", "Encode & sign"]], default: "decode" },
      { id: "enc", label: "Secret is", type: "select", choices: [["text", "Text (UTF-8)"], ["base64", "Base64 / Base64URL"], ["hex", "Hex"]], default: "text", hint: "How to read an HS256/384/512 secret" },
      { id: "leeway", label: "Clock skew (s)", type: "number", default: 0, min: 0, max: 86400, show: (o) => o.mode !== "sign" },
    ],
    custom: () => import("./ui/A-JwtWorkbench"),
    async run({ inputs, opts }) {
      const J = await import("./lib/A-jwt");
      const enc = str(opts.enc, "text") as "text" | "base64" | "hex";
      if (opts.mode === "sign") {
        const token = await J.signJwt(inputs.header ?? "", inputs.payload ?? "", inputs.key ?? "", enc);
        return { text: token, views: [{ label: "Token", out: { kind: "text", text: token, wrap: true } }] };
      }
      const jwt = J.parseJwt(inputs.token ?? "");
      const now = Math.floor(Date.now() / 1000);
      const t = J.timeState(jwt.payload, now, num(opts.leeway));
      const v = await J.verifyJwt(jwt, inputs.key ?? "", enc);
      const summary = {
        header: jwt.header,
        payload: jwt.payload,
        signature: { alg: jwt.header.alg ?? null, verified: /not checked/i.test(v.title) ? null : v.ok, result: v.title, detail: v.detail },
        validity: t.state === "none" ? undefined : `${t.title}. ${t.detail}`,
      };
      const text = JSON.stringify(summary, null, 2);
      return {
        text,
        notes: jwt.warnings,
        views: [
          { label: "Decoded", out: { kind: "text", text, lang: "json" } },
          { label: "Claims", out: { kind: "table", columns: ["claim", "value", "readable", "meaning"], rows: J.claimRows(jwt.payload, now) } },
          { label: "Signature", out: { kind: "status", ok: v.ok, title: v.title, detail: v.detail } },
        ],
      };
    },
    examples: [
      { label: "HS256 (jwt.io)", inputs: { token: FX.JWT_HS256, key: "your-256-bit-secret" }, note: "The classic jwt.io sample, verified with its shared secret." },
      { label: "Wrong secret", inputs: { token: FX.JWT_HS256, key: "not-the-secret" }, note: "Any change to the secret (or token) makes the HMAC fail.", error: true },
      { label: "Expired session", inputs: { token: FX.JWT_EXPIRED, key: "your-256-bit-secret" }, note: "Signature is fine, but exp is in the past — a server must reject it." },
      { label: "RS256 + PEM", inputs: { token: FX.JWT_RS256, key: FX.RSA_PUBLIC_PEM }, note: "An OIDC-style access token verified with the RSA public key (SPKI PEM)." },
      { label: "ES256 + JWK", inputs: { token: FX.JWT_ES256, key: FX.EC_PUBLIC_JWK }, note: "ECDSA P-256; the key is a JWK, as served from a /.well-known/jwks.json endpoint." },
      { label: "PS256", inputs: { token: FX.JWT_PS256, key: FX.RSA_PUBLIC_PEM }, note: "RSA-PSS: randomised signatures, same RSA key." },
      { label: "HS512, Base64 secret", inputs: { token: FX.JWT_HS512, key: FX.HS512_SECRET_B64 }, opts: { enc: "base64" }, note: "Many providers hand out Base64 secrets — decode them before HMAC-ing." },
      { label: "Not yet valid", inputs: { token: FX.JWT_NBF, key: "your-256-bit-secret" }, note: "nbf lies in the future." },
      {
        label: "Sign HS256",
        inputs: { header: '{\n  "alg": "HS256",\n  "typ": "JWT"\n}', payload: '{\n  "sub": "user-42",\n  "name": "Ada Lovelace",\n  "role": "admin",\n  "iat": 1790208000,\n  "exp": 4102444800\n}', key: "your-256-bit-secret" },
        opts: { mode: "sign" },
        note: "Edit the header and payload, then copy the signed token.",
      },
      {
        label: "Sign RS256",
        inputs: { header: '{\n  "alg": "RS256",\n  "typ": "JWT",\n  "kid": "2026-09-rsa"\n}', payload: '{\n  "iss": "https://auth.example.com/",\n  "sub": "svc-reports",\n  "aud": "https://api.example.com",\n  "iat": 1790208000,\n  "exp": 4102444800\n}', key: FX.RSA_PRIVATE_PEM },
        opts: { mode: "sign" },
        note: "Signs with a PKCS#8 RSA private key — the RS256 + PEM example's public key verifies it.",
      },
      { label: "Malformed", inputs: { token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIy.sig" }, note: "The payload's JSON is cut short — the error explains what broke.", error: true },
    ],
    steps: ["Paste a token — header, payload and signature are colour-coded.", "Read the claims: dates are shown in UTC with relative times, and status badges flag expired or not-yet-valid tokens.", "Paste the secret (HS*) or the public key (RS/PS/ES — PEM, certificate or JWK) to verify the signature.", "Switch to Encode & sign to edit claims and mint a new token."],
    tips: ["Decoding is not verifying: anyone can read a JWT's payload. Only a verified signature proves who issued it.", "Everything runs locally with WebCrypto — secrets and keys never leave this tab."],
  },
};

export default specs;
