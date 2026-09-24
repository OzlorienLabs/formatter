"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CustomProps } from "../types";
import { regexMeta, explainRegex, REGEX_LIBRARY, FLAG_INFO, type RxOut, type RxMatch, type TokKind } from "../lib/E-regex";

const FLAGS = ["g", "i", "m", "s", "u", "y", "d"];
type Tab = "match" | "replace" | "split" | "explain" | "library";

const CSS = `
.e-rx { display: grid; gap: 12px; grid-template-columns: minmax(0, 1fr); }
.e-rx-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 10px 12px; border-radius: var(--radius-lg); }
.e-rx-pat { display: flex; align-items: center; flex: 1 1 420px; min-width: 0; border: 1px solid rgba(32,30,29,.16); border-radius: var(--radius-md); background: rgba(255,255,255,.7); padding: 0 10px; }
.e-rx-pat:focus-within { outline: 2px solid var(--color-accent-300); border-color: var(--color-accent-500); }
.e-rx-pat.bad { border-color: var(--color-accent-2-500); }
.e-rx-pat input { flex: 1; min-width: 0; border: 0; background: transparent; outline: none; padding: 9px 4px; font-family: var(--font-mono); }
.e-rx-slash { color: var(--color-neutral-500); font-family: var(--font-mono); font-size: 17px; }
.e-rx-fl { color: var(--color-accent-2-700); font-family: var(--font-mono); min-width: 1ch; }
.e-rx-flags { display: flex; gap: 4px; flex-wrap: wrap; }
.e-rx-flags button { font-family: var(--font-mono); width: 30px; height: 30px; border-radius: var(--radius-md); border: 1px solid rgba(32,30,29,.14); background: rgba(255,255,255,.4); cursor: pointer; font-size: 14px; }
.e-rx-flags button[aria-pressed="true"] { background: var(--color-accent-700); border-color: var(--color-accent-700); color: #fff; }
.e-rx-grid { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 12px; }
@media (max-width: 1100px) { .e-rx-grid { grid-template-columns: minmax(0, 1fr); } }
.e-rx-status { font-family: var(--font-mono); font-size: 12px; color: var(--color-neutral-600); }
.e-rx-status b { color: var(--color-accent-800); font-weight: 600; }
.e-hl { position: relative; height: clamp(260px, 48vh, 560px); overflow: hidden; }
.e-hl pre, .e-hl textarea { margin: 0; padding: 12px 14px; font-family: var(--font-mono); line-height: 1.6; white-space: pre-wrap; word-break: break-word; overflow-wrap: anywhere; tab-size: 4; letter-spacing: 0; font-variant-ligatures: none; border: 0; }
.e-hl pre { position: absolute; top: 0; left: 0; right: 0; pointer-events: none; color: var(--color-neutral-900); }
.e-hl textarea { position: absolute; inset: 0; width: 100%; height: 100%; resize: none; outline: none; background: transparent; color: transparent; caret-color: var(--color-neutral-900); overflow: auto; }
.e-hl textarea::selection { background: rgba(0,136,176,.25); color: transparent; }
.e-hl mark { color: inherit; border-radius: 2px; }
.e-hl mark.m0 { background: rgba(0,136,176,.2); box-shadow: inset 0 -2px 0 rgba(0,136,176,.55); }
.e-hl mark.m1 { background: rgba(237,187,0,.3); box-shadow: inset 0 -2px 0 rgba(185,141,0,.6); }
.e-hl mark.act { outline: 1.5px solid var(--color-accent-700); }
.e-hl .zero { display: inline-block; width: 0; height: 1.2em; vertical-align: text-bottom; box-shadow: 0 0 0 1px var(--color-accent-2-600); }
.e-g0 { background: rgba(214,0,108,.22) !important; } .e-g1 { background: rgba(0,160,90,.25) !important; } .e-g2 { background: rgba(120,80,220,.22) !important; }
.e-g3 { background: rgba(240,120,0,.25) !important; } .e-g4 { background: rgba(0,110,220,.22) !important; } .e-g5 { background: rgba(0,150,150,.25) !important; }
.e-sw { display: inline-block; width: 10px; height: 10px; border-radius: 2px; flex: none; }
.e-list { display: grid; gap: 6px; padding: 10px 12px; }
.e-card { border: 1px solid rgba(32,30,29,.09); border-radius: var(--radius-md); background: rgba(255,255,255,.45); padding: 7px 10px; cursor: pointer; }
.e-card:hover, .e-card.act { border-color: var(--color-accent-400); background: rgba(0,136,176,.05); }
.e-card .hd { display: flex; gap: 10px; align-items: baseline; font-family: var(--font-mono); font-size: 13px; }
.e-card .no { color: var(--color-neutral-500); min-width: 2.5ch; }
.e-card .rng { color: var(--color-neutral-500); font-size: 11.5px; white-space: nowrap; }
.e-card .txt { color: var(--color-neutral-900); word-break: break-all; white-space: pre-wrap; }
.e-grp { display: grid; grid-template-columns: auto auto auto minmax(0,1fr); gap: 2px 10px; margin-top: 5px; padding-left: 3.2ch; font-family: var(--font-mono); font-size: 12px; align-items: center; }
.e-grp .nm { color: var(--color-accent-800); }
.e-grp .nul { color: var(--color-neutral-500); font-style: italic; }
.e-out { padding: 12px 14px; font-family: var(--font-mono); line-height: 1.6; white-space: pre-wrap; word-break: break-word; margin: 0; }
.e-out .rep { background: rgba(0,160,90,.18); box-shadow: inset 0 -2px 0 rgba(0,160,90,.5); border-radius: 2px; }
.e-split { display: grid; grid-template-columns: auto minmax(0,1fr); gap: 0; font-family: var(--font-mono); font-size: 13px; }
.e-split > div { padding: 4px 10px; border-bottom: 1px solid rgba(32,30,29,.06); white-space: pre-wrap; word-break: break-word; }
.e-split .ix { color: var(--color-neutral-500); text-align: right; }
.e-tok { display: grid; grid-template-columns: auto minmax(0,1fr); gap: 4px 12px; padding: 10px 12px; align-items: start; }
.e-tok code { font-family: var(--font-mono); font-size: 13px; padding: 1px 6px; border-radius: 3px; background: rgba(32,30,29,.06); white-space: pre; display: inline-block; }
.e-tok .d { font-size: 13.5px; line-height: 1.45; color: var(--color-neutral-800); padding-top: 1px; }
.e-k-class code { background: rgba(0,136,176,.12); color: var(--color-accent-800); }
.e-k-group code, .e-k-close code { background: rgba(120,80,220,.12); color: oklch(42% .15 290); }
.e-k-look code { background: rgba(0,110,220,.12); color: oklch(42% .14 250); }
.e-k-quant code { background: rgba(240,120,0,.14); color: oklch(48% .15 50); }
.e-k-anchor code, .e-k-backref code { background: rgba(0,160,90,.14); color: oklch(42% .12 150); }
.e-k-escape code, .e-k-dot code { background: rgba(214,0,108,.1); color: var(--color-accent-2-800); }
.e-k-alt code { background: rgba(32,30,29,.12); font-weight: 700; }
.e-k-error code { background: rgba(214,0,108,.2); color: var(--color-accent-2-800); }
.e-k-error .d { color: var(--color-accent-2-700); }
.e-lib { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 8px; padding: 10px 12px; }
.e-lib > div { border: 1px solid rgba(32,30,29,.09); border-radius: var(--radius-md); background: rgba(255,255,255,.45); padding: 8px 10px; display: grid; gap: 4px; }
.e-lib .pt { font-family: var(--font-mono); font-size: 11.5px; color: var(--color-neutral-700); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.e-lib .ds { font-size: 12.5px; color: var(--color-neutral-600); line-height: 1.4; }
.e-empty { padding: 18px 14px; color: var(--color-neutral-600); font-size: 14px; }
.e-help { display: flex; flex-wrap: wrap; gap: 5px; padding: 0 12px 10px; }
.e-help button { font-family: var(--font-mono); font-size: 12px; }
`;

function groupCls(n: number) {
  return `e-g${(n - 1) % 6}`;
}

/** Render the text with match marks; the active match also shows its groups. */
function renderMarks(text: string, matches: RxMatch[], active: number | null) {
  const out: React.ReactNode[] = [];
  let pos = 0;
  const limit = Math.min(matches.length, 3000);
  for (let k = 0; k < limit; k++) {
    const m = matches[k];
    if (m.i < pos) continue;
    if (m.i > pos) out.push(text.slice(pos, m.i));
    if (m.e === m.i) {
      out.push(<span key={`z${k}`} className="zero" />);
      pos = m.i;
      continue;
    }
    const cls = `m${k % 2}${active === k ? " act" : ""}`;
    if (active === k && m.g.some((g) => g && g.s >= 0 && g.e > g.s)) {
      const groups = m.g.filter((g): g is NonNullable<typeof g> => !!g && g.s >= 0 && g.e > g.s);
      const pts = [...new Set([m.i, m.e, ...groups.flatMap((g) => [g.s, g.e])])].filter((p) => p >= m.i && p <= m.e).sort((a, b) => a - b);
      const parts: React.ReactNode[] = [];
      for (let j = 0; j < pts.length - 1; j++) {
        const a = pts[j], b = pts[j + 1];
        const inner = groups.filter((g) => g.s <= a && g.e >= b).sort((x, y) => x.e - x.s - (y.e - y.s))[0];
        parts.push(inner ? <span key={j} className={groupCls(inner.n)}>{text.slice(a, b)}</span> : text.slice(a, b));
      }
      out.push(<mark key={k} className={cls}>{parts}</mark>);
    } else out.push(<mark key={k} className={cls}>{text.slice(m.i, m.e)}</mark>);
    pos = m.e;
  }
  if (pos < text.length) out.push(text.slice(pos));
  return out;
}

function HighlightEditor({ value, onChange, matches, active, setActive, fontSize, taRef }: { value: string; onChange: (v: string) => void; matches: RxMatch[]; active: number | null; setActive: (i: number | null) => void; fontSize: number; taRef: React.RefObject<HTMLTextAreaElement> }) {
  const pre = useRef<HTMLPreElement>(null);
  const sync = useCallback(() => {
    const t = taRef.current;
    if (t && pre.current) {
      pre.current.style.transform = `translateY(${-t.scrollTop}px)`;
      pre.current.style.width = `${t.clientWidth}px`;
    }
  }, [taRef]);
  useEffect(() => {
    const t = taRef.current;
    if (!t) return;
    const ro = new ResizeObserver(sync);
    ro.observe(t);
    return () => ro.disconnect();
  }, [taRef, sync]);
  useEffect(sync, [value, sync]);
  const marks = useMemo(() => renderMarks(value, matches, active), [value, matches, active]);
  const onCaret = () => {
    const t = taRef.current;
    if (!t) return;
    const p = t.selectionStart;
    const i = matches.findIndex((m) => p >= m.i && p <= m.e && m.e > m.i);
    setActive(i >= 0 ? i : null);
  };
  return (
    <div className="e-hl" style={{ fontSize }}>
      <pre ref={pre} aria-hidden="true" style={{ fontSize }}>
        {marks}
        {"\n"}
      </pre>
      <textarea
        ref={taRef}
        className="scroll"
        aria-label="Test string"
        value={value}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        placeholder="Paste the text to search…"
        style={{ fontSize }}
        onChange={(e) => onChange(e.target.value)}
        onScroll={sync}
        onClick={onCaret}
        onKeyUp={onCaret}
      />
    </div>
  );
}

export default function RegexTester({ inputs, opts, setInput, setOpt, result, error, mono }: CustomProps) {
  const pattern = inputs.pattern ?? "";
  const text = inputs.text ?? "";
  const flags = FLAGS.filter((f) => opts[f] === true || opts[f] === "true").join("");
  const mode = String(opts.mode ?? "match") as "match" | "replace" | "split";
  const [tab, setTab] = useState<Tab>(mode);
  const [active, setActive] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [meta, setMeta] = useState<{ out: RxOut; req: { text: string; pattern: string } } | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const m = result ? regexMeta.get(result) : undefined;
    if (m) setMeta(m);
  }, [result]);
  useEffect(() => {
    if (tab === "match" || tab === "replace" || tab === "split") setTab(mode);
    // Follow the mode option when it changes from the options bar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);
  useEffect(() => setActive(null), [pattern, flags]);

  const tokens = useMemo(() => explainRegex(pattern, flags), [pattern, flags]);
  // Indices are only meaningful for the text they were computed on.
  const data = meta && meta.req.text === text ? meta.out : null;
  const stale = !!error && !!data;
  const matches = !pattern ? [] : data?.matches ?? [];
  const lib = useMemo(() => REGEX_LIBRARY.filter((e) => !q || (e.name + " " + e.desc).toLowerCase().includes(q.toLowerCase())), [q]);

  const pick = (t: Tab) => {
    setTab(t);
    if (t === "match" || t === "replace" || t === "split") setOpt("mode", t);
  };
  const loadLib = (e: (typeof REGEX_LIBRARY)[number], withSample: boolean) => {
    setInput("pattern", e.pattern);
    for (const f of FLAGS) if ((opts[f] === true) !== e.flags.includes(f)) setOpt(f, e.flags.includes(f));
    if (withSample || !text.trim()) setInput("text", e.sample);
    pick("match");
  };
  const select = (m: RxMatch, i: number) => {
    setActive(i);
    const t = taRef.current;
    if (t) {
      t.focus();
      t.setSelectionRange(m.i, m.e);
    }
  };

  const nGroups = data?.groupCount ?? 0;
  const status = error ? null : !pattern ? "Type a pattern" : data ? `${matches.length}${data.truncated ? "+" : ""} match${matches.length === 1 ? "" : "es"}${nGroups ? ` · ${nGroups} group${nGroups === 1 ? "" : "s"}` : ""} · ${data.ms < 1 ? "<1" : data.ms} ms` : "…";

  return (
    <div className="e-rx">
      <style>{CSS}</style>
      <section className="g e-rx-bar" aria-label="Pattern">
        <div className={`e-rx-pat${error && /Invalid regular expression/.test(error) ? " bad" : ""}`}>
          <span className="e-rx-slash">/</span>
          <input aria-label="Regular expression pattern" value={pattern} spellCheck={false} autoComplete="off" placeholder="[\w.+-]+@[\w-]+\.\w+" onChange={(e) => setInput("pattern", e.target.value)} style={{ fontSize: mono + 1 }} />
          <span className="e-rx-slash">/</span>
          <span className="e-rx-fl" title="Active flags">{flags}</span>
        </div>
        <div className="e-rx-flags" role="group" aria-label="Flags">
          {FLAGS.map((f) => (
            <button key={f} type="button" aria-pressed={flags.includes(f)} title={`${f} — ${FLAG_INFO[f]}`} onClick={() => setOpt(f, !flags.includes(f))}>
              {f}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-sm" aria-pressed={tab === "library"} onClick={() => pick(tab === "library" ? mode : "library")}>
          Library
        </button>
      </section>

      {error && (
        <div role="alert" className="errband g" style={{ borderRadius: "var(--radius-lg)" }}>
          <span className="mono" style={{ fontSize: 13, color: "var(--color-accent-2-700)", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{error}</span>
        </div>
      )}

      <div className="e-rx-grid">
        <section className="g pane" aria-label="Test string">
          <div className="pane-head">
            <span className="lbl">Test string</span>
            <div style={{ flex: 1 }} />
            {status && (
              <span className="e-rx-status" aria-live="polite">
                <b>{status}</b>
              </span>
            )}
            {stale && data && <span className="e-rx-status">showing last good result</span>}
          </div>
          <HighlightEditor value={text} onChange={(v) => setInput("text", v)} matches={matches} active={active} setActive={setActive} fontSize={mono} taRef={taRef} />
          <div className="pane-head" style={{ borderTop: "1px solid rgba(32,30,29,.1)", borderBottom: 0 }}>
            <label className="lbl" htmlFor="e-rx-rep">Replace with</label>
            <input id="e-rx-rep" className="inp mono" style={{ flex: 1, minWidth: 140 }} value={inputs.replacement ?? ""} placeholder="$1 · $<name> · $& · $$" onChange={(e) => setInput("replacement", e.target.value)} onFocus={() => tab !== "replace" && pick("replace")} />
          </div>
        </section>

        <section className="g pane" aria-label="Results" style={{ minHeight: 320 }}>
          <div className="pane-head">
            <div className="tabs" role="tablist">
              {(
                [
                  ["match", `Matches${pattern && data ? ` (${matches.length})` : ""}`],
                  ["replace", "Replace"],
                  ["split", "Split"],
                  ["explain", "Explain"],
                  ["library", "Library"],
                ] as [Tab, string][]
              ).map(([k, l]) => (
                <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => pick(k)}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="scroll" style={{ flex: 1, overflow: "auto", maxHeight: "clamp(300px, 60vh, 680px)" }}>
            {tab === "match" &&
              (!pattern ? (
                <p className="e-empty">Type a pattern above, or open the Library.</p>
              ) : !matches.length ? (
                <p className="e-empty">No matches.{!flags.includes("g") ? "" : ""}</p>
              ) : (
                <div className="e-list">
                  {!flags.includes("g") && <p style={{ margin: 0, fontSize: 13, color: "var(--color-neutral-600)" }}>Without the g flag only the first match is found.</p>}
                  {matches.slice(0, 500).map((m, i) => (
                    <div key={i} className={`e-card${active === i ? " act" : ""}`} onMouseEnter={() => setActive(i)} onClick={() => select(m, i)} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && select(m, i)}>
                      <div className="hd">
                        <span className="no">#{i + 1}</span>
                        <span className="rng">{m.i}–{m.e}</span>
                        <span className="txt">{m.t === "" ? <i style={{ color: "var(--color-neutral-500)" }}>empty match</i> : JSON.stringify(m.t).slice(1, -1)}</span>
                      </div>
                      {m.g.length > 0 && (
                        <div className="e-grp">
                          {m.g.map((g, k) => (
                            <GroupRow key={k} n={k + 1} name={data?.names[k + 1] ?? undefined} g={g} />
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {matches.length > 500 && <p className="e-empty">…and {matches.length - 500} more (the Copy output has all of them).</p>}
                </div>
              ))}

            {tab === "replace" && (
              <>
                <div className="e-help" style={{ paddingTop: 10 }}>
                  {["$&", "$1", "$2", ...(data?.names.filter(Boolean).map((n) => `$<${n}>`) ?? []), "$`", "$'", "$$"].map((t) => (
                    <button key={t} type="button" className="chip" title={t === "$&" ? "whole match" : t === "$$" ? "a literal $" : t === "$`" ? "text before the match" : t === "$'" ? "text after the match" : "a group"} onClick={() => setInput("replacement", (inputs.replacement ?? "") + t)}>
                      {t}
                    </button>
                  ))}
                </div>
                <pre className="e-out" style={{ fontSize: mono }}>
                  {data?.segments.length ? data.segments.map((s, i) => (s.t === "rep" ? <span key={i} className="rep" title={`replacement #${(s.m ?? 0) + 1}`}>{s.s}</span> : <span key={i}>{s.s}</span>)) : text}
                </pre>
              </>
            )}

            {tab === "split" && (
              <div className="e-split">
                {(data?.split ?? []).map((s, i) => (
                  <SplitRow key={i} i={i} s={s} />
                ))}
              </div>
            )}

            {tab === "explain" &&
              (tokens.length ? (
                <div className="e-tok">
                  {tokens.map((t, i) => (
                    <TokRow key={i} kind={t.kind} depth={t.depth} text={t.text} desc={t.desc} />
                  ))}
                  {flags.split("").map((f) => (
                    <TokRow key={f} kind="dot" depth={0} text={`/${f}`} desc={`Flag — ${FLAG_INFO[f]}`} />
                  ))}
                </div>
              ) : (
                <p className="e-empty">The explanation appears here, token by token.</p>
              ))}

            {tab === "library" && (
              <>
                <div style={{ padding: "10px 12px 0" }}>
                  <input className="inp" style={{ width: "100%" }} placeholder="Filter patterns…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter the pattern library" />
                </div>
                <div className="e-lib">
                  {lib.map((e) => (
                    <div key={e.name}>
                      <strong style={{ fontSize: 14 }}>{e.name}</strong>
                      <span className="pt" title={e.pattern}>/{e.pattern}/{e.flags}</span>
                      <span className="ds">{e.desc}</span>
                      <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                        <button type="button" className="btn btn-sm" onClick={() => loadLib(e, false)}>Use</button>
                        <button type="button" className="btn btn-sm" onClick={() => loadLib(e, true)}>With sample</button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function GroupRow({ n, name, g }: { n: number; name?: string; g: RxMatch["g"][number] }) {
  return (
    <>
      <span className={`e-sw ${groupCls(n)}`} />
      <span className="nm">{name ? `${n} ‹${name}›` : n}</span>
      <span className="rng" style={{ color: "var(--color-neutral-500)" }}>{g && g.s >= 0 ? `${g.s}–${g.e}` : ""}</span>
      {g ? <span className="txt">{JSON.stringify(g.t).slice(1, -1) || <i className="nul">empty</i>}</span> : <span className="nul">did not participate</span>}
    </>
  );
}

function SplitRow({ i, s }: { i: number; s: string | undefined }) {
  return (
    <>
      <div className="ix">{i}</div>
      <div>{s === undefined ? <i style={{ color: "var(--color-neutral-500)" }}>undefined (group did not participate)</i> : s === "" ? <i style={{ color: "var(--color-neutral-500)" }}>empty string</i> : s}</div>
    </>
  );
}

function TokRow({ kind, depth, text, desc }: { kind: TokKind; depth: number; text: string; desc: string }) {
  return (
    <div className={`e-k-${kind}`} style={{ display: "contents" }}>
      <div style={{ paddingLeft: depth * 16 }}>
        <code>{text.replace(/ /g, "␣")}</code>
      </div>
      <div className="d">{desc}</div>
    </div>
  );
}
