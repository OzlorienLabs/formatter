"use client";

import { useMemo, useState } from "react";
import ToolIcon from "@/src/components/ToolIcon";
import CodeEditor from "@/src/components/tool/CodeEditor";
import { CodeView, downloadBlob } from "@/src/components/tool/OutputView";
import type { CustomProps } from "@/src/tools/types";
import { analyze, buildHeaders, CSP_CHIPS, CSP_DIRECTIVES, FORMATS, parseConfig, PERMISSIONS, PRESETS, render, type HeaderConfig } from "@/src/tools/lib/D-headers";

const CSS = `
.shh { display: grid; gap: 14px; grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr); align-items: start; }
@media (max-width: 1000px) { .shh { grid-template-columns: minmax(0, 1fr); } }
.shh .form { display: grid; gap: 14px; min-width: 0; }
.shh .sec { display: grid; gap: 10px; padding: 12px 14px 14px; }
.shh .sec h3 { margin: 0; font-size: 16px; letter-spacing: -.01em; display: flex; align-items: center; gap: 8px; }
.shh .sec h3 .tog { margin-left: auto; font-size: 13px; font-weight: 400; }
.shh .dir { display: grid; grid-template-columns: 132px minmax(0, 1fr) 92px; gap: 6px; align-items: center; }
@media (max-width: 520px) { .shh .dir { grid-template-columns: minmax(0, 1fr) 84px; } .shh .dir label { grid-column: 1 / -1; } }
.shh .dir label { font-family: var(--font-mono); font-size: 12.5px; color: var(--color-neutral-800); }
.shh .dir .inp { font-family: var(--font-mono); font-size: 12.5px; width: 100%; }
.shh .dir .sel { font-size: 12.5px; padding: 5px 6px; }
.shh .grid2 { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px 14px; }
.shh .grid2 label { display: grid; gap: 4px; font-size: 13px; color: var(--color-neutral-700); }
.shh .perm { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 6px 12px; }
.shh .perm label { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-family: var(--font-mono); font-size: 12.5px; }
.shh .perm .sel { font-size: 12.5px; padding: 3px 6px; }
.shh .out { position: sticky; top: 12px; display: grid; gap: 14px; min-width: 0; }
.shh .grade { display: flex; flex-direction: row; align-items: center; gap: 14px; padding: 12px 14px; }
.shh .grade b { font-size: 38px; line-height: 1; font-family: var(--font-mono); letter-spacing: -.04em; min-width: 64px; text-align: center; padding: 8px 6px; border-radius: 12px; color: #fff; }
.shh .checks { display: grid; gap: 6px; padding: 10px 12px 14px; }
.shh .ck { display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: 8px; padding: 8px 10px; border-radius: var(--radius-md); font-size: 13.5px; line-height: 1.45; }
.shh .ck.pass { background: rgba(0,160,90,.07); } .shh .ck.warn { background: rgba(237,187,0,.1); } .shh .ck.fail { background: rgba(214,0,108,.06); } .shh .ck.info { background: rgba(0,136,176,.06); }
.shh .ck code { font-family: var(--font-mono); font-size: 12px; color: var(--color-neutral-700); word-break: break-all; }
.shh .ck .fix { color: var(--color-accent-800); }
.shh .presets { display: flex; flex-wrap: wrap; gap: 6px; }
.shh .hint { font-size: 12.5px; color: var(--color-neutral-600); line-height: 1.45; }
.shh .fmt { display: flex; flex-wrap: wrap; gap: 6px; }
`;

const GRADE_COLOR = (g: string) => (g.startsWith("A") ? "oklch(52% .13 150)" : g === "B" ? "oklch(55% .12 110)" : g === "C" ? "oklch(62% .13 80)" : g === "D" ? "oklch(58% .15 50)" : "var(--color-accent-2-700)");
const ICON: Record<string, [string, string]> = { pass: ["check", "oklch(48% .12 150)"], warn: ["warning-circle", "var(--plate-y)"], fail: ["x", "var(--color-accent-2-700)"], info: ["info", "var(--color-accent-700)"] };

function Grade({ grade, score, sub }: { grade: string; score: number; sub: string }) {
  return (
    <div className="g pane grade">
      <b style={{ background: GRADE_COLOR(grade) }}>{grade}</b>
      <div>
        <div style={{ fontSize: 17, fontWeight: 600 }}>{score}/100</div>
        <div className="hint">{sub}</div>
      </div>
    </div>
  );
}

function Checks({ checks }: { checks: ReturnType<typeof analyze>["checks"] }) {
  return (
    <div className="checks">
      {checks.map((c, i) => (
        <div key={i} className={`ck ${c.status}`}>
          <ToolIcon name={ICON[c.status][0]} size={17} color={ICON[c.status][1]} />
          <div>
            <b style={{ fontWeight: 600 }}>{c.header}</b> — {c.message}
            {c.value && (
              <div>
                <code>{c.value.length > 160 ? c.value.slice(0, 157) + "…" : c.value}</code>
              </div>
            )}
            {c.fix && <div className="fix">→ {c.fix}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function SecurityHeaders({ inputs, opts, setInput, setOpt, record, mono }: CustomProps) {
  const mode = String(opts.mode ?? "build");
  const format = String(opts.format ?? "raw");
  const cfg = useMemo(() => parseConfig(inputs.config ?? ""), [inputs.config]);
  const [copied, setCopied] = useState(false);
  const set = (next: HeaderConfig) => setInput("config", JSON.stringify(next, null, 1));
  const patch = <K extends keyof HeaderConfig>(k: K, v: HeaderConfig[K]) => set({ ...cfg, [k]: v });

  const out = useMemo(() => render(cfg, format), [cfg, format]);
  const built = useMemo(() => buildHeaders(cfg), [cfg]);
  const self = useMemo(() => analyze(built.headers.map(([k, v]) => `${k}: ${v}`).join("\n")), [built]);
  const report = useMemo(() => (mode === "analyze" && (inputs.headers ?? "").trim() ? analyze(inputs.headers) : null), [mode, inputs.headers]);

  const presetMatch = Object.entries(PRESETS).find(([, p]) => JSON.stringify(p.cfg) === JSON.stringify(cfg))?.[0];

  function copy() {
    navigator.clipboard?.writeText(out.text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1300);
    record(out.text);
  }

  if (mode === "analyze") {
    return (
      <div className="shh">
        <style>{CSS}</style>
        <section className="g pane" aria-label="Response headers">
          <div className="pane-head">
            <label className="lbl" htmlFor="shh-headers">Response headers</label>
            <div style={{ flex: 1 }} />
            <button type="button" className="btn btn-sm" onClick={() => setOpt("mode", "build")}>
              <ToolIcon name="wrench" size={14} /> Build instead
            </button>
          </div>
          <div style={{ display: "flex", minHeight: 360 }}>
            <CodeEditor id="shh-headers" value={inputs.headers ?? ""} onChange={(v) => setInput("headers", v)} fontSize={mono} minHeight={360} label="Response headers" placeholder={"Paste from DevTools → Network → Response Headers,\nor the output of: curl -sI https://example.com"} />
          </div>
          <p className="hint" style={{ padding: "8px 12px 12px", margin: 0 }}>Nothing is fetched — paste headers you copied. <code>curl -v</code> output with <code>&lt;</code> prefixes works too.</p>
        </section>
        <div className="out">
          {report && report.count ? (
            <>
              <Grade grade={report.grade} score={report.score} sub={`${report.checks.filter((c) => c.status === "pass").length} passed · ${report.checks.filter((c) => c.status === "warn").length} warnings · ${report.checks.filter((c) => c.status === "fail").length} failed${report.status ? ` · ${report.status}` : ""}`} />
              <section className="g pane" aria-label="Findings">
                <div className="pane-head"><span className="lbl">Findings & fixes</span></div>
                <Checks checks={report.checks} />
              </section>
            </>
          ) : (
            <section className="g pane">
              <p className="hint" style={{ padding: 16 }}>Paste response headers on the left to grade them A+ to F, with a fix for every finding. Pick an “Analyze” example above to see one.</p>
            </section>
          )}
        </div>
      </div>
    );
  }

  const csp = cfg.csp;
  const setDir = (d: string, v: string) => patch("csp", { ...csp, directives: { ...csp.directives, [d]: v } });

  return (
    <div className="shh">
      <style>{CSS}</style>
      <div className="form">
        <section className="g pane sec" aria-label="Presets">
          <h3><ToolIcon name="sparkle" size={17} /> Start from a preset</h3>
          <div className="presets">
            {Object.entries(PRESETS).map(([id, p]) => (
              <button key={id} type="button" className="chip" aria-pressed={presetMatch === id} onClick={() => set(JSON.parse(JSON.stringify(p.cfg)))} title={p.describe}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="hint">{presetMatch ? PRESETS[presetMatch].describe : "Customised — edit any field; the output updates live."}</div>
        </section>

        <section className="g pane sec" aria-label="Content Security Policy">
          <h3>
            Content-Security-Policy
            <label className="tog"><input type="checkbox" checked={csp.enabled} onChange={(e) => patch("csp", { ...csp, enabled: e.target.checked })} /> Enabled</label>
          </h3>
          {csp.enabled && (
            <>
              {CSP_DIRECTIVES.map((d) => (
                <div className="dir" key={d}>
                  <label htmlFor={`shh-${d}`}>{d}</label>
                  <input id={`shh-${d}`} className="inp" value={csp.directives[d] ?? ""} placeholder={d === "default-src" ? "'self'" : "inherits default-src"} onChange={(e) => setDir(d, e.target.value)} spellCheck={false} />
                  <select
                    className="sel"
                    aria-label={`Add a source to ${d}`}
                    value=""
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!v) return;
                      const cur = (csp.directives[d] ?? "").split(/\s+/).filter(Boolean);
                      const next = v === "'none'" ? ["'none'"] : [...cur.filter((x) => x !== "'none'"), ...(cur.includes(v) ? [] : [v])];
                      setDir(d, next.join(" "));
                    }}
                  >
                    <option value="">+ source</option>
                    {CSP_CHIPS.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              ))}
              <div className="grid2">
                <label className="tog" style={{ display: "flex" }}><input type="checkbox" checked={csp.upgrade} onChange={(e) => patch("csp", { ...csp, upgrade: e.target.checked })} /> upgrade-insecure-requests</label>
                <label className="tog" style={{ display: "flex" }}><input type="checkbox" checked={csp.reportOnly} onChange={(e) => patch("csp", { ...csp, reportOnly: e.target.checked })} /> Report-only</label>
                <label>
                  report-to group
                  <input className="inp mono" value={csp.reportTo} placeholder="(none)" onChange={(e) => patch("csp", { ...csp, reportTo: e.target.value })} />
                </label>
              </div>
            </>
          )}
        </section>

        <section className="g pane sec" aria-label="Transport and framing">
          <h3>
            HSTS
            <label className="tog"><input type="checkbox" checked={cfg.hsts.enabled} onChange={(e) => patch("hsts", { ...cfg.hsts, enabled: e.target.checked })} /> Enabled</label>
          </h3>
          {cfg.hsts.enabled && (
            <div className="grid2">
              <label>
                max-age
                <select className="sel" value={String(cfg.hsts.maxAge)} onChange={(e) => patch("hsts", { ...cfg.hsts, maxAge: Number(e.target.value) })}>
                  {[[300, "5 minutes (testing)"], [86400, "1 day"], [2592000, "30 days"], [15768000, "6 months"], [31536000, "1 year"], [63072000, "2 years (recommended)"], ...(![300, 86400, 2592000, 15768000, 31536000, 63072000].includes(cfg.hsts.maxAge) ? [[cfg.hsts.maxAge, `${cfg.hsts.maxAge} s`]] : [])].map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </label>
              <label className="tog" style={{ display: "flex" }}><input type="checkbox" checked={cfg.hsts.includeSubDomains} onChange={(e) => patch("hsts", { ...cfg.hsts, includeSubDomains: e.target.checked })} /> includeSubDomains</label>
              <label className="tog" style={{ display: "flex" }}><input type="checkbox" checked={cfg.hsts.preload} onChange={(e) => patch("hsts", { ...cfg.hsts, preload: e.target.checked })} /> preload</label>
            </div>
          )}
          <h3 style={{ marginTop: 4 }}>Framing, sniffing & referrer</h3>
          <div className="grid2">
            <label>
              X-Frame-Options
              <select className="sel" value={cfg.xfo} onChange={(e) => patch("xfo", e.target.value)}>
                <option value="">(not set)</option>
                <option value="DENY">DENY</option>
                <option value="SAMEORIGIN">SAMEORIGIN</option>
              </select>
            </label>
            <label>
              Referrer-Policy
              <select className="sel" value={cfg.referrer} onChange={(e) => patch("referrer", e.target.value)}>
                {["", "no-referrer", "same-origin", "strict-origin", "strict-origin-when-cross-origin", "origin", "origin-when-cross-origin", "no-referrer-when-downgrade", "unsafe-url"].map((v) => (
                  <option key={v} value={v}>{v || "(not set)"}</option>
                ))}
              </select>
            </label>
            <label className="tog" style={{ display: "flex", alignSelf: "end" }}><input type="checkbox" checked={cfg.nosniff} onChange={(e) => patch("nosniff", e.target.checked)} /> X-Content-Type-Options: nosniff</label>
          </div>
        </section>

        <section className="g pane sec" aria-label="Permissions Policy">
          <h3>Permissions-Policy</h3>
          <div className="perm">
            {PERMISSIONS.map((p) => (
              <label key={p}>
                {p}
                <select className="sel" value={cfg.permissions[p] ?? ""} onChange={(e) => { const next = { ...cfg.permissions }; if (e.target.value) next[p] = e.target.value; else delete next[p]; patch("permissions", next); }}>
                  <option value="">default</option>
                  <option value="none">() none</option>
                  <option value="self">(self)</option>
                  <option value="all">* all</option>
                </select>
              </label>
            ))}
          </div>
        </section>

        <section className="g pane sec" aria-label="Cross-origin isolation and CORS">
          <h3>Cross-origin isolation</h3>
          <div className="grid2">
            <label>
              COOP
              <select className="sel" value={cfg.coop} onChange={(e) => patch("coop", e.target.value)}>
                {["", "same-origin", "same-origin-allow-popups", "unsafe-none"].map((v) => <option key={v} value={v}>{v || "(not set)"}</option>)}
              </select>
            </label>
            <label>
              COEP
              <select className="sel" value={cfg.coep} onChange={(e) => patch("coep", e.target.value)}>
                {["", "require-corp", "credentialless", "unsafe-none"].map((v) => <option key={v} value={v}>{v || "(not set)"}</option>)}
              </select>
            </label>
            <label>
              CORP
              <select className="sel" value={cfg.corp} onChange={(e) => patch("corp", e.target.value)}>
                {["", "same-origin", "same-site", "cross-origin"].map((v) => <option key={v} value={v}>{v || "(not set)"}</option>)}
              </select>
            </label>
          </div>
          <h3 style={{ marginTop: 4 }}>
            CORS
            <label className="tog"><input type="checkbox" checked={cfg.cors.enabled} onChange={(e) => patch("cors", { ...cfg.cors, enabled: e.target.checked })} /> Enabled</label>
          </h3>
          {cfg.cors.enabled && (
            <div className="grid2">
              <label style={{ gridColumn: "1 / -1" }}>
                Allowed origins (comma-separated)
                <input className="inp mono" value={cfg.cors.origins} onChange={(e) => patch("cors", { ...cfg.cors, origins: e.target.value })} />
              </label>
              <label>
                Methods
                <input className="inp mono" value={cfg.cors.methods} onChange={(e) => patch("cors", { ...cfg.cors, methods: e.target.value })} />
              </label>
              <label>
                Allowed headers
                <input className="inp mono" value={cfg.cors.headers} onChange={(e) => patch("cors", { ...cfg.cors, headers: e.target.value })} />
              </label>
              <label>
                Exposed headers
                <input className="inp mono" value={cfg.cors.expose} onChange={(e) => patch("cors", { ...cfg.cors, expose: e.target.value })} />
              </label>
              <label>
                Max-Age (s)
                <input className="inp mono" type="number" min={0} max={86400} value={cfg.cors.maxAge} onChange={(e) => patch("cors", { ...cfg.cors, maxAge: Number(e.target.value) || 0 })} />
              </label>
              <label className="tog" style={{ display: "flex", alignSelf: "end" }}><input type="checkbox" checked={cfg.cors.credentials} onChange={(e) => patch("cors", { ...cfg.cors, credentials: e.target.checked })} /> Allow credentials</label>
            </div>
          )}
        </section>
      </div>

      <div className="out">
        <section className="g pane" aria-label="Generated configuration">
          <div className="pane-head">
            <span className="lbl">{out.filename}</span>
            <div style={{ flex: 1 }} />
            <button type="button" className="btn-icon" onClick={copy}>
              <ToolIcon name={copied ? "check" : "copy"} size={15} /> {copied ? "Copied" : "Copy"}
            </button>
            <button type="button" className="btn-icon" onClick={() => downloadBlob(new Blob([out.text], { type: "text/plain" }), out.filename)} aria-label={`Download ${out.filename}`}>
              <ToolIcon name="download-simple" size={15} />
            </button>
          </div>
          <div className="fmt" style={{ padding: "8px 10px", borderBottom: "1px solid rgba(32,30,29,.08)" }}>
            {FORMATS.map(([id, label]) => (
              <button key={id} type="button" className="chip" aria-pressed={format === id} onClick={() => setOpt("format", id)}>
                {label}
              </button>
            ))}
          </div>
          {built.notes.map((n) => (
            <div key={n} className="note">
              <ToolIcon name="info" size={16} color="var(--plate-y)" />
              <span>{n}</span>
            </div>
          ))}
          <div className="scroll" style={{ maxHeight: 520, overflow: "auto" }}>
            <CodeView text={out.text} lang={out.lang} fontSize={mono - 0.5} />
          </div>
        </section>
        <Grade grade={self.grade} score={self.score} sub="Self-check: these headers run through the analyzer" />
        <section className="g pane" aria-label="Self-check">
          <div className="pane-head">
            <span className="lbl">Self-check</span>
            <div style={{ flex: 1 }} />
            <button type="button" className="btn btn-sm" onClick={() => { setInput("headers", built.headers.map(([k, v]) => `${k}: ${v}`).join("\n")); setOpt("mode", "analyze"); }}>
              <ToolIcon name="magnifying-glass" size={14} /> Open in Analyze
            </button>
          </div>
          <Checks checks={self.checks.filter((c) => c.status !== "pass")} />
          {self.checks.every((c) => c.status === "pass") && <p className="hint" style={{ padding: "0 14px 14px" }}>Every check passes.</p>}
        </section>
      </div>
    </div>
  );
}
