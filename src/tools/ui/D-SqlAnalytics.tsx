"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ToolIcon from "@/src/components/ToolIcon";
import CodeEditor from "@/src/components/tool/CodeEditor";
import OutputView, { downloadBlob } from "@/src/components/tool/OutputView";
import type { CustomProps, View } from "@/src/tools/types";
import { parseWorkspace, runAnalytics, workspaceJson, type Dataset, type Workspace } from "@/src/tools/lib/D-analytics";
import type { LoadedTable } from "@/src/tools/lib/D-sqlite";

const CSS = `
.sqa { display: grid; gap: 14px; grid-template-columns: minmax(230px, 280px) minmax(0, 1fr); align-items: start; }
@media (max-width: 900px) { .sqa { grid-template-columns: minmax(0, 1fr); } }
.sqa .side { display: grid; gap: 0; }
.sqa .main { display: grid; gap: 14px; min-width: 0; }
.sqa .tbl { border-bottom: 1px solid rgba(32,30,29,.07); }
.sqa .tbl-head { display: flex; align-items: center; gap: 6px; padding: 7px 10px 7px 8px; }
.sqa .tbl-name { flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px; border: 0; background: none; cursor: pointer; font-family: var(--font-mono); font-size: 13.5px; color: var(--color-neutral-900); padding: 2px 4px; border-radius: 6px; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sqa .tbl-name:hover { background: rgba(0,136,176,.07); color: var(--color-accent-800); }
.sqa .tag { font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase; padding: 1px 6px; border-radius: 999px; background: rgba(0,136,176,.09); color: var(--color-accent-800); white-space: nowrap; }
.sqa .tag.s { background: rgba(185,141,0,.13); color: oklch(45% .1 80); }
.sqa .cols { padding: 0 10px 8px 30px; display: grid; gap: 1px; }
.sqa .col { display: flex; gap: 8px; align-items: baseline; border: 0; background: none; cursor: pointer; padding: 2px 6px; border-radius: 5px; font-family: var(--font-mono); font-size: 12.5px; color: var(--color-neutral-800); text-align: left; }
.sqa .col:hover { background: rgba(0,136,176,.07); }
.sqa .col i { font-style: normal; color: var(--color-neutral-500); font-size: 11px; margin-left: auto; }
.sqa .add { padding: 10px; display: grid; gap: 8px; border-top: 1px solid rgba(32,30,29,.08); }
.sqa .add textarea { width: 100%; min-height: 110px; resize: vertical; font-family: var(--font-mono); font-size: 12.5px; line-height: 1.5; padding: 8px 10px; }
.sqa .row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.sqa .hist button { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 2px 10px; width: 100%; text-align: left; border: 0; background: none; cursor: pointer; padding: 7px 12px; border-bottom: 1px solid rgba(32,30,29,.06); }
.sqa .hist button:hover { background: rgba(0,136,176,.05); }
.sqa .hist code { font-family: var(--font-mono); font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--color-neutral-900); }
.sqa .hist small { color: var(--color-neutral-600); font-size: 11.5px; white-space: nowrap; }
.sqa .muted { color: var(--color-neutral-600); font-size: 13px; line-height: 1.5; padding: 10px 12px; }
.sqa .drop { outline: 2px dashed var(--color-accent-500); outline-offset: -4px; }
`;

const SAMPLE_INFO: Record<string, string> = {
  sales: "360 orders",
  customers: "50 customers",
  products: "20 products",
  web_events: "~320 events",
};

type Hist = { sql: string; rows: number | null; ok: boolean; at: string; ms?: number };

const EMPTY: Workspace = { tables: [] };

function safeName(s: string, taken: string[]) {
  let base = s.replace(/\.[^.]+$/, "").trim().replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase() || "data";
  if (/^\d/.test(base)) base = `t_${base}`;
  let n = base, k = 2;
  while (taken.includes(n)) n = `${base}_${k++}`;
  return n;
}

export default function SqlAnalytics({ inputs, setInput, run, result, error, mono }: CustomProps) {
  const ws = useMemo(() => parseWorkspace(inputs.datasets ?? "") ?? EMPTY, [inputs.datasets]);
  const rawInput = !parseWorkspace(inputs.datasets ?? "") && (inputs.datasets ?? "").trim() ? inputs.datasets : "";
  const [schema, setSchema] = useState<LoadedTable[]>([]);
  const [schemaErr, setSchemaErr] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newData, setNewData] = useState("");
  const [drag, setDrag] = useState(false);
  const [tab, setTab] = useState(0);
  const [pending, setPending] = useState(false);
  const [hist, setHist] = useState<Hist[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastSql = useRef("");
  const t0 = useRef(0);

  // Load the datasets (no query) to learn tables, columns and types.
  useEffect(() => {
    let live = true;
    const h = setTimeout(() => {
      runAnalytics(inputs.datasets ?? "", "")
        .then((r) => {
          if (!live) return;
          setSchema(r.tables);
          setSchemaErr("");
        })
        .catch((e) => live && setSchemaErr((e as Error).message));
    }, 200);
    return () => {
      live = false;
      clearTimeout(h);
    };
  }, [inputs.datasets]);

  const setWs = useCallback((w: Workspace) => setInput("datasets", workspaceJson(w)), [setInput]);

  const doRun = useCallback(() => {
    lastSql.current = inputs.sql ?? "";
    t0.current = performance.now();
    setPending(true);
    run();
  }, [inputs.sql, run]);

  // Record history when a run settles.
  useEffect(() => {
    if (!pending) return;
    const ms = performance.now() - t0.current;
    if (result) {
      const table = result.views?.find((v) => v.out.kind === "table" && v.label.startsWith("Result"));
      const rows = table && table.out.kind === "table" ? table.out.rows.length : null;
      setHist((h) => [{ sql: lastSql.current, rows, ok: true, at: new Date().toLocaleTimeString(), ms }, ...h].slice(0, 30));
      setTab(0);
    }
    setPending(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);
  useEffect(() => {
    if (!pending || !error) return;
    setHist((h) => [{ sql: lastSql.current, rows: null, ok: false, at: new Date().toLocaleTimeString() }, ...h].slice(0, 30));
    setPending(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);
  useEffect(() => {
    if (!pending) return;
    const h = setTimeout(() => setPending(false), 15000);
    return () => clearTimeout(h);
  }, [pending]);

  function insert(text: string) {
    const ta = document.getElementById("sqa-editor") as HTMLTextAreaElement | null;
    const sql = inputs.sql ?? "";
    const s = ta?.selectionStart ?? sql.length;
    const e = ta?.selectionEnd ?? sql.length;
    const needSpace = s > 0 && /[\w)]/.test(sql[s - 1]) ? " " : "";
    const next = sql.slice(0, s) + needSpace + text + sql.slice(e);
    setInput("sql", next);
    requestAnimationFrame(() => {
      if (!ta) return;
      ta.focus();
      const p = s + needSpace.length + text.length;
      ta.setSelectionRange(p, p);
    });
  }

  const names = ws.tables.map((t) => t.name);
  function addSample(id: string) {
    if (names.includes(id)) return;
    setWs({ tables: [...ws.tables, { name: id, sample: id }] });
  }
  function remove(name: string) {
    setWs({ tables: ws.tables.filter((t) => t.name !== name) });
  }
  function addPasted() {
    if (!newData.trim()) return;
    const name = safeName(newName || "data", names);
    const d: Dataset = { name, data: newData };
    setWs({ tables: [...ws.tables, d] });
    setNewData("");
    setNewName("");
    setAdding(false);
    if (!(inputs.sql ?? "").trim()) setInput("sql", `SELECT * FROM ${name} LIMIT 50;`);
  }
  async function takeFile(f: File | undefined) {
    if (!f) return;
    const text = await f.text();
    const name = safeName(f.name, names);
    setWs({ tables: [...ws.tables, { name, data: text }] });
    if (!(inputs.sql ?? "").trim()) setInput("sql", `SELECT * FROM ${name} LIMIT 50;`);
  }
  function convertRaw() {
    setWs({ tables: [{ name: "input", data: rawInput }] });
  }

  const views: View[] = result?.views ?? [];
  const active = views[Math.min(tab, Math.max(0, views.length - 1))];
  const json = views.find((v) => v.label === "JSON");

  return (
    <div className="sqa">
      <style>{CSS}</style>

      <aside className="side g pane" aria-label="Datasets">
        <div className="pane-head">
          <ToolIcon name="database" size={16} />
          <span className="lbl">Tables ({schema.length || ws.tables.length})</span>
          <div style={{ flex: 1 }} />
          <button type="button" className="btn btn-sm" onClick={() => setAdding(!adding)} aria-expanded={adding}>
            <ToolIcon name={adding ? "x" : "plus"} size={14} /> {adding ? "Close" : "Add data"}
          </button>
        </div>

        {rawInput && (
          <div className="muted">
            The datasets field holds raw data, which runs as table <code>input</code>.{" "}
            <button type="button" className="btn btn-sm" onClick={convertRaw}>Make it a named table</button>
          </div>
        )}

        {ws.tables.length === 0 && !rawInput && <p className="muted">No tables yet. Add a sample below, paste CSV/JSON, or drop a file here.</p>}

        {ws.tables.map((d) => {
          const loaded = schema.find((s) => s.name.toLowerCase() === d.name.toLowerCase());
          const isOpen = open[d.name] ?? ws.tables.length <= 2;
          return (
            <div className="tbl" key={d.name}>
              <div className="tbl-head">
                <button type="button" className="btn-icon" aria-label={isOpen ? `Collapse ${d.name}` : `Expand ${d.name}`} aria-expanded={isOpen} onClick={() => setOpen({ ...open, [d.name]: !isOpen })} style={{ transform: isOpen ? "rotate(90deg)" : undefined, transition: "transform .12s" }}>
                  <ToolIcon name="caret-right" size={12} />
                </button>
                <button type="button" className="tbl-name" title={`Insert ${d.name}`} onClick={() => insert(d.name)}>
                  <ToolIcon name="table" size={14} /> {d.name}
                </button>
                <span className={`tag${d.sample ? " s" : ""}`}>{d.sample ? "sample" : d.format ?? "data"}</span>
                <span className="mono" style={{ fontSize: 11.5, color: "var(--color-neutral-600)" }}>{loaded ? loaded.rows.toLocaleString() : "…"}</span>
                <button type="button" className="btn-icon" aria-label={`Remove ${d.name}`} title="Remove table" onClick={() => remove(d.name)}>
                  <ToolIcon name="trash" size={14} />
                </button>
              </div>
              {isOpen && loaded && (
                <div className="cols">
                  {loaded.columns.map((c) => (
                    <button type="button" className="col" key={c.name} onClick={() => insert(c.name)} title={`Insert ${c.name}`}>
                      {c.name}
                      <i>{c.type.toLowerCase()}</i>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {schemaErr && (
          <div className="muted" style={{ color: "var(--color-accent-2-700)" }} role="alert">
            {schemaErr}
          </div>
        )}

        <div className="add">
          <span className="lbl">Sample datasets</span>
          <div className="chips">
            {Object.keys(SAMPLE_INFO).map((s) => (
              <button key={s} type="button" className="chip" aria-pressed={names.includes(s)} onClick={() => (names.includes(s) ? remove(s) : addSample(s))} title={SAMPLE_INFO[s]}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {adding && (
          <div
            className={`add${drag ? " drop" : ""}`}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes("Files")) {
                e.preventDefault();
                setDrag(true);
              }
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              void takeFile(e.dataTransfer.files?.[0]);
              setAdding(false);
            }}
          >
            <label className="lbl" htmlFor="sqa-new-name">New table</label>
            <input id="sqa-new-name" className="inp mono" placeholder="table name" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <textarea className="inp" aria-label="CSV, TSV, JSON or NDJSON data" placeholder={"Paste CSV, TSV, JSON records or NDJSON\n\nid,name,score\n1,Ada,92\n2,Grace,88"} value={newData} onChange={(e) => setNewData(e.target.value)} spellCheck={false} />
            <div className="row">
              <button type="button" className="btn btn-primary btn-sm" onClick={addPasted} disabled={!newData.trim()}>
                <ToolIcon name="plus" size={14} color="#fff" /> Add table
              </button>
              <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()}>
                <ToolIcon name="upload-simple" size={14} /> File…
              </button>
              <input ref={fileRef} type="file" hidden accept=".csv,.tsv,.txt,.json,.ndjson,.jsonl" onChange={(e) => { void takeFile(e.target.files?.[0]); setAdding(false); e.target.value = ""; }} />
            </div>
            <span style={{ fontSize: 12, color: "var(--color-neutral-600)" }}>Or drop a file on this box. Formats are detected; column types are inferred.</span>
          </div>
        )}
      </aside>

      <div className="main">
        <section className="g pane" aria-label="SQL editor">
          <div className="pane-head">
            <label className="lbl" htmlFor="sqa-editor">SQL</label>
            <span style={{ fontSize: 12, color: "var(--color-neutral-600)" }}>
              <span className="kbd">Ctrl</span> + <span className="kbd">Enter</span> to run · statements separated by <code>;</code>
            </span>
            <div style={{ flex: 1 }} />
            <button type="button" className="btn btn-primary" onClick={doRun} disabled={pending} data-testid="sqa-run">
              <ToolIcon name={pending ? "arrows-clockwise" : "play"} size={15} color="#fff" /> {pending ? "Running…" : "Run"}
            </button>
          </div>
          <div style={{ display: "flex", minHeight: 190 }}>
            <CodeEditor id="sqa-editor" value={inputs.sql ?? ""} onChange={(v) => setInput("sql", v)} lang="sql" fontSize={mono} minHeight={190} onSubmit={doRun} label="SQL" placeholder="SELECT * FROM sales LIMIT 20;" droppable={false} />
          </div>
        </section>

        <section className="g pane" aria-label="Results" style={{ minHeight: 300 }}>
          <div className="pane-head">
            {views.length ? (
              <div className="tabs" role="tablist">
                {views.map((v, i) => (
                  <button key={v.label} type="button" role="tab" aria-selected={active === v} onClick={() => setTab(i)}>
                    {v.label}
                  </button>
                ))}
              </div>
            ) : (
              <span className="lbl">Results</span>
            )}
            <div style={{ flex: 1 }} />
            {result && (
              <>
                <button type="button" className="btn-icon" onClick={() => navigator.clipboard?.writeText(result.text).catch(() => {})} title="Copy the result as CSV">
                  <ToolIcon name="copy" size={15} /> CSV
                </button>
                <button type="button" className="btn-icon" onClick={() => downloadBlob(new Blob([result.text], { type: "text/csv" }), "result.csv")} title="Download CSV">
                  <ToolIcon name="download-simple" size={15} /> .csv
                </button>
                {json && json.out.kind === "text" && (
                  <button type="button" className="btn-icon" onClick={() => downloadBlob(new Blob([(json.out as { text: string }).text], { type: "application/json" }), "result.json")} title="Download JSON">
                    <ToolIcon name="download-simple" size={15} /> .json
                  </button>
                )}
              </>
            )}
          </div>
          {error && (
            <div role="alert" className="errband">
              <ToolIcon name="warning-circle" size={18} color="var(--color-accent-2-700)" />
              <span className="mono" style={{ fontSize: 13, color: "var(--color-accent-2-700)", whiteSpace: "pre-wrap" }}>{error}</span>
            </div>
          )}
          {result?.notes?.map((n) => (
            <div key={n} className="note">
              <ToolIcon name="info" size={16} color="var(--plate-y)" />
              <span>{n}</span>
            </div>
          ))}
          <div className="scroll" style={{ maxHeight: 520, overflow: "auto", minHeight: 200 }}>
            {active ? (
              <OutputView out={active.out} fontSize={mono} />
            ) : (
              <p className="muted" style={{ padding: 16 }}>
                Press <b>Run</b> to query your tables. Try <code>SELECT channel, SUM(revenue) FROM sales GROUP BY channel</code> — a label plus a number draws a chart automatically.
              </p>
            )}
          </div>
        </section>

        {hist.length > 0 && (
          <section className="g pane hist" aria-label="Query history">
            <div className="pane-head">
              <ToolIcon name="clock-counter-clockwise" size={15} />
              <span className="lbl">This session ({hist.length})</span>
              <div style={{ flex: 1 }} />
              <button type="button" className="btn-icon" onClick={() => setHist([])}>Clear</button>
            </div>
            <div className="scroll" style={{ maxHeight: 220, overflow: "auto" }}>
              {hist.map((h, i) => (
                <button key={i} type="button" onClick={() => setInput("sql", h.sql)} title="Load this query into the editor">
                  <code>{h.sql.replace(/\s+/g, " ").trim() || "(empty)"}</code>
                  <small style={{ color: h.ok ? undefined : "var(--color-accent-2-700)" }}>{h.ok ? `${h.rows ?? 0} rows${h.ms ? ` · ${Math.round(h.ms)} ms` : ""}` : "error"} · {h.at}</small>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
