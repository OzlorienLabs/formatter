import { defaultOpts, normalise, ToolError, type Inputs, type Opts, type Result, type ToolSpec } from "./types";

/** Runs a spec with defaults filled in. Shared by the tool shell, pipelines and tests. */
export async function runSpec(spec: ToolSpec, inputs: Inputs, opts: Opts, pipeline = false): Promise<Result> {
  if (!spec.run) throw new ToolError("This tool is interactive and has no batch transform.");
  const full: Inputs = {};
  for (const f of spec.inputs) full[f.id] = inputs[f.id] ?? "";
  for (const [k, v] of Object.entries(inputs)) if (!(k in full)) full[k] = v;
  const r = await spec.run({ inputs: full, opts: { ...defaultOpts(spec), ...opts }, pipeline });
  return normalise(r);
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message || e.name;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return "Could not process that input.";
  }
}
