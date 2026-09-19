"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ToolIcon from "./ToolIcon";
import { useApp } from "./AppState";
import { TOOL_OPTIONS, SECOND_INPUT, defaultOption } from "@/src/lib/tool-options";
import { decodeShare, dispatch, encodeShare } from "@/src/lib/tools-engine";
import {
  categoryOfTool,
  plateInk,
  plateTint,
  toolBadge,
  type ToolMeta,
} from "@/src/lib/tools-registry";

const AUTORUN_MS = 240;

const ghost: React.CSSProperties = {
  padding: "8px 13px",
  border: "1px solid rgba(32,30,29,.14)",
  borderRadius: "var(--radius-md)",
  background: "none",
  cursor: "pointer",
  fontSize: 14,
};

const paneLabel: React.CSSProperties = {
  fontSize: 12,
  letterSpacing: ".12em",
  textTransform: "uppercase",
  color: "var(--color-neutral-600)",
};

const paneHead: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "9px 14px",
  borderBottom: "1px solid rgba(32,30,29,.1)",
};

const pane: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  borderRadius: "var(--radius-lg)",
  overflow: "hidden",
  minHeight: 0,
};

export default function ToolShell({ tool }: { tool: ToolMeta }) {
  const router = useRouter();
  const {
    favs,
    toggle,
    touch,
    record,
    flash,
    settings,
    pipeline,
    setPipeline,
    pipeSource,
    setPipeSource,
    restoreReq,
    setRestoreReq,
  } = useApp();

  const cat = categoryOfTool(tool);
  const ink = plateInk(cat.plate);
  const tint = plateTint(cat.plate);
  const badge = toolBadge(tool);
  const groups = TOOL_OPTIONS[tool.slug] ?? [];
  const secondLabel = SECOND_INPUT[tool.slug];

  const [input, setInput] = useState(tool.exampleInput);
  const [input2, setInput2] = useState("");
  const [option, setOption] = useState(defaultOption(tool.slug));
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ input, input2, option });
  latest.current = { input, input2, option };

  const run = useCallback(async () => {
    const { input: i, input2: i2, option: o } = latest.current;
    try {
      const res = await dispatch(tool.slug, i, i2, o);
      setOutput(res);
      setError("");
      if (settings.keephist && res) {
        record({ slug: tool.slug, name: tool.title, fin: i, fout: res, opt: o });
      }
    } catch (e) {
      // The last good output stays on screen; the error sits above it.
      setError((e as Error)?.message ?? "Could not process that input.");
    }
  }, [tool.slug, tool.title, record, settings.keephist]);

  /** Debounced, and only when run-as-you-type is on. Run always works. */
  const queueRun = useCallback(() => {
    if (!settings.autorun) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void run(), AUTORUN_MS);
  }, [run, settings.autorun]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // Mount: the shared payload, or a history restore, wins over the example.
  useEffect(() => {
    touch(tool.slug);
    let start = tool.exampleInput;
    let startOpt = defaultOption(tool.slug);

    if (restoreReq && restoreReq.slug === tool.slug) {
      start = restoreReq.input;
      if (restoreReq.opt) startOpt = restoreReq.opt;
      setRestoreReq(null);
    } else {
      const hash = window.location.hash.match(/#i=(.+)/);
      if (hash) start = decodeShare(hash[1]);
    }

    setInput(start);
    setOption(startOpt);
    latest.current = { input: start, input2: "", option: startOpt };
    void run();
    // Re-running only when the tool changes is the point: this is the arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool.slug]);

  const chars = input.length;
  const lines = input.split("\n").length;
  const monoSize = `${settings.mono}px`;
  const fav = favs.includes(tool.slug);
  const note = tool.wasm
    ? "This tool loads a WebAssembly runtime the first time you open it. After that it works offline like everything else."
    : tool.liteNote;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: "18px clamp(16px,2.4vw,28px) 0", flex: "none" }}>
        <ToolIcon slug={tool.slug} size={30} color={ink} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h1 style={{ margin: 0, fontSize: "clamp(23px,2.4vw,31px)", letterSpacing: "-.025em", lineHeight: 1.1 }}>
              {tool.title}
            </h1>
            <button
              className="ctl star"
              type="button"
              data-on={fav ? "1" : "0"}
              aria-pressed={fav}
              aria-label={fav ? `Unstar ${tool.title}` : `Star ${tool.title}`}
              title="Favourite"
              onClick={() => flash(toggle(tool.slug) ? "Added to favourites" : "Removed from favourites")}
              style={{
                border: 0,
                background: "none",
                padding: 3,
                cursor: "pointer",
                color: fav ? "var(--color-accent-2)" : "var(--color-neutral-700)",
              }}
            >
              <ToolIcon name="star" size={19} weight={fav ? "fill" : "duotone"} />
            </button>
            <span
              className="mono"
              style={{
                padding: "2px 7px",
                borderRadius: 3,
                background: tint,
                color: ink,
                fontSize: 11,
                letterSpacing: ".05em",
                textTransform: "uppercase",
              }}
            >
              {badge}
            </span>
          </div>
          <p style={{ margin: "4px 0 0", fontSize: 15.5, color: "var(--color-neutral-700)" }}>{tool.description}</p>
        </div>
      </div>

      {/* ── Options bar ────────────────────────────────────────── */}
      <div
        className="g2"
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 8,
          margin: "14px clamp(16px,2.4vw,28px) 0",
          padding: "8px 10px",
          borderRadius: "var(--radius-lg)",
          flex: "none",
        }}
      >
        <button
          className="ctl"
          type="button"
          onClick={() => void run()}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            padding: "8px 16px",
            border: 0,
            borderRadius: "var(--radius-md)",
            background: "var(--color-accent-700)",
            color: "#fff",
            cursor: "pointer",
            fontSize: 14.5,
          }}
        >
          <ToolIcon name="play" size={15} color="#fff" />
          Run
        </button>
        <button
          className="ctl"
          type="button"
          style={ghost}
          onClick={() => {
            setInput(tool.exampleInput);
            latest.current = { ...latest.current, input: tool.exampleInput };
            void run();
          }}
        >
          Example
        </button>
        <button
          className="ctl"
          type="button"
          style={ghost}
          onClick={() => {
            setInput("");
            setInput2("");
            setOutput("");
            setError("");
            latest.current = { input: "", input2: "", option };
          }}
        >
          Clear
        </button>

        {groups.length > 0 && (
          <span aria-hidden="true" style={{ width: 1, height: 22, background: "rgba(32,30,29,.14)", margin: "0 3px" }} />
        )}

        {groups.map((g) => (
          <span key={g.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12.5, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--color-neutral-600)" }}>
              {g.label}
            </span>
            <span
              role="group"
              aria-label={g.label}
              style={{ display: "flex", border: "1px solid rgba(32,30,29,.14)", borderRadius: "var(--radius-md)", overflow: "hidden" }}
            >
              {g.values.map((v) => {
                const on = option === v.value;
                return (
                  <button
                    key={v.value}
                    className="ctl"
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      setOption(v.value);
                      latest.current = { ...latest.current, option: v.value };
                      void run();
                    }}
                    style={{
                      padding: "7px 11px",
                      border: 0,
                      background: on ? "var(--color-accent-700)" : "transparent",
                      color: on ? "#fff" : "var(--color-neutral-800)",
                      cursor: "pointer",
                      fontSize: 13.5,
                    }}
                  >
                    {v.label}
                  </button>
                );
              })}
            </span>
          </span>
        ))}

        <div style={{ flex: 1 }} />

        <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13.5, color: "var(--color-neutral-700)", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={settings.autorun}
            onChange={(e) => settings.set({ autorun: e.target.checked })}
            style={{ accentColor: "var(--color-accent-700)", width: 15, height: 15 }}
          />
          Auto-run
        </label>
        <button
          className="ctl"
          type="button"
          title="Send to a pipeline"
          onClick={() => {
            setPipeline([...pipeline, tool.slug]);
            if (!pipeSource) setPipeSource(input);
            flash("Added to the pipeline");
            router.push("/pipelines");
          }}
          style={{ ...ghost, display: "flex", alignItems: "center", gap: 6, padding: "8px 12px" }}
        >
          <ToolIcon name="flow-arrow" size={15} />
          Pipeline
        </button>
      </div>

      {/* ── Split pane ─────────────────────────────────────────── */}
      <div
        className="split"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",
          gap: 14,
          padding: "14px clamp(16px,2.4vw,28px) 18px",
          flex: 1,
          minHeight: 0,
        }}
      >
        <section className="g" style={pane}>
          <div style={paneHead}>
            <span style={paneLabel}>Input</span>
            <div style={{ flex: 1 }} />
            <span className="mono" style={{ fontSize: 11.5, color: "var(--color-neutral-600)" }}>
              {chars} chars · {lines} lines
            </span>
            <button
              className="ctl"
              type="button"
              title="Paste"
              aria-label="Paste from the clipboard"
              onClick={async () => {
                try {
                  const v = await navigator.clipboard.readText();
                  setInput(v);
                  latest.current = { ...latest.current, input: v };
                  void run();
                } catch {
                  flash("Clipboard blocked by the browser");
                }
              }}
              style={{ border: 0, background: "none", padding: 3, cursor: "pointer", color: "var(--color-neutral-600)" }}
            >
              <ToolIcon name="clipboard-text" size={16} />
            </button>
          </div>
          <textarea
            id="tool-input"
            className="mono scroll"
            spellCheck={false}
            aria-label="Input"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              queueRun();
            }}
            placeholder="Paste here"
            style={{
              flex: 1,
              width: "100%",
              border: 0,
              outline: "none",
              resize: "none",
              background: "transparent",
              padding: 14,
              fontSize: monoSize,
              lineHeight: 1.6,
              minHeight: 180,
            }}
          />
          {secondLabel && (
            <div style={{ borderTop: "1px solid rgba(32,30,29,.1)" }}>
              <label htmlFor="tool-input2" style={{ ...paneLabel, display: "block", padding: "8px 14px" }}>
                {secondLabel}
              </label>
              <textarea
                id="tool-input2"
                className="mono scroll"
                spellCheck={false}
                value={input2}
                onChange={(e) => {
                  setInput2(e.target.value);
                  queueRun();
                }}
                style={{
                  width: "100%",
                  height: 150,
                  border: 0,
                  outline: "none",
                  resize: "none",
                  background: "transparent",
                  padding: "0 14px 14px",
                  fontSize: monoSize,
                  lineHeight: 1.6,
                }}
              />
            </div>
          )}
        </section>

        <section className="g" style={pane}>
          <div style={paneHead}>
            <span style={{ ...paneLabel, color: error ? "var(--color-accent-2-700)" : "var(--color-neutral-600)" }}>
              {error ? "Error" : "Output"}
            </span>
            <div style={{ flex: 1 }} />
            <button
              className="ctl"
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(output);
                setCopied(true);
                setTimeout(() => setCopied(false), 1400);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                border: 0,
                background: "none",
                padding: "3px 6px",
                cursor: "pointer",
                color: "var(--color-neutral-700)",
                fontSize: 13,
              }}
            >
              <ToolIcon name="copy" size={16} />
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              className="ctl"
              type="button"
              title="Download"
              aria-label="Download the output"
              onClick={() => {
                const blob = new Blob([output], { type: "text/plain" });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = `${tool.slug}.txt`;
                a.click();
                URL.revokeObjectURL(a.href);
                flash("Downloaded");
              }}
              style={{ border: 0, background: "none", padding: 3, cursor: "pointer", color: "var(--color-neutral-700)" }}
            >
              <ToolIcon name="download-simple" size={16} />
            </button>
            <button
              className="ctl"
              type="button"
              title="Copy a share link"
              aria-label="Copy a share link"
              onClick={() => {
                window.location.hash = `i=${encodeShare(input)}`;
                navigator.clipboard?.writeText(window.location.href);
                flash("Share link copied — the payload rides in the URL fragment");
              }}
              style={{ border: 0, background: "none", padding: 3, cursor: "pointer", color: "var(--color-neutral-700)" }}
            >
              <ToolIcon name="link-simple" size={16} />
            </button>
          </div>

          {error && (
            <div
              role="alert"
              style={{
                display: "flex",
                gap: 10,
                padding: "13px 14px",
                background: "rgba(214,0,108,.07)",
                borderBottom: "1px solid rgba(214,0,108,.18)",
              }}
            >
              <ToolIcon name="warning-circle" size={18} color="var(--color-accent-2-700)" />
              <span className="mono" style={{ fontSize: 13, color: "var(--color-accent-2-700)", lineHeight: 1.5 }}>
                {error}
              </span>
            </div>
          )}

          <div className="scroll" style={{ flex: 1, overflow: "auto", minHeight: 180, padding: 14 }}>
            <pre
              id="tool-output"
              aria-live="polite"
              className="mono"
              style={{
                margin: 0,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                fontSize: monoSize,
                lineHeight: 1.6,
                color: "var(--color-neutral-900)",
              }}
            >
              {output}
            </pre>
          </div>
        </section>
      </div>

      {note && (
        <div
          style={{
            display: "flex",
            gap: 10,
            margin: "0 clamp(16px,2.4vw,28px) 20px",
            padding: "12px 15px",
            borderRadius: "var(--radius-lg)",
            background: "rgba(237,187,0,.14)",
            border: "1px solid rgba(185,141,0,.3)",
          }}
        >
          <ToolIcon name="info" size={18} color="var(--plate-y)" />
          <span style={{ fontSize: 14.5, color: "var(--color-neutral-900)", lineHeight: 1.5 }}>{note}</span>
        </div>
      )}

      {/* ── Guide and FAQ, folded away ─────────────────────────── */}
      <div style={{ margin: "0 clamp(16px,2.4vw,28px) 40px", flex: "none" }}>
        <button
          className="ctl"
          type="button"
          aria-expanded={guideOpen}
          onClick={() => setGuideOpen(!guideOpen)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            border: 0,
            background: "none",
            padding: 0,
            cursor: "pointer",
            fontSize: 15,
            color: "var(--color-accent-700)",
          }}
        >
          <ToolIcon name="caret-down" size={14} color="var(--color-accent-700)" />
          {guideOpen ? "Hide" : "How to use"} {tool.title}
        </button>
        {guideOpen && (
          <div style={{ display: "grid", gap: "var(--space-4)", marginTop: "var(--space-4)", maxWidth: "70ch" }}>
            <ol style={{ margin: 0, paddingLeft: "1.2em", fontSize: 15, lineHeight: 1.6, color: "var(--color-neutral-800)" }}>
              {tool.guideSteps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            <ul style={{ margin: 0, paddingLeft: "1.2em", fontSize: 15, lineHeight: 1.6, color: "var(--color-neutral-800)" }}>
              {tool.tips.map((s) => (
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
  );
}
