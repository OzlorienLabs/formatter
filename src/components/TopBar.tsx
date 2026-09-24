"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ToolIcon from "./ToolIcon";
import { useApp } from "./AppState";
import { categoryBySlug, categoryOfTool, toolBySlug } from "@/src/lib/tools-registry";
import { useOnline } from "@/src/lib/offline";

const crumbLink: React.CSSProperties = {
  border: 0,
  background: "none",
  padding: 0,
  cursor: "pointer",
  color: "var(--color-neutral-700)",
  fontSize: 14.5,
};

export default function TopBar() {
  const pathname = usePathname();
  const { history, setDrawer, setPaletteOpen, railMobile, setRailMobile, railOpen, setRailOpen } = useApp();
  const online = useOnline();
  const section = pathname === "/pipelines" ? "Pipelines" : pathname === "/recipes" ? "Recipes" : pathname === "/workspaces" ? "Workspaces" : null;

  const toolSlug = pathname.startsWith("/tools/") ? pathname.slice("/tools/".length) : null;
  const tool = toolSlug ? toolBySlug(toolSlug) : null;
  const catSlug = pathname.startsWith("/categories/") ? pathname.slice("/categories/".length) : null;
  const category = tool ? categoryOfTool(tool) : catSlug ? categoryBySlug(catSlug) : null;

  return (
    <header
      className="g2"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-3)",
        padding: "10px 18px",
        borderWidth: "0 0 1px 0",
        borderRadius: 0,
        flex: "none",
      }}
    >
      <button
        className="ctl"
        type="button"
        onClick={() => {
          setRailMobile(!railMobile);
          setRailOpen(railMobile ? railOpen : true);
        }}
        title="Menu"
        aria-label="Menu"
        aria-expanded={railMobile}
        style={{ border: 0, background: "none", padding: 4, cursor: "pointer", color: "var(--color-neutral-700)" }}
      >
        <ToolIcon name="list" size={20} />
      </button>

      <nav aria-label="Breadcrumb" style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <Link className="ctl" href="/tools" style={crumbLink}>
          All tools
        </Link>
        {category && (
          <>
            <span style={{ color: "var(--color-neutral-500)" }}>/</span>
            <Link className="ctl" href={`/categories/${category.slug}`} style={crumbLink}>
              {category.title}
            </Link>
          </>
        )}
        {section && (
          <>
            <span style={{ color: "var(--color-neutral-500)" }}>/</span>
            <strong style={{ fontWeight: 600, fontSize: 14.5 }}>{section}</strong>
          </>
        )}
        {tool && (
          <>
            <span style={{ color: "var(--color-neutral-500)" }}>/</span>
            <strong
              style={{ fontWeight: 600, fontSize: 14.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {tool.title}
            </strong>
          </>
        )}
      </nav>

      <div style={{ flex: 1 }} />

      {!online && (
        <span
          className="mono"
          title="You are offline. Tools keep working from the local cache."
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 9px", borderRadius: 999, background: "rgba(237,187,0,.16)", color: "var(--plate-y)", fontSize: 12 }}
        >
          <ToolIcon name="wifi-slash" size={14} /> offline
        </span>
      )}

      <button
        className="ctl gi"
        type="button"
        onClick={() => setPaletteOpen(true)}
        aria-label="Search tools"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "7px 12px",
          borderRadius: "var(--radius-md)",
          cursor: "pointer",
          color: "var(--color-neutral-700)",
          fontSize: 14,
        }}
      >
        <ToolIcon name="magnifying-glass" size={16} />
        <kbd className="mono" style={{ fontSize: 11 }}>
          ⌘K
        </kbd>
      </button>

      <button
        className="ctl"
        type="button"
        onClick={() => setDrawer("history")}
        title="History"
        aria-label={`History, ${history.length} entries`}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "7px 11px",
          border: "1px solid rgba(32,30,29,.14)",
          borderRadius: "var(--radius-md)",
          background: "none",
          cursor: "pointer",
          fontSize: 14,
          color: "var(--color-neutral-800)",
        }}
      >
        <ToolIcon name="clock-counter-clockwise" size={17} />
        <span data-testid="history-count">{history.length}</span>
      </button>
    </header>
  );
}
