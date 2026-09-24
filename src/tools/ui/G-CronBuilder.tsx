"use client";

import { useMemo } from "react";
import ToolIcon from "@/src/components/ToolIcon";
import type { CustomProps } from "@/src/tools/types";
import { DAYS, FIELD_INFO, MACROS, MONTHS, PRESETS, explainField, fieldEditorState, fieldFromEditor, parseCron, type EditorMode, type EditorState, type FieldKey } from "@/src/tools/lib/G-cron";
import GOut, { G_CSS } from "./G-Out";

const CSS = `
.g-cr-expr { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; padding: 14px; }
.g-cr-expr input { flex: 1 1 260px; font-size: 22px; letter-spacing: .06em; padding: 10px 14px; font-family: var(--font-mono); }
.g-cr-tokens { display: flex; gap: 6px; flex-wrap: wrap; padding: 0 14px 12px; }
.g-cr-tok { display: grid; justify-items: center; gap: 2px; padding: 5px 9px; border-radius: var(--radius-md); background: rgba(0,136,176,.07); min-width: 58px; }
.g-cr-tok b { font-family: var(--font-mono); font-size: 15px; font-weight: 600; color: var(--color-accent-800); }
.g-cr-tok span { font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase; color: var(--color-neutral-600); }
.g-cr-tok.bad { background: rgba(214,0,108,.08); } .g-cr-tok.bad b { color: var(--color-accent-2-700); }
.g-cr-state { margin: 0 14px 12px; padding: 8px 12px; border-radius: var(--radius-md); font-size: 14.5px; line-height: 1.45; }
.g-cr-state.ok { background: rgba(0,160,90,.07); color: oklch(38% .1 150); }
.g-cr-state.bad { background: rgba(214,0,108,.07); color: var(--color-accent-2-700); }
.g-cr-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); gap: 10px; padding: 12px; }
.g-cr-card { border: 1px solid rgba(32,30,29,.1); border-radius: var(--radius-lg); padding: 10px; display: grid; gap: 8px; background: rgba(255,255,255,.4); align-content: start; }
.g-cr-card.bad { border-color: rgba(214,0,108,.45); }
.g-cr-card header { display: flex; align-items: baseline; gap: 8px; }
.g-cr-card header strong { font-size: 14px; }
.g-cr-card header code { margin-left: auto; font-family: var(--font-mono); font-size: 12.5px; color: var(--color-accent-800); background: rgba(0,136,176,.07); padding: 1px 6px; border-radius: 4px; }
.g-cr-card .seg button { padding: 4px 7px; font-size: 12px; }
.g-cr-picks { display: grid; grid-template-columns: repeat(auto-fill, minmax(34px, 1fr)); gap: 3px; }
.g-cr-picks.names { grid-template-columns: repeat(auto-fill, minmax(46px, 1fr)); }
.g-cr-picks button { padding: 3px 0; font-family: var(--font-mono); font-size: 11.5px; border: 1px solid rgba(32,30,29,.12); border-radius: 4px; background: rgba(255,255,255,.5); cursor: pointer; color: var(--color-neutral-800); }
.g-cr-picks button[aria-pressed="true"] { background: var(--color-accent-700); border-color: var(--color-accent-700); color: #fff; }
.g-cr-line { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; font-size: 13px; color: var(--color-neutral-700); }
.g-cr-line .inp, .g-cr-line .sel { padding: 4px 7px; font-size: 13px; }
.g-cr-mean { font-size: 12.5px; color: var(--color-neutral-600); line-height: 1.4; }
.g-cr-err { font-size: 12.5px; color: var(--color-accent-2-700); }
`;

type Layout = { keys: FieldKey[]; parts: string[]; aws: boolean; macro?: string };

function layoutOf(expr: string): Layout | null {
  let src = expr.trim().replace(/\s+/g, " ");
  const aws = /^cron\((.*)\)$/i.exec(src);
  if (aws) {
    const parts = aws[1].trim().split(" ");
    return parts.length === 6 ? { keys: ["minute", "hour", "dom", "month", "dow", "year"], parts, aws: true } : null;
  }
  let macro: string | undefined;
  if (src.startsWith("@") && MACROS[src.toLowerCase()]) {
    macro = src.toLowerCase();
    src = MACROS[macro];
  }
  const parts = src.split(" ");
  if (parts.length === 5) return { keys: ["minute", "hour", "dom", "month", "dow"], parts, aws: false, macro };
  if (parts.length === 6) return { keys: ["second", "minute", "hour", "dom", "month", "dow"], parts, aws: false };
  if (parts.length === 7) return { keys: ["second", "minute", "hour", "dom", "month", "dow", "year"], parts, aws: false };
  return null;
}

const SHORT: Record<FieldKey, string> = { second: "sec", minute: "min", hour: "hour", dom: "day", month: "month", dow: "weekday", year: "year" };

export default function CronBuilder({ inputs, setInput, result, error, mono, record }: CustomProps) {
  const expr = inputs.expr ?? "";
  const lay = useMemo(() => layoutOf(expr), [expr]);
  const quartz = !!lay && (lay.aws || lay.parts.length === 7 || lay.parts.includes("?"));
  const parsed = useMemo(() => {
    try {
      return { cron: parseCron(expr), err: "" };
    } catch (e) {
      return { cron: null, err: (e as Error).message };
    }
  }, [expr]);
  const badField = parsed.err ? (Object.keys(FIELD_INFO) as FieldKey[]).find((k) => parsed.err.startsWith(FIELD_INFO[k].label)) : undefined;

  const write = (parts: string[]) => {
    if (!lay) return;
    setInput("expr", lay.aws ? `cron(${parts.join(" ")})` : parts.join(" "));
  };
  const setPart = (i: number, v: string) => {
    if (!lay) return;
    const parts = [...lay.parts];
    parts[i] = v || "*";
    // Quartz: exactly one of day-of-month / day-of-week must be "?"
    if (quartz) {
      const di = lay.keys.indexOf("dom"), wi = lay.keys.indexOf("dow");
      if (i === di && v !== "?" && v !== "*" && parts[wi] !== "?") parts[wi] = "?";
      if (i === wi && v !== "?" && v !== "*" && parts[di] !== "?") parts[di] = "?";
      if (parts[di] === "?" && parts[wi] === "?") parts[i === di ? wi : di] = "*";
      if (parts[di] !== "?" && parts[wi] !== "?") parts[wi] = "?";
    }
    write(parts);
  };
  const toggleSeconds = () => {
    if (!lay || lay.aws) return;
    if (lay.keys[0] === "second") setInput("expr", lay.parts.slice(1, 6).join(" ").replace(/\?/g, "*"));
    else setInput("expr", ["0", ...lay.parts].join(" "));
  };

  return (
    <div className="g-split g-wide-left">
      <style>{G_CSS + CSS}</style>
      <section className="g pane" aria-label="Cron editor">
        <div className="pane-head">
          <span className="lbl">Expression</span>
          <div style={{ flex: 1 }} />
          {lay && !lay.aws && (
            <label className="tog" style={{ fontSize: 13 }}>
              <input type="checkbox" checked={lay.keys[0] === "second"} onChange={toggleSeconds} /> Seconds field
            </label>
          )}
        </div>
        <div className="g-cr-expr">
          <input className="inp" value={expr} onChange={(e) => setInput("expr", e.target.value)} aria-label="Cron expression" spellCheck={false} placeholder="*/5 * * * *" />
          <button type="button" className="btn" onClick={() => { navigator.clipboard?.writeText(expr).catch(() => {}); record(expr); }} title="Copy the expression">
            <ToolIcon name="copy" size={15} /> Copy
          </button>
        </div>
        {lay && (
          <div className="g-cr-tokens" aria-hidden="true">
            {lay.keys.map((k, i) => (
              <div key={k} className={`g-cr-tok${badField === k ? " bad" : ""}`}>
                <b>{lay.parts[i]}</b>
                <span>{SHORT[k]}</span>
              </div>
            ))}
          </div>
        )}
        <div className={`g-cr-state ${parsed.err ? "bad" : "ok"}`} role="status">
          {parsed.err ? (
            <>✗ {parsed.err}</>
          ) : (
            <>
              ✓ {result?.text?.split("\n")[0] || "Valid"}
              {lay?.macro && <span className="mono" style={{ fontSize: 12.5, marginLeft: 8 }}>{lay.macro} = {MACROS[lay.macro]}</span>}
              {parsed.cron && parsed.cron.dialect !== "unix" && <span className="mono" style={{ fontSize: 12.5, marginLeft: 8 }}>· {parsed.cron.dialect === "aws" ? "AWS" : "Quartz"} syntax (SUN=1)</span>}
            </>
          )}
        </div>
        <div className="chips" style={{ padding: "0 14px 6px" }} role="group" aria-label="Presets">
          {PRESETS.map(([label, e]) => (
            <button key={label} type="button" className="chip" aria-pressed={expr.trim() === e} onClick={() => setInput("expr", e)}>
              {label}
            </button>
          ))}
        </div>
        {lay ? (
          <div className="g-cr-grid">
            {lay.keys.map((k, i) => (
              <FieldCard key={k + i} k={k} text={lay.parts[i]} quartz={quartz} bad={badField === k ? parsed.err : ""} onChange={(v) => setPart(i, v)} cronField={parsed.cron?.fields[k]} />
            ))}
          </div>
        ) : (
          <p className="g-hint" style={{ padding: "4px 14px 16px" }}>Use 5 fields (minute hour day month weekday), 6 with seconds first, 7 for Quartz with a year, a macro such as @daily, or AWS cron(…).</p>
        )}
      </section>
      <GOut result={result} error={error} mono={mono} onCopy={record} filename="schedule.txt" label="Schedule" className="g-sticky" minHeight={560} />
    </div>
  );
}

function FieldCard({ k, text, quartz, bad, onChange, cronField }: { k: FieldKey; text: string; quartz: boolean; bad: string; onChange: (v: string) => void; cronField?: ReturnType<typeof parseCron>["fields"][FieldKey] }) {
  const info = FIELD_INFO[k];
  const st = fieldEditorState(k, text, quartz);
  const lo = k === "dow" ? 0 : info.min;
  const hi = k === "dow" ? 6 : k === "year" ? info.min + 60 : info.max;
  const label = (v: number) => (k === "dow" ? DAYS[v][0] + DAYS[v].slice(1).toLowerCase() : k === "month" ? MONTHS[v - 1][0] + MONTHS[v - 1].slice(1).toLowerCase() : String(v));
  const set = (patch: Partial<EditorState>) => onChange(fieldFromEditor(k, { ...st, ...patch }, quartz));
  const modes: [EditorMode, string][] = [["every", k === "dow" || k === "dom" ? (quartz ? "Any (?)" : "Every") : "Every"], ["step", "Step"], ["specific", "Pick"], ["range", "Range"], ["custom", "Custom"]];
  const values = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  const special = k === "dom" ? [["L", "Last day"], ["LW", "Last weekday"], ["15W", "Weekday nearest 15th"], ["L-3", "3 days before end"]] : k === "dow" ? [["MON#1", "1st Monday"], ["FRI#3", "3rd Friday"], [quartz ? "6L" : "5L", "Last Friday"], ["MON-FRI", "Weekdays"], ["SAT,SUN", "Weekends"]] : [];
  return (
    <div className={`g-cr-card${bad ? " bad" : ""}`}>
      <header>
        <strong>{info.label}</strong>
        <span className="g-hint">{k === "dow" ? (quartz ? "1–7, SUN=1" : "0–7, SUN=0/7") : k === "month" ? "1–12 / JAN–DEC" : `${info.min}–${k === "year" ? "2199" : info.max}`}</span>
        <code>{text}</code>
      </header>
      <span className="seg" role="group" aria-label={`${info.label} mode`}>
        {modes.map(([m, l]) => (
          <button
            key={m}
            type="button"
            aria-pressed={st.mode === m}
            onClick={() => {
              if (m === "custom") return;
              if (m === "every") onChange(quartz && (k === "dom" || k === "dow") ? "?" : "*");
              else if (m === "step") set({ mode: "step", start: lo, step: k === "minute" || k === "second" ? 15 : k === "hour" ? 2 : 2 });
              else if (m === "range") set({ mode: "range", from: k === "dow" ? 1 : lo, to: k === "dow" ? 5 : Math.min(hi, lo + (k === "hour" ? 8 : 4)) });
              else set({ mode: "specific", picks: st.mode === "specific" ? st.picks : [k === "dow" ? 1 : lo] });
            }}
          >
            {l}
          </button>
        ))}
      </span>
      {st.mode === "step" && (
        <div className="g-cr-line">
          every
          <input className="inp mono" type="number" min={1} max={hi - lo + 1} value={st.step} onChange={(e) => set({ step: Math.max(1, e.target.valueAsNumber || 1) })} style={{ width: 62 }} aria-label="Step" />
          {k === "dom" ? "days" : k === "dow" ? "days" : `${info.label.toLowerCase()}s`}, starting at
          <select className="sel" value={st.start} onChange={(e) => set({ start: Number(e.target.value) })} aria-label="Start">
            {values.map((v) => (
              <option key={v} value={v}>{label(v)}</option>
            ))}
          </select>
        </div>
      )}
      {st.mode === "range" && (
        <div className="g-cr-line">
          from
          <select className="sel" value={st.from} onChange={(e) => set({ from: Number(e.target.value) })} aria-label="From">
            {values.map((v) => (
              <option key={v} value={v}>{label(v)}</option>
            ))}
          </select>
          to
          <select className="sel" value={st.to} onChange={(e) => set({ to: Number(e.target.value) })} aria-label="To">
            {values.map((v) => (
              <option key={v} value={v}>{label(v)}</option>
            ))}
          </select>
        </div>
      )}
      {st.mode === "specific" && k !== "year" && (
        <div className={`g-cr-picks${k === "dow" || k === "month" ? " names" : ""}`} role="group" aria-label={`${info.label} values`}>
          {values.map((v) => (
            <button key={v} type="button" aria-pressed={st.picks.includes(v)} onClick={() => set({ picks: st.picks.includes(v) ? st.picks.filter((x) => x !== v) : [...st.picks, v].sort((a, b) => a - b) })}>
              {label(v)}
            </button>
          ))}
        </div>
      )}
      {(st.mode === "custom" || st.mode === "specific" && k === "year") && (
        <input className="inp mono" value={text} onChange={(e) => onChange(e.target.value.replace(/\s+/g, ""))} aria-label={`${info.label} raw value`} spellCheck={false} />
      )}
      {special.length > 0 && (
        <div className="chips">
          {special.map(([v, l]) => (
            <button key={v} type="button" className="chip" style={{ fontSize: 11.5, padding: "2px 8px" }} aria-pressed={text.toUpperCase() === v} onClick={() => onChange(v)} title={v}>
              {l}
            </button>
          ))}
        </div>
      )}
      {bad ? <span className="g-cr-err">{bad}</span> : cronField ? <span className="g-cr-mean">{explainField(cronField)}</span> : null}
    </div>
  );
}
