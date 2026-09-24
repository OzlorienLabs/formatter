"use client";

import { useMemo } from "react";
import ToolIcon from "@/src/components/ToolIcon";
import type { CustomProps } from "../types";
import {
  apca,
  apcaVerdict,
  blend,
  contrastRatio,
  CVD_KINDS,
  fmt,
  parseColor,
  readableOn,
  simulate,
  suggestContrast,
  toHex,
  wcagGrades,
  type RGBA,
} from "../lib/F-color";
import { Card, CopyBtn, KIT_CSS } from "./F-kit";

const WHITE: RGBA = { r: 1, g: 1, b: 1, a: 1 };

function splitPair(fg: string, bg: string): [string, string] {
  const on = fg.match(/^(.*?)\s+(?:on|over|\/\/|vs\.?)\s+(.*)$/i);
  if (on && !bg.trim()) return [on[1].trim(), on[2].trim()];
  return [fg.trim(), bg.trim() || "#ffffff"];
}

function ColorField({ label, value, onChange, parsed }: { label: string; value: string; onChange: (v: string) => void; parsed: RGBA | null }) {
  const hex = parsed ? toHex({ ...parsed, a: 1 }) : "#000000";
  return (
    <label style={{ display: "grid", gap: 5 }}>
      <span className="lbl">{label}</span>
      <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span className="fct-chip" style={{ background: parsed ? toHex(parsed) : "transparent" }} title="Open the system colour picker">
          <input type="color" value={hex} onChange={(e) => onChange(e.target.value)} aria-label={`${label} picker`} />
        </span>
        <input
          className="inp mono"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          aria-label={label}
          style={{ flex: 1, minWidth: 0, fontSize: 14, borderColor: parsed ? undefined : "var(--color-accent-2-500)" }}
        />
      </span>
    </label>
  );
}

function Matrix({ palette, setInput, target }: { palette: string; setInput: CustomProps["setInput"]; target: number }) {
  const cols = useMemo(
    () =>
      palette
        .split("\n")
        .map((l) => l.replace(/\/\/.*$/, "").trim())
        .filter(Boolean)
        .map((l) => {
          const m = l.match(/^([\w\s-]+):\s*(.+)$/);
          const c = parseColor(m ? m[2] : l);
          return { label: m ? m[1].trim() : l, value: m ? m[2] : l, c: c ? { ...c, a: 1 } : null };
        }),
    [palette]
  );
  const good = cols.filter((c) => c.c) as { label: string; value: string; c: RGBA }[];
  const pairs = good.flatMap((a, i) => good.slice(i + 1).map((b) => contrastRatio(a.c, b.c))).filter((r) => r >= target).length;
  return (
    <div className="f-2col" style={{ gridTemplateColumns: "minmax(220px, 300px) minmax(0, 1fr)" }}>
      <Card title="Palette" right={<span className="mono" style={{ fontSize: 12, color: "var(--color-neutral-600)" }}>{good.length} colours</span>}>
        <textarea
          className="inp mono scroll"
          value={palette}
          onChange={(e) => setInput("palette", e.target.value)}
          spellCheck={false}
          aria-label="Palette, one colour per line"
          placeholder={"ink: #0f172a\npaper: #ffffff\nbrand: #0088b0"}
          style={{ width: "100%", minHeight: 260, fontSize: 13.5, lineHeight: 1.6, resize: "vertical" }}
        />
        <p style={{ fontSize: 13, color: "var(--color-neutral-600)", margin: "8px 0 0" }}>One colour per line, optionally named (<code>name: #hex</code>). Any CSS colour works.</p>
        {cols.some((c) => !c.c) && <p style={{ fontSize: 13, color: "var(--color-accent-2-700)", margin: "6px 0 0" }}>Not colours: {cols.filter((c) => !c.c).map((c) => c.value).join(", ")}</p>}
      </Card>
      <Card title="Contrast matrix" right={<span className="f-badge ok">{pairs} passing pairs ≥ {target}:1</span>} bodyStyle={{ padding: 0 }}>
        {good.length < 2 ? (
          <p style={{ padding: 14, margin: 0 }}>Add at least two colours.</p>
        ) : (
          <div className="scroll" style={{ overflow: "auto" }}>
            <table className="fct-m">
              <thead>
                <tr>
                  <th className="lbl">text ↓ / bg →</th>
                  {good.map((b) => (
                    <th key={b.label}>
                      <span className="fct-dot" style={{ background: toHex(b.c) }} /> {b.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {good.map((f) => (
                  <tr key={f.label}>
                    <th>
                      <span className="fct-dot" style={{ background: toHex(f.c) }} /> {f.label}
                    </th>
                    {good.map((b) => {
                      if (f === b) return <td key={b.label} className="fct-self">—</td>;
                      const r = contrastRatio(f.c, b.c);
                      const pass = r >= target;
                      return (
                        <td key={b.label} style={{ background: toHex(b.c), color: toHex(f.c), boxShadow: pass ? "inset 0 0 0 2px rgba(0,160,90,.55)" : undefined }} title={`${f.label} on ${b.label}: ${fmt(r, 2)}:1`}>
                          <b>Aa</b> <span className="mono">{fmt(r, 2)}</span>
                          <span className="fct-tag" style={{ background: readableOn(b.c) === "#000000" ? "rgba(0,0,0,.08)" : "rgba(255,255,255,.18)", color: readableOn(b.c) }}>
                            {r >= 7 ? "AAA" : r >= 4.5 ? "AA" : r >= 3 ? "Large" : "✗"}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

export default function Contrast({ inputs, opts, setInput, record }: CustomProps) {
  const target = opts.target === "aaa" ? 7 : opts.target === "large" ? 3 : 4.5;
  const [fgS, bgS] = splitPair(inputs.fg ?? "", inputs.bg ?? "");
  const fg0 = parseColor(fgS), bg0 = parseColor(bgS);
  const bg = bg0 ? (bg0.a < 1 ? blend(bg0, WHITE) : { ...bg0, a: 1 }) : WHITE;
  const fg = fg0 ? (fg0.a < 1 ? blend(fg0, bg) : { ...fg0, a: 1 }) : { r: 0, g: 0, b: 0, a: 1 };
  const ratio = contrastRatio(fg, bg);
  const grades = wcagGrades(ratio);
  const lc = apca(fg, bg);
  const fgHex = toHex(fg), bgHex = toHex(bg);

  const setPair = (f: string, b: string) => {
    setInput("fg", f);
    setInput("bg", b);
  };

  const suggestions = useMemo(
    () =>
      [
        { need: 3, label: "AA large / UI" },
        { need: 4.5, label: "AA" },
        { need: 7, label: "AAA" },
      ].map((lvl) => ({ ...lvl, fg: ratio < lvl.need ? suggestContrast(fg, bg, lvl.need) : null, bg: ratio < lvl.need ? suggestContrast(bg, fg, lvl.need) : null })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fgHex, bgHex]
  );

  if (opts.mode === "matrix") return (
    <div>
      <style>{KIT_CSS + CSS}</style>
      <Matrix palette={inputs.palette ?? ""} setInput={setInput} target={target} />
    </div>
  );

  const verdict = ratio >= 7 ? "Excellent" : ratio >= 4.5 ? "Good" : ratio >= 3 ? "Large text only" : "Poor";
  const tone = ratio >= 4.5 ? "ok" : ratio >= 3 ? "warn" : "bad";

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <style>{KIT_CSS + CSS}</style>
      <div className="f-2col">
        <Card title="Colours" right={<CopyBtn label="Copy report" text={`${fgHex} on ${bgHex}: ${fmt(ratio, 2)}:1 — ${grades.map((g) => `${g.label} ${g.pass ? "pass" : "fail"}`).join(", ")}; APCA Lc ${fmt(lc, 1)}`} />}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto minmax(0,1fr)", gap: 10, alignItems: "end" }}>
            <ColorField label="Text" value={fgS} parsed={fg0} onChange={(v) => setPair(v, bgS)} />
            <button type="button" className="btn btn-sm" title="Swap colours" aria-label="Swap text and background" onClick={() => setPair(bgS, fgS)} style={{ marginBottom: 2 }}>
              ⇄
            </button>
            <ColorField label="Background" value={bgS} parsed={bg0} onChange={(v) => setPair(fgS, v)} />
          </div>
          {(fg0?.a ?? 1) < 1 || (bg0?.a ?? 1) < 1 ? <p className="fct-note">Translucent colours are composited first: effective text {fgHex} on {bgHex}.</p> : null}
          <div className="fct-ratio">
            <div>
              <b className={tone}>{fmt(ratio, 2)}<small>:1</small></b>
              <span>{verdict}</span>
            </div>
            <div className="fct-apca" title="APCA (WCAG 3 draft) lightness contrast">
              <b>Lc {fmt(lc, 1)}</b>
              <span>{apcaVerdict(lc)}</span>
            </div>
          </div>
          <div className="fct-grades">
            {grades.map((g) => (
              <div key={g.id} className={g.pass ? "ok" : "bad"}>
                <ToolIcon name={g.pass ? "check" : "x"} size={14} />
                <span>{g.label}</span>
                <em className="mono">{g.need}:1</em>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Live preview" bodyStyle={{ padding: 0 }}>
          <div className="fct-prev" style={{ background: bgHex, color: fgHex }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
              <span style={{ fontSize: 56, lineHeight: 1, fontWeight: 600 }}>Aa</span>
              <span style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.1 }}>Headline 32 bold</span>
            </div>
            <p style={{ fontSize: 24, margin: 0 }}>Large text — 24px regular</p>
            <p style={{ fontSize: 18.66, fontWeight: 700, margin: 0 }}>Large bold — 18.66px (14pt) bold</p>
            <p style={{ fontSize: 16, margin: 0, lineHeight: 1.5 }}>Body text at 16px. The quick brown fox jumps over the lazy dog; numbers 0123456789.</p>
            <p style={{ fontSize: 14, margin: 0 }}>Small print at 14px — captions, footnotes and metadata.</p>
            <p style={{ fontSize: 12, margin: 0, fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>12px sans-serif UI label</p>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
              <span style={{ border: `2px solid ${fgHex}`, borderRadius: 6, padding: "6px 14px", fontSize: 14, fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>Outlined button</span>
              <span style={{ background: fgHex, color: bgHex, borderRadius: 6, padding: "7px 14px", fontSize: 14, fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>Filled button</span>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={fgHex} strokeWidth="2" strokeLinecap="round" aria-label="Icon sample"><circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" /></svg>
            </div>
          </div>
        </Card>
      </div>

      <Card title="Suggestions — nearest passing colours (OKLCH lightness)">
        {ratio >= 7 ? (
          <p style={{ margin: 0, fontSize: 14.5 }}>This pair already passes every WCAG level.</p>
        ) : (
          <div className="fct-sugg">
            {suggestions
              .filter((s) => ratio < s.need)
              .map((s) => (
                <div key={s.need} className={s.need === target ? "cur" : undefined}>
                  <div className="lbl">
                    {s.label} · {s.need}:1{s.need === target ? " · target" : ""}
                  </div>
                  {[
                    { which: "Text", sug: s.fg, apply: (h: string) => setPair(h, bgS) },
                    { which: "Background", sug: s.bg, apply: (h: string) => setPair(fgS, h) },
                  ].map(({ which, sug, apply }) => (
                    <div key={which} className="fct-srow">
                      {sug ? (
                        <>
                          <span className="fct-mini" style={{ background: which === "Text" ? bgHex : toHex(sug.color), color: which === "Text" ? toHex(sug.color) : fgHex }}>Aa</span>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            {which} <code className="mono">{toHex(sug.color)}</code> <span className="mono" style={{ color: "var(--color-neutral-600)", fontSize: 12.5 }}>{fmt(sug.ratio, 2)}:1{sug.flips ? " · flips polarity" : ""}</span>
                          </span>
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => {
                              apply(toHex(sug.color));
                              record(`${which} → ${toHex(sug.color)}`);
                            }}
                          >
                            Apply
                          </button>
                        </>
                      ) : (
                        <span style={{ color: "var(--color-neutral-600)", fontSize: 13.5 }}>{which}: no lightness change reaches {s.need}:1</span>
                      )}
                    </div>
                  ))}
                </div>
              ))}
          </div>
        )}
      </Card>

      <Card title="Colour-vision simulation">
        <div className="fct-cvd">
          {[["normal", "Typical vision"], ...CVD_KINDS].map(([k, label]) => {
            const f = k === "normal" ? fg : simulate(fg, k);
            const b = k === "normal" ? bg : simulate(bg, k);
            const r = contrastRatio(f, b);
            return (
              <div key={k}>
                <div className="fct-cvd-box" style={{ background: toHex(b), color: toHex(f) }}>
                  <b style={{ fontSize: 22 }}>Aa</b>
                  <span style={{ fontSize: 14 }}>Readable?</span>
                </div>
                <div style={{ fontSize: 13, marginTop: 5 }}>{label}</div>
                <div className="mono" style={{ fontSize: 12, color: r >= target ? "oklch(40% .12 150)" : "var(--color-accent-2-700)" }}>
                  {fmt(r, 2)}:1 {r >= target ? "✓" : "✗"}
                </div>
              </div>
            );
          })}
        </div>
        <p className="fct-note">Simulations use the Machado (2009) model at full severity. Contrast ratio barely changes for most pairs — colour deficiency mainly hurts hue-only distinctions (red vs green).</p>
      </Card>
    </div>
  );
}

const CSS = `
.fct-chip{position:relative;width:40px;height:36px;border-radius:6px;flex:none;box-shadow:inset 0 0 0 1px rgba(0,0,0,.15);overflow:hidden;background-image:none}
.fct-chip input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%}
.fct-ratio{display:flex;gap:16px;align-items:stretch;margin:16px 0 12px;flex-wrap:wrap}
.fct-ratio>div{display:flex;flex-direction:column;justify-content:center}
.fct-ratio b{font-size:46px;line-height:1;font-family:var(--font-mono);letter-spacing:-.03em}
.fct-ratio b small{font-size:22px;color:var(--color-neutral-500)}
.fct-ratio b.ok{color:oklch(45% .12 150)}.fct-ratio b.warn{color:oklch(55% .12 80)}.fct-ratio b.bad{color:var(--color-accent-2-700)}
.fct-ratio span{font-size:14px;color:var(--color-neutral-700)}
.fct-apca{border-left:1px solid rgba(32,30,29,.12);padding-left:16px}
.fct-apca b{font-size:22px!important}
.fct-grades{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:6px}
.fct-grades>div{display:flex;align-items:center;gap:7px;padding:6px 9px;border-radius:6px;font-size:13.5px}
.fct-grades>div em{margin-left:auto;font-style:normal;font-size:11.5px;opacity:.75}
.fct-grades .ok{background:rgba(0,160,90,.09);color:oklch(38% .1 150)}
.fct-grades .bad{background:rgba(214,0,108,.07);color:var(--color-accent-2-700)}
.fct-note{font-size:13px;color:var(--color-neutral-600);margin:8px 0 0}
.fct-prev{padding:20px 22px;display:grid;gap:10px;min-height:100%;border-radius:0 0 8px 8px}
.fct-sugg{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}
.fct-sugg>div{padding:10px 12px;border:1px solid rgba(32,30,29,.1);border-radius:8px;display:grid;gap:8px}
.fct-sugg>div.cur{border-color:var(--color-accent-400);background:rgba(0,136,176,.04)}
.fct-srow{display:flex;align-items:center;gap:8px;font-size:14px}
.fct-mini{width:34px;height:28px;border-radius:5px;display:grid;place-items:center;font-weight:700;font-size:14px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.1);flex:none}
.fct-cvd{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px}
.fct-cvd-box{height:74px;border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:inset 0 0 0 1px rgba(0,0,0,.08)}
.fct-m{border-collapse:separate;border-spacing:3px;font-size:13px;margin:6px}
.fct-m th{font-weight:500;text-align:left;white-space:nowrap;padding:4px 8px;font-size:12.5px}
.fct-m td{padding:10px 10px;border-radius:6px;white-space:nowrap;min-width:84px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.06)}
.fct-m td b{font-size:17px;margin-right:4px}
.fct-m td.fct-self{background:rgba(32,30,29,.04);text-align:center;color:var(--color-neutral-500)}
.fct-tag{font-size:10.5px;padding:1px 5px;border-radius:4px;margin-left:5px;font-family:var(--font-mono)}
.fct-dot{display:inline-block;width:11px;height:11px;border-radius:3px;vertical-align:-1px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.2)}
`;
