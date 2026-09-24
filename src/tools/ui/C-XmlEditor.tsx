"use client";

import { useDeferredValue, useMemo, useRef, useState } from "react";
import CodeEditor from "@/src/components/tool/CodeEditor";
import OutputView from "@/src/components/tool/OutputView";
import ToolIcon from "@/src/components/ToolIcon";
import type { CustomProps, Output } from "@/src/tools/types";
import { formatXml, minifyXml, parseXml, removeCommentsInSource, sortAttributesInSource, xmlToJson, xmlStats } from "@/src/tools/lib/C-xml";

type Tab = "tree" | "issues" | "json";

const CSS = `
.c-xe { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); gap: 14px; min-height: min(680px, calc(100vh - 250px)); }
.c-xe .pane { min-height: 420px; }
.c-xe-tools { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }
.c-xe-tools .btn { padding: 4px 8px; font-size: 12.5px; gap: 5px; }
.c-xe-state { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; padding: 3px 9px; border-radius: 999px; white-space: nowrap; }
.c-xe-state.ok { background: rgba(0,160,90,.09); color: oklch(42% .12 150); }
.c-xe-state.bad { background: rgba(214,0,108,.08); color: var(--color-accent-2-700); }
.c-xe-issue { cursor: pointer; border: 0; width: 100%; text-align: left; font: inherit; }
.c-xe-issue:hover { outline: 1px solid var(--color-accent-300); }
.c-xe-foot { display: flex; gap: 14px; flex-wrap: wrap; align-items: center; padding: 6px 12px; border-top: 1px solid rgba(32,30,29,.08); font-size: 12px; color: var(--color-neutral-600); font-family: var(--font-mono); }
@media (max-width: 1180px) { .c-xe { grid-template-columns: minmax(0, 1fr); } }
`;

const INK = { error: "var(--color-accent-2-700)", warning: "var(--plate-y)", info: "var(--color-accent-700)" } as const;

export default function XmlEditor({ inputs, opts, setInput, record, mono }: CustomProps) {
  const src = inputs.xml ?? "";
  const deferred = useDeferredValue(src);
  const doc = useMemo(() => parseXml(deferred), [deferred]);
  const errors = doc.issues.filter((i) => i.level === "error");
  const [tab, setTab] = useState<Tab>("tree");
  const [flash, setFlash] = useState<{ msg: string; bad: boolean } | null>(null);
  const lastGood = useRef<string>("");
  const prevSrc = useRef<string>(deferred);
  // A different document (example switch, big paste) forgets the last valid tree.
  if (Math.abs(deferred.length - prevSrc.current.length) > 0.5 * Math.max(deferred.length, prevSrc.current.length, 1)) lastGood.current = "";
  prevSrc.current = deferred;
  if (!errors.length && deferred.trim()) lastGood.current = deferred;

  const json = useMemo(() => (errors.length ? "" : JSON.stringify(xmlToJson(doc), null, 2)), [doc, errors.length]);
  const stats = useMemo(() => (doc.root ? xmlStats(doc) : null), [doc]);

  const indent = opts.indent === "tab" ? "\t" : " ".repeat(Number(opts.indent) || 2);

  function say(msg: string, bad = false) {
    setFlash({ msg, bad });
    window.setTimeout(() => setFlash(null), 2400);
  }

  function rewrite(label: string, f: () => string) {
    const d = parseXml(src);
    const errs = d.issues.filter((i) => i.level === "error");
    if (errs.length) {
      setTab("issues");
      say(`${label}: fix ${errs.length} error${errs.length > 1 ? "s" : ""} first`, true);
      return;
    }
    const next = f();
    if (next === src) return say(`${label}: nothing to change`);
    setInput("xml", next);
    record(next);
    say(`${label} ✓`);
  }

  const actions: { label: string; icon: string; title: string; go: () => void }[] = [
    {
      label: "Format",
      icon: "text-align-left",
      title: "Pretty-print with the indent and options above",
      go: () => rewrite("Format", () => formatXml(parseXml(src), { indent, attrWrap: Number(opts.attrWrap) || 0, empty: (opts.empty as "preserve") ?? "preserve", width: 100, comments: true })),
    },
    { label: "Minify", icon: "arrows-in-line-horizontal", title: "Remove indentation whitespace", go: () => rewrite("Minify", () => minifyXml(parseXml(src), { comments: true })) },
    {
      label: "Validate",
      icon: "seal-check",
      title: "Check well-formedness",
      go: () => {
        setTab("issues");
        const d = parseXml(src);
        const n = d.issues.filter((i) => i.level === "error").length;
        say(n ? `${n} error${n > 1 ? "s" : ""}` : "Well-formed ✓", n > 0);
      },
    },
    { label: "→ JSON", icon: "brackets-curly", title: "Show the document as JSON", go: () => { setTab("json"); if (errors.length) say("Fix the errors to convert", true); } },
    { label: "Sort attrs", icon: "list", title: "Alphabetise attributes in place (xmlns first)", go: () => rewrite("Sort attributes", () => sortAttributesInSource(parseXml(src))) },
    { label: "Strip comments", icon: "eraser", title: "Delete every <!-- comment -->", go: () => rewrite("Remove comments", () => removeCommentsInSource(parseXml(src))) },
  ];

  function jump(line: number, col: number) {
    const ta = document.getElementById("c-xml-input") as HTMLTextAreaElement | null;
    if (!ta) return;
    const lines = src.split("\n");
    let off = 0;
    for (let k = 0; k < line - 1 && k < lines.length; k++) off += lines[k].length + 1;
    off += Math.max(0, col - 1);
    ta.focus();
    ta.setSelectionRange(off, off);
    ta.scrollTop = Math.max(0, (line - 4) * mono * 1.6);
  }

  const panel: Output | null =
    tab === "tree"
      ? lastGood.current
        ? { kind: "xmltree", xml: lastGood.current }
        : null
      : tab === "json"
        ? errors.length
          ? null
          : { kind: "text", text: json, lang: "json" }
        : null;

  return (
    <div className="c-xe">
      <style>{CSS}</style>
      <section className="g pane" aria-label="XML editor">
        <div className="pane-head">
          <div className="c-xe-tools" role="toolbar" aria-label="Editor actions">
            {actions.map((a) => (
              <button key={a.label} type="button" className="btn btn-sm" title={a.title} onClick={a.go}>
                <ToolIcon name={a.icon} size={14} /> {a.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", flex: 1, minHeight: 360 }}>
          <CodeEditor id="c-xml-input" value={src} onChange={(v) => setInput("xml", v)} lang="xml" fontSize={mono} label="XML" placeholder="Type or paste XML — or drop a .xml file" minHeight={360} />
        </div>
        <div className="c-xe-foot">
          {flash ? (
            <span className={`c-xe-state ${flash.bad ? "bad" : "ok"}`} role="status">{flash.msg}</span>
          ) : src.trim() ? (
            errors.length ? (
              <button type="button" className="c-xe-state bad" style={{ border: 0, cursor: "pointer" }} onClick={() => setTab("issues")}>
                <ToolIcon name="warning-circle" size={14} /> {errors.length} error{errors.length > 1 ? "s" : ""}
              </button>
            ) : (
              <span className="c-xe-state ok"><ToolIcon name="seal-check" size={14} /> Well-formed</span>
            )
          ) : null}
          <span style={{ flex: 1 }} />
          <span>{src.split("\n").length.toLocaleString()} lines</span>
          <span>{src.length.toLocaleString()} chars</span>
          {stats && (
            <>
              <span>{stats.elements} elements</span>
              <span>{stats.attributes} attributes</span>
              <span>depth {stats.maxDepth}</span>
              {stats.namespaces.length > 0 && <span>{stats.namespaces.length} namespace{stats.namespaces.length > 1 ? "s" : ""}</span>}
            </>
          )}
        </div>
      </section>

      <section className="g pane" aria-label="Inspector">
        <div className="pane-head">
          <div className="tabs" role="tablist">
            {(["tree", "issues", "json"] as Tab[]).map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
                {t === "tree" ? "Tree" : t === "json" ? "JSON" : `Issues (${doc.issues.length})`}
              </button>
            ))}
          </div>
          <div style={{ flex: 1 }} />
          {tab === "json" && json && (
            <button type="button" className="btn-icon" onClick={() => { navigator.clipboard?.writeText(json); say("JSON copied"); }}>
              <ToolIcon name="copy" size={15} /> Copy JSON
            </button>
          )}
          {tab === "tree" && errors.length > 0 && lastGood.current && <span style={{ fontSize: 12, color: "var(--color-neutral-600)" }}>showing last valid version</span>}
        </div>
        <div className="scroll" style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
          {tab === "issues" ? (
            <div style={{ padding: 12, display: "grid", gap: 6 }} data-testid="issues-output">
              {!src.trim() && <div className="issue info">Empty document.</div>}
              {src.trim() && doc.issues.length === 0 && (
                <div className="issue ok">
                  <ToolIcon name="seal-check" size={16} color="oklch(48% .12 150)" /> Well-formed XML — no issues.
                </div>
              )}
              {doc.issues.map((it, i) => (
                <button key={i} type="button" className={`issue ${it.level} c-xe-issue`} onClick={() => jump(it.line, it.col)} title="Jump to this position">
                  <ToolIcon name="warning-circle" size={16} color={INK[it.level]} />
                  <span style={{ flex: 1 }}>{it.message}</span>
                  <span className="mono" style={{ fontSize: 11.5, color: "var(--color-neutral-600)", whiteSpace: "nowrap" }}>L{it.line}:{it.col}</span>
                </button>
              ))}
            </div>
          ) : panel ? (
            <OutputView out={panel} fontSize={mono} />
          ) : (
            <p style={{ padding: 16, color: "var(--color-neutral-600)", fontSize: 14 }}>
              {src.trim() ? `Fix ${errors.length} error${errors.length > 1 ? "s" : ""} to see the ${tab === "json" ? "JSON" : "tree"}.` : "Start typing XML."}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
