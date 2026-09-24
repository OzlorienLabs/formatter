import { diffLines, diffWordsWithSpace, diffChars, createTwoFilesPatch } from "diff";
import { escapeHtml } from "@/src/lib/highlight";
import type { DiffLine } from "../types";

export type DiffOptions = {
  ignoreWhitespace?: boolean;
  ignoreCase?: boolean;
  context?: number;
  inline?: "word" | "char" | "none";
};

function inlineMarkup(a: string, b: string, how: "word" | "char"): [string, string] {
  const parts = how === "char" ? diffChars(a, b) : diffWordsWithSpace(a, b);
  let l = "", r = "";
  for (const p of parts) {
    const e = escapeHtml(p.value);
    if (p.added) r += `<ins>${e}</ins>`;
    else if (p.removed) l += `<del>${e}</del>`;
    else { l += e; r += e; }
  }
  return [l, r];
}

/** Line diff with hunks of context and inline word/char highlighting. Text is escaped HTML. */
export function lineDiff(a: string, b: string, o: DiffOptions = {}) {
  const norm = (s: string) => {
    let x = s;
    if (o.ignoreWhitespace) x = x.split("\n").map((l) => l.trim().replace(/\s+/g, " ")).join("\n");
    if (o.ignoreCase) x = x.toLowerCase();
    return x;
  };
  const A = a.split("\n"), B = b.split("\n");
  const changes = diffLines(norm(a), norm(b));
  // Map normalised chunks back onto the original lines by count.
  type Row = { t: "ctx" | "add" | "del"; a?: number; b?: number; text: string };
  const rows: Row[] = [];
  let ia = 0, ib = 0;
  for (const c of changes) {
    const count = c.count ?? c.value.split("\n").length - (c.value.endsWith("\n") ? 1 : 0);
    for (let k = 0; k < count; k++) {
      if (c.added) { rows.push({ t: "add", b: ib + 1, text: B[ib] ?? "" }); ib++; }
      else if (c.removed) { rows.push({ t: "del", a: ia + 1, text: A[ia] ?? "" }); ia++; }
      else { rows.push({ t: "ctx", a: ia + 1, b: ib + 1, text: A[ia] ?? "" }); ia++; ib++; }
    }
  }
  let added = 0, removed = 0;
  // Inline highlight: pair runs of deletions with following additions.
  const out: DiffLine[] = rows.map((r) => ({ ...r, text: escapeHtml(r.text) }));
  for (let i = 0; i < rows.length; ) {
    if (rows[i].t !== "del") { i++; continue; }
    const ds: number[] = [], as: number[] = [];
    while (i < rows.length && rows[i].t === "del") ds.push(i++);
    while (i < rows.length && rows[i].t === "add") as.push(i++);
    if (o.inline !== "none")
      for (let k = 0; k < Math.min(ds.length, as.length); k++) {
        const [l, r] = inlineMarkup(rows[ds[k]].text, rows[as[k]].text, o.inline ?? "word");
        out[ds[k]].text = l;
        out[as[k]].text = r;
      }
  }
  rows.forEach((r) => { if (r.t === "add") added++; if (r.t === "del") removed++; });

  // Collapse unchanged runs to `context` lines around changes.
  const ctx = o.context ?? 3;
  const keep = new Array(out.length).fill(ctx < 0);
  if (ctx >= 0) out.forEach((r, i) => { if (r.t !== "ctx") for (let k = Math.max(0, i - ctx); k <= Math.min(out.length - 1, i + ctx); k++) keep[k] = true; });
  const hunks: DiffLine[] = [];
  out.forEach((r, i) => {
    if (!keep[i]) return;
    if (i > 0 && !keep[i - 1]) hunks.push({ t: "hunk", text: `@@ −${r.a ?? "?"} +${r.b ?? "?"} @@ · ${i - lastKept(keep, i)} unchanged lines hidden` });
    hunks.push(r);
  });
  const patch = createTwoFilesPatch("a", "b", a, b, "", "", { context: Math.max(0, ctx) });
  return { hunks, added, removed, same: added === 0 && removed === 0, patch };
}

function lastKept(keep: boolean[], i: number) {
  let k = i - 1;
  while (k >= 0 && !keep[k]) k--;
  return k + 1;
}
