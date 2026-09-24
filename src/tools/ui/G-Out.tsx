"use client";

import { useEffect, useMemo, useState } from "react";
import ToolIcon from "@/src/components/ToolIcon";
import OutputView, { downloadBlob } from "@/src/components/tool/OutputView";
import type { Result, View } from "@/src/tools/types";

/**
 * The output pane used inside group-G custom UIs: tabs over `result.views`,
 * copy / download, the error band and notes — the same look as the shell's pane.
 */
export default function GOut({
  result,
  error,
  mono,
  onCopy,
  filename = "output.txt",
  minHeight = 320,
  maxHeight,
  label = "Output",
  extra,
  style,
  className,
}: {
  result: Result | null;
  error?: string;
  mono: number;
  onCopy?: (text: string) => void;
  filename?: string;
  minHeight?: number;
  maxHeight?: number | string;
  label?: string;
  extra?: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}) {
  const views: View[] = useMemo(() => {
    if (!result) return [];
    if (result.views?.length) return result.views;
    return [{ label, out: { kind: "text", text: result.text, lang: result.lang } }];
  }, [result, label]);
  const [tab, setTab] = useState(0);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (tab >= views.length) setTab(0);
  }, [views.length, tab]);
  const active = views[Math.min(tab, Math.max(0, views.length - 1))];
  const text = result?.text ?? "";

  return (
    <section className={`g pane${className ? " " + className : ""}`} aria-label={label} style={{ minHeight, maxHeight, ...style }}>
      <div className="pane-head">
        {views.length > 1 ? (
          <div className="tabs" role="tablist" style={{ minWidth: 0, flex: "1 1 0" }}>
            {views.map((v, i) => (
              <button key={v.label + i} type="button" role="tab" aria-selected={active === v} onClick={() => setTab(i)}>
                {v.label}
              </button>
            ))}
          </div>
        ) : (
          <span className="lbl" style={{ color: error ? "var(--color-accent-2-700)" : undefined }}>{error ? "Error" : active?.label ?? label}</span>
        )}
        <div style={{ flex: views.length > 1 ? "0 0 auto" : 1 }} />
        {extra}
        <button
          className="btn-icon"
          type="button"
          disabled={!text}
          onClick={() => {
            navigator.clipboard?.writeText(text).catch(() => {});
            setCopied(true);
            setTimeout(() => setCopied(false), 1300);
            onCopy?.(text);
          }}
        >
          <ToolIcon name={copied ? "check" : "copy"} size={16} /> {copied ? "Copied" : "Copy"}
        </button>
        <button
          className="btn-icon"
          type="button"
          title="Download"
          aria-label="Download the output"
          disabled={!result}
          onClick={() => result && downloadBlob(result.blob ?? new Blob([text], { type: "text/plain;charset=utf-8" }), result.filename ?? filename)}
        >
          <ToolIcon name="download-simple" size={16} />
        </button>
      </div>
      {error && (
        <div role="alert" className="errband">
          <ToolIcon name="warning-circle" size={18} color="var(--color-accent-2-700)" />
          <span className="mono" style={{ fontSize: 13, color: "var(--color-accent-2-700)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{error}</span>
        </div>
      )}
      {result?.notes?.map((n) => (
        <div key={n} className="note">
          <ToolIcon name="info" size={16} color="var(--plate-y)" />
          <span>{n}</span>
        </div>
      ))}
      <div className="scroll" style={{ flex: 1, overflow: "auto", minHeight: 0, position: "relative" }}>
        {active ? <OutputView out={active.out} fontSize={mono} /> : <pre className="codeview" style={{ color: "var(--color-neutral-500)", fontSize: mono }}>The result appears here.</pre>}
      </div>
    </section>
  );
}

/** A labelled form row: <label><span class=lbl>…</span>{control}</label>. */
export function Field({ label, children, hint, wide }: { label: string; children: React.ReactNode; hint?: string; wide?: boolean }) {
  return (
    <label title={hint} style={{ display: "grid", gap: 4, fontSize: 13, color: "var(--color-neutral-700)", minWidth: 0, ...(wide ? { gridColumn: "1 / -1" } : {}) }}>
      <span className="lbl" style={{ fontSize: 11 }}>{label}</span>
      {children}
    </label>
  );
}

export function Seg<T extends string>({ value, choices, onChange, label }: { value: T; choices: [T, string][]; onChange: (v: T) => void; label?: string }) {
  return (
    <span className="seg" role="group" aria-label={label}>
      {choices.map(([v, l]) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </span>
  );
}

export function Check({ checked, onChange, children, title }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode; title?: string }) {
  return (
    <label className="tog" title={title} style={{ display: "inline-flex" }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}

/** Parse a JSON-encoded input with a fallback. */
export function readState<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? { ...fallback, ...v } : fallback;
  } catch {
    return fallback;
  }
}

/** Key/value rows with an enable checkbox — headers, query params, form fields. */
export type KVRow = { k: string; v: string; on?: boolean };
export function KVEditor({ rows, onChange, keyPh = "name", valPh = "value", addLabel = "Add", hint }: { rows: KVRow[]; onChange: (r: KVRow[]) => void; keyPh?: string; valPh?: string; addLabel?: string; hint?: string }) {
  const set = (i: number, patch: Partial<KVRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="g-kv">
      {rows.map((r, i) => (
        <div key={i} className="g-kv-row">
          <input type="checkbox" checked={r.on !== false} onChange={(e) => set(i, { on: e.target.checked })} aria-label={`Enable ${r.k || "row"}`} />
          <input className="inp mono" value={r.k} placeholder={keyPh} onChange={(e) => set(i, { k: e.target.value })} aria-label={keyPh} spellCheck={false} />
          <input className="inp mono" value={r.v} placeholder={valPh} onChange={(e) => set(i, { v: e.target.value })} aria-label={valPh} spellCheck={false} />
          <button type="button" className="btn-icon" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label={`Remove ${r.k || "row"}`} title="Remove">
            <ToolIcon name="x" size={15} />
          </button>
        </div>
      ))}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button type="button" className="btn btn-sm" onClick={() => onChange([...rows, { k: "", v: "", on: true }])}>
          <ToolIcon name="plus" size={14} /> {addLabel}
        </button>
        {hint && <span style={{ fontSize: 12.5, color: "var(--color-neutral-600)" }}>{hint}</span>}
      </div>
    </div>
  );
}

/** Styles shared by the group-G form UIs. */
export const G_CSS = `
.g-split { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr); gap: 14px; align-items: start; }
.g-split > .pane { min-height: 520px; }
.g-sticky { position: sticky; top: 12px; max-height: calc(100vh - 24px); }
.g-form { padding: 14px; display: grid; gap: 16px; }
.g-sec { display: grid; gap: 10px; }
.g-sec > h3 { margin: 0; font-size: 12px; letter-spacing: .1em; text-transform: uppercase; color: var(--color-neutral-600); font-weight: 500; display: flex; align-items: center; gap: 8px; }
.g-sec > h3::after { content: ""; flex: 1; height: 1px; background: rgba(32,30,29,.1); }
.g-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.g-checks { display: flex; flex-wrap: wrap; gap: 8px 16px; }
.g-kv { display: grid; gap: 6px; }
.g-kv-row { display: grid; grid-template-columns: 18px minmax(0, .8fr) minmax(0, 1.2fr) 28px; gap: 6px; align-items: center; }
.g-kv-row input[type=checkbox] { accent-color: var(--color-accent-700); width: 15px; height: 15px; }
.g-hint { font-size: 12.5px; color: var(--color-neutral-600); line-height: 1.45; }
.g-form .grid-form { grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); }
.g-form textarea.inp { font-family: var(--font-mono); font-size: 13px; resize: vertical; min-height: 64px; line-height: 1.5; }
.g-choice { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 6px; }
.g-choice button { text-align: left; padding: 7px 10px; border: 1px solid rgba(32,30,29,.14); border-radius: var(--radius-md); background: rgba(255,255,255,.4); cursor: pointer; font-size: 13.5px; color: var(--color-neutral-800); }
.g-choice button:hover { border-color: var(--color-accent-400); }
.g-choice button[aria-pressed="true"] { background: var(--color-accent-100); border-color: var(--color-accent-500); color: var(--color-accent-900); }
.g-split.g-wide-left { grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); }
@media (max-width: 1100px) { .g-split, .g-split.g-wide-left { grid-template-columns: minmax(0, 1fr); } .g-sticky { position: static; max-height: none; } .g-split > section.pane:not(.g-sticky) { min-height: 0 !important; } .g-split > .g-sticky { min-height: 380px !important; max-height: 80vh; } }
@media (max-width: 520px) { .g-form { padding: 12px; } .g-choice { grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); } }
`;

/** A titled form section. */
export function Sec({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="g-sec">
      <h3>
        {title}
        {right}
      </h3>
      {children}
    </section>
  );
}
