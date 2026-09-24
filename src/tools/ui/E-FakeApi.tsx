"use client";

import { useEffect, useMemo, useState } from "react";
import type { CustomProps } from "../types";
import CodeEditor from "@/src/components/tool/CodeEditor";
import OutputView, { CodeView, downloadBlob } from "@/src/components/tool/OutputView";
import { loadRoutes, saveRoutes, resetRoutes, normaliseRoute, createCollection, loadCollections, resetCollections, saveCollections, statusText, type MockRoute } from "../lib/mockapi";
import { mockMeta } from "../lib/E-mockui";
import { METHOD_COLOR } from "./E-ApiWorkbench";

const CSS = `
.e-fa { display: grid; gap: 12px; }
.e-fa-grid { display: grid; grid-template-columns: minmax(0, .95fr) minmax(0, 1.3fr); gap: 12px; align-items: start; }
@media (max-width: 1100px) { .e-fa-grid { grid-template-columns: minmax(0,1fr); } }
.e-rt { display: grid; grid-template-columns: 22px 64px minmax(0,1fr) auto; gap: 8px; align-items: center; padding: 7px 10px; border-radius: var(--radius-md); cursor: pointer; font-size: 13px; }
.e-rt:hover { background: rgba(0,136,176,.06); }
.e-rt[aria-current="true"] { background: rgba(0,136,176,.1); box-shadow: inset 3px 0 0 var(--color-accent-600); }
.e-rt.off { opacity: .5; }
.e-rt .p { font-family: var(--font-mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.e-rt input { accent-color: var(--color-accent-700); width: 15px; height: 15px; }
.e-mb { font-family: var(--font-mono); font-size: 11.5px; font-weight: 700; }
.e-st { font-family: var(--font-mono); font-size: 12px; color: var(--color-neutral-600); }
.e-form { display: grid; grid-template-columns: 120px minmax(0,1fr) 90px 100px; gap: 8px 10px; padding: 12px; align-items: end; }
.e-form label { display: grid; gap: 4px; font-size: 12.5px; color: var(--color-neutral-700); }
.e-form .wide { grid-column: 1 / -1; }
@media (max-width: 640px) { .e-form { grid-template-columns: 1fr 1fr; } .e-form .path { grid-column: 1 / -1; } }
.e-tokens { display: flex; flex-wrap: wrap; gap: 5px; }
.e-tokens button { font-family: var(--font-mono); font-size: 11.5px; padding: 3px 8px; }
.e-kv2 { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1.5fr) 28px; gap: 6px; }
.e-kv2 .inp { font-family: var(--font-mono); font-size: 13px; }
.e-note2 { font-size: 13px; color: var(--color-neutral-600); line-height: 1.5; margin: 0; }
.e-console { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1.3fr); gap: 0; }
@media (max-width: 900px) { .e-console { grid-template-columns: minmax(0,1fr); } }
.e-dlg { display: grid; gap: 10px; padding: 12px; border-top: 1px solid rgba(32,30,29,.1); }
.e-dlg textarea { width: 100%; min-height: 180px; font-family: var(--font-mono); font-size: 12.5px; }
`;

const TOKENS: [string, string][] = [
  ["{{params.id}}", "path parameter"],
  ["{{query.page|1}}", "query value with fallback"],
  ["{{body.name}}", "field of the JSON body"],
  ["{{headers.x-api-key}}", "request header"],
  ["{{uuid}}", "deterministic UUID"],
  ["{{now}}", "ISO timestamp"],
  ["{{int 1 100}}", "integer in range"],
  ["{{name}}", "person name"],
  ["{{email}}", "email address"],
  ["{{#repeat 3}}…{{/repeat}}", "repeat, comma-joined"],
  ["{{@index}}", "index inside repeat"],
  ["{{json body}}", "value as JSON"],
  ["@status 201", "directive: status"],
  ["@delay 800", "directive: delay ms"],
  ["@header X-Foo: bar", "directive: header"],
  ["@collection todos", "directive: stateful CRUD"],
];

const sampleUrl = (r: MockRoute) => r.path.replace(/:(\w+)\??/g, (_, k: string) => (/id$/i.test(k) ? "1" : k === "code" ? "404" : k));

export default function FakeApi({ inputs, opts, setInput, run, result, error, mono }: CustomProps) {
  const [routes, setRoutes] = useState<MockRoute[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [panel, setPanel] = useState<null | "io" | "collection" | "data">(null);
  const [io, setIo] = useState("");
  const [ioErr, setIoErr] = useState("");
  const [colName, setColName] = useState("todos");
  const [colSeed, setColSeed] = useState('[\n  { "title": "Write tests", "done": false },\n  { "title": "Ship offline mode", "done": true }\n]');
  const [dataTick, setDataTick] = useState(0);

  useEffect(() => {
    const r = loadRoutes();
    setRoutes(r);
    setSel(r[0]?.id ?? null);
  }, []);

  const commit = (next: MockRoute[]) => {
    setRoutes(next);
    saveRoutes(next);
  };
  const cur = routes.find((r) => r.id === sel) ?? null;
  const patch = (p: Partial<MockRoute>) => cur && commit(routes.map((r) => (r.id === cur.id ? { ...r, ...p } : r)));
  const shown = useMemo(() => routes.filter((r) => !filter || `${r.method} ${r.path} ${r.description ?? ""}`.toLowerCase().includes(filter.toLowerCase())), [routes, filter]);
  const meta = result ? mockMeta.get(result) : undefined;
  const hdrRows = cur ? Object.entries(cur.headers) : [];
  const collections = useMemo(() => (panel === "data" ? loadCollections() : {}), [panel, dataTick, result]); // eslint-disable-line react-hooks/exhaustive-deps

  const tryRoute = (r: MockRoute) => {
    const body = r.method === "POST" || r.method === "PUT" || r.method === "PATCH" ? `\n\n{\n  "name": "Example"\n}` : "";
    setInput("request", `${r.method === "ANY" ? "GET" : r.method} ${sampleUrl(r)}${body}`);
    setTimeout(run, 0);
  };

  const addRoute = () => {
    const r: MockRoute = { id: `route-${Date.now().toString(36)}`, method: "GET", path: "/mock-api/hello/:name", status: 200, delay: 0, headers: { "Content-Type": "application/json" }, body: '{\n  "message": "Hello, {{params.name}}!",\n  "at": "{{now}}"\n}', enabled: true, description: "New route" };
    commit([...routes, r]);
    setSel(r.id);
  };

  return (
    <div className="e-fa">
      <style>{CSS}</style>
      <div className="e-fa-grid">
        <section className="g pane" aria-label="Routes">
          <div className="pane-head">
            <span className="lbl">Routes</span>
            <span className="e-st">{routes.filter((r) => r.enabled).length}/{routes.length} on</span>
            <div style={{ flex: 1 }} />
            <button type="button" className="btn btn-sm" onClick={addRoute}>+ Route</button>
            <button type="button" className="btn btn-sm" aria-pressed={panel === "collection"} onClick={() => setPanel(panel === "collection" ? null : "collection")}>+ Collection</button>
          </div>
          <div style={{ padding: "8px 10px 0" }}>
            <input className="inp" style={{ width: "100%" }} placeholder="Filter routes…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter routes" />
          </div>
          <div className="scroll" style={{ padding: 6, maxHeight: 440, overflow: "auto" }} role="list">
            {shown.map((r) => (
              <div key={r.id} role="listitem" className={`e-rt${r.enabled ? "" : " off"}`} aria-current={r.id === sel} onClick={() => setSel(r.id)} title={r.description}>
                <input type="checkbox" checked={r.enabled} aria-label={`Enable ${r.method} ${r.path}`} onClick={(e) => e.stopPropagation()} onChange={(e) => commit(routes.map((x) => (x.id === r.id ? { ...x, enabled: e.target.checked } : x)))} />
                <span className="e-mb" style={{ color: METHOD_COLOR[r.method] }}>{r.method}</span>
                <span className="p">{r.path}</span>
                <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <span className="e-st">{r.body.trimStart().startsWith("@collection") ? "CRUD" : r.status}</span>
                  <button type="button" className="btn-icon" title="Try it in the console" aria-label={`Try ${r.path}`} onClick={(e) => { e.stopPropagation(); tryRoute(r); }}>▶</button>
                </span>
              </div>
            ))}
            {!shown.length && <p className="e-note2" style={{ padding: 10 }}>No routes match.</p>}
          </div>
          <div className="pane-head" style={{ borderTop: "1px solid rgba(32,30,29,.1)", borderBottom: 0, gap: 6 }}>
            <button type="button" className="btn btn-sm" aria-pressed={panel === "io"} onClick={() => { setPanel(panel === "io" ? null : "io"); setIo(JSON.stringify(routes, null, 2)); setIoErr(""); }}>Import / Export</button>
            <button type="button" className="btn btn-sm" aria-pressed={panel === "data"} onClick={() => setPanel(panel === "data" ? null : "data")}>Data</button>
            <div style={{ flex: 1 }} />
            <button
              type="button"
              className="btn btn-sm btn-danger"
              onClick={() => {
                if (!confirm("Reset all routes and collection data to the defaults?")) return;
                const r = resetRoutes();
                setRoutes(r);
                setSel(r[0]?.id ?? null);
                setDataTick((n) => n + 1);
              }}
            >
              Reset defaults
            </button>
          </div>
          {panel === "io" && (
            <div className="e-dlg">
              <p className="e-note2">This is every route as JSON. Edit or paste routes here and press Import, or download them to share.</p>
              <textarea className="inp scroll" value={io} onChange={(e) => setIo(e.target.value)} aria-label="Routes JSON" spellCheck={false} />
              {ioErr && <span style={{ color: "var(--color-accent-2-700)", fontSize: 13 }}>{ioErr}</span>}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() => {
                    try {
                      const v = JSON.parse(io);
                      const list = Array.isArray(v) ? v : Array.isArray(v?.routes) ? v.routes : null;
                      if (!list) throw new Error("Expected an array of routes (or { \"routes\": [...] }).");
                      const next = list.map((x: unknown, i: number) => normaliseRoute(x, i));
                      if (v && !Array.isArray(v) && v.collections && typeof v.collections === "object") saveCollections({ ...loadCollections(), ...v.collections });
                      commit(next);
                      setSel(next[0]?.id ?? null);
                      setIoErr("");
                      setPanel(null);
                    } catch (e) {
                      setIoErr((e as Error).message);
                    }
                  }}
                >
                  Import
                </button>
                <button type="button" className="btn btn-sm" onClick={() => downloadBlob(new Blob([JSON.stringify({ routes, collections: loadCollections() }, null, 2)], { type: "application/json" }), "mock-routes.json")}>
                  Download routes + data
                </button>
              </div>
            </div>
          )}
          {panel === "collection" && (
            <div className="e-dlg">
              <p className="e-note2">A stateful collection gets full CRUD at <code className="mono">/mock-api/{colName || "name"}</code> and <code className="mono">/mock-api/{colName || "name"}/:id</code>. Items without an id are numbered.</p>
              <label className="opt">
                <span className="lbl">Name</span>
                <input className="inp mono" value={colName} onChange={(e) => setColName(e.target.value)} style={{ flex: 1 }} />
              </label>
              <textarea className="inp scroll" value={colSeed} onChange={(e) => setColSeed(e.target.value)} aria-label="Seed data (JSON array)" spellCheck={false} style={{ minHeight: 120 }} />
              {ioErr && <span style={{ color: "var(--color-accent-2-700)", fontSize: 13 }}>{ioErr}</span>}
              <div>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() => {
                    try {
                      const seed = JSON.parse(colSeed || "[]");
                      if (!Array.isArray(seed) || !seed.every((x) => x && typeof x === "object" && !Array.isArray(x))) throw new Error("Seed data must be a JSON array of objects.");
                      const next = createCollection(colName, seed, routes);
                      setRoutes(next);
                      setSel(next[next.length - 2]?.id ?? null);
                      setIoErr("");
                      setPanel(null);
                      setInput("request", `GET /mock-api/${colName.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-")}`);
                      setTimeout(run, 0);
                    } catch (e) {
                      setIoErr((e as Error).message);
                    }
                  }}
                >
                  Create collection
                </button>
              </div>
            </div>
          )}
          {panel === "data" && (
            <div className="e-dlg">
              <OutputView out={{ kind: "table", columns: ["collection", "items", "ids"], rows: Object.entries(collections).map(([k, v]) => [k, v.length, v.slice(0, 8).map((x) => String(x.id)).join(", ") + (v.length > 8 ? " …" : "")]) }} fontSize={13} />
              <div>
                <button type="button" className="btn btn-sm" onClick={() => { resetCollections(); setDataTick((n) => n + 1); }}>Reset data only</button>
              </div>
            </div>
          )}
        </section>

        <section className="g pane" aria-label="Route editor">
          <div className="pane-head">
            <span className="lbl">Editor</span>
            {cur && <span className="e-st">{cur.id}</span>}
            <div style={{ flex: 1 }} />
            {cur && (
              <>
                <button type="button" className="btn btn-sm" onClick={() => tryRoute(cur)}>Try it</button>
                <button type="button" className="btn btn-sm" onClick={() => { const c = { ...cur, id: `${cur.id}-copy-${Date.now().toString(36).slice(-3)}` }; commit([...routes, c]); setSel(c.id); }}>Duplicate</button>
                <button type="button" className="btn btn-sm btn-danger" onClick={() => { const next = routes.filter((r) => r.id !== cur.id); commit(next); setSel(next[0]?.id ?? null); }}>Delete</button>
              </>
            )}
          </div>
          {cur ? (
            <>
              <div className="e-form">
                <label>
                  Method
                  <select className="sel mono" value={cur.method} onChange={(e) => patch({ method: e.target.value as MockRoute["method"] })} style={{ color: METHOD_COLOR[cur.method], fontWeight: 600 }}>
                    {["GET", "POST", "PUT", "PATCH", "DELETE", "ANY"].map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </label>
                <label className="path">
                  Path (:param, :param?, *)
                  <input className="inp mono" value={cur.path} onChange={(e) => patch({ path: e.target.value })} spellCheck={false} style={{ color: cur.path.startsWith("/mock-api/") ? undefined : "var(--color-accent-2-700)" }} />
                </label>
                <label>
                  Status
                  <input className="inp mono" type="number" min={100} max={599} value={cur.status} onChange={(e) => patch({ status: Number(e.target.value) || 200 })} />
                </label>
                <label>
                  Delay ms
                  <input className="inp mono" type="number" min={0} max={10000} step={100} value={cur.delay} onChange={(e) => patch({ delay: Math.max(0, Math.min(10000, Number(e.target.value) || 0)) })} />
                </label>
                <label className="wide">
                  Description
                  <input className="inp" value={cur.description ?? ""} onChange={(e) => patch({ description: e.target.value })} />
                </label>
                {!cur.path.startsWith("/mock-api/") && <p className="e-note2 wide" style={{ color: "var(--color-accent-2-700)" }}>Paths must start with /mock-api/ to be served.</p>}
              </div>
              <div style={{ padding: "0 12px 10px", display: "grid", gap: 6 }}>
                <span className="lbl">Response headers</span>
                {hdrRows.map(([k, v], i) => (
                  <div key={i} className="e-kv2">
                    <input className="inp" value={k} aria-label="Header name" onChange={(e) => patch({ headers: Object.fromEntries(hdrRows.map(([hk, hv], j) => (j === i ? [e.target.value, hv] : [hk, hv]))) })} />
                    <input className="inp" value={v} aria-label="Header value" onChange={(e) => patch({ headers: Object.fromEntries(hdrRows.map(([hk, hv], j) => (j === i ? [hk, e.target.value] : [hk, hv]))) })} />
                    <button type="button" className="btn-icon" aria-label="Remove header" onClick={() => patch({ headers: Object.fromEntries(hdrRows.filter((_, j) => j !== i)) })}>✕</button>
                  </div>
                ))}
                <div>
                  <button type="button" className="btn btn-sm" onClick={() => patch({ headers: { ...cur.headers, [`X-Header-${hdrRows.length + 1}`]: "value" } })}>+ Header</button>
                </div>
              </div>
              <div style={{ padding: "0 12px 6px", display: "flex", alignItems: "center", gap: 8 }}>
                <span className="lbl">Body template</span>
              </div>
              <div className="g2" style={{ display: "flex", margin: "0 12px", minHeight: 220, maxHeight: 340, borderRadius: "var(--radius-md)", overflow: "hidden" }}>
                <CodeEditor value={cur.body} onChange={(body) => patch({ body })} lang={/^\s*@collection/.test(cur.body) ? "text" : "json"} fontSize={mono} minHeight={220} label="Body template" />
              </div>
              <div style={{ padding: "10px 12px 12px", display: "grid", gap: 6 }}>
                <div className="e-tokens">
                  {TOKENS.map(([t, d]) => (
                    <button key={t} type="button" className="chip" title={d} onClick={() => patch({ body: t.startsWith("@") ? `${t}\n${cur.body}` : cur.body + t })}>
                      {t}
                    </button>
                  ))}
                </div>
                <p className="e-note2">Lines starting with @ at the top are directives. Values are JSON-escaped for JSON responses; the same request always yields the same fake data.</p>
              </div>
            </>
          ) : (
            <p className="e-note2" style={{ padding: 14 }}>Select a route, or add one.</p>
          )}
        </section>
      </div>

      <section className="g pane" aria-label="Test console">
        <div className="pane-head">
          <span className="lbl">Test console</span>
          <span className="e-st">METHOD /path · optional headers · blank line · body</span>
          <div style={{ flex: 1 }} />
          <button type="button" className="btn btn-primary btn-sm" onClick={run}>Send</button>
        </div>
        <div className="e-console">
          <div style={{ display: "flex", minHeight: 200, borderRight: "1px solid rgba(32,30,29,.08)" }}>
            <CodeEditor value={inputs.request ?? ""} onChange={(v) => setInput("request", v)} lang="text" fontSize={mono} minHeight={200} label="Request" onSubmit={run} placeholder="GET /mock-api/users/2" />
          </div>
          <div style={{ minWidth: 0 }}>
            {error && (
              <div role="alert" className="errband">
                <span className="mono" style={{ fontSize: 12.5, color: "var(--color-accent-2-700)" }}>{error}</span>
              </div>
            )}
            {meta ? (
              <>
                <div className="pane-head" style={{ minHeight: 34 }}>
                  <span className="mono" style={{ fontWeight: 700, color: meta.res.status < 400 ? "oklch(48% .12 150)" : "var(--color-accent-2-700)" }}>
                    {meta.res.status} {statusText(meta.res.status)}
                  </span>
                  <span className="e-st">{meta.req.method} {meta.req.url}</span>
                  {meta.res.delay > 0 && <span className="e-st">· {meta.res.delay} ms delay</span>}
                </div>
                <div className="scroll" style={{ maxHeight: 360, overflow: "auto" }}>
                  <CodeView text={result?.text || "(empty body)"} lang={opts.show === "full" ? "text" : "json"} fontSize={mono - 1} />
                </div>
              </>
            ) : (
              !error && <p className="e-note2" style={{ padding: 14 }}>Press Send (or ▶ on a route) to see the resolved response.</p>
            )}
          </div>
        </div>
      </section>

      <section className="g2" style={{ borderRadius: "var(--radius-lg)", padding: "12px 14px", display: "grid", gap: 8 }}>
        <span className="lbl">Use it from code</span>
        <p className="e-note2">Every page of this app answers <code className="mono">/mock-api/…</code> from these routes through a service worker, so fetch calls made from this app (API Workbench, GraphQL remote mode, your own snippets) are answered offline:</p>
        <div className="g" style={{ borderRadius: "var(--radius-md)" }}>
          <CodeView
            text={`const res = await fetch("/mock-api/users", {\n  method: "POST",\n  headers: { "Content-Type": "application/json" },\n  body: JSON.stringify({ name: "Ada", role: "admin" }),\n});\nconsole.log(res.status, await res.json()); // 201 { id: 6, name: "Ada", … }\n\nconst list = await (await fetch("/mock-api/users?role=admin")).json();`}
            lang="js"
            fontSize={mono - 1}
          />
        </div>
      </section>
    </div>
  );
}
