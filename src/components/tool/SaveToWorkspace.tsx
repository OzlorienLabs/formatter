"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import ToolIcon from "../ToolIcon";
import { useApp } from "../AppState";
import { addToWorkspace, newId, upsertWorkspace, useWorkspaces } from "@/src/lib/collections";

/** Popover: pick a workspace (or make one) and save the current tool state into it. */
export default function SaveToWorkspace({
  slug,
  title,
  inputs,
  opts,
  onClose,
}: {
  slug: string;
  title: string;
  inputs: Record<string, string>;
  opts: Record<string, string | number | boolean>;
  onClose: () => void;
}) {
  const { flash } = useApp();
  const workspaces = useWorkspaces();
  const [label, setLabel] = useState(`${title} — ${new Date().toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`);
  const [fresh, setFresh] = useState("");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (box.current && !box.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    setTimeout(() => document.addEventListener("mousedown", onDoc), 0);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  function save(wid: string, name: string) {
    const ok = addToWorkspace(wid, { slug, label: label.trim() || title, inputs, opts });
    flash(ok ? `Saved to “${name}”` : "Storage is full — delete something first");
    onClose();
  }

  return (
    <div ref={box} className="menu" role="dialog" aria-label="Save to workspace" style={{ right: 0, top: "calc(100% + 6px)", width: 300 }}>
      <label style={{ display: "grid", gap: 4, padding: "4px 6px 8px", fontSize: 12.5, color: "var(--color-neutral-700)" }}>
        Label
        <input className="inp" value={label} onChange={(e) => setLabel(e.target.value)} autoFocus />
      </label>
      <div className="lbl" style={{ padding: "4px 8px" }}>Save into</div>
      {workspaces.map((w) => (
        <button key={w.id} type="button" onClick={() => save(w.id, w.name)}>
          <ToolIcon name="folders" size={15} /> {w.name}
          <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--color-neutral-600)" }}>{w.items.length}</span>
        </button>
      ))}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const name = fresh.trim();
          if (!name) return;
          const id = newId("w");
          upsertWorkspace({ id, name, items: [], updated: Date.now() });
          save(id, name);
        }}
        style={{ display: "flex", gap: 6, padding: "8px 6px 4px" }}
      >
        <input className="inp" placeholder="New workspace…" value={fresh} onChange={(e) => setFresh(e.target.value)} style={{ flex: 1 }} aria-label="New workspace name" />
        <button type="submit" className="btn btn-sm">Create</button>
      </form>
      <Link href="/workspaces" style={{ fontSize: 13 }} onClick={onClose}>
        Manage workspaces →
      </Link>
    </div>
  );
}
