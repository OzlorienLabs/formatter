"use client";

import { useEffect, useMemo, useState } from "react";
import type { CustomProps } from "../types";
import CodeEditor from "@/src/components/tool/CodeEditor";
import { pyRunner, type PyStatus } from "../lib/E-pyrunner";
import { Console, PG_CSS, jumpToLine, fmtMs, type Line } from "./E-Console";

const EDITOR_ID = "e-py-code";

export default function PythonPlayground({ inputs, opts, setInput, run, error, mono }: CustomProps) {
  const runner = useMemo(() => pyRunner(), []);
  const [status, setStatus] = useState<PyStatus>(runner.status);
  const [lines, setLines] = useState<Line[]>([]);
  const [started, setStarted] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [lastMs, setLastMs] = useState<number | null>(null);
  const [errLine, setErrLine] = useState<number | null>(null);
  const showRepr = opts.repr === true || opts.repr === "true";

  useEffect(() => {
    const off = runner.on((e) => {
      if (e.type === "status") setStatus(e.status);
      else if (e.type === "start") {
        setLines([]);
        setErrLine(null);
        setStarted(performance.now());
        setLastMs(null);
      } else if (e.type === "out") {
        setLines((ls) => {
          const last = ls[ls.length - 1];
          if (last && last.kind === e.stream && !last.text.endsWith("\n")) return [...ls.slice(0, -1), { kind: e.stream, text: last.text + e.text }];
          if (last && last.kind === e.stream) return [...ls.slice(0, -1), { kind: e.stream, text: last.text + e.text }];
          return [...ls, { kind: e.stream, text: e.text }];
        });
      } else if (e.type === "done") {
        setStarted(null);
        setLastMs(e.ms);
        setLines((ls) => {
          const next = ls.map((l) => (l.kind === "stdout" || l.kind === "stderr" ? { ...l, text: l.text.replace(/\n$/, "") } : l));
          if (e.repr != null && showRepr) next.push({ kind: "value", text: e.repr });
          if (e.error) {
            const m = [...e.error.matchAll(/File "<main>", line (\d+)/g)].pop();
            next.push({ kind: "traceback", text: e.error.replace(/\n$/, ""), line: m ? Number(m[1]) : undefined });
            setErrLine(m ? Number(m[1]) : null);
          }
          return next;
        });
      }
    });
    runner.ensure();
    setStatus(runner.status);
    return off;
  }, [runner, showRepr]);

  useEffect(() => {
    if (!error) return;
    setStarted(null);
    setLines((ls) => [...ls, { kind: "system", text: error }]);
  }, [error]);

  useEffect(() => {
    if (started == null) return;
    const t = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(t);
  }, [started]);

  const label =
    status === "loading" ? "Loading Python runtime…" : status === "running" ? `Running… ${started != null ? ((now - started) / 1000).toFixed(1) + " s" : ""}` : status === "ready" ? `Python ${runner.version} · ready${lastMs != null ? ` · last run ${fmtMs(lastMs)}` : runner.bootMs ? ` · loaded in ${fmtMs(runner.bootMs)}` : ""}` : status === "error" ? `Runtime failed: ${runner.lastError}` : "Stopped — restarting…";

  return (
    <div className="e-pg">
      <style>{PG_CSS}</style>
      <div className="g2 e-pg-bar">
        <button type="button" className="btn btn-primary" onClick={run} disabled={status === "running"} title="Run (Ctrl/⌘ + Enter)">
          ▶ Run
        </button>
        <button type="button" className="btn" onClick={() => runner.stop("Stopped — the interpreter was restarted.")} disabled={status !== "running" && status !== "loading"}>
          ■ Stop
        </button>
        <span className="e-status" aria-live="polite">
          <span className={`e-dot ${status}`} />
          {label}
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12.5, color: "var(--color-neutral-600)" }}>Standard library only — packages can’t be installed offline.</span>
      </div>
      <div className="e-pg-grid">
        <section className="g pane" aria-label="Code">
          <div className="pane-head">
            <span className="lbl">main.py</span>
            {errLine != null && (
              <button type="button" className="btn-icon" style={{ color: "var(--color-accent-2-700)" }} onClick={() => jumpToLine(EDITOR_ID, errLine)}>
                error on line {errLine}
              </button>
            )}
            <div style={{ flex: 1 }} />
            <span className="mono" style={{ fontSize: 11.5, color: "var(--color-neutral-600)" }}>{(inputs.code ?? "").split("\n").length} lines</span>
          </div>
          <div style={{ display: "flex", flex: 1, minHeight: 420 }}>
            <CodeEditor id={EDITOR_ID} value={inputs.code ?? ""} onChange={(v) => setInput("code", v)} lang="python" fontSize={mono} minHeight={420} label="Python code" onSubmit={run} />
          </div>
          <div className="pane-head" style={{ borderTop: "1px solid rgba(32,30,29,.1)" }}>
            <label className="lbl" htmlFor="e-py-stdin">stdin</label>
            <span style={{ fontSize: 12.5, color: "var(--color-neutral-600)" }}>one line per input() call</span>
          </div>
          <textarea id="e-py-stdin" className="e-stdin scroll" value={inputs.stdin ?? ""} onChange={(e) => setInput("stdin", e.target.value)} spellCheck={false} placeholder={"3\nada 92"} style={{ fontSize: mono }} />
        </section>
        <section className="g pane" aria-label="Console" style={{ minHeight: 320 }}>
          <div className="pane-head">
            <span className="lbl">Console</span>
            <div style={{ flex: 1 }} />
            <button type="button" className="btn-icon" onClick={() => navigator.clipboard?.writeText(lines.map((l) => ("text" in l ? l.text : "")).join("\n")).catch(() => {})} disabled={!lines.length}>
              Copy
            </button>
            <button type="button" className="btn-icon" onClick={() => setLines([])} disabled={!lines.length}>
              Clear
            </button>
          </div>
          <div className="scroll" style={{ flex: 1, overflow: "auto", maxHeight: "clamp(360px, 70vh, 820px)" }}>
            <Console lines={lines} fontSize={mono} onJump={(n) => jumpToLine(EDITOR_ID, n)} empty={status === "loading" ? "Loading CPython (WebAssembly) from this site — the first time takes a few seconds…" : "Press Run or Ctrl/⌘+Enter. print() output appears here."} />
          </div>
        </section>
      </div>
    </div>
  );
}
