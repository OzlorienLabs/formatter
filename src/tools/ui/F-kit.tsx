"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import ToolIcon from "@/src/components/ToolIcon";

/** Small shared pieces for group F custom UIs. */

export function CopyBtn({ text, label, small = true, title }: { text: string; label?: string; small?: boolean; title?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={small ? "btn-icon" : "btn btn-sm"}
      title={title ?? `Copy ${text}`}
      aria-label={title ?? `Copy ${label ?? text}`}
      onClick={() => {
        navigator.clipboard?.writeText(text).catch(() => {});
        setDone(true);
        setTimeout(() => setDone(false), 1100);
      }}
    >
      <ToolIcon name={done ? "check" : "copy"} size={15} />
      {label !== undefined && <span>{done ? "Copied" : label}</span>}
    </button>
  );
}

export function Card({ title, right, children, style, bodyStyle }: { title?: ReactNode; right?: ReactNode; children: ReactNode; style?: CSSProperties; bodyStyle?: CSSProperties }) {
  return (
    <section className="g pane" style={{ minWidth: 0, ...style }}>
      {(title || right) && (
        <div className="pane-head">
          {typeof title === "string" ? <span className="lbl">{title}</span> : title}
          <div style={{ flex: 1 }} />
          {right}
        </div>
      )}
      <div style={{ padding: 14, minWidth: 0, ...bodyStyle }}>{children}</div>
    </section>
  );
}

export function Range({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  track,
  unit = "",
  width = 76,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  track?: string;
  unit?: string;
  width?: number;
}) {
  return (
    <label className="f-range">
      <span className="lbl" style={{ width: 18, letterSpacing: ".04em" }}>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={track ? { background: track } : undefined}
        className={track ? "f-track" : undefined}
        aria-label={label}
      />
      <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
        <input
          className="inp mono"
          type="number"
          min={min}
          max={max}
          step={step}
          value={Number.isFinite(value) ? +value.toFixed(step < 0.01 ? 3 : step < 0.1 ? 2 : step < 1 ? 1 : 0) : 0}
          onChange={(e) => {
            const n = e.target.valueAsNumber;
            if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
          }}
          style={{ width, fontSize: 12.5, padding: "3px 6px" }}
          aria-label={`${label} value`}
        />
        {unit && <span style={{ fontSize: 12, color: "var(--color-neutral-600)", width: 12 }}>{unit}</span>}
      </span>
    </label>
  );
}

export const KIT_CSS = `
.f-range{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:10px;font-size:13px}
.f-range input[type=range]{width:100%;accent-color:var(--color-accent-700);min-width:0}
.f-range input.f-track{-webkit-appearance:none;appearance:none;height:12px;border-radius:999px;border:1px solid rgba(32,30,29,.15);outline-offset:3px}
.f-range input.f-track::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:#fff;border:2px solid rgba(32,30,29,.55);box-shadow:0 1px 3px rgba(0,0,0,.25);cursor:pointer}
.f-range input.f-track::-moz-range-thumb{width:16px;height:16px;border-radius:50%;background:#fff;border:2px solid rgba(32,30,29,.55);box-shadow:0 1px 3px rgba(0,0,0,.25);cursor:pointer}
.f-range input.f-track::-moz-range-track{background:transparent}
.f-sw{border:0;padding:0;cursor:pointer;border-radius:6px;position:relative;box-shadow:inset 0 0 0 1px rgba(0,0,0,.08)}
.f-sw:focus-visible{outline:2px solid var(--color-accent-500);outline-offset:2px}
.f-badge{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;font-size:12px;font-family:var(--font-mono);white-space:nowrap}
.f-badge.ok{background:rgba(0,160,90,.12);color:oklch(40% .12 150)}
.f-badge.bad{background:rgba(214,0,108,.1);color:var(--color-accent-2-700)}
.f-badge.warn{background:rgba(237,187,0,.16);color:oklch(45% .1 80)}
.f-2col{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px}
@media (max-width: 900px){.f-2col{grid-template-columns:minmax(0,1fr)}}
`;
