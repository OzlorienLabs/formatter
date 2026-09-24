"use client";

import { useState } from "react";
import ToolIcon from "../ToolIcon";
import { useApp } from "../AppState";
import type { HistoryEntry } from "@/src/lib/store";

export function ago(t: number) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** This tool's runs from the shared history, with restore and delete. */
export default function ToolHistory({ slug, onRestore }: { slug: string; onRestore: (h: HistoryEntry) => void }) {
  const { history, removeHistory, clearHistoryFor, settings, flash } = useApp();
  const [open, setOpen] = useState(false);
  const mine = history.filter((h) => h.slug === slug);

  return (
    <section aria-label="Run history" data-testid="tool-history">
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          className="ctl"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          style={{ display: "flex", alignItems: "center", gap: 8, border: 0, background: "none", padding: 0, cursor: "pointer", fontSize: 15, color: "var(--color-accent-700)" }}
        >
          <ToolIcon name="clock-counter-clockwise" size={16} color="var(--color-accent-700)" />
          {open ? "Hide" : "Show"} history for this tool ({mine.length})
        </button>
        {!settings.keephist && <span style={{ fontSize: 13, color: "var(--color-neutral-600)" }}>Recording is off in Settings.</span>}
        <div style={{ flex: 1 }} />
        {open && mine.length > 0 && (
          <button
            type="button"
            className="btn btn-sm btn-danger"
            onClick={() => {
              if (confirm(`Delete all ${mine.length} saved runs for this tool?`)) {
                clearHistoryFor(slug);
                flash("History for this tool deleted");
              }
            }}
          >
            <ToolIcon name="trash" size={14} /> Delete all
          </button>
        )}
      </div>
      {open && (
        <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
          {mine.length === 0 && (
            <p style={{ margin: 0, fontSize: 14, color: "var(--color-neutral-600)" }}>
              Runs are saved here automatically, in this browser only. Nothing yet.
            </p>
          )}
          {mine.map((h) => (
            <div key={h.id} className="g2" data-testid="tool-history-entry" style={{ display: "flex", gap: 12, alignItems: "center", padding: "9px 12px", borderRadius: "var(--radius-lg)" }}>
              <span className="mono" style={{ fontSize: 11.5, color: "var(--color-neutral-600)", width: 64, flex: "none" }}>{ago(h.t)}</span>
              <span className="mono" style={{ flex: 1, minWidth: 0, fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--color-neutral-800)" }}>
                {(h.fin || Object.values(h.opts ?? {}).join(" · ") || "—").replace(/\s+/g, " ").slice(0, 140)}
              </span>
              <button type="button" className="btn btn-sm" onClick={() => onRestore(h)}>
                <ToolIcon name="arrow-u-down-left" size={14} /> Restore
              </button>
              <button type="button" className="btn-icon" aria-label="Delete this run" title="Delete" onClick={() => removeHistory(h.id)}>
                <ToolIcon name="trash" size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
