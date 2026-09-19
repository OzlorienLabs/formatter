import { describe, it, expect } from "vitest";
import {
  MAX_FAVS,
  MAX_HISTORY,
  MAX_RECENTS,
  pushHistory,
  pushRecent,
  toggleFav,
  type HistoryEntry,
} from "./store";

const entry = (n: number, over: Partial<HistoryEntry> = {}): HistoryEntry => ({
  id: `id-${n}`,
  slug: "json-formatter",
  name: "JSON Formatter",
  t: n,
  fin: `input-${n}`,
  fout: `output-${n}`,
  opt: "2",
  ...over,
});

describe("history", () => {
  it("keeps the newest first", () => {
    const h = pushHistory(pushHistory([], entry(1)), entry(2));
    expect(h.map((e) => e.id)).toEqual(["id-2", "id-1"]);
  });

  it("caps at 60 entries, dropping the oldest", () => {
    let h: HistoryEntry[] = [];
    for (let n = 0; n < 75; n++) h = pushHistory(h, entry(n));
    expect(h).toHaveLength(MAX_HISTORY);
    expect(h[0].id).toBe("id-74");
    expect(h[MAX_HISTORY - 1].id).toBe("id-15");
  });

  it("skips a record whose slug and input match the newest entry", () => {
    const first = pushHistory([], entry(1));
    const again = pushHistory(first, entry(2, { fin: "input-1" }));
    expect(again).toBe(first);
    expect(again).toHaveLength(1);
  });

  it("records the same input again once another tool has run in between", () => {
    let h = pushHistory([], entry(1));
    h = pushHistory(h, entry(2, { slug: "json-minifier" }));
    h = pushHistory(h, entry(3, { fin: "input-1" }));
    expect(h).toHaveLength(3);
  });

  it("records a different input for the same tool", () => {
    let h = pushHistory([], entry(1));
    h = pushHistory(h, entry(2));
    expect(h).toHaveLength(2);
  });
});

describe("recents", () => {
  it("moves a repeat visit back to the front without duplicating it", () => {
    let r = pushRecent([], "a");
    r = pushRecent(r, "b");
    r = pushRecent(r, "a");
    expect(r).toEqual(["a", "b"]);
  });

  it("caps at 6", () => {
    let r: string[] = [];
    for (const s of ["a", "b", "c", "d", "e", "f", "g"]) r = pushRecent(r, s);
    expect(r).toHaveLength(MAX_RECENTS);
    expect(r[0]).toBe("g");
    expect(r).not.toContain("a");
  });
});

describe("favourites", () => {
  it("toggles membership", () => {
    expect(toggleFav([], "a")).toEqual(["a"]);
    expect(toggleFav(["a", "b"], "a")).toEqual(["b"]);
  });

  it("caps at 12", () => {
    const full = Array.from({ length: MAX_FAVS }, (_, n) => `t${n}`);
    expect(toggleFav(full, "extra")).toHaveLength(MAX_FAVS);
  });
});
