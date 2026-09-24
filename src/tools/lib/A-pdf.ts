/**
 * A byte-level PDF scanner: header version, page count, document info
 * (/Title, /Author … including UTF-16 hex strings and D: dates), page size,
 * fonts, encryption and structure checks. No rendering, no dependencies.
 */

export type PdfInfo = {
  version: string;
  catalogVersion?: string;
  headerOffset: number;
  pages: number | null;
  pageObjects: number;
  info: Record<string, string>;
  pageSize?: string;
  fonts: string[];
  images: number;
  objects: number;
  encrypted: boolean;
  linearized: boolean;
  hasEof: boolean;
  xref: "table" | "stream" | "missing";
  objectStreams: boolean;
  javascript: boolean;
  forms: boolean;
  warnings: string[];
};

function latin1(b: Uint8Array) {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return s;
}

/** Read a PDF string starting at `i` (either "(" literal or "<" hex). */
function readPdfString(s: string, i: number): string | null {
  if (s[i] === "(") {
    let depth = 0;
    const bytes: number[] = [];
    for (let k = i; k < s.length; k++) {
      const c = s[k];
      if (c === "\\") {
        const n = s[++k];
        const map: Record<string, number> = { n: 10, r: 13, t: 9, b: 8, f: 12, "(": 40, ")": 41, "\\": 92 };
        if (n in map) bytes.push(map[n]);
        else if (/[0-7]/.test(n)) {
          let o = n;
          while (o.length < 3 && /[0-7]/.test(s[k + 1])) o += s[++k];
          bytes.push(parseInt(o, 8) & 255);
        } else if (n === "\r" || n === "\n") {
          if (n === "\r" && s[k + 1] === "\n") k++;
        } else bytes.push(n.charCodeAt(0));
        continue;
      }
      if (c === "(") { depth++; if (depth === 1) continue; }
      if (c === ")") { depth--; if (depth === 0) return textOf(bytes); }
      bytes.push(c.charCodeAt(0));
    }
    return null;
  }
  if (s[i] === "<" && s[i + 1] !== "<") {
    const end = s.indexOf(">", i);
    if (end < 0) return null;
    let h = s.slice(i + 1, end).replace(/\s+/g, "");
    if (h.length % 2) h += "0";
    return textOf(Array.from(h.match(/../g) ?? [], (x) => parseInt(x, 16)));
  }
  return null;
}

function textOf(bytes: number[]): string {
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    let out = "";
    for (let k = 2; k + 1 < bytes.length; k += 2) out += String.fromCharCode((bytes[k] << 8) | bytes[k + 1]);
    return out;
  }
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder().decode(Uint8Array.from(bytes.slice(3)));
  return String.fromCharCode(...bytes);
}

/** D:YYYYMMDDHHmmSSOHH'mm' → ISO 8601. */
export function pdfDate(d: string): string {
  const m = d.match(/^D?:?(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?([Zz+-])?(\d{2})?'?(\d{2})?'?/);
  if (!m) return d;
  const [, y, mo = "01", da = "01", h = "00", mi = "00", se = "00", z, oh, om] = m;
  const tz = !z || z === "Z" || z === "z" ? (z ? "Z" : "") : `${z}${oh ?? "00"}:${om ?? "00"}`;
  return `${y}-${mo}-${da}T${h}:${mi}:${se}${tz}`;
}

const PAPER: [string, number, number][] = [["A4", 595, 842], ["US Letter", 612, 792], ["US Legal", 612, 1008], ["A3", 842, 1191], ["A5", 420, 595], ["Tabloid", 792, 1224]];

export function scanPdf(b: Uint8Array): PdfInfo {
  const s = latin1(b);
  const warnings: string[] = [];
  const headerOffset = s.indexOf("%PDF-");
  const version = s.slice(headerOffset + 5, headerOffset + 8).match(/^\d\.\d/)?.[0] ?? "?";
  if (headerOffset > 0) warnings.push(`${headerOffset} byte(s) of junk before the %PDF- header (readers tolerate up to 1024).`);
  const hasEof = /%%EOF\s*$/.test(s.slice(-1024));
  if (!hasEof) warnings.push("No %%EOF marker at the end — the file may be truncated.");
  const startxref = s.lastIndexOf("startxref");
  let xref: PdfInfo["xref"] = "missing";
  if (startxref >= 0) {
    const at = parseInt(s.slice(startxref + 9, startxref + 30).trim(), 10);
    if (Number.isFinite(at) && at < s.length) {
      if (s.startsWith("xref", at)) xref = "table";
      else if (/^\s*\d+\s+\d+\s+obj/.test(s.slice(at, at + 40))) xref = "stream";
      else warnings.push(`startxref points to offset ${at}, but there is no cross-reference table there (readers will rebuild it).`);
    }
  } else warnings.push("No startxref — the cross-reference table is missing.");

  // Page tree: the /Pages node with the largest /Count is the root.
  let pages: number | null = null;
  const pagesRe = /\/Type\s*\/Pages\b/g;
  let m: RegExpExecArray | null;
  while ((m = pagesRe.exec(s))) {
    const from = s.lastIndexOf("<<", m.index);
    const to = s.indexOf(">>", m.index);
    const dict = s.slice(from, to + 200);
    const c = dict.match(/\/Count\s+(\d+)/);
    if (c) pages = Math.max(pages ?? 0, Number(c[1]));
  }
  const pageObjects = (s.match(/\/Type\s*\/Page(?![A-Za-z])/g) ?? []).length;
  if (pages === null && pageObjects) pages = pageObjects;
  const objectStreams = /\/Type\s*\/ObjStm/.test(s);
  if (pages === null && objectStreams) warnings.push("The page tree lives in compressed object streams; the page count cannot be read without inflating them.");

  // Document info: prefer the dictionary the trailer points at.
  const info: Record<string, string> = {};
  const infoRef = s.match(/\/Info\s+(\d+)\s+(\d+)\s+R/g)?.pop()?.match(/(\d+)\s+(\d+)/);
  let infoDict = "";
  if (infoRef) {
    const objAt = s.search(new RegExp(`(^|[^0-9])${infoRef[1]}\\s+${infoRef[2]}\\s+obj`));
    if (objAt >= 0) infoDict = s.slice(objAt, s.indexOf("endobj", objAt) + 1 || objAt + 4000);
  }
  const src = infoDict || s;
  for (const key of ["Title", "Author", "Subject", "Keywords", "Creator", "Producer", "CreationDate", "ModDate", "Trapped"]) {
    const re = new RegExp(`/${key}\\s*([(<])`);
    const km = re.exec(src);
    if (!km) continue;
    const v = readPdfString(src, km.index + km[0].length - 1);
    if (v != null) info[key] = key.endsWith("Date") ? pdfDate(v) : v;
  }
  const catalogVersion = s.match(/\/Type\s*\/Catalog[^>]*?\/Version\s*\/(\d\.\d)/)?.[1];
  const mb = s.match(/\/MediaBox\s*\[\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*\]/);
  let pageSize: string | undefined;
  if (mb) {
    const w = Number(mb[3]) - Number(mb[1]), h = Number(mb[4]) - Number(mb[2]);
    const paper = PAPER.find(([, pw, ph]) => (Math.abs(pw - w) < 3 && Math.abs(ph - h) < 3) || (Math.abs(pw - h) < 3 && Math.abs(ph - w) < 3));
    pageSize = `${Math.round(w)} × ${Math.round(h)} pt (${Math.round((w / 72) * 25.4)} × ${Math.round((h / 72) * 25.4)} mm)${paper ? ` · ${paper[0]}${w > h ? " landscape" : ""}` : ""}`;
  }
  const fonts = [...new Set(Array.from(s.matchAll(/\/BaseFont\s*\/([^\s/<>[\]()]+)/g), (x) => x[1].replace(/^[A-Z]{6}\+/, "")))];
  return {
    version,
    catalogVersion,
    headerOffset,
    pages,
    pageObjects,
    info,
    pageSize,
    fonts,
    images: (s.match(/\/Subtype\s*\/Image\b/g) ?? []).length,
    objects: (s.match(/(^|[\r\n\s])\d+\s+\d+\s+obj\b/g) ?? []).length,
    encrypted: /\/Encrypt\s+\d+\s+\d+\s+R|\/Encrypt\s*<</.test(s),
    linearized: /\/Linearized\s/.test(s.slice(0, 2048)),
    hasEof,
    xref,
    objectStreams,
    javascript: /\/JavaScript\b|\/JS\s*[(<]/.test(s),
    forms: /\/AcroForm\b/.test(s),
    warnings,
  };
}
