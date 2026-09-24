"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ToolIcon from "../ToolIcon";
import { useApp } from "../AppState";
import { downloadBlob } from "../tool/OutputView";
import { ago } from "../tool/ToolHistory";
import { deleteWorkspace, newId, seedOnce, storageBytes, upsertWorkspace, useWorkspaces, type Workspace, type WorkspaceItem } from "@/src/lib/collections";
import { EXAMPLE_WORKSPACES } from "@/src/lib/workspace-examples";
import { categoryOfTool, plateInk, toolBySlug } from "@/src/lib/tools-registry";
import { fmtBytes } from "../tool/FileField";

function preview(item: WorkspaceItem) {
  const first = Object.entries(item.inputs).find(([k, v]) => !k.includes(":") && v);
  return (first?.[1] ?? "").replace(/\s+/g, " ").slice(0, 160);
}

export default function Workspaces() {
  const router = useRouter();
  const { setRestoreReq, flash } = useApp();
  const workspaces = useWorkspaces();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [fresh, setFresh] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [bytes, setBytes] = useState(0);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    seedOnce(() => EXAMPLE_WORKSPACES.forEach((w) => upsertWorkspace(w)));
  }, []);
  useEffect(() => setBytes(storageBytes()), [workspaces]);

  const active = workspaces.find((w) => w.id === activeId) ?? workspaces[0] ?? null;

  function update(w: Workspace) {
    if (!upsertWorkspace(w)) flash("Storage is full — delete something first");
  }

  function open(item: WorkspaceItem) {
    setRestoreReq({ slug: item.slug, input: "", opt: "", inputs: item.inputs, opts: item.opts });
    router.push(`/tools/${item.slug}`);
  }

  function create(name: string) {
    const id = newId("w");
    update({ id, name, items: [], updated: Date.now() });
    setActiveId(id);
  }

  return (
    <div style={{ padding: "clamp(20px,3vw,36px) clamp(16px,3vw,40px) 72px", maxWidth: 1300 }}>
      <h1 style={{ margin: "0 0 6px", fontSize: "clamp(28px,3.4vw,44px)", letterSpacing: "-.03em", lineHeight: 1.05 }}>Workspaces</h1>
      <p style={{ margin: "0 0 var(--space-6)", fontSize: 16.5, color: "var(--color-neutral-800)", maxWidth: "70ch" }}>
        Keep the exact inputs and options of any tool, grouped by project. Press <strong>Save</strong> on a tool page to add to a workspace; open an item to pick up where you left off. Everything lives in this browser — export a workspace to move it.
      </p>

      <div className="ws-grid" style={{ display: "grid", gridTemplateColumns: "280px minmax(0,1fr)", gap: 20, alignItems: "start" }}>
        <aside className="g2" style={{ borderRadius: "var(--radius-lg)", padding: 12, display: "grid", gap: 4 }}>
          {workspaces.map((w) => (
            <button
              key={w.id}
              type="button"
              data-testid="workspace"
              onClick={() => setActiveId(w.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                padding: "9px 10px",
                border: 0,
                borderRadius: "var(--radius-md)",
                background: active?.id === w.id ? "var(--color-accent-100)" : "none",
                cursor: "pointer",
                textAlign: "left",
                fontSize: 15,
              }}
            >
              <ToolIcon name="folders" size={17} color="var(--color-accent-700)" />
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.name}</span>
              <span className="mono" style={{ fontSize: 11.5, color: "var(--color-neutral-600)" }}>{w.items.length}</span>
            </button>
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (fresh.trim()) {
                create(fresh.trim());
                setFresh("");
              }
            }}
            style={{ display: "flex", gap: 6, marginTop: 8 }}
          >
            <input className="inp" placeholder="New workspace…" value={fresh} onChange={(e) => setFresh(e.target.value)} style={{ flex: 1, minWidth: 0 }} aria-label="New workspace name" data-testid="new-workspace" />
            <button className="btn btn-sm" type="submit">Create</button>
          </form>
          <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
            <button type="button" className="btn btn-sm" onClick={() => importRef.current?.click()}>
              <ToolIcon name="upload-simple" size={14} /> Import
            </button>
            <input
              ref={importRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                try {
                  const v = JSON.parse(await f.text());
                  const list: Workspace[] = Array.isArray(v) ? v : [v];
                  for (const w of list) {
                    if (!w || !Array.isArray(w.items)) throw new Error();
                    update({ ...w, id: newId("w"), name: String(w.name ?? "Imported"), items: w.items.map((i: WorkspaceItem) => ({ ...i, id: newId("i") })) });
                  }
                  flash(`Imported ${list.length} workspace${list.length === 1 ? "" : "s"}`);
                } catch {
                  flash("That file is not a workspace export");
                }
              }}
            />
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => downloadBlob(new Blob([JSON.stringify(workspaces, null, 2)], { type: "application/json" }), "formatter-workspaces.json")}
              disabled={!workspaces.length}
            >
              <ToolIcon name="export" size={14} /> Export all
            </button>
          </div>
          <p style={{ margin: "8px 2px 0", fontSize: 12, color: "var(--color-neutral-600)" }}>Local storage used: {fmtBytes(bytes)}</p>
        </aside>

        <section style={{ minWidth: 0 }}>
          {!active && (
            <div className="g2" style={{ padding: 24, borderRadius: "var(--radius-lg)", fontSize: 15 }}>
              No workspaces yet — create one on the left.
            </div>
          )}
          {active && (
            <>
              <div className="g2" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: "var(--radius-lg)", marginBottom: 12 }}>
                <input className="inp" value={active.name} onChange={(e) => update({ ...active, name: e.target.value })} aria-label="Workspace name" style={{ fontSize: 17, flex: 1, minWidth: 200 }} />
                <button type="button" className="btn btn-sm" onClick={() => downloadBlob(new Blob([JSON.stringify(active, null, 2)], { type: "application/json" }), `${active.name.replace(/[^\w-]+/g, "-").toLowerCase()}.json`)}>
                  <ToolIcon name="export" size={14} /> Export
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => {
                    const id = newId("w");
                    update({ ...active, id, name: `${active.name} (copy)`, items: active.items.map((i) => ({ ...i, id: newId("i") })) });
                    setActiveId(id);
                  }}
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-danger"
                  onClick={() => {
                    if (confirm(`Delete the workspace “${active.name}” and its ${active.items.length} items?`)) {
                      deleteWorkspace(active.id);
                      setActiveId(null);
                      flash("Workspace deleted");
                    }
                  }}
                >
                  <ToolIcon name="trash" size={14} /> Delete
                </button>
              </div>
              <textarea
                className="inp"
                placeholder="Notes about this workspace…"
                value={active.description ?? ""}
                onChange={(e) => update({ ...active, description: e.target.value })}
                rows={2}
                style={{ width: "100%", marginBottom: 12, resize: "vertical", fontSize: 14.5 }}
                aria-label="Workspace notes"
              />

              {active.items.length === 0 && (
                <div className="g2" style={{ padding: 22, borderRadius: "var(--radius-lg)", fontSize: 15, color: "var(--color-neutral-700)", lineHeight: 1.6 }}>
                  This workspace is empty. Open any tool, set it up, and press <strong>Save</strong> in its toolbar.
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 10 }}>
                {active.items.map((item, i) => {
                  const tool = toolBySlug(item.slug);
                  const ink = tool ? plateInk(categoryOfTool(tool).plate) : "var(--plate-k)";
                  return (
                    <div key={item.id} className="g fi" data-testid="workspace-item" style={{ borderRadius: "var(--radius-lg)", padding: "12px 14px", borderLeft: `3px solid ${ink}`, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <ToolIcon slug={item.slug} size={20} color={ink} />
                        {editing === item.id ? (
                          <input
                            className="inp"
                            autoFocus
                            defaultValue={item.label}
                            onBlur={(e) => {
                              update({ ...active, items: active.items.map((x) => (x.id === item.id ? { ...x, label: e.target.value } : x)) });
                              setEditing(null);
                            }}
                            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                            style={{ flex: 1 }}
                          />
                        ) : (
                          <button type="button" onClick={() => open(item)} style={{ flex: 1, minWidth: 180, textAlign: "left", border: 0, background: "none", padding: 0, cursor: "pointer" }}>
                            <strong style={{ display: "block", fontSize: 15.5 }}>{item.label}</strong>
                            <span style={{ fontSize: 12.5, color: "var(--color-neutral-600)" }}>
                              {tool?.title ?? item.slug} · saved {ago(item.saved)}
                            </span>
                          </button>
                        )}
                        <button type="button" className="btn btn-sm btn-primary" onClick={() => open(item)} data-testid="open-item">
                          Open
                        </button>
                        <button type="button" className="btn-icon" title="Rename" aria-label="Rename" onClick={() => setEditing(item.id)}>
                          <ToolIcon name="pencil-simple" size={15} />
                        </button>
                        <button
                          type="button"
                          className="btn-icon"
                          title="Move up"
                          aria-label="Move up"
                          disabled={i === 0}
                          onClick={() => {
                            const items = [...active.items];
                            [items[i - 1], items[i]] = [items[i], items[i - 1]];
                            update({ ...active, items });
                          }}
                          style={{ opacity: i === 0 ? 0.35 : 1 }}
                        >
                          <ToolIcon name="arrow-up" size={15} />
                        </button>
                        <button
                          type="button"
                          className="btn-icon"
                          title="Remove from workspace"
                          aria-label="Remove from workspace"
                          onClick={() => update({ ...active, items: active.items.filter((x) => x.id !== item.id) })}
                        >
                          <ToolIcon name="trash" size={15} />
                        </button>
                      </div>
                      {preview(item) && (
                        <div className="mono" style={{ marginTop: 8, fontSize: 12, color: "var(--color-neutral-700)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {preview(item)}
                        </div>
                      )}
                      <input
                        className="inp"
                        placeholder="Add a note…"
                        value={item.note ?? ""}
                        onChange={(e) => update({ ...active, items: active.items.map((x) => (x.id === item.id ? { ...x, note: e.target.value } : x)) })}
                        style={{ marginTop: 8, width: "100%", fontSize: 13.5, background: "transparent" }}
                        aria-label={`Note for ${item.label}`}
                      />
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
