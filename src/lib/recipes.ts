/**
 * Recipes: curated, explained pipelines. `featured` ones double as the
 * examples on the Pipelines page. Option ids must match the tool specs —
 * src/lib/recipes.test.ts runs every recipe end to end.
 */
import type { PipelineStep } from "./collections";

export type Recipe = {
  id: string;
  title: string;
  summary: string;
  /** Why you'd do this — shown on the recipe card. */
  why: string;
  area: "Data" | "API & Web" | "Security" | "DevOps" | "Text & Code";
  level: "Starter" | "Intermediate" | "Advanced";
  source: string;
  steps: PipelineStep[];
  featured?: boolean;
  /** What to look at in the output. */
  expect?: string;
};

export const RECIPES: Recipe[] = [
  {
    id: "json-clean-minify",
    title: "Validate, tidy and minify JSON",
    summary: "Accept sloppy JSON5, sort its keys and ship it compact.",
    why: "Config files written by hand drift: comments, trailing commas, random key order. This normalises them into canonical, diff-friendly minified JSON.",
    area: "Data",
    level: "Starter",
    featured: true,
    source: `// service config\n{\n  name: 'billing-api',\n  port: 8080,\n  features: { retries: 3, timeouts: [100, 250, 1000,], },\n  debug: false,\n}`,
    steps: [
      { slug: "json-formatter", opts: { tolerant: true, sort: true } },
      { slug: "json-minifier", opts: {} },
    ],
    expect: "A single line of strict JSON with keys in alphabetical order.",
  },
  {
    id: "json-query-base64",
    title: "Extract with jq, then Base64 it",
    summary: "Pull a sub-document out of an API response and encode it for a header.",
    why: "Many APIs expect a Base64 JSON blob in a header (e.g. X-Context). jq picks exactly the part you need.",
    area: "API & Web",
    level: "Intermediate",
    featured: true,
    source: `{"data":{"repository":{"name":"formatter","owner":{"login":"ozlorienlabs","type":"Organization"},"stars":1280}},"meta":{"requestId":"b7f3c2"}}`,
    steps: [
      { slug: "jq-playground", inputs: { filter: ".data.repository | {name, owner: .owner.login}" }, opts: { compact: true } },
      { slug: "json-to-base64", opts: { variant: "url" } },
    ],
    expect: "A URL-safe Base64 string of {\"name\":\"formatter\",\"owner\":\"ozlorienlabs\"}.",
  },
];

export const recipeById = (id: string) => RECIPES.find((r) => r.id === id);
