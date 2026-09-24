/**
 * Digest helpers for the Security tools: every algorithm from @noble/hashes
 * (imported lazily), plus CRC32 and Adler-32, input decoding and output
 * encodings.
 */
import { ToolError } from "../types";

export const HASHES = [
  ["md5", "MD5"],
  ["sha1", "SHA-1"],
  ["sha224", "SHA-224"],
  ["sha256", "SHA-256"],
  ["sha384", "SHA-384"],
  ["sha512", "SHA-512"],
  ["sha512_256", "SHA-512/256"],
  ["sha3_256", "SHA3-256"],
  ["sha3_512", "SHA3-512"],
  ["keccak256", "Keccak-256"],
  ["blake2b", "BLAKE2b-512"],
  ["blake2s", "BLAKE2s-256"],
  ["blake3", "BLAKE3"],
  ["ripemd160", "RIPEMD-160"],
  ["crc32", "CRC32"],
  ["adler32", "Adler-32"],
] as const;

export type HashId = (typeof HASHES)[number][0];
export const hashName = (id: string) => HASHES.find((h) => h[0] === id)?.[1] ?? id;

/* ── checksums ─────────────────────────────────────────────────────────── */

let crcTable: Uint32Array | null = null;
export function crc32(data: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function adler32(data: Uint8Array): number {
  let a = 1, b = 0;
  const MOD = 65521;
  // process in chunks so the sums never overflow 2^53
  for (let i = 0; i < data.length; ) {
    const end = Math.min(i + 5552, data.length);
    for (; i < end; i++) {
      a += data[i];
      b += a;
    }
    a %= MOD;
    b %= MOD;
  }
  return ((b << 16) | a) >>> 0;
}

const u32be = (n: number) => new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);

/* ── digests ───────────────────────────────────────────────────────────── */

type Fn = (d: Uint8Array) => Uint8Array;

export async function hasher(id: string): Promise<Fn> {
  switch (id) {
    case "md5":
    case "sha1":
    case "ripemd160": {
      const m = await import("@noble/hashes/legacy.js");
      return (m as unknown as Record<string, Fn>)[id];
    }
    case "sha224":
    case "sha256":
    case "sha384":
    case "sha512":
    case "sha512_256": {
      const m = await import("@noble/hashes/sha2.js");
      return (m as unknown as Record<string, Fn>)[id];
    }
    case "sha3_224":
    case "sha3_256":
    case "sha3_384":
    case "sha3_512":
    case "keccak256": {
      const m = await import("@noble/hashes/sha3.js");
      return id === "keccak256" ? m.keccak_256 : (m as unknown as Record<string, Fn>)[id];
    }
    case "blake2b":
    case "blake2s": {
      const m = await import("@noble/hashes/blake2.js");
      return m[id];
    }
    case "blake3": {
      const m = await import("@noble/hashes/blake3.js");
      return m.blake3;
    }
    case "crc32":
      return (d) => u32be(crc32(d));
    case "adler32":
      return (d) => u32be(adler32(d));
  }
  throw new ToolError(`Unknown algorithm ${id}.`);
}

/* ── encodings ─────────────────────────────────────────────────────────── */

export const utf8 = (s: string) => new TextEncoder().encode(s);

export function toHex(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, "0");
  return s;
}

export function toB64(b: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(bin);
}

export const toB64url = (b: Uint8Array) => toB64(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function fromHex(s: string): Uint8Array {
  const clean = s.replace(/^0x/i, "").replace(/[\s:,-]+/g, "");
  if (clean.length % 2 || /[^0-9a-f]/i.test(clean)) {
    const bad = clean.search(/[^0-9a-f]/i);
    throw new ToolError(bad >= 0 ? `Not hex: unexpected "${clean[bad]}" at position ${bad + 1}.` : "Hex input needs an even number of digits.");
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function fromB64(s: string): Uint8Array {
  let clean = s.replace(/^data:[^,]*,/, "").replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  if (/[^A-Za-z0-9+/=]/.test(clean)) throw new ToolError("Not Base64: only A–Z, a–z, 0–9, +, /, - and _ are allowed.");
  while (clean.length % 4) clean += "=";
  let bin: string;
  try {
    bin = atob(clean);
  } catch {
    throw new ToolError("Invalid Base64 input.");
  }
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function decodeInput(s: string, how: string): Uint8Array {
  if (how === "hex") return fromHex(s);
  if (how === "base64") return fromB64(s);
  return utf8(s);
}

export function encodeOut(b: Uint8Array, how: string): string {
  if (how === "HEX") return toHex(b).toUpperCase();
  if (how === "base64") return toB64(b);
  if (how === "base64url") return toB64url(b);
  return toHex(b);
}

/** Tries to read `expected` in any common encoding and compare bytes. */
export function matchesDigest(expected: string, digest: Uint8Array): boolean {
  const e = expected.trim().replace(/^(sha\d+|md5|sha1)[=:]/i, "");
  if (!e) return false;
  if (/^[0-9a-f]+$/i.test(e)) return e.toLowerCase() === toHex(digest);
  return e === toB64(digest) || e.replace(/=+$/, "") === toB64url(digest) || e.replace(/=+$/, "") === toB64(digest).replace(/=+$/, "");
}

/** Constant-time comparison of two byte arrays (length leak only). */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}
