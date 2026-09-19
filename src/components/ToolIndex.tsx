"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import ToolIcon from "./ToolIcon";
import ToolCard from "./ToolCard";
import {
  CATEGORIES,
  TOOLS,
  categoryBySlug,
  categoryOfTool,
  plateInk,
  searchTools,
} from "@/src/lib/tools-registry";

const COUNTS = new Map(
  CATEGORIES.map((c) => [c.slug, TOOLS.filter((t) => categoryOfTool(t).slug === c.slug).length])
);

/** One template for /tools and /categories/[category]. */
export default function ToolIndex({ category = null }: { category?: string | null }) {
  const params = useSearchParams();
  const [cat, setCat] = useState<string | null>(category);
  const [q, setQ] = useState(() => params.get("q") ?? "");

  const results = useMemo(() => {
    const matched = searchTools(q);
    return cat ? matched.filter((t) => categoryOfTool(t).slug === cat) : matched;
  }, [q, cat]);

  const current = cat ? categoryBySlug(cat) : null;
  const title = q ? "Search" : current ? current.title : "All tools";
  const blurb = q
    ? `Matching “${q}” across names, descriptions and categories.`
    : current
      ? current.blurb
      : "One hundred and twenty-five tools, every one of them running locally. Star the ones you keep coming back to.";

  const chips = [
    { slug: null as string | null, label: "Everything", count: TOOLS.length, ink: "var(--plate-k)" },
    ...CATEGORIES.map((c) => ({
      slug: c.slug as string | null,
      label: c.short,
      count: COUNTS.get(c.slug) ?? 0,
      ink: plateInk(c.plate),
    })),
  ];

  return (
    <div style={{ padding: "clamp(20px,3vw,40px) clamp(18px,3vw,44px) 72px", maxWidth: 1500 }}>
      <h1 style={{ margin: "0 0 var(--space-2)", fontSize: "clamp(30px,3.6vw,50px)", letterSpacing: "-.03em", lineHeight: 1.02 }}>
        {title}
      </h1>
      <p style={{ margin: "0 0 var(--space-6)", fontSize: 17, color: "var(--color-neutral-800)", maxWidth: "64ch" }}>
        {blurb}
      </p>

      <div
        className="g"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "4px 4px 4px 16px",
          borderRadius: "var(--radius-lg)",
          maxWidth: 720,
          marginBottom: "var(--space-6)",
        }}
      >
        <ToolIcon name="magnifying-glass" size={19} color="var(--color-neutral-700)" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter by name, description or category"
          aria-label="Filter tools"
          style={{ flex: 1, border: 0, background: "transparent", outline: "none", padding: "10px 0", fontSize: 16 }}
        />
        {q && (
          <button
            className="ctl"
            type="button"
            onClick={() => setQ("")}
            aria-label="Clear the filter"
            style={{ border: 0, background: "none", padding: 8, cursor: "pointer", color: "var(--color-neutral-600)" }}
          >
            <ToolIcon name="x" size={16} />
          </button>
        )}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: "var(--space-6)" }}>
        {chips.map((f) => {
          const on = cat === f.slug;
          return (
            <button
              key={f.label}
              className="ctl"
              type="button"
              aria-pressed={on}
              onClick={() => setCat(f.slug)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                padding: "5px 12px",
                border: `1px solid ${on ? f.ink : "rgba(32,30,29,.16)"}`,
                borderRadius: 999,
                background: on ? "rgba(255,255,255,.85)" : "transparent",
                color: on ? "var(--color-text)" : "var(--color-neutral-700)",
                cursor: "pointer",
                fontSize: 13.5,
              }}
            >
              <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 2, background: f.ink }} />
              {f.label}
              <span className="mono" style={{ fontSize: 11, opacity: 0.65 }}>
                {f.count}
              </span>
            </button>
          );
        })}
      </div>

      <p
        style={{
          margin: "0 0 var(--space-4)",
          fontSize: 13,
          letterSpacing: ".1em",
          textTransform: "uppercase",
          color: "var(--color-neutral-600)",
        }}
      >
        {results.length} {results.length === 1 ? "tool" : "tools"}
      </p>

      <div
        className="toolgrid"
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(288px,1fr))", gap: "var(--space-3)" }}
      >
        {results.map((t) => (
          <ToolCard key={t.slug} tool={t} />
        ))}
      </div>

      {results.length === 0 && (
        <p style={{ margin: "var(--space-6) 0 0", fontSize: 17, color: "var(--color-neutral-700)" }}>
          Nothing matches that. Try a shorter word, or{" "}
          <button
            className="ctl"
            type="button"
            onClick={() => {
              setQ("");
              setCat(null);
            }}
            style={{
              border: 0,
              background: "none",
              padding: 0,
              cursor: "pointer",
              color: "var(--color-accent-700)",
              textDecoration: "underline",
            }}
          >
            clear the filter
          </button>
          .
        </p>
      )}
    </div>
  );
}
