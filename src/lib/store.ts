"use client";

import type { PipelineStep } from "./collections";
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
  /** Snippet of the primary input, for display. */
  fin: string;
  /** Snippet of the output, for display. */
  fout: string;
  /** Legacy single option value. */
  opt: string;
  /** Every input field, so Restore brings back the exact state. */
  inputs?: Record<string, string>;
  opts?: Record<string, string | number | boolean>;
};

/** Inputs larger than this are not stored whole — history must stay small. */
export const MAX_HISTORY_INPUT = 20_000;

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
  const same = (h: HistoryEntry) =>
    h.slug === entry.slug &&
    h.fin === entry.fin &&
    JSON.stringify(h.inputs ?? null) === JSON.stringify(entry.inputs ?? null) &&
    JSON.stringify(h.opts ?? null) === JSON.stringify(entry.opts ?? null);
  const newest = history[0];
  if (newest && same(newest)) return history;
  // Re-running something already in history moves it to the top instead of duplicating it.
  return [entry, ...history.filter((h) => !same(h))].slice(0, MAX_HISTORY);
}

/** Keeps an input map within the storage budget, trimming the largest fields first. */
export function clampInputs(inputs: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(inputs)) {
    out[k] = typeof v === "string" && v.length > MAX_HISTORY_INPUT ? v.slice(0, MAX_HISTORY_INPUT) : v;
  }
  return out;
}

export function newEntryId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/* ── Hooks. Each one reads storage inside an effect, so SSR and the first
      client render agree and hydration never mismatches. ──────────────── */

/**
 * Keeps a ref in lockstep with state so callbacks never read a stale list, and
 * reports whether the load-from-storage effect has run yet.
 *
 * This matters: a child's mount effect fires before its parent's, so a tool
 * page can call record() or touch() before the provider has hydrated. Writing
 * from the empty initial state would erase what is in storage, so callbacks
 * read through `current()`, which falls back to a fresh read until hydration.
 */
function useMirror<T>(value: T, key: string, fallback: T) {
  const ref = useRef(value);
  ref.current = value;
  const hydrated = useRef(false);
  const current = useCallback(
    () => (hydrated.current ? ref.current : read<T>(key, fallback)),
    [key, fallback]
  );
  return { ref, hydrated, current };
}

export function useFavourites() {
  const [favs, setFavs] = useState<string[]>([]);
  const { ref, hydrated, current } = useMirror<string[]>(favs, KEYS.favs, []);

  useEffect(() => {
    const loaded = asSlugs(read<string[]>(KEYS.favs, [])).slice(0, MAX_FAVS);
    // The ref is marked hydrated and filled together: a callback that fires
    // between the effect and the re-render must not see an empty list.
    ref.current = loaded;
    hydrated.current = true;
    setFavs(loaded);
  }, [ref, hydrated]);

  const toggle = useCallback(
    (slug: string) => {
      const next = toggleFav(asSlugs(current()), slug);
      ref.current = next;
      setFavs(next);
      write(KEYS.favs, next);
      return next.includes(slug);
    },
    [ref, current]
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
  const { ref, hydrated, current } = useMirror<string[]>(recents, KEYS.recents, []);

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
    const loaded = list.slice(0, MAX_RECENTS);
    ref.current = loaded;
    hydrated.current = true;
    setRecents(loaded);
  }, [ref, hydrated]);

  const touch = useCallback(
    (slug: string) => {
      const now = asSlugs(current());
      const next = pushRecent(now, slug);
      ref.current = next;
      setRecents(next);
      write(KEYS.recents, next);
    },
    [ref, current]
  );

  return { recents, touch };
}

export function useHistory() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const { ref, hydrated, current } = useMirror<HistoryEntry[]>(history, KEYS.history, []);

  useEffect(() => {
    const raw = read<HistoryEntry[]>(KEYS.history, []);
    const loaded = Array.isArray(raw) ? raw.slice(0, MAX_HISTORY) : [];
    ref.current = loaded;
    hydrated.current = true;
    setHistory(loaded);
  }, [ref, hydrated]);

  const record = useCallback(
    (entry: Omit<HistoryEntry, "id" | "t">) => {
      const now = current();
      const full: HistoryEntry = { id: newEntryId(), t: Date.now(), ...entry };
      const next = pushHistory(Array.isArray(now) ? now : [], full);
      if (next === now) return;
      ref.current = next;
      setHistory(next);
      write(KEYS.history, next);
    },
    [ref, current]
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

  const clearFor = useCallback(
    (slug: string) => {
      const next = ref.current.filter((h) => h.slug !== slug);
      ref.current = next;
      setHistory(next);
      write(KEYS.history, next);
    },
    [ref]
  );

  return { history, record, remove, clear, clearFor };
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const { ref, hydrated, current } = useMirror<Settings>(settings, KEYS.settings, DEFAULT_SETTINGS);

  useEffect(() => {
    const raw = read<Partial<Settings>>(KEYS.settings, {});
    const loaded: Settings = {
      glass: raw.glass !== false,
      motion: raw.motion !== false,
      autorun: raw.autorun !== false,
      keephist: raw.keephist !== false,
      mono:
        typeof raw.mono === "number"
          ? Math.min(18, Math.max(12, raw.mono))
          : DEFAULT_SETTINGS.mono,
    };
    ref.current = loaded;
    hydrated.current = true;
    setSettings(loaded);
  }, [ref, hydrated]);

  const set = useCallback(
    (patch: Partial<Settings>) => {
      const next = { ...DEFAULT_SETTINGS, ...current(), ...patch };
      ref.current = next;
      setSettings(next);
      write(KEYS.settings, next);
    },
    [ref, current]
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

/**
 * A request to open a tool with a given state — from history, a workspace or
 * a recipe. The tool page consumes it on mount.
 */
export type RestoreRequest = {
  slug: string;
  input: string;
  opt: string;
  inputs?: Record<string, string>;
  opts?: Record<string, string | number | boolean>;
};

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
  const [pipeline, setPipeline] = useState<PipelineStep[]>([]);
  const [pipeSource, setPipeSource] = useState("");
  // A history restore hands the tool page its input across the navigation.
  const [restoreReq, setRestoreReq] = useState<RestoreRequest | null>(null);

  return useMemo(
    () => ({
      ...favourites,
      ...recents,
      history: history.history,
      record: history.record,
      removeHistory: history.remove,
      clearHistory: history.clear,
      clearHistoryFor: history.clearFor,
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
