"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";
import ToolIcon from "../ToolIcon";
import { useApp } from "../AppState";
import CodeEditor from "../tool/CodeEditor";
import OutputView, { downloadBlob } from "../tool/OutputView";
import { OptionControl } from "../tool/Controls";
import { loadSpec } from "@/src/tools";
import { defaultOpts, type ToolSpec, type View } from "@/src/tools/types";
import { pipeableCatalog, runPipeline, type PipeableTool, type StepOutcome } from "@/src/lib/pipeline";
import { deletePipeline, newId, upsertPipeline, usePipelines, type PipelineStep, type SavedPipeline } from "@/src/lib/collections";
import { RECIPES, type Recipe } from "@/src/lib/recipes";
import { CATEGORIES, categoryOfTool, plateInk, plateTint, toolBySlug } from "@/src/lib/tools-registry";

const PLATFORM_SLUG = "tool-pipelines";

function encodePipeline(source: string, steps: PipelineStep[], name: string) {
  return compressToEncodedURIComponent(JSON.stringify({ n: name, s: source, p: steps }));
}

function StepPicker({ onPick, onClose }: { onPick: (slug: string) => void; onClose: () => void }) {
  const [catalog, setCatalog] = useState<PipeableTool[] | null>(null);
  const [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    pipeableCatalog().then(setCatalog);
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
  const s = q.trim().toLowerCase();
  const list = (catalog ?? []).filter((t) => !s || `${t.meta.title} ${t.meta.slug} ${t.meta.description} ${t.meta.category}`.toLowerCase().includes(s));
  return (
    <div ref={box} className="menu scroll" role="dialog" aria-label="Add a step" style={{ left: 0, top: "calc(100% + 6px)", width: "min(440px, 90vw)", maxHeight: 420, overflow: "auto" }}>
      <input
        className="inp"
        autoFocus
        placeholder="Search tools that can be chained…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ width: "100%", marginBottom: 6 }}
        aria-label="Search tools"
        data-testid="step-search"
        onKeyDown={(e) => {
          if (e.key === "Enter" && list[0]) onPick(list[0].meta.slug);
        }}
      />
      {!catalog && <div className="skeleton" style={{ height: 120 }} />}
      {catalog &&
        CATEGORIES.map((c) => {
          const items = list.filter((t) => categoryOfTool(t.meta).slug === c.slug);
          if (!items.length) return null;
          return (
            <div key={c.slug}>
              <div className="lbl" style={{ padding: "8px 8px 4px", color: plateInk(c.plate) }}>{c.title}</div>
              {items.map((t) => (
                <button key={t.meta.slug} type="button" onClick={() => onPick(t.meta.slug)} data-testid={`pick-${t.meta.slug}`}>
                  <ToolIcon slug={t.meta.slug} size={16} color={plateInk(c.plate)} />
                  <span style={{ display: "grid" }}>
                    <span>{t.meta.title}</span>
                    <span style={{ fontSize: 12, color: "var(--color-neutral-600)" }}>{t.meta.description}</span>
                  </span>
                </button>
              ))}
            </div>
          );
        })}
      {catalog && list.length === 0 && <p style={{ padding: 8, fontSize: 14 }}>No chainable tool matches “{q}”.</p>}
    </div>
  );
}

function StepCard({
  step,
  index,
  count,
  outcome,
  running,
  mono,
  onChange,
  onMove,
  onRemove,
  onDuplicate,
  onRunTo,
}: {
  step: PipelineStep;
  index: number;
  count: number;
  outcome?: StepOutcome;
  running: boolean;
  mono: number;
  onChange: (s: PipelineStep) => void;
  onMove: (d: -1 | 1) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onRunTo: () => void;
}) {
  const tool = toolBySlug(step.slug);
  const cat = tool ? categoryOfTool(tool) : null;
  const ink = cat ? plateInk(cat.plate) : "var(--plate-k)";
  const tint = cat ? plateTint(cat.plate) : "var(--plate-k-tint)";
  const [spec, setSpec] = useState<ToolSpec | null>(null);
  const [open, setOpen] = useState(false);
  const [peek, setPeek] = useState(false);

  useEffect(() => {
    let live = true;
    loadSpec(step.slug).then((s) => live && setSpec(s));
    return () => {
      live = false;
    };
  }, [step.slug]);

  const opts = { ...(spec ? defaultOpts(spec) : {}), ...(step.opts ?? {}) };
  const secondary = spec?.inputs.slice(1).filter((f) => f.kind !== "file") ?? [];
  const changed = spec ? (spec.options ?? []).filter((o) => step.opts?.[o.id] !== undefined && step.opts[o.id] !== o.default) : [];
  const summary = changed
    .map((o) => {
      const v = step.opts![o.id];
      if (o.type === "toggle") return v ? o.label : `no ${o.label}`;
      if (o.type === "select" || o.type === "segment") {
        const c = o.choices.find((c) => (Array.isArray(c) ? c[0] : c) === String(v));
        return `${o.label}: ${c ? (Array.isArray(c) ? c[1] : c) : String(v)}`;
      }
      return `${o.label}: ${String(v).slice(0, 40)}`;
    })
    .join(" · ");
  const hasSettings = (spec?.options?.length ?? 0) > 0 || secondary.length > 0;
  const status = outcome?.status;

  return (
    <div className="g2 fi" data-testid="pipeline-step" style={{ borderRadius: "var(--radius-lg)", marginBottom: 10, opacity: step.off ? 0.55 : 1, borderLeft: `3px solid ${ink}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 14px", flexWrap: "wrap" }}>
        <span className="mono" style={{ width: 24, height: 24, display: "grid", placeItems: "center", borderRadius: "50%", background: tint, color: ink, fontSize: 12, flex: "none" }}>
          {index + 1}
        </span>
        <ToolIcon slug={step.slug} size={20} color={ink} />
        <button type="button" onClick={() => hasSettings && setOpen(!open)} style={{ flex: 1, minWidth: 140, textAlign: "left", border: 0, background: "none", padding: 0, cursor: hasSettings ? "pointer" : "default" }}>
          <strong style={{ display: "block", fontSize: 15.5 }}>{tool?.title ?? step.slug}</strong>
          <span className="mono" style={{ display: "block", fontSize: 11.5, color: "var(--color-neutral-600)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {summary || tool?.description || ""}
          </span>
        </button>
        {status && (
          <span
            className="mono"
            data-testid="step-status"
            data-status={status}
            style={{ fontSize: 11.5, padding: "2px 7px", borderRadius: 3, background: status === "ok" ? "rgba(0,160,90,.12)" : status === "error" ? "rgba(214,0,108,.1)" : "rgba(32,30,29,.06)", color: status === "ok" ? "oklch(42% .12 150)" : status === "error" ? "var(--color-accent-2-700)" : "var(--color-neutral-600)" }}
          >
            {status === "ok" ? `✓ ${outcome!.ms < 1 ? "<1" : Math.round(outcome!.ms)} ms` : status === "error" ? "✗ failed" : "skipped"}
          </span>
        )}
        <label className="tog" title="Enable or skip this step" style={{ fontSize: 12.5 }}>
          <input type="checkbox" checked={!step.off} onChange={(e) => onChange({ ...step, off: !e.target.checked })} aria-label={`Enable step ${index + 1}`} />
        </label>
        {hasSettings && (
          <button type="button" className="btn-icon" onClick={() => setOpen(!open)} aria-expanded={open} title="Step settings" aria-label={`Settings for step ${index + 1}`}>
            <ToolIcon name="sliders" size={16} />
          </button>
        )}
        <button type="button" className="btn-icon" disabled={index === 0} onClick={() => onMove(-1)} title="Move up" aria-label={`Move step ${index + 1} up`} style={{ opacity: index === 0 ? 0.35 : 1 }}>
          <ToolIcon name="arrow-up" size={15} />
        </button>
        <button type="button" className="btn-icon" disabled={index === count - 1} onClick={() => onMove(1)} title="Move down" aria-label={`Move step ${index + 1} down`} style={{ opacity: index === count - 1 ? 0.35 : 1 }}>
          <ToolIcon name="arrow-down" size={15} />
        </button>
        <button type="button" className="btn-icon" onClick={onDuplicate} title="Duplicate" aria-label={`Duplicate step ${index + 1}`}>
          <ToolIcon name="copy" size={15} />
        </button>
        <button type="button" className="btn-icon" onClick={onRemove} title="Remove" aria-label={`Remove step ${index + 1}`}>
          <ToolIcon name="x" size={15} />
        </button>
      </div>

      {open && spec && (
        <div style={{ padding: "4px 16px 14px 50px", display: "grid", gap: 10, borderTop: "1px solid rgba(32,30,29,.07)" }}>
          {(spec.options?.length ?? 0) > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 14px", paddingTop: 8 }}>
              {(spec.options ?? [])
                .filter((o) => !o.show || o.show(opts))
                .map((o) => (
                  <OptionControl key={o.id} spec={o} value={opts[o.id]} compact onChange={(v) => onChange({ ...step, opts: { ...(step.opts ?? {}), [o.id]: v } })} />
                ))}
            </div>
          )}
          {secondary.map((f) => (
            <label key={f.id} style={{ display: "grid", gap: 4 }}>
              <span className="lbl">{f.label}</span>
              {f.kind === "text" ? (
                <input className="inp mono" value={step.inputs?.[f.id] ?? ""} placeholder={f.placeholder} onChange={(e) => onChange({ ...step, inputs: { ...(step.inputs ?? {}), [f.id]: e.target.value } })} style={{ fontSize: 13 }} />
              ) : (
                <div className="g" style={{ display: "flex", height: Math.max(3, f.rows ?? 4) * mono * 1.6 + 26, borderRadius: "var(--radius-md)", overflow: "hidden" }}>
                  <CodeEditor value={step.inputs?.[f.id] ?? ""} onChange={(v) => onChange({ ...step, inputs: { ...(step.inputs ?? {}), [f.id]: v } })} lang={f.lang} fontSize={mono - 1} placeholder={f.placeholder} label={f.label} minHeight={60} />
                </div>
              )}
            </label>
          ))}
          <div>
            <button type="button" className="btn btn-sm" onClick={onRunTo} disabled={running}>
              <ToolIcon name="play" size={13} /> Run up to here
            </button>
          </div>
        </div>
      )}

      {outcome && (outcome.status === "error" || outcome.status === "ok") && (
        <div style={{ padding: "0 14px 10px 50px" }}>
          {outcome.status === "error" ? (
            <div role="alert" className="mono" style={{ fontSize: 12.5, color: "var(--color-accent-2-700)", whiteSpace: "pre-wrap" }}>
              {outcome.error}
            </div>
          ) : (
            <>
              <button type="button" className="btn-icon" onClick={() => setPeek(!peek)} style={{ fontSize: 12.5 }}>
                <ToolIcon name={peek ? "caret-down" : "caret-right"} size={12} /> {peek ? "Hide" : "Peek at"} output · {outcome.text.length.toLocaleString()} chars
              </button>
              {peek && (
                <pre className="mono scroll" style={{ margin: "6px 0 0", maxHeight: 180, overflow: "auto", fontSize: 12, padding: 10, background: "rgba(255,255,255,.5)", borderRadius: 6, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {outcome.text.slice(0, 5000)}
                  {outcome.text.length > 5000 ? "\n…" : ""}
                </pre>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function Pipelines() {
  const router = useRouter();
  const { pipeline, setPipeline, pipeSource, setPipeSource, settings, flash, record, restoreReq, setRestoreReq } = useApp();
  const saved = usePipelines();
  const [name, setName] = useState("Untitled pipeline");
  const [savedId, setSavedId] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<StepOutcome[]>([]);
  const [running, setRunning] = useState(false);
  const [picker, setPicker] = useState(false);
  const [view, setView] = useState(0);
  const [continueOnError, setContinueOnError] = useState(false);
  const [copied, setCopied] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const mono = settings.mono;

  // Arrival: a share link or a history restore wins.
  useEffect(() => {
    const h = window.location.hash.match(/#p=(.+)/);
    if (h) {
      try {
        const v = JSON.parse(decompressFromEncodedURIComponent(h[1]) ?? "null");
        if (v && Array.isArray(v.p)) {
          setPipeline(v.p);
          setPipeSource(String(v.s ?? ""));
          setName(String(v.n ?? "Shared pipeline"));
          return;
        }
      } catch {
        /* ignore */
      }
    }
    if (restoreReq && restoreReq.slug === PLATFORM_SLUG && restoreReq.inputs) {
      try {
        setPipeline(JSON.parse(restoreReq.inputs.steps ?? "[]"));
        setPipeSource(restoreReq.inputs.source ?? "");
        setName(restoreReq.inputs.name ?? "Restored pipeline");
      } catch {
        /* ignore */
      }
      setRestoreReq(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setSteps = useCallback(
    (s: PipelineStep[]) => {
      setPipeline(s);
      setOutcomes([]);
    },
    [setPipeline]
  );

  async function run(upTo?: number) {
    if (!pipeline.length) {
      flash("Add a step first");
      return;
    }
    setRunning(true);
    setOutcomes([]);
    const acc: StepOutcome[] = [];
    const res = await runPipeline(pipeSource, pipeline, (o) => {
      acc.push(o);
      setOutcomes([...acc]);
    }, { continueOnError, upTo });
    setRunning(false);
    setView(0);
    const last = res[res.length - 1];
    if (settings.keephist && last) {
      record({
        slug: PLATFORM_SLUG,
        name: `Pipeline: ${name}`,
        fin: pipeSource.slice(0, 400),
        fout: last.text.slice(0, 400),
        opt: "",
        inputs: { source: pipeSource.slice(0, 20000), steps: JSON.stringify(pipeline), name },
        opts: {},
      });
    }
  }

  function loadRecipe(r: Recipe | SavedPipeline, fromSaved = false) {
    setSteps(r.steps.map((s) => ({ ...s, opts: { ...(s.opts ?? {}) }, inputs: { ...(s.inputs ?? {}) } })));
    setPipeSource(r.source);
    setName("title" in r ? r.title : r.name);
    setSavedId(fromSaved ? (r as SavedPipeline).id : null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function save(asNew = false) {
    const id = !asNew && savedId ? savedId : newId("p");
    const ok = upsertPipeline({ id, name: name.trim() || "Untitled pipeline", source: pipeSource.slice(0, 50_000), steps: pipeline, updated: Date.now() });
    setSavedId(id);
    flash(ok ? `Saved “${name}”` : "Storage is full — delete something first");
  }

  const last = outcomes[outcomes.length - 1];
  const failed = outcomes.find((o) => o.status === "error");
  const finalViews: View[] = useMemo(() => {
    if (!last) return [];
    const okLast = [...outcomes].reverse().find((o) => o.status === "ok");
    if (okLast?.result?.views?.length) return okLast.result.views;
    return [{ label: "Output", out: { kind: "text", text: last.text, lang: okLast?.result?.lang } }];
  }, [outcomes, last]);
  const activeView = finalViews[Math.min(view, finalViews.length - 1)];
  const finalText = last?.text ?? "";

  const examples = RECIPES.filter((r) => r.featured);

  return (
    <div style={{ padding: "clamp(20px,3vw,36px) clamp(16px,3vw,40px) 72px", maxWidth: 1400 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: "var(--space-4)" }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <h1 style={{ margin: "0 0 6px", fontSize: "clamp(28px,3.4vw,44px)", letterSpacing: "-.03em", lineHeight: 1.05 }}>Pipelines</h1>
          <p style={{ margin: 0, fontSize: 16.5, color: "var(--color-neutral-800)", maxWidth: "68ch" }}>
            Chain tools so each step’s output feeds the next. Configure every step’s options, peek at intermediate results, save chains and share them — all in this tab.
          </p>
        </div>
        <Link href="/recipes" className="btn">
          <ToolIcon name="cards-three" size={15} /> Browse recipes
        </Link>
      </div>

      <div className="pipe-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 300px", gap: 20, alignItems: "start" }}>
        <div style={{ minWidth: 0 }}>
          {/* ── name + actions ─────────────────────────────────── */}
          <div className="g2" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: "var(--radius-lg)", marginBottom: 12 }}>
            <input className="inp" value={name} onChange={(e) => setName(e.target.value)} aria-label="Pipeline name" style={{ flex: 1, minWidth: 180, fontSize: 15.5 }} data-testid="pipeline-name" />
            <button type="button" className="btn" onClick={() => save(false)} data-testid="pipeline-save">
              <ToolIcon name="floppy-disk" size={15} /> {savedId ? "Save" : "Save pipeline"}
            </button>
            {savedId && (
              <button type="button" className="btn" onClick={() => save(true)}>
                Save as copy
              </button>
            )}
            <button
              type="button"
              className="btn"
              onClick={() => {
                const url = `${window.location.origin}/pipelines#p=${encodePipeline(pipeSource.slice(0, 20000), pipeline, name)}`;
                navigator.clipboard?.writeText(url).catch(() => {});
                flash("Share link copied — the whole pipeline rides in the URL fragment");
              }}
              disabled={!pipeline.length}
            >
              <ToolIcon name="share-network" size={15} /> Share
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => downloadBlob(new Blob([JSON.stringify({ name, source: pipeSource, steps: pipeline }, null, 2)], { type: "application/json" }), `${name.replace(/[^\w-]+/g, "-").toLowerCase() || "pipeline"}.json`)}
              disabled={!pipeline.length}
            >
              <ToolIcon name="export" size={15} /> Export
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setSteps([]);
                setPipeSource("");
                setName("Untitled pipeline");
                setSavedId(null);
              }}
            >
              New
            </button>
          </div>

          {/* ── source ─────────────────────────────────────────── */}
          <section className="g pane" style={{ marginBottom: 12 }}>
            <div className="pane-head">
              <label className="lbl" htmlFor="pipe-source">Source input</label>
              <div style={{ flex: 1 }} />
              <span className="mono" style={{ fontSize: 11.5, color: "var(--color-neutral-600)" }}>
                {pipeSource.length.toLocaleString()} chars
              </span>
            </div>
            <div style={{ display: "flex", height: 170 }}>
              <CodeEditor id="pipe-source" value={pipeSource} onChange={setPipeSource} fontSize={mono} placeholder="Paste the starting payload — or drop a file. Generators at the start of a chain ignore it." label="Source input" onSubmit={() => void run()} minHeight={120} />
            </div>
          </section>

          {/* ── steps ──────────────────────────────────────────── */}
          {pipeline.length === 0 && (
            <div className="g2" style={{ padding: "22px 20px", borderRadius: "var(--radius-lg)", marginBottom: 12, fontSize: 15, color: "var(--color-neutral-700)", lineHeight: 1.6 }}>
              No steps yet. Add a tool below, press <strong>Pipeline</strong> on any tool page, or load one of the examples on the right.
            </div>
          )}
          {pipeline.map((step, i) => (
            <StepCard
              key={`${i}-${step.slug}`}
              step={step}
              index={i}
              count={pipeline.length}
              outcome={outcomes.find((o) => o.index === i)}
              running={running}
              mono={mono}
              onChange={(s) => setSteps(pipeline.map((x, k) => (k === i ? s : x)))}
              onMove={(d) => {
                const p = [...pipeline];
                [p[i], p[i + d]] = [p[i + d], p[i]];
                setSteps(p);
              }}
              onRemove={() => setSteps(pipeline.filter((_, k) => k !== i))}
              onDuplicate={() => setSteps([...pipeline.slice(0, i + 1), JSON.parse(JSON.stringify(step)), ...pipeline.slice(i + 1)])}
              onRunTo={() => void run(i)}
            />
          ))}

          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginTop: 4, position: "relative", zIndex: 5 }}>
            <span style={{ position: "relative" }}>
              <button type="button" className="btn" onClick={() => setPicker(!picker)} aria-expanded={picker} data-testid="add-step">
                <ToolIcon name="plus" size={15} /> Add step
              </button>
              {picker && (
                <StepPicker
                  onClose={() => setPicker(false)}
                  onPick={(slug) => {
                    setSteps([...pipeline, { slug, opts: {}, inputs: {} }]);
                    setPicker(false);
                  }}
                />
              )}
            </span>
            <label className="tog" title="Keep going after a failing step">
              <input type="checkbox" checked={continueOnError} onChange={(e) => setContinueOnError(e.target.checked)} /> Continue on error
            </label>
            <div style={{ flex: 1 }} />
            <button type="button" className="btn btn-primary" onClick={() => void run()} disabled={running} data-testid="run-chain">
              <ToolIcon name={running ? "arrows-clockwise" : "play"} size={15} color="#fff" /> {running ? "Running…" : "Run chain"}
            </button>
          </div>

          {/* ── result ─────────────────────────────────────────── */}
          {last && (
            <section className="g pane fi" style={{ marginTop: 18, minHeight: 260, maxHeight: 620 }}>
              <div className="pane-head">
                {finalViews.length > 1 ? (
                  <div className="tabs" role="tablist">
                    {finalViews.map((v, i) => (
                      <button key={v.label} type="button" role="tab" aria-selected={activeView === v} onClick={() => setView(i)}>
                        {v.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <span className="lbl">{failed ? "Stopped" : "Result"}</span>
                )}
                <div style={{ flex: 1 }} />
                <span className="mono" style={{ fontSize: 11.5, color: failed ? "var(--color-accent-2-700)" : "var(--color-neutral-600)" }}>
                  {failed ? `step ${failed.index + 1} failed` : `${outcomes.filter((o) => o.status === "ok").length} steps · ${Math.round(outcomes.reduce((n, o) => n + o.ms, 0))} ms`}
                </span>
                <button
                  type="button"
                  className="btn-icon"
                  onClick={() => {
                    navigator.clipboard?.writeText(finalText).catch(() => {});
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1400);
                  }}
                >
                  <ToolIcon name={copied ? "check" : "copy"} size={16} /> {copied ? "Copied" : "Copy"}
                </button>
                <button type="button" className="btn-icon" aria-label="Download result" onClick={() => downloadBlob(new Blob([finalText], { type: "text/plain" }), "pipeline-output.txt")}>
                  <ToolIcon name="download-simple" size={16} />
                </button>
                <button
                  type="button"
                  className="btn-icon"
                  title="Use this result as the source"
                  onClick={() => {
                    setPipeSource(finalText);
                    setOutcomes([]);
                    flash("Result moved into the source");
                  }}
                >
                  <ToolIcon name="arrow-u-down-left" size={16} /> Use as source
                </button>
              </div>
              {failed && (
                <div className="errband" role="alert">
                  <ToolIcon name="warning-circle" size={18} color="var(--color-accent-2-700)" />
                  <span className="mono" style={{ fontSize: 13, color: "var(--color-accent-2-700)", whiteSpace: "pre-wrap" }}>
                    Step {failed.index + 1} ({toolBySlug(failed.slug)?.title}): {failed.error}
                  </span>
                </div>
              )}
              <div className="scroll" style={{ flex: 1, overflow: "auto", minHeight: 0 }} data-testid="pipeline-result">
                {activeView && <OutputView out={activeView.out} fontSize={mono} />}
              </div>
            </section>
          )}
        </div>

        {/* ── side: examples and saved ───────────────────────────── */}
        <aside style={{ display: "grid", gap: 16 }}>
          <section className="g2" style={{ borderRadius: "var(--radius-lg)", padding: "14px 14px 10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <ToolIcon name="floppy-disk" size={16} color="var(--color-accent-700)" />
              <strong style={{ fontSize: 15.5 }}>Saved pipelines</strong>
              <div style={{ flex: 1 }} />
              <button type="button" className="btn-icon" onClick={() => importRef.current?.click()} title="Import a pipeline JSON file">
                <ToolIcon name="upload-simple" size={15} /> Import
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
                    if (!Array.isArray(v.steps)) throw new Error("No steps");
                    setSteps(v.steps);
                    setPipeSource(String(v.source ?? ""));
                    setName(String(v.name ?? f.name.replace(/\.json$/, "")));
                    setSavedId(null);
                    flash("Pipeline imported — press Save to keep it");
                  } catch {
                    flash("That file is not a pipeline export");
                  }
                }}
              />
            </div>
            {saved.length === 0 && <p style={{ margin: "4px 0 6px", fontSize: 13.5, color: "var(--color-neutral-600)" }}>Nothing saved yet. Saved pipelines stay in this browser.</p>}
            {saved.map((p) => (
              <div key={p.id} data-testid="saved-pipeline" style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 0", borderTop: "1px solid rgba(32,30,29,.07)" }}>
                <button type="button" onClick={() => loadRecipe(p, true)} style={{ flex: 1, minWidth: 0, textAlign: "left", border: 0, background: "none", cursor: "pointer", padding: 0 }}>
                  <span style={{ display: "block", fontSize: 14.5, color: savedId === p.id ? "var(--color-accent-800)" : undefined, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                  <span style={{ fontSize: 12, color: "var(--color-neutral-600)" }}>{p.steps.length} steps · {new Date(p.updated).toLocaleDateString()}</span>
                </button>
                <button
                  type="button"
                  className="btn-icon"
                  aria-label={`Delete ${p.name}`}
                  title="Delete"
                  onClick={() => {
                    if (confirm(`Delete the pipeline “${p.name}”?`)) {
                      deletePipeline(p.id);
                      if (savedId === p.id) setSavedId(null);
                    }
                  }}
                >
                  <ToolIcon name="trash" size={15} />
                </button>
              </div>
            ))}
          </section>

          <section className="g2" style={{ borderRadius: "var(--radius-lg)", padding: "14px 14px 10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <ToolIcon name="lightbulb" size={16} color="var(--color-accent-700)" />
              <strong style={{ fontSize: 15.5 }}>Examples</strong>
            </div>
            {examples.map((r) => (
              <button key={r.id} type="button" onClick={() => loadRecipe(r)} data-testid="pipeline-example" style={{ display: "block", width: "100%", textAlign: "left", border: 0, borderTop: "1px solid rgba(32,30,29,.07)", background: "none", cursor: "pointer", padding: "8px 0" }}>
                <span style={{ display: "block", fontSize: 14.5 }}>{r.title}</span>
                <span style={{ display: "block", fontSize: 12.5, color: "var(--color-neutral-600)", lineHeight: 1.4 }}>{r.steps.map((s) => toolBySlug(s.slug)?.title ?? s.slug).join(" → ")}</span>
              </button>
            ))}
          </section>

          {last && last.status === "ok" && (
            <section className="g2" style={{ borderRadius: "var(--radius-lg)", padding: "12px 14px", fontSize: 13.5, lineHeight: 1.5 }}>
              Continue in a tool:{" "}
              <button
                type="button"
                className="btn btn-sm"
                style={{ marginTop: 6 }}
                onClick={() => {
                  const lastStep = pipeline[last.index];
                  const fed = last.index > 0 ? outcomes.find((o) => o.index === last.index - 1)?.text ?? pipeSource : pipeSource;
                  setRestoreReq({ slug: lastStep.slug, input: fed, opt: "", inputs: { ...(lastStep.inputs ?? {}) }, opts: lastStep.opts });
                  router.push(`/tools/${lastStep.slug}`);
                }}
              >
                Open {toolBySlug(pipeline[last.index]?.slug)?.title}
              </button>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
