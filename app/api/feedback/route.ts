/**
 * Relays a note from the footer's feedback modal to Ozlorien Labs via Resend.
 *
 * Same origin as the app, so the browser never talks to a third party, and the
 * Resend credential stays on the server.
 *
 *   RESEND_API_KEY   a Resend API key (required)
 *   FEEDBACK_TO      destination address (defaults to ozlorienlabs@gmail.com)
 *   FEEDBACK_FROM    verified sender (defaults to Resend's shared test sender)
 */
import { validateFeedback } from "@/src/lib/feedback";

export const dynamic = "force-dynamic";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_TO = "ozlorienlabs@gmail.com";
const DEFAULT_FROM = "Formatter <onboarding@resend.dev>";

function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

export async function POST(request: Request): Promise<Response> {
  let payload: { message?: unknown; email?: unknown; company?: unknown };
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Send a JSON body." }, 400);
  }

  // Honeypot: accept and drop quietly, so a bot gets no signal about why.
  if (typeof payload.company === "string" && payload.company.trim()) return json({ ok: true }, 202);

  const message = typeof payload.message === "string" ? payload.message.trim() : "";
  const email = typeof payload.email === "string" ? payload.email.trim() : "";
  const issues = validateFeedback({ message, email });
  if (issues.message || issues.email) return json({ error: issues.message ?? issues.email }, 400);

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return json({ error: "Feedback is not configured on this deployment yet." }, 503);

  let res: Response;
  try {
    res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: process.env.FEEDBACK_FROM || DEFAULT_FROM,
        to: [process.env.FEEDBACK_TO || DEFAULT_TO],
        subject: email ? `Formatter feedback from ${email}` : "Formatter feedback",
        ...(email ? { reply_to: email } : {}),
        text: [message, "", "---", `Reply to: ${email || "not supplied"}`, "Sent from the Formatter footer."].join("\n"),
        html: [
          `<p style="white-space:pre-wrap">${escapeHtml(message)}</p>`,
          "<hr />",
          `<p><strong>Reply to:</strong> ${escapeHtml(email || "not supplied")}</p>`,
          "<p>Sent from the Formatter footer.</p>",
        ].join(""),
      }),
    });
  } catch {
    return json({ error: "The mail service is unreachable right now." }, 502);
  }

  if (!res.ok) return json({ error: "The mail service refused that message." }, 502);
  return json({ ok: true }, 202);
}
