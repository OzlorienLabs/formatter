"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { highlight, HIGHLIGHT_LIMIT } from "@/src/lib/highlight";
import type { Lang } from "@/src/tools/types";

type Props = {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  lang?: Lang;
  placeholder?: string;
  fontSize: number;
  wrap?: boolean;
  readOnly?: boolean;
  label?: string;
  /** Minimum height in px. */
  minHeight?: number;
  /** Ctrl/Cmd+Enter. */
  onSubmit?: () => void;
  /** Accept dropped files as text. */
  droppable?: boolean;
};

/**
 * A textarea with a highlighted <pre> behind it and a line-number gutter.
 * Above HIGHLIGHT_LIMIT characters it falls back to a plain textarea so large
 * pastes stay responsive.
 */
export default function CodeEditor({
  id,
  value,
  onChange,
  lang,
  placeholder,
  fontSize,
  wrap,
  readOnly,
  label,
  minHeight = 160,
  onSubmit,
  droppable = true,
}: Props) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const pre = useRef<HTMLPreElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState(false);
  const plain = !lang || lang === "text" || value.length > HIGHLIGHT_LIMIT;

  const html = useMemo(() => (plain ? "" : highlight(value, lang) + "\n"), [value, lang, plain]);
  const lineCount = useMemo(() => {
    let n = 1;
    for (let i = 0; i < value.length; i++) if (value.charCodeAt(i) === 10) n++;
    return n;
  }, [value]);

  const sync = useCallback(() => {
    const t = ta.current;
    if (!t) return;
    if (pre.current) pre.current.style.transform = `translate(${-t.scrollLeft}px, ${-t.scrollTop}px)`;
    if (gutter.current) gutter.current.style.transform = `translateY(${-t.scrollTop}px)`;
  }, []);

  // With wrapping on, the <pre> must be exactly as wide as the textarea's text box.
  useEffect(() => {
    const t = ta.current;
    if (!t || !wrap || !pre.current) return;
    const ro = new ResizeObserver(() => {
      if (pre.current) pre.current.style.width = `${t.clientWidth}px`;
    });
    ro.observe(t);
    return () => ro.disconnect();
  }, [wrap, plain]);

  useEffect(sync, [value, sync]);

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && onSubmit) {
      e.preventDefault();
      onSubmit();
      return;
    }
    if (e.key === "Tab" && !e.shiftKey && !readOnly) {
      // Tab indents instead of leaving the editor; Escape then Tab still leaves.
      const t = e.currentTarget;
      const { selectionStart: s, selectionEnd: en } = t;
      if (s === en) {
        e.preventDefault();
        const v = value.slice(0, s) + "  " + value.slice(en);
        onChange(v);
        requestAnimationFrame(() => t.setSelectionRange(s + 2, s + 2));
      }
    }
  }

  async function onDrop(e: React.DragEvent) {
    if (!droppable || readOnly) return;
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    e.preventDefault();
    setDrag(false);
    onChange(await f.text());
  }

  const gutterNums = useMemo(() => {
    if (wrap) return "";
    const n = Math.min(lineCount, 20000);
    let s = "";
    for (let i = 1; i <= n; i++) s += i + "\n";
    return s;
  }, [lineCount, wrap]);

  return (
    <div
      className={`ed${wrap ? " wrap" : ""}${plain ? " plain" : ""}${drag ? " drag" : ""}`}
      style={{ minHeight, fontSize }}
      onDragOver={(e) => {
        if (droppable && !readOnly && e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDrag(true);
        }
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={onDrop}
    >
      {!wrap && (
        <div className="ed-gutter" aria-hidden="true" style={{ fontSize: fontSize - 1, lineHeight: `${fontSize * 1.6}px` }}>
          <div ref={gutter} style={{ lineHeight: `${fontSize * 1.6}px` }}>{gutterNums}</div>
        </div>
      )}
      <div className="ed-body">
        {!plain && <pre ref={pre} aria-hidden="true" style={{ fontSize }} dangerouslySetInnerHTML={{ __html: html }} />}
        <textarea
          ref={ta}
          id={id}
          aria-label={label}
          value={value}
          readOnly={readOnly}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          wrap={wrap ? "soft" : "off"}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onScroll={sync}
          onKeyDown={onKeyDown}
          className="scroll"
          style={{ fontSize }}
        />
      </div>
    </div>
  );
}
