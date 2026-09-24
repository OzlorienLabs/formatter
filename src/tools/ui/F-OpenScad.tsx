"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ToolIcon from "@/src/components/ToolIcon";
import CodeEditor from "@/src/components/tool/CodeEditor";
import OutputView, { downloadBlob } from "@/src/components/tool/OutputView";
import type { CustomProps } from "../types";
import { cancelScad, parseParams, type Param } from "../lib/F-openscad";
import { Card, KIT_CSS } from "./F-kit";
import StlViewer from "./F-StlViewer";

function readOverrides(s: string): Record<string, unknown> {
  try {
    const v = JSON.parse(s || "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

function ParamControl({ p, value, onChange }: { p: Param; value: unknown; onChange: (v: unknown) => void }) {
  if (p.kind === "bool")
    return (
      <label className="tog">
        <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
        {p.label}
      </label>
    );
  if (p.kind === "choice")
    return (
      <label className="fos-param">
        <span>{p.label}</span>
        <select className="sel" value={String(value)} onChange={(e) => onChange(typeof p.value === "number" ? Number(e.target.value) : e.target.value)}>
          {p.options.map((o) => (
            <option key={String(o.v)} value={String(o.v)}>{o.label}</option>
          ))}
        </select>
      </label>
    );
  if (p.kind === "string")
    return (
      <label className="fos-param">
        <span>{p.label}</span>
        <input className="inp mono" value={String(value)} onChange={(e) => onChange(e.target.value)} />
      </label>
    );
  const n = Number(value);
  return (
    <label className="fos-param">
      <span>{p.label}</span>
      <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {p.min !== undefined && p.max !== undefined && (
          <input type="range" min={p.min} max={p.max} step={p.step ?? 1} value={n} onChange={(e) => onChange(Number(e.target.value))} style={{ flex: 1, accentColor: "var(--color-accent-700)", minWidth: 0 }} aria-label={p.label} />
        )}
        <input className="inp mono" type="number" min={p.min} max={p.max} step={p.step ?? 1} value={n} onChange={(e) => Number.isFinite(e.target.valueAsNumber) && onChange(e.target.valueAsNumber)} style={{ width: 78, fontSize: 13 }} aria-label={`${p.label} value`} />
      </span>
    </label>
  );
}

export default function OpenScad({ inputs, setInput, run, result, error, mono, record }: CustomProps) {
  const code = inputs.code ?? "";
  const typed = useRef<string | null>(null);
  const [running, setRunning] = useState(false);
  const [wire, setWire] = useState(false);
  const [grid, setGrid] = useState(true);
  const [resetKey, setResetKey] = useState(0);
  const paramTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const params = useMemo(() => parseParams(code), [code]);
  const overrides = readOverrides(inputs.params ?? "");

  const doRun = () => {
    setRunning(true);
    run();
  };

  // Render when the code arrives from outside (examples, history, share links) — not while typing.
  useEffect(() => {
    if (code && code !== typed.current) {
      typed.current = code;
      doRun();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  useEffect(() => setRunning(false), [result, error]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F5") {
        e.preventDefault();
        doRun();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isSvg = (result?.filename ?? "").endsWith(".svg");
  const stl = result && !isSvg ? result.text : "";
  const consoleView = result?.views?.find((v) => v.label.startsWith("Console"));
  const statsView = result?.views?.find((v) => v.label === "Model");
  const svgView = result?.views?.find((v) => v.out.kind === "svg");

  const setParam = (name: string, v: unknown) => {
    const next = { ...overrides, [name]: v };
    setInput("params", JSON.stringify(next));
    if (paramTimer.current) clearTimeout(paramTimer.current);
    paramTimer.current = setTimeout(doRun, 450);
  };

  const groups = [...new Set(params.map((p) => p.group))];

  return (
    <div className="fos-grid">
      <style>{KIT_CSS + CSS}</style>
      <div style={{ display: "grid", gap: 12, minWidth: 0, alignContent: "start" }}>
        <Card
          title="OpenSCAD"
          right={<span className="mono" style={{ fontSize: 11.5, color: "var(--color-neutral-600)" }}>F5 or Ctrl/⌘+Enter to render</span>}
          bodyStyle={{ padding: 0, display: "flex", minHeight: 440 }}
        >
          <CodeEditor
            value={code}
            onChange={(v) => {
              typed.current = v;
              setInput("code", v);
            }}
            lang="scad"
            fontSize={mono}
            minHeight={440}
            onSubmit={doRun}
            label="OpenSCAD code"
          />
        </Card>
        {params.length > 0 && (
          <Card
            title={`Customizer (${params.length})`}
            right={
              Object.keys(overrides).length ? (
                <button type="button" className="btn-icon" onClick={() => { setInput("params", ""); setTimeout(doRun, 0); }}>
                  Reset
                </button>
              ) : null
            }
          >
            {groups.map((g) => (
              <div key={g} style={{ marginBottom: 10 }}>
                {groups.length > 1 && <div className="lbl" style={{ marginBottom: 6 }}>{g}</div>}
                <div className="fos-params">
                  {params.filter((p) => p.group === g).map((p) => (
                    <ParamControl key={p.name} p={p} value={p.name in overrides ? overrides[p.name] : p.value} onChange={(v) => setParam(p.name, v)} />
                  ))}
                </div>
              </div>
            ))}
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--color-neutral-600)" }}>Top-level variables with a <code>{"// [min:max]"}</code> or <code>{"// [a, b]"}</code> comment become controls; values are passed with -D.</p>
          </Card>
        )}
      </div>

      <div style={{ display: "grid", gap: 12, minWidth: 0, alignContent: "start" }}>
        <Card
          title={
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              {running ? (
                <button type="button" className="btn btn-sm btn-danger" onClick={() => cancelScad("Render stopped.")}>
                  <ToolIcon name="stop" size={14} /> Stop
                </button>
              ) : (
                <button type="button" className="btn btn-primary btn-sm" onClick={doRun}>
                  <ToolIcon name="play" size={14} color="#fff" /> Render
                </button>
              )}
              <label className="tog"><input type="checkbox" checked={wire} onChange={(e) => setWire(e.target.checked)} /> Wireframe</label>
              <label className="tog"><input type="checkbox" checked={grid} onChange={(e) => setGrid(e.target.checked)} /> Grid & axes</label>
              <button type="button" className="btn btn-sm" onClick={() => setResetKey((k) => k + 1)}>Reset view</button>
            </div>
          }
          right={
            <button
              type="button"
              className="btn btn-sm"
              disabled={!result?.blob}
              onClick={() => {
                if (!result?.blob) return;
                downloadBlob(result.blob, result.filename ?? "model.stl");
                record(`${result.filename} · ${result.text.length.toLocaleString()} chars`);
              }}
            >
              <ToolIcon name="download-simple" size={15} /> {isSvg ? "SVG" : "STL"}
            </button>
          }
          bodyStyle={{ padding: 8 }}
        >
          <div style={{ position: "relative" }}>
            {isSvg && svgView ? (
              <div style={{ height: 440, overflow: "auto", background: "#fff", borderRadius: 6 }}>
                <OutputView out={svgView.out} fontSize={mono} />
              </div>
            ) : (
              <StlViewer stl={stl} wireframe={wire} grid={grid} resetKey={resetKey} />
            )}
            {running && (
              <div className="fos-busy">
                <span className="skeleton" style={{ width: 14, height: 14, borderRadius: "50%" }} /> Rendering with OpenSCAD (WebAssembly)…
              </div>
            )}
          </div>
          {statsView && statsView.out.kind === "stats" && (
            <div className="fos-stats">
              {statsView.out.items.map((s) => (
                <span key={s.label}>
                  <b className="mono">{s.value}</b> {s.label}
                </span>
              ))}
            </div>
          )}
        </Card>

        <Card title="Console" bodyStyle={{ padding: 0 }}>
          <pre className="fos-console scroll" aria-live="polite">
            {error ? (
              <span className="e">{error}</span>
            ) : consoleView && consoleView.out.kind === "text" ? (
              consoleView.out.text.split("\n").map((l, i) => (
                <span key={i} className={/^(ERROR|Parser error|Can.t parse)/i.test(l) ? "e" : /^WARNING|DEPRECATED/.test(l) ? "w" : /^ECHO/.test(l) ? "o" : undefined}>
                  {l}
                  {"\n"}
                </span>
              ))
            ) : (
              <span style={{ color: "var(--color-neutral-500)" }}>{running ? "Loading the OpenSCAD runtime…" : "Press Render (F5). echo() output, warnings and errors appear here."}</span>
            )}
          </pre>
        </Card>
      </div>
    </div>
  );
}

const CSS = `
.fos-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);gap:14px;align-items:start}
@media (max-width:980px){.fos-grid{grid-template-columns:minmax(0,1fr)}.fos-grid>div:last-of-type{order:-1}}
.fos-params{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px 16px}
.fos-param{display:grid;gap:4px;font-size:13px;color:var(--color-neutral-700)}
.fos-busy{position:absolute;left:10px;top:10px;display:flex;gap:8px;align-items:center;padding:6px 10px;border-radius:6px;background:rgba(255,255,255,.9);font-size:13px;box-shadow:var(--shadow-sm)}
.fos-stats{display:flex;flex-wrap:wrap;gap:6px 16px;padding:8px 4px 2px;font-size:12.5px;color:var(--color-neutral-600)}
.fos-stats b{color:var(--color-neutral-900);font-weight:500}
.fos-console{margin:0;padding:10px 12px;max-height:220px;min-height:90px;overflow:auto;font-family:var(--font-mono);font-size:12.5px;line-height:1.55;white-space:pre-wrap;word-break:break-word}
.fos-console .e{color:var(--color-accent-2-700)}
.fos-console .w{color:oklch(50% .11 75)}
.fos-console .o{color:var(--color-accent-800)}
`;
