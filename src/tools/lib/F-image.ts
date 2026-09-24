/**
 * Image Toolkit pipeline (browser only): crop → rotate/flip → resize → filters
 * → encode, all on a canvas. Re-encoding drops EXIF/GPS metadata.
 */
import { ToolError, type Result } from "../types";

export type Edits = {
  width?: number;
  height?: number;
  percent?: number;
  keepAspect?: boolean;
  fit?: "contain" | "cover";
  crop?: { preset?: string; x?: number; y?: number; w?: number; h?: number };
  rotate?: number;
  flipH?: boolean;
  flipV?: boolean;
  brightness?: number;
  contrast?: number;
  saturate?: number;
  grayscale?: number;
  sepia?: number;
  blur?: number;
  invert?: number;
  hue?: number;
  format?: string;
  quality?: number;
  background?: string;
  maxKB?: number;
  smoothing?: boolean;
};

export const FORMATS: [string, string][] = [
  ["image/png", "PNG"],
  ["image/jpeg", "JPEG"],
  ["image/webp", "WebP"],
  ["image/avif", "AVIF"],
];
export const CROP_PRESETS = ["free", "1:1", "16:9", "4:3", "3:2", "4:5", "9:16"];

export function readEdits(s: string): Edits {
  try {
    const v = JSON.parse(s || "{}");
    return v && typeof v === "object" ? (v as Edits) : {};
  } catch {
    return {};
  }
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new ToolError("This file could not be decoded as an image (HEIC and RAW are not supported by browsers)."));
    img.src = src;
  });
}

const encoded = new Map<string, boolean>();
/** Whether canvas.toBlob can actually produce this type (AVIF/WebP vary by browser). */
export async function canEncode(type: string): Promise<boolean> {
  if (encoded.has(type)) return encoded.get(type)!;
  const c = document.createElement("canvas");
  c.width = c.height = 2;
  const b = await new Promise<Blob | null>((r) => c.toBlob(r, type, 0.5));
  const ok = !!b && b.type === type;
  encoded.set(type, ok);
  return ok;
}

/** Centre crop rectangle for an aspect preset, or the numeric rectangle clamped to the image. */
export function cropRect(W: number, H: number, crop?: Edits["crop"]): { x: number; y: number; w: number; h: number } {
  if (!crop) return { x: 0, y: 0, w: W, h: H };
  const p = crop.preset;
  if (p && p !== "free") {
    const [a, b] = p.split(":").map(Number);
    const r = a / b;
    let w = W, h = Math.round(W / r);
    if (h > H) {
      h = H;
      w = Math.round(H * r);
    }
    return { x: Math.round((W - w) / 2), y: Math.round((H - h) / 2), w, h };
  }
  const x = Math.max(0, Math.min(W - 1, Math.round(crop.x ?? 0)));
  const y = Math.max(0, Math.min(H - 1, Math.round(crop.y ?? 0)));
  const w = Math.max(1, Math.min(W - x, Math.round(crop.w ?? W)));
  const h = Math.max(1, Math.min(H - y, Math.round(crop.h ?? H)));
  return { x, y, w, h };
}

export function filterString(e: Edits): string {
  const f: string[] = [];
  if ((e.brightness ?? 100) !== 100) f.push(`brightness(${e.brightness}%)`);
  if ((e.contrast ?? 100) !== 100) f.push(`contrast(${e.contrast}%)`);
  if ((e.saturate ?? 100) !== 100) f.push(`saturate(${e.saturate}%)`);
  if (e.grayscale) f.push(`grayscale(${e.grayscale}%)`);
  if (e.sepia) f.push(`sepia(${e.sepia}%)`);
  if (e.invert) f.push(`invert(${e.invert}%)`);
  if (e.hue) f.push(`hue-rotate(${e.hue}deg)`);
  if (e.blur) f.push(`blur(${e.blur}px)`);
  return f.join(" ") || "none";
}

/** Output size after crop + rotation, honouring width/height/percent/aspect. */
export function outputSize(cw: number, ch: number, e: Edits): { w: number; h: number; fit: "stretch" | "contain" | "cover" } {
  const pct = e.percent && e.percent > 0 ? e.percent : 0;
  if (pct) return { w: Math.max(1, Math.round((cw * pct) / 100)), h: Math.max(1, Math.round((ch * pct) / 100)), fit: "stretch" };
  const keep = e.keepAspect !== false;
  const W = e.width && e.width > 0 ? e.width : 0;
  const H = e.height && e.height > 0 ? e.height : 0;
  if (!W && !H) return { w: cw, h: ch, fit: "stretch" };
  if (!keep) return { w: Math.round(W || cw), h: Math.round(H || ch), fit: "stretch" };
  if (W && !H) return { w: W, h: Math.max(1, Math.round((ch * W) / cw)), fit: "stretch" };
  if (H && !W) return { w: Math.max(1, Math.round((cw * H) / ch)), h: H, fit: "stretch" };
  if ((e.fit ?? "contain") === "cover") return { w: W, h: H, fit: "cover" };
  const s = Math.min(W / cw, H / ch);
  return { w: Math.max(1, Math.round(cw * s)), h: Math.max(1, Math.round(ch * s)), fit: "contain" };
}

let lastUrl = "";

export async function processImage(src: string, editsJson: string): Promise<Result> {
  if (!src) throw new ToolError("Drop, paste or pick an image to start.");
  const e = readEdits(editsJson);
  const img = await loadImage(src);
  const W0 = img.naturalWidth || 800, H0 = img.naturalHeight || 600;
  const cr = cropRect(W0, H0, e.crop);
  const rot = (((e.rotate ?? 0) % 360) + 360) % 360;
  const swap = rot === 90 || rot === 270;
  const rw = swap ? cr.h : cr.w, rh = swap ? cr.w : cr.h;
  const size = outputSize(rw, rh, e);
  if (size.w * size.h > 60_000_000) throw new ToolError(`${size.w}×${size.h} is too large for a browser canvas — keep it under about 60 megapixels.`);

  let type = e.format ?? "image/png";
  const notes: string[] = [];
  if (!(await canEncode(type))) {
    notes.push(`This browser cannot encode ${type.replace("image/", "").toUpperCase()}; saved as PNG instead.`);
    type = "image/png";
  }

  // Stage 1: crop + rotate + flip at crop resolution.
  const a = document.createElement("canvas");
  a.width = rw;
  a.height = rh;
  const ax = a.getContext("2d")!;
  ax.translate(rw / 2, rh / 2);
  ax.rotate((rot * Math.PI) / 180);
  ax.scale(e.flipH ? -1 : 1, e.flipV ? -1 : 1);
  ax.drawImage(img, cr.x, cr.y, cr.w, cr.h, -cr.w / 2, -cr.h / 2, cr.w, cr.h);

  // Stage 2: resize + filters (+ background for formats without alpha).
  const draw = (w: number, h: number) => {
    const b = document.createElement("canvas");
    b.width = w;
    b.height = h;
    const bx = b.getContext("2d")!;
    if (type === "image/jpeg" || e.background) {
      bx.fillStyle = e.background || "#ffffff";
      bx.fillRect(0, 0, w, h);
    }
    bx.imageSmoothingEnabled = e.smoothing !== false;
    bx.imageSmoothingQuality = "high";
    bx.filter = filterString(e);
    if (size.fit === "cover") {
      const s = Math.max(w / rw, h / rh);
      const sw = w / s, sh = h / s;
      bx.drawImage(a, (rw - sw) / 2, (rh - sh) / 2, sw, sh, 0, 0, w, h);
    } else bx.drawImage(a, 0, 0, rw, rh, 0, 0, w, h);
    return b;
  };
  const encode = (c: HTMLCanvasElement, q: number) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new ToolError("Encoding failed."))), type, q));

  let outW = size.w, outH = size.h;
  let canvas = draw(outW, outH);
  let quality = Math.min(1, Math.max(0.05, e.quality ?? 0.9));
  let blob = await encode(canvas, quality);
  const lossy = type !== "image/png";
  if (e.maxKB && e.maxKB > 0 && blob.size > e.maxKB * 1024) {
    const limit = e.maxKB * 1024;
    // Binary-search quality first (lossy formats), then step the dimensions down.
    for (let round = 0; round < 12 && blob.size > limit; round++) {
      if (lossy) {
        let lo = 0.05, hi = quality, best: Blob | null = null, bestQ = lo;
        for (let i = 0; i < 7; i++) {
          const mid = (lo + hi) / 2;
          const b = await encode(canvas, mid);
          if (b.size <= limit) {
            best = b;
            bestQ = mid;
            lo = mid;
          } else hi = mid;
        }
        if (best) {
          blob = best;
          quality = bestQ;
          break;
        }
      }
      outW = Math.max(1, Math.round(outW * 0.85));
      outH = Math.max(1, Math.round(outH * 0.85));
      canvas = draw(outW, outH);
      blob = await encode(canvas, quality);
    }
    notes.push(blob.size <= limit ? `Fitted under ${e.maxKB} KB${lossy ? ` at quality ${Math.round(quality * 100)}%` : ""}${outW !== size.w ? ` and ${outW}×${outH}px` : ""}.` : `Could not reach ${e.maxKB} KB; smallest result is ${(blob.size / 1024).toFixed(1)} KB.`);
  }

  if (lastUrl) URL.revokeObjectURL(lastUrl);
  lastUrl = URL.createObjectURL(blob);
  const ext = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/avif": "avif" }[type] ?? "png";
  const inBytes = Math.round(((src.length - src.indexOf(",") - 1) * 3) / 4);
  const pct = inBytes ? Math.round((1 - blob.size / inBytes) * 100) : 0;
  const text = `${outW}×${outH} ${ext.toUpperCase()} · ${(blob.size / 1024).toFixed(1)} KB (original ${W0}×${H0}, ${(inBytes / 1024).toFixed(1)} KB, ${pct >= 0 ? `${pct}% smaller` : `${-pct}% larger`})`;
  return {
    text,
    blob,
    filename: `image-${outW}x${outH}.${ext}`,
    notes,
    views: [
      { label: "Result", out: { kind: "image", src: lastUrl, name: `image-${outW}x${outH}.${ext}` } },
      {
        label: "Stats",
        out: {
          kind: "stats",
          items: [
            { label: "Original", value: `${W0}×${H0}` },
            { label: "Output", value: `${outW}×${outH}`, tone: "info" },
            { label: "Original size", value: `${(inBytes / 1024).toFixed(1)} KB` },
            { label: "Output size", value: `${(blob.size / 1024).toFixed(1)} KB`, tone: blob.size <= inBytes ? "ok" : "warn" },
            { label: "Change", value: `${pct >= 0 ? "−" : "+"}${Math.abs(pct)}%`, tone: pct >= 0 ? "ok" : "warn" },
            { label: "Format", value: `${ext.toUpperCase()}${lossy ? ` · q${Math.round(quality * 100)}` : ""}` },
          ],
        },
      },
    ],
  };
}
