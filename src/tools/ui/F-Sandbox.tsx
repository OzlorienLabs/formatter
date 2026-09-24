"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ToolIcon from "@/src/components/ToolIcon";
import CodeEditor from "@/src/components/tool/CodeEditor";
import { downloadBlob } from "@/src/components/tool/OutputView";
import type { CustomProps } from "../types";
import { buildSrcdoc, STOPPED_DOC, threeLibs, type SandboxMode } from "../lib/F-sandbox";
import { Card, KIT_CSS } from "./F-kit";

type Entry = { level: string; text: string; n: number };

/** Editor + sandboxed preview + console, shared by the Canvas and Three.js playgrounds. */
export default function Sandbox({ mode, inputs, opts, setInput, mono, record }: CustomProps & { mode: SandboxMode }) {
  const code = inputs.code ?? "";
  const frame = useRef<HTMLIFrameElement>(null);
  const token = useRef("");
  const [doc, setDoc] = useState(STOPPED_DOC);
  const [status, setStatus] = useState<"idle" | "loading" | "running" | "error" | "stopped">("idle");
  const [logs, setLogs] = useState<Entry[]>([]);
  const [busyPng, setBusyPng] = useState(false);
  const seq = useRef(0);
  const typed = useRef<string | null>(null);
  const liveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const live = opts.live !== false;
  const size = String(opts.size ?? "fit");
  const bg = String(opts.bg ?? "#ffffff");
  const codeRef = useRef(code);
  codeRef.current = code;

  const start = useCallback(() => {
    token.current = Math.random().toString(36).slice(2) + Date.now().toString(36);
    setLogs([]);
    setStatus(mode === "three" ? "loading" : "running");
    setDoc(buildSrcdoc(mode, codeRef.current, token.current, size, bg));
    if (mode === "three") threeLibs().catch((e) => {
      setStatus("error");
      setLogs([{ level: "error", text: (e as Error).message, n: ++seq.current }]);
    });
  }, [mode, size, bg]);

  const stop = () => {
    token.current = "";
    setDoc(STOPPED_DOC);
    setStatus("stopped");
  };

  // Messages from the frame.
  useEffect(() => {
    const onMsg = async (e: MessageEvent) => {
      if (!frame.current || e.source !== frame.current.contentWindow) return;
      const d = e.data as { __fmt?: string; type?: string; level?: string; text?: string; data?: string; error?: string };
      if (!d || d.__fmt !== token.current || !token.current) return;
      if (d.type === "ready" && mode === "three") {
        try {
          const libs = await threeLibs();
          frame.current?.contentWindow?.postMessage({ __fmt: token.current, type: "libs", libs }, "*");
        } catch {
          /* reported by start() */
        }
      } else if (d.type === "started") setStatus((s) => (s === "error" ? s : "running"));
      else if (d.type === "console") setLogs((l) => [...l.slice(-499), { level: d.level ?? "log", text: d.text ?? "", n: ++seq.current }]);
      else if (d.type === "error") {
        setStatus("error");
        setLogs((l) => [...l.slice(-499), { level: "error", text: d.text ?? "Error", n: ++seq.current }]);
      } else if (d.type === "png") {
        setBusyPng(false);
        if (d.data) {
          const blob = await (await fetch(d.data)).blob();
          downloadBlob(blob, mode === "three" ? "scene.png" : "canvas.png");
          record(`Exported ${mode === "three" ? "scene" : "canvas"}.png`);
        } else setLogs((l) => [...l, { level: "error", text: `PNG export failed: ${d.error}`, n: ++seq.current }]);
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [mode, record]);

  // Run when code arrives from outside (examples, history) or the frame options change.
  useEffect(() => {
    if (code !== typed.current) {
      typed.current = code;
      start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, bg]);

  const onEdit = (v: string) => {
    typed.current = v;
    setInput("code", v);
    if (!live) return;
    if (liveTimer.current) clearTimeout(liveTimer.current);
    liveTimer.current = setTimeout(start, 900);
  };

  const exportPng = () => {
    if (!token.current || !frame.current?.contentWindow) return;
    setBusyPng(true);
    frame.current.contentWindow.postMessage({ __fmt: token.current, type: "export" }, "*");
    setTimeout(() => setBusyPng(false), 3000);
  };

  const running = status === "running" || status === "loading";
  const dot = { idle: "#aaa", loading: "var(--plate-y)", running: "oklch(55% .15 150)", error: "var(--color-accent-2-600)", stopped: "#aaa" }[status];

  return (
    <div className="fsb-grid">
      <style>{KIT_CSS + CSS}</style>
      <Card
        title={mode === "three" ? "Module code — import from \"three\"" : "Canvas code"}
        right={<span className="mono" style={{ fontSize: 11.5, color: "var(--color-neutral-600)" }}>Ctrl/⌘+Enter runs</span>}
        bodyStyle={{ padding: 0, display: "flex", minHeight: 520 }}
      >
        <CodeEditor value={code} onChange={onEdit} lang="js" fontSize={mono} minHeight={520} onSubmit={start} label={`${mode} code`} />
      </Card>
      <div style={{ display: "grid", gap: 12, minWidth: 0, alignContent: "start" }}>
        <Card
          title={
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <button type="button" className="btn btn-primary btn-sm" onClick={start} title="Run (Ctrl/⌘+Enter)">
                <ToolIcon name={running ? "arrows-clockwise" : "play"} size={14} color="#fff" /> {running ? "Restart" : "Run"}
              </button>
              <button type="button" className="btn btn-sm" onClick={stop} disabled={status === "stopped" || status === "idle"}>
                <ToolIcon name="stop" size={14} /> Stop
              </button>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--color-neutral-700)", marginLeft: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: dot }} />
                {status === "loading" ? "Loading three.js…" : status}
              </span>
            </div>
          }
          right={
            <button type="button" className="btn btn-sm" onClick={exportPng} disabled={!running && status !== "error"}>
              <ToolIcon name="download-simple" size={14} /> {busyPng ? "…" : "PNG"}
            </button>
          }
          bodyStyle={{ padding: 0 }}
        >
          <iframe
            ref={frame}
            title={mode === "three" ? "Three.js preview" : "Canvas preview"}
            sandbox="allow-scripts"
            srcDoc={doc}
            className="fsb-frame"
            data-testid="frame-output"
          />
        </Card>
        <Card
          title={`Console${logs.length ? ` (${logs.length})` : ""}`}
          right={logs.length ? <button type="button" className="btn-icon" onClick={() => setLogs([])}>Clear</button> : null}
          bodyStyle={{ padding: 0 }}
        >
          <div className="fsb-console scroll" aria-live="polite">
            {logs.length === 0 ? (
              <span style={{ color: "var(--color-neutral-500)" }}>console.log output and errors appear here.</span>
            ) : (
              logs.map((l) => (
                <div key={l.n} className={`fsb-l ${l.level}`}>
                  <span className="fsb-lv">{l.level === "log" ? "›" : l.level === "error" ? "✕" : l.level === "warn" ? "!" : "i"}</span>
                  <span>{l.text}</span>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

const CSS = `
.fsb-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.05fr);gap:14px;align-items:start}
@media (max-width:980px){.fsb-grid{grid-template-columns:minmax(0,1fr)}}
.fsb-frame{display:block;width:100%;height:440px;border:0;background:#fff;border-radius:0 0 8px 8px}
@media (max-width:600px){.fsb-frame{height:340px}}
.fsb-console{max-height:200px;min-height:70px;overflow:auto;padding:8px 10px;font-family:var(--font-mono);font-size:12.5px;line-height:1.5}
.fsb-l{display:flex;gap:8px;padding:2px 4px;border-bottom:1px solid rgba(32,30,29,.05);white-space:pre-wrap;word-break:break-word}
.fsb-l.error{color:var(--color-accent-2-700);background:rgba(214,0,108,.05)}
.fsb-l.warn{color:oklch(48% .1 75);background:rgba(237,187,0,.08)}
.fsb-l.info{color:var(--color-accent-800)}
.fsb-lv{flex:none;width:12px;color:var(--color-neutral-500)}
`;
