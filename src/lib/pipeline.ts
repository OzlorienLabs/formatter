/**
 * The pipeline engine. A step receives the previous step's `Result.text` as
 * its primary input; its secondary inputs and options come from the step.
 * Everything runs in this tab, in order.
 */
import { loadCategory, loadSpec } from "@/src/tools";
import { runSpec, errorMessage } from "@/src/tools/runner";
import { isPipeable, type Result, type ToolSpec } from "@/src/tools/types";
import { CATEGORIES, TOOLS, categoryOfTool, type ToolMeta } from "./tools-registry";
import type { PipelineStep } from "./collections";

export type StepOutcome = {
  index: number;
  slug: string;
  status: "ok" | "error" | "skipped";
  text: string;
  result?: Result;
  error?: string;
  ms: number;
};

export const PLATFORM_SLUGS = new Set(["tool-pipelines", "saved-workspaces", "developer-recipes"]);

export async function runStep(spec: ToolSpec, step: PipelineStep, input: string): Promise<Result> {
  const primary = spec.inputs[0];
  const inputs: Record<string, string> = { ...(step.inputs ?? {}) };
  if (primary && !(spec.generator && spec.inputs.length === 0)) inputs[primary.id] = input;
  return runSpec(spec, inputs, step.opts ?? {}, true);
}

/**
 * Runs the chain. `onStep` fires after each step so the UI can stream
 * progress. Stops at the first error unless `continueOnError`.
 */
export async function runPipeline(
  source: string,
  steps: PipelineStep[],
  onStep?: (o: StepOutcome) => void,
  { continueOnError = false, upTo }: { continueOnError?: boolean; upTo?: number } = {}
): Promise<StepOutcome[]> {
  const out: StepOutcome[] = [];
  let value = source;
  const last = upTo ?? steps.length - 1;
  for (let i = 0; i <= last && i < steps.length; i++) {
    const step = steps[i];
    const t0 = performance.now();
    if (step.off) {
      const o: StepOutcome = { index: i, slug: step.slug, status: "skipped", text: value, ms: 0 };
      out.push(o);
      onStep?.(o);
      continue;
    }
    try {
      const spec = await loadSpec(step.slug);
      if (!spec) throw new Error(`Unknown tool “${step.slug}”`);
      if (!isPipeable(spec)) throw new Error("This tool can't be used as a pipeline step");
      const result = await runStep(spec, step, value);
      value = result.text;
      const o: StepOutcome = { index: i, slug: step.slug, status: "ok", text: value, result, ms: performance.now() - t0 };
      out.push(o);
      onStep?.(o);
    } catch (e) {
      const o: StepOutcome = { index: i, slug: step.slug, status: "error", text: value, error: errorMessage(e), ms: performance.now() - t0 };
      out.push(o);
      onStep?.(o);
      if (!continueOnError) break;
    }
  }
  return out;
}

export type PipeableTool = { meta: ToolMeta; spec: ToolSpec };

let catalogP: Promise<PipeableTool[]> | null = null;

/** Every tool that can be a step, in category order. Loads every category module once. */
export function pipeableCatalog(): Promise<PipeableTool[]> {
  if (!catalogP) {
    catalogP = Promise.all(CATEGORIES.map((c) => loadCategory(c.slug).then((m) => [c.slug, m] as const))).then((mods) => {
      const bySlug = new Map(mods);
      const list: PipeableTool[] = [];
      for (const meta of TOOLS) {
        if (PLATFORM_SLUGS.has(meta.slug)) continue;
        const spec = bySlug.get(categoryOfTool(meta).slug)?.[meta.slug];
        if (spec && isPipeable(spec)) list.push({ meta, spec });
      }
      return list;
    });
    catalogP.catch(() => (catalogP = null));
  }
  return catalogP;
}
