"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import ToolIcon from "./ToolIcon";
import { useApp } from "./AppState";
import { TOOLS, categoryOfTool, plateInk, searchTools } from "@/src/lib/tools-registry";

export default function CommandPalette() {
  const router = useRouter();
  const { paletteOpen, setPaletteOpen } = useApp();
  const [q, setQ] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const results = useMemo(() => searchTools(q).slice(0, 40), [q]);

  // ⌘K / Ctrl-K from anywhere.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setPaletteOpen]);

  useEffect(() => {
    if (!paletteOpen) return;
    restoreTo.current = document.activeElement as HTMLElement | null;
    setQ("");
    setIndex(0);
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    // Escape closes even if something outside the dialog holds focus.
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setPaletteOpen(false);
        restoreTo.current?.focus?.();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [paletteOpen, setPaletteOpen]);

  function close() {
    setPaletteOpen(false);
    restoreTo.current?.focus?.();
  }

  if (!mounted || !paletteOpen) return null;

  function open(slug: string) {
    setPaletteOpen(false);
    router.push(`/tools/${slug}`);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[index]) {
      e.preventDefault();
      open(results[index].slug);
    } else if (e.key === "Tab") {
      // The dialog holds exactly one tab stop, so focus can never leave it.
      e.preventDefault();
      inputRef.current?.focus();
    }
  }

  return createPortal(
    <div
      style={{ position: "fixed", inset: 0, zIndex: 90, display: "flex", justifyContent: "center", paddingTop: "12vh" }}
      onKeyDown={onKeyDown}
    >
      <div className="fi" onClick={close} style={{ position: "absolute", inset: 0, background: "rgba(32,30,29,.26)" }} />
      <div
        ref={dialogRef}
        className="g pop"
        role="dialog"
        aria-modal="true"
        aria-label="Search tools"
        style={{
          position: "relative",
          width: 660,
          maxWidth: "94vw",
          maxHeight: "70vh",
          display: "flex",
          flexDirection: "column",
          borderRadius: "var(--radius-lg)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "14px 18px",
            borderBottom: "1px solid rgba(32,30,29,.1)",
          }}
        >
          <ToolIcon name="magnifying-glass" size={20} color="var(--color-neutral-700)" />
          <input
            ref={inputRef}
            type="text"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setIndex(0);
            }}
            placeholder="Jump to a tool"
            aria-label="Jump to a tool"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-listbox"
            aria-autocomplete="list"
            aria-activedescendant={results[index] ? `palette-opt-${results[index].slug}` : undefined}
            data-testid="palette-input"
            style={{ flex: 1, border: 0, background: "transparent", outline: "none", fontSize: 18, padding: "2px 0" }}
          />
          <kbd className="mono" style={{ fontSize: 11, color: "var(--color-neutral-600)" }}>
            esc
          </kbd>
        </div>

        <div id="palette-listbox" role="listbox" aria-label="Tools" className="scroll" style={{ flex: 1, overflowY: "auto", padding: 6 }}>
          {results.map((t, n) => {
            const cat = categoryOfTool(t);
            const ink = plateInk(cat.plate);
            return (
              <button
                key={t.slug}
                id={`palette-opt-${t.slug}`}
                className="ctl"
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={n === index}
                onClick={() => open(t.slug)}
                onMouseEnter={() => setIndex(n)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  width: "100%",
                  padding: "10px 13px",
                  border: 0,
                  borderRadius: "var(--radius-md)",
                  background: n === index ? "rgba(255,255,255,.8)" : "transparent",
                  cursor: "pointer",
                  textAlign: "left",
                  color: "var(--color-text)",
                }}
              >
                <ToolIcon slug={t.slug} size={20} color={ink} />
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: "block", fontSize: 15.5 }}>{t.title}</span>
                  <span
                    style={{
                      display: "block",
                      fontSize: 12.5,
                      color: "var(--color-neutral-700)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {t.description}
                  </span>
                </span>
                <span
                  style={{ fontSize: 11.5, letterSpacing: ".07em", textTransform: "uppercase", color: ink, flex: "none" }}
                >
                  {cat.short}
                </span>
              </button>
            );
          })}
          {results.length === 0 && (
            <p style={{ margin: 0, padding: "26px 16px", fontSize: 15, color: "var(--color-neutral-700)" }}>
              Nothing matches “{q}”.
            </p>
          )}
        </div>

        <div
          style={{
            display: "flex",
            gap: 16,
            padding: "9px 18px",
            borderTop: "1px solid rgba(32,30,29,.1)",
            fontSize: 12,
            color: "var(--color-neutral-600)",
          }}
        >
          <span>↑↓ move</span>
          <span>↵ open</span>
          <span>esc close</span>
          <div style={{ flex: 1 }} />
          <span className="mono">
            {results.length} of {TOOLS.length}
          </span>
        </div>
      </div>
    </div>,
    document.body
  );
}
