"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ToolIcon from "../ToolIcon";
import { useApp } from "../AppState";
import OutputView from "../tool/OutputView";
import { RECIPES, type Recipe } from "@/src/lib/recipes";
import { runPipeline, type StepOutcome } from "@/src/lib/pipeline";
import { categoryOfTool, plateInk, toolBySlug } from "@/src/lib/tools-registry";

const AREAS = ["All", "Data", "API & Web", "Security", "DevOps", "Text & Code"] as const;

function RecipeCard({ r }: { r: Recipe }) {
  const router = useRouter();
  const { setPipeline, setPipeSource, settings, flash } = useApp();
  const [outcomes, setOutcomes] = useState<StepOutcome[] | null>(null);
  const [running, setRunning] = useState(false);
  const [showSource, setShowSource] = useState(false);

  async function tryIt() {
    setRunning(true);
    setOutcomes(await runPipeline(r.source, r.steps));
    setRunning(false);
  }

  const last = outcomes?.[outcomes.length - 1];
  const failed = outcomes?.find((o) => o.status === "error");
  const view = last?.result?.views?.[0]?.out ?? (last ? { kind: "text" as const, text: last.text, lang: last.result?.lang } : null);

  return (
    <article className="g lift card" data-testid="recipe" style={{ padding: "18px 18px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span className="mono" style={{ fontSize: 11, padding: "2px 7px", borderRadius: 3, background: "var(--color-accent-100)", color: "var(--color-accent-800)", textTransform: "uppercase", letterSpacing: ".05em" }}>{r.area}</span>
        <span className="mono" style={{ fontSize: 11, color: "var(--color-neutral-600)" }}>{r.level}</span>
      </div>
      <h2 style={{ margin: 0, fontSize: 20, letterSpacing: "-.02em", lineHeight: 1.2 }}>{r.title}</h2>
      <p style={{ margin: 0, fontSize: 15, color: "var(--color-neutral-800)", lineHeight: 1.5 }}>{r.summary}</p>
      <p style={{ margin: 0, fontSize: 13.5, color: "var(--color-neutral-700)", lineHeight: 1.55 }}>{r.why}</p>
      <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        {r.steps.map((s, i) => {
          const tool = toolBySlug(s.slug);
          const ink = tool ? plateInk(categoryOfTool(tool).plate) : "var(--plate-k)";
          return (
            <li key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {i > 0 && <span aria-hidden="true" style={{ color: "var(--color-neutral-500)" }}>→</span>}
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 8px", borderRadius: 999, border: "1px solid rgba(32,30,29,.12)", fontSize: 13, background: "rgba(255,255,255,.5)" }}>
                <ToolIcon slug={s.slug} size={14} color={ink} /> {tool?.title ?? s.slug}
              </span>
            </li>
          );
        })}
      </ol>
      <button type="button" className="btn-icon" onClick={() => setShowSource(!showSource)} style={{ alignSelf: "flex-start", fontSize: 13 }}>
        <ToolIcon name={showSource ? "caret-down" : "caret-right"} size={12} /> Sample input
      </button>
      {showSource && (
        <pre className="mono scroll" style={{ margin: 0, maxHeight: 160, overflow: "auto", fontSize: 12, padding: 10, background: "rgba(255,255,255,.5)", borderRadius: 6, whiteSpace: "pre-wrap" }}>{r.source || "(none — the first step generates data)"}</pre>
      )}
      <div style={{ flex: 1 }} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="btn btn-primary" onClick={() => void tryIt()} disabled={running} data-testid="recipe-run">
          <ToolIcon name={running ? "arrows-clockwise" : "play"} size={14} color="#fff" /> {running ? "Running…" : "Run it here"}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setPipeline(r.steps.map((s) => JSON.parse(JSON.stringify(s))));
            setPipeSource(r.source);
            flash(`Loaded “${r.title}” into Pipelines`);
            router.push("/pipelines");
          }}
        >
          <ToolIcon name="flow-arrow" size={14} /> Open in Pipelines
        </button>
      </div>
      {outcomes && (
        <div className="gi" style={{ borderRadius: "var(--radius-md)", overflow: "hidden", marginTop: 4 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "8px 10px", borderBottom: "1px solid rgba(32,30,29,.08)" }}>
            {outcomes.map((o) => (
              <span key={o.index} className="mono" style={{ fontSize: 11.5, color: o.status === "error" ? "var(--color-accent-2-700)" : "var(--color-neutral-700)" }}>
                {o.status === "ok" ? "✓" : o.status === "error" ? "✗" : "–"} {toolBySlug(o.slug)?.title}
              </span>
            ))}
          </div>
          {failed ? (
            <p role="alert" className="mono" style={{ margin: 0, padding: 10, fontSize: 12.5, color: "var(--color-accent-2-700)", whiteSpace: "pre-wrap" }}>{failed.error}</p>
          ) : (
            view && (
              <div className="scroll" data-testid="recipe-output" style={{ maxHeight: 320, overflow: "auto" }}>
                <OutputView out={view} fontSize={settings.mono - 1} />
              </div>
            )
          )}
          {r.expect && !failed && <p style={{ margin: 0, padding: "8px 10px", fontSize: 12.5, color: "var(--color-neutral-600)", borderTop: "1px solid rgba(32,30,29,.08)" }}>{r.expect}</p>}
        </div>
      )}
    </article>
  );
}

export default function Recipes() {
  const [area, setArea] = useState<(typeof AREAS)[number]>("All");
  const [q, setQ] = useState("");
  const s = q.trim().toLowerCase();
  const list = RECIPES.filter((r) => (area === "All" || r.area === area) && (!s || `${r.title} ${r.summary} ${r.why} ${r.steps.map((x) => x.slug).join(" ")}`.toLowerCase().includes(s)));
  return (
    <div style={{ padding: "clamp(20px,3vw,36px) clamp(16px,3vw,40px) 72px", maxWidth: 1400 }}>
      <h1 style={{ margin: "0 0 6px", fontSize: "clamp(28px,3.4vw,44px)", letterSpacing: "-.03em", lineHeight: 1.05 }}>Recipes</h1>
      <p style={{ margin: "0 0 var(--space-4)", fontSize: 16.5, color: "var(--color-neutral-800)", maxWidth: "70ch" }}>
        Explained, ready-to-run workflows that chain several tools. Run one here to see what it does, then open it in Pipelines to change its steps, options or input.
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: "var(--space-4)" }}>
        <input className="inp" placeholder="Search recipes…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 240 }} aria-label="Search recipes" />
        <div className="chips">
          {AREAS.map((a) => (
            <button key={a} type="button" className="chip" aria-pressed={area === a} onClick={() => setArea(a)}>
              {a} <span className="mono" style={{ fontSize: 11, opacity: 0.7 }}>{a === "All" ? RECIPES.length : RECIPES.filter((r) => r.area === a).length}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="toolgrid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
        {list.map((r) => (
          <RecipeCard key={r.id} r={r} />
        ))}
      </div>
      {list.length === 0 && <p style={{ fontSize: 15 }}>No recipe matches.</p>}
    </div>
  );
}
