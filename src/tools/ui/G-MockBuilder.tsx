"use client";

import { useMemo, useState } from "react";
import ToolIcon from "@/src/components/ToolIcon";
import CodeEditor from "@/src/components/tool/CodeEditor";
import type { CustomProps } from "@/src/tools/types";
import { FIELD_TYPES, TYPE_BY_KEY, type FieldArgs } from "@/src/tools/lib/G-fake";
import { FORMULA_FUNCTIONS } from "@/src/tools/lib/G-expr";
import GOut, { G_CSS } from "./G-Out";

type F = FieldArgs & { name: string; type: string; nullable?: number; unique?: boolean };

const CSS = `
.g-mk-list { display: grid; gap: 8px; padding: 12px; }
.g-mk-row { display: grid; gap: 8px; padding: 9px 10px; border: 1px solid rgba(32,30,29,.1); border-radius: var(--radius-lg); background: rgba(255,255,255,.4); }
.g-mk-row:focus-within { border-color: var(--color-accent-400); }
.g-mk-main { display: grid; grid-template-columns: 22px minmax(0, 1fr) minmax(0, 1.15fr) 74px auto auto; gap: 8px; align-items: center; }
.g-mk-args { display: flex; flex-wrap: wrap; gap: 8px; padding-left: 30px; }
.g-mk-args label { display: grid; gap: 3px; font-size: 11.5px; color: var(--color-neutral-600); min-width: 90px; flex: 1 1 110px; }
.g-mk-args label.wide { flex: 3 1 260px; }
.g-mk-num { font-family: var(--font-mono); font-size: 11px; color: var(--color-neutral-500); text-align: right; }
.g-mk-btns { display: flex; gap: 0; }
.g-mk-add { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 0 12px 12px; }
@media (max-width: 640px) {
  .g-mk-main { grid-template-columns: 22px minmax(0, 1fr) auto auto; grid-template-areas: "n name name btn" ". type type type" ". nul uniq uniq"; }
  .g-mk-main > .g-mk-num { grid-area: n; } .g-mk-main > .g-mk-name { grid-area: name; } .g-mk-main > select { grid-area: type; }
  .g-mk-main > .g-mk-null { grid-area: nul; } .g-mk-main > .g-mk-uniq { grid-area: uniq; } .g-mk-main > .g-mk-btns { grid-area: btn; }
  .g-mk-args { padding-left: 0; }
}
`;

const GROUPS = [...new Set(FIELD_TYPES.map((t) => t.group))];
const ARG_LABEL: Record<string, string> = { min: "Min", max: "Max", decimals: "Decimals", values: "Values (a,b or a:70,b:30)", pattern: "Pattern (# digit, A upper, a lower, [a-z]{3})", formula: "Formula", from: "From (date)", to: "To (date)", value: "Value", n: "Count / length / step", prob: "% true" };
const QUICK: [string, string][] = [["id", "increment"], ["uuid", "uuid"], ["name", "fullName"], ["email", "email"], ["city", "city"], ["price", "price"], ["created_at", "datetime"], ["status", "enum"], ["active", "bool"]];

export default function MockBuilder({ inputs, setInput, result, error, mono, record, opts }: CustomProps) {
  const [raw, setRaw] = useState(false);
  const parsed = useMemo((): { fields: F[] } | null => {
    try {
      const v = JSON.parse(inputs.schema || '{"fields":[]}');
      const fields = Array.isArray(v) ? v : v?.fields;
      return Array.isArray(fields) ? { fields } : null;
    } catch {
      return null;
    }
  }, [inputs.schema]);
  const fields = parsed?.fields ?? [];
  const save = (next: F[]) => setInput("schema", JSON.stringify({ fields: next }, null, 2));
  const patch = (i: number, p: Partial<F>) => save(fields.map((f, j) => (j === i ? clean({ ...f, ...p }) : f)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= fields.length) return;
    const next = [...fields];
    [next[i], next[j]] = [next[j], next[i]];
    save(next);
  };
  const add = (name: string, type: string) => {
    let n = name, k = 2;
    while (fields.some((f) => f.name === n)) n = `${name}_${k++}`;
    const extra: Partial<F> = type === "enum" ? { values: "active:70,inactive:25,banned:5" } : type === "formula" ? { formula: fields.length ? fields[fields.length - 1].name : "index" } : {};
    save([...fields, { name: n, type, ...extra }]);
  };

  return (
    <div className="g-split">
      <style>{G_CSS + CSS}</style>
      <section className="g pane" aria-label="Schema builder">
        <div className="pane-head">
          <span className="lbl">Fields ({fields.length})</span>
          <div style={{ flex: 1 }} />
          <span className="mono" style={{ fontSize: 11.5, color: "var(--color-neutral-600)" }}>{Number(opts.rows) || 0} rows · {String(opts.format).toUpperCase()}</span>
          <button type="button" className="btn-icon" aria-pressed={raw} onClick={() => setRaw(!raw)} title="Edit the schema as JSON">
            {raw ? "Builder" : "JSON"}
          </button>
        </div>
        {raw || !parsed ? (
          <>
            {!parsed && !raw && <div className="errband" style={{ fontSize: 13 }}>The schema is not valid JSON — fix it here, or pick a preset from Examples.</div>}
            <div style={{ display: "flex", minHeight: 460 }}>
              <CodeEditor value={inputs.schema} onChange={(v) => setInput("schema", v)} lang="json" fontSize={mono} label="Schema JSON" minHeight={460} />
            </div>
          </>
        ) : (
          <>
            <div className="g-mk-list">
              {fields.length === 0 && <p className="g-hint" style={{ padding: 8 }}>No fields yet. Add one below, or load a preset from the Examples strip.</p>}
              {fields.map((f, i) => {
                const t = TYPE_BY_KEY[f.type];
                return (
                  <div key={i} className="g-mk-row">
                    <div className="g-mk-main">
                      <span className="g-mk-num">{i + 1}</span>
                      <input className="inp mono g-mk-name" value={f.name} onChange={(e) => patch(i, { name: e.target.value.replace(/\s+/g, "_") })} aria-label={`Field ${i + 1} name`} spellCheck={false} />
                      <select className="sel" value={f.type} onChange={(e) => patch(i, { type: e.target.value })} aria-label={`Field ${f.name} type`}>
                        {!t && <option value={f.type}>{f.type} (unknown)</option>}
                        {GROUPS.map((g) => (
                          <optgroup key={g} label={g}>
                            {FIELD_TYPES.filter((x) => x.group === g).map((x) => (
                              <option key={x.key} value={x.key}>{x.label}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                      <label className="g-mk-null" title="Percentage of rows where this field is null" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <input className="inp mono" type="number" min={0} max={100} value={f.nullable ?? 0} onChange={(e) => patch(i, { nullable: Math.max(0, Math.min(100, e.target.valueAsNumber || 0)) })} aria-label={`${f.name} null percentage`} style={{ width: 52, padding: "5px 6px" }} />
                        <span style={{ fontSize: 11.5, color: "var(--color-neutral-600)" }}>%∅</span>
                      </label>
                      <label className="tog g-mk-uniq" title="Every value distinct" style={{ fontSize: 12.5 }}>
                        <input type="checkbox" checked={!!f.unique} onChange={(e) => patch(i, { unique: e.target.checked })} /> uniq
                      </label>
                      <span className="g-mk-btns">
                        <button type="button" className="btn-icon" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${f.name} up`} title="Move up">
                          <ToolIcon name="arrow-up" size={14} />
                        </button>
                        <button type="button" className="btn-icon" onClick={() => move(i, 1)} disabled={i === fields.length - 1} aria-label={`Move ${f.name} down`} title="Move down">
                          <ToolIcon name="arrow-down" size={14} />
                        </button>
                        <button type="button" className="btn-icon" onClick={() => save(fields.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`} title="Remove">
                          <ToolIcon name="trash" size={14} />
                        </button>
                      </span>
                    </div>
                    {t?.args?.length ? (
                      <div className="g-mk-args">
                        {t.args.map((a) => (
                          <label key={a} className={a === "values" || a === "formula" || a === "pattern" ? "wide" : undefined}>
                            {ARG_LABEL[a] ?? a}
                            <input
                              className="inp mono"
                              style={{ fontSize: 12.5, padding: "5px 8px" }}
                              value={(f[a] as string | number | undefined) ?? ""}
                              placeholder={placeholderFor(f.type, a)}
                              onChange={(e) => patch(i, { [a]: numeric(a) && e.target.value !== "" && !Number.isNaN(Number(e.target.value)) ? Number(e.target.value) : e.target.value } as Partial<F>)}
                              spellCheck={false}
                            />
                          </label>
                        ))}
                      </div>
                    ) : null}
                    {f.type === "formula" && (
                      <p className="g-hint" style={{ margin: "0 0 0 30px" }}>
                        Refer to earlier fields by name ({fields.slice(0, i).map((x) => x.name).join(", ") || "none yet"}). Functions: {FORMULA_FUNCTIONS.join(", ")}. Operators: + - * / % == != &lt; &gt; && || ? :
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="g-mk-add">
              <button type="button" className="btn btn-sm" onClick={() => add("field", "word")}>
                <ToolIcon name="plus" size={14} /> Add field
              </button>
              <span className="g-hint">Quick add:</span>
              {QUICK.map(([n, t]) => (
                <button key={t} type="button" className="chip" onClick={() => add(n, t)}>
                  {n}
                </button>
              ))}
            </div>
          </>
        )}
      </section>
      <GOut result={result} error={error} mono={mono} onCopy={record} filename="mock_data.json" label="Output" className="g-sticky" minHeight={520} />
    </div>
  );
}

const numeric = (a: string) => ["min", "max", "decimals", "n", "prob"].includes(a);

function placeholderFor(type: string, a: string): string {
  if (a === "min") return type === "increment" ? "1" : type === "age" ? "18" : "0";
  if (a === "max") return type === "age" ? "90" : type === "price" ? "500" : "1000";
  if (a === "decimals") return "2";
  if (a === "from") return "2020-01-01";
  if (a === "to") return "2025-12-31";
  if (a === "n") return type === "increment" ? "1 (step)" : "3";
  if (a === "prob") return "50";
  if (a === "pattern") return "INV-####-AA";
  if (a === "values") return "red,green,blue";
  if (a === "formula") return "round(price * qty, 2)";
  return "";
}

/** Drop empty option values so the schema JSON stays tidy. */
function clean(f: F): F {
  const out = { ...f } as Record<string, unknown>;
  for (const k of Object.keys(out)) if (out[k] === "" || out[k] === undefined || (k === "nullable" && out[k] === 0) || (k === "unique" && out[k] === false)) delete out[k];
  return out as F;
}
