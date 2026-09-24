"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ToolIcon from "../ToolIcon";
import { highlight } from "@/src/lib/highlight";
import type { DiffLine, Lang, Output } from "@/src/tools/types";

const MAX_RENDER = 400_000;

/* ── sanitising ─────────────────────────────────────────────────────── */

type Purify = { sanitize: (s: string, cfg?: Record<string, unknown>) => string };
let purifyP: Promise<Purify> | null = null;
function purify(): Promise<Purify> {
  if (!purifyP) purifyP = import("dompurify").then((m) => (m.default as unknown as Purify));
  return purifyP;
}

function useSanitised(markup: string, svg: boolean) {
  const [clean, setClean] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    purify().then((p) => {
      if (!live) return;
      const cfg = svg
        ? { USE_PROFILES: { svg: true, svgFilters: true, html: true }, ADD_TAGS: ["foreignObject", "style"], HTML_INTEGRATION_POINTS: { foreignobject: true } }
        : { ADD_ATTR: ["target"], FORBID_TAGS: ["style"] };
      setClean(p.sanitize(markup, cfg));
    });
    return () => {
      live = false;
    };
  }, [markup, svg]);
  return clean;
}

/* ── views ──────────────────────────────────────────────────────────── */

export function CodeView({ text, lang, fontSize, wrap: wrapDefault, lineHeight }: { text: string; lang?: Lang; fontSize: number; wrap?: boolean; lineHeight?: number }) {
  const [wrap, setWrap] = useState(!!wrapDefault);
  const clipped = text.length > MAX_RENDER;
  const shown = clipped ? text.slice(0, MAX_RENDER) : text;
  const html = useMemo(() => highlight(shown, lang), [shown, lang]);
  return (
    <div style={{ position: "relative", minHeight: "100%" }}>
      <button
        type="button"
        className="btn-icon"
        onClick={() => setWrap(!wrap)}
        title={wrap ? "Disable line wrap" : "Wrap long lines"}
        style={{ position: "sticky", float: "right", top: 6, marginRight: 6, zIndex: 2, background: "rgba(250,249,249,.85)", fontSize: 11.5 }}
      >
        {wrap ? "No wrap" : "Wrap"}
      </button>
      <pre id="tool-output" aria-live="polite" className={`codeview${wrap ? " wrap" : ""}`} style={{ fontSize, lineHeight }} dangerouslySetInnerHTML={{ __html: html }} />
      {clipped && (
        <p style={{ padding: "0 14px 14px", fontSize: 13, color: "var(--color-neutral-600)" }}>
          Showing the first {MAX_RENDER.toLocaleString()} characters of {text.length.toLocaleString()} — Copy and Download include everything.
        </p>
      )}
    </div>
  );
}

function HtmlView({ html, css }: { html: string; css?: string }) {
  const clean = useSanitised(html, false);
  if (clean == null) return <div className="skeleton" style={{ height: 120, margin: 14 }} />;
  return (
    <div className="prose" style={{ padding: "14px 18px" }}>
      {css && <style>{css}</style>}
      <div dangerouslySetInnerHTML={{ __html: clean }} />
    </div>
  );
}

export function downloadBlob(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export async function svgToPng(svg: string, scale = 2): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("Could not rasterise the SVG"));
      img.src = url;
    });
    const w = img.naturalWidth || 800;
    const h = img.naturalHeight || 600;
    const c = document.createElement("canvas");
    c.width = w * scale;
    c.height = h * scale;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise<Blob>((res) => c.toBlob((b) => res(b!), "image/png"));
  } finally {
    URL.revokeObjectURL(url);
  }
}

function SvgView({ svg, name = "diagram" }: { svg: string; name?: string }) {
  const clean = useSanitised(svg, true);
  const [zoom, setZoom] = useState(1);
  const [bg, setBg] = useState<"white" | "checker">("white");
  const box = useRef<HTMLDivElement>(null);
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", gap: 4, alignItems: "center", padding: "6px 10px", borderBottom: "1px solid rgba(32,30,29,.07)", flexWrap: "wrap" }}>
        <button type="button" className="btn-icon" onClick={() => setZoom((z) => Math.max(0.1, z / 1.25))} aria-label="Zoom out">−</button>
        <span className="mono" style={{ fontSize: 12, width: 44, textAlign: "center" }}>{Math.round(zoom * 100)}%</span>
        <button type="button" className="btn-icon" onClick={() => setZoom((z) => Math.min(8, z * 1.25))} aria-label="Zoom in">+</button>
        <button type="button" className="btn-icon" onClick={() => setZoom(1)}>Reset</button>
        <button type="button" className="btn-icon" onClick={() => setBg(bg === "white" ? "checker" : "white")}>{bg === "white" ? "Checker" : "White"} bg</button>
        <div style={{ flex: 1 }} />
        <button type="button" className="btn-icon" onClick={() => downloadBlob(new Blob([svg], { type: "image/svg+xml" }), `${name}.svg`)}>
          <ToolIcon name="download-simple" size={14} /> SVG
        </button>
        <button type="button" className="btn-icon" onClick={async () => downloadBlob(await svgToPng(svg), `${name}.png`)}>
          <ToolIcon name="download-simple" size={14} /> PNG
        </button>
      </div>
      <div ref={box} className={`scroll ${bg === "checker" ? "checker" : ""}`} style={{ flex: 1, overflow: "auto", padding: 16, background: bg === "white" ? "#fff" : undefined }}>
        {clean == null ? (
          <div className="skeleton" style={{ height: 160 }} />
        ) : (
          <div
            data-testid="svg-output"
            style={{ transform: `scale(${zoom})`, transformOrigin: "0 0", width: "fit-content" }}
            dangerouslySetInnerHTML={{ __html: clean }}
          />
        )}
      </div>
    </div>
  );
}

function ImageView({ src, name, alt }: { src: string; name?: string; alt?: string }) {
  return (
    <div style={{ padding: 16, display: "grid", gap: 10, justifyItems: "start" }}>
      <div className="checker" style={{ padding: 8, borderRadius: 6, maxWidth: "100%" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt ?? "Output"} style={{ maxWidth: "100%", display: "block", imageRendering: "auto" }} />
      </div>
      {name && (
        <a className="btn btn-sm" href={src} download={name}>
          <ToolIcon name="download-simple" size={14} /> Download {name}
        </a>
      )}
    </div>
  );
}

const PAGE = 200;

function TableView({ columns, rows, caption }: { columns: string[]; rows: (string | number | boolean | null)[][]; caption?: string }) {
  const [sort, setSort] = useState<{ i: number; dir: 1 | -1 } | null>(null);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    let r = s ? rows.filter((row) => row.some((c) => String(c ?? "").toLowerCase().includes(s))) : rows;
    if (sort) {
      r = [...r].sort((a, b) => {
        const x = a[sort.i], y = b[sort.i];
        if (x == null) return 1;
        if (y == null) return -1;
        const nx = Number(x), ny = Number(y);
        const c = !Number.isNaN(nx) && !Number.isNaN(ny) && x !== "" && y !== "" ? nx - ny : String(x).localeCompare(String(y), undefined, { numeric: true });
        return c * sort.dir;
      });
    }
    return r;
  }, [rows, q, sort]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const p = Math.min(page, pages - 1);
  const slice = filtered.slice(p * PAGE, p * PAGE + PAGE);
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderBottom: "1px solid rgba(32,30,29,.07)", flexWrap: "wrap" }}>
        <input className="inp" placeholder="Filter rows…" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} style={{ width: 180, fontSize: 13 }} aria-label="Filter rows" />
        <span className="mono" style={{ fontSize: 12, color: "var(--color-neutral-600)" }}>
          {filtered.length.toLocaleString()} of {rows.length.toLocaleString()} rows · {columns.length} cols
        </span>
        {caption && <span style={{ fontSize: 12.5, color: "var(--color-neutral-600)" }}>{caption}</span>}
        <div style={{ flex: 1 }} />
        {pages > 1 && (
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button type="button" className="btn-icon" disabled={p === 0} onClick={() => setPage(p - 1)}>‹</button>
            <span className="mono" style={{ fontSize: 12 }}>{p + 1}/{pages}</span>
            <button type="button" className="btn-icon" disabled={p >= pages - 1} onClick={() => setPage(p + 1)}>›</button>
          </span>
        )}
      </div>
      <div className="scroll" style={{ flex: 1, overflow: "auto" }}>
        <table className="dt" data-testid="table-output">
          <thead>
            <tr>
              <th style={{ width: 1, color: "var(--color-neutral-500)" }}>#</th>
              {columns.map((c, i) => (
                <th key={i} onClick={() => setSort(sort?.i === i ? { i, dir: sort.dir === 1 ? -1 : 1 } : { i, dir: 1 })} title="Sort">
                  {c} {sort?.i === i ? (sort.dir === 1 ? "▲" : "▼") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map((row, r) => (
              <tr key={r}>
                <td style={{ color: "var(--color-neutral-500)" }}>{p * PAGE + r + 1}</td>
                {columns.map((_, i) => {
                  const c = row[i];
                  const isNum = typeof c === "number";
                  return (
                    <td key={i} className={c == null ? "null" : isNum ? "n" : undefined} title={c == null ? "" : String(c)}>
                      {c == null ? "null" : String(c)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── JSON tree ──────────────────────────────────────────────────────── */

const pathKey = (k: string) => (/^[A-Za-z_$][\w$]*$/.test(k) ? `.${k}` : `[${JSON.stringify(k)}]`);

function Scalar({ v }: { v: unknown }) {
  if (v === null) return <span className="tk-kw">null</span>;
  if (typeof v === "string") return <span className="tk-str">{JSON.stringify(v)}</span>;
  if (typeof v === "number") return <span className="tk-num">{String(v)}</span>;
  if (typeof v === "boolean") return <span className="tk-kw">{String(v)}</span>;
  return <span>{String(v)}</span>;
}

function matches(v: unknown, q: string): boolean {
  if (!q) return true;
  if (v !== null && typeof v === "object") return Object.entries(v as object).some(([k, x]) => k.toLowerCase().includes(q) || matches(x, q));
  return String(v).toLowerCase().includes(q);
}

function Node({ k, v, path, depth, open, q, onCopy }: { k: string | null; v: unknown; path: string; depth: number; open: number; q: string; onCopy: (p: string) => void }) {
  const [limit, setLimit] = useState(300);
  const label = k === null ? null : <span className="tk-key">{/^\d+$/.test(k) ? k : JSON.stringify(k)}</span>;
  const copyBtn = (
    <button type="button" className="btn-icon path-btn" onClick={(e) => { e.preventDefault(); onCopy(path || "$"); }} title="Copy path">
      {path || "$"}
    </button>
  );
  if (v !== null && typeof v === "object") {
    const isArr = Array.isArray(v);
    const entries = Object.entries(v as object).filter(([ck, cv]) => !q || ck.toLowerCase().includes(q) || matches(cv, q));
    const size = isArr ? (v as unknown[]).length : Object.keys(v as object).length;
    return (
      <details open={depth < open || !!q}>
        <summary className="row">
          {label}
          {label && <span className="tk-punc">: </span>}
          <span className="tk-punc">{isArr ? "[" : "{"}</span>
          <span style={{ color: "var(--color-neutral-500)", fontSize: 12 }}> {size} {isArr ? (size === 1 ? "item" : "items") : size === 1 ? "key" : "keys"} </span>
          <span className="tk-punc">{isArr ? "]" : "}"}</span>
          {copyBtn}
        </summary>
        <div className="kids">
          {entries.slice(0, limit).map(([ck, cv]) => (
            <Node key={ck} k={ck} v={cv} path={isArr ? `${path}[${ck}]` : `${path}${pathKey(ck)}`} depth={depth + 1} open={open} q={q} onCopy={onCopy} />
          ))}
          {entries.length > limit && (
            <button type="button" className="btn-icon" onClick={() => setLimit(limit + 500)}>
              Show more ({entries.length - limit} left)
            </button>
          )}
        </div>
      </details>
    );
  }
  return (
    <div className="row leaf">
      {label}
      {label && <span className="tk-punc">: </span>}
      <Scalar v={v} />
      {copyBtn}
    </div>
  );
}

function TreeView({ value }: { value: unknown }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(2);
  const [gen, setGen] = useState(0);
  const [copied, setCopied] = useState("");
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderBottom: "1px solid rgba(32,30,29,.07)", flexWrap: "wrap" }}>
        <input className="inp" placeholder="Search keys and values…" value={q} onChange={(e) => setQ(e.target.value.toLowerCase())} style={{ width: 200, fontSize: 13 }} aria-label="Search the tree" />
        <button type="button" className="btn-icon" onClick={() => { setOpen(99); setGen(gen + 1); }}>Expand all</button>
        <button type="button" className="btn-icon" onClick={() => { setOpen(1); setGen(gen + 1); }}>Collapse</button>
        <span style={{ fontSize: 12, color: "var(--color-neutral-600)" }}>{copied ? `Copied ${copied}` : "Hover a row to copy its path"}</span>
      </div>
      <div className="scroll tree" data-testid="tree-output" style={{ flex: 1, overflow: "auto", padding: "10px 12px" }}>
        <Node
          key={gen}
          k={null}
          v={value}
          path="$"
          depth={0}
          open={open}
          q={q}
          onCopy={(p) => {
            navigator.clipboard?.writeText(p);
            setCopied(p);
          }}
        />
      </div>
    </div>
  );
}

/* ── XML tree ───────────────────────────────────────────────────────── */

function XmlNode({ n, depth }: { n: Element; depth: number }) {
  const attrs = Array.from(n.attributes);
  const kids = Array.from(n.childNodes).filter((c) => c.nodeType === 1 || (c.nodeType === 3 && c.textContent!.trim()) || c.nodeType === 4 || c.nodeType === 8);
  const head = (
    <>
      <span className="tk-punc">&lt;</span>
      <span className="tk-tag">{n.nodeName}</span>
      {attrs.map((a) => (
        <span key={a.name}>
          {" "}
          <span className="tk-attr">{a.name}</span>
          <span className="tk-punc">=</span>
          <span className="tk-str">&quot;{a.value}&quot;</span>
        </span>
      ))}
      <span className="tk-punc">{kids.length ? ">" : " />"}</span>
    </>
  );
  if (!kids.length) return <div className="row leaf">{head}</div>;
  if (kids.length === 1 && kids[0].nodeType === 3)
    return (
      <div className="row leaf">
        {head}
        <span>{kids[0].textContent!.trim()}</span>
        <span className="tk-punc">&lt;/</span>
        <span className="tk-tag">{n.nodeName}</span>
        <span className="tk-punc">&gt;</span>
      </div>
    );
  return (
    <details open={depth < 3}>
      <summary className="row">
        {head} <span style={{ color: "var(--color-neutral-500)", fontSize: 12 }}>{kids.length} children</span>
      </summary>
      <div className="kids">
        {kids.map((c, i) =>
          c.nodeType === 1 ? (
            <XmlNode key={i} n={c as Element} depth={depth + 1} />
          ) : c.nodeType === 8 ? (
            <div key={i} className="row leaf tk-com">&lt;!--{c.textContent}--&gt;</div>
          ) : (
            <div key={i} className="row leaf">{c.nodeType === 4 ? `<![CDATA[${c.textContent}]]>` : c.textContent!.trim()}</div>
          )
        )}
      </div>
    </details>
  );
}

function XmlTreeView({ xml }: { xml: string }) {
  const doc = useMemo(() => new DOMParser().parseFromString(xml, "application/xml"), [xml]);
  const err = doc.getElementsByTagName("parsererror")[0];
  if (err) return <p style={{ padding: 14, color: "var(--color-accent-2-700)" }}>{err.textContent}</p>;
  return (
    <div className="scroll tree" data-testid="tree-output" style={{ height: "100%", overflow: "auto", padding: "10px 12px" }}>
      <XmlNode n={doc.documentElement} depth={0} />
    </div>
  );
}

/* ── the rest ───────────────────────────────────────────────────────── */

function DiffView({ hunks, mode }: { hunks: DiffLine[]; mode: "unified" | "split" }) {
  if (!hunks.length) return <p style={{ padding: 14 }}>No differences.</p>;
  if (mode === "unified")
    return (
      <table className="diff" data-testid="diff-output">
        <tbody>
          {hunks.map((l, i) => (
            <tr key={i} className={l.t}>
              <td className="ln">{l.a ?? ""}</td>
              <td className="ln">{l.b ?? ""}</td>
              <td className="tx" dangerouslySetInnerHTML={{ __html: (l.t === "add" ? "+ " : l.t === "del" ? "- " : l.t === "hunk" ? "" : "  ") + l.text }} />
            </tr>
          ))}
        </tbody>
      </table>
    );
  // Split: pair deletions with the additions that follow them.
  const rows: { l?: DiffLine; r?: DiffLine; hunk?: string }[] = [];
  for (let i = 0; i < hunks.length; ) {
    const h = hunks[i];
    if (h.t === "hunk") { rows.push({ hunk: h.text }); i++; continue; }
    if (h.t === "ctx") { rows.push({ l: h, r: h }); i++; continue; }
    const dels: DiffLine[] = [];
    const adds: DiffLine[] = [];
    while (i < hunks.length && hunks[i].t === "del") dels.push(hunks[i++]);
    while (i < hunks.length && hunks[i].t === "add") adds.push(hunks[i++]);
    for (let k = 0; k < Math.max(dels.length, adds.length); k++) rows.push({ l: dels[k], r: adds[k] });
  }
  return (
    <table className="diff" data-testid="diff-output">
      <tbody>
        {rows.map((r, i) =>
          r.hunk !== undefined ? (
            <tr key={i} className="hunk"><td colSpan={4} dangerouslySetInnerHTML={{ __html: r.hunk }} /></tr>
          ) : (
            <tr key={i}>
              <td className="ln">{r.l?.a ?? ""}</td>
              <td className={r.l?.t === "del" ? "del" : undefined} style={{ width: "49%" }} dangerouslySetInnerHTML={{ __html: r.l?.text ?? "" }} />
              <td className="ln">{r.r?.b ?? ""}</td>
              <td className={r.r?.t === "add" ? "add" : undefined} style={{ width: "49%" }} dangerouslySetInnerHTML={{ __html: r.r?.text ?? "" }} />
            </tr>
          )
        )}
      </tbody>
    </table>
  );
}

const ICON_FOR = { error: "warning-circle", warning: "warning-circle", info: "info", ok: "seal-check" } as const;
const INK_FOR = { error: "var(--color-accent-2-700)", warning: "var(--plate-y)", info: "var(--color-accent-700)", ok: "oklch(48% .12 150)" } as const;

export default function OutputView({ out, fontSize }: { out: Output; fontSize: number }) {
  switch (out.kind) {
    case "text":
      return <CodeView text={out.text} lang={out.lang} fontSize={fontSize} wrap={out.wrap} lineHeight={out.lineHeight} />;
    case "html":
      return <HtmlView html={out.html} css={out.css} />;
    case "svg":
      return <SvgView svg={out.svg} name={out.name} />;
    case "image":
      return <ImageView src={out.src} name={out.name} alt={out.alt} />;
    case "table":
      return <TableView columns={out.columns} rows={out.rows} caption={out.caption} />;
    case "tree":
      return <TreeView value={out.value} />;
    case "xmltree":
      return <XmlTreeView xml={out.xml} />;
    case "stats":
      return (
        <div className="statgrid" style={{ padding: 14 }} data-testid="stats-output">
          {out.items.map((s, i) => (
            <div key={i} className={`stat ${s.tone ?? ""}`}>
              <b>{typeof s.value === "number" ? s.value.toLocaleString() : s.value}</b>
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      );
    case "status":
      return (
        <div style={{ padding: 18, display: "flex", gap: 12, alignItems: "flex-start" }} data-testid="status-output" data-ok={out.ok ? "1" : "0"}>
          <ToolIcon name={out.ok ? "seal-check" : "warning-circle"} size={30} color={out.ok ? "oklch(48% .12 150)" : "var(--color-accent-2-700)"} />
          <div>
            <strong style={{ fontSize: 19, display: "block" }}>{out.title}</strong>
            {out.detail && <pre className="mono" style={{ margin: "8px 0 0", whiteSpace: "pre-wrap", fontSize: 13, color: "var(--color-neutral-800)" }}>{out.detail}</pre>}
          </div>
        </div>
      );
    case "issues":
      return (
        <div style={{ padding: 12, display: "grid", gap: 6 }} data-testid="issues-output">
          {out.items.length === 0 && <div className="issue ok">No issues found.</div>}
          {out.items.map((it, i) => (
            <div key={i} className={`issue ${it.level}`}>
              <ToolIcon name={ICON_FOR[it.level]} size={16} color={INK_FOR[it.level]} />
              <span style={{ flex: 1 }}>{it.message}</span>
              {it.line != null && (
                <span className="mono" style={{ fontSize: 11.5, color: "var(--color-neutral-600)", whiteSpace: "nowrap" }}>
                  L{it.line}
                  {it.col != null ? `:${it.col}` : ""}
                </span>
              )}
            </div>
          ))}
        </div>
      );
    case "frame":
      return (
        <iframe
          title="Preview"
          sandbox="allow-scripts"
          srcDoc={out.srcdoc}
          data-testid="frame-output"
          style={{ width: "100%", height: out.height ?? "100%", minHeight: 320, border: 0, background: "#fff", display: "block" }}
        />
      );
    case "pdf":
      return <iframe title="PDF preview" src={out.src} style={{ width: "100%", height: "100%", minHeight: 480, border: 0, display: "block" }} />;
    case "diff":
      return <DiffView hunks={out.hunks} mode={out.mode} />;
    case "react":
      return <>{out.node}</>;
  }
}
