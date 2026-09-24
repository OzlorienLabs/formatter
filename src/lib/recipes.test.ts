// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { RECIPES } from "./recipes";
import { EXAMPLE_WORKSPACES } from "./workspace-examples";
import { runPipeline } from "./pipeline";
import { loadSpec } from "@/src/tools";
import { isPipeable } from "@/src/tools/types";
import { toolBySlug } from "./tools-registry";

describe("recipes", () => {
  it("have unique ids", () => {
    expect(new Set(RECIPES.map((r) => r.id)).size).toBe(RECIPES.length);
  });

  it.each(RECIPES.map((r) => [r.id, r] as const))("%s uses real, chainable tools and options", async (_id, r) => {
    for (const s of r.steps) {
      const spec = await loadSpec(s.slug);
      expect(spec, `${r.id}: unknown tool ${s.slug}`).toBeTruthy();
      expect(isPipeable(spec!), `${r.id}: ${s.slug} is not chainable`).toBe(true);
      const optIds = new Set((spec!.options ?? []).map((o) => o.id));
      for (const k of Object.keys(s.opts ?? {})) expect(optIds.has(k), `${r.id}: ${s.slug} has no option ${k}`).toBe(true);
      const inIds = new Set(spec!.inputs.map((f) => f.id));
      for (const k of Object.keys(s.inputs ?? {})) expect(inIds.has(k), `${r.id}: ${s.slug} has no input ${k}`).toBe(true);
    }
  });

  it.each(RECIPES.filter((r) => !r.steps.some((s) => ["mermaid-playground", "graphviz-editor", "plantuml-lite"].includes(s.slug))).map((r) => [r.id, r] as const))(
    "%s runs end to end",
    async (_id, r) => {
      const out = await runPipeline(r.source, r.steps);
      const failed = out.find((o) => o.status === "error");
      expect(failed?.error, `${r.id} failed at ${failed?.slug}`).toBeUndefined();
      expect(out[out.length - 1].text.length).toBeGreaterThan(0);
      if (process.env.PRINT) console.log(`\n### ${r.id}\n${out[out.length - 1].text.slice(0, Number(process.env.PRINT) || 300)}`);
    },
    60_000
  );
});

describe("example workspaces", () => {
  it.each(EXAMPLE_WORKSPACES.flatMap((w) => w.items.map((i) => [`${w.name} / ${i.label}`, i] as const)))("%s restores a real tool state", async (_n, item) => {
    expect(toolBySlug(item.slug)).toBeTruthy();
    const spec = await loadSpec(item.slug);
    expect(spec).toBeTruthy();
    const inIds = new Set(spec!.inputs.map((f) => f.id));
    for (const k of Object.keys(item.inputs)) expect(inIds.has(k.split(":")[0]), `${item.slug} has no input ${k}`).toBe(true);
    const optIds = new Set((spec!.options ?? []).map((o) => o.id));
    for (const k of Object.keys(item.opts)) expect(optIds.has(k), `${item.slug} has no option ${k}`).toBe(true);
  });
});
