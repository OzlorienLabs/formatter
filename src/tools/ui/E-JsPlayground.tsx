"use client";

import { useEffect, useMemo, useState } from "react";
import type { CustomProps } from "../types";
import CodeEditor from "@/src/components/tool/CodeEditor";
import { jsRunner } from "../lib/E-jsrun";
import { Console, PG_CSS, jumpToLine, fmtMs, type Line } from "./E-Console";

const EDITOR_ID = "e-js-code";

export default function JsPlayground({ inputs, opts, setInput, run, error, mono }: CustomProps) {
  const runner = useMemo(() => jsRunner(), []);
  const [running, setRunning] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [lastMs, setLastMs] = useState<number | null>(null);
  const [errLine, setErrLine] = useState<number | null>(null);
  const [alive, setAlive] = useState(false);
  const showValue = opts.value === true || opts.value === "true";

  useEffect(
    () =>
      runner.on((e) => {
        if (e.type === "status") {
          if (e.status === "running") {
            setLines([]);
            setErrLine(null);
            setLastMs(null);
            setAlive(true);
          }
          setRunning(e.status === "running");
        } else if (e.type === "clear") setLines([{ kind: "system", text: "console.clear()" }]);
        else if (e.type === "log") setLines((ls) => [...ls, { kind: e.level as "log", text: e.text, depth: e.depth }]);
        else if (e.type === "table") setLines((ls) => [...ls, { kind: "table", columns: e.columns, rows: e.rows, depth: e.depth }]);
        else if (e.type === "final") {
          setLastMs(e.ms);
          setLines((ls) => {
            const next = [...ls];
            if (e.ok && e.value !== undefined && showValue) next.push({ kind: "value", text: e.value });
            if (!e.ok && e.error) next.push({ kind: "uncaught", text: `Uncaught ${e.error.stack || `${e.error.name}: ${e.error.message}`}`, line: e.error.line });
            return next;
          });
          setErrLine(!e.ok && e.error?.line ? e.error.line : null);
        }
      }),
    [runner, showValue]
  );

  useEffect(() => {
    if (!error) return;
    setLines((ls) => [...ls, { kind: "system", text: error }]);
  }, [error]);

  const stop = () => {
    const was = running;
    runner.stop();
    setAlive(false);
    if (!was) setLines((ls) => [...ls, { kind: "system", text: "Worker terminated — pending timers were cancelled." }]);
  };

  return (
    <div className="e-pg">
      <style>{PG_CSS}</style>
      <div className="g2 e-pg-bar">
        <button type="button" className="btn btn-primary" onClick={run} title="Run (Ctrl/⌘ + Enter)">
          ▶ Run
        </button>
        <button type="button" className="btn" onClick={stop} disabled={!running && !alive}>
          ■ Stop
        </button>
        <span className="e-status" aria-live="polite">
          <span className={`e-dot ${running ? "running" : "ready"}`} />
          {running ? "Running in a Worker…" : lastMs != null ? `Finished in ${fmtMs(lastMs)}` : "Ready — isolated Web Worker, no DOM"}
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12.5, color: "var(--color-neutral-600)" }}>Top-level await works · time limit {String(opts.timeout ?? 5)} s</span>
      </div>
      <div className="e-pg-grid">
        <section className="g pane" aria-label="Code">
          <div className="pane-head">
            <span className="lbl">main.js</span>
            {errLine != null && (
              <button type="button" className="btn-icon" style={{ color: "var(--color-accent-2-700)" }} onClick={() => jumpToLine(EDITOR_ID, errLine)}>
                error on line {errLine}
              </button>
            )}
            <div style={{ flex: 1 }} />
            <span className="mono" style={{ fontSize: 11.5, color: "var(--color-neutral-600)" }}>{(inputs.code ?? "").split("\n").length} lines</span>
          </div>
          <div style={{ display: "flex", flex: 1, minHeight: 460 }}>
            <CodeEditor id={EDITOR_ID} value={inputs.code ?? ""} onChange={(v) => setInput("code", v)} lang="js" fontSize={mono} minHeight={460} label="JavaScript code" onSubmit={run} />
          </div>
        </section>
        <section className="g pane" aria-label="Console" style={{ minHeight: 320 }}>
          <div className="pane-head">
            <span className="lbl">Console</span>
            <div style={{ flex: 1 }} />
            <button type="button" className="btn-icon" onClick={() => setLines([])} disabled={!lines.length}>
              Clear
            </button>
          </div>
          <div className="scroll" style={{ flex: 1, overflow: "auto", maxHeight: "clamp(360px, 70vh, 820px)" }}>
            <Console lines={lines} fontSize={mono} onJump={(n) => jumpToLine(EDITOR_ID, n)} empty="Press Run or Ctrl/⌘+Enter. console.log, console.table and the last expression appear here." />
          </div>
        </section>
      </div>
    </div>
  );
}
