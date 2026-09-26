"use client";

import { useCallback, useState } from "react";
import FeedbackDialog from "./FeedbackDialog";

/** "Built with curiosity and care by Ozlorien Labs" — the name opens the feedback sheet. */
export default function SiteFooter() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <footer
      style={{
        padding: "var(--space-6) clamp(16px,4vw,56px) var(--space-8)",
        textAlign: "center",
        fontSize: 14,
        color: "var(--color-neutral-600)",
      }}
    >
      <hr style={{ border: 0, borderTop: "1px solid var(--color-neutral-300)", margin: "0 auto var(--space-4)", maxWidth: 1560 }} />
      Built with curiosity and care by{" "}
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        style={{
          border: 0,
          padding: 0,
          background: "none",
          cursor: "pointer",
          color: "var(--color-accent-700)",
          textDecoration: "underline",
          textUnderlineOffset: 3,
        }}
      >
        Ozlorien Labs
      </button>
      {open ? <FeedbackDialog onClose={close} /> : null}
    </footer>
  );
}
