"use client";

import { useState } from "react";
import OutputView from "@/src/components/tool/OutputView";

type State = { status: number; ms: number; text: string; json?: unknown } | { error: string } | null;

/** Remote GraphQL: nothing is sent until the user presses Send. */
export default function GqlRemote({ endpoint, payload }: { endpoint: string; payload: string }) {
  const [auth, setAuth] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<State>(null);
  const valid = /^https?:\/\/\S+$/i.test(endpoint.trim());

  async function send() {
    setBusy(true);
    setRes(null);
    const t0 = performance.now();
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/graphql-response+json, application/json" };
      if (auth.trim()) headers.Authorization = auth.trim();
      const r = await fetch(endpoint.trim(), { method: "POST", headers, body: payload });
      const text = await r.text();
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        json = undefined;
      }
      setRes({ status: r.status, ms: performance.now() - t0, text, json });
    } catch {
      setRes({ error: `The browser could not reach ${endpoint}. Usually the server does not allow cross-origin requests (CORS) from this page, you are offline, or the URL is wrong. Try the same request with curl, or switch back to Local mock.` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12, padding: 14 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <button type="button" className="btn btn-primary" disabled={!valid || busy} onClick={send}>
          {busy ? "Sending…" : "Send to endpoint"}
        </button>
        <span className="mono" style={{ fontSize: 12.5, color: valid ? "var(--color-neutral-700)" : "var(--color-accent-2-700)", wordBreak: "break-all" }}>
          {valid ? `POST ${endpoint}` : "Type an http(s) endpoint in the Endpoint option above."}
        </span>
      </div>
      <label style={{ display: "grid", gap: 4, fontSize: 13, color: "var(--color-neutral-700)" }}>
        Authorization header (optional)
        <input className="inp mono" value={auth} onChange={(e) => setAuth(e.target.value)} placeholder="Bearer …" autoComplete="off" />
      </label>
      {res && "error" in res && (
        <div className="errband" style={{ borderRadius: "var(--radius-md)" }}>
          <span style={{ fontSize: 13.5, color: "var(--color-accent-2-700)", lineHeight: 1.5 }}>{res.error}</span>
        </div>
      )}
      {res && "status" in res && (
        <div className="g2" style={{ borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
          <div className="pane-head">
            <span className="mono" style={{ fontWeight: 600, color: res.status < 300 ? "oklch(48% .12 150)" : "var(--color-accent-2-700)" }}>{res.status}</span>
            <span className="mono" style={{ fontSize: 12, color: "var(--color-neutral-600)" }}>{Math.round(res.ms)} ms · {res.text.length.toLocaleString()} chars</span>
          </div>
          <div style={{ maxHeight: 480, overflow: "auto" }} className="scroll">
            <OutputView out={res.json !== undefined ? { kind: "tree", value: res.json } : { kind: "text", text: res.text }} fontSize={13} />
          </div>
        </div>
      )}
      <p style={{ margin: 0, fontSize: 13, color: "var(--color-neutral-600)" }}>The request goes straight from your browser to the endpoint; nothing passes through this site.</p>
    </div>
  );
}
