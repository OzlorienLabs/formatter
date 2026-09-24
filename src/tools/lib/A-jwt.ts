/**
 * JSON Web Tokens: parsing with precise errors, claim descriptions, time
 * checks, and signature verification / signing through WebCrypto (HS, RS, PS,
 * ES and EdDSA) with keys as secrets, PEM (SPKI, PKCS#1, PKCS#8, SEC1, X.509
 * certificates) or JWK / JWKS.
 */
import { ToolError } from "../types";
import { b64encode, utf8Encode } from "./A-bytes";

/* ── base64url ───────────────────────────────────────────────────────── */

export const b64url = (b: Uint8Array) => b64encode(b, { url: true, pad: false });

function b64urlDecode(seg: string, name: string, offset: number): Uint8Array {
  for (let i = 0; i < seg.length; i++) {
    const c = seg[i];
    if (!/[A-Za-z0-9_\-+/=]/.test(c))
      throw new ToolError(`Invalid character "${c}" in the ${name} at position ${offset + i + 1} of the token. JWT segments use URL-safe Base64 (A–Z a–z 0–9 - _).`);
  }
  const clean = seg.replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  if (clean.length % 4 === 1) throw new ToolError(`The ${name} (${seg.length} characters) is not valid Base64URL — its length leaves a dangling character, so part of it is probably missing.`);
  const bin = atob(clean.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((clean.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* ── parsing ─────────────────────────────────────────────────────────── */

export type Jwt = {
  token: string;
  segs: string[];
  kind: "JWS" | "JWE";
  header: Record<string, unknown>;
  payload: unknown;
  payloadIsJson: boolean;
  headerText: string;
  payloadText: string;
  signature: Uint8Array;
  warnings: string[];
};

function parseJsonSeg(text: string, name: string): unknown {
  try {
    return JSON.parse(text);
  } catch (e) {
    const msg = (e as Error).message.replace(/^JSON\.parse: /, "").replace(/ in JSON at position (\d+).*$/, (_m, p) => ` at character ${Number(p) + 1}`);
    throw new ToolError(`The ${name} decodes to text that is not valid JSON (${msg}):\n${text.length > 160 ? text.slice(0, 160) + "…" : text}`);
  }
}

export function cleanToken(raw: string) {
  return raw.trim().replace(/^(Bearer|JWT)\s+/i, "").replace(/^["']|["']$/g, "").replace(/\s+/g, "");
}

export function parseJwt(raw: string): Jwt {
  const token = cleanToken(raw);
  if (!token) throw new ToolError("Paste a JWT (three Base64URL segments separated by dots: header.payload.signature).");
  const segs = token.split(".");
  const warnings: string[] = [];
  if (/^(Bearer|JWT)\s/i.test(raw.trim())) warnings.push("Removed the “Bearer ” prefix.");
  if (segs.length === 5) {
    const header = parseJsonSeg(new TextDecoder().decode(b64urlDecode(segs[0], "header", 0)), "header") as Record<string, unknown>;
    return { token, segs, kind: "JWE", header, payload: null, payloadIsJson: false, headerText: JSON.stringify(header, null, 2), payloadText: "", signature: new Uint8Array(), warnings: [`This is an encrypted JWE (${header.alg ?? "?"} / ${header.enc ?? "?"}): only the protected header is readable without the recipient's private key.`] };
  }
  if (segs.length !== 3)
    throw new ToolError(`A JWT has 3 dot-separated segments (header.payload.signature); this has ${segs.length}.${segs.length === 2 ? " If the signature was cut off, add a trailing dot for an unsecured token." : segs.length === 1 ? " There are no dots at all — is this a Base64 string or an opaque token rather than a JWT?" : ""}`);
  if (!segs[0]) throw new ToolError("The header segment is empty.");
  let off = 0;
  const hBytes = b64urlDecode(segs[0], "header", off);
  off += segs[0].length + 1;
  const pBytes = b64urlDecode(segs[1], "payload", off);
  off += segs[1].length + 1;
  const signature = b64urlDecode(segs[2], "signature", off);
  if (/[=+/]/.test(segs.join(""))) warnings.push("The token contains standard Base64 characters (+ / =). JWTs must use unpadded Base64URL; strict libraries will reject it.");
  const headerText = new TextDecoder().decode(hBytes);
  const header = parseJsonSeg(headerText, "header");
  if (!header || typeof header !== "object" || Array.isArray(header)) throw new ToolError("The header must be a JSON object.");
  const payloadText = new TextDecoder().decode(pBytes);
  let payload: unknown = payloadText;
  let payloadIsJson = false;
  try {
    payload = JSON.parse(payloadText);
    payloadIsJson = true;
  } catch {
    if (/^\s*[{[]/.test(payloadText)) parseJsonSeg(payloadText, "payload");
    warnings.push("The payload is not JSON — this is a JWS with an arbitrary payload, not a JWT claims set.");
  }
  return { token, segs, kind: "JWS", header: header as Record<string, unknown>, payload, payloadIsJson, headerText, payloadText, signature, warnings };
}

/* ── claims ──────────────────────────────────────────────────────────── */

export const CLAIMS: Record<string, string> = {
  iss: "Issuer — who created and signed the token",
  sub: "Subject — whom the token is about (usually a user id)",
  aud: "Audience — who the token is intended for",
  exp: "Expiration time — reject on or after this",
  nbf: "Not before — reject before this",
  iat: "Issued at",
  jti: "JWT ID — unique id, used to prevent replay",
  auth_time: "Time the user actually authenticated",
  nonce: "Nonce echoed from the authentication request",
  azp: "Authorized party — the client the token was issued to",
  scope: "OAuth scopes granted",
  scp: "Scopes granted",
  client_id: "OAuth client id",
  sid: "Session id",
  acr: "Authentication context class",
  amr: "Authentication methods used",
  at_hash: "Access-token hash (OIDC)",
  c_hash: "Code hash (OIDC)",
  cnf: "Confirmation — proof-of-possession key",
  act: "Actor — delegation chain",
  roles: "Roles",
  groups: "Groups",
  email: "Email address",
  email_verified: "Whether the email is verified",
  name: "Full name",
  given_name: "Given name",
  family_name: "Family name",
  preferred_username: "Preferred username",
  picture: "Profile picture URL",
  locale: "Locale",
  tid: "Tenant id",
  oid: "Object id",
  upn: "User principal name",
  typ: "Token type",
};

export const HEADER_PARAMS: Record<string, string> = {
  alg: "Signature / MAC algorithm",
  typ: "Media type of the token",
  kid: "Key id — which key signed it",
  cty: "Content type (JWT for nested tokens)",
  jku: "URL of the signer's JWK Set",
  jwk: "The signer's public key, embedded",
  x5u: "URL of an X.509 certificate chain",
  x5c: "X.509 certificate chain",
  x5t: "SHA-1 thumbprint of the certificate",
  "x5t#S256": "SHA-256 thumbprint of the certificate",
  crit: "Extensions that must be understood",
  enc: "Content encryption algorithm (JWE)",
  zip: "Compression (JWE)",
  b64: "Payload is not Base64URL-encoded (RFC 7797)",
};

export const TIME_CLAIMS = new Set(["exp", "nbf", "iat", "auth_time", "updated_at", "rat"]);

export function relTime(sec: number, nowSec: number): string {
  const d = sec - nowSec;
  const a = Math.abs(d);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60], ["second", 1]];
  for (const [u, s] of units) if (a >= s || u === "second") return rtf.format(Math.round(d / s), u);
  return "";
}

export function isoOf(sec: number) {
  const d = new Date(sec * 1000);
  return Number.isNaN(d.getTime()) ? "invalid date" : d.toISOString().replace(".000Z", "Z");
}

export type TimeState = { state: "valid" | "expired" | "notyet" | "noexp" | "none"; title: string; detail: string };

export function timeState(payload: unknown, nowSec: number, leeway = 0): TimeState {
  if (!payload || typeof payload !== "object") return { state: "none", title: "No claims", detail: "" };
  const p = payload as Record<string, unknown>;
  const exp = typeof p.exp === "number" ? p.exp : undefined;
  const nbf = typeof p.nbf === "number" ? p.nbf : undefined;
  if (exp !== undefined && nowSec >= exp + leeway) return { state: "expired", title: "Expired", detail: `Expired ${relTime(exp, nowSec)} (${isoOf(exp)})` };
  if (nbf !== undefined && nowSec < nbf - leeway) return { state: "notyet", title: "Not yet valid", detail: `Becomes valid ${relTime(nbf, nowSec)} (${isoOf(nbf)})` };
  if (exp === undefined) return { state: "noexp", title: "No expiry", detail: "No exp claim — the token never expires on its own." };
  return { state: "valid", title: "Within validity window", detail: `Expires ${relTime(exp, nowSec)} (${isoOf(exp)})` };
}

export function claimRows(payload: unknown, nowSec: number): [string, string, string, string][] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  return Object.entries(payload as Record<string, unknown>).map(([k, v]) => {
    const shown = typeof v === "string" ? v : JSON.stringify(v);
    let human = "";
    if (TIME_CLAIMS.has(k) && typeof v === "number") human = `${isoOf(v)} · ${relTime(v, nowSec)}`;
    else if (k === "scope" && typeof v === "string") human = `${v.split(/\s+/).length} scope(s)`;
    else if (Array.isArray(v)) human = `${v.length} item(s)`;
    return [k, shown, human, CLAIMS[k] ?? (k.startsWith("http") ? "Namespaced custom claim" : "Custom claim")];
  });
}

/* ── algorithms ──────────────────────────────────────────────────────── */

type AlgSpec = { family: "HS" | "RS" | "PS" | "ES" | "Ed"; hash: string; bits: number; curve?: string; desc: string };

export const ALGS: Record<string, AlgSpec> = {
  HS256: { family: "HS", hash: "SHA-256", bits: 256, desc: "HMAC with SHA-256 — symmetric: the same secret signs and verifies" },
  HS384: { family: "HS", hash: "SHA-384", bits: 384, desc: "HMAC with SHA-384 — symmetric shared secret" },
  HS512: { family: "HS", hash: "SHA-512", bits: 512, desc: "HMAC with SHA-512 — symmetric shared secret" },
  RS256: { family: "RS", hash: "SHA-256", bits: 256, desc: "RSASSA-PKCS1-v1_5 with SHA-256 — sign with the RSA private key, verify with the public key" },
  RS384: { family: "RS", hash: "SHA-384", bits: 384, desc: "RSASSA-PKCS1-v1_5 with SHA-384" },
  RS512: { family: "RS", hash: "SHA-512", bits: 512, desc: "RSASSA-PKCS1-v1_5 with SHA-512" },
  PS256: { family: "PS", hash: "SHA-256", bits: 256, desc: "RSASSA-PSS with SHA-256 and MGF1 — randomised RSA signatures" },
  PS384: { family: "PS", hash: "SHA-384", bits: 384, desc: "RSASSA-PSS with SHA-384" },
  PS512: { family: "PS", hash: "SHA-512", bits: 512, desc: "RSASSA-PSS with SHA-512" },
  ES256: { family: "ES", hash: "SHA-256", bits: 256, curve: "P-256", desc: "ECDSA on P-256 with SHA-256 — small keys and signatures (64 bytes)" },
  ES384: { family: "ES", hash: "SHA-384", bits: 384, curve: "P-384", desc: "ECDSA on P-384 with SHA-384 (96-byte signatures)" },
  ES512: { family: "ES", hash: "SHA-512", bits: 512, curve: "P-521", desc: "ECDSA on P-521 with SHA-512 (132-byte signatures)" },
  EdDSA: { family: "Ed", hash: "", bits: 256, desc: "Ed25519 signatures (browser support varies)" },
  Ed25519: { family: "Ed", hash: "", bits: 256, desc: "Ed25519 signatures (browser support varies)" },
};

export function algInfo(alg: unknown): string {
  if (alg === "none") return "none — an unsecured token with no signature. Never accept these.";
  return ALGS[String(alg)]?.desc ?? `${String(alg)} — not a JWS algorithm this tool can check`;
}

/* ── DER / PEM ───────────────────────────────────────────────────────── */

const cat = (...xs: (Uint8Array | number[])[]) => {
  const n = xs.reduce((a, x) => a + x.length, 0);
  const out = new Uint8Array(n);
  let o = 0;
  for (const x of xs) { out.set(x, o); o += x.length; }
  return out;
};
const derLen = (n: number): number[] => {
  if (n < 128) return [n];
  const b: number[] = [];
  while (n) { b.unshift(n & 255); n = Math.floor(n / 256); }
  return [0x80 | b.length, ...b];
};
const tlv = (tag: number, body: Uint8Array) => cat([tag], derLen(body.length), body);
const OID_RSA = [0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01];
const OID_EC = [0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01];
const NULL = [0x05, 0x00];

type Der = { tag: number; start: number; hdr: number; len: number; bytes: Uint8Array };
function derRead(b: Uint8Array, at: number): Der {
  const tag = b[at];
  let len = b[at + 1];
  let hdr = 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + b[at + 2 + i];
    hdr += n;
  }
  if (at + hdr + len > b.length) throw new ToolError("The key's DER structure is truncated.");
  return { tag, start: at, hdr, len, bytes: b.subarray(at, at + hdr + len) };
}
function derKids(b: Uint8Array, d: Der): Der[] {
  const out: Der[] = [];
  let at = d.start + d.hdr;
  const end = d.start + d.hdr + d.len;
  while (at < end) {
    const k = derRead(b, at);
    out.push(k);
    at += k.hdr + k.len;
  }
  return out;
}

export function pemBlocks(text: string): { label: string; der: Uint8Array }[] {
  const out: { label: string; der: Uint8Array }[] = [];
  const re = /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const body = m[2].replace(/^[A-Za-z-]+:.*$/gm, "").replace(/\s+/g, "");
    const bin = atob(body);
    out.push({ label: m[1], der: Uint8Array.from(bin, (c) => c.charCodeAt(0)) });
  }
  return out;
}

function spkiFromCert(der: Uint8Array): Uint8Array {
  const cert = derRead(der, 0);
  const tbs = derKids(der, cert)[0];
  const f = derKids(der, tbs);
  const i = f[0].tag === 0xa0 ? 1 : 0;
  return f[i + 5].bytes;
}

function sec1ToPkcs8(der: Uint8Array): Uint8Array {
  const seq = derRead(der, 0);
  const kids = derKids(der, seq);
  const params = kids.find((k) => k.tag === 0xa0);
  if (!params) throw new ToolError("This EC PRIVATE KEY has no curve parameters; export it as PKCS#8 (BEGIN PRIVATE KEY) instead.");
  const curveOid = derKids(der, params)[0].bytes;
  return tlv(0x30, cat([0x02, 0x01, 0x00], tlv(0x30, cat(OID_EC, curveOid)), tlv(0x04, der)));
}

type KeyMaterial = { kind: "spki" | "pkcs8"; der: Uint8Array } | { kind: "jwk"; jwk: JsonWebKey & { kid?: string } };

function readKey(text: string, kid?: string): KeyMaterial {
  const t = text.trim();
  if (!t) throw new ToolError("Paste the key: a PEM block (public key, certificate or private key) or a JWK.");
  if (t.startsWith("{")) {
    let j: Record<string, unknown>;
    try {
      j = JSON.parse(t);
    } catch (e) {
      throw new ToolError(`The key looks like a JWK but is not valid JSON: ${(e as Error).message}`);
    }
    if (Array.isArray(j.keys)) {
      const keys = j.keys as (JsonWebKey & { kid?: string })[];
      const k = (kid && keys.find((x) => x.kid === kid)) || keys[0];
      if (!k) throw new ToolError("The JWK Set has no keys.");
      return { kind: "jwk", jwk: k };
    }
    return { kind: "jwk", jwk: j as JsonWebKey };
  }
  const blocks = pemBlocks(t);
  if (!blocks.length) throw new ToolError("The key is not PEM or JWK. Expect -----BEGIN PUBLIC KEY----- … or a JSON Web Key.");
  const b = blocks.find((x) => /PUBLIC KEY|CERTIFICATE|PRIVATE KEY/.test(x.label)) ?? blocks[0];
  switch (b.label) {
    case "PUBLIC KEY":
      return { kind: "spki", der: b.der };
    case "RSA PUBLIC KEY":
      return { kind: "spki", der: tlv(0x30, cat(tlv(0x30, cat(OID_RSA, NULL)), tlv(0x03, cat([0], b.der)))) };
    case "CERTIFICATE":
      return { kind: "spki", der: spkiFromCert(b.der) };
    case "PRIVATE KEY":
      return { kind: "pkcs8", der: b.der };
    case "RSA PRIVATE KEY":
      return { kind: "pkcs8", der: tlv(0x30, cat([0x02, 0x01, 0x00], tlv(0x30, cat(OID_RSA, NULL)), tlv(0x04, b.der))) };
    case "EC PRIVATE KEY":
      return { kind: "pkcs8", der: sec1ToPkcs8(b.der) };
    case "ENCRYPTED PRIVATE KEY":
      throw new ToolError("This private key is password-encrypted. Decrypt it first (openssl pkcs8 -in key.pem -nocrypt … ) — this tool never asks for passphrases.");
    default:
      throw new ToolError(`Unsupported PEM block “${b.label}”. Use PUBLIC KEY, RSA PUBLIC KEY, CERTIFICATE or (for signing) PRIVATE KEY.`);
  }
}

export type SecretEnc = "text" | "base64" | "hex";

export function secretBytes(s: string, enc: SecretEnc): Uint8Array {
  if (enc === "text") return utf8Encode(s);
  if (enc === "hex") {
    const h = s.replace(/\s+|^0x/gi, "");
    if (!/^([0-9a-f]{2})*$/i.test(h)) throw new ToolError("The secret is not valid hex (need pairs of 0–9 a–f).");
    return Uint8Array.from(h.match(/../g) ?? [], (x) => parseInt(x, 16));
  }
  const c = s.trim().replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
  if (!/^[A-Za-z0-9+/]*$/.test(c)) throw new ToolError("The secret is not valid Base64.");
  const bin = atob(c + "===".slice((c.length + 3) % 4));
  return Uint8Array.from(bin, (x) => x.charCodeAt(0));
}

function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new ToolError("WebCrypto is unavailable here (it needs a secure context: https or localhost).");
  return s;
}

function importAlg(spec: AlgSpec): RsaHashedImportParams | EcKeyImportParams | Algorithm {
  if (spec.family === "RS") return { name: "RSASSA-PKCS1-v1_5", hash: spec.hash };
  if (spec.family === "PS") return { name: "RSA-PSS", hash: spec.hash };
  if (spec.family === "ES") return { name: "ECDSA", namedCurve: spec.curve! };
  return { name: "Ed25519" };
}

function sigAlg(spec: AlgSpec): AlgorithmIdentifier | RsaPssParams | EcdsaParams {
  if (spec.family === "PS") return { name: "RSA-PSS", saltLength: spec.bits / 8 };
  if (spec.family === "ES") return { name: "ECDSA", hash: spec.hash };
  if (spec.family === "RS") return { name: "RSASSA-PKCS1-v1_5" };
  return { name: "Ed25519" };
}

function publicJwk(j: JsonWebKey): JsonWebKey {
  const { d: _d, p: _p, q: _q, dp: _dp, dq: _dq, qi: _qi, key_ops: _ops, use: _use, alg: _alg, ...rest } = j as JsonWebKey & { use?: string };
  return { ...rest, ext: true };
}

function keyError(e: unknown, alg: string, what: string): ToolError {
  const m = (e as Error)?.message ?? String(e);
  return new ToolError(`Could not use the ${what} for ${alg}: ${m}. Check that the key type matches the algorithm (${ALGS[alg]?.family === "ES" ? `an EC ${ALGS[alg].curve} key` : ALGS[alg]?.family === "Ed" ? "an Ed25519 key" : "an RSA key"}).`);
}

async function publicKeyFor(alg: string, spec: AlgSpec, text: string, kid?: string): Promise<{ key: CryptoKey; from: string }> {
  const km = readKey(text, kid);
  const s = subtle();
  const ia = importAlg(spec);
  try {
    if (km.kind === "spki") return { key: await s.importKey("spki", km.der as BufferSource, ia, true, ["verify"]), from: "PEM public key" };
    if (km.kind === "jwk") {
      if (km.jwk.kty === "oct") throw new ToolError("That JWK is a symmetric (oct) key — it goes with HS* algorithms.");
      return { key: await s.importKey("jwk", publicJwk(km.jwk), ia, true, ["verify"]), from: `JWK${km.jwk.kid ? ` (kid ${km.jwk.kid})` : ""}` };
    }
    // A private key: derive its public half through JWK.
    const priv = await s.importKey("pkcs8", km.der as BufferSource, ia, true, ["sign"]);
    const jwk = await s.exportKey("jwk", priv);
    return { key: await s.importKey("jwk", publicJwk(jwk), ia, true, ["verify"]), from: "public half of the private key" };
  } catch (e) {
    if (e instanceof ToolError) throw e;
    throw keyError(e, alg, "key");
  }
}

export type Verification = { ok: boolean; title: string; detail: string };

export async function verifyJwt(jwt: Jwt, keyText: string, enc: SecretEnc): Promise<Verification> {
  const alg = String(jwt.header.alg ?? "");
  if (jwt.kind === "JWE") return { ok: false, title: "Encrypted token", detail: "A JWE is decrypted, not verified." };
  if (alg === "none") {
    return jwt.segs[2]
      ? { ok: false, title: "Invalid: alg none with a signature", detail: "The header says unsigned but a signature is present." }
      : { ok: false, title: "Unsecured token (alg: none)", detail: "There is no signature to check. Servers must reject these." };
  }
  const spec = ALGS[alg];
  if (!spec) return { ok: false, title: `Unsupported algorithm ${alg || "(missing)"}`, detail: "Supported: HS256/384/512, RS256/384/512, PS256/384/512, ES256/384/512, EdDSA." };
  if (!keyText.trim()) return { ok: false, title: "Signature not checked", detail: spec.family === "HS" ? "Enter the shared secret to verify." : "Paste the public key (PEM or JWK) to verify." };
  const data = utf8Encode(`${jwt.segs[0]}.${jwt.segs[1]}`);
  const s = subtle();
  if (spec.family === "HS") {
    const secret = secretBytes(keyText, enc);
    const key = await s.importKey("raw", secret as BufferSource, { name: "HMAC", hash: spec.hash }, false, ["verify"]);
    const ok = await s.verify("HMAC", key, jwt.signature as BufferSource, data as BufferSource);
    const weak = secret.length < spec.bits / 8 ? ` Note: the secret is ${secret.length} bytes; RFC 7518 requires at least ${spec.bits / 8} for ${alg}.` : "";
    return ok
      ? { ok, title: "Signature verified", detail: `HMAC-${spec.hash} matches with the ${secret.length}-byte secret.${weak}` }
      : { ok, title: "Invalid signature", detail: `The HMAC does not match. Wrong secret${enc === "text" ? " — or is the secret Base64-encoded?" : " or wrong encoding"}${weak}` };
  }
  const { key, from } = await publicKeyFor(alg, spec, keyText, typeof jwt.header.kid === "string" ? jwt.header.kid : undefined);
  const expectLen = spec.family === "ES" ? { "P-256": 64, "P-384": 96, "P-521": 132 }[spec.curve!] : undefined;
  if (expectLen && jwt.signature.length !== expectLen)
    return { ok: false, title: "Invalid signature", detail: `${alg} signatures are ${expectLen} bytes (raw r‖s); this one is ${jwt.signature.length}${jwt.signature[0] === 0x30 ? " and looks DER-encoded — JWS requires the raw form" : ""}.` };
  let ok = false;
  try {
    ok = await s.verify(sigAlg(spec), key, jwt.signature as BufferSource, data as BufferSource);
  } catch (e) {
    throw keyError(e, alg, "key");
  }
  return ok
    ? { ok, title: "Signature verified", detail: `${alg} signature is valid for the ${from}.` }
    : { ok, title: "Invalid signature", detail: `The ${alg} signature does not match the ${from}. The token was altered, or it was signed by a different key.` };
}

export async function signJwt(headerText: string, payloadText: string, keyText: string, enc: SecretEnc): Promise<string> {
  const header = parseJsonSeg(headerText.trim() || "{}", "header") as Record<string, unknown>;
  if (!header || typeof header !== "object" || Array.isArray(header)) throw new ToolError("The header must be a JSON object.");
  const payload = parseJsonSeg(payloadText.trim() || "{}", "payload");
  const alg = String(header.alg ?? "");
  const h = b64url(utf8Encode(JSON.stringify(header)));
  const p = b64url(utf8Encode(JSON.stringify(payload)));
  const data = utf8Encode(`${h}.${p}`);
  if (alg === "none") return `${h}.${p}.`;
  const spec = ALGS[alg];
  if (!spec) throw new ToolError(`Set "alg" in the header to one of: ${Object.keys(ALGS).join(", ")} (or "none").`);
  if (!keyText.trim()) throw new ToolError(spec.family === "HS" ? `Enter a secret to sign with ${alg}.` : `Paste a private key (PEM PKCS#8 / PKCS#1 / SEC1, or a private JWK) to sign with ${alg}.`);
  const s = subtle();
  let sig: ArrayBuffer;
  if (spec.family === "HS") {
    const key = await s.importKey("raw", secretBytes(keyText, enc) as BufferSource, { name: "HMAC", hash: spec.hash }, false, ["sign"]);
    sig = await s.sign("HMAC", key, data as BufferSource);
  } else {
    const km = readKey(keyText, typeof header.kid === "string" ? header.kid : undefined);
    if (km.kind === "spki") throw new ToolError("That is a public key — signing needs the private key (BEGIN PRIVATE KEY).");
    let key: CryptoKey;
    try {
      if (km.kind === "jwk") {
        if (!km.jwk.d) throw new ToolError("That JWK has no private part (\"d\") — signing needs the private key.");
        const { key_ops: _o, use: _u, alg: _a, ...j } = km.jwk as JsonWebKey & { use?: string };
        key = await s.importKey("jwk", j, importAlg(spec), false, ["sign"]);
      } else key = await s.importKey("pkcs8", km.der as BufferSource, importAlg(spec), false, ["sign"]);
    } catch (e) {
      if (e instanceof ToolError) throw e;
      throw keyError(e, alg, "private key");
    }
    sig = await s.sign(sigAlg(spec), key, data as BufferSource);
  }
  return `${h}.${p}.${b64url(new Uint8Array(sig))}`;
}
