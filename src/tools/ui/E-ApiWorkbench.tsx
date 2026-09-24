"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CustomProps } from "../types";
import CodeEditor from "@/src/components/tool/CodeEditor";
import OutputView, { CodeView } from "@/src/components/tool/OutputView";
import {
  METHODS,
  parseState,
  stateJson,
  syncParamsFromUrl,
  urlWithParams,
  send,
  pushHistory,
  loadHistory,
  saveHistory,
  responseMeta,
  prettyBody,
  fmtBytes,
  toCurl,
  toFetch,
  toPython,
  build,
  type ReqState,
  type Row,
  type Resp,
  type HistItem,
  type BodyType,
  type AuthType,
} from "../lib/E-http";

export const METHOD_COLOR: Record<string, string> = {
  GET: "oklch(50% .13 150)",
  POST: "oklch(55% .14 70)",
  PUT: "oklch(48% .13 245)",
  PATCH: "oklch(48% .14 295)",
  DELETE: "var(--color-accent-2-700)",
  HEAD: "var(--color-neutral-700)",
  OPTIONS: "var(--color-neutral-700)",
  ANY: "var(--color-accent-800)",
};

const CSS = `
.e-aw { display: grid; gap: 12px; grid-template-columns: minmax(0, 1fr); }
.e-aw-bar { display: flex; gap: 8px; padding: 10px; border-radius: var(--radius-lg); flex-wrap: wrap; }
.e-aw-bar .sel { font-family: var(--font-mono); font-weight: 600; min-width: 108px; }
.e-aw-bar .url { flex: 1 1 320px; font-family: var(--font-mono); }
.e-aw-grid { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 12px; align-items: start; }
@media (max-width: 1100px) { .e-aw-grid { grid-template-columns: minmax(0,1fr); } .e-aw-left { display: contents !important; } .e-aw-hist { order: 3; } }
.e-kv { display: grid; gap: 6px; padding: 10px 12px; }
.e-kv-row { display: grid; grid-template-columns: 22px minmax(0,1fr) minmax(0,1.4fr) 28px; gap: 6px; align-items: center; }
.e-kv-row .inp { font-family: var(--font-mono); font-size: 13px; width: 100%; }
.e-kv-row.off .inp { opacity: .5; text-decoration: line-through; }
.e-kv-row input[type=checkbox] { accent-color: var(--color-accent-700); width: 15px; height: 15px; }
.e-badge { font-family: var(--font-mono); font-size: 11.5px; font-weight: 700; letter-spacing: .02em; }
.e-pill { font-family: var(--font-mono); font-size: 12.5px; padding: 2px 8px; border-radius: 999px; font-weight: 600; }
.e-pill.ok { background: rgba(0,160,90,.13); color: oklch(42% .12 150); }
.e-pill.redir { background: rgba(0,136,176,.12); color: var(--color-accent-800); }
.e-pill.bad { background: rgba(214,0,108,.1); color: var(--color-accent-2-700); }
.e-meta { font-family: var(--font-mono); font-size: 12px; color: var(--color-neutral-600); }
.e-hist { display: grid; gap: 2px; padding: 6px; }
.e-hist-row { display: grid; grid-template-columns: 62px minmax(0,1fr) auto auto 28px; gap: 10px; align-items: center; padding: 5px 8px; border-radius: var(--radius-md); cursor: pointer; font-size: 13px; }
.e-hist-row:hover { background: rgba(0,136,176,.06); }
.e-hist-row .u { font-family: var(--font-mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.e-sub { padding: 10px 12px; display: grid; gap: 10px; }
.e-note { font-size: 13px; color: var(--color-neutral-600); line-height: 1.5; margin: 0; }
@media (max-width: 560px) { .e-hist-row { grid-template-columns: 54px minmax(0,1fr) auto 26px; } .e-hist-row .t { display: none; } }
`;

type ReqTab = "params" | "headers" | "body" | "auth" | "export";
type ResTab = "body" | "raw" | "preview" | "headers";

function statusCls(s: number) {
  return s < 300 ? "ok" : s < 400 ? "redir" : "bad";
}

function KV({ rows, onChange, keyPh = "key", valPh = "value" }: { rows: Row[]; onChange: (r: Row[]) => void; keyPh?: string; valPh?: string }) {
  const set = (i: number, patch: Partial<Row>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="e-kv">
      {rows.map((r, i) => (
        <div key={i} className={`e-kv-row${r.on ? "" : " off"}`}>
          <input type="checkbox" checked={r.on} onChange={(e) => set(i, { on: e.target.checked })} aria-label={`Enable ${r.k || "row"}`} />
          <input className="inp" value={r.k} placeholder={keyPh} onChange={(e) => set(i, { k: e.target.value })} aria-label="Key" spellCheck={false} />
          <input className="inp" value={r.v} placeholder={valPh} onChange={(e) => set(i, { v: e.target.value })} aria-label="Value" spellCheck={false} />
          <button type="button" className="btn-icon" aria-label="Remove row" title="Remove" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
            ✕
          </button>
        </div>
      ))}
      <div>
        <button type="button" className="btn btn-sm" onClick={() => onChange([...rows, { k: "", v: "", on: true }])}>
          + Add
        </button>
      </div>
    </div>
  );
}

export default function ApiWorkbench({ inputs, setInput, result, error, mono, record }: CustomProps) {
  const st = useMemo(() => parseState(inputs.request ?? ""), [inputs.request]);
  const [reqTab, setReqTab] = useState<ReqTab>("params");
  const [resTab, setResTab] = useState<ResTab>("body");
  const [resp, setResp] = useState<Resp | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [hist, setHist] = useState<HistItem[]>([]);
  const [exp, setExp] = useState<"curl" | "fetch" | "python">("curl");
  const abort = useRef<AbortController | null>(null);

  useEffect(() => setHist(loadHistory()), []);
  useEffect(() => {
    const r = result ? responseMeta.get(result) : undefined;
    if (r) {
      setResp(r);
      setErr("");
      setHist(loadHistory());
    }
  }, [result]);
  useEffect(() => {
    if (error) setErr(error);
  }, [error]);

  const update = (patch: Partial<ReqState>) => setInput("request", stateJson({ ...st, ...patch }));

  async function doSend() {
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    setBusy(true);
    setErr("");
    try {
      const r = await send(st, ac.signal);
      if (ac.signal.aborted) return;
      setResp(r);
      pushHistory(st, r);
      setHist(loadHistory());
      record(`${r.status} ${r.statusText}\n${r.body.slice(0, 300)}`);
      if (resTab === "preview" && !/html/.test(r.contentType)) setResTab("body");
    } catch (e) {
      if (!ac.signal.aborted) setErr((e as Error).message);
    } finally {
      if (abort.current === ac) setBusy(false);
    }
  }

  const pb = useMemo(() => (resp ? prettyBody(resp) : null), [resp]);
  const isHtml = !!resp && /html/i.test(resp.contentType);
  const built = useMemo(() => build(st), [st]);
  const exportText = exp === "curl" ? toCurl(st) : exp === "fetch" ? toFetch(st) : toPython(st);
  const enabled = (rs: Row[]) => rs.filter((r) => r.on && r.k).length;

  return (
    <div className="e-aw">
      <style>{CSS}</style>
      <form
        className="g e-aw-bar"
        onSubmit={(e) => {
          e.preventDefault();
          void doSend();
        }}
      >
        <select className="sel" aria-label="Method" value={st.method} onChange={(e) => update({ method: e.target.value })} style={{ color: METHOD_COLOR[st.method] }}>
          {METHODS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <input
          className="inp url"
          aria-label="URL"
          value={st.url}
          spellCheck={false}
          placeholder="/mock-api/users or https://api.example.com/…"
          onChange={(e) => update({ url: e.target.value, params: syncParamsFromUrl(e.target.value, st.params) })}
          style={{ fontSize: mono }}
        />
        {busy ? (
          <button type="button" className="btn" onClick={() => abort.current?.abort()}>
            Cancel
          </button>
        ) : (
          <button type="submit" className="btn btn-primary">
            Send
          </button>
        )}
      </form>

      <div className="e-aw-grid">
        <div className="e-aw-left" style={{ display: "grid", gap: 12, alignContent: "start", minWidth: 0, gridTemplateColumns: "minmax(0, 1fr)" }}>
          <section className="g pane" aria-label="Request">
            <div className="pane-head">
              <div className="tabs" role="tablist">
                {(
                  [
                    ["params", `Params${enabled(st.params) ? ` (${enabled(st.params)})` : ""}`],
                    ["headers", `Headers${enabled(st.headers) ? ` (${enabled(st.headers)})` : ""}`],
                    ["body", `Body${st.bodyType !== "none" ? " ●" : ""}`],
                    ["auth", `Auth${st.auth.type !== "none" ? " ●" : ""}`],
                    ["export", "Export"],
                  ] as [ReqTab, string][]
                ).map(([k, l]) => (
                  <button key={k} type="button" role="tab" aria-selected={reqTab === k} onClick={() => setReqTab(k)}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            {reqTab === "params" && (
              <>
                <KV rows={st.params} onChange={(params) => update({ params, url: urlWithParams(st.url, params) })} keyPh="param" />
                <p className="e-note" style={{ padding: "0 12px 12px" }}>
                  Rows and the URL stay in sync. Unticked rows are kept here but not sent.
                </p>
              </>
            )}
            {reqTab === "headers" && <KV rows={st.headers} onChange={(headers) => update({ headers })} keyPh="Header-Name" />}
            {reqTab === "body" && (
              <div className="e-sub">
                <div className="seg" role="group" aria-label="Body type" style={{ flexWrap: "wrap" }}>
                  {(["none", "json", "form", "multipart", "raw", "text"] as BodyType[]).map((b) => (
                    <button key={b} type="button" aria-pressed={st.bodyType === b} onClick={() => update({ bodyType: b })}>
                      {b === "form" ? "x-www-form" : b === "json" ? "JSON" : b}
                    </button>
                  ))}
                </div>
                {(st.method === "GET" || st.method === "HEAD") && st.bodyType !== "none" && (
                  <p className="e-note" style={{ color: "var(--color-accent-2-700)" }}>
                    {st.method} requests cannot carry a body — switch the method to POST, PUT or PATCH.
                  </p>
                )}
                {(st.bodyType === "json" || st.bodyType === "raw" || st.bodyType === "text") && (
                  <>
                    {st.bodyType === "raw" && (
                      <label className="opt">
                        <span className="lbl">Content-Type</span>
                        <input className="inp mono" value={st.rawType} onChange={(e) => update({ rawType: e.target.value })} style={{ flex: 1 }} />
                      </label>
                    )}
                    <div className="g2" style={{ display: "flex", minHeight: 200, borderRadius: "var(--radius-md)", overflow: "hidden" }}>
                      <CodeEditor
                        value={st.body}
                        onChange={(body) => update({ body })}
                        lang={st.bodyType === "json" ? "json" : /xml/.test(st.rawType) && st.bodyType === "raw" ? "xml" : "text"}
                        fontSize={mono}
                        minHeight={200}
                        label="Request body"
                        onSubmit={() => void doSend()}
                      />
                    </div>
                    {st.bodyType === "json" && (
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => {
                            try {
                              update({ body: JSON.stringify(JSON.parse(st.body), null, 2) });
                            } catch (e) {
                              setErr(`Body: ${(e as Error).message}`);
                            }
                          }}
                        >
                          Format JSON
                        </button>
                        {built.notes.map((n) => (
                          <span key={n} className="e-note" style={{ color: "var(--color-accent-2-700)" }}>
                            {n}
                          </span>
                        ))}
                      </div>
                    )}
                  </>
                )}
                {(st.bodyType === "form" || st.bodyType === "multipart") && (
                  <div style={{ margin: "0 -12px" }}>
                    <KV rows={st.form} onChange={(form) => update({ form })} keyPh="field" />
                    {st.bodyType === "multipart" && (
                      <p className="e-note" style={{ padding: "0 12px" }}>
                        Text fields only — file parts are not supported here.
                      </p>
                    )}
                  </div>
                )}
                {st.bodyType === "none" && <p className="e-note">No body. Choose JSON, a form or raw text to send one.</p>}
              </div>
            )}
            {reqTab === "auth" && (
              <div className="e-sub">
                <div className="seg" role="group" aria-label="Auth type">
                  {(
                    [
                      ["none", "None"],
                      ["bearer", "Bearer"],
                      ["basic", "Basic"],
                      ["apikey", "API key"],
                    ] as [AuthType, string][]
                  ).map(([k, l]) => (
                    <button key={k} type="button" aria-pressed={st.auth.type === k} onClick={() => update({ auth: { ...st.auth, type: k } })}>
                      {l}
                    </button>
                  ))}
                </div>
                {st.auth.type === "bearer" && (
                  <div className="grid-form" style={{ gridTemplateColumns: "1fr" }}>
                    <label>
                      Token
                      <input className="inp mono" value={st.auth.token} onChange={(e) => update({ auth: { ...st.auth, token: e.target.value } })} placeholder="eyJhbGciOi…" autoComplete="off" />
                    </label>
                  </div>
                )}
                {st.auth.type === "basic" && (
                  <div className="grid-form">
                    <label>
                      Username
                      <input className="inp mono" value={st.auth.user} onChange={(e) => update({ auth: { ...st.auth, user: e.target.value } })} autoComplete="off" />
                    </label>
                    <label>
                      Password
                      <input className="inp mono" type="password" value={st.auth.pass} onChange={(e) => update({ auth: { ...st.auth, pass: e.target.value } })} autoComplete="off" />
                    </label>
                  </div>
                )}
                {st.auth.type === "apikey" && (
                  <div className="grid-form">
                    <label>
                      Key name
                      <input className="inp mono" value={st.auth.key} onChange={(e) => update({ auth: { ...st.auth, key: e.target.value } })} />
                    </label>
                    <label>
                      Value
                      <input className="inp mono" value={st.auth.value} onChange={(e) => update({ auth: { ...st.auth, value: e.target.value } })} autoComplete="off" />
                    </label>
                    <label>
                      Send in
                      <select className="sel" value={st.auth.in} onChange={(e) => update({ auth: { ...st.auth, in: e.target.value as "header" | "query" } })}>
                        <option value="header">Header</option>
                        <option value="query">Query string</option>
                      </select>
                    </label>
                  </div>
                )}
                <p className="e-note">
                  {st.auth.type === "none"
                    ? "No credentials are added."
                    : `Adds ${st.auth.type === "apikey" ? (st.auth.in === "header" ? `a ${st.auth.key || "key"} header` : `?${st.auth.key || "key"}= to the URL`) : "an Authorization header"} when sending. Credentials stay in this browser; they are part of share links and history, so use test keys.`}
                </p>
              </div>
            )}
            {reqTab === "export" && (
              <div className="e-sub">
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <div className="seg" role="group" aria-label="Export format">
                    {(["curl", "fetch", "python"] as const).map((k) => (
                      <button key={k} type="button" aria-pressed={exp === k} onClick={() => setExp(k)}>
                        {k === "python" ? "Python requests" : k === "fetch" ? "fetch()" : "curl"}
                      </button>
                    ))}
                  </div>
                  <button type="button" className="btn btn-sm" onClick={() => navigator.clipboard?.writeText(exportText).catch(() => {})}>
                    Copy
                  </button>
                </div>
                <div className="g2" style={{ borderRadius: "var(--radius-md)", maxHeight: 360, overflow: "auto" }}>
                  <CodeView text={exportText} lang={exp === "curl" ? "shell" : exp === "fetch" ? "js" : "python"} fontSize={mono - 1} />
                </div>
              </div>
            )}
          </section>
          <section className="g pane e-aw-hist" aria-label="History">
            <div className="pane-head">
              <span className="lbl">History</span>
              <span className="e-meta">{hist.length}/50 · this browser only</span>
              <div style={{ flex: 1 }} />
              {hist.length > 0 && (
                <button
                  type="button"
                  className="btn btn-sm btn-danger"
                  onClick={() => {
                    saveHistory([]);
                    setHist([]);
                  }}
                >
                  Clear
                </button>
              )}
            </div>
            {hist.length ? (
              <div className="e-hist scroll" style={{ maxHeight: 260, overflow: "auto" }}>
                {hist.map((h) => (
                  <div
                    key={h.id}
                    className="e-hist-row"
                    role="button"
                    tabIndex={0}
                    title="Load this request"
                    onClick={() => setInput("request", stateJson(h.state))}
                    onKeyDown={(e) => e.key === "Enter" && setInput("request", stateJson(h.state))}
                  >
                    <span className="e-badge" style={{ color: METHOD_COLOR[h.state.method] }}>
                      {h.state.method}
                    </span>
                    <span className="u">{h.state.url}</span>
                    <span className={`e-pill ${statusCls(h.status)}`}>{h.status}</span>
                    <span className="e-meta t">
                      {h.ms} ms · {new Date(h.at).toLocaleTimeString()}
                    </span>
                    <button
                      type="button"
                      className="btn-icon"
                      aria-label="Delete from history"
                      onClick={(e) => {
                        e.stopPropagation();
                        const next = hist.filter((x) => x.id !== h.id);
                        saveHistory(next);
                        setHist(next);
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="e-note" style={{ padding: "10px 12px" }}>
                Sent requests appear here. Click one to load it again.
              </p>
            )}
          </section>
        </div>

        <section className="g pane" aria-label="Response" style={{ minHeight: 320 }}>
          <div className="pane-head">
            <span className="lbl">Response</span>
            {resp && (
              <>
                <span className={`e-pill ${statusCls(resp.status)}`}>
                  {resp.status} {resp.statusText}
                </span>
                <span className="e-meta">{Math.round(resp.ms)} ms</span>
                <span className="e-meta">{fmtBytes(resp.size)}</span>
                {resp.mock && (
                  <span className="e-meta" title={resp.route ? `route ${resp.route}` : undefined}>
                    · offline mock{resp.delay ? ` (${resp.delay} ms delay)` : ""}
                  </span>
                )}
              </>
            )}
            {busy && (
              <span className="e-meta" style={{ color: "var(--color-accent-700)" }}>
                sending…
              </span>
            )}
          </div>
          {err && (
            <div role="alert" className="errband">
              <span className="mono" style={{ fontSize: 12.5, color: "var(--color-accent-2-700)", whiteSpace: "pre-wrap", lineHeight: 1.55 }}>
                {err}
              </span>
            </div>
          )}
          {resp?.notes.map((n) => (
            <div key={n} className="note">
              {n}
            </div>
          ))}
          {resp && pb ? (
            <>
              <div className="pane-head" style={{ minHeight: 34, padding: "2px 12px" }}>
                <div className="tabs" role="tablist">
                  {(
                    [["body", pb.json !== undefined ? "Pretty" : "Body"], ["raw", "Raw"], ...(isHtml ? [["preview", "Preview"]] : []), ["headers", `Headers (${resp.headers.length})`]] as [
                      ResTab,
                      string,
                    ][]
                  ).map(([k, l]) => (
                    <button key={k} type="button" role="tab" aria-selected={resTab === k} onClick={() => setResTab(k)}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div className="scroll" style={{ maxHeight: "clamp(320px, 62vh, 720px)", overflow: "auto" }}>
                {resTab === "body" &&
                  (pb.json !== undefined ? (
                    <OutputView out={{ kind: "tree", value: pb.json }} fontSize={mono} />
                  ) : (
                    <CodeView text={pb.text || "(empty body)"} lang={isHtml ? "html" : /xml/.test(resp.contentType) ? "xml" : "text"} fontSize={mono} />
                  ))}
                {resTab === "raw" && <CodeView text={resp.body || "(empty body)"} lang={pb.json !== undefined ? "json" : "text"} fontSize={mono} wrap />}
                {resTab === "preview" && isHtml && <iframe title="HTML preview" sandbox="" srcDoc={resp.body} style={{ width: "100%", height: 480, border: 0, background: "#fff" }} />}
                {resTab === "headers" && <OutputView out={{ kind: "table", columns: ["header", "value"], rows: resp.headers }} fontSize={mono} />}
              </div>
            </>
          ) : (
            !err && (
              <div style={{ padding: 16, display: "grid", gap: 10, gridTemplateColumns: "minmax(0, 1fr)" }}>
                <p className="e-note" style={{ fontSize: 14 }}>
                  Press <b>Send</b>. URLs starting with <code className="mono">/mock-api/</code> are answered offline by the built-in mock API (manage routes in Fake JSON API). Any other URL is
                  fetched directly from your browser only when you press Send.
                </p>
                <div className="chips">
                  {["/mock-api/users", "/mock-api/posts?userId=2", "/mock-api/products?page=1&limit=3", "/mock-api/echo", "/mock-api/status/404", "/mock-api/people?count=2"].map((u) => (
                    <button key={u} type="button" className="chip mono" style={{ fontSize: 12 }} onClick={() => update({ url: u, params: syncParamsFromUrl(u, []) })}>
                      {u}
                    </button>
                  ))}
                </div>
              </div>
            )
          )}
        </section>
      </div>
    </div>
  );
}
