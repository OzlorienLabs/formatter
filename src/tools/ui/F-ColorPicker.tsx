"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ToolIcon from "@/src/components/ToolIcon";
import type { CustomProps } from "../types";
import {
  allFormats,
  clampRgba,
  contrastRatio,
  fmt,
  formatHsl,
  formatHwb,
  formatLab,
  formatLch,
  formatOklab,
  formatOklch,
  formatRgb,
  gamutMap,
  harmonies,
  hslToRgb,
  parseColor,
  readableOn,
  rgbToHsl,
  rgbToOklch,
  tintScale,
  toHex,
  type RGBA,
} from "../lib/F-color";
import { Card, CopyBtn, KIT_CSS, Range } from "./F-kit";

const STORE = "formatter:F-swatches";
const FALLBACK: RGBA = { r: 214 / 255, g: 0, b: 108 / 255, a: 1 };

/** Write a colour back in the same notation the user typed, so sliders do not change their format. */
function formatLike(sample: string, c: RGBA): string {
  const s = sample.trim().toLowerCase();
  if (s.startsWith("oklch")) return formatOklch(c);
  if (s.startsWith("oklab")) return formatOklab(c);
  if (s.startsWith("lch")) return formatLch(c);
  if (s.startsWith("lab")) return formatLab(c);
  if (s.startsWith("hwb")) return formatHwb(c);
  if (s.startsWith("hsla") || /^hsl\(.*,/.test(s)) return formatHsl(c, true);
  if (s.startsWith("hsl")) return formatHsl(c);
  if (s.startsWith("rgba") || /^rgb\(.*,/.test(s)) return formatRgb(c, true);
  if (s.startsWith("rgb")) return formatRgb(c);
  return toHex(c);
}

function loadSwatches(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 48) : [];
  } catch {
    return [];
  }
}

type Mode = "hsl" | "rgb" | "oklch";

export default function ColorPicker({ inputs, setInput, record }: CustomProps) {
  const raw = inputs.color ?? "";
  const firstLine = raw.split("\n")[0].trim();
  const parsed = useMemo(() => parseColor(firstLine), [firstLine]);
  const [c, setC] = useState<RGBA>(parsed ?? FALLBACK);
  const [hsl, setHsl] = useState(() => rgbToHsl(parsed ?? FALLBACK));
  const [ok, setOk] = useState(() => rgbToOklch(parsed ?? FALLBACK));
  const [mode, setMode] = useState<Mode>("hsl");
  const [swatches, setSwatches] = useState<string[]>([]);
  const [hasDropper, setHasDropper] = useState(false);
  const written = useRef("");

  useEffect(() => {
    setSwatches(loadSwatches());
    setHasDropper(typeof window !== "undefined" && "EyeDropper" in window);
  }, []);

  // Sync from outside (typing, examples, history) — but not from our own slider writes.
  useEffect(() => {
    if (!parsed || raw === written.current) return;
    const cc = { ...clampRgba(parsed) };
    setC(cc);
    setHsl(rgbToHsl(cc));
    setOk(rgbToOklch(cc));
  }, [parsed, raw]);

  function commit(next: RGBA, from?: { hsl?: [number, number, number]; ok?: [number, number, number] }) {
    const cc = clampRgba(next);
    setC(cc);
    setHsl(from?.hsl ?? rgbToHsl(cc));
    setOk(from?.ok ?? rgbToOklch(cc));
    const s = formatLike(firstLine, cc);
    written.current = s;
    setInput("color", s);
  }

  function pick(hexOrCss: string) {
    const p = parseColor(hexOrCss);
    if (!p) return;
    written.current = "";
    setInput("color", hexOrCss);
  }

  function saveSwatch() {
    const hex = toHex(c);
    const next = [hex, ...swatches.filter((s) => s !== hex)].slice(0, 48);
    setSwatches(next);
    try {
      localStorage.setItem(STORE, JSON.stringify(next));
    } catch {
      /* storage blocked */
    }
    record(hex);
  }

  function removeSwatch(s: string) {
    const next = swatches.filter((x) => x !== s);
    setSwatches(next);
    try {
      localStorage.setItem(STORE, JSON.stringify(next));
    } catch {
      /* storage blocked */
    }
  }

  async function eyedrop() {
    try {
      const ED = (window as unknown as { EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;
      const r = await new ED().open();
      pick(r.sRGBHex);
    } catch {
      /* cancelled */
    }
  }

  const hex = toHex(c);
  const solid = toHex({ ...c, a: 1 });
  const formats = useMemo(() => allFormats(c), [c]);
  const scale = useMemo(() => tintScale(c), [c]);
  const harm = useMemo(() => harmonies(c), [c]);
  const white = { r: 1, g: 1, b: 1, a: 1 }, black = { r: 0, g: 0, b: 0, a: 1 };
  const onW = contrastRatio({ ...c, a: 1 }, white), onB = contrastRatio({ ...c, a: 1 }, black);
  const ink = readableOn({ ...c, a: 1 });
  const invalid = !!firstLine && !parsed;

  const [h, s, l] = hsl;
  const hueTrack = `linear-gradient(to right, ${[0, 60, 120, 180, 240, 300, 360].map((x) => toHex(hslToRgb(x, s, l))).join(",")})`;
  const satTrack = `linear-gradient(to right, ${toHex(hslToRgb(h, 0, l))}, ${toHex(hslToRgb(h, 1, l))})`;
  const lightTrack = `linear-gradient(to right, #000, ${toHex(hslToRgb(h, s, 0.5))}, #fff)`;
  const ch = (k: "r" | "g" | "b") => `linear-gradient(to right, ${toHex({ ...c, [k]: 0, a: 1 })}, ${toHex({ ...c, [k]: 1, a: 1 })})`;
  const alphaTrack = `linear-gradient(to right, ${solid}00, ${solid}), repeating-conic-gradient(#ddd 0 25%, #fff 0 50%) 0 0 / 10px 10px`;
  const okL = `linear-gradient(to right, ${[0, 0.25, 0.5, 0.75, 1].map((x) => toHex(gamutMap(x, ok[1], ok[2]))).join(",")})`;
  const okC = `linear-gradient(to right, ${[0, 0.1, 0.2, 0.3, 0.37].map((x) => toHex(gamutMap(ok[0], x, ok[2]))).join(",")})`;
  const okH = `linear-gradient(to right, ${[0, 60, 120, 180, 240, 300, 360].map((x) => toHex(gamutMap(ok[0], ok[1], x))).join(",")})`;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <style>{KIT_CSS + CSS}</style>
      <div className="f-2col">
        <Card title="Colour" right={invalid ? <span className="f-badge bad">Not a colour</span> : parsed?.outOfGamut ? <span className="f-badge warn" title="Displayed gamut-mapped to sRGB">Outside sRGB</span> : null}>
          <div className="fcp-swatch checker" style={{ marginBottom: 12 }}>
            <div style={{ background: hex, color: ink }}>
              <span className="mono" style={{ fontSize: 26, letterSpacing: "-.01em" }}>{hex}</span>
              <span style={{ fontSize: 13.5, opacity: 0.85 }}>{formats.find((f) => f.id === "named")?.value}</span>
              <span style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                <span className="fcp-pill" style={{ background: "#fff", color: "#111" }}>vs white {fmt(onW, 2)} · {onW >= 7 ? "AAA" : onW >= 4.5 ? "AA" : onW >= 3 ? "AA large" : "fail"}</span>
                <span className="fcp-pill" style={{ background: "#000", color: "#fff" }}>vs black {fmt(onB, 2)} · {onB >= 7 ? "AAA" : onB >= 4.5 ? "AA" : onB >= 3 ? "AA large" : "fail"}</span>
              </span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
            <input
              className="inp mono"
              value={raw}
              onChange={(e) => {
                written.current = "";
                setInput("color", e.target.value);
              }}
              aria-label="Colour value"
              placeholder="#d6006c, oklch(60% .2 20)…"
              spellCheck={false}
              style={{ flex: "1 1 180px", fontSize: 14, borderColor: invalid ? "var(--color-accent-2-500)" : undefined }}
            />
            <label className="btn btn-sm" title="System colour picker" style={{ position: "relative", overflow: "hidden" }}>
              <span style={{ width: 16, height: 16, borderRadius: 4, background: solid, boxShadow: "inset 0 0 0 1px rgba(0,0,0,.2)" }} />
              Picker
              <input type="color" value={solid} onChange={(e) => commit({ ...parseColor(e.target.value)!, a: c.a })} style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }} aria-label="Native colour picker" />
            </label>
            {hasDropper && (
              <button type="button" className="btn btn-sm" onClick={eyedrop} title="Pick a colour from anywhere on screen">
                <ToolIcon name="eyedropper" size={15} /> Eyedropper
              </button>
            )}
            <button type="button" className="btn btn-sm" onClick={saveSwatch} title="Save to your swatches (stored in this browser)">
              <ToolIcon name="plus" size={14} /> Save
            </button>
          </div>
          <div className="seg" role="group" aria-label="Slider model" style={{ marginBottom: 10 }}>
            {(["hsl", "rgb", "oklch"] as Mode[]).map((m) => (
              <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>
                {m.toUpperCase()}
              </button>
            ))}
          </div>
          <div style={{ display: "grid", gap: 9 }}>
            {mode === "hsl" && (
              <>
                <Range label="H" value={h} min={0} max={360} step={0.5} unit="°" track={hueTrack} onChange={(v) => commit({ ...hslToRgb(v, s, l), a: c.a }, { hsl: [v, s, l] })} />
                <Range label="S" value={s * 100} min={0} max={100} step={0.5} unit="%" track={satTrack} onChange={(v) => commit({ ...hslToRgb(h, v / 100, l), a: c.a }, { hsl: [h, v / 100, l] })} />
                <Range label="L" value={l * 100} min={0} max={100} step={0.5} unit="%" track={lightTrack} onChange={(v) => commit({ ...hslToRgb(h, s, v / 100), a: c.a }, { hsl: [h, s, v / 100] })} />
              </>
            )}
            {mode === "rgb" && (
              <>
                <Range label="R" value={Math.round(c.r * 255)} min={0} max={255} track={ch("r")} onChange={(v) => commit({ ...c, r: v / 255 })} />
                <Range label="G" value={Math.round(c.g * 255)} min={0} max={255} track={ch("g")} onChange={(v) => commit({ ...c, g: v / 255 })} />
                <Range label="B" value={Math.round(c.b * 255)} min={0} max={255} track={ch("b")} onChange={(v) => commit({ ...c, b: v / 255 })} />
              </>
            )}
            {mode === "oklch" && (
              <>
                <Range label="L" value={ok[0] * 100} min={0} max={100} step={0.1} unit="%" track={okL} onChange={(v) => commit({ ...gamutMap(v / 100, ok[1], ok[2]), a: c.a }, { ok: [v / 100, ok[1], ok[2]] })} />
                <Range label="C" value={ok[1]} min={0} max={0.37} step={0.001} track={okC} onChange={(v) => commit({ ...gamutMap(ok[0], v, ok[2]), a: c.a }, { ok: [ok[0], v, ok[2]] })} />
                <Range label="H" value={ok[2]} min={0} max={360} step={0.5} unit="°" track={okH} onChange={(v) => commit({ ...gamutMap(ok[0], ok[1], v), a: c.a }, { ok: [ok[0], ok[1], v] })} />
              </>
            )}
            <Range label="A" value={Math.round(c.a * 100)} min={0} max={100} unit="%" track={alphaTrack} onChange={(v) => commit({ ...c, a: v / 100 }, { hsl, ok })} />
          </div>
        </Card>

        <Card title="Formats" right={<CopyBtn text={formats.map((f) => `${f.label}: ${f.value}`).join("\n")} label="All" title="Copy all formats" />} bodyStyle={{ padding: "6px 8px" }}>
          <div className="fcp-formats">
            {formats.map((f) => (
              <div key={f.id} className="fcp-row">
                <span className="lbl" style={{ letterSpacing: ".05em" }}>{f.label}</span>
                <code className="mono" title={f.value}>{f.value}</code>
                <CopyBtn text={f.id === "named" ? f.value.split(" ")[0] : f.value} title={`Copy ${f.label}`} />
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card title="Tints & shades (OKLCH 50–950)" right={<CopyBtn label="CSS vars" title="Copy as CSS custom properties" text={scale.map((x) => `--color-${x.step}: ${toHex(x.color)};`).join("\n")} />}>
        <div className="fcp-scale">
          {scale.map((x) => {
            const hx = toHex(x.color);
            return (
              <button key={x.step} type="button" className="f-sw" onClick={() => pick(hx)} title={`${x.step} · ${hx} — click to select`} style={{ background: hx, color: readableOn(x.color) }}>
                <b>{x.step}</b>
                <span className="mono">{hx}</span>
                {x.base && <i title="Your colour">●</i>}
              </button>
            );
          })}
        </div>
      </Card>

      <Card title="Harmonies">
        <div className="fcp-harm">
          {harm.map((g) => (
            <div key={g.id}>
              <div className="lbl" style={{ marginBottom: 6 }}>{g.label}</div>
              <div style={{ display: "flex", gap: 4 }}>
                {g.colors.map((col, i) => {
                  const hx = toHex(col);
                  return (
                    <button key={i} type="button" className="f-sw" onClick={() => pick(hx)} title={`${hx} — click to select`} style={{ background: hx, flex: 1, height: 44, color: readableOn(col) }}>
                      <span className="mono" style={{ fontSize: 10.5 }}>{hx}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title={`Saved swatches (${swatches.length})`} right={swatches.length ? <CopyBtn label="Copy list" text={swatches.join("\n")} /> : null}>
        {swatches.length ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {swatches.map((sw) => (
              <span key={sw} className="fcp-saved">
                <button type="button" className="f-sw" style={{ background: sw, width: 36, height: 36 }} onClick={() => pick(sw)} title={`${sw} — click to select`} aria-label={`Select ${sw}`} />
                <span className="mono" style={{ fontSize: 11 }}>{sw}</span>
                <button type="button" className="btn-icon" onClick={() => removeSwatch(sw)} aria-label={`Remove ${sw}`} title="Remove">
                  <ToolIcon name="x" size={12} />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: 14, color: "var(--color-neutral-600)" }}>Press Save to keep colours here. They are stored only in this browser.</p>
        )}
      </Card>
    </div>
  );
}

const CSS = `
.fcp-swatch{border-radius:10px;overflow:hidden;box-shadow:inset 0 0 0 1px rgba(0,0,0,.08)}
.fcp-swatch>div{min-height:170px;padding:18px 18px 16px;display:flex;flex-direction:column;justify-content:flex-end;gap:2px}
.fcp-pill{font-size:12px;padding:2px 8px;border-radius:999px;font-family:var(--font-mono);box-shadow:0 0 0 1px rgba(128,128,128,.35)}
.fcp-formats{display:grid}
.fcp-row{display:grid;grid-template-columns:128px minmax(0,1fr) auto;align-items:center;gap:8px;padding:5px 6px;border-bottom:1px solid rgba(32,30,29,.06)}
.fcp-row:last-child{border-bottom:0}
.fcp-row code{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fcp-row:hover{background:rgba(0,136,176,.05)}
.fcp-scale{display:grid;grid-template-columns:repeat(11,minmax(0,1fr));gap:4px}
.fcp-scale .f-sw{height:78px;display:flex;flex-direction:column;justify-content:flex-end;align-items:flex-start;padding:6px;font-size:12px;text-align:left}
.fcp-scale .f-sw span{font-size:10px;opacity:.9}
.fcp-scale .f-sw i{position:absolute;top:5px;right:7px;font-style:normal;font-size:12px}
.fcp-harm{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px}
.fcp-saved{display:inline-flex;align-items:center;gap:4px;padding:3px 4px 3px 3px;border:1px solid rgba(32,30,29,.1);border-radius:8px;background:rgba(255,255,255,.5)}
@media (max-width:720px){.fcp-scale{grid-template-columns:repeat(4,minmax(0,1fr))}.fcp-row{grid-template-columns:96px minmax(0,1fr) auto}}
`;
