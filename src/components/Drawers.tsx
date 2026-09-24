"use client";

import { useRouter } from "next/navigation";
import Drawer from "./Drawer";
import ToolIcon from "./ToolIcon";
import { useApp } from "./AppState";
import { categoryOfTool, plateInk, toolBySlug } from "@/src/lib/tools-registry";
import { useEffect, useState } from "react";
import { clearOfflineCache, makeEverythingOffline, useOnline } from "@/src/lib/offline";
import { COLLECTION_KEYS, saveList, storageBytes, usePipelines, useWorkspaces } from "@/src/lib/collections";
import { fmtBytes } from "./tool/FileField";

function OfflineSection() {
  const online = useOnline();
  const [sw, setSw] = useState<"none" | "off" | "on">("none");
  const [progress, setProgress] = useState<string>("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    setSw(navigator.serviceWorker.controller ? "on" : "off");
  }, []);
  return (
    <div>
      <p style={sectionLabel}>Offline</p>
      <p style={{ margin: "0 0 10px", fontSize: 14, color: "var(--color-neutral-700)", lineHeight: 1.55 }}>
        {online ? "You are online." : "You are offline — cached tools keep working."}{" "}
        {sw === "on"
          ? "Pages and tool code are cached automatically as you browse."
          : sw === "off"
            ? "The offline cache activates after the next reload."
            : "This browser does not support offline caching."}
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 9, alignItems: "center" }}>
        <button
          className="ctl"
          type="button"
          disabled={busy || sw === "none"}
          onClick={async () => {
            setBusy(true);
            setProgress("Preparing…");
            const n = await makeEverythingOffline((d, t) => setProgress(`${d} / ${t}`));
            setProgress(`Done — ${n} files cached`);
            setBusy(false);
          }}
          style={{ ...ghost, padding: "8px 14px", fontSize: 14 }}
        >
          Make every tool available offline
        </button>
        <button className="ctl" type="button" disabled={sw === "none"} onClick={() => { void clearOfflineCache(); setProgress("Offline cache cleared"); }} style={{ ...ghost, padding: "8px 14px", fontSize: 14 }}>
          Clear offline cache
        </button>
      </div>
      {progress && <p className="mono" style={{ margin: "8px 0 0", fontSize: 12.5, color: "var(--color-neutral-700)" }}>{progress}</p>}
      <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "var(--color-neutral-600)", lineHeight: 1.5 }}>
        Includes the WebAssembly runtimes (Python, SQLite, OpenSCAD, jq, three.js) — about 30 MB, downloaded from this site only.
      </p>
    </div>
  );
}

function ago(t: number) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const ghost: React.CSSProperties = {
  padding: "5px 11px",
  border: "1px solid rgba(32,30,29,.14)",
  borderRadius: "var(--radius-md)",
  background: "none",
  cursor: "pointer",
  fontSize: 13,
};

const sectionLabel: React.CSSProperties = {
  margin: "0 0 10px",
  fontSize: 11.5,
  letterSpacing: ".13em",
  textTransform: "uppercase",
  color: "var(--color-neutral-600)",
};

const checkRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 11,
  padding: "10px 0",
  cursor: "pointer",
  fontSize: 15.5,
};

function HistoryBody() {
  const router = useRouter();
  const { history, removeHistory, clearHistory, setDrawer, setRestoreReq, flash } = useApp();

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "var(--space-4)" }}>
        <p style={{ margin: 0, fontSize: 14, color: "var(--color-neutral-700)" }}>
          {history.length ? `${history.length} runs, newest first` : "Nothing recorded yet"}
        </p>
        <div style={{ flex: 1 }} />
        {history.length > 0 && (
          <button
            className="ctl"
            type="button"
            onClick={() => {
              clearHistory();
              flash("History cleared");
            }}
            style={{
              border: 0,
              background: "none",
              padding: 4,
              cursor: "pointer",
              fontSize: 13,
              color: "var(--color-accent-2-700)",
              textDecoration: "underline",
            }}
          >
            Clear all
          </button>
        )}
      </div>

      {history.map((h) => {
        const tool = toolBySlug(h.slug);
        const ink = tool ? plateInk(categoryOfTool(tool).plate) : "var(--plate-k)";
        return (
          <div
            key={h.id}
            className="g2"
            data-testid="history-entry"
            data-slug={h.slug}
            style={{ position: "relative", padding: "13px 15px", borderRadius: "var(--radius-lg)", marginBottom: 9 }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <ToolIcon slug={h.slug} size={17} color={ink} />
              <strong style={{ fontSize: 15.5 }}>{h.name}</strong>
              <div style={{ flex: 1 }} />
              <span className="mono" style={{ fontSize: 11.5, color: "var(--color-neutral-600)" }}>
                {ago(h.t)}
              </span>
            </div>
            <div
              className="mono"
              style={{
                marginTop: 8,
                fontSize: 12,
                lineHeight: 1.5,
                color: "var(--color-neutral-700)",
                display: "grid",
                gap: 3,
              }}
            >
              <span style={{ display: "flex", gap: 7 }}>
                <span style={{ color: "var(--color-neutral-500)", flex: "none" }}>in</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {(h.fin || "").replace(/\s+/g, " ").slice(0, 80) || "—"}
                </span>
              </span>
              <span style={{ display: "flex", gap: 7 }}>
                <span style={{ color: ink, flex: "none" }}>out</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {(h.fout || "").replace(/\s+/g, " ").slice(0, 80)}
                </span>
              </span>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button
                className="ctl"
                type="button"
                style={ghost}
                onClick={() => {
                  setRestoreReq({ slug: h.slug, input: h.fin, opt: h.opt, inputs: h.inputs, opts: h.opts });
                  setDrawer(null);
                  router.push(`/tools/${h.slug}`);
                }}
              >
                Restore
              </button>
              <button
                className="ctl"
                type="button"
                style={ghost}
                onClick={() => {
                  navigator.clipboard?.writeText(h.fout || "");
                  flash("Output copied");
                }}
              >
                Copy output
              </button>
              <div style={{ flex: 1 }} />
              <button
                className="ctl"
                type="button"
                title="Delete"
                aria-label={`Delete the ${h.name} entry`}
                onClick={() => removeHistory(h.id)}
                style={{ border: 0, background: "none", padding: 4, cursor: "pointer", color: "var(--color-neutral-500)" }}
              >
                <ToolIcon name="trash" size={15} />
              </button>
            </div>
          </div>
        );
      })}

      {history.length === 0 && (
        <p style={{ margin: "var(--space-6) 0 0", fontSize: 15, color: "var(--color-neutral-700)", lineHeight: 1.6 }}>
          No runs yet. Every time a tool produces output it is logged here with its input, so you can come back to it
          tomorrow.
        </p>
      )}
    </div>
  );
}

function SettingsBody() {
  const { settings, history, favs, clearHistory, clearFavs, flash } = useApp();
  const workspaces = useWorkspaces();
  const pipelines = usePipelines();
  const [bytes, setBytes] = useState(0);
  useEffect(() => setBytes(storageBytes()), [history, favs, workspaces, pipelines]);

  return (
    <div style={{ display: "grid", gap: "var(--space-6)" }}>
      <div>
        <p style={sectionLabel}>Appearance</p>
        <label style={checkRow}>
          <input
            type="checkbox"
            checked={settings.glass}
            onChange={(e) => settings.set({ glass: e.target.checked })}
            style={{ accentColor: "var(--color-accent-700)", width: 16, height: 16 }}
          />
          <span>
            Frosted surfaces
            <span style={{ display: "block", fontSize: 13, color: "var(--color-neutral-700)" }}>
              Turn off for flat panels on older machines.
            </span>
          </span>
        </label>
        <label style={checkRow}>
          <input
            type="checkbox"
            checked={settings.motion}
            onChange={(e) => settings.set({ motion: e.target.checked })}
            style={{ accentColor: "var(--color-accent-700)", width: 16, height: 16 }}
          />
          <span>
            Motion
            <span style={{ display: "block", fontSize: 13, color: "var(--color-neutral-700)" }}>
              Entrances, drifts and transitions.
            </span>
          </span>
        </label>
        <div style={{ padding: "10px 0" }}>
          <label htmlFor="mono-size" style={{ display: "block", fontSize: 15.5, marginBottom: 7 }}>
            Editor text size — {settings.mono}px
          </label>
          <input
            id="mono-size"
            type="range"
            min={12}
            max={18}
            step={1}
            value={settings.mono}
            onChange={(e) => settings.set({ mono: Number(e.target.value) })}
            style={{ width: "100%", accentColor: "var(--color-accent-700)" }}
          />
        </div>
      </div>

      <div>
        <p style={sectionLabel}>Behaviour</p>
        <label style={checkRow}>
          <input
            type="checkbox"
            checked={settings.autorun}
            onChange={(e) => settings.set({ autorun: e.target.checked })}
            style={{ accentColor: "var(--color-accent-700)", width: 16, height: 16 }}
          />
          <span>
            Run as you type
            <span style={{ display: "block", fontSize: 13, color: "var(--color-neutral-700)" }}>
              Off means the Run button is the only trigger.
            </span>
          </span>
        </label>
        <label style={checkRow}>
          <input
            type="checkbox"
            checked={settings.keephist}
            onChange={(e) => settings.set({ keephist: e.target.checked })}
            style={{ accentColor: "var(--color-accent-700)", width: 16, height: 16 }}
          />
          <span>
            Record history
            <span style={{ display: "block", fontSize: 13, color: "var(--color-neutral-700)" }}>
              Stored in this browser only, last 60 runs.
            </span>
          </span>
        </label>
      </div>

      <div>
        <p style={sectionLabel}>Local data</p>
        <p style={{ margin: "0 0 12px", fontSize: 14, color: "var(--color-neutral-700)", lineHeight: 1.55 }}>
          {history.length} history entries, {favs.length} favourites, {workspaces.length} workspaces and {pipelines.length} saved pipelines are held in this browser ({fmtBytes(bytes)}). Nothing is synced.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 9 }}>
          <button
            className="ctl"
            type="button"
            onClick={() => {
              clearHistory();
              flash("History cleared");
            }}
            style={{ ...ghost, padding: "8px 14px", fontSize: 14 }}
          >
            Clear history
          </button>
          <button
            className="ctl"
            type="button"
            onClick={() => {
              clearFavs();
              flash("Favourites cleared");
            }}
            style={{ ...ghost, padding: "8px 14px", fontSize: 14 }}
          >
            Clear favourites
          </button>
          <button
            className="ctl"
            type="button"
            data-testid="delete-all-data"
            onClick={() => {
              if (!confirm("Delete ALL local data — history, favourites, workspaces, saved pipelines, mock API routes and settings? This cannot be undone.")) return;
              clearHistory();
              clearFavs();
              saveList(COLLECTION_KEYS.workspaces, []);
              saveList(COLLECTION_KEYS.pipelines, []);
              try {
                for (const k of Object.keys(localStorage)) if (k.startsWith("fmt:") && k !== COLLECTION_KEYS.seeded) localStorage.removeItem(k);
              } catch {
                /* ignore */
              }
              flash("All local data deleted");
            }}
            style={{ ...ghost, padding: "8px 14px", fontSize: 14, color: "var(--color-accent-2-700)" }}
          >
            Delete all local data
          </button>
        </div>
      </div>

      <OfflineSection />
    </div>
  );
}

export default function Drawers() {
  const { drawer, setDrawer } = useApp();
  return (
    <Drawer
      open={drawer !== null}
      title={drawer === "settings" ? "Settings" : "History"}
      icon={drawer === "settings" ? "gear-six" : "clock-counter-clockwise"}
      onClose={() => setDrawer(null)}
    >
      {drawer === "settings" ? <SettingsBody /> : <HistoryBody />}
    </Drawer>
  );
}
