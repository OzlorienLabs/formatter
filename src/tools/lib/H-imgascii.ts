/**
 * Image → characters. `rasterToAscii` is pure (RGBA in, text + colours out)
 * so it is testable; `loadRaster` uses a canvas and needs a browser.
 */

export type Raster = { data: Uint8ClampedArray; w: number; h: number };

export const RAMPS: Record<string, string> = {
  standard: "@%#*+=-:. ",
  detailed: "$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/\\|()1{}[]?-_+~<>i!lI;:,\"^`'. ",
  blocks: "█▓▒░ ",
  simple: "#=-. ",
  digits: "8069452317 ",
};

export type AsciiOpts = {
  cols: number;
  ramp: string;
  custom: string;
  invert: boolean;
  brightness: number;
  contrast: number;
  /** Character cell height / width correction (0.5 ≈ typical monospace). */
  aspect: number;
  dither: boolean;
};

export type AsciiOut = { text: string; lines: string[]; colors: [number, number, number][][]; cols: number; rows: number };

/** Target sampling size for an image of w×h. Braille packs 2×4 dots per character. */
export function gridSize(w: number, h: number, o: AsciiOpts): { cols: number; rows: number; pw: number; ph: number } {
  const cols = Math.max(4, Math.min(400, Math.round(o.cols)));
  const a = o.aspect > 0 ? o.aspect : 0.5;
  if (o.ramp === "braille") {
    const pw = cols * 2;
    const ph = Math.max(4, Math.round(((pw * h) / w) * 2 * a));
    return { cols, rows: Math.ceil(ph / 4), pw, ph };
  }
  const rows = Math.max(1, Math.round(((cols * h) / w) * a));
  return { cols, rows, pw: cols, ph: rows };
}

function adjust(o: AsciiOpts) {
  const c = Math.max(-100, Math.min(100, o.contrast)) * 2.55;
  const f = (259 * (c + 255)) / (255 * (259 - c));
  const b = Math.max(-100, Math.min(100, o.brightness)) / 100;
  return (l: number) => {
    let v = f * (l - 0.5) + 0.5 + b;
    v = Math.max(0, Math.min(1, v));
    return o.invert ? 1 - v : v;
  };
}

/** Luminance 0 (black) … 1 (white); transparent pixels read as white paper. */
function lumaGrid(r: Raster, o: AsciiOpts): Float32Array {
  const adj = adjust(o);
  const out = new Float32Array(r.w * r.h);
  for (let i = 0; i < r.w * r.h; i++) {
    const a = r.data[i * 4 + 3] / 255;
    const rr = r.data[i * 4] * a + 255 * (1 - a), gg = r.data[i * 4 + 1] * a + 255 * (1 - a), bb = r.data[i * 4 + 2] * a + 255 * (1 - a);
    const lin = (0.2126 * rr + 0.7152 * gg + 0.0722 * bb) / 255;
    out[i] = adj(lin);
  }
  return out;
}

/** Floyd–Steinberg: quantise to `levels` levels, spreading the error to neighbours. */
function dither(l: Float32Array, w: number, h: number, levels: number): Float32Array {
  const d = new Float32Array(l);
  const n = levels - 1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const old = d[i];
      const q = Math.round(Math.max(0, Math.min(1, old)) * n) / n;
      d[i] = q;
      const e = old - q;
      if (x + 1 < w) d[i + 1] += (e * 7) / 16;
      if (y + 1 < h) {
        if (x > 0) d[i + w - 1] += (e * 3) / 16;
        d[i + w] += (e * 5) / 16;
        if (x + 1 < w) d[i + w + 1] += e / 16;
      }
    }
  return d;
}

const BRAILLE_BITS = [
  [0x01, 0x08],
  [0x02, 0x10],
  [0x04, 0x20],
  [0x40, 0x80],
];

/** Convert a raster already scaled to the sampling size from `gridSize`. */
export function rasterToAscii(r: Raster, o: AsciiOpts): AsciiOut {
  const lines: string[] = [];
  const colors: [number, number, number][][] = [];
  let luma = lumaGrid(r, o);
  if (o.ramp === "braille") {
    if (o.dither) luma = dither(luma, r.w, r.h, 2);
    const cols = Math.ceil(r.w / 2), rows = Math.ceil(r.h / 4);
    for (let cy = 0; cy < rows; cy++) {
      let line = "";
      const crow: [number, number, number][] = [];
      for (let cx = 0; cx < cols; cx++) {
        let bits = 0;
        let sr = 0, sg = 0, sb = 0, n = 0;
        for (let dy = 0; dy < 4; dy++)
          for (let dx = 0; dx < 2; dx++) {
            const x = cx * 2 + dx, y = cy * 4 + dy;
            if (x >= r.w || y >= r.h) continue;
            const i = y * r.w + x;
            if (luma[i] < 0.5) bits |= BRAILLE_BITS[dy][dx];
            sr += r.data[i * 4];
            sg += r.data[i * 4 + 1];
            sb += r.data[i * 4 + 2];
            n++;
          }
        // U+2800 (blank braille) is visible as a gap in most fonts; keep it for alignment.
        line += String.fromCharCode(0x2800 + bits);
        crow.push(n ? [sr / n, sg / n, sb / n] : [0, 0, 0]);
      }
      lines.push(line);
      colors.push(crow);
    }
    return { text: lines.join("\n"), lines, colors, cols, rows };
  }
  const ramp = [...(o.ramp === "custom" ? o.custom || RAMPS.standard : RAMPS[o.ramp] ?? RAMPS.standard)];
  if (ramp.length < 2) ramp.push(" ");
  if (o.dither) luma = dither(luma, r.w, r.h, ramp.length);
  for (let y = 0; y < r.h; y++) {
    let line = "";
    const crow: [number, number, number][] = [];
    for (let x = 0; x < r.w; x++) {
      const i = y * r.w + x;
      const v = Math.max(0, Math.min(1, luma[i]));
      line += ramp[Math.min(ramp.length - 1, Math.round(v * (ramp.length - 1)))];
      crow.push([r.data[i * 4], r.data[i * 4 + 1], r.data[i * 4 + 2]]);
    }
    lines.push(line.replace(/\s+$/, ""));
    colors.push(crow);
  }
  return { text: lines.join("\n"), lines, colors, cols: r.w, rows: r.h };
}

const esc = (c: string) => (c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : c);

/** Coloured markup: runs of similar colour share a span. */
export function colorHtml(out: AsciiOut, dark: boolean): string {
  const rows = out.lines.map((line, y) => {
    const chars = [...line];
    let html = "";
    let run = "";
    let runKey = "";
    chars.forEach((ch, x) => {
      const [r, g, b] = out.colors[y][x] ?? [0, 0, 0];
      const key = `${r >> 4},${g >> 4},${b >> 4}`;
      if (key !== runKey) {
        if (run) html += `<span style="color:rgb(${runKey.split(",").map((v) => Number(v) * 16 + 8).join(",")})">${run}</span>`;
        run = "";
        runKey = key;
      }
      run += esc(ch);
    });
    if (run) html += `<span style="color:rgb(${runKey.split(",").map((v) => Number(v) * 16 + 8).join(",")})">${run}</span>`;
    return html;
  });
  return `<pre style="margin:0;padding:12px;font-family:var(--font-mono),monospace;font-size:9px;line-height:1.05;letter-spacing:0;background:${dark ? "#0d0f12" : "#ffffff"};border-radius:8px;overflow:auto;white-space:pre">${rows.join("\n")}</pre>`;
}

/** Browser only: decode a data URL and scale it onto a canvas of the sampling size. */
export async function loadRaster(src: string, o: AsciiOpts): Promise<{ raster: Raster; iw: number; ih: number }> {
  const img = new Image();
  img.decoding = "async";
  img.src = src;
  try {
    await img.decode();
  } catch {
    throw new Error("Could not decode this image. Try a PNG, JPEG, GIF, WebP or SVG file.");
  }
  const iw = img.naturalWidth || img.width || 300, ih = img.naturalHeight || img.height || 150;
  const { pw, ph } = gridSize(iw, ih, o);
  const cv = document.createElement("canvas");
  cv.width = pw;
  cv.height = ph;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is not available in this browser.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, pw, ph);
  const data = ctx.getImageData(0, 0, pw, ph).data;
  return { raster: { data, w: pw, h: ph }, iw, ih };
}
