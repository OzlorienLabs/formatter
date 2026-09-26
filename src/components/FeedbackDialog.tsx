"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ToolIcon from "./ToolIcon";
import {
  MAX_MESSAGE_LENGTH,
  submitFeedback,
  validateFeedback,
  type FeedbackDraft,
  type FeedbackIssues,
} from "@/src/lib/feedback";

type Phase = "editing" | "sending" | "sent";

const field: React.CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  border: "1px solid var(--color-neutral-300)",
  borderRadius: "var(--radius-md)",
  background: "#fff",
  fontSize: 15,
  lineHeight: 1.45,
};
const errorText: React.CSSProperties = { fontSize: 13, color: "var(--color-accent-2-700)" };

/**
 * The Ozlorien Labs contact sheet, opened from the footer. It is the only thing in
 * the app that sends anything anywhere, and the copy says so.
 */
export default function FeedbackDialog({ onClose }: { onClose: () => void }) {
  const [draft, setDraft] = useState<FeedbackDraft>({ message: "", email: "" });
  const [phase, setPhase] = useState<Phase>("editing");
  const [issues, setIssues] = useState<FeedbackIssues>({});
  const [failure, setFailure] = useState<string>();
  const [honeypot, setHoneypot] = useState("");
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const doneRef = useRef<HTMLButtonElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);
  const id = useId();

  useEffect(() => {
    restoreTo.current = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => messageRef.current?.focus(), 0);
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      restoreTo.current?.focus?.();
    };
  }, [onClose]);

  // The thank-you replaces the form, so focus has to follow it.
  useEffect(() => {
    if (phase === "sent") doneRef.current?.focus();
  }, [phase]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (phase === "sending") return;
    const found = validateFeedback(draft);
    setIssues(found);
    setFailure(undefined);
    if (found.message) return messageRef.current?.focus();
    if (found.email) return;
    // A filled honeypot is a bot; behave exactly as if it went through.
    if (honeypot.trim()) return setPhase("sent");

    setPhase("sending");
    const result = await submitFeedback(draft);
    if (result.status === "sent") return setPhase("sent");
    setPhase("editing");
    if (result.status === "invalid") setIssues(result.issues);
    else setFailure(result.message);
  }

  const sending = phase === "sending";

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 80, display: "grid", placeItems: "center", padding: 16 }}>
      <div className="fi" onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(32,30,29,.28)" }} />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        className="g pop scroll"
        style={{
          position: "relative",
          width: "min(100%, 540px)",
          maxHeight: "min(88vh, 720px)",
          overflowY: "auto",
          padding: "clamp(18px,3vw,26px)",
          borderRadius: "var(--radius-lg)",
          background: "var(--color-surface)",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: "var(--space-4)" }}>
          <div style={{ flex: 1 }}>
            <div className="lbl">Ozlorien Labs</div>
            <h2 id={`${id}-title`} style={{ margin: "4px 0 0", fontSize: 24, letterSpacing: "-.02em" }}>
              {phase === "sent" ? "Thank you for reaching out" : "Tell us what you think"}
            </h2>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close">
            <ToolIcon name="x" size={19} />
          </button>
        </div>

        {phase === "sent" ? (
          <div style={{ display: "grid", gap: "var(--space-4)" }}>
            <p style={{ margin: 0, fontSize: 16, lineHeight: 1.55, color: "var(--color-neutral-800)" }}>
              Your note is on its way to Ozlorien Labs. If you left an email address we will write back; otherwise,
              thank you for taking the time.
            </p>
            <div>
              <button ref={doneRef} type="button" className="btn btn-primary" onClick={onClose}>
                Back to the tools
              </button>
            </div>
          </div>
        ) : (
          <form noValidate onSubmit={send} style={{ display: "grid", gap: "var(--space-4)" }}>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: "var(--color-neutral-700)" }}>
              Share feedback on Formatter, or ask us for a deep dive on a stock. This form is the one thing on the site
              that sends anything — nothing else you do here leaves your browser.
            </p>

            <div style={{ display: "grid", gap: 6 }}>
              <label htmlFor={`${id}-message`} style={{ fontSize: 15 }}>
                What is on your mind?
              </label>
              <textarea
                ref={messageRef}
                id={`${id}-message`}
                rows={6}
                maxLength={MAX_MESSAGE_LENGTH}
                required
                value={draft.message}
                disabled={sending}
                aria-invalid={issues.message ? true : undefined}
                aria-describedby={issues.message ? `${id}-message-error` : undefined}
                placeholder="A bug, an idea, a tool you wish existed, or the ticker you would like us to dig into…"
                onChange={(e) => {
                  setDraft((d) => ({ ...d, message: e.target.value }));
                  setIssues((i) => ({ ...i, message: undefined }));
                }}
                style={{ ...field, resize: "vertical" }}
              />
              {issues.message ? (
                <span id={`${id}-message-error`} role="alert" style={errorText}>
                  {issues.message}
                </span>
              ) : (
                <span style={{ fontSize: 13, color: "var(--color-neutral-600)" }}>
                  {(MAX_MESSAGE_LENGTH - draft.message.length).toLocaleString("en-US")} characters left
                </span>
              )}
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <label htmlFor={`${id}-email`} style={{ fontSize: 15 }}>
                Email{" "}
                <span style={{ color: "var(--color-neutral-600)", fontSize: 14 }}>
                  (optional, only if you want a reply)
                </span>
              </label>
              <input
                id={`${id}-email`}
                type="email"
                autoComplete="email"
                value={draft.email}
                disabled={sending}
                aria-invalid={issues.email ? true : undefined}
                aria-describedby={issues.email ? `${id}-email-error` : undefined}
                placeholder="you@example.com"
                onChange={(e) => {
                  setDraft((d) => ({ ...d, email: e.target.value }));
                  setIssues((i) => ({ ...i, email: undefined }));
                }}
                style={field}
              />
              {issues.email ? (
                <span id={`${id}-email-error`} role="alert" style={errorText}>
                  {issues.email}
                </span>
              ) : null}
            </div>

            {/* Honeypot: off-screen and hidden from assistive tech, so only bots fill it. */}
            <div aria-hidden="true" style={{ position: "absolute", left: -10000, width: 1, height: 1, overflow: "hidden" }}>
              <label htmlFor={`${id}-company`}>Company</label>
              <input
                id={`${id}-company`}
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
              />
            </div>

            {failure ? (
              <p role="alert" style={{ ...errorText, margin: 0, fontSize: 14 }}>
                {failure}
              </p>
            ) : null}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)", flexWrap: "wrap" }}>
              <button type="button" className="btn" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={sending}>
                {sending ? "Sending…" : "Send to Ozlorien Labs"}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>,
    document.body
  );
}
