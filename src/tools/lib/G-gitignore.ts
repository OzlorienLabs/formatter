/**
 * .gitignore assembly (templates + custom rules, de-duplicated) and a real
 * gitignore matcher: negation, directory-only rules, anchoring, ** globs,
 * character classes, escapes, and "a parent directory excluded wins".
 */
import { TEMPLATES, resolveTemplate, type Template } from "./G-gitignore-data";

export type Rule = { pattern: string; negate: boolean; dirOnly: boolean; anchored: boolean; re: RegExp; line: number; source: string; text: string };

function globToRegex(glob: string, anchored: boolean): RegExp {
  let re = "";
  let i = 0;
  const n = glob.length;
  while (i < n) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      const atStart = i === 0;
      const before = i === 0 || glob[i - 1] === "/";
      const after = glob[i + 2] === "/" || i + 2 === n;
      if (before && after) {
        if (i + 2 === n) {
          // trailing "/**": everything inside
          re += ".*";
          i += 2;
        } else {
          // "**/" — zero or more directories
          re += atStart ? "(?:.*/)?" : "(?:.*/)?";
          i += 3;
        }
        continue;
      }
      re += "[^/]*";
      i += 2;
      continue;
    }
    if (c === "*") { re += "[^/]*"; i++; continue; }
    if (c === "?") { re += "[^/]"; i++; continue; }
    if (c === "\\" && i + 1 < n) { re += glob[i + 1].replace(/[.*+?^${}()|[\]\\/]/g, "\\$&"); i += 2; continue; }
    if (c === "[") {
      const end = glob.indexOf("]", i + 2);
      if (end > 0) {
        let body = glob.slice(i + 1, end);
        if (body[0] === "!") body = "^" + body.slice(1);
        re += "[" + body.replace(/\\/g, "\\\\") + "]";
        i = end + 1;
        continue;
      }
    }
    re += c.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
    i++;
  }
  return new RegExp("^" + (anchored ? "" : "(?:.*/)?") + re + "$");
}

export function parseRules(text: string, source: string, startLine = 1): Rule[] {
  const rules: Rule[] = [];
  text.split(/\r?\n/).forEach((raw, idx) => {
    let s = raw.replace(/(?<!\\)\s+$/, "");
    if (!s || s.startsWith("#")) return;
    let negate = false;
    if (s.startsWith("!")) {
      negate = true;
      s = s.slice(1);
    }
    if (s.startsWith("\\#") || s.startsWith("\\!")) s = s.slice(1);
    s = s.replace(/\\ /g, " ");
    let dirOnly = false;
    if (s.endsWith("/")) {
      dirOnly = true;
      s = s.slice(0, -1);
    }
    const anchored = s.includes("/");
    const pat = s.replace(/^\//, "");
    if (!pat) return;
    rules.push({ pattern: pat, negate, dirOnly, anchored, re: globToRegex(pat, anchored), line: startLine + idx, source, text: raw.trim() });
  });
  return rules;
}

function lastMatch(rules: Rule[], path: string, isDir: boolean): Rule | null {
  let hit: Rule | null = null;
  for (const r of rules) {
    if (r.dirOnly && !isDir) continue;
    if (r.re.test(path)) hit = r;
  }
  return hit;
}

export type Verdict = { path: string; ignored: boolean; rule: Rule | null; via?: string; blockedNegation?: Rule | null };

export function checkPath(rules: Rule[], input: string): Verdict {
  let path = input.trim().replace(/^\.\//, "").replace(/^\/+/, "");
  const isDir = path.endsWith("/");
  path = path.replace(/\/+$/, "");
  const segs = path.split("/");
  for (let i = 1; i < segs.length; i++) {
    const dir = segs.slice(0, i).join("/");
    const r = lastMatch(rules, dir, true);
    if (r && !r.negate) {
      // a later negation of the file cannot bring it back
      const own = lastMatch(rules, path, isDir);
      return { path: input.trim(), ignored: true, rule: r, via: dir + "/", blockedNegation: own && own.negate ? own : null };
    }
  }
  const r = lastMatch(rules, path, isDir);
  return { path: input.trim(), ignored: !!r && !r.negate, rule: r };
}

export type Built = { text: string; used: Template[]; unknown: string[]; dupes: number; rules: number; lineSource: Map<number, string> };

export function buildGitignore(names: string[], custom: string, o: { comments: boolean; dedupe: boolean }): Built {
  const used: Template[] = [];
  const unknown: string[] = [];
  for (const n of names) {
    if (!n.trim()) continue;
    const t = resolveTemplate(n);
    if (!t) unknown.push(n.trim());
    else if (!used.includes(t)) used.push(t);
  }
  const seen = new Set<string>();
  let dupes = 0;
  const out: string[] = [];
  const lineSource = new Map<number, string>();
  const push = (line: string, src: string) => {
    out.push(line);
    lineSource.set(out.length, src);
  };
  if (o.comments && (used.length || custom.trim())) {
    push(`# .gitignore — ${[...used.map((t) => t.name), ...(custom.trim() ? ["custom rules"] : [])].join(", ")}`, "");
    push("# Generated offline by Formatter. Patterns: * any chars except /, ** any depth, trailing / = directories only, ! re-includes.", "");
    push("", "");
  }
  const sections: { name: string; body: string }[] = used.map((t) => ({ name: t.name, body: t.body }));
  if (custom.trim()) sections.push({ name: "Custom rules", body: custom.replace(/\s+$/, "") });
  for (const sec of sections) {
    const lines = sec.body.split(/\r?\n/);
    const kept: string[] = [];
    let pendingComment: string[] = [];
    for (const l of lines) {
      const t = l.trim();
      if (!t) {
        if (pendingComment.length) pendingComment = [];
        if (o.comments && kept.length && kept[kept.length - 1] !== "") kept.push("");
        continue;
      }
      if (t.startsWith("#")) {
        if (o.comments) pendingComment.push(l);
        continue;
      }
      if (o.dedupe && seen.has(t)) {
        dupes++;
        continue;
      }
      seen.add(t);
      if (pendingComment.length) {
        kept.push(...pendingComment);
        pendingComment = [];
      }
      kept.push(l);
    }
    while (kept.length && kept[kept.length - 1] === "") kept.pop();
    if (!kept.length) continue;
    if (o.comments) push(`### ${sec.name} ${"#".repeat(Math.max(3, 60 - sec.name.length))}`, sec.name);
    kept.forEach((l) => push(l, sec.name));
    push("", "");
  }
  while (out.length && out[out.length - 1] === "") out.pop();
  const text = out.join("\n") + (out.length ? "\n" : "");
  const rules = text.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#")).length;
  return { text, used, unknown, dupes, rules, lineSource };
}

export function suggest(name: string): string | undefined {
  const n = name.toLowerCase();
  let best: { t: Template; d: number } | undefined;
  for (const t of TEMPLATES) {
    for (const cand of [t.id, t.name.toLowerCase(), ...(t.aliases ?? [])]) {
      const d = lev(n, cand);
      if (!best || d < best.d) best = { t, d };
    }
  }
  return best && best.d <= Math.max(2, Math.floor(n.length / 3)) ? best.t.name : undefined;
}

function lev(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}
