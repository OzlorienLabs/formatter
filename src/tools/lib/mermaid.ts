/**
 * Renders Mermaid to an SVG string, lazily loading mermaid (bundled, no CDN).
 * Shared by the Mermaid, PlantUML, DDL → ER and Actions explainer tools.
 */
import { ToolError } from "../types";

type MermaidApi = typeof import("mermaid").default;
let mermaidP: Promise<MermaidApi> | null = null;
let seq = 0;
let lastConfig = "";

export type MermaidOptions = {
  theme?: "default" | "neutral" | "dark" | "forest" | "base";
  look?: "classic" | "handDrawn";
  fontFamily?: string;
};

async function api(): Promise<MermaidApi> {
  if (!mermaidP) {
    mermaidP = import("mermaid").then((m) => m.default);
    mermaidP.catch(() => (mermaidP = null));
  }
  return mermaidP;
}

/** Throws ToolError with Mermaid's parse message on invalid input. */
export async function renderMermaid(code: string, o: MermaidOptions = {}): Promise<string> {
  if (typeof document === "undefined" || typeof (globalThis as { SVGElement?: unknown }).SVGElement === "undefined") {
    throw new ToolError("Diagram rendering needs a browser.");
  }
  const m = await api();
  const cfg = JSON.stringify(o);
  if (cfg !== lastConfig) {
    m.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: o.theme ?? "default",
      look: o.look ?? "classic",
      fontFamily: o.fontFamily ?? "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      flowchart: { htmlLabels: true },
    } as Parameters<MermaidApi["initialize"]>[0]);
    lastConfig = cfg;
  }
  const id = `mmd-${Date.now().toString(36)}-${seq++}`;
  try {
    const { svg } = await m.render(id, code);
    return svg;
  } catch (e) {
    // Mermaid leaves an error element behind in the body; remove it.
    document.getElementById(`d${id}`)?.remove();
    document.getElementById(id)?.remove();
    const msg = (e as Error)?.message ?? String(e);
    throw new ToolError(msg.replace(/^Error: /, ""));
  }
}

/** Parse only — cheap validation without layout. Returns null when valid, else the message. */
export async function checkMermaid(code: string): Promise<string | null> {
  try {
    const m = await api();
    await m.parse(code);
    return null;
  } catch (e) {
    return (e as Error)?.message ?? String(e);
  }
}
