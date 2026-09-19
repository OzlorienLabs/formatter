"use client";

import { usePathname } from "next/navigation";
import Rail from "./Rail";
import TopBar from "./TopBar";
import CommandPalette from "./CommandPalette";
import Drawers from "./Drawers";
import Toast from "./Toast";
import { useApp } from "./AppState";

/**
 * The workbench: a `252px minmax(0,1fr)` grid. The main column is pinned to
 * `grid-column: 2` — under 1000px the rail leaves the flow, and without the
 * explicit column the main content collapses to zero width.
 *
 * The landing page carries its own header and runs full-bleed, so it opts out
 * of the grid while keeping the wash, the palette, the drawers and the toast.
 */
export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { settings, railOpen } = useApp();
  const isLanding = pathname === "/";

  const modeClass = `${settings.glass ? "" : "flat "}${settings.motion ? "" : "calm"}`.trim();

  return (
    <div
      className={modeClass}
      style={{
        position: "relative",
        minHeight: "100vh",
        fontFamily: "var(--font-body)",
        color: "var(--color-text)",
        overflowX: "hidden",
      }}
    >
      <div aria-hidden="true" className="wash-ground" />
      <div aria-hidden="true" className="wash-glow drift" />
      <div aria-hidden="true" className="wash-dots" />

      {isLanding ? (
        <div style={{ position: "relative", zIndex: 1 }}>{children}</div>
      ) : (
        <div
          className="shell"
          style={{
            position: "relative",
            zIndex: 1,
            display: "grid",
            gridTemplateColumns: `${railOpen ? "252px" : "62px"} minmax(0,1fr)`,
            height: "100vh",
          }}
        >
          <Rail />
          <div
            style={{
              gridColumn: 2,
              gridRow: 1,
              display: "flex",
              flexDirection: "column",
              minWidth: 0,
              height: "100vh",
            }}
          >
            <TopBar />
            <main className="scroll" style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
              {children}
            </main>
          </div>
        </div>
      )}

      <CommandPalette />
      <Drawers />
      <Toast />
    </div>
  );
}
