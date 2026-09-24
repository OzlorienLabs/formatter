"use client";

import { useMemo, useState } from "react";
import ToolIcon from "@/src/components/ToolIcon";
import type { CustomProps } from "@/src/tools/types";
import { TEMPLATES, resolveTemplate } from "@/src/tools/lib/G-gitignore-data";
import GOut, { Sec, G_CSS } from "./G-Out";

const CSS = `
.g-gi-search { position: relative; }
.g-gi-search input { width: 100%; padding-left: 32px; }
.g-gi-search svg { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); }
.g-gi-groups { display: grid; gap: 12px; max-height: 420px; overflow: auto; padding-right: 4px; }
.g-gi-group h4 { margin: 0 0 6px; font-size: 11.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--color-neutral-600); font-weight: 500; }
.g-gi-opts { display: flex; flex-wrap: wrap; gap: 5px; }
.g-gi-opts button { display: inline-flex; align-items: center; gap: 5px; }
.g-gi-opts button .n { font-family: var(--font-mono); font-size: 10.5px; color: var(--color-neutral-500); }
.g-gi-opts button[aria-pressed="true"] .n { color: var(--color-accent-800); }
.g-gi-sel { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; min-height: 32px; }
.g-gi-sel .chip { display: inline-flex; align-items: center; gap: 4px; background: var(--color-accent-100); border-color: var(--color-accent-400); color: var(--color-accent-900); }
.g-gi-sel .chip.bad { background: rgba(214,0,108,.07); border-color: rgba(214,0,108,.35); color: var(--color-accent-2-700); }
`;

const GROUPS = [...new Set(TEMPLATES.map((t) => t.group))];
const ruleCount = (body: string) => body.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#")).length;

export default function GitignoreBuilder({ inputs, setInput, result, error, mono, record }: CustomProps) {
  const [q, setQ] = useState("");
  const names = useMemo(() => (inputs.templates ?? "").split(/[,\n]/).map((x) => x.trim()).filter(Boolean), [inputs.templates]);
  const chosen = names.map((n) => ({ n, t: resolveTemplate(n) }));
  const ids = new Set(chosen.map((c) => c.t?.id).filter(Boolean) as string[]);
  const write = (list: string[]) => setInput("templates", list.join(", "));
  const toggle = (id: string) => {
    if (ids.has(id)) write(chosen.filter((c) => c.t?.id !== id).map((c) => c.n));
    else write([...names, id]);
  };
  const needle = q.trim().toLowerCase();
  const visible = TEMPLATES.filter((t) => !needle || t.name.toLowerCase().includes(needle) || t.id.includes(needle) || t.aliases?.some((a) => a.includes(needle)) || t.group.toLowerCase().includes(needle));

  return (
    <div className="g-split">
      <style>{G_CSS + CSS}</style>
      <section className="g pane" aria-label="Templates">
        <div className="pane-head">
          <span className="lbl">Templates ({ids.size} of {TEMPLATES.length})</span>
          <div style={{ flex: 1 }} />
          {names.length > 0 && (
            <button type="button" className="btn-icon" onClick={() => write([])}>
              <ToolIcon name="eraser" size={15} /> Clear
            </button>
          )}
        </div>
        <div className="g-form">
          <div className="g-gi-sel" aria-label="Selected templates">
            {chosen.length === 0 && <span className="g-hint">Nothing selected — pick templates below or type names separated by commas.</span>}
            {chosen.map((c, i) => (
              <span key={c.n + i} className={`chip${c.t ? "" : " bad"}`} title={c.t ? `${c.t.group} · ${ruleCount(c.t.body)} rules` : "Unknown template"}>
                {c.t ? c.t.name : `${c.n}?`}
                <button type="button" className="btn-icon" style={{ padding: 0 }} onClick={() => write(names.filter((_, j) => j !== i))} aria-label={`Remove ${c.t?.name ?? c.n}`}>
                  <ToolIcon name="x" size={12} />
                </button>
              </span>
            ))}
          </div>
          <div className="g-gi-search">
            <ToolIcon name="magnifying-glass" size={15} color="var(--color-neutral-500)" />
            <input className="inp" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${TEMPLATES.length} templates — language, framework, editor, OS…`} aria-label="Search templates" onKeyDown={(e) => { if (e.key === "Enter" && visible[0]) { toggle(visible[0].id); setQ(""); } }} />
          </div>
          <div className="g-gi-groups">
            {GROUPS.map((g) => {
              const items = visible.filter((t) => t.group === g);
              if (!items.length) return null;
              return (
                <div key={g} className="g-gi-group">
                  <h4>{g}</h4>
                  <div className="g-gi-opts">
                    {items.map((t) => (
                      <button key={t.id} type="button" className="chip" aria-pressed={ids.has(t.id)} onClick={() => toggle(t.id)} title={`${ruleCount(t.body)} rules${t.aliases?.length ? " · also: " + t.aliases.join(", ") : ""}`}>
                        {ids.has(t.id) && <ToolIcon name="check" size={12} />}
                        {t.name}
                        <span className="n">{ruleCount(t.body)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            {!visible.length && <p className="g-hint">No template matches “{q}”. Add your own patterns under Custom rules.</p>}
          </div>
          <Sec title="Custom rules">
            <textarea className="inp" rows={4} value={inputs.custom ?? ""} onChange={(e) => setInput("custom", e.target.value)} placeholder={"# project-specific\n/secrets/\n*.local.json\n!important.log"} aria-label="Custom rules" spellCheck={false} />
          </Sec>
          <Sec title="Test a path">
            <textarea className="inp" rows={4} value={inputs.test ?? ""} onChange={(e) => setInput("test", e.target.value)} placeholder={"node_modules/react/index.js\nsrc/app.ts\nbuild/   (trailing / = a directory)"} aria-label="Paths to test" spellCheck={false} />
            <p className="g-hint">One path per line, relative to the repository root. The Path tests tab shows which rule decides each one — using git&apos;s own rules for negation, directory-only patterns, anchors and **.</p>
          </Sec>
        </div>
      </section>
      <GOut result={result} error={error} mono={mono} onCopy={record} filename=".gitignore" label=".gitignore" className="g-sticky" minHeight={560} />
    </div>
  );
}
