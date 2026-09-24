/**
 * Lazy spec loader. Each category's tools live in their own module so a tool
 * page downloads only its category (and, inside `run`, only the libraries the
 * tool itself needs).
 */
import type { SpecModule, ToolSpec } from "./types";
import { toolBySlug, categoryOfTool } from "@/src/lib/tools-registry";

const LOADERS: Record<string, () => Promise<{ default: SpecModule }>> = {
  json: () => import("./json"),
  encoding: () => import("./encoding"),
  "binary-numbers": () => import("./binary"),
  converters: () => import("./converters"),
  validators: () => import("./validators"),
  xml: () => import("./xml"),
  "formatters-text": () => import("./text"),
  "sql-data": () => import("./data"),
  security: () => import("./security"),
  "regex-api": () => import("./regexapi"),
  languages: () => import("./languages"),
  "visual-canvas": () => import("./visual"),
  diagrams: () => import("./diagrams"),
  "generators-devops": () => import("./generators"),
  "image-color-seo": () => import("./image"),
  ascii: () => import("./ascii"),
  time: () => import("./time"),
};

const cache = new Map<string, Promise<SpecModule>>();

export function loadCategory(catSlug: string): Promise<SpecModule> {
  let p = cache.get(catSlug);
  if (!p) {
    const loader = LOADERS[catSlug];
    p = loader ? loader().then((m) => m.default) : Promise.resolve({});
    cache.set(catSlug, p);
  }
  return p;
}

export async function loadSpec(slug: string): Promise<ToolSpec | null> {
  const meta = toolBySlug(slug);
  if (!meta) return null;
  const mod = await loadCategory(categoryOfTool(meta).slug);
  return mod[slug] ?? null;
}

export const CATEGORY_MODULES = Object.keys(LOADERS);
