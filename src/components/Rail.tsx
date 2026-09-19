"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ToolIcon from "./ToolIcon";
import { useApp } from "./AppState";
import {
  CATEGORIES,
  TOOLS,
  categoryOfTool,
  plateInk,
  toolBySlug,
} from "@/src/lib/tools-registry";

const label: React.CSSProperties = {
  margin: "0 0 6px",
  padding: "0 16px",
  fontSize: 11,
  letterSpacing: ".13em",
  textTransform: "uppercase",
  color: "var(--color-neutral-600)",
};

function rowStyle(active: boolean, ink: string): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    padding: "7px 16px",
    border: 0,
    borderLeft: `2px solid ${active ? ink : "transparent"}`,
    background: active ? "rgba(255,255,255,.7)" : "transparent",
    cursor: "pointer",
    textAlign: "left",
    fontSize: 14.5,
    color: "var(--color-text)",
    textDecoration: "none",
  };
}

function ToolRow({ slug, open }: { slug: string; open: boolean }) {
  const pathname = usePathname();
  const tool = toolBySlug(slug);
  if (!tool) return null;
  const ink = plateInk(categoryOfTool(tool).plate);
  const active = pathname === `/tools/${slug}`;
  return (
    <Link
      className="ctl"
      href={`/tools/${slug}`}
      title={tool.title}
      style={rowStyle(active, ink)}
    >
      <ToolIcon slug={slug} size={18} color={ink} />
      {open && (
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {tool.title}
        </span>
      )}
    </Link>
  );
}

export default function Rail() {
  const pathname = usePathname();
  const { favs, recents, railOpen, setRailOpen, railMobile, setRailMobile, setDrawer, setPaletteOpen } =
    useApp();

  const width = railOpen ? "252px" : "62px";
  const counts = new Map(CATEGORIES.map((c) => [c.slug, 0]));
  for (const t of TOOLS) {
    const s = categoryOfTool(t).slug;
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }

  return (
    <aside
      className="rail g2 scroll"
      data-open={railMobile ? "1" : "0"}
      style={{
        gridColumn: 1,
        gridRow: 1,
        borderWidth: "0 1px 0 0",
        borderRadius: 0,
        overflowY: "auto",
        width,
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-6)",
        padding: "14px 0 24px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "0 14px" }}>
        <Link
          className="ctl"
          href="/"
          title="Formatter home"
          style={{ display: "flex", alignItems: "center", gap: 9, color: "var(--color-text)" }}
        >
          <ToolIcon name="brackets-angle" size={23} color="var(--color-accent-700)" />
          {railOpen && <strong style={{ fontSize: 17, letterSpacing: "-.02em" }}>Formatter</strong>}
        </Link>
        <div style={{ flex: 1 }} />
        <button
          className="ctl"
          type="button"
          onClick={() => {
            setRailOpen(!railOpen);
            setRailMobile(!railMobile);
          }}
          title="Collapse the rail"
          aria-label="Collapse the rail"
          style={{ border: 0, background: "none", padding: 4, cursor: "pointer", color: "var(--color-neutral-600)" }}
        >
          <ToolIcon name="sidebar-simple" size={19} />
        </button>
      </div>

      <div style={{ padding: "0 10px" }}>
        <button
          className="ctl gi"
          type="button"
          onClick={() => setPaletteOpen(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            width: "100%",
            padding: "9px 11px",
            borderRadius: "var(--radius-md)",
            cursor: "pointer",
            color: "var(--color-neutral-700)",
            fontSize: 14,
            textAlign: "left",
          }}
        >
          <ToolIcon name="magnifying-glass" size={17} />
          {railOpen && (
            <>
              <span style={{ flex: 1 }}>Search tools</span>
              <kbd className="mono" style={{ fontSize: 11, opacity: 0.7 }}>
                ⌘K
              </kbd>
            </>
          )}
        </button>
      </div>

      {favs.length > 0 && (
        <div>
          {railOpen && <p style={label}>Favourites</p>}
          {favs.map((s) => (
            <ToolRow key={s} slug={s} open={railOpen} />
          ))}
        </div>
      )}

      {recents.length > 0 && (
        <div>
          {railOpen && <p style={label}>Recent</p>}
          {recents.map((s) => (
            <ToolRow key={s} slug={s} open={railOpen} />
          ))}
        </div>
      )}

      <div>
        {railOpen && <p style={label}>Categories</p>}
        {CATEGORIES.map((c) => {
          const ink = plateInk(c.plate);
          const active = pathname === `/categories/${c.slug}`;
          return (
            <Link
              key={c.slug}
              className="ctl"
              href={`/categories/${c.slug}`}
              title={c.title}
              onClick={() => setRailMobile(false)}
              style={{ ...rowStyle(active, ink), padding: "6px 16px" }}
            >
              <span
                aria-hidden="true"
                style={{ width: 8, height: 8, borderRadius: 2, background: ink, flex: "none", margin: "0 5px" }}
              />
              {railOpen && (
                <>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.short}
                  </span>
                  <span className="mono" style={{ fontSize: 11, color: "var(--color-neutral-600)" }}>
                    {counts.get(c.slug)}
                  </span>
                </>
              )}
            </Link>
          );
        })}
      </div>

      <div style={{ flex: 1 }} />
      <div style={{ padding: "0 10px" }}>
        <Link
          className="ctl"
          href="/pipelines"
          onClick={() => setRailMobile(false)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            width: "100%",
            padding: "8px 6px",
            fontSize: 14.5,
            color: "var(--color-neutral-800)",
          }}
        >
          <ToolIcon name="flow-arrow" size={18} />
          {railOpen && <span>Pipelines</span>}
        </Link>
        <button
          className="ctl"
          type="button"
          onClick={() => {
            setDrawer("settings");
            setRailMobile(false);
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            width: "100%",
            padding: "8px 6px",
            border: 0,
            background: "none",
            cursor: "pointer",
            textAlign: "left",
            fontSize: 14.5,
            color: "var(--color-neutral-800)",
          }}
        >
          <ToolIcon name="gear-six" size={18} />
          {railOpen && <span>Settings</span>}
        </button>
      </div>
    </aside>
  );
}
