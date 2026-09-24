"use client";

/**
 * Saved pipelines and workspaces. Both live in localStorage and are shared
 * across tabs through the `storage` event. Every write goes through `save`,
 * which also notifies subscribers in this tab.
 */
import { useSyncExternalStore } from "react";

export type StepOpts = Record<string, string | number | boolean>;

export type PipelineStep = {
  slug: string;
  /** Options for this step; missing keys fall back to the tool's defaults. */
  opts?: StepOpts;
  /** Secondary inputs (keys, filters, templates). The primary input is the chain. */
  inputs?: Record<string, string>;
  /** A disabled step is skipped without being removed. */
  off?: boolean;
};

export type SavedPipeline = {
  id: string;
  name: string;
  description?: string;
  source: string;
  steps: PipelineStep[];
  updated: number;
};

export type WorkspaceItem = {
  id: string;
  slug: string;
  label: string;
  inputs: Record<string, string>;
  opts: StepOpts;
  note?: string;
  saved: number;
};

export type Workspace = {
  id: string;
  name: string;
  description?: string;
  items: WorkspaceItem[];
  updated: number;
};

export const COLLECTION_KEYS = {
  pipelines: "fmt:pipelines",
  workspaces: "fmt:workspaces",
  seeded: "fmt:seeded",
} as const;

type Key = (typeof COLLECTION_KEYS)[keyof typeof COLLECTION_KEYS];

const listeners = new Set<() => void>();
const snapshots = new Map<string, { raw: string | null; value: unknown }>();

function readRaw(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function readList<T>(key: Key): T[] {
  const raw = readRaw(key);
  const cached = snapshots.get(key);
  if (cached && cached.raw === raw) return cached.value as T[];
  let value: T[] = [];
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    value = Array.isArray(parsed) ? parsed : [];
  } catch {
    value = [];
  }
  snapshots.set(key, { raw, value });
  return value;
}

export function saveList<T>(key: Key, list: T[]): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(list));
  } catch {
    return false;
  }
  listeners.forEach((l) => l());
  return true;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (!e.key || e.key.startsWith("fmt:")) cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

const EMPTY: never[] = [];

export function usePipelines(): SavedPipeline[] {
  return useSyncExternalStore(subscribe, () => readList<SavedPipeline>(COLLECTION_KEYS.pipelines), () => EMPTY);
}

export function useWorkspaces(): Workspace[] {
  return useSyncExternalStore(subscribe, () => readList<Workspace>(COLLECTION_KEYS.workspaces), () => EMPTY);
}

export const newId = (p = "") => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/* ── pipelines ───────────────────────────────────────────────────────── */

export function upsertPipeline(p: SavedPipeline) {
  const list = readList<SavedPipeline>(COLLECTION_KEYS.pipelines);
  const next = list.some((x) => x.id === p.id)
    ? list.map((x) => (x.id === p.id ? { ...p, updated: Date.now() } : x))
    : [{ ...p, updated: Date.now() }, ...list];
  return saveList(COLLECTION_KEYS.pipelines, next);
}

export function deletePipeline(id: string) {
  saveList(COLLECTION_KEYS.pipelines, readList<SavedPipeline>(COLLECTION_KEYS.pipelines).filter((x) => x.id !== id));
}

/* ── workspaces ──────────────────────────────────────────────────────── */

export function upsertWorkspace(w: Workspace) {
  const list = readList<Workspace>(COLLECTION_KEYS.workspaces);
  const next = list.some((x) => x.id === w.id)
    ? list.map((x) => (x.id === w.id ? { ...w, updated: Date.now() } : x))
    : [...list, { ...w, updated: Date.now() }];
  return saveList(COLLECTION_KEYS.workspaces, next);
}

export function deleteWorkspace(id: string) {
  saveList(COLLECTION_KEYS.workspaces, readList<Workspace>(COLLECTION_KEYS.workspaces).filter((x) => x.id !== id));
}

export function addToWorkspace(workspaceId: string, item: Omit<WorkspaceItem, "id" | "saved">) {
  const list = readList<Workspace>(COLLECTION_KEYS.workspaces);
  const w = list.find((x) => x.id === workspaceId);
  if (!w) return false;
  return upsertWorkspace({ ...w, items: [...w.items, { ...item, id: newId("i"), saved: Date.now() }] });
}

export function readWorkspaces() {
  return readList<Workspace>(COLLECTION_KEYS.workspaces);
}
export function readPipelines() {
  return readList<SavedPipeline>(COLLECTION_KEYS.pipelines);
}

/** Bytes this app holds in localStorage, for the settings drawer. */
export function storageBytes(): number {
  if (typeof window === "undefined") return 0;
  let n = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (k.startsWith("fmt:")) n += k.length + (localStorage.getItem(k)?.length ?? 0);
    }
  } catch {
    /* ignore */
  }
  return n * 2;
}

/** Seeds the example workspace once, so a first visit has something to open. */
export function seedOnce(seed: () => void) {
  if (typeof window === "undefined") return;
  try {
    if (localStorage.getItem(COLLECTION_KEYS.seeded)) return;
    seed();
    localStorage.setItem(COLLECTION_KEYS.seeded, "1");
  } catch {
    /* ignore */
  }
}
