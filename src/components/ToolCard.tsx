"use client";

import Link from "next/link";
import ToolIcon from "./ToolIcon";
import { useApp } from "./AppState";
import { categoryOfTool, plateInk, plateTint, toolBadge, type ToolMeta } from "@/src/lib/tools-registry";

export default function ToolCard({ tool }: { tool: ToolMeta }) {
  const { favs, toggle, flash } = useApp();
  const cat = categoryOfTool(tool);
  const ink = plateInk(cat.plate);
  const tint = plateTint(cat.plate);
  const fav = favs.includes(tool.slug);
  const badge = toolBadge(tool);

  return (
    <div className="g lift card card-hit" data-testid="tool-card">
      <span aria-hidden="true" style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: ink }} />
      <Link
        className="ctl"
        href={`/tools/${tool.slug}`}
        style={{ display: "flex", gap: 13, width: "100%", padding: "16px 44px 16px 19px", textAlign: "left", color: "var(--color-text)" }}
      >
        <ToolIcon slug={tool.slug} size={24} color={ink} />
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <strong style={{ fontSize: 17, letterSpacing: "-.015em" }}>{tool.title}</strong>
            <span
              className="mono"
              style={{
                padding: "1px 6px",
                borderRadius: 3,
                background: tint,
                color: ink,
                fontSize: 10.5,
                letterSpacing: ".05em",
                textTransform: "uppercase",
              }}
            >
              {badge}
            </span>
          </span>
          <span
            style={{ display: "block", marginTop: 3, fontSize: 14, lineHeight: 1.4, color: "var(--color-neutral-700)", textWrap: "pretty" }}
          >
            {tool.description}
          </span>
          <span
            style={{ display: "block", marginTop: 7, fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase", color: ink }}
          >
            {cat.title}
          </span>
        </span>
      </Link>
      <button
        className="ctl star"
        type="button"
        data-on={fav ? "1" : "0"}
        aria-pressed={fav}
        aria-label={fav ? `Unstar ${tool.title}` : `Star ${tool.title}`}
        title="Favourite"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const on = toggle(tool.slug);
          flash(on ? "Added to favourites" : "Removed from favourites");
        }}
        style={{
          position: "absolute",
          top: 13,
          right: 12,
          border: 0,
          background: "none",
          padding: 5,
          cursor: "pointer",
          color: fav ? "var(--color-accent-2)" : "var(--color-neutral-700)",
        }}
      >
        <ToolIcon name="star" size={17} weight={fav ? "fill" : "duotone"} />
      </button>
    </div>
  );
}
