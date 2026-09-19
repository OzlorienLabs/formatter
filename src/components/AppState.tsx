"use client";

import { createContext, useContext } from "react";
import { useAppStateValue, type AppState } from "@/src/lib/store";

const Ctx = createContext<AppState | null>(null);

/**
 * One instance of every storage hook, shared by the rail, the top bar, the
 * palette and both drawers. Nothing else may call the hooks directly.
 */
export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const value = useAppStateValue();
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used inside <AppStateProvider>");
  return v;
}
