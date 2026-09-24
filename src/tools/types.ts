/**
 * The tool contract. Every tool in the app is a ToolSpec: a declarative list
 * of inputs and options, a pure-ish `run`, and a set of examples. The shell
 * renders the UI from it, pipelines chain it, history and workspaces store its
 * `inputs` and `opts` — so every tool gets those features for free.
 *
 * Nothing here may make a network request. Heavy libraries are imported
 * lazily inside `run` so a tool page only downloads what it uses.
 */
import type { ComponentType, ReactNode } from "react";

export type Lang =
  | "json" | "xml" | "html" | "css" | "js" | "ts" | "sql" | "yaml" | "toml"
  | "python" | "go" | "rust" | "java" | "markdown" | "shell" | "graphql"
  | "dot" | "mermaid" | "plantuml" | "scad" | "ini" | "regex" | "text";

export type Choice = string | [value: string, label: string];

type OptBase = {
  id: string;
  label: string;
  hint?: string;
  /** Hide the control unless this returns true for the current options. */
  show?: (opts: Opts) => boolean;
};

export type OptionSpec =
  | (OptBase & { type: "select"; choices: Choice[]; default: string })
  | (OptBase & { type: "segment"; choices: Choice[]; default: string })
  | (OptBase & { type: "toggle"; default: boolean })
  | (OptBase & { type: "number"; default: number; min?: number; max?: number; step?: number })
  | (OptBase & { type: "text"; default: string; placeholder?: string; width?: number })
  | (OptBase & { type: "color"; default: string });

export type FieldSpec = {
  id: string;
  label: string;
  /** code = monospace editor (default), text = single line, file = picker/drop zone. */
  kind?: "code" | "text" | "file";
  lang?: Lang;
  placeholder?: string;
  /** Height in rows for secondary code fields. */
  rows?: number;
  /** For file fields. */
  accept?: string;
  /** How a file field delivers its content: text, a data: URL, or bytes (base64 string). */
  read?: "text" | "dataurl" | "base64";
  /** Soft-wrap long lines (prose inputs). */
  wrap?: boolean;
};

export type Inputs = Record<string, string>;
export type Opts = Record<string, string | number | boolean>;

export type Output =
  | { kind: "text"; text: string; lang?: Lang; wrap?: boolean }
  /** Markup built by the tool from sanitised parts. It is sanitised again on render. */
  | { kind: "html"; html: string; css?: string }
  | { kind: "svg"; svg: string; name?: string }
  | { kind: "image"; src: string; name?: string; alt?: string }
  | { kind: "table"; columns: string[]; rows: (string | number | boolean | null)[][]; caption?: string }
  | { kind: "tree"; value: unknown }
  | { kind: "xmltree"; xml: string }
  | { kind: "stats"; items: { label: string; value: string | number; tone?: "ok" | "warn" | "bad" | "info" }[] }
  | { kind: "status"; ok: boolean; title: string; detail?: string }
  | { kind: "issues"; items: { level: "error" | "warning" | "info" | "ok"; message: string; line?: number; col?: number }[] }
  /** A sandboxed iframe (allow-scripts only, opaque origin). */
  | { kind: "frame"; srcdoc: string; height?: number }
  | { kind: "pdf"; src: string }
  | { kind: "diff"; hunks: DiffLine[]; mode: "unified" | "split" }
  | { kind: "react"; node: ReactNode };

export type DiffLine = { t: "ctx" | "add" | "del" | "hunk"; a?: number; b?: number; text: string };

export type View = { label: string; out: Output };

export type Result = {
  /** The primary text: what Copy, Download and the next pipeline step receive. */
  text: string;
  /** Tabs, first shown by default. Without views, `text` is shown as a code view. */
  views?: View[];
  /** Highlight language for the default text view. */
  lang?: Lang;
  /** Download file name, e.g. "data.json". */
  filename?: string;
  /** Binary download instead of `text` (images, PDFs, databases). */
  blob?: Blob;
  /** Non-fatal notes shown above the output. */
  notes?: string[];
};

export type RunCtx = {
  inputs: Inputs;
  opts: Opts;
  /** True when invoked from a pipeline — tools can skip expensive previews. */
  pipeline?: boolean;
};

export type Example = {
  label: string;
  inputs?: Inputs;
  opts?: Partial<Opts>;
  /** One line shown under the example strip explaining what it demonstrates. */
  note?: string;
  /** This example deliberately shows an error (tests expect run to throw or report invalid). */
  error?: boolean;
};

export type CustomProps = {
  spec: ToolSpec;
  slug: string;
  inputs: Inputs;
  opts: Opts;
  setInput: (id: string, v: string) => void;
  setOpt: (id: string, v: string | number | boolean) => void;
  /** Ask the shell to run `spec.run` with the current state. */
  run: () => void;
  result: Result | null;
  error: string;
  /** Record a run in history from a custom UI (e.g. after an explicit action). */
  record: (outText: string) => void;
  mono: number;
};

export type ToolSpec = {
  inputs: FieldSpec[];
  options?: OptionSpec[];
  run?: (ctx: RunCtx) => Result | string | Promise<Result | string>;
  examples: Example[];
  /** Runs without input (Generate button, runs on option change). */
  generator?: boolean;
  /** Run as you type. Default true; false for heavy runtimes. */
  autorun?: boolean;
  /** Can be a pipeline step. Default: true when the first input is code/text and run exists. */
  pipe?: boolean;
  /** Language of the text output, for highlighting. */
  outLang?: Lang;
  /** Replace the split pane with a custom body. Loaded lazily. */
  custom?: () => Promise<{ default: ComponentType<CustomProps> }>;
  /** "stack" puts output under the inputs (wide previews). */
  layout?: "split" | "stack";
  /** Short how-to steps shown under "How to use". */
  steps?: string[];
  tips?: string[];
  /** Label for the primary action, e.g. "Generate", "Execute". */
  action?: string;
  /** Needs a real browser (canvas, WebGL, workers): skip the jsdom example test. */
  skipNodeTest?: boolean;
};

export type SpecModule = Record<string, ToolSpec>;

/* ── helpers used by spec modules ─────────────────────────────────────── */

export const choiceValue = (c: Choice) => (Array.isArray(c) ? c[0] : c);
export const choiceLabel = (c: Choice) => (Array.isArray(c) ? c[1] : c);

export function defaultOpts(spec: ToolSpec): Opts {
  const o: Opts = {};
  for (const opt of spec.options ?? []) o[opt.id] = opt.default;
  return o;
}

export function emptyInputs(spec: ToolSpec): Inputs {
  const i: Inputs = {};
  for (const f of spec.inputs) i[f.id] = "";
  return i;
}

export function normalise(r: Result | string): Result {
  return typeof r === "string" ? { text: r } : r;
}

export function isPipeable(spec: ToolSpec): boolean {
  if (!spec.run) return false;
  if (spec.pipe !== undefined) return spec.pipe;
  if (spec.generator && spec.inputs.length === 0) return true;
  const first = spec.inputs[0];
  return !!first && (first.kind ?? "code") !== "file";
}

/** Throw this for user-facing input errors; the message is shown verbatim. */
export class ToolError extends Error {}

export const str = (v: unknown, d = "") => (v == null ? d : String(v));
export const num = (v: unknown, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
export const bool = (v: unknown) => v === true || v === "true";
