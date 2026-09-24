"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";
import ToolIcon from "./ToolIcon";
import { useApp } from "./AppState";
import CodeEditor from "./tool/CodeEditor";
import FileField from "./tool/FileField";
import OutputView, { downloadBlob } from "./tool/OutputView";
import { OptionsBar } from "./tool/Controls";
import ToolHistory from "./tool/ToolHistory";
import SaveToWorkspace from "./tool/SaveToWorkspace";
import { loadSpec } from "@/src/tools";
import { errorMessage, runSpec } from "@/src/tools/runner";
import {
  defaultOpts,
  emptyInputs,
  isPipeable,
  type CustomProps,
  type Example,
  type Inputs,
  type Opts,
  type Result,
  type ToolSpec,
} from "@/src/tools/types";
import { clampInputs } from "@/src/lib/store";
import { categoryOfTool, plateInk, plateTint, toolBadge, type ToolMeta } from "@/src/lib/tools-registry";

const RECORD_AFTER_MS = 1600;

/** Inputs worth persisting: file payloads and oversize fields are left out. */
function persistable(spec: ToolSpec, inputs: Inputs): Inputs {
  const fileIds = new Set(spec.inputs.filter((f) => f.kind === "file").map((f) => f.id));
  const out: Inputs = {};
  for (const [k, v] of Object.entries(inputs)) {
    const base = k.split(":")[0];
    if (!fileIds.has(base)) out[k] = v;
  }
  return out;
}

export function exampleState(spec: ToolSpec, ex?: Example): { inputs: Inputs; opts: Opts } {
  return {
    inputs: { ...emptyInputs(spec), ...(ex?.inputs ?? {}) },
    opts: { ...defaultOpts(spec), ...((ex?.opts ?? {}) as Opts) },
  };
}

export function shareHash(inputs: Inputs, opts: Opts) {
  return `s=${compressToEncodedURIComponent(JSON.stringify({ i: inputs, o: opts }))}`;
}

function readHash(spec: ToolSpec): { inputs: Inputs; opts: Opts } | null {
  const h = window.location.hash;
  try {
    const s = h.match(/#s=(.+)/);
    if (s) {
      const v = JSON.parse(decompressFromEncodedURIComponent(s[1]) ?? "null");
      if (v && typeof v === "object") return { inputs: { ...emptyInputs(spec), ...v.i }, opts: { ...defaultOpts(spec), ...v.o } };
    }
    const legacy = h.match(/#i=(.+)/);
    if (legacy && spec.inputs[0]) {
      return { inputs: { ...emptyInputs(spec), [spec.inputs[0].id]: decompressFromEncodedURIComponent(legacy[1]) ?? "" }, opts: defaultOpts(spec) };
    }
  } catch {
    /* a broken link falls back to the example */
  }
  return null;
}

export default function ToolShell({ tool }: { tool: ToolMeta }) {
  const router = useRouter();
  const app = useApp();
  const { favs, toggle, touch, record, flash, settings, pipeline, setPipeline, pipeSource, setPipeSource, restoreReq, setRestoreReq } = app;

  const cat = categoryOfTool(tool);
  const ink = plateInk(cat.plate);
  const tint = plateTint(cat.plate);
  const badge = toolBadge(tool);

  const [spec, setSpec] = useState<ToolSpec | null>(null);
  const [loadError, setLoadError] = useState("");
  const [inputs, setInputs] = useState<Inputs>({});
  const [opts, setOpts] = useState<Opts>({});
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [view, setView] = useState(0);
  const [exIndex, setExIndex] = useState<number | null>(0);
  const [copied, setCopied] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [menu, setMenu] = useState<null | "save">(null);
  const [Custom, setCustom] = useState<ComponentType<CustomProps> | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);

  const state = useRef({ inputs, opts });
  state.current = { inputs, opts };
  const runId = useRef(0);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const autorun = !!spec && spec.autorun !== false && settings.autorun;

  const doRecord = useCallback(
    (outText: string) => {
      if (!spec || !settings.keephist) return;
      const { inputs: i, opts: o } = state.current;
      const primary = spec.inputs[0] ? i[spec.inputs[0].id] ?? "" : "";
      record({
        slug: tool.slug,
        name: tool.title,
        fin: primary.slice(0, 400),
        fout: outText.slice(0, 400),
        opt: "",
        inputs: clampInputs(persistable(spec, i)),
        opts: o,
      });
    },
    [spec, settings.keephist, record, tool.slug, tool.title]
  );

  /** explicit: record now. quiet: never record (arrival, example loads). Otherwise record once the result settles. */
  const run = useCallback(
    async (explicit: boolean | "quiet" = false) => {
      if (!spec?.run) return;
      if (debounce.current) clearTimeout(debounce.current);
      if (recordTimer.current) clearTimeout(recordTimer.current);
      const id = ++runId.current;
      const { inputs: i, opts: o } = state.current;
      setRunning(true);
      const t0 = performance.now();
      try {
        const res = await runSpec(spec, i, o);
        if (id !== runId.current) return;
        setResult(res);
        setError("");
        setElapsed(performance.now() - t0);
        setView((v) => (res.views && v < res.views.length + 1 ? v : 0));
        if (explicit === "quiet") return;
        if (explicit) doRecord(res.text);
        else recordTimer.current = setTimeout(() => doRecord(res.text), RECORD_AFTER_MS);
      } catch (e) {
        if (id !== runId.current) return;
        // The last good output stays on screen; the error sits above it.
        setError(errorMessage(e));
      } finally {
        if (id === runId.current) setRunning(false);
      }
    },
    [spec, doRecord]
  );

  const queue = useCallback(() => {
    if (!autorun) return;
    if (debounce.current) clearTimeout(debounce.current);
    const size = Object.values(state.current.inputs).reduce((n, v) => n + (v?.length ?? 0), 0);
    debounce.current = setTimeout(() => void run(false), size > 200_000 ? 700 : 260);
  }, [autorun, run]);

  useEffect(
    () => () => {
      if (debounce.current) clearTimeout(debounce.current);
      if (recordTimer.current) clearTimeout(recordTimer.current);
    },
    []
  );

  // Arrival: load the spec, then the restore request, the share link, or the first example.
  useEffect(() => {
    let live = true;
    touch(tool.slug);
    setSpec(null);
    setResult(null);
    setError("");
    loadSpec(tool.slug)
      .then((s) => {
        if (!live) return;
        if (!s) {
          setLoadError("This tool could not be loaded.");
          return;
        }
        let initial = exampleState(s, s.examples[0]);
        let ex: number | null = 0;
        if (restoreReq && restoreReq.slug === tool.slug) {
          initial = {
            inputs: { ...emptyInputs(s), ...(restoreReq.inputs ?? (s.inputs[0] ? { [s.inputs[0].id]: restoreReq.input } : {})) },
            opts: { ...defaultOpts(s), ...(restoreReq.opts ?? {}) },
          };
          ex = null;
          setRestoreReq(null);
        } else {
          const shared = readHash(s);
          if (shared) {
            initial = shared;
            ex = null;
          }
        }
        state.current = initial;
        setInputs(initial.inputs);
        setOpts(initial.opts);
        setExIndex(ex);
        setSpec(s);
        if (s.custom) s.custom().then((m) => live && setCustom(() => m.default));
      })
      .catch((e) => live && setLoadError(errorMessage(e)));
    return () => {
      live = false;
    };
    // The arrival runs once per tool.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool.slug]);

  // First run once the spec is in place (autorun, generators, or restored state).
  const firstRun = useRef<string | null>(null);
  useEffect(() => {
    if (!spec || firstRun.current === tool.slug) return;
    firstRun.current = tool.slug;
    if (spec.run && (spec.autorun !== false || spec.generator)) void run("quiet");
  }, [spec, run, tool.slug]);

  const setInput = useCallback(
    (id: string, v: string) => {
      const next = { ...state.current.inputs, [id]: v };
      state.current = { ...state.current, inputs: next };
      setInputs(next);
      setExIndex(null);
      queue();
    },
    [queue]
  );

  const setOpt = useCallback(
    (id: string, v: string | number | boolean) => {
      const next = { ...state.current.opts, [id]: v };
      state.current = { ...state.current, opts: next };
      setOpts(next);
      // Options are deliberate choices: run right away when autorun is on.
      if (autorun || spec?.generator) void run(false);
    },
    [autorun, run, spec?.generator]
  );

  function loadExample(i: number) {
    if (!spec) return;
    const st = exampleState(spec, spec.examples[i]);
    state.current = st;
    setInputs(st.inputs);
    setOpts(st.opts);
    setExIndex(i);
    setResult(null);
    setError("");
    if (spec.run && (spec.autorun !== false || spec.generator)) void run("quiet");
    else {
      setResult(null);
      setError("");
    }
  }

  function clearAll() {
    if (!spec) return;
    const st = { inputs: emptyInputs(spec), opts: state.current.opts };
    state.current = st;
    setInputs(st.inputs);
    setResult(null);
    setError("");
    setExIndex(null);
  }

  const outText = result?.text ?? "";
  const views = useMemo(() => {
    if (!result) return [];
    if (result.views?.length) return result.views;
    return [{ label: "Output", out: { kind: "text" as const, text: result.text, lang: result.lang ?? spec?.outLang } }];
  }, [result, spec?.outLang]);
  const active = views[Math.min(view, Math.max(0, views.length - 1))];

  const fav = favs.includes(tool.slug);
  const note = tool.wasm
    ? "This tool loads a WebAssembly runtime from this site the first time you run it. After that it works offline like everything else."
    : tool.liteNote;
  const monoSize = settings.mono;
  const primary = spec?.inputs[0];
  const pipeable = spec ? isPipeable(spec) : false;
  const actionLabel = spec?.action ?? (spec?.generator ? "Generate" : "Run");

  function copyOut() {
    navigator.clipboard?.writeText(outText).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
    doRecord(outText);
  }

  function download() {
    if (!result) return;
    const blob = result.blob ?? new Blob([outText], { type: "text/plain;charset=utf-8" });
    downloadBlob(blob, result.filename ?? `${tool.slug}.txt`);
    flash("Downloaded");
  }

  function share() {
    if (!spec) return;
    const h = shareHash(persistable(spec, inputs), opts);
    if (h.length > 60_000) {
      flash("Too large for a link — save it to a workspace instead");
      return;
    }
    window.history.replaceState(null, "", `#${h}`);
    navigator.clipboard?.writeText(window.location.href).catch(() => {});
    flash("Share link copied — the data rides in the URL fragment, never sent anywhere");
  }

  function toPipeline() {
    if (!spec) return;
    const secondary: Inputs = {};
    spec.inputs.slice(1).forEach((f) => {
      if (f.kind !== "file") secondary[f.id] = inputs[f.id] ?? "";
    });
    setPipeline([...pipeline, { slug: tool.slug, opts, inputs: secondary }]);
    if (!pipeSource && primary) setPipeSource(inputs[primary.id] ?? "");
    flash(`Added ${tool.title} to the pipeline`);
    router.push("/pipelines");
  }

  /* ── render ──────────────────────────────────────────────────────── */

  const header = (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: "18px clamp(16px,2.4vw,28px) 0", flex: "none" }}>
      <ToolIcon slug={tool.slug} size={30} color={ink} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h1 style={{ margin: 0, fontSize: "clamp(23px,2.4vw,31px)", letterSpacing: "-.025em", lineHeight: 1.1 }}>{tool.title}</h1>
          <button
            className="ctl star"
            type="button"
            data-on={fav ? "1" : "0"}
            aria-pressed={fav}
            aria-label={fav ? `Unstar ${tool.title}` : `Star ${tool.title}`}
            title="Favourite"
            onClick={() => flash(toggle(tool.slug) ? "Added to favourites" : "Removed from favourites")}
            style={{ border: 0, background: "none", padding: 3, cursor: "pointer", color: fav ? "var(--color-accent-2)" : "var(--color-neutral-700)" }}
          >
            <ToolIcon name="star" size={19} weight={fav ? "fill" : "duotone"} />
          </button>
          <span className="mono" style={{ padding: "2px 7px", borderRadius: 3, background: tint, color: ink, fontSize: 11, letterSpacing: ".05em", textTransform: "uppercase" }}>
            {badge}
          </span>
        </div>
        <p style={{ margin: "4px 0 0", fontSize: 15.5, color: "var(--color-neutral-700)" }}>{tool.description}</p>
      </div>
    </div>
  );

  if (loadError) {
    return (
      <div>
        {header}
        <p role="alert" style={{ padding: 28, color: "var(--color-accent-2-700)" }}>{loadError}</p>
      </div>
    );
  }

  if (!spec) {
    return (
      <div>
        {header}
        <div style={{ padding: "18px clamp(16px,2.4vw,28px)", display: "grid", gap: 14 }}>
          <div className="skeleton" style={{ height: 44 }} />
          <div className="split" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div className="skeleton" style={{ height: 360 }} />
            <div className="skeleton" style={{ height: 360 }} />
          </div>
        </div>
      </div>
    );
  }

  const exampleStrip = spec.examples.length > 0 && (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", margin: "12px clamp(16px,2.4vw,28px) 0" }} data-testid="examples">
      <span className="lbl" style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <ToolIcon name="lightbulb" size={14} /> Examples
      </span>
      <div className="chips">
        {spec.examples.map((ex, i) => (
          <button key={ex.label} type="button" className="chip ctl" aria-pressed={exIndex === i} onClick={() => loadExample(i)} title={ex.note}>
            {ex.label}
          </button>
        ))}
      </div>
      {exIndex != null && spec.examples[exIndex]?.note && (
        <span style={{ fontSize: 13.5, color: "var(--color-neutral-700)", flexBasis: "100%" }}>{spec.examples[exIndex].note}</span>
      )}
    </div>
  );

  const toolbar = (
    <div className="g2" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, margin: "12px clamp(16px,2.4vw,28px) 0", padding: "8px 10px", borderRadius: "var(--radius-lg)", flex: "none", position: "relative" }}>
      {spec.run && (
        <button className="btn btn-primary ctl" type="button" onClick={() => void run(true)} disabled={running && spec.autorun === false} title="Run (Ctrl/⌘ + Enter)">
          <ToolIcon name={running ? "arrows-clockwise" : "play"} size={15} color="#fff" />
          {running && spec.autorun === false ? "Running…" : actionLabel}
        </button>
      )}
      {spec.inputs.length > 0 && (
        <button className="btn ctl" type="button" onClick={clearAll}>
          Clear
        </button>
      )}
      {(spec.options?.length ?? 0) > 0 && <span aria-hidden="true" style={{ width: 1, height: 22, background: "rgba(32,30,29,.14)", margin: "0 2px" }} />}
      <OptionsBar options={spec.options ?? []} opts={opts} setOpt={setOpt} />
      <div style={{ flex: 1 }} />
      <div className="toolbar-right" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
        {spec.run && spec.autorun !== false && (
          <label className="tog" title="Run as you type">
            <input type="checkbox" checked={settings.autorun} onChange={(e) => settings.set({ autorun: e.target.checked })} />
            Auto-run
          </label>
        )}
        {pipeable && (
          <button className="btn ctl" type="button" title="Add this tool, with its options, as a pipeline step" onClick={toPipeline}>
            <ToolIcon name="flow-arrow" size={15} /> Pipeline
          </button>
        )}
        <span style={{ position: "relative" }}>
          <button className="btn ctl" type="button" onClick={() => setMenu(menu === "save" ? null : "save")} aria-expanded={menu === "save"} title="Save this state to a workspace">
            <ToolIcon name="floppy-disk" size={15} /> Save
          </button>
          {menu === "save" && (
            <SaveToWorkspace
              slug={tool.slug}
              title={tool.title}
              inputs={persistable(spec, inputs)}
              opts={opts}
              onClose={() => setMenu(null)}
            />
          )}
        </span>
        <button className="btn ctl" type="button" onClick={share} title="Copy a link carrying this input">
          <ToolIcon name="share-network" size={15} /> Share
        </button>
      </div>
    </div>
  );

  const customProps: CustomProps = {
    spec,
    slug: tool.slug,
    inputs,
    opts,
    setInput,
    setOpt,
    run: () => void run(true),
    result,
    error,
    record: doRecord,
    mono: monoSize,
  };

  const inputPane = (
    <section className="g pane" aria-label="Input">
      {spec.inputs.map((f, idx) => {
        const kind = f.kind ?? "code";
        const v = inputs[f.id] ?? "";
        const isPrimary = idx === 0 && kind === "code";
        return (
          <div key={f.id} style={{ display: "flex", flexDirection: "column", flex: isPrimary ? 1 : "none", minHeight: 0, borderTop: idx ? "1px solid rgba(32,30,29,.1)" : undefined }}>
            <div className="pane-head" style={{ borderBottom: kind === "text" ? 0 : undefined }}>
              <label className="lbl" htmlFor={idx === 0 ? "tool-input" : `tool-input-${f.id}`}>{f.label}</label>
              <div style={{ flex: 1 }} />
              {kind === "code" && (
                <span className="mono" style={{ fontSize: 11.5, color: "var(--color-neutral-600)" }}>
                  {v.length.toLocaleString()} chars · {v ? v.split("\n").length : 0} lines
                </span>
              )}
              {kind !== "file" && (
                <button
                  className="btn-icon"
                  type="button"
                  title="Paste from clipboard"
                  aria-label={`Paste into ${f.label}`}
                  onClick={async () => {
                    try {
                      setInput(f.id, await navigator.clipboard.readText());
                    } catch {
                      flash("Clipboard blocked by the browser");
                    }
                  }}
                >
                  <ToolIcon name="clipboard-text" size={16} />
                </button>
              )}
            </div>
            {kind === "code" && (
              <div style={{ display: "flex", flex: 1, minHeight: isPrimary ? 220 : (f.rows ?? 5) * monoSize * 1.6 + 26, maxHeight: isPrimary ? undefined : (f.rows ?? 5) * monoSize * 1.6 + 26 }}>
                <CodeEditor
                  id={idx === 0 ? "tool-input" : `tool-input-${f.id}`}
                  value={v}
                  onChange={(nv) => setInput(f.id, nv)}
                  lang={f.lang}
                  placeholder={f.placeholder ?? "Paste or type here — or drop a file"}
                  fontSize={monoSize}
                  wrap={f.wrap}
                  label={f.label}
                  minHeight={isPrimary ? 220 : undefined}
                  onSubmit={() => void run(true)}
                />
              </div>
            )}
            {kind === "text" && (
              <div style={{ padding: "0 12px 12px" }}>
                <input
                  id={idx === 0 ? "tool-input" : `tool-input-${f.id}`}
                  className="inp mono"
                  style={{ width: "100%", fontSize: monoSize }}
                  value={v}
                  placeholder={f.placeholder}
                  spellCheck={false}
                  onChange={(e) => setInput(f.id, e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void run(true)}
                />
              </div>
            )}
            {kind === "file" && (
              <FileField field={f} value={v} name={inputs[`${f.id}:name`]} onChange={(val, name) => { setInput(`${f.id}:name`, name); setInput(f.id, val); }} />
            )}
          </div>
        );
      })}
    </section>
  );

  const outputPane = (
    <section className="g pane" aria-label="Output" style={{ minHeight: 280 }}>
      <div className="pane-head">
        {views.length > 1 ? (
          <div className="tabs" role="tablist">
            {views.map((v, i) => (
              <button key={v.label} type="button" role="tab" aria-selected={active === v} onClick={() => setView(i)}>
                {v.label}
              </button>
            ))}
          </div>
        ) : (
          <span className="lbl" style={{ color: error ? "var(--color-accent-2-700)" : undefined }}>{error ? "Error" : active?.label ?? "Output"}</span>
        )}
        <div style={{ flex: 1 }} />
        {running && <span className="mono" style={{ fontSize: 11.5, color: "var(--color-accent-700)" }}>running…</span>}
        {!running && elapsed != null && result && (
          <span className="mono" style={{ fontSize: 11.5, color: "var(--color-neutral-500)" }} title="Run time">
            {elapsed < 1 ? "<1" : Math.round(elapsed)} ms
          </span>
        )}
        <button className="btn-icon" type="button" onClick={copyOut} disabled={!outText} data-testid="copy-output">
          <ToolIcon name={copied ? "check" : "copy"} size={16} /> {copied ? "Copied" : "Copy"}
        </button>
        <button className="btn-icon" type="button" title="Download" aria-label="Download the output" onClick={download} disabled={!result}>
          <ToolIcon name="download-simple" size={16} />
        </button>
      </div>
      {error && (
        <div role="alert" data-testid="tool-error" className="errband">
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
      <div className="scroll" style={{ flex: 1, overflow: "auto", minHeight: 0, position: "relative" }} data-testid="output-pane">
        {active ? (
          <OutputView out={active.out} fontSize={monoSize} />
        ) : (
          <pre id="tool-output" className="codeview" style={{ color: "var(--color-neutral-500)", fontSize: monoSize }}>
            {spec.run ? (spec.autorun === false ? `Press ${actionLabel} to see the result.` : "The result appears here.") : ""}
          </pre>
        )}
      </div>
    </section>
  );

  const stacked = spec.layout === "stack";

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      {header}
      {exampleStrip}
      {toolbar}

      {Custom ? (
        <div style={{ padding: "14px clamp(16px,2.4vw,28px) 18px" }}>
          <Custom {...customProps} />
        </div>
      ) : spec.custom ? (
        <div style={{ padding: "14px clamp(16px,2.4vw,28px)" }}>
          <div className="skeleton" style={{ height: 360 }} />
        </div>
      ) : (
        <div
          className={stacked ? undefined : "split"}
          style={{
            display: "grid",
            gridTemplateColumns: stacked ? "minmax(0,1fr)" : "minmax(0,1fr) minmax(0,1fr)",
            gridTemplateRows: stacked ? "auto minmax(360px, 1fr)" : undefined,
            gap: 14,
            padding: "14px clamp(16px,2.4vw,28px) 18px",
            flex: 1,
            minHeight: stacked ? undefined : "min(640px, calc(100vh - 250px))",
          }}
        >
          {spec.inputs.length > 0 && inputPane}
          {outputPane}
        </div>
      )}

      {note && (
        <div style={{ display: "flex", gap: 10, margin: "0 clamp(16px,2.4vw,28px) 16px", padding: "11px 14px", borderRadius: "var(--radius-lg)", background: "rgba(237,187,0,.12)", border: "1px solid rgba(185,141,0,.28)" }}>
          <ToolIcon name="info" size={18} color="var(--plate-y)" />
          <span style={{ fontSize: 14.5, color: "var(--color-neutral-900)", lineHeight: 1.5 }}>{note}</span>
        </div>
      )}

      <div style={{ margin: "0 clamp(16px,2.4vw,28px) 40px", display: "grid", gap: 18, flex: "none" }}>
        <ToolHistory
          slug={tool.slug}
          onRestore={(h) => {
            const st = {
              inputs: { ...emptyInputs(spec), ...(h.inputs ?? (primary ? { [primary.id]: h.fin } : {})) },
              opts: { ...defaultOpts(spec), ...(h.opts ?? {}) },
            };
            state.current = st;
            setInputs(st.inputs);
            setOpts(st.opts);
            setExIndex(null);
            void run(false);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
        <div>
          <button
            className="ctl"
            type="button"
            aria-expanded={guideOpen}
            onClick={() => setGuideOpen(!guideOpen)}
            style={{ display: "flex", alignItems: "center", gap: 8, border: 0, background: "none", padding: 0, cursor: "pointer", fontSize: 15, color: "var(--color-accent-700)" }}
          >
            <ToolIcon name="caret-down" size={14} color="var(--color-accent-700)" />
            {guideOpen ? "Hide" : "How to use"} {tool.title}
          </button>
          {guideOpen && (
            <div style={{ display: "grid", gap: "var(--space-4)", marginTop: "var(--space-4)", maxWidth: "74ch" }}>
              <ol style={{ margin: 0, paddingLeft: "1.2em", fontSize: 15, lineHeight: 1.6, color: "var(--color-neutral-800)" }}>
                {(spec.steps ?? tool.guideSteps).map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
              <ul style={{ margin: 0, paddingLeft: "1.2em", fontSize: 15, lineHeight: 1.6, color: "var(--color-neutral-800)" }}>
                {[...(spec.tips ?? []), ...tool.tips].map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
              <div style={{ display: "grid", gap: 8 }}>
                {tool.faq.map((f) => (
                  <details key={f.q} style={{ fontSize: 15 }}>
                    <summary style={{ cursor: "pointer" }}>{f.q}</summary>
                    <p style={{ margin: "6px 0 0", color: "var(--color-neutral-700)", lineHeight: 1.6 }}>{f.a}</p>
                  </details>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
