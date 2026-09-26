import { afterEach, describe, expect, it, vi } from "vitest";
import { submitFeedback, validateFeedback, MAX_MESSAGE_LENGTH } from "./feedback";
import { POST } from "@/app/api/feedback/route";

const post = (body: unknown) =>
  POST(new Request("http://x/api/feedback", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));

describe("validateFeedback", () => {
  it("requires a message and a plausible optional email", () => {
    expect(validateFeedback({ message: "  ", email: "" }).message).toBeTruthy();
    expect(validateFeedback({ message: "x".repeat(MAX_MESSAGE_LENGTH + 1), email: "" }).message).toBeTruthy();
    expect(validateFeedback({ message: "hi", email: "nope" }).email).toBeTruthy();
    expect(validateFeedback({ message: "hi", email: "" })).toEqual({});
    expect(validateFeedback({ message: "hi", email: "a@b.co" })).toEqual({});
  });
});

describe("submitFeedback", () => {
  it("posts the trimmed note to the same-origin route and omits a blank email", async () => {
    const fetcher = vi.fn(async () => new Response("{}", { status: 202 }));
    expect(await submitFeedback({ message: " hello ", email: " " }, fetcher)).toEqual({ status: "sent" });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/feedback");
    expect(JSON.parse(init.body as string)).toEqual({ message: "hello" });
  });

  it("surfaces the server's error and network failures", async () => {
    const refused = vi.fn(async () => new Response(JSON.stringify({ error: "nope" }), { status: 503 }));
    expect(await submitFeedback({ message: "hi", email: "" }, refused)).toEqual({ status: "failed", message: "nope" });
    const offline = vi.fn(async () => { throw new TypeError("offline"); });
    expect((await submitFeedback({ message: "hi", email: "" }, offline)).status).toBe("failed");
  });

  it("never calls the network for an invalid draft", async () => {
    const fetcher = vi.fn();
    expect((await submitFeedback({ message: "", email: "" }, fetcher)).status).toBe("invalid");
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("POST /api/feedback", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("rejects bad input before touching Resend", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubEnv("RESEND_API_KEY", "re_test");
    expect((await post("not json")).status).toBe(400);
    expect((await post({ message: "" })).status).toBe(400);
    expect((await post({ message: "hi", email: "bad" })).status).toBe(400);
    expect((await post({ message: "hi", company: "bot inc" })).status).toBe(202);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("answers 503 when Resend is not configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    expect((await post({ message: "hi" })).status).toBe(503);
  });

  it("sends to ozlorienlabs@gmail.com with the visitor as reply_to, HTML-escaped", async () => {
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("FEEDBACK_TO", "");
    const res = await post({ message: "<b>deep dive on NVDA</b>", email: "me@example.com" });
    expect(res.status).toBe(202);
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer re_test");
    const sent = JSON.parse(init.body as string);
    expect(sent.to).toEqual(["ozlorienlabs@gmail.com"]);
    expect(sent.reply_to).toBe("me@example.com");
    expect(sent.html).toContain("&lt;b&gt;deep dive on NVDA&lt;/b&gt;");
  });

  it("reports a Resend refusal as 502", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 422 })));
    vi.stubEnv("RESEND_API_KEY", "re_test");
    expect((await post({ message: "hi" })).status).toBe(502);
  });
});
