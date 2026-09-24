/**
 * A small DER/ASN.1 parser plus X.509 certificate and PKCS#10 CSR decoding.
 * Everything runs locally; signatures are checked with SubtleCrypto.
 */
import { ToolError } from "../types";

/* ── DER ───────────────────────────────────────────────────────────────── */

export type Node = {
  cls: number; // 0 universal, 1 application, 2 context, 3 private
  tag: number;
  constructed: boolean;
  start: number; // header start
  hdr: number; // header length
  len: number; // content length
  children?: Node[];
  /** Parsed from inside an OCTET/BIT STRING whose content is itself DER. */
  encapsulated?: Node[];
};

export class Der {
  constructor(public b: Uint8Array) {}
  content(n: Node) {
    return this.b.subarray(n.start + n.hdr, n.start + n.hdr + n.len);
  }
  raw(n: Node) {
    return this.b.subarray(n.start, n.start + n.hdr + n.len);
  }
}

export function parseDer(b: Uint8Array, start = 0, end = b.length, depth = 0): Node[] {
  const out: Node[] = [];
  let p = start;
  while (p < end) {
    if (depth > 40) throw new ToolError("ASN.1 nesting is too deep.");
    const first = b[p];
    const cls = first >> 6;
    const constructed = !!(first & 0x20);
    let tag = first & 0x1f;
    let q = p + 1;
    if (tag === 0x1f) {
      tag = 0;
      while (q < end && b[q] & 0x80) tag = (tag << 7) | (b[q++] & 0x7f);
      tag = (tag << 7) | b[q++];
    }
    if (q >= end) throw new ToolError(`Truncated DER at byte ${p}.`);
    let len = b[q++];
    if (len & 0x80) {
      const n = len & 0x7f;
      if (n === 0 || n > 4) throw new ToolError(`Unsupported DER length encoding at byte ${q - 1} (indefinite or >4 bytes).`);
      len = 0;
      for (let i = 0; i < n; i++) len = len * 256 + b[q++];
    }
    const hdr = q - p;
    if (q + len > end) throw new ToolError(`DER element at byte ${p} claims ${len} bytes but only ${end - q} remain — the data is truncated or not DER.`);
    const node: Node = { cls, tag, constructed, start: p, hdr, len };
    if (constructed) node.children = parseDer(b, q, q + len, depth + 1);
    else if (cls === 0 && (tag === 4 || tag === 3) && len > 2) {
      // Try to read OCTET/BIT STRING content as nested DER (extensions, keys).
      const off = tag === 3 ? q + 1 : q;
      if ((b[off] === 0x30 || b[off] === 0x04 || b[off] === 0x03 || b[off] === 0x02) && (tag !== 3 || b[q] === 0)) {
        try {
          const inner = parseDer(b, off, q + len, depth + 1);
          if (inner.length && inner[inner.length - 1].start + inner[inner.length - 1].hdr + inner[inner.length - 1].len === q + len) node.encapsulated = inner;
        } catch {
          /* plain bytes */
        }
      }
    }
    out.push(node);
    p = q + len;
  }
  return out;
}

export function oidToString(c: Uint8Array): string {
  const parts: number[] = [];
  let v = 0;
  for (let i = 0; i < c.length; i++) {
    v = v * 128 + (c[i] & 0x7f);
    if (!(c[i] & 0x80)) {
      if (!parts.length) {
        const a = v < 40 ? 0 : v < 80 ? 1 : 2;
        parts.push(a, v - a * 40);
      } else parts.push(v);
      v = 0;
    }
  }
  return parts.join(".");
}

const hex = (b: Uint8Array, sep = "") => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join(sep);
export { hex as toHexBytes };

function decodeString(tag: number, c: Uint8Array): string {
  if (tag === 30) {
    let s = "";
    for (let i = 0; i + 1 < c.length; i += 2) s += String.fromCharCode((c[i] << 8) | c[i + 1]);
    return s;
  }
  if (tag === 28) {
    let s = "";
    for (let i = 0; i + 3 < c.length; i += 4) s += String.fromCodePoint(((c[i] << 24) | (c[i + 1] << 16) | (c[i + 2] << 8) | c[i + 3]) >>> 0);
    return s;
  }
  if (tag === 20) return Array.from(c, (x) => String.fromCharCode(x)).join("");
  return new TextDecoder().decode(c);
}

const STRING_TAGS = new Set([12, 18, 19, 20, 22, 26, 27, 28, 30]);

function parseTime(tag: number, s: string): Date {
  let m;
  if (tag === 23 && (m = /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?Z$/.exec(s))) {
    const y = Number(m[1]);
    return new Date(Date.UTC(y < 50 ? 2000 + y : 1900 + y, Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0)));
  }
  if (tag === 24 && (m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?(\.\d+)?Z$/.exec(s)))
    return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0)));
  return new Date(NaN);
}

/* ── OID names ─────────────────────────────────────────────────────────── */

export const OIDS: Record<string, string> = {
  "1.2.840.113549.1.1.1": "rsaEncryption",
  "1.2.840.113549.1.1.4": "md5WithRSAEncryption",
  "1.2.840.113549.1.1.5": "sha1WithRSAEncryption",
  "1.2.840.113549.1.1.10": "RSASSA-PSS",
  "1.2.840.113549.1.1.11": "sha256WithRSAEncryption",
  "1.2.840.113549.1.1.12": "sha384WithRSAEncryption",
  "1.2.840.113549.1.1.13": "sha512WithRSAEncryption",
  "1.2.840.113549.1.1.14": "sha224WithRSAEncryption",
  "1.2.840.10045.2.1": "id-ecPublicKey",
  "1.2.840.10045.4.1": "ecdsa-with-SHA1",
  "1.2.840.10045.4.3.1": "ecdsa-with-SHA224",
  "1.2.840.10045.4.3.2": "ecdsa-with-SHA256",
  "1.2.840.10045.4.3.3": "ecdsa-with-SHA384",
  "1.2.840.10045.4.3.4": "ecdsa-with-SHA512",
  "1.2.840.10045.3.1.7": "prime256v1 (P-256)",
  "1.3.132.0.34": "secp384r1 (P-384)",
  "1.3.132.0.35": "secp521r1 (P-521)",
  "1.3.132.0.10": "secp256k1",
  "1.3.36.3.3.2.8.1.1.7": "brainpoolP256r1",
  "1.3.101.110": "X25519",
  "1.3.101.111": "X448",
  "1.3.101.112": "Ed25519",
  "1.3.101.113": "Ed448",
  "1.2.840.10040.4.1": "DSA",
  "1.2.840.10040.4.3": "dsa-with-SHA1",
  "2.16.840.1.101.3.4.3.2": "dsa-with-SHA256",
  "2.16.840.1.101.3.4.2.1": "SHA-256",
  "2.16.840.1.101.3.4.2.2": "SHA-384",
  "2.16.840.1.101.3.4.2.3": "SHA-512",
  "2.5.4.3": "CN",
  "2.5.4.4": "SN",
  "2.5.4.5": "serialNumber",
  "2.5.4.6": "C",
  "2.5.4.7": "L",
  "2.5.4.8": "ST",
  "2.5.4.9": "street",
  "2.5.4.10": "O",
  "2.5.4.11": "OU",
  "2.5.4.12": "title",
  "2.5.4.15": "businessCategory",
  "2.5.4.17": "postalCode",
  "2.5.4.42": "GN",
  "2.5.4.97": "organizationIdentifier",
  "1.2.840.113549.1.9.1": "emailAddress",
  "1.2.840.113549.1.9.14": "extensionRequest",
  "1.2.840.113549.1.9.7": "challengePassword",
  "0.9.2342.19200300.100.1.25": "DC",
  "0.9.2342.19200300.100.1.1": "UID",
  "1.3.6.1.4.1.311.60.2.1.3": "jurisdictionC",
  "1.3.6.1.4.1.311.60.2.1.2": "jurisdictionST",
  "2.5.29.14": "Subject Key Identifier",
  "2.5.29.15": "Key Usage",
  "2.5.29.17": "Subject Alternative Name",
  "2.5.29.18": "Issuer Alternative Name",
  "2.5.29.19": "Basic Constraints",
  "2.5.29.30": "Name Constraints",
  "2.5.29.31": "CRL Distribution Points",
  "2.5.29.32": "Certificate Policies",
  "2.5.29.35": "Authority Key Identifier",
  "2.5.29.37": "Extended Key Usage",
  "2.5.29.36": "Policy Constraints",
  "2.5.29.54": "Inhibit anyPolicy",
  "1.3.6.1.5.5.7.1.1": "Authority Information Access",
  "1.3.6.1.5.5.7.1.11": "Subject Information Access",
  "1.3.6.1.5.5.7.1.24": "TLS Feature",
  "1.3.6.1.4.1.11129.2.4.2": "CT Precertificate SCTs",
  "1.3.6.1.4.1.11129.2.4.3": "CT Precertificate Poison",
  "1.3.6.1.5.5.7.3.1": "serverAuth",
  "1.3.6.1.5.5.7.3.2": "clientAuth",
  "1.3.6.1.5.5.7.3.3": "codeSigning",
  "1.3.6.1.5.5.7.3.4": "emailProtection",
  "1.3.6.1.5.5.7.3.8": "timeStamping",
  "1.3.6.1.5.5.7.3.9": "OCSPSigning",
  "2.5.29.37.0": "anyExtendedKeyUsage",
  "1.3.6.1.4.1.311.10.3.3": "Microsoft SGC",
  "2.16.840.1.113730.4.1": "Netscape SGC",
  "1.3.6.1.5.5.7.48.1": "OCSP",
  "1.3.6.1.5.5.7.48.2": "CA Issuers",
  "1.3.6.1.5.5.7.2.1": "CPS",
  "1.3.6.1.5.5.7.2.2": "User Notice",
  "2.5.29.32.0": "anyPolicy",
  "2.23.140.1.1": "EV (CA/B Forum)",
  "2.23.140.1.2.1": "Domain Validated (CA/B Forum)",
  "2.23.140.1.2.2": "Organization Validated (CA/B Forum)",
  "2.23.140.1.2.3": "Individual Validated (CA/B Forum)",
  "1.3.6.1.4.1.44947.1.1.1": "ISRG Domain Validated",
};

export const oidName = (oid: string) => OIDS[oid] ?? oid;

/* ── generic value rendering (tree view) ──────────────────────────────── */

const TAG_NAMES: Record<number, string> = { 1: "BOOLEAN", 2: "INTEGER", 3: "BIT STRING", 4: "OCTET STRING", 5: "NULL", 6: "OBJECT IDENTIFIER", 10: "ENUMERATED", 12: "UTF8String", 16: "SEQUENCE", 17: "SET", 18: "NumericString", 19: "PrintableString", 20: "T61String", 22: "IA5String", 23: "UTCTime", 24: "GeneralizedTime", 26: "VisibleString", 28: "UniversalString", 30: "BMPString" };

export function tagName(n: Node): string {
  if (n.cls === 0) return TAG_NAMES[n.tag] ?? `UNIVERSAL ${n.tag}`;
  if (n.cls === 2) return `[${n.tag}]`;
  return `${["UNIVERSAL", "APPLICATION", "CONTEXT", "PRIVATE"][n.cls]} ${n.tag}`;
}

function scalar(d: Der, n: Node): string {
  const c = d.content(n);
  if (n.cls === 0) {
    switch (n.tag) {
      case 1: return c[0] ? "TRUE" : "FALSE";
      case 2: return c.length <= 6 ? String(c.reduce((a, x, i) => (i === 0 && x & 0x80 ? x - 256 : a * 256 + x), 0)) : `0x${hex(c)} (${bitLen(c)} bits)`;
      case 5: return "NULL";
      case 6: { const o = oidToString(c); return OIDS[o] ? `${o} (${OIDS[o]})` : o; }
      case 23:
      case 24: return decodeString(n.tag, c) + " → " + parseTime(n.tag, decodeString(n.tag, c)).toISOString();
      case 3: return `${(c.length - 1) * 8 - c[0]} bits: ${hex(c.subarray(1, 33), " ")}${c.length > 33 ? " …" : ""}`;
      case 4: return `${c.length} bytes: ${hex(c.subarray(0, 32), " ")}${c.length > 32 ? " …" : ""}`;
    }
    if (STRING_TAGS.has(n.tag)) return JSON.stringify(decodeString(n.tag, c));
  }
  if (n.cls === 2 && !n.constructed) {
    const printable = c.length && Array.from(c).every((x) => x >= 0x20 && x < 0x7f);
    return printable ? JSON.stringify(decodeString(22, c)) : `${c.length} bytes: ${hex(c.subarray(0, 32), " ")}`;
  }
  return `${c.length} bytes`;
}

export function toTree(d: Der, nodes: Node[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  nodes.forEach((n, i) => {
    const kids = n.children ?? n.encapsulated;
    const label = `${i} · ${tagName(n)}${kids ? ` (${kids.length})` : ""} @${n.start}+${n.hdr + n.len}`;
    if (kids) {
      const inner = toTree(d, kids);
      out[label] = n.encapsulated && n.tag === 3 ? { "(encapsulated)": inner } : inner;
    } else out[label] = scalar(d, n);
  });
  return out;
}

function bitLen(c: Uint8Array): number {
  let i = 0;
  while (i < c.length && c[i] === 0) i++;
  if (i === c.length) return 0;
  return (c.length - i - 1) * 8 + (32 - Math.clz32(c[i]));
}

/* ── X.509 / CSR ───────────────────────────────────────────────────────── */

export type Rdn = { oid: string; name: string; value: string };
export type Ext = { oid: string; name: string; critical: boolean; value: string; detail?: unknown };
export type Decoded = {
  kind: "certificate" | "csr";
  der: Uint8Array;
  version: number;
  serial?: string;
  sigAlg: string;
  sigAlgOid: string;
  issuer: Rdn[];
  subject: Rdn[];
  notBefore?: Date;
  notAfter?: Date;
  keyAlg: string;
  keyDetail: string;
  keyBits?: number;
  spki: Uint8Array;
  keyAlgOid: string;
  curveOid?: string;
  extensions: Ext[];
  san: string[];
  ski?: string;
  aki?: string;
  isCA: boolean;
  tbs: Uint8Array;
  signature: Uint8Array;
  tree: Record<string, unknown>;
};

const e = (n: Node | undefined, what: string): Node => {
  if (!n) throw new ToolError(`Malformed certificate: missing ${what}.`);
  return n;
};

function parseName(d: Der, n: Node): Rdn[] {
  const out: Rdn[] = [];
  for (const set of n.children ?? [])
    for (const atv of set.children ?? []) {
      const [o, v] = atv.children ?? [];
      if (!o || !v) continue;
      const oid = oidToString(d.content(o));
      out.push({ oid, name: OIDS[oid] ?? oid, value: STRING_TAGS.has(v.tag) ? decodeString(v.tag, d.content(v)) : hex(d.content(v)) });
    }
  return out;
}

export const dnString = (r: Rdn[]) => r.map((x) => `${x.name}=${x.value.replace(/([,+"\\<>;])/g, "\\$1")}`).join(", ");
export const dnKey = (r: Rdn[]) => r.map((x) => `${x.oid}=${x.value.trim().toLowerCase().replace(/\s+/g, " ")}`).join("|");

function generalName(d: Der, n: Node): string {
  const c = d.content(n);
  switch (n.tag) {
    case 0: return "otherName";
    case 1: return `email:${decodeString(22, c)}`;
    case 2: return `DNS:${decodeString(22, c)}`;
    case 4: return `DirName:${dnString(parseName(d, n.children?.[0] ?? n))}`;
    case 6: return `URI:${decodeString(22, c)}`;
    case 7:
      if (c.length === 4) return `IP:${Array.from(c).join(".")}`;
      if (c.length === 16) {
        const groups: string[] = [];
        for (let i = 0; i < 16; i += 2) groups.push(((c[i] << 8) | c[i + 1]).toString(16));
        return `IP:${groups.join(":").replace(/(^|:)0(:0)+(:|$)/, "::").replace(/:::+/, "::")}`;
      }
      return `IP:${hex(c)}`;
    case 8: return `RID:${oidToString(c)}`;
  }
  return `[${n.tag}]`;
}

const KU = ["digitalSignature", "nonRepudiation", "keyEncipherment", "dataEncipherment", "keyAgreement", "keyCertSign", "cRLSign", "encipherOnly", "decipherOnly"];

function uris(d: Der, n: Node, acc: string[] = []): string[] {
  if (n.cls === 2 && n.tag === 6 && !n.constructed) acc.push(decodeString(22, d.content(n)));
  for (const k of n.children ?? []) uris(d, k, acc);
  return acc;
}

function parseSct(c: Uint8Array): { log: string; time: string; sig: string }[] {
  const out: { log: string; time: string; sig: string }[] = [];
  if (c.length < 2) return out;
  const total = (c[0] << 8) | c[1];
  let p = 2;
  while (p + 2 <= Math.min(c.length, total + 2)) {
    const len = (c[p] << 8) | c[p + 1];
    const s = c.subarray(p + 2, p + 2 + len);
    p += 2 + len;
    if (s.length < 43) break;
    const log = btoaBytes(s.subarray(1, 33));
    let ts = 0;
    for (let i = 33; i < 41; i++) ts = ts * 256 + s[i];
    const extLen = (s[41] << 8) | s[42];
    const q = 43 + extLen;
    const hashAlg = ["none", "md5", "sha1", "sha224", "sha256", "sha384", "sha512"][s[q]] ?? String(s[q]);
    const sigAlg = ["anonymous", "rsa", "dsa", "ecdsa"][s[q + 1]] ?? String(s[q + 1]);
    out.push({ log, time: new Date(ts).toISOString(), sig: `${sigAlg}-with-${hashAlg}` });
  }
  return out;
}

function btoaBytes(b: Uint8Array) {
  let s = "";
  b.forEach((x) => (s += String.fromCharCode(x)));
  return btoa(s);
}

function parseExtension(d: Der, ext: Node): Ext {
  const kids = ext.children ?? [];
  const oid = oidToString(d.content(kids[0]));
  const critical = kids[1]?.tag === 1 ? !!d.content(kids[1])[0] : false;
  const valNode = kids[kids.length - 1];
  const inner = valNode.encapsulated?.[0];
  const content = d.content(valNode);
  const name = oidName(oid);
  let value = "";
  let detail: unknown;
  try {
    switch (oid) {
      case "2.5.29.17":
      case "2.5.29.18": {
        const names = (inner?.children ?? []).map((g) => generalName(d, g));
        value = names.join(", ");
        detail = names;
        break;
      }
      case "2.5.29.15": {
        const c = inner ? d.content(inner) : new Uint8Array();
        const bits: string[] = [];
        for (let i = 0; i < 9; i++) if (c[1 + (i >> 3)] & (0x80 >> (i & 7))) bits.push(KU[i]);
        value = bits.join(", ");
        detail = bits;
        break;
      }
      case "2.5.29.37": {
        const list = (inner?.children ?? []).map((o) => oidName(oidToString(d.content(o))));
        value = list.join(", ");
        detail = list;
        break;
      }
      case "2.5.29.19": {
        const k = inner?.children ?? [];
        const ca = k[0]?.tag === 1 ? !!d.content(k[0])[0] : false;
        const pl = k.find((x) => x.tag === 2);
        value = `CA: ${ca ? "TRUE" : "FALSE"}${pl ? `, pathlen: ${d.content(pl).reduce((a, x) => a * 256 + x, 0)}` : ""}`;
        detail = { ca, pathLen: pl ? d.content(pl).reduce((a, x) => a * 256 + x, 0) : null };
        break;
      }
      case "2.5.29.14":
        value = inner ? hex(d.content(inner), ":").toUpperCase() : "";
        break;
      case "2.5.29.35": {
        const kid = inner?.children?.find((x) => x.cls === 2 && x.tag === 0);
        value = kid ? `keyid:${hex(d.content(kid), ":").toUpperCase()}` : "(issuer/serial form)";
        break;
      }
      case "2.5.29.31": {
        const list = inner ? uris(d, inner) : [];
        value = list.join(", ");
        detail = list;
        break;
      }
      case "1.3.6.1.5.5.7.1.1":
      case "1.3.6.1.5.5.7.1.11": {
        const list = (inner?.children ?? []).map((ad) => `${oidName(oidToString(d.content(ad.children![0])))}: ${generalName(d, ad.children![1]).replace(/^URI:/, "")}`);
        value = list.join(", ");
        detail = list;
        break;
      }
      case "2.5.29.32": {
        const list = (inner?.children ?? []).map((pi) => {
          const o = oidToString(d.content(pi.children![0]));
          const cps = pi.children![1] ? uris(d, pi.children![1]) : [];
          const q = (pi.children?.[1]?.children ?? []).flatMap((qi) => (qi.children?.[1] && qi.children[1].tag === 22 ? [decodeString(22, d.content(qi.children[1]))] : []));
          return `${OIDS[o] ? `${OIDS[o]} (${o})` : o}${[...cps, ...q].length ? ` — CPS ${[...new Set([...cps, ...q])].join(" ")}` : ""}`;
        });
        value = list.join("; ");
        detail = list;
        break;
      }
      case "1.3.6.1.4.1.11129.2.4.2": {
        const sctBytes = inner && inner.tag === 4 ? d.content(inner) : content;
        const scts = parseSct(sctBytes);
        value = `${scts.length} SCT(s): ${scts.map((s) => `${s.time.slice(0, 10)} log ${s.log.slice(0, 12)}…`).join(", ")}`;
        detail = scts;
        break;
      }
      case "1.3.6.1.5.5.7.1.24":
        value = (inner?.children ?? []).map((x) => (d.content(x)[0] === 5 ? "status_request (OCSP Must-Staple)" : String(d.content(x)[0]))).join(", ");
        break;
      case "2.5.29.30":
        value = inner ? `${(inner.children ?? []).map((sub) => `${sub.tag === 0 ? "Permitted" : "Excluded"}: ${(sub.children ?? []).map((gs) => generalName(d, gs.children![0])).join(", ")}`).join("; ")}` : "";
        break;
      default:
        value = `${content.length} bytes: ${hex(content.subarray(0, 24), ":")}${content.length > 24 ? "…" : ""}`;
    }
  } catch {
    value = `${content.length} bytes (could not decode)`;
  }
  return { oid, name, critical, value, detail };
}

function parseSpki(d: Der, n: Node) {
  const [alg, bits] = n.children ?? [];
  const algOid = oidToString(d.content(alg.children![0]));
  const param = alg.children?.[1];
  let keyAlg = oidName(algOid);
  let keyDetail = "";
  let keyBits: number | undefined;
  let curveOid: string | undefined;
  if (algOid === "1.2.840.113549.1.1.1") {
    const seq = bits.encapsulated?.[0];
    const [mod, ex] = seq?.children ?? [];
    if (mod && ex) {
      keyBits = bitLen(d.content(mod));
      const exp = d.content(ex).reduce((a, x) => a * 256 + x, 0);
      keyAlg = "RSA";
      keyDetail = `${keyBits}-bit modulus, exponent ${exp}${exp === 65537 ? " (0x10001)" : ""}`;
    }
  } else if (algOid === "1.2.840.10045.2.1") {
    curveOid = param && param.tag === 6 ? oidToString(d.content(param)) : undefined;
    const curve = curveOid ? oidName(curveOid) : "explicit curve";
    keyAlg = "EC";
    keyBits = { "1.2.840.10045.3.1.7": 256, "1.3.132.0.34": 384, "1.3.132.0.35": 521, "1.3.132.0.10": 256 }[curveOid ?? ""];
    const c = d.content(bits);
    keyDetail = `${curve}${keyBits ? `, ${keyBits}-bit` : ""}, ${c[1] === 4 ? "uncompressed" : "compressed"} point`;
  } else if (algOid === "1.3.101.112" || algOid === "1.3.101.113") {
    keyBits = algOid === "1.3.101.112" ? 256 : 456;
    keyDetail = `${keyAlg} public key, ${(d.content(bits).length - 1) * 8} bits`;
  } else keyDetail = `${keyAlg}`;
  return { keyAlg, keyDetail, keyBits, keyAlgOid: algOid, curveOid, spki: d.raw(n).slice() };
}

export function decodeCert(der: Uint8Array): Decoded {
  const d = new Der(der);
  const top = parseDer(der);
  const root = e(top[0], "outer SEQUENCE");
  if (root.tag !== 16 || !root.children) throw new ToolError("Not an X.509 structure: expected a SEQUENCE at the start.");
  const [tbsN, sigAlgN, sigN] = root.children;
  const tbsKids = e(tbsN, "tbsCertificate").children ?? [];
  const sigAlgOid = oidToString(d.content(e(sigAlgN?.children?.[0], "signature algorithm")));
  const signature = d.content(e(sigN, "signature")).slice(1);
  const tree = toTree(d, top);
  const isCert = tbsKids[0]?.cls === 2 || (tbsKids[1]?.tag === 16 && tbsKids[1]?.children?.[0]?.tag === 6);
  if (isCert) {
    let i = 0;
    let version = 1;
    if (tbsKids[0].cls === 2 && tbsKids[0].tag === 0) {
      version = d.content(tbsKids[0].children![0])[0] + 1;
      i = 1;
    }
    const serialN = e(tbsKids[i++], "serial");
    i++; // signature algorithm (inner)
    const issuer = parseName(d, e(tbsKids[i++], "issuer"));
    const validity = e(tbsKids[i++], "validity").children ?? [];
    const subject = parseName(d, e(tbsKids[i++], "subject"));
    const spki = parseSpki(d, e(tbsKids[i++], "subjectPublicKeyInfo"));
    const extN = tbsKids.find((k) => k.cls === 2 && k.tag === 3);
    const extensions = (extN?.children?.[0]?.children ?? []).map((x) => parseExtension(d, x));
    const nb = validity[0], na = validity[1];
    const bc = extensions.find((x) => x.oid === "2.5.29.19");
    return {
      kind: "certificate",
      der,
      version,
      serial: hex(d.content(serialN), ":").toUpperCase(),
      sigAlg: oidName(sigAlgOid),
      sigAlgOid,
      issuer,
      subject,
      notBefore: parseTime(nb.tag, decodeString(nb.tag, d.content(nb))),
      notAfter: parseTime(na.tag, decodeString(na.tag, d.content(na))),
      ...spki,
      extensions,
      san: (extensions.find((x) => x.oid === "2.5.29.17")?.detail as string[]) ?? [],
      ski: extensions.find((x) => x.oid === "2.5.29.14")?.value,
      aki: extensions.find((x) => x.oid === "2.5.29.35")?.value.replace(/^keyid:/, ""),
      isCA: !!(bc?.detail as { ca?: boolean } | undefined)?.ca,
      tbs: d.raw(tbsN).slice(),
      signature,
      tree,
    };
  }
  // PKCS#10: SEQUENCE { version INTEGER, subject Name, SPKI, [0] attributes }
  const version = d.content(e(tbsKids[0], "version"))[0] + 1;
  const subject = parseName(d, e(tbsKids[1], "subject"));
  const spki = parseSpki(d, e(tbsKids[2], "subjectPublicKeyInfo"));
  const attrs = tbsKids[3]?.children ?? [];
  const extensions: Ext[] = [];
  for (const a of attrs) {
    const oid = oidToString(d.content(a.children![0]));
    if (oid === "1.2.840.113549.1.9.14") for (const x of a.children?.[1]?.children?.[0]?.children ?? []) extensions.push(parseExtension(d, x));
  }
  return {
    kind: "csr",
    der,
    version,
    sigAlg: oidName(sigAlgOid),
    sigAlgOid,
    issuer: [],
    subject,
    ...spki,
    extensions,
    san: (extensions.find((x) => x.oid === "2.5.29.17")?.detail as string[]) ?? [],
    isCA: false,
    tbs: d.raw(tbsN).slice(),
    signature,
    tree,
  };
}

/* ── PEM ───────────────────────────────────────────────────────────────── */

export type PemBlock = { label: string; der: Uint8Array; line: number };

export function readPem(src: string): PemBlock[] {
  const out: PemBlock[] = [];
  const re = /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/g;
  let m;
  while ((m = re.exec(src))) {
    const body = m[2].replace(/^[A-Za-z-]+:.*$/gm, "").replace(/\s+/g, "");
    let bin: string;
    try {
      bin = atob(body);
    } catch {
      throw new ToolError(`The ${m[1]} block starting on line ${src.slice(0, m.index).split("\n").length} is not valid Base64.`);
    }
    const der = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) der[i] = bin.charCodeAt(i);
    out.push({ label: m[1], der, line: src.slice(0, m.index).split("\n").length });
  }
  if (!out.length) {
    if (/-----BEGIN/.test(src)) throw new ToolError("Found a BEGIN line without a matching END line — the PEM block is truncated.");
    const b64 = src.replace(/\s+/g, "");
    if (/^[A-Za-z0-9+/=]+$/.test(b64) && b64.length > 40) {
      const bin = atob(b64);
      const der = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) der[i] = bin.charCodeAt(i);
      out.push({ label: "DER (base64)", der, line: 1 });
    } else if (/^[0-9a-f\s:]+$/i.test(src.trim()) && src.replace(/[\s:]/g, "").length > 80) {
      const h = src.replace(/[\s:]/g, "");
      const der = new Uint8Array(h.length / 2);
      for (let i = 0; i < der.length; i++) der[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
      out.push({ label: "DER (hex)", der, line: 1 });
    }
  }
  return out;
}

/* ── signatures & fingerprints ─────────────────────────────────────────── */

type Subtle = SubtleCrypto;
const subtle = (): Subtle | undefined => (globalThis.crypto as Crypto | undefined)?.subtle;

export async function digest(alg: "SHA-1" | "SHA-256", data: Uint8Array): Promise<Uint8Array> {
  const s = subtle();
  if (s) {
    try {
      return new Uint8Array(await s.digest(alg, data as BufferSource));
    } catch {
      /* fall through */
    }
  }
  if (alg === "SHA-1") return (await import("@noble/hashes/legacy.js")).sha1(data);
  return (await import("@noble/hashes/sha2.js")).sha256(data);
}

/** ECDSA signatures in X.509 are DER SEQUENCE{r,s}; WebCrypto wants r‖s. */
function ecdsaRaw(sig: Uint8Array, size: number): Uint8Array {
  const n = parseDer(sig)[0];
  const d = new Der(sig);
  const fix = (x: Uint8Array) => {
    let i = 0;
    while (i < x.length - 1 && x[i] === 0) i++;
    const v = x.subarray(i);
    const out = new Uint8Array(size);
    out.set(v.subarray(Math.max(0, v.length - size)), size - Math.min(size, v.length));
    return out;
  };
  const r = fix(d.content(n.children![0])), s = fix(d.content(n.children![1]));
  const out = new Uint8Array(size * 2);
  out.set(r, 0);
  out.set(s, size);
  return out;
}

/** Verifies `child`'s signature with `issuerSpki`. Returns null when the algorithm is not supported here. */
export async function verifySignature(child: Decoded, issuer: { spki: Uint8Array; keyAlgOid: string; curveOid?: string }): Promise<boolean | null> {
  const s = subtle();
  if (!s) return null;
  const hashFor: Record<string, string> = {
    "1.2.840.113549.1.1.5": "SHA-1", "1.2.840.113549.1.1.11": "SHA-256", "1.2.840.113549.1.1.12": "SHA-384", "1.2.840.113549.1.1.13": "SHA-512",
    "1.2.840.10045.4.1": "SHA-1", "1.2.840.10045.4.3.2": "SHA-256", "1.2.840.10045.4.3.3": "SHA-384", "1.2.840.10045.4.3.4": "SHA-512",
  };
  try {
    const o = child.sigAlgOid;
    if (o.startsWith("1.2.840.113549.1.1.") && hashFor[o]) {
      const key = await s.importKey("spki", issuer.spki as BufferSource, { name: "RSASSA-PKCS1-v1_5", hash: hashFor[o] }, false, ["verify"]);
      return await s.verify("RSASSA-PKCS1-v1_5", key, child.signature as BufferSource, child.tbs as BufferSource);
    }
    if (o.startsWith("1.2.840.10045.4.") && hashFor[o]) {
      const curve = { "1.2.840.10045.3.1.7": ["P-256", 32], "1.3.132.0.34": ["P-384", 48], "1.3.132.0.35": ["P-521", 66] }[issuer.curveOid ?? ""] as [string, number] | undefined;
      if (!curve) return null;
      const key = await s.importKey("spki", issuer.spki as BufferSource, { name: "ECDSA", namedCurve: curve[0] }, false, ["verify"]);
      return await s.verify({ name: "ECDSA", hash: hashFor[o] }, key, ecdsaRaw(child.signature, curve[1]) as BufferSource, child.tbs as BufferSource);
    }
    if (o === "1.3.101.112") {
      const key = await s.importKey("spki", issuer.spki as BufferSource, { name: "Ed25519" }, false, ["verify"]);
      return await s.verify({ name: "Ed25519" }, key, child.signature as BufferSource, child.tbs as BufferSource);
    }
  } catch {
    return null;
  }
  return null;
}
