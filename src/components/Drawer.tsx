"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ToolIcon from "./ToolIcon";

/** The shared right slide-over. 440px, full viewport width under 760px. */
export default function Drawer({
  open,
  title,
  icon,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  icon: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const panel = useRef<HTMLElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    restoreTo.current = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => panel.current?.focus(), 0);
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open && restoreTo.current) restoreTo.current.focus?.();
  }, [open]);

  if (!mounted || !open) return null;

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 70, display: "flex", justifyContent: "flex-end" }}>
      <div className="fi" onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(32,30,29,.22)" }} />
      <aside
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="drawer g slidein scroll"
        style={{
          position: "relative",
          width: 440,
          maxWidth: "100vw",
          height: "100vh",
          overflowY: "auto",
          borderRadius: 0,
          borderWidth: "0 0 0 1px",
          padding: "18px 20px 40px",
          outline: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "var(--space-6)" }}>
          <ToolIcon name={icon} size={22} color="var(--color-accent-700)" />
          <h2 style={{ margin: 0, fontSize: 23, letterSpacing: "-.02em" }}>{title}</h2>
          <div style={{ flex: 1 }} />
          <button
            className="ctl"
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ border: 0, background: "none", padding: 5, cursor: "pointer", color: "var(--color-neutral-600)" }}
          >
            <ToolIcon name="x" size={19} />
          </button>
        </div>
        {children}
      </aside>
    </div>,
    document.body
  );
}
