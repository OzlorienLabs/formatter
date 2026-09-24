"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ToolIcon from "@/src/components/ToolIcon";
import type { CustomProps } from "@/src/tools/types";
import { FORM_FIELDS, QR_TYPES, composePayload, parsePayload, type QrForm, type QrType } from "@/src/tools/lib/G-qr";
import GOut, { Field, Sec, G_CSS } from "./G-Out";

const CSS = `
.g-qr-types { display: flex; flex-wrap: wrap; gap: 6px; }
.g-qr-types button { display: inline-flex; align-items: center; gap: 6px; }
.g-qr-payload { margin: 0; padding: 10px 12px; border-radius: var(--radius-md); background: rgba(32,30,29,.045); border: 1px solid rgba(32,30,29,.08); font-family: var(--font-mono); font-size: 12.5px; line-height: 1.55; white-space: pre-wrap; word-break: break-all; max-height: 180px; overflow: auto; }
.g-qr-drop { display: grid; place-items: center; gap: 8px; min-height: 220px; padding: 20px; border: 2px dashed rgba(32,30,29,.18); border-radius: var(--radius-lg); text-align: center; cursor: pointer; background: rgba(255,255,255,.35); }
.g-qr-drop.on { border-color: var(--color-accent-500); background: rgba(0,136,176,.06); }
.g-qr-drop img { max-width: 100%; max-height: 260px; border-radius: 6px; }
.g-qr .g-split > .pane { min-height: 560px; }
`;

const TYPE_ICON: Record<QrType, string> = { url: "link", text: "text-aa", wifi: "globe", vcard: "identification-card", email: "paper-plane-tilt", sms: "quotes", phone: "hash-straight", geo: "globe-hemisphere-west", event: "calendar-dots" };

export default function QrStudio({ inputs, opts, setInput, setOpt, result, error, mono, record }: CustomProps) {
  const read = opts.mode === "read";
  const form: QrForm = useMemo(() => {
    try {
      const v = JSON.parse(inputs.form || "");
      if (v && typeof v === "object" && v.type) return { type: v.type, f: v.f ?? {} };
    } catch {
      /* derive from the payload below */
    }
    const p = parsePayload(inputs.text || "");
    return { type: p.qrType, f: p.form ?? { text: inputs.text || "" } };
  }, [inputs.form, inputs.text]);

  const apply = (next: QrForm) => {
    setInput("form", JSON.stringify(next));
    setInput("text", composePayload(next));
  };
  const setField = (id: string, v: string) => apply({ type: form.type, f: { ...form.f, [id]: v } });
  const switchType = (type: QrType) => {
    // carry the text across when switching between URL and Text
    const f = type === "url" || type === "text" ? { text: form.type === "url" || form.type === "text" ? form.f.text ?? inputs.text : type === "url" ? "https://" : "" } : form.type === type ? form.f : defaultsFor(type);
    apply({ type, f });
  };

  const payload = inputs.text ?? "";
  const bytes = new TextEncoder().encode(payload).length;

  return (
    <div className="g-qr">
      <style>{G_CSS + CSS}</style>
      <div className="g-split">
        {read ? (
          <ReadPane inputs={inputs} setInput={setInput} result={result} onLoad={(text) => {
            const p = parsePayload(text);
            setInput("form", JSON.stringify({ type: p.qrType, f: p.form ?? { text } }));
            setInput("text", text);
            setOpt("mode", "generate");
          }} />
        ) : (
          <section className="g pane" aria-label="QR content">
            <div className="pane-head">
              <span className="lbl">Content</span>
              <div style={{ flex: 1 }} />
              <span className="mono" style={{ fontSize: 11.5, color: "var(--color-neutral-600)" }}>{bytes.toLocaleString()} bytes</span>
            </div>
            <div className="g-form">
              <div className="g-qr-types chips" role="group" aria-label="Content type">
                {QR_TYPES.map(([id, label]) => (
                  <button key={id} type="button" className="chip" aria-pressed={form.type === id} onClick={() => switchType(id)}>
                    <ToolIcon name={TYPE_ICON[id]} size={14} /> {label}
                  </button>
                ))}
              </div>
              {form.type === "url" || form.type === "text" ? (
                <Field label={form.type === "url" ? "URL" : "Text"}>
                  {form.type === "url" ? (
                    <input className="inp mono" value={form.f.text ?? payload} onChange={(e) => setField("text", e.target.value)} placeholder="https://example.com" spellCheck={false} style={{ fontSize: 14 }} />
                  ) : (
                    <textarea className="inp" rows={6} value={form.f.text ?? payload} onChange={(e) => setField("text", e.target.value)} placeholder="Any text — up to ~2,900 bytes" />
                  )}
                </Field>
              ) : (
                <div className="grid-form">
                  {FORM_FIELDS[form.type].map((fd) => (
                    <Field key={fd.id} label={fd.label} wide={fd.wide}>
                      {fd.kind === "select" ? (
                        <select className="sel" value={form.f[fd.id] || fd.choices![0][0]} onChange={(e) => setField(fd.id, e.target.value)}>
                          {fd.choices!.map(([v, l]) => (
                            <option key={v} value={v}>{l}</option>
                          ))}
                        </select>
                      ) : fd.kind === "check" ? (
                        <span className="tog" style={{ paddingTop: 6 }}>
                          <input type="checkbox" checked={form.f[fd.id] === "true"} onChange={(e) => setField(fd.id, e.target.checked ? "true" : "")} aria-label={fd.label} /> {form.f[fd.id] === "true" ? "Yes" : "No"}
                        </span>
                      ) : fd.kind === "area" ? (
                        <textarea className="inp" rows={3} value={form.f[fd.id] ?? ""} onChange={(e) => setField(fd.id, e.target.value)} />
                      ) : (
                        <input
                          className="inp"
                          type={fd.kind === "datetime-local" ? (form.f.allday === "true" ? "date" : "datetime-local") : fd.id === "password" ? "text" : "text"}
                          value={fd.kind === "datetime-local" && form.f.allday === "true" ? (form.f[fd.id] ?? "").slice(0, 10) : form.f[fd.id] ?? ""}
                          placeholder={fd.ph}
                          onChange={(e) => setField(fd.id, e.target.value)}
                          spellCheck={false}
                          autoComplete="off"
                        />
                      )}
                    </Field>
                  ))}
                </div>
              )}
              <Sec title="Encoded payload" right={<button type="button" className="btn-icon" onClick={() => { navigator.clipboard?.writeText(payload).catch(() => {}); record(payload); }} title="Copy the raw payload">copy</button>}>
                <pre className="g-qr-payload" aria-label="Payload">{payload || "—"}</pre>
                <p className="g-hint">
                  {form.type === "wifi" && "Special characters ; , : \\ \" in the name or password are escaped with a backslash."}
                  {form.type === "vcard" && "vCard 3.0 — understood by iOS and Android camera apps."}
                  {form.type === "event" && "An iCalendar VEVENT. Tick “Times are UTC” to append Z; otherwise the phone's local time is used."}
                  {form.type === "email" && "mailto: is the most widely supported; MATMSG is an older Docomo format."}
                  {form.type === "sms" && "SMSTO: works on most Android and iOS scanners."}
                  {form.type === "geo" && "geo: URIs open the default maps app."}
                  {form.type === "phone" && "tel: numbers work best in international format (+44…)."}
                  {(form.type === "url" || form.type === "text") && "Shorter payloads make smaller, easier-to-scan codes."}
                </p>
              </Sec>
            </div>
          </section>
        )}
        <GOut result={result} error={error} mono={mono} onCopy={record} filename="qr-code.png" label="QR code" className="g-sticky" minHeight={560} />
      </div>
    </div>
  );
}

function defaultsFor(type: QrType): Record<string, string> {
  switch (type) {
    case "wifi": return { ssid: "", password: "", auth: "WPA", hidden: "" };
    case "email": return { to: "", subject: "", body: "", style: "mailto" };
    case "sms": return { number: "", message: "", style: "smsto" };
    case "event": {
      const d = new Date(Date.now() + 7 * 864e5);
      const day = d.toISOString().slice(0, 10);
      return { summary: "", start: `${day}T09:00`, end: `${day}T10:00`, location: "", description: "" };
    }
    default: return {};
  }
}

function ReadPane({ inputs, setInput, result, onLoad }: { inputs: CustomProps["inputs"]; setInput: CustomProps["setInput"]; result: CustomProps["result"]; onLoad: (text: string) => void }) {
  const [drag, setDrag] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const take = (f: File | null | undefined) => {
    if (!f || !f.type.startsWith("image/")) return;
    const r = new FileReader();
    r.onload = () => {
      setInput("image:name", f.name);
      setInput("image", String(r.result));
    };
    r.readAsDataURL(f);
  };
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith("image/"));
      if (item) take(item.getAsFile());
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const decoded = inputs.image && result?.text && !result.text.startsWith("<svg") ? result.text : "";
  return (
    <section className="g pane" aria-label="Read a QR code">
      <div className="pane-head">
        <span className="lbl">Read QR</span>
        <div style={{ flex: 1 }} />
        {inputs.image && (
          <button type="button" className="btn-icon" onClick={() => { setInput("image", ""); setInput("image:name", ""); }}>
            <ToolIcon name="trash" size={15} /> Clear
          </button>
        )}
      </div>
      <div className="g-form">
        <div
          className={`g-qr-drop${drag ? " on" : ""}`}
          role="button"
          tabIndex={0}
          onClick={() => file.current?.click()}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && file.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); take(e.dataTransfer.files?.[0]); }}
        >
          {inputs.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={inputs.image} alt={inputs["image:name"] || "Uploaded image"} />
          ) : (
            <>
              <ToolIcon name="qr-code" size={40} color="var(--color-accent-700)" />
              <strong style={{ fontSize: 15 }}>Drop an image, click to choose, or paste (Ctrl/⌘+V)</strong>
              <span className="g-hint">Screenshots and photos work. The image never leaves this page.</span>
            </>
          )}
          <input ref={file} type="file" accept="image/*" hidden onChange={(e) => take(e.target.files?.[0])} />
        </div>
        {inputs["image:name"] && <span className="g-hint mono">{inputs["image:name"]}</span>}
        {decoded && (
          <div className="g-row">
            <button type="button" className="btn btn-primary" onClick={() => onLoad(decoded)}>
              <ToolIcon name="arrow-u-down-left" size={15} color="#fff" /> Edit in generator
            </button>
            <span className="g-hint">Loads the decoded {parsePayload(decoded).type.toLowerCase()} into the form.</span>
          </div>
        )}
      </div>
    </section>
  );
}
