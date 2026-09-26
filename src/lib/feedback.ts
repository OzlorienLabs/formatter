/**
 * The one part of Formatter that sends anything: the footer's note to Ozlorien Labs.
 *
 * The browser only ever talks to this app's own `/api/feedback` route, which relays
 * the note onward through Resend. The route validates again with the same rules,
 * because a client check is a convenience and never a guarantee.
 */

export const FEEDBACK_ENDPOINT = "/api/feedback";
export const MAX_MESSAGE_LENGTH = 4000;
export const MAX_EMAIL_LENGTH = 254;

/** Deliberately loose: the goal is catching typos, not policing addresses. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface FeedbackDraft {
  message: string;
  /** Optional — supplied only if the visitor wants a reply. */
  email: string;
}

export interface FeedbackIssues {
  message?: string;
  email?: string;
}

export type FeedbackResult =
  | { status: "sent" }
  | { status: "invalid"; issues: FeedbackIssues }
  | { status: "failed"; message: string };

export function validateFeedback(draft: FeedbackDraft): FeedbackIssues {
  const issues: FeedbackIssues = {};
  const message = draft.message.trim();
  const email = draft.email.trim();

  if (!message) issues.message = "Add a note before sending.";
  else if (message.length > MAX_MESSAGE_LENGTH)
    issues.message = `Keep it under ${MAX_MESSAGE_LENGTH.toLocaleString("en-US")} characters.`;

  if (email && (email.length > MAX_EMAIL_LENGTH || !EMAIL_SHAPE.test(email)))
    issues.email = "That email address does not look right.";

  return issues;
}

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body?.error === "string" && body.error.trim()) return body.error;
  } catch {
    // A non-JSON error body is not worth surfacing verbatim.
  }
  return "That did not send. Please try again in a moment.";
}

export async function submitFeedback(
  draft: FeedbackDraft,
  fetcher: typeof fetch = globalThis.fetch
): Promise<FeedbackResult> {
  const issues = validateFeedback(draft);
  if (Object.keys(issues).length) return { status: "invalid", issues };

  const email = draft.email.trim();
  try {
    const res = await fetcher(FEEDBACK_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: draft.message.trim(), ...(email ? { email } : {}) }),
    });
    if (!res.ok) return { status: "failed", message: await readErrorMessage(res) };
    return { status: "sent" };
  } catch {
    return { status: "failed", message: "That did not send — check your connection and try again." };
  }
}
