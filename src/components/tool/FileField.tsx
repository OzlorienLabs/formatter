"use client";

import { useRef, useState } from "react";
import ToolIcon from "../ToolIcon";
import type { FieldSpec } from "@/src/tools/types";

export function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export async function readFile(f: File, how: FieldSpec["read"] = "text"): Promise<string> {
  if (how === "text") return f.text();
  if (how === "dataurl")
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = () => rej(r.error);
      r.readAsDataURL(f);
    });
  const buf = new Uint8Array(await f.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** A drop zone plus picker. The file's content lands in `value`; its name in `onName`. */
export default function FileField({
  field,
  value,
  name,
  onChange,
}: {
  field: FieldSpec;
  value: string;
  name?: string;
  onChange: (v: string, name: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);

  async function take(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    try {
      onChange(await readFile(f, field.read), `${f.name} · ${fmtBytes(f.size)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); void take(e.dataTransfer.files?.[0]); }}
      onPaste={(e) => {
        const f = e.clipboardData.files?.[0];
        if (f) { e.preventDefault(); void take(f); }
      }}
      tabIndex={0}
      style={{
        margin: 12,
        padding: "18px 16px",
        border: `1.5px dashed ${drag ? "var(--color-accent-500)" : "rgba(32,30,29,.22)"}`,
        borderRadius: "var(--radius-lg)",
        background: drag ? "rgba(0,136,176,.06)" : "rgba(255,255,255,.3)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <ToolIcon name="upload-simple" size={22} color="var(--color-accent-700)" />
      <div style={{ flex: 1, minWidth: 160 }}>
        <div style={{ fontSize: 14.5 }}>{busy ? "Reading…" : value ? name || "File loaded" : field.placeholder || "Drop a file here, paste one, or browse"}</div>
        <div style={{ fontSize: 12.5, color: "var(--color-neutral-600)" }}>Read locally — the file never leaves this tab.</div>
      </div>
      <button type="button" className="btn btn-sm" onClick={() => input.current?.click()}>Browse…</button>
      {value && (
        <button type="button" className="btn btn-sm btn-danger" onClick={() => onChange("", "")}>Remove</button>
      )}
      <input
        ref={input}
        type="file"
        accept={field.accept}
        hidden
        aria-label={field.label}
        data-testid={`file-${field.id}`}
        onChange={(e) => { void take(e.target.files?.[0]); e.target.value = ""; }}
      />
    </div>
  );
}
