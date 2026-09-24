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
    <section className="g pane" aria-label={label} style={{ minHeight, maxHeight, ...style }}>
      <div className="pane-head">
        {views.length > 1 ? (
          <div className="tabs" role="tablist" style={{ minWidth: 0, flex: "1 1 auto" }}>
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
    <label title={hint} style={wide ? { gridColumn: "1 / -1" } : undefined}>
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
