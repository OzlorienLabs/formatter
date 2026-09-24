"use client";

import { useEffect, useMemo, useState } from "react";
import ToolIcon from "@/src/components/ToolIcon";
import FileField from "@/src/components/tool/FileField";
import { downloadBlob } from "@/src/components/tool/OutputView";
import type { CustomProps } from "../types";
import { canEncode, CROP_PRESETS, FORMATS, readEdits, type Edits } from "../lib/F-image";
import { Card, KIT_CSS, Range } from "./F-kit";

const ADJUST: { k: keyof Edits; label: string; min: number; max: number; def: number; unit: string }[] = [
  { k: "brightness", label: "Brightness", min: 0, max: 200, def: 100, unit: "%" },
  { k: "contrast", label: "Contrast", min: 0, max: 200, def: 100, unit: "%" },
  { k: "saturate", label: "Saturation", min: 0, max: 300, def: 100, unit: "%" },
  { k: "grayscale", label: "Grayscale", min: 0, max: 100, def: 0, unit: "%" },
  { k: "sepia", label: "Sepia", min: 0, max: 100, def: 0, unit: "%" },
  { k: "invert", label: "Invert", min: 0, max: 100, def: 0, unit: "%" },
  { k: "hue", label: "Hue rotate", min: -180, max: 180, def: 0, unit: "°" },
  { k: "blur", label: "Blur", min: 0, max: 20, def: 0, unit: "px" },
];

function Num({ label, value, onChange, placeholder, width = 86 }: { label: string; value: number | undefined; onChange: (v: number | undefined) => void; placeholder?: string; width?: number }) {
  return (
    <label style={{ display: "grid", gap: 3, fontSize: 12.5, color: "var(--color-neutral-700)" }}>
      {label}
      <input
        className="inp mono"
        type="number"
        min={0}
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value === "" ? undefined : Math.max(0, Math.round(e.target.valueAsNumber)))}
        style={{ width, fontSize: 13 }}
      />
    </label>
  );
}

export default function ImageToolkit({ inputs, setInput, result, error, record }: CustomProps) {
  const src = inputs.image ?? "";
  const e = useMemo(() => readEdits(inputs.edits ?? ""), [inputs.edits]);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [view, setView] = useState<"after" | "before" | "side">("after");
  const [enc, setEnc] = useState<Record<string, boolean>>({});

  useEffect(() => {
    FORMATS.forEach(([t]) => canEncode(t).then((ok) => setEnc((m) => ({ ...m, [t]: ok }))));
  }, []);

  useEffect(() => {
    if (!src) return setDims(null);
    const img = new Image();
    img.onload = () => setDims({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = src;
  }, [src]);

  const set = (patch: Partial<Edits>) => {
    const next = { ...e, ...patch };
    for (const k of Object.keys(next) as (keyof Edits)[]) if (next[k] === undefined) delete next[k];
    setInput("edits", JSON.stringify(next));
  };

  const outSrc = result?.views?.[0]?.out.kind === "image" ? result.views[0].out.src : "";
  const stats = result?.views?.[1]?.out.kind === "stats" ? result.views[1].out.items : [];
  const fmt = e.format ?? "image/png";
  const lossy = fmt !== "image/png";

  if (!src)
    return (
      <div style={{ display: "grid", gap: 14 }}>
        <style>{KIT_CSS + CSS}</style>
        <Card title="Image">
          <FileField
            field={{ id: "image", label: "Image", kind: "file", accept: "image/*", read: "dataurl", placeholder: "Drop an image here, paste one (Ctrl/⌘+V), or browse" }}
            value=""
            onChange={(v, name) => {
              setInput("image:name", name);
              setInput("image", v);
            }}
          />
          <p style={{ margin: "4px 12px 0", fontSize: 13.5, color: "var(--color-neutral-600)" }}>PNG, JPEG, WebP, AVIF, GIF, SVG and BMP — or pick an example above.</p>
        </Card>
      </div>
    );

  return (
    <div className="fit-grid">
      <style>{KIT_CSS + CSS}</style>
      <div style={{ display: "grid", gap: 12, alignContent: "start", minWidth: 0 }}>
        <Card title="Source" right={<button type="button" className="btn btn-sm btn-danger" onClick={() => { setInput("image", ""); setInput("image:name", ""); }}>Remove</button>}>
          <div style={{ fontSize: 13.5, display: "grid", gap: 2 }}>
            <span style={{ wordBreak: "break-all" }}>{inputs["image:name"] || "Image"}</span>
            <span className="mono" style={{ fontSize: 12.5, color: "var(--color-neutral-600)" }}>{dims ? `${dims.w}×${dims.h}px` : "…"}</span>
          </div>
        </Card>

        <Card title="Resize" right={<button type="button" className="btn-icon" onClick={() => set({ width: undefined, height: undefined, percent: undefined })}>Reset</button>}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
            <Num label="Width" value={e.width} placeholder={dims ? String(dims.w) : ""} onChange={(v) => set({ width: v || undefined, percent: undefined })} />
            <Num label="Height" value={e.height} placeholder={e.keepAspect !== false && e.width ? "auto" : dims ? String(dims.h) : ""} onChange={(v) => set({ height: v || undefined, percent: undefined })} />
            <label className="tog" style={{ marginBottom: 6 }}>
              <input type="checkbox" checked={e.keepAspect !== false} onChange={(x) => set({ keepAspect: x.target.checked ? undefined : false })} />
              Keep aspect
            </label>
          </div>
          {e.keepAspect !== false && e.width && e.height ? (
            <div className="seg" style={{ marginTop: 10 }}>
              {(["contain", "cover"] as const).map((f) => (
                <button key={f} type="button" aria-pressed={(e.fit ?? "contain") === f} onClick={() => set({ fit: f === "contain" ? undefined : f })}>
                  {f === "contain" ? "Fit inside" : "Fill & crop"}
                </button>
              ))}
            </div>
          ) : null}
          <div className="chips" style={{ marginTop: 10 }}>
            {[25, 50, 75, 100, 150, 200].map((p) => (
              <button key={p} type="button" className="chip" aria-pressed={e.percent === p} onClick={() => set({ percent: p === 100 ? undefined : p, width: undefined, height: undefined })}>
                {p}%
              </button>
            ))}
          </div>
          <label className="tog" style={{ marginTop: 10 }}>
            <input type="checkbox" checked={e.smoothing !== false} onChange={(x) => set({ smoothing: x.target.checked ? undefined : false })} />
            Smooth scaling (off = crisp pixels)
          </label>
        </Card>

        <Card title="Crop" right={e.crop ? <button type="button" className="btn-icon" onClick={() => set({ crop: undefined })}>Clear</button> : null}>
          <div className="chips">
            {CROP_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                className="chip"
                aria-pressed={p === "free" ? !!e.crop && (!e.crop.preset || e.crop.preset === "free") : e.crop?.preset === p}
                onClick={() => set({ crop: p === "free" ? { x: 0, y: 0, w: dims?.w, h: dims?.h } : { preset: p } })}
              >
                {p === "free" ? "Custom" : p}
              </button>
            ))}
          </div>
          {e.crop && (!e.crop.preset || e.crop.preset === "free") && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              {(["x", "y", "w", "h"] as const).map((k) => (
                <Num key={k} label={k.toUpperCase()} width={72} value={e.crop?.[k]} onChange={(v) => set({ crop: { ...e.crop, preset: undefined, [k]: v } })} />
              ))}
            </div>
          )}
        </Card>

        <Card title="Rotate & flip">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button type="button" className="btn btn-sm" onClick={() => set({ rotate: (((e.rotate ?? 0) - 90) % 360 + 360) % 360 || undefined })} title="Rotate left">⟲ 90°</button>
            <button type="button" className="btn btn-sm" onClick={() => set({ rotate: ((e.rotate ?? 0) + 90) % 360 || undefined })} title="Rotate right">⟳ 90°</button>
            <button type="button" className="btn btn-sm" onClick={() => set({ rotate: ((e.rotate ?? 0) + 180) % 360 || undefined })}>180°</button>
            <button type="button" className="btn btn-sm" aria-pressed={!!e.flipH} style={e.flipH ? { borderColor: "var(--color-accent-500)", color: "var(--color-accent-800)" } : undefined} onClick={() => set({ flipH: !e.flipH || undefined })}>⇋ Flip H</button>
            <button type="button" className="btn btn-sm" aria-pressed={!!e.flipV} style={e.flipV ? { borderColor: "var(--color-accent-500)", color: "var(--color-accent-800)" } : undefined} onClick={() => set({ flipV: !e.flipV || undefined })}>⇵ Flip V</button>
            <span className="mono" style={{ fontSize: 12.5, alignSelf: "center", color: "var(--color-neutral-600)" }}>{e.rotate ?? 0}°</span>
          </div>
        </Card>

        <Card title="Adjust" right={<button type="button" className="btn-icon" onClick={() => set(Object.fromEntries(ADJUST.map((a) => [a.k, undefined])))}>Reset</button>}>
          <div style={{ display: "grid", gap: 8 }}>
            {ADJUST.map((a) => (
              <div key={a.k} style={{ display: "grid", gap: 2 }}>
                <span style={{ fontSize: 12.5, color: "var(--color-neutral-700)" }}>{a.label}</span>
                <Range label="" value={Number(e[a.k] ?? a.def)} min={a.min} max={a.max} unit={a.unit} onChange={(v) => set({ [a.k]: v === a.def ? undefined : v } as Partial<Edits>)} />
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div style={{ display: "grid", gap: 12, alignContent: "start", minWidth: 0 }}>
        <Card title="Output">
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
            <span className="seg" role="group" aria-label="Format">
              {FORMATS.map(([t, l]) => (
                <button key={t} type="button" aria-pressed={fmt === t} disabled={enc[t] === false} title={enc[t] === false ? `${l} encoding is not supported by this browser` : undefined} onClick={() => set({ format: t })}>
                  {l}
                </button>
              ))}
            </span>
            {lossy && (
              <div style={{ minWidth: 220, flex: "1 1 220px" }}>
                <Range label="Q" value={Math.round((e.quality ?? 0.9) * 100)} min={5} max={100} unit="%" onChange={(v) => set({ quality: v / 100 })} />
              </div>
            )}
            <label className="opt">
              <span className="lbl">Background</span>
              <input type="color" value={e.background ?? "#ffffff"} onChange={(x) => set({ background: x.target.value })} style={{ width: 32, height: 26, border: 0, padding: 0, background: "none" }} aria-label="Background colour" />
              {e.background ? <button type="button" className="btn-icon" onClick={() => set({ background: undefined })}>none</button> : <span style={{ fontSize: 12, color: "var(--color-neutral-600)" }}>{fmt === "image/jpeg" ? "white (JPEG)" : "transparent"}</span>}
            </label>
            <label className="opt" title="Lower quality, then size, until the file fits">
              <span className="lbl">Max size</span>
              <input className="inp mono" type="number" min={0} step={10} value={e.maxKB ?? ""} placeholder="off" onChange={(x) => set({ maxKB: x.target.value ? Math.max(0, x.target.valueAsNumber) : undefined })} style={{ width: 80, fontSize: 13 }} />
              <span style={{ fontSize: 12.5 }}>KB</span>
            </label>
          </div>
          <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--color-neutral-600)" }}>Re-encoding strips EXIF metadata, including camera details and GPS location.</p>
        </Card>

        <Card
          title={
            <div className="tabs" role="tablist">
              {(["after", "before", "side"] as const).map((v) => (
                <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}>
                  {v === "after" ? "Result" : v === "before" ? "Original" : "Side by side"}
                </button>
              ))}
            </div>
          }
          right={
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!result?.blob}
              onClick={() => {
                if (!result?.blob) return;
                downloadBlob(result.blob, result.filename ?? "image.png");
                record(result.text);
              }}
            >
              <ToolIcon name="download-simple" size={15} color="#fff" /> Download
            </button>
          }
          bodyStyle={{ padding: 0 }}
        >
          {error && <div className="errband"><ToolIcon name="warning-circle" size={18} color="var(--color-accent-2-700)" /><span style={{ fontSize: 13.5, color: "var(--color-accent-2-700)" }}>{error}</span></div>}
          {result?.notes?.map((n) => <div key={n} className="note"><ToolIcon name="info" size={16} color="var(--plate-y)" /><span>{n}</span></div>)}
          <div className={`fit-stage ${view === "side" ? "side" : ""}`}>
            {(view === "before" || view === "side") && (
              <figure>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="Original" />
                {view === "side" && <figcaption>Original{dims ? ` · ${dims.w}×${dims.h}` : ""}</figcaption>}
              </figure>
            )}
            {(view === "after" || view === "side") && (
              <figure>
                {outSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={outSrc} alt="Result" style={{ imageRendering: e.smoothing === false ? "pixelated" : undefined }} />
                ) : (
                  <div className="skeleton" style={{ width: 240, height: 160 }} />
                )}
                {view === "side" && <figcaption>Result</figcaption>}
              </figure>
            )}
          </div>
          {stats.length > 0 && (
            <div className="statgrid" style={{ padding: 12, gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))" }}>
              {stats.map((s) => (
                <div key={s.label} className={`stat ${s.tone ?? ""}`}>
                  <b style={{ fontSize: 16 }}>{s.value}</b>
                  <span>{s.label}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

const CSS = `
.fit-grid{display:grid;grid-template-columns:minmax(260px,340px) minmax(0,1fr);gap:14px;align-items:start}
@media (max-width:900px){.fit-grid{grid-template-columns:minmax(0,1fr)}.fit-grid>div:last-of-type{order:-1}}
.fit-stage{display:flex;gap:12px;padding:14px;justify-content:center;align-items:flex-start;min-height:260px;background-color:#fff;background-image:linear-gradient(45deg,#eee 25%,transparent 25%),linear-gradient(-45deg,#eee 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#eee 75%),linear-gradient(-45deg,transparent 75%,#eee 75%);background-size:16px 16px;background-position:0 0,0 8px,8px -8px,-8px 0}
.fit-stage figure{margin:0;display:grid;gap:6px;justify-items:center;min-width:0;flex:1}
.fit-stage img{max-width:100%;max-height:560px;display:block;box-shadow:0 1px 6px rgba(0,0,0,.12)}
.fit-stage.side img{max-height:420px}
.fit-stage figcaption{font-size:12.5px;color:var(--color-neutral-700);background:rgba(255,255,255,.8);padding:1px 6px;border-radius:4px}
@media (max-width:600px){.fit-stage.side{flex-direction:column}}
`;
