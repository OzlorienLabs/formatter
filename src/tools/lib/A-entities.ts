/**
 * Named HTML entities for encoding: the full HTML 4 set (every Latin-1,
 * Greek, maths, arrow and typographic name) plus the HTML5 names for ASCII
 * punctuation. Decoding uses the browser's own HTML parser, which knows all
 * 2,231 HTML5 names.
 */

const LATIN1 =
  "nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest " +
  "Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig " +
  "agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml";

const GREEK_UP = "Alpha Beta Gamma Delta Epsilon Zeta Eta Theta Iota Kappa Lambda Mu Nu Xi Omicron Pi Rho - Sigma Tau Upsilon Phi Chi Psi Omega";
const GREEK_LO = "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigmaf sigma tau upsilon phi chi psi omega";

const OTHERS: [string, number][] = [
  ["Tab", 9], ["NewLine", 10], ["excl", 33], ["quot", 34], ["num", 35], ["dollar", 36], ["percnt", 37], ["amp", 38], ["apos", 39],
  ["lpar", 40], ["rpar", 41], ["ast", 42], ["plus", 43], ["comma", 44], ["period", 46], ["sol", 47], ["colon", 58], ["semi", 59],
  ["lt", 60], ["equals", 61], ["gt", 62], ["quest", 63], ["commat", 64], ["lsqb", 91], ["bsol", 92], ["rsqb", 93], ["Hat", 94],
  ["lowbar", 95], ["grave", 96], ["lcub", 123], ["verbar", 124], ["rcub", 125],
  ["OElig", 338], ["oelig", 339], ["Scaron", 352], ["scaron", 353], ["Yuml", 376], ["fnof", 402], ["circ", 710], ["tilde", 732],
  ["thetasym", 977], ["upsih", 978], ["piv", 982],
  ["ensp", 8194], ["emsp", 8195], ["thinsp", 8201], ["zwnj", 8204], ["zwj", 8205], ["lrm", 8206], ["rlm", 8207], ["hyphen", 8208],
  ["ndash", 8211], ["mdash", 8212], ["lsquo", 8216], ["rsquo", 8217], ["sbquo", 8218], ["ldquo", 8220], ["rdquo", 8221], ["bdquo", 8222],
  ["dagger", 8224], ["Dagger", 8225], ["bull", 8226], ["hellip", 8230], ["permil", 8240], ["prime", 8242], ["Prime", 8243],
  ["lsaquo", 8249], ["rsaquo", 8250], ["oline", 8254], ["frasl", 8260], ["euro", 8364], ["image", 8465], ["weierp", 8472], ["real", 8476],
  ["trade", 8482], ["alefsym", 8501], ["larr", 8592], ["uarr", 8593], ["rarr", 8594], ["darr", 8595], ["harr", 8596], ["crarr", 8629],
  ["lArr", 8656], ["uArr", 8657], ["rArr", 8658], ["dArr", 8659], ["hArr", 8660], ["forall", 8704], ["part", 8706], ["exist", 8707],
  ["empty", 8709], ["nabla", 8711], ["isin", 8712], ["notin", 8713], ["ni", 8715], ["prod", 8719], ["sum", 8721], ["minus", 8722],
  ["lowast", 8727], ["radic", 8730], ["prop", 8733], ["infin", 8734], ["ang", 8736], ["and", 8743], ["or", 8744], ["cap", 8745],
  ["cup", 8746], ["int", 8747], ["there4", 8756], ["sim", 8764], ["cong", 8773], ["asymp", 8776], ["ne", 8800], ["equiv", 8801],
  ["le", 8804], ["ge", 8805], ["sub", 8834], ["sup", 8835], ["nsub", 8836], ["sube", 8838], ["supe", 8839], ["oplus", 8853],
  ["otimes", 8855], ["perp", 8869], ["sdot", 8901], ["lceil", 8968], ["rceil", 8969], ["lfloor", 8970], ["rfloor", 8971],
  ["loz", 9674], ["starf", 9733], ["star", 9734], ["spades", 9824], ["clubs", 9827], ["hearts", 9829], ["diams", 9830],
  ["check", 10003], ["cross", 10007], ["lang", 10216], ["rang", 10217],
];

let byCode: Map<number, string> | null = null;
let byName: Map<string, number> | null = null;

function build() {
  byCode = new Map();
  byName = new Map();
  const add = (n: string, c: number) => {
    if (!byCode!.has(c)) byCode!.set(c, n);
    byName!.set(n, c);
  };
  LATIN1.split(" ").forEach((n, i) => add(n, 160 + i));
  GREEK_UP.split(" ").forEach((n, i) => n !== "-" && add(n, 913 + i));
  GREEK_LO.split(" ").forEach((n, i) => add(n, 945 + i));
  for (const [n, c] of OTHERS) add(n, c);
}

export function entityName(cp: number): string | undefined {
  if (!byCode) build();
  return byCode!.get(cp);
}

export function entityCode(name: string): number | undefined {
  if (!byName) build();
  return byName!.get(name);
}

export const ENTITY_COUNT = () => {
  if (!byName) build();
  return byName!.size;
};

let ta: HTMLTextAreaElement | null = null;

/**
 * Decode HTML character references exactly as a browser would, via the HTML
 * parser in RCDATA mode (a detached <textarea>): no tags are created, and all
 * HTML5 named references — including legacy ones without a semicolon — work.
 */
export function decodeEntities(s: string): string {
  if (typeof document !== "undefined") {
    if (!ta) ta = document.createElement("textarea");
    ta.innerHTML = s.replace(/</g, "&lt;");
    return ta.value;
  }
  return s.replace(/&(#[xX][0-9a-fA-F]+|#\d+|[A-Za-z][A-Za-z0-9]*);?/g, (m, body: string) => {
    if (body[0] === "#") {
      const cp = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : "\uFFFD";
    }
    const c = entityCode(body);
    return c !== undefined ? String.fromCodePoint(c) : m;
  });
}
