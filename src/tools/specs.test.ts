// @vitest-environment jsdom
/**
 * Runs every example of every tool through its spec. An example either
 * produces output or, when flagged `error`, throws a readable error.
 */
import { describe, it, expect } from "vitest";
import { TOOLS, categoryOfTool } from "@/src/lib/tools-registry";
import { loadCategory } from "./index";
import { runSpec } from "./runner";
import { defaultOpts, type Opts } from "./types";

const PLATFORM = new Set(["tool-pipelines", "saved-workspaces", "developer-recipes"]);
const ONLY = process.env.TOOLS_ONLY?.split(",").filter(Boolean);

describe.each(TOOLS.filter((t) => !PLATFORM.has(t.slug) && (!ONLY || ONLY.some((c) => categoryOfTool(t).slug === c || t.slug === c))).map((t) => [t.slug, t] as const))(
  "%s",
  (slug, tool) => {
    it("has a spec with at least three examples", async () => {
      const mod = await loadCategory(categoryOfTool(tool).slug);
      const spec = mod[slug];
      expect(spec, `missing spec for ${slug}`).toBeTruthy();
      expect(spec.examples.length).toBeGreaterThanOrEqual(3);
      const ids = new Set(spec.inputs.map((f) => f.id));
      for (const ex of spec.examples) for (const k of Object.keys(ex.inputs ?? {})) expect(ids.has(k.split(":")[0]), `${slug} example "${ex.label}" sets unknown input ${k}`).toBe(true);
      const optIds = new Set((spec.options ?? []).map((o) => o.id));
      for (const ex of spec.examples) for (const k of Object.keys(ex.opts ?? {})) expect(optIds.has(k), `${slug} example "${ex.label}" sets unknown option ${k}`).toBe(true);
    });

    it("runs every example", async () => {
      const mod = await loadCategory(categoryOfTool(tool).slug);
      const spec = mod[slug];
      if (!spec?.run || (spec as { skipNodeTest?: boolean }).skipNodeTest) return;
      for (const ex of spec.examples) {
        const opts = { ...defaultOpts(spec), ...(ex.opts ?? {}) } as Opts;
        if (ex.error) {
          let threw = false;
          let text = "";
          try {
            text = (await runSpec(spec, ex.inputs ?? {}, opts)).text;
          } catch {
            threw = true;
          }
          expect(threw || /invalid|error|fail|not valid|✗|mismatch/i.test(text), `${slug} "${ex.label}" should show an error`).toBe(true);
        } else {
          const r = await runSpec(spec, ex.inputs ?? {}, opts).catch((e) => {
            throw new Error(`${slug} example "${ex.label}" threw: ${(e as Error).message}`);
          });
          if (process.env.PRINT) console.log(`\n### ${slug} — ${ex.label}\n${r.text.slice(0, Number(process.env.PRINT) || 400)}`);
          expect(typeof r.text, `${slug} "${ex.label}"`).toBe("string");
          expect(r.text.length + (r.views?.length ?? 0), `${slug} "${ex.label}" produced nothing`).toBeGreaterThan(0);
        }
      }
    }, 60_000);
  }
);
