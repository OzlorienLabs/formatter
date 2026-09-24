"use client";

import { useEffect, useRef } from "react";

/** Shared console + playground chrome for the Python and JavaScript playgrounds. */

export type Line =
  | { kind: "stdout" | "stderr" | "log" | "info" | "warn" | "error" | "debug" | "value" | "system"; text: string; depth?: number }
  | { kind: "traceback" | "uncaught"; text: string; line?: number; depth?: number }
  | { kind: "table"; columns: string[]; rows: (string | number | boolean | null)[][]; depth?: number };

export const PG_CSS = `
.e-pg { display: grid; gap: 12px; grid-template-columns: minmax(0, 1fr); }
.e-pg-bar { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; padding: 8px 10px; border-radius: var(--radius-lg); }
.e-pg-grid { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); gap: 12px; align-items: stretch; }
@media (max-width: 1100px) { .e-pg-grid { grid-template-columns: minmax(0, 1fr); } }
.e-dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; flex: none; }
.e-dot.ready { background: oklch(62% .15 150); }
.e-dot.running, .e-dot.loading { background: var(--color-accent-600); animation: e-pulse 1s ease-in-out infinite; }
.e-dot.idle { background: var(--color-neutral-400); }
.e-dot.error { background: var(--color-accent-2-600); }
@keyframes e-pulse { 50% { opacity: .3; } }
.calm .e-dot { animation: none !important; }
.e-status { font-family: var(--font-mono); font-size: 12.5px; color: var(--color-neutral-700); display: inline-flex; align-items: center; gap: 7px; }
.e-con { font-family: var(--font-mono); line-height: 1.55; padding: 10px 0; margin: 0; }
.e-con > div { padding: 1px 14px; white-space: pre-wrap; word-break: break-word; }
.e-con .stderr, .e-con .error, .e-con .uncaught, .e-con .traceback { color: var(--color-accent-2-700); }
.e-con .error, .e-con .uncaught, .e-con .traceback { background: rgba(214,0,108,.06); border-left: 3px solid rgba(214,0,108,.5); padding-top: 3px; padding-bottom: 3px; margin: 2px 0; }
.e-con .warn { color: oklch(48% .12 70); background: rgba(237,187,0,.1); border-left: 3px solid rgba(185,141,0,.45); }
.e-con .info { color: var(--color-accent-800); }
.e-con .debug { color: var(--color-neutral-600); }
.e-con .value { color: var(--color-accent-800); }
.e-con .value::before { content: "← "; color: var(--color-neutral-500); }
.e-con .system { color: var(--color-neutral-500); font-style: italic; font-family: var(--font-sans, inherit); font-size: .92em; }
.e-con .jump { color: inherit; text-decoration: underline; text-underline-offset: 2px; cursor: pointer; background: none; border: 0; padding: 0; font: inherit; }
.e-con table { border-collapse: collapse; margin: 4px 0; font-size: .95em; }
.e-con th, .e-con td { border: 1px solid rgba(32,30,29,.14); padding: 2px 8px; text-align: left; white-space: pre; }
.e-con th { background: rgba(32,30,29,.05); font-weight: 600; }
.e-con td.n { color: oklch(52% .15 45); text-align: right; }
.e-con .empty { color: var(--color-neutral-500); font-style: italic; }
.e-stdin { width: 100%; min-height: 84px; resize: vertical; font-family: var(--font-mono); border: 0; background: transparent; padding: 10px 14px; outline: none; }
`;

/** Select a line in a CodeEditor textarea by id. */
export function jumpToLine(id: string, line: number) {
  const el = document.getElementById(id) as HTMLTextAreaElement | null;
  if (!el) return;
  const lines = el.value.split("\n");
  const n = Math.max(1, Math.min(line, lines.length));
  let start = 0;
  for (let i = 0; i < n - 1; i++) start += lines[i].length + 1;
  el.focus();
  el.setSelectionRange(start, start + lines[n - 1].length);
  const lh = parseFloat(getComputedStyle(el).lineHeight) || 20;
  el.scrollTop = Math.max(0, (n - 1) * lh - el.clientHeight / 3);
}

function Linked({ text, onJump }: { text: string; onJump?: (line: number) => void }) {
  if (!onJump) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  const re = /(File "<main>", line (\d+)|\(line (\d+):(\d+)\)|at line (\d+):(\d+))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    parts.push(text.slice(last, m.index));
    const n = Number(m[2] ?? m[3] ?? m[5]);
    parts.push(
      <button key={k++} type="button" className="jump" title={`Go to line ${n}`} onClick={() => onJump(n)}>
        {m[0]}
      </button>
    );
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
}

export function Console({ lines, fontSize, onJump, empty }: { lines: Line[]; fontSize: number; onJump?: (line: number) => void; empty: string }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = end.current?.parentElement?.parentElement;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);
  return (
    <div className="e-con" style={{ fontSize }} role="log" aria-live="polite">
      {!lines.length && <div className="empty">{empty}</div>}
      {lines.map((l, i) =>
        l.kind === "table" ? (
          <div key={i} style={{ paddingLeft: 14 + (l.depth ?? 0) * 16, overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  {l.columns.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {l.rows.map((r, j) => (
                  <tr key={j}>
                    {r.map((c, x) => (
                      <td key={x} className={typeof c === "number" ? "n" : undefined}>
                        {c === null ? "" : String(c)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div key={i} className={l.kind} style={l.depth ? { paddingLeft: 14 + l.depth * 16 } : undefined}>
            {l.kind === "traceback" || l.kind === "uncaught" ? <Linked text={l.text} onJump={onJump} /> : l.text}
          </div>
        )
      )}
      <div ref={end} />
    </div>
  );
}

export const fmtMs = (ms: number) => (ms < 1 ? "<1 ms" : ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`);
