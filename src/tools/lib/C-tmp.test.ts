// @vitest-environment jsdom
import { it } from "vitest";
import { loadCategory } from "../index";
import { runSpec } from "../runner";
import { defaultOpts } from "../types";
it("errors", async () => {
  for (const cat of (process.env.CATS ?? "xml,formatters-text").split(",")) {
    const mod = await loadCategory(cat);
    for (const [slug, spec] of Object.entries(mod)) {
      if (process.env.ONLY && !process.env.ONLY.split(",").includes(slug)) continue;
      for (const ex of spec.examples) {
        if (!ex.error && !process.env.ALL) continue;
        try {
          const r = await runSpec(spec, ex.inputs ?? {}, { ...defaultOpts(spec), ...(ex.opts ?? {}) } as any);
          console.log(`\n### ${slug} — ${ex.label} (no throw)\n${r.text.slice(0, 800)}\nVIEWS: ${(r.views ?? []).map((v) => v.label).join(" | ")}\nNOTES: ${(r.notes ?? []).join(" / ")}`);
        } catch (e) {
          console.log(`\n### ${slug} — ${ex.label} THREW\n${(e as Error).message}`);
        }
      }
    }
  }
}, 120000);
