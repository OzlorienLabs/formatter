/** Browser-only QR decoding: image → canvas → jsQR, trying a few scales. */
import { ToolError } from "../types";

export async function readQrFromDataUrl(dataUrl: string): Promise<string> {
  const img = new Image();
  await new Promise<void>((res, rej) => {
    img.onload = () => res();
    img.onerror = () => rej(new ToolError("That file could not be read as an image."));
    img.src = dataUrl;
  });
  const jsQR = (await import("jsqr")).default;
  const w0 = img.naturalWidth, h0 = img.naturalHeight;
  if (!w0 || !h0) throw new ToolError("The image is empty.");
  // Large photos decode better downscaled; tiny codes better upscaled.
  const targets = [1000, 1600, 600, 400].map((t) => Math.min(4, t / Math.max(w0, h0)));
  for (const scale of targets) {
    const w = Math.max(1, Math.round(w0 * scale)), h = Math.max(1, Math.round(h0 * scale));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new ToolError("Canvas is not available in this browser.");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = scale < 1;
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h);
    const r = jsQR(data.data, w, h, { inversionAttempts: "attemptBoth" });
    if (r?.data) return r.data;
  }
  throw new ToolError("No QR code found. Crop closer to the code, make sure it is in focus, and keep the white border around it.");
}
