"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export const KEYS = {
  favs: "fmt:favs",
  recents: "fmt:recents",
  history: "fmt:history",
  settings: "fmt:settings",
} as const;

export const LEGACY_RECENTS = "devtools:recents";

export const MAX_FAVS = 12;
export const MAX_RECENTS = 6;
export const MAX_HISTORY = 60;

export type HistoryEntry = {
  id: string;
  slug: string;
  name: string;
  t: number;
  fin: string;
  fout: string;
  opt: string;
};

export type Settings = {
  glass: boolean;
  motion: boolean;
  autorun: boolean;
  keephist: boolean;
  mono: number;
};

export const DEFAULT_SETTINGS: Settings = {
  glass: true,
  motion: true,
  autorun: true,
  keephist: true,
  mono: 13,
};

/* ── localStorage, never throwing, never touched during render ─────────── */

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw == null) return fallback;
    const parsed = JSON.parse(raw);
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode, quota, disabled storage — all non-fatal */
  }
}

function drop(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

const asSlugs = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

/* ── Pure list rules, exported so they can be tested without React ─────── */

/** Newest first, no duplicate slug, capped. */
export function pushRecent(recents: string[], slug: string): string[] {
  return [slug, ...recents.filter((s) => s !== slug)].slice(0, MAX_RECENTS);
}

/** Toggles membership, capped at MAX_FAVS — a full list refuses new entries. */
export function toggleFav(favs: string[], slug: string): string[] {
  if (favs.includes(slug)) return favs.filter((s) => s !== slug);
  return [...favs, slug].slice(0, MAX_FAVS);
}

/**
 * Newest first, capped at MAX_HISTORY. A run whose slug and input both match
 * the newest entry is not recorded again — re-running the same thing should
 * not fill the drawer.
 */
export function pushHistory(history: HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  const newest = history[0];
  if (newest && newest.slug === entry.slug && newest.fin === entry.fin) return history;
  return [entry, ...history].slice(0, MAX_HISTORY);
}

export function newEntryId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/* ── Hooks. Each one reads storage inside an effect, so SSR and the first
      client render agree and hydration never mismatches. ──────────────── */

/** Keeps a ref in lockstep with state so callbacks never read a stale list. */
function useMirror<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

export function useFavourites() {
  const [favs, setFavs] = useState<string[]>([]);
  const ref = useMirror(favs);

  useEffect(() => {
    setFavs(asSlugs(read<string[]>(KEYS.favs, [])).slice(0, MAX_FAVS));
  }, []);

  const toggle = useCallback(
    (slug: string) => {
      const next = toggleFav(ref.current, slug);
      ref.current = next;
      setFavs(next);
      write(KEYS.favs, next);
      return next.includes(slug);
    },
    [ref]
  );

  const clear = useCallback(() => {
    ref.current = [];
    setFavs([]);
    write(KEYS.favs, []);
  }, [ref]);

  return { favs, toggle, clear };
}

export function useRecents() {
  const [recents, setRecents] = useState<string[]>([]);
  const ref = useMirror(recents);

  useEffect(() => {
    let list = asSlugs(read<string[]>(KEYS.recents, []));
    if (list.length === 0) {
      const legacy = asSlugs(read<string[]>(LEGACY_RECENTS, []));
      if (legacy.length) {
        list = legacy.slice(0, MAX_RECENTS);
        write(KEYS.recents, list);
      }
    }
    drop(LEGACY_RECENTS);
    setRecents(list.slice(0, MAX_RECENTS));
  }, []);

  const touch = useCallback(
    (slug: string) => {
      const next = pushRecent(ref.current, slug);
      if (next[0] === ref.current[0] && next.length === ref.current.length) return;
      ref.current = next;
      setRecents(next);
      write(KEYS.recents, next);
    },
    [ref]
  );

  return { recents, touch };
}

export function useHistory() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const ref = useMirror(history);

  useEffect(() => {
    const raw = read<HistoryEntry[]>(KEYS.history, []);
    setHistory(Array.isArray(raw) ? raw.slice(0, MAX_HISTORY) : []);
  }, []);

  const record = useCallback(
    (entry: Omit<HistoryEntry, "id" | "t">) => {
      const full: HistoryEntry = { id: newEntryId(), t: Date.now(), ...entry };
      const next = pushHistory(ref.current, full);
      if (next === ref.current) return;
      ref.current = next;
      setHistory(next);
      write(KEYS.history, next);
    },
    [ref]
  );

  const remove = useCallback(
    (id: string) => {
      const next = ref.current.filter((h) => h.id !== id);
      ref.current = next;
      setHistory(next);
      write(KEYS.history, next);
    },
    [ref]
  );

  const clear = useCallback(() => {
    ref.current = [];
    setHistory([]);
    write(KEYS.history, []);
  }, [ref]);

  return { history, record, remove, clear };
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const ref = useMirror(settings);

  useEffect(() => {
    const raw = read<Partial<Settings>>(KEYS.settings, {});
    setSettings({
      glass: raw.glass !== false,
      motion: raw.motion !== false,
      autorun: raw.autorun !== false,
      keephist: raw.keephist !== false,
      mono:
        typeof raw.mono === "number"
          ? Math.min(18, Math.max(12, raw.mono))
          : DEFAULT_SETTINGS.mono,
    });
  }, []);

  const set = useCallback(
    (patch: Partial<Settings>) => {
      const next = { ...ref.current, ...patch };
      ref.current = next;
      setSettings(next);
      write(KEYS.settings, next);
    },
    [ref]
  );

  return { ...settings, set };
}

/** A single centred pill at the bottom, 1.8s, replacing any previous one. */
export function useToast() {
  const [toast, setToast] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((message: string) => {
    if (timer.current) clearTimeout(timer.current);
    setToast(message);
    timer.current = setTimeout(() => setToast(""), 1800);
  }, []);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return { toast, flash };
}

/** Assembled once, in AppStateProvider. Nothing else calls the hooks above. */
export function useAppStateValue() {
  const favourites = useFavourites();
  const recents = useRecents();
  const history = useHistory();
  const settings = useSettings();
  const toast = useToast();

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [drawer, setDrawer] = useState<null | "history" | "settings">(null);
  const [railOpen, setRailOpen] = useState(true);
  const [railMobile, setRailMobile] = useState(false);
  const [pipeline, setPipeline] = useState<string[]>([]);
  const [pipeSource, setPipeSource] = useState("");
  // A history restore hands the tool page its input across the navigation.
  const [restoreReq, setRestoreReq] = useState<{ slug: string; input: string; opt: string } | null>(null);

  return useMemo(
    () => ({
      ...favourites,
      ...recents,
      history: history.history,
      record: history.record,
      removeHistory: history.remove,
      clearHistory: history.clear,
      clearFavs: favourites.clear,
      settings,
      toast: toast.toast,
      flash: toast.flash,
      paletteOpen,
      setPaletteOpen,
      drawer,
      setDrawer,
      railOpen,
      setRailOpen,
      railMobile,
      setRailMobile,
      pipeline,
      setPipeline,
      pipeSource,
      setPipeSource,
      restoreReq,
      setRestoreReq,
    }),
    [favourites, recents, history, settings, toast, paletteOpen, drawer, railOpen, railMobile, pipeline, pipeSource, restoreReq]
  );
}

export type AppState = ReturnType<typeof useAppStateValue>;
