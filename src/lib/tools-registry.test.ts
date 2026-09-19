import { describe, it, expect } from "vitest";
import { TOOLS, CATEGORIES, searchTools, toolBySlug, plateInk, plateTint } from "./tools-registry";

describe("registry", () => {
  it("holds 125 tools in 18 categories", () => {
    expect(TOOLS).toHaveLength(125);
    expect(CATEGORIES).toHaveLength(18);
  });

  it("gives every tool a unique slug and an icon", () => {
    expect(new Set(TOOLS.map((t) => t.slug)).size).toBe(125);
    expect(TOOLS.every((t) => t.icon.length > 0)).toBe(true);
  });

  it("names the plate variables", () => {
    expect(plateInk("y")).toBe("var(--plate-y)");
    expect(plateTint("c")).toBe("var(--plate-c-tint)");
  });
});

describe("searchTools", () => {
  it("puts json-formatter first for 'json'", () => {
    expect(searchTools("json")[0].slug).toBe("json-formatter");
  });

  it("matches the Base64 tools for 'base 64'", () => {
    const slugs = searchTools("base 64").map((t) => t.slug);
    expect(slugs).toContain("base64-encoder");
    expect(slugs).toContain("base64-decoder");
  });

  it("returns nothing for 'zzz'", () => {
    expect(searchTools("zzz")).toEqual([]);
  });

  it("requires every word to appear somewhere", () => {
    expect(searchTools("json zzz")).toEqual([]);
  });

  it("ranks a name prefix above a name substring", () => {
    const ranked = searchTools("base64").map((t) => t.slug);
    // "Base64 Encode" starts with the word; "JSON to Base64" only contains it.
    expect(ranked.indexOf("base64-encoder")).toBeLessThan(ranked.indexOf("json-to-base64"));
  });

  it("ranks a name substring above a slug-only match", () => {
    const ranked = searchTools("colour").map((t) => t.slug);
    // "Colour Picker" carries the word in its name; the others only in a category.
    expect(ranked[0]).toBe("color-picker");
  });

  it("returns everything for an empty query", () => {
    expect(searchTools("   ")).toHaveLength(125);
  });

  it("searches descriptions and category titles too", () => {
    expect(searchTools("encoding").map((t) => t.slug)).toContain("jwt-decoder");
  });

  it("resolves a renamed tool by its unchanged slug", () => {
    expect(toolBySlug("base-converter")?.title).toBe("Base Converter");
    expect(toolBySlug("string-length")?.title).toBe("String Stats");
  });
});
