/**
 * RFC 9562 UUIDs: generation of v1, v3, v4, v5, v6, v7, nil and max, plus an
 * inspector that decodes version, variant and the embedded timestamp.
 * MD5 / SHA-1 come from @noble/hashes (imported by the caller and passed in).
 */

export const NAMESPACES: Record<string, string> = {
  dns: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  url: "6ba7b811-9dad-11d1-80b4-00c04fd430c8",
  oid: "6ba7b812-9dad-11d1-80b4-00c04fd430c8",
  x500: "6ba7b814-9dad-11d1-80b4-00c04fd430c8",
};

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));

export function bytesToUuid(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < 16; i++) {
    s += HEX[b[i]];
    if (i === 3 || i === 5 || i === 7 || i === 9) s += "-";
  }
  return s;
}

export function uuidToBytes(u: string): Uint8Array {
  const h = u.replace(/-/g, "");
  const b = new Uint8Array(16);
  for (let i = 0; i < 16; i++) b[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return b;
}

function rand(n: number): Uint8Array {
  const b = new Uint8Array(n);
  globalThis.crypto.getRandomValues(b);
  return b;
}

function setVersion(b: Uint8Array, v: number) {
  b[6] = (b[6] & 0x0f) | (v << 4);
  b[8] = (b[8] & 0x3f) | 0x80; // RFC variant 10xx
}

export function v4(): string {
  const b = rand(16);
  setVersion(b, 4);
  return bytesToUuid(b);
}

/** Gregorian 100-ns intervals since 1582-10-15. */
const GREG_OFFSET = 122192928000000000n;

type V1State = { lastT: bigint; seq: number; node: Uint8Array };
let v1state: V1State | null = null;

function v1Fields(): { t: bigint; seq: number; node: Uint8Array } {
  if (!v1state) {
    const node = rand(6);
    node[0] |= 0x01; // multicast bit: a random node, not a real MAC (RFC 9562 §6.10)
    const s = rand(2);
    v1state = { lastT: 0n, seq: ((s[0] << 8) | s[1]) & 0x3fff, node };
  }
  let t = BigInt(Date.now()) * 10000n + GREG_OFFSET;
  if (t <= v1state.lastT) t = v1state.lastT + 1n; // several per millisecond: count up the 100-ns ticks
  v1state.lastT = t;
  return { t, seq: v1state.seq, node: v1state.node };
}

export function v1(): string {
  const { t, seq, node } = v1Fields();
  const low = Number(t & 0xffffffffn), mid = Number((t >> 32n) & 0xffffn), hi = Number((t >> 48n) & 0x0fffn);
  const b = new Uint8Array(16);
  b[0] = low >>> 24; b[1] = (low >>> 16) & 255; b[2] = (low >>> 8) & 255; b[3] = low & 255;
  b[4] = mid >>> 8; b[5] = mid & 255;
  b[6] = 0x10 | (hi >>> 8); b[7] = hi & 255;
  b[8] = 0x80 | (seq >>> 8); b[9] = seq & 255;
  b.set(node, 10);
  return bytesToUuid(b);
}

export function v6(): string {
  const { t, seq, node } = v1Fields();
  // time_high(32) time_mid(16) ver(4) time_low(12): the timestamp reads most-significant first, so v6 sorts by time
  const hi = Number((t >> 28n) & 0xffffffffn), mid = Number((t >> 12n) & 0xffffn), low = Number(t & 0xfffn);
  const b = new Uint8Array(16);
  b[0] = hi >>> 24; b[1] = (hi >>> 16) & 255; b[2] = (hi >>> 8) & 255; b[3] = hi & 255;
  b[4] = mid >>> 8; b[5] = mid & 255;
  b[6] = 0x60 | (low >>> 8); b[7] = low & 255;
  b[8] = 0x80 | (seq >>> 8); b[9] = seq & 255;
  b.set(node, 10);
  return bytesToUuid(b);
}

let v7last = { ms: 0, ctr: 0 };
/** v7 with a 12-bit monotonic counter in rand_a (RFC 9562 §6.2 method 1) so a batch sorts in order. */
export function v7(): string {
  const now = Date.now();
  const b = rand(16);
  let ms = now, ctr: number;
  if (now <= v7last.ms) {
    ms = v7last.ms;
    ctr = v7last.ctr + 1;
    if (ctr > 0xfff) { ms++; ctr = b[7] & 0x3ff; }
  } else ctr = ((b[6] & 0x0f) << 8 | b[7]) & 0x3ff; // start low so there is room to count up
  v7last = { ms, ctr };
  const m = BigInt(ms);
  for (let i = 0; i < 6; i++) b[i] = Number((m >> BigInt(8 * (5 - i))) & 0xffn);
  b[6] = 0x70 | (ctr >>> 8);
  b[7] = ctr & 255;
  b[8] = (b[8] & 0x3f) | 0x80;
  return bytesToUuid(b);
}

export function nameBased(hash: (b: Uint8Array) => Uint8Array, version: 3 | 5, ns: string, name: string): string {
  const nsb = uuidToBytes(ns);
  const nb = new TextEncoder().encode(name);
  const buf = new Uint8Array(16 + nb.length);
  buf.set(nsb);
  buf.set(nb, 16);
  const h = hash(buf).slice(0, 16);
  setVersion(h, version);
  return bytesToUuid(h);
}

export const NIL = "00000000-0000-0000-0000-000000000000";
export const MAX = "ffffffff-ffff-ffff-ffff-ffffffffffff";

export function formatUuid(u: string, fmt: string): string {
  switch (fmt) {
    case "upper": return u.toUpperCase();
    case "nohyphen": return u.replace(/-/g, "");
    case "braces": return `{${u}}`;
    case "urn": return `urn:uuid:${u}`;
    case "base64": {
      const b = uuidToBytes(u);
      let bin = "";
      b.forEach((x) => (bin += String.fromCharCode(x)));
      return btoa(bin);
    }
    case "base64url": {
      const b = uuidToBytes(u);
      let bin = "";
      b.forEach((x) => (bin += String.fromCharCode(x)));
      return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    }
    case "int": return BigInt("0x" + u.replace(/-/g, "")).toString();
    default: return u;
  }
}

/* ── inspection ─────────────────────────────────────────────────────── */

export type Inspection = {
  input: string;
  valid: boolean;
  canonical?: string;
  version?: number;
  versionName?: string;
  variant?: string;
  time?: string;
  clockSeq?: number;
  node?: string;
  notes: string[];
};

const VNAME: Record<number, string> = {
  0: "Nil / unknown",
  1: "v1 · Gregorian time + node",
  2: "v2 · DCE Security",
  3: "v3 · name-based (MD5)",
  4: "v4 · random",
  5: "v5 · name-based (SHA-1)",
  6: "v6 · reordered Gregorian time",
  7: "v7 · Unix epoch time + random",
  8: "v8 · custom / vendor-specific",
};

/** Accepts canonical, braces, urn:uuid:, 32 hex, Base64 (22/24 chars) and decimal forms. */
export function normaliseUuid(raw: string): string | null {
  let s = raw.trim().replace(/^urn:uuid:/i, "").replace(/^\{(.*)\}$/, "$1").replace(/^"(.*)"$/, "$1");
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return s.toLowerCase();
  if (/^[0-9a-f]{32}$/i.test(s)) return s.toLowerCase().replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
  if (/^[A-Za-z0-9+/_-]{22}(==)?$/.test(s)) {
    try {
      s = s.replace(/-/g, "+").replace(/_/g, "/");
      const bin = atob(s.length === 22 ? s + "==" : s);
      if (bin.length === 16) return bytesToUuid(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    } catch {
      /* fall through */
    }
  }
  if (/^\d{20,39}$/.test(s)) {
    const n = BigInt(s);
    if (n < 1n << 128n) return n.toString(16).padStart(32, "0").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
  }
  return null;
}

export function inspect(raw: string): Inspection {
  const input = raw.trim();
  const u = normaliseUuid(input);
  if (!u) return { input, valid: false, notes: ["Not a UUID: expected 32 hex digits as 8-4-4-4-12 (braces, urn:uuid:, no-hyphen, Base64 and decimal forms are accepted too)."] };
  const notes: string[] = [];
  if (u === NIL) return { input, valid: true, canonical: u, version: 0, versionName: "Nil UUID (all zeros)", variant: "—", notes: ["The nil UUID is a placeholder for “no value”."] };
  if (u === MAX) return { input, valid: true, canonical: u, version: 15, versionName: "Max UUID (all ones)", variant: "—", notes: ["The max UUID (RFC 9562) is a sentinel, e.g. an upper bound."] };
  const b = uuidToBytes(u);
  const version = b[6] >> 4;
  const vb = b[8] >> 5;
  const variant = (vb & 0b100) === 0 ? "NCS (reserved, 0xxx)" : (vb & 0b110) === 0b100 ? "RFC 9562 / 4122 (10xx)" : (vb & 0b111) === 0b110 ? "Microsoft GUID (110x)" : "Reserved (111x)";
  const rfc = (vb & 0b110) === 0b100;
  const r: Inspection = { input, valid: true, canonical: u, version, versionName: VNAME[version] ?? `Unknown version ${version}`, variant, notes };
  if (!rfc) notes.push("Variant is not RFC 9562, so the version nibble may not mean anything.");
  if (input !== u) notes.push(`Normalised from ${/^urn/i.test(input) ? "URN" : /^\{/.test(input) ? "braced" : /^\d+$/.test(input) ? "decimal" : input.length <= 24 ? "Base64" : /[A-F]/.test(input) ? "uppercase" : "compact"} form.`);
  const hex = u.replace(/-/g, "");
  if (rfc && (version === 1 || version === 6)) {
    let t: bigint;
    if (version === 1) t = (BigInt("0x" + hex.slice(13, 16)) << 48n) | (BigInt("0x" + hex.slice(8, 12)) << 32n) | BigInt("0x" + hex.slice(0, 8));
    else t = (BigInt("0x" + hex.slice(0, 8)) << 28n) | (BigInt("0x" + hex.slice(8, 12)) << 12n) | BigInt("0x" + hex.slice(13, 16));
    const ms = Number((t - GREG_OFFSET) / 10000n);
    const sub = Number((t - GREG_OFFSET) % 10000n);
    r.time = new Date(ms).toISOString().replace("Z", `${String(sub).padStart(4, "0")}Z`).replace(/\.(\d{3})(\d{4})Z$/, ".$1$2Z");
    r.clockSeq = ((b[8] & 0x3f) << 8) | b[9];
    r.node = Array.from(b.slice(10), (x) => HEX[x]).join(":");
    notes.push(b[10] & 1 ? "Node has the multicast bit set — a random node ID, not a MAC address." : "Node looks like a real MAC address (it can identify the machine that made it).");
  }
  if (rfc && version === 7) {
    const ms = parseInt(hex.slice(0, 12), 16);
    r.time = new Date(ms).toISOString();
    notes.push("First 48 bits are Unix milliseconds, so v7 IDs sort by creation time — good database keys.");
  }
  if (rfc && (version === 3 || version === 5)) notes.push("Name-based: the same namespace + name always gives this UUID; it cannot be reversed to the name.");
  if (rfc && version === 4) notes.push("122 random bits — no embedded information.");
  if (rfc && version === 2) notes.push("DCE Security: the low time field holds a local POSIX UID/GID.");
  return r;
}
