"use client";

import { useApp } from "./AppState";

export default function Toast() {
  const { toast } = useApp();
  if (!toast) return null;
  return (
    <div
      className="g pop"
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        zIndex: 95,
        left: "50%",
        bottom: 28,
        transform: "translateX(-50%)",
        padding: "11px 20px",
        borderRadius: 999,
        fontSize: 14.5,
      }}
    >
      {toast}
    </div>
  );
}
