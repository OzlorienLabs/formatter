/**
 * Colour math shared by the Colour Picker and Contrast Checker.
 *
 * Internally a colour is sRGB (0–1 floats, gamma-encoded) plus alpha. Wide-gamut
 * inputs (lab, oklch, display-p3 …) are converted through CIE XYZ exactly as CSS
 * Color 4 specifies; values outside sRGB are flagged and clipped for display.
 */

export type RGBA = { r: number; g: number; b: number; a: number };
export type Parsed = RGBA & { outOfGamut: boolean; space: string };

type M3 = [number, number, number][];
type V3 = [number, number, number];

const mul = (m: M3, v: V3): V3 => [
  m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
  m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
  m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
];

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const round = (x: number, d = 0) => {
  const f = 10 ** d;
  const v = Math.round(x * f) / f;
  return Object.is(v, -0) ? 0 : v;
};
/** Number formatting without trailing zeros. */
export const fmt = (x: number, d = 2) => String(round(x, d));
const normHue = (h: number) => ((h % 360) + 360) % 360;

/* ── transfer functions & matrices (CSS Color 4) ───────────────────── */

const srgbToLin = (c: number) => {
  const s = Math.sign(c) || 1, a = Math.abs(c);
  return a <= 0.04045 ? c / 12.92 : s * ((a + 0.055) / 1.055) ** 2.4;
};
const linToSrgb = (c: number) => {
  const s = Math.sign(c) || 1, a = Math.abs(c);
  return a <= 0.0031308 ? 12.92 * c : s * (1.055 * a ** (1 / 2.4) - 0.055);
};

const LIN_SRGB_TO_XYZ: M3 = [
  [0.41239079926595934, 0.357584339383878, 0.1804807884018343],
  [0.21263900587151027, 0.715168678767756, 0.07219231536073371],
  [0.01933081871559182, 0.11919477979462598, 0.9505321522496607],
];
const XYZ_TO_LIN_SRGB: M3 = [
  [3.2409699419045226, -1.537383177570094, -0.4986107602930034],
  [-0.9692436362808796, 1.8759675015077202, 0.04155505740717559],
  [0.05563007969699366, -0.20397695888897652, 1.0569715142428786],
];
const D65_TO_D50: M3 = [
  [1.0479298208405488, 0.022946793341019088, -0.05019222954313557],
  [0.029627815688159344, 0.990434484573249, -0.01707382502938514],
  [-0.009243058152591178, 0.015055144896577895, 0.7518742899580008],
];
const D50_TO_D65: M3 = [
  [0.9554734527042182, -0.023098536874261423, 0.0632593086610217],
  [-0.028369706963208136, 1.0099954580058226, 0.021041398966943008],
  [0.012314001688319899, -0.020507696433477912, 1.3303659366080753],
];
const P3_TO_XYZ: M3 = [
  [0.4865709486482162, 0.26566769316909306, 0.1982172852343625],
  [0.2289745640697488, 0.6917385218365064, 0.079286914093745],
  [0, 0.04511338185890264, 1.043944368900976],
];
const REC2020_TO_XYZ: M3 = [
  [0.6369580483012914, 0.14461690358620832, 0.1688809751641721],
  [0.2627002120112671, 0.6779980715188708, 0.05930171646986196],
  [0, 0.028072693049087428, 1.060985057710791],
];
const A98_TO_XYZ: M3 = [
  [0.5766690429101305, 0.1855582379065463, 0.1882286462349947],
  [0.29734497525053605, 0.6273635662554661, 0.07529145849399788],
  [0.02703136138641234, 0.07068885253582723, 0.9913375368376388],
];
const PROPHOTO_TO_XYZ50: M3 = [
  [0.7977604896723027, 0.13518583717574031, 0.0313493495815248],
  [0.2880711282292934, 0.7118432178101014, 0.00008565396060525902],
  [0, 0, 0.8251046025104601],
];
const D50_WHITE: V3 = [0.3457 / 0.3585, 1, (1 - 0.3457 - 0.3585) / 0.3585];

export const toLinear = (c: RGBA): V3 => [srgbToLin(c.r), srgbToLin(c.g), srgbToLin(c.b)];
const fromLinear = (v: V3, a = 1): RGBA => ({ r: linToSrgb(v[0]), g: linToSrgb(v[1]), b: linToSrgb(v[2]), a });

export const rgbToXyz = (c: RGBA): V3 => mul(LIN_SRGB_TO_XYZ, toLinear(c));
export const xyzToRgb = (x: V3, a = 1): RGBA => fromLinear(mul(XYZ_TO_LIN_SRGB, x), a);

/* ── cylindrical & device spaces ───────────────────────────────────── */

export function hslToRgb(h: number, s: number, l: number, a = 1): RGBA {
  h = normHue(h);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return { r: f(0), g: f(8), b: f(4), a };
}

export function rgbToHsl(c: RGBA): [number, number, number] {
  const { r, g, b } = c;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0, s = 0;
  if (d > 1e-9) {
    s = l === 0 || l === 1 ? 0 : (max - l) / Math.min(l, 1 - l);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [normHue(h), s, l];
}

export function rgbToHsv(c: RGBA): [number, number, number] {
  const max = Math.max(c.r, c.g, c.b), min = Math.min(c.r, c.g, c.b);
  const [h] = rgbToHsl(c);
  return [h, max === 0 ? 0 : (max - min) / max, max];
}

export function hsvToRgb(h: number, s: number, v: number, a = 1): RGBA {
  const l = v * (1 - s / 2);
  const sl = l === 0 || l === 1 ? 0 : (v - l) / Math.min(l, 1 - l);
  return hslToRgb(h, sl, l, a);
}

export function hwbToRgb(h: number, w: number, bl: number, a = 1): RGBA {
  if (w + bl >= 1) {
    const g = w / (w + bl);
    return { r: g, g, b: g, a };
  }
  const base = hslToRgb(h, 1, 0.5);
  const f = (x: number) => x * (1 - w - bl) + w;
  return { r: f(base.r), g: f(base.g), b: f(base.b), a };
}

export function rgbToHwb(c: RGBA): [number, number, number] {
  const [h] = rgbToHsl(c);
  return [h, Math.min(c.r, c.g, c.b), 1 - Math.max(c.r, c.g, c.b)];
}

export function rgbToCmyk(c: RGBA): [number, number, number, number] {
  const r = clamp01(c.r), g = clamp01(c.g), b = clamp01(c.b);
  const k = 1 - Math.max(r, g, b);
  if (k >= 1) return [0, 0, 0, 1];
  return [(1 - r - k) / (1 - k), (1 - g - k) / (1 - k), (1 - b - k) / (1 - k), k];
}

export function cmykToRgb(cy: number, m: number, y: number, k: number, a = 1): RGBA {
  return { r: (1 - cy) * (1 - k), g: (1 - m) * (1 - k), b: (1 - y) * (1 - k), a };
}

/* ── CIE Lab / LCH (D50, as CSS) ───────────────────────────────────── */

const EPS = 216 / 24389, KAPPA = 24389 / 27;

export function rgbToLab(c: RGBA): V3 {
  const xyz = mul(D65_TO_D50, rgbToXyz(c)).map((v, i) => v / D50_WHITE[i]);
  const f = xyz.map((v) => (v > EPS ? Math.cbrt(v) : (KAPPA * v + 16) / 116));
  return [116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])];
}

export function labToRgb(L: number, a: number, b: number, alpha = 1): RGBA {
  const f1 = (L + 16) / 116, f0 = a / 500 + f1, f2 = f1 - b / 200;
  const x = f0 ** 3 > EPS ? f0 ** 3 : (116 * f0 - 16) / KAPPA;
  const y = L > KAPPA * EPS ? ((L + 16) / 116) ** 3 : L / KAPPA;
  const z = f2 ** 3 > EPS ? f2 ** 3 : (116 * f2 - 16) / KAPPA;
  const xyz50: V3 = [x * D50_WHITE[0], y * D50_WHITE[1], z * D50_WHITE[2]];
  return xyzToRgb(mul(D50_TO_D65, xyz50), alpha);
}

const toPolar = (L: number, a: number, b: number): V3 => {
  const C = Math.hypot(a, b);
  return [L, C, C < 1e-4 ? 0 : normHue((Math.atan2(b, a) * 180) / Math.PI)];
};
const fromPolar = (C: number, h: number): [number, number] => [C * Math.cos((h * Math.PI) / 180), C * Math.sin((h * Math.PI) / 180)];

export const rgbToLch = (c: RGBA): V3 => {
  const [L, a, b] = rgbToLab(c);
  return toPolar(L, a, b);
};
export const lchToRgb = (L: number, C: number, h: number, alpha = 1) => {
  const [a, b] = fromPolar(C, h);
  return labToRgb(L, a, b, alpha);
};

/* ── OKLab / OKLCH ─────────────────────────────────────────────────── */

export function rgbToOklab(c: RGBA): V3 {
  const [r, g, b] = toLinear(c);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function oklabToRgb(L: number, a: number, b: number, alpha = 1): RGBA {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return fromLinear(
    [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ],
    alpha
  );
}

export const rgbToOklch = (c: RGBA): V3 => {
  const [L, a, b] = rgbToOklab(c);
  return toPolar(L, a, b);
};
export const oklchToRgb = (L: number, C: number, h: number, alpha = 1) => {
  const [a, b] = fromPolar(C, h);
  return oklabToRgb(L, a, b, alpha);
};

export const inGamut = (c: RGBA, eps = 1e-4) => [c.r, c.g, c.b].every((v) => v >= -eps && v <= 1 + eps);
export const clampRgba = (c: RGBA): RGBA => ({ r: clamp01(c.r), g: clamp01(c.g), b: clamp01(c.b), a: clamp01(c.a) });

/** CSS Color 4 gamut mapping: reduce OKLCH chroma (with a JND clip shortcut) until the colour fits sRGB. */
export function gamutMap(L: number, C: number, h: number, a = 1): RGBA {
  if (L >= 1) return { r: 1, g: 1, b: 1, a };
  if (L <= 0) return { r: 0, g: 0, b: 0, a };
  const origin = oklchToRgb(L, C, h, a);
  if (inGamut(origin)) return clampRgba(origin);
  const JND = 0.02, E = 0.0001;
  let clipped = clampRgba(origin);
  if (deltaE(clipped, origin) < JND) return clipped;
  let min = 0, max = C, minInGamut = true;
  while (max - min > E) {
    const chroma = (min + max) / 2;
    const current = oklchToRgb(L, chroma, h, a);
    if (minInGamut && inGamut(current)) {
      min = chroma;
      continue;
    }
    clipped = clampRgba(current);
    const d = deltaE(clipped, current);
    if (d < JND) {
      if (JND - d < E) return clipped;
      minInGamut = false;
      min = chroma;
    } else max = chroma;
  }
  return clipped;
}

/* ── named colours ─────────────────────────────────────────────────── */

export const NAMED: Record<string, string> = {
  aliceblue: "f0f8ff", antiquewhite: "faebd7", aqua: "00ffff", aquamarine: "7fffd4", azure: "f0ffff", beige: "f5f5dc", bisque: "ffe4c4",
  black: "000000", blanchedalmond: "ffebcd", blue: "0000ff", blueviolet: "8a2be2", brown: "a52a2a", burlywood: "deb887", cadetblue: "5f9ea0",
  chartreuse: "7fff00", chocolate: "d2691e", coral: "ff7f50", cornflowerblue: "6495ed", cornsilk: "fff8dc", crimson: "dc143c", cyan: "00ffff",
  darkblue: "00008b", darkcyan: "008b8b", darkgoldenrod: "b8860b", darkgray: "a9a9a9", darkgreen: "006400", darkgrey: "a9a9a9", darkkhaki: "bdb76b",
  darkmagenta: "8b008b", darkolivegreen: "556b2f", darkorange: "ff8c00", darkorchid: "9932cc", darkred: "8b0000", darksalmon: "e9967a",
  darkseagreen: "8fbc8f", darkslateblue: "483d8b", darkslategray: "2f4f4f", darkslategrey: "2f4f4f", darkturquoise: "00ced1", darkviolet: "9400d3",
  deeppink: "ff1493", deepskyblue: "00bfff", dimgray: "696969", dimgrey: "696969", dodgerblue: "1e90ff", firebrick: "b22222", floralwhite: "fffaf0",
  forestgreen: "228b22", fuchsia: "ff00ff", gainsboro: "dcdcdc", ghostwhite: "f8f8ff", gold: "ffd700", goldenrod: "daa520", gray: "808080",
  green: "008000", greenyellow: "adff2f", grey: "808080", honeydew: "f0fff0", hotpink: "ff69b4", indianred: "cd5c5c", indigo: "4b0082",
  ivory: "fffff0", khaki: "f0e68c", lavender: "e6e6fa", lavenderblush: "fff0f5", lawngreen: "7cfc00", lemonchiffon: "fffacd", lightblue: "add8e6",
  lightcoral: "f08080", lightcyan: "e0ffff", lightgoldenrodyellow: "fafad2", lightgray: "d3d3d3", lightgreen: "90ee90", lightgrey: "d3d3d3",
  lightpink: "ffb6c1", lightsalmon: "ffa07a", lightseagreen: "20b2aa", lightskyblue: "87cefa", lightslategray: "778899", lightslategrey: "778899",
  lightsteelblue: "b0c4de", lightyellow: "ffffe0", lime: "00ff00", limegreen: "32cd32", linen: "faf0e6", magenta: "ff00ff", maroon: "800000",
  mediumaquamarine: "66cdaa", mediumblue: "0000cd", mediumorchid: "ba55d3", mediumpurple: "9370db", mediumseagreen: "3cb371",
  mediumslateblue: "7b68ee", mediumspringgreen: "00fa9a", mediumturquoise: "48d1cc", mediumvioletred: "c71585", midnightblue: "191970",
  mintcream: "f5fffa", mistyrose: "ffe4e1", moccasin: "ffe4b5", navajowhite: "ffdead", navy: "000080", oldlace: "fdf5e6", olive: "808000",
  olivedrab: "6b8e23", orange: "ffa500", orangered: "ff4500", orchid: "da70d6", palegoldenrod: "eee8aa", palegreen: "98fb98",
  paleturquoise: "afeeee", palevioletred: "db7093", papayawhip: "ffefd5", peachpuff: "ffdab9", peru: "cd853f", pink: "ffc0cb", plum: "dda0dd",
  powderblue: "b0e0e6", purple: "800080", rebeccapurple: "663399", red: "ff0000", rosybrown: "bc8f8f", royalblue: "4169e1", saddlebrown: "8b4513",
  salmon: "fa8072", sandybrown: "f4a460", seagreen: "2e8b57", seashell: "fff5ee", sienna: "a0522d", silver: "c0c0c0", skyblue: "87ceeb",
  slateblue: "6a5acd", slategray: "708090", slategrey: "708090", snow: "fffafa", springgreen: "00ff7f", steelblue: "4682b4", tan: "d2b48c",
  teal: "008080", thistle: "d8bfd8", tomato: "ff6347", turquoise: "40e0d0", violet: "ee82ee", wheat: "f5deb3", white: "ffffff",
  whitesmoke: "f5f5f5", yellow: "ffff00", yellowgreen: "9acd32",
};

/* ── parsing ───────────────────────────────────────────────────────── */

function hexToRgba(h: string): RGBA | null {
  if (!/^[0-9a-f]+$/i.test(h) || ![3, 4, 6, 8].includes(h.length)) return null;
  const full = h.length <= 4 ? [...h].map((c) => c + c).join("") : h;
  const n = (i: number) => parseInt(full.slice(i, i + 2), 16) / 255;
  return { r: n(0), g: n(2), b: n(4), a: full.length === 8 ? n(6) : 1 };
}

type Tok = { v: number; pct: boolean; none: boolean; unit: string };

function tokens(body: string): { parts: Tok[]; alpha: Tok | null } {
  const [main, alphaPart] = body.includes("/") ? body.split("/") : [body, undefined];
  const split = (s: string) => s.trim().split(/\s*,\s*|\s+/).filter(Boolean);
  const tok = (s: string): Tok => {
    if (/^none$/i.test(s)) return { v: 0, pct: false, none: true, unit: "" };
    const m = s.match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(%|deg|rad|grad|turn)?$/i);
    if (!m) throw new Error(`Cannot read "${s}"`);
    return { v: parseFloat(m[1]), pct: m[2] === "%", none: false, unit: (m[2] ?? "").toLowerCase() };
  };
  let parts = split(main).map(tok);
  let alpha = alphaPart !== undefined ? tok(alphaPart.trim()) : null;
  // Legacy comma syntax: rgba(1, 2, 3, 0.5)
  if (!alpha && parts.length === 4) {
    alpha = parts[3];
    parts = parts.slice(0, 3);
  }
  return { parts, alpha };
}

const angle = (t: Tok) =>
  t.unit === "rad" ? (t.v * 180) / Math.PI : t.unit === "grad" ? t.v * 0.9 : t.unit === "turn" ? t.v * 360 : t.v;
const alphaOf = (t: Tok | null) => (t == null ? 1 : t.none ? 0 : clamp01(t.pct ? t.v / 100 : t.v));

/** Parse any CSS colour. Returns null when it is not a colour. */
export function parseColor(input: string): Parsed | null {
  const s = input.trim().toLowerCase().replace(/;$/, "");
  if (!s) return null;
  const out = (c: RGBA, space: string): Parsed => {
    if (inGamut(c, 1e-3)) return { ...clampRgba(c), outOfGamut: false, space };
    const [L, C, h] = rgbToOklch(c);
    return { ...gamutMap(L, C, h, c.a), outOfGamut: true, space };
  };
  if (s === "transparent") return out({ r: 0, g: 0, b: 0, a: 0 }, "named");
  if (NAMED[s]) return out(hexToRgba(NAMED[s])!, "named");
  const hex = s.match(/^#?([0-9a-f]{3,8})$/);
  if (hex) {
    const c = hexToRgba(hex[1]);
    return c ? out(c, "hex") : null;
  }
  // Bare triplets like "255, 128, 0" or "255 128 0" read as rgb.
  if (/^\d{1,3}(\s*,\s*|\s+)\d{1,3}(\s*,\s*|\s+)\d{1,3}$/.test(s)) return parseColor(`rgb(${s})`);
  const fn = s.match(/^([a-z-]+)\(\s*(.*)\s*\)$/);
  if (!fn) return null;
  const [, name, body] = fn;
  if (name === "color") return parseColorFn(body, out);
  let t: ReturnType<typeof tokens>;
  try {
    t = tokens(body);
  } catch {
    return null;
  }
  const p = t.parts;
  const a = alphaOf(t.alpha);
  const n = (i: number, pctScale = 1) => (p[i].none ? 0 : p[i].pct ? (p[i].v / 100) * pctScale : p[i].v);
  switch (name) {
    case "rgb":
    case "rgba": {
      if (p.length !== 3) return null;
      const ch = (i: number) => (p[i].none ? 0 : p[i].pct ? p[i].v / 100 : p[i].v / 255);
      return out({ r: ch(0), g: ch(1), b: ch(2), a }, "rgb");
    }
    case "hsl":
    case "hsla": {
      if (p.length !== 3) return null;
      const sat = p[1].pct ? p[1].v / 100 : p[1].v / 100;
      const lig = p[2].pct ? p[2].v / 100 : p[2].v / 100;
      return out(hslToRgb(angle(p[0]), clamp01(sat), clamp01(lig), a), "hsl");
    }
    case "hwb": {
      if (p.length !== 3) return null;
      return out(hwbToRgb(angle(p[0]), clamp01(p[1].v / 100), clamp01(p[2].v / 100), a), "hwb");
    }
    case "lab":
      if (p.length !== 3) return null;
      return out(labToRgb(n(0, 100), n(1, 125), n(2, 125), a), "lab");
    case "lch":
      if (p.length !== 3) return null;
      return out(lchToRgb(n(0, 100), n(1, 150), angle(p[2]), a), "lch");
    case "oklab":
      if (p.length !== 3) return null;
      return out(oklabToRgb(n(0, 1), n(1, 0.4), n(2, 0.4), a), "oklab");
    case "oklch":
      if (p.length !== 3) return null;
      return out(oklchToRgb(n(0, 1), n(1, 0.4), angle(p[2]), a), "oklch");
    case "device-cmyk": {
      if (p.length < 3) return null;
      const all = body.split("/")[0].trim().split(/\s*,\s*|\s+/).map((x) => (x.endsWith("%") ? parseFloat(x) / 100 : parseFloat(x)));
      if (all.length !== 4 || all.some((x) => !Number.isFinite(x))) return null;
      return out(cmykToRgb(all[0], all[1], all[2], all[3], a), "cmyk");
    }
  }
  return null;
}


function parseColorFn(body: string, out: (c: RGBA, space: string) => Parsed): Parsed | null {
  const m = body.match(/^\s*([a-z0-9-]+)\s+(.*)$/);
  if (!m) return null;
  let tt: ReturnType<typeof tokens>;
  try {
    tt = tokens(m[2]);
  } catch {
    return null;
  }
  if (tt.parts.length !== 3) return null;
  const v = tt.parts.map((x) => (x.none ? 0 : x.pct ? x.v / 100 : x.v)) as V3;
  const al = alphaOf(tt.alpha);
  const space = m[1];
  const sign = (f: (x: number) => number) => (x: number) => Math.sign(x) * f(Math.abs(x));
  let xyz: V3;
  switch (space) {
    case "srgb":
      return out({ r: v[0], g: v[1], b: v[2], a: al }, "srgb");
    case "srgb-linear":
      return out(fromLinear(v, al), "srgb-linear");
    case "display-p3":
      xyz = mul(P3_TO_XYZ, v.map(srgbToLin) as V3);
      break;
    case "rec2020": {
      const A = 1.09929682680944, B = 0.018053968510807;
      xyz = mul(REC2020_TO_XYZ, v.map(sign((x) => (x < B * 4.5 ? x / 4.5 : ((x + A - 1) / A) ** (1 / 0.45)))) as V3);
      break;
    }
    case "a98-rgb":
      xyz = mul(A98_TO_XYZ, v.map(sign((x) => x ** (563 / 256))) as V3);
      break;
    case "prophoto-rgb":
      xyz = mul(D50_TO_D65, mul(PROPHOTO_TO_XYZ50, v.map(sign((x) => (x <= 16 / 512 ? x / 16 : x ** 1.8))) as V3));
      break;
    case "xyz":
    case "xyz-d65":
      xyz = v;
      break;
    case "xyz-d50":
      xyz = mul(D50_TO_D65, v);
      break;
    default:
      return null;
  }
  return out(xyzToRgb(xyz, al), space);
}

/* ── formatting ────────────────────────────────────────────────────── */

const h2 = (x: number) => Math.round(clamp01(x) * 255).toString(16).padStart(2, "0");
export const toHex = (c: RGBA, alpha = false) => `#${h2(c.r)}${h2(c.g)}${h2(c.b)}${alpha || c.a < 1 ? h2(c.a) : ""}`;
export const to255 = (c: RGBA) => [c.r, c.g, c.b].map((x) => Math.round(clamp01(x) * 255)) as V3;
const aSuffix = (a: number, modern = true) => (a < 1 ? (modern ? ` / ${fmt(a, 3)}` : `, ${fmt(a, 3)}`) : "");

export function formatRgb(c: RGBA, legacy = false) {
  const [r, g, b] = to255(c);
  if (legacy) return c.a < 1 ? `rgba(${r}, ${g}, ${b}, ${fmt(c.a, 3)})` : `rgb(${r}, ${g}, ${b})`;
  return `rgb(${r} ${g} ${b}${aSuffix(c.a)})`;
}
export function formatHsl(c: RGBA, legacy = false) {
  const [h, s, l] = rgbToHsl(clampRgba(c));
  if (legacy) return c.a < 1 ? `hsla(${fmt(h, 1)}, ${fmt(s * 100, 1)}%, ${fmt(l * 100, 1)}%, ${fmt(c.a, 3)})` : `hsl(${fmt(h, 1)}, ${fmt(s * 100, 1)}%, ${fmt(l * 100, 1)}%)`;
  return `hsl(${fmt(h, 1)} ${fmt(s * 100, 1)}% ${fmt(l * 100, 1)}%${aSuffix(c.a)})`;
}
export function formatHwb(c: RGBA) {
  const [h, w, b] = rgbToHwb(clampRgba(c));
  return `hwb(${fmt(h, 1)} ${fmt(w * 100, 1)}% ${fmt(b * 100, 1)}%${aSuffix(c.a)})`;
}
export function formatHsv(c: RGBA) {
  const [h, s, v] = rgbToHsv(clampRgba(c));
  return `hsv(${fmt(h, 1)}, ${fmt(s * 100, 1)}%, ${fmt(v * 100, 1)}%)`;
}
export function formatCmyk(c: RGBA) {
  const k = rgbToCmyk(c).map((x) => `${fmt(x * 100, 1)}%`);
  return `device-cmyk(${k.join(" ")})`;
}
export function formatLab(c: RGBA) {
  const [L, a, b] = rgbToLab(c);
  return `lab(${fmt(L, 2)}% ${fmt(a, 2)} ${fmt(b, 2)}${aSuffix(c.a)})`;
}
export function formatLch(c: RGBA) {
  const [L, C, h] = rgbToLch(c);
  return `lch(${fmt(L, 2)}% ${fmt(C, 2)} ${fmt(h, 2)}${aSuffix(c.a)})`;
}
export function formatOklab(c: RGBA) {
  const [L, a, b] = rgbToOklab(c);
  return `oklab(${fmt(L * 100, 2)}% ${fmt(a, 4)} ${fmt(b, 4)}${aSuffix(c.a)})`;
}
export function formatOklch(c: RGBA) {
  const [L, C, h] = rgbToOklch(c);
  return `oklch(${fmt(L * 100, 2)}% ${fmt(C, 4)} ${fmt(h, 2)}${aSuffix(c.a)})`;
}
export function formatP3(c: RGBA) {
  const xyz = rgbToXyz(c);
  // XYZ → linear P3 (inverse of P3_TO_XYZ)
  const INV: M3 = [
    [2.493496911941425, -0.9313836179191239, -0.40271078445071684],
    [-0.8294889695615747, 1.7626640603183463, 0.023624685841943577],
    [0.03584583024378447, -0.07617238926804182, 0.9568845240076872],
  ];
  const v = mul(INV, xyz).map(linToSrgb);
  return `color(display-p3 ${v.map((x) => fmt(x, 4)).join(" ")}${aSuffix(c.a)})`;
}

export type Format = { id: string; label: string; value: string };

export function allFormats(c: RGBA): Format[] {
  const named = nearestNamed(c);
  return [
    { id: "hex", label: "HEX", value: toHex(c) },
    { id: "hex8", label: "HEX8", value: toHex(c, true) },
    { id: "rgb", label: "RGB", value: formatRgb(c) },
    { id: "rgba", label: "RGB(A) legacy", value: formatRgb(c, true) },
    { id: "hsl", label: "HSL", value: formatHsl(c) },
    { id: "hsla", label: "HSL(A) legacy", value: formatHsl(c, true) },
    { id: "hwb", label: "HWB", value: formatHwb(c) },
    { id: "hsv", label: "HSV / HSB", value: formatHsv(c) },
    { id: "cmyk", label: "CMYK", value: formatCmyk(c) },
    { id: "lab", label: "CIE Lab", value: formatLab(c) },
    { id: "lch", label: "CIE LCH", value: formatLch(c) },
    { id: "oklab", label: "OKLab", value: formatOklab(c) },
    { id: "oklch", label: "OKLCH", value: formatOklch(c) },
    { id: "p3", label: "Display P3", value: formatP3(c) },
    { id: "named", label: named.exact ? "CSS name" : "Nearest CSS name", value: named.exact ? named.name : `${named.name} (${named.hex}, ΔE ${fmt(named.deltaE * 100, 1)})` },
  ];
}

/** OKLab Euclidean distance (≈ ΔEok; ×100 for a JND-ish scale where ~2 is just noticeable). */
export function deltaE(a: RGBA, b: RGBA) {
  const x = rgbToOklab(a), y = rgbToOklab(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

let namedCache: { name: string; hex: string; c: RGBA }[] | null = null;
export function nearestNamed(c: RGBA): { name: string; hex: string; deltaE: number; exact: boolean } {
  namedCache ??= Object.entries(NAMED)
    .filter(([n]) => !/grey/.test(n) && n !== "aqua" && n !== "fuchsia")
    .map(([name, hex]) => ({ name, hex: "#" + hex, c: hexToRgba(hex)! }));
  const cc = clampRgba(c);
  let best = namedCache[0], bd = Infinity;
  for (const n of namedCache) {
    const d = deltaE(cc, n.c);
    if (d < bd) {
      bd = d;
      best = n;
    }
  }
  return { name: best.name, hex: best.hex, deltaE: bd, exact: bd < 0.0005 && c.a === 1 };
}

/* ── contrast ──────────────────────────────────────────────────────── */

/** WCAG 2.x relative luminance. */
export function luminance(c: RGBA) {
  const [r, g, b] = toLinear(clampRgba(c));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Composite a (possibly translucent) colour over an opaque backdrop. */
export function blend(fg: RGBA, bg: RGBA): RGBA {
  const a = fg.a;
  return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
}

export function contrastRatio(a: RGBA, b: RGBA) {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** APCA-W3 0.0.98G-4g lightness contrast (Lc). Positive: dark text on light; negative: light on dark. */
export function apca(text: RGBA, bg: RGBA) {
  const Y = (c: RGBA) => {
    const [r, g, b] = [c.r, c.g, c.b].map((x) => clamp01(x) ** 2.4);
    let y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
    if (y < 0.022) y += (0.022 - y) ** 1.414;
    return y;
  };
  const yt = Y(text), yb = Y(bg);
  if (Math.abs(yb - yt) < 0.0005) return 0;
  if (yb > yt) {
    const s = (yb ** 0.56 - yt ** 0.57) * 1.14;
    return s < 0.1 ? 0 : (s - 0.027) * 100;
  }
  const s = (yb ** 0.65 - yt ** 0.62) * 1.14;
  return s > -0.1 ? 0 : (s + 0.027) * 100;
}

export type Grade = { id: string; label: string; need: number; pass: boolean };
export function wcagGrades(ratio: number): Grade[] {
  const g = (id: string, label: string, need: number) => ({ id, label, need, pass: ratio >= need - 1e-9 });
  return [
    g("aa-normal", "AA normal text", 4.5),
    g("aaa-normal", "AAA normal text", 7),
    g("aa-large", "AA large text", 3),
    g("aaa-large", "AAA large text", 4.5),
    g("ui", "UI components & graphics", 3),
  ];
}

/** Rough APCA guidance (Bronze simple mode). */
export function apcaVerdict(lc: number) {
  const a = Math.abs(lc);
  if (a >= 90) return "Preferred for body text (14px+)";
  if (a >= 75) return "Minimum for body text (18px / 16px bold+)";
  if (a >= 60) return "Content text 24px / 16px bold+";
  if (a >= 45) return "Large headlines 36px / 24px bold+";
  if (a >= 30) return "Spot text, placeholders, disabled";
  if (a >= 15) return "Non-text only (dividers, focus hints)";
  return "Invisible to many readers";
}

/**
 * Nearest colour to `move` (by OKLCH lightness only) that reaches `target`
 * contrast against `fixed`. Returns null when neither direction can.
 */
export function suggestContrast(move: RGBA, fixed: RGBA, target: number): { color: RGBA; ratio: number; dL: number; flips: boolean } | null {
  const [L, C, h] = rgbToOklch(clampRgba(move));
  const at = (l: number) => gamutMap(l, C, h, 1);
  const cands: { color: RGBA; ratio: number; dL: number; flips: boolean }[] = [];
  const lighter = luminance(move) > luminance(fixed);
  for (const dir of [1, -1]) {
    const end = dir > 0 ? 1 : 0;
    if (contrastRatio(at(end), fixed) < target) continue;
    let lo = L, hi = end;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (contrastRatio(at(mid), fixed) >= target) hi = mid;
      else lo = mid;
    }
    // Round to hex and make sure rounding did not drop below the target.
    let col = at(hi);
    const hex = parseColor(toHex(col))!;
    col = contrastRatio(hex, fixed) >= target ? hex : at(hi + dir * 0.004);
    cands.push({ color: clampRgba(col), ratio: contrastRatio(col, fixed), dL: Math.abs(hi - L), flips: luminance(col) > luminance(fixed) !== lighter });
  }
  // Prefer keeping the polarity (dark-on-light stays dark-on-light), then the smallest change.
  cands.sort((a, b) => Number(a.flips) - Number(b.flips) || a.dL - b.dL);
  return cands[0] ?? null;
}

/* ── colour-vision deficiency (Machado et al. 2009, severity 1) ───── */

const CVD: Record<string, M3> = {
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
};
export const CVD_KINDS = [
  ["protanopia", "Protanopia (no red cones)"],
  ["deuteranopia", "Deuteranopia (no green cones)"],
  ["tritanopia", "Tritanopia (no blue cones)"],
  ["achromatopsia", "Achromatopsia (no colour)"],
] as const;

export function simulate(c: RGBA, kind: string): RGBA {
  const lin = toLinear(clampRgba(c));
  if (kind === "achromatopsia") {
    const y = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
    return clampRgba(fromLinear([y, y, y], c.a));
  }
  const m = CVD[kind];
  if (!m) return c;
  return clampRgba(fromLinear(mul(m, lin), c.a));
}

/* ── palettes ──────────────────────────────────────────────────────── */

const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const STEP_L = [0.971, 0.936, 0.885, 0.808, 0.704, 0.637, 0.577, 0.505, 0.444, 0.396, 0.258];
const STEP_C = [0.12, 0.25, 0.45, 0.7, 0.92, 1, 1, 0.9, 0.78, 0.66, 0.5];

/** A 50–950 tint/shade scale in OKLCH. The step nearest the base colour is the base colour itself. */
export function tintScale(c: RGBA): { step: number; color: RGBA; base: boolean }[] {
  const [L, C, h] = rgbToOklch(clampRgba(c));
  let nearest = 0;
  STEP_L.forEach((l, i) => {
    if (Math.abs(l - L) < Math.abs(STEP_L[nearest] - L)) nearest = i;
  });
  return STEPS.map((step, i) => ({
    step,
    base: i === nearest,
    color: i === nearest ? { ...clampRgba(c), a: 1 } : gamutMap(STEP_L[i], C * STEP_C[i], h),
  }));
}

export function harmonies(c: RGBA): { id: string; label: string; colors: RGBA[] }[] {
  const [L, C, h] = rgbToOklch(clampRgba(c));
  const rot = (d: number) => gamutMap(L, C, h + d, 1);
  const base = { ...clampRgba(c), a: 1 };
  return [
    { id: "complementary", label: "Complementary", colors: [base, rot(180)] },
    { id: "analogous", label: "Analogous", colors: [rot(-30), base, rot(30)] },
    { id: "triadic", label: "Triadic", colors: [base, rot(120), rot(240)] },
    { id: "split", label: "Split-complementary", colors: [base, rot(150), rot(210)] },
    { id: "tetradic", label: "Tetradic (square)", colors: [base, rot(90), rot(180), rot(270)] },
    {
      id: "mono",
      label: "Monochromatic",
      colors: [0.3, 0.45, L, 0.75, 0.9].map((l, i) => (i === 2 ? base : gamutMap(l, C, h, 1))),
    },
  ];
}

/** Text colour (black or white) that reads best on this background. */
export const readableOn = (bg: RGBA) =>
  contrastRatio({ r: 0, g: 0, b: 0, a: 1 }, bg) >= contrastRatio({ r: 1, g: 1, b: 1, a: 1 }, bg) ? "#000000" : "#ffffff";
