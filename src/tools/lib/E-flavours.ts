/**
 * Regex flavours: detect constructs, translate a pattern to JavaScript so it
 * can run here, and render correctly escaped snippets for other languages.
 */

export type Flavour = "js" | "python" | "go" | "java" | "pcre" | "dotnet" | "rust";
export const FLAVOURS: [Flavour, string][] = [
  ["js", "JavaScript"],
  ["python", "Python re"],
  ["go", "Go RE2"],
  ["java", "Java"],
  ["pcre", "PCRE"],
  ["dotnet", ".NET"],
  ["rust", "Rust regex"],
];
export const flavourName = (f: Flavour) => FLAVOURS.find(([k]) => k === f)?.[1] ?? f;

type Support = "yes" | "no" | "partial";
type Construct = {
  id: string;
  label: string;
  test: RegExp;
  support: Record<Flavour, Support>;
  note: string;
};

const all = (s: Support): Record<Flavour, Support> => ({ js: s, python: s, go: s, java: s, pcre: s, dotnet: s, rust: s });
const S = (o: Partial<Record<Flavour, Support>>, base: Support = "yes") => ({ ...all(base), ...o });

/** Constructs are detected on the pattern with escapes and classes taken into account (see `scan`). */
export const CONSTRUCTS: Construct[] = [
  { id: "lookahead", label: "Lookahead (?= (?!", test: /\(\?[=!]/, support: S({ go: "no", rust: "no" }), note: "RE2 and Rust guarantee linear time, so they drop lookaround." },
  { id: "lookbehind", label: "Lookbehind (?<= (?<!", test: /\(\?<[=!]/, support: S({ go: "no", rust: "no" }), note: "Go and Rust reject it at compile time." },
  { id: "varlookbehind", label: "Variable-length lookbehind", test: /\(\?<[=!][^)]*(?:[*+]|\{\d+,\d*\})/, support: S({ python: "no", pcre: "partial", java: "partial", go: "no", rust: "no" }), note: "Python needs fixed width; Java needs a bounded maximum; PCRE2 ≥10.43 allows limited variable length. JS and .NET allow any." },
  { id: "backref", label: "Numbered backreference \\1", test: /\\[1-9]/, support: S({ go: "no", rust: "no" }), note: "Backreferences make matching NP-hard, so RE2 and Rust omit them." },
  { id: "namedbackref", label: "Named backreference \\k<n> / (?P=n)", test: /\\k[<'{]|\(\?P=/, support: S({ go: "no", rust: "no" }), note: "Python spells it (?P=name); the others \\k<name>." },
  { id: "named", label: "Named group (?<n>…)", test: /\(\?<[A-Za-z_]/, support: S({ python: "partial" }), note: "Python re only accepts (?P<name>…); Go ≥1.22 and Rust ≥1.9 accept both." },
  { id: "namedP", label: "Named group (?P<n>…)", test: /\(\?P</, support: S({ js: "no", java: "no", dotnet: "no" }), note: "Python/Go/Rust/PCRE syntax; JavaScript, Java and .NET need (?<name>…)." },
  { id: "possessive", label: "Possessive quantifier *+ ++ ?+", test: /(?:[*+?]|\})\+/, support: S({ js: "no", go: "no", rust: "no", dotnet: "no" }), note: "Python supports them from 3.11." },
  { id: "atomic", label: "Atomic group (?>…)", test: /\(\?>/, support: S({ js: "no", go: "no", rust: "no" }), note: "Python supports them from 3.11." },
  { id: "lazy", label: "Lazy quantifier *? +? ??", test: /(?:[*+?]|\})\?/, support: all("yes"), note: "Universal." },
  { id: "unicodeprop", label: "Unicode property \\p{…}", test: /\\[pP]\{/, support: S({ python: "no", js: "partial", dotnet: "partial" }), note: "JS needs the u/v flag; .NET has categories but scripts are \\p{IsGreek} blocks; Python re has none (use the regex module)." },
  { id: "recursion", label: "Recursion (?R) (?1) (?&n)", test: /\(\?(?:R|[+-]?\d+|&\w+|P>\w+)\)/, support: S({ pcre: "yes" }, "no"), note: "PCRE only (.NET has balancing groups instead)." },
  { id: "conditional", label: "Conditional (?(1)yes|no)", test: /\(\?\(/, support: S({ js: "no", go: "no", rust: "no", java: "no" }), note: "PCRE, .NET and Python support conditionals on a group." },
  { id: "keep", label: "Match reset \\K", test: /\\K/, support: S({ pcre: "yes" }, "no"), note: "PCRE only; rewritten as a lookbehind for JavaScript when possible." },
  { id: "inlineflags", label: "Inline flags (?i) (?m) (?s) (?x)", test: /\(\?[imsxU-]+\)/, support: S({ js: "no" }), note: "JavaScript uses /…/flags (ES2025 adds scoped (?i:…) only)." },
  { id: "scopedflags", label: "Scoped flags (?i:…)", test: /\(\?[imsx-]+:/, support: S({ js: "partial" }), note: "JavaScript since ES2025 (Chrome 125, Firefox 132, Safari 18.x)." },
  { id: "anchorsAZ", label: "\\A \\Z \\z anchors", test: /\\[AZz]/, support: S({ js: "no", go: "partial", rust: "partial", python: "partial" }), note: "Go and Rust have \\A and \\z; Python has \\A and \\Z (= \\z; \\z too from 3.14); JS uses ^/$ without the m flag." },
  { id: "posix", label: "POSIX class [[:alpha:]]", test: /\[:[a-z]+:\]/, support: S({ js: "no", python: "no", java: "no", dotnet: "no" }), note: "PCRE, Go and Rust only." },
  { id: "hexbrace", label: "\\x{…} code point", test: /\\x\{/, support: S({ js: "no", python: "no", dotnet: "no" }), note: "JavaScript uses \\u{…} with the u flag; Python \\U0001F600." },
  { id: "classops", label: "Class set operations && --", test: /\[[^\]]*(?:&&|--)/, support: S({ python: "no", go: "no", pcre: "no", dotnet: "partial", js: "partial" }, "yes"), note: "Java and Rust support &&; JS needs the v flag; .NET has subtraction [a-z-[aeiou]] only." },
  { id: "horizontal", label: "\\h \\R \\X", test: /\\[hRX]/, support: S({ js: "no", python: "no", go: "no", rust: "no", dotnet: "no" }), note: "PCRE and Java." },
];

/** Replace escaped characters and class bodies with placeholders so detection is not fooled. */
function scanForDetection(p: string): string {
  // Keep escapes (they matter for \1, \p, \K) but blank out the escaped char after a backslash-backslash.
  return p.replace(/\\\\/g, "__");
}

export function detectConstructs(p: string, flavour: Flavour): Construct[] {
  const s = scanForDetection(p);
  return CONSTRUCTS.filter((c) => {
    if (c.id === "named" && flavour === "python") return /\(\?<[A-Za-z_]/.test(s);
    return c.test.test(s);
  });
}

/* ── translation to JavaScript ───────────────────────────────────────── */

export type Translation = { source: string; flags: string; notes: { level: "info" | "warning" | "error"; message: string }[]; runnable: boolean };

const POSIX: Record<string, string> = {
  alpha: "a-zA-Z", digit: "0-9", alnum: "a-zA-Z0-9", upper: "A-Z", lower: "a-z", space: "\\s", punct: "!-\\/:-@\\[-`{-~", xdigit: "0-9A-Fa-f", word: "\\w", blank: " \\t", cntrl: "\\x00-\\x1f\\x7f", print: " -~", graph: "!-~",
};

export function stripExtended(p: string): string {
  let out = "";
  let inClass = false;
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === "\\") {
      out += c + (p[i + 1] ?? "");
      i++;
      continue;
    }
    if (inClass) {
      if (c === "]") inClass = false;
      out += c;
      continue;
    }
    if (c === "[") {
      inClass = true;
      out += c;
      continue;
    }
    if (c === "#") {
      while (i < p.length && p[i] !== "\n") i++;
      continue;
    }
    if (/\s/.test(c)) continue;
    out += c;
  }
  return out;
}

export function toJs(pattern: string, flavour: Flavour, baseFlags: string): Translation {
  const notes: Translation["notes"] = [];
  let p = pattern;
  const flags = new Set(baseFlags.split("").filter(Boolean));
  let runnable = true;

  // Leading inline flags (?imsx) become regex flags.
  const lead = /^\(\?([imsxuU]+)\)/.exec(p);
  if (lead && flavour !== "js") {
    p = p.slice(lead[0].length);
    for (const f of lead[1]) {
      if (f === "x") flags.add("x");
      else if ("ims".includes(f)) flags.add(f);
      else if (f === "U") notes.push({ level: "warning", message: "(?U) swaps greedy and lazy (Go/Rust/PCRE); JavaScript has no equivalent — quantifiers stay greedy." });
    }
    notes.push({ level: "info", message: `Inline flags (?${lead[1]}) at the start became JavaScript flags.` });
  }
  if (flags.has("x")) {
    p = stripExtended(p);
    flags.delete("x");
    notes.push({ level: "info", message: "Verbose/extended mode: whitespace and # comments were stripped." });
  }
  if (/\(\?[imsx-]+\)/.test(p)) {
    notes.push({ level: "warning", message: "Inline flags in the middle of the pattern apply from that point on in PCRE/Java/Python; JavaScript cannot do that, so they were applied to the whole pattern." });
    p = p.replace(/\(\?([imsx]+)\)/g, (_, f: string) => {
      for (const c of f) if (c !== "x") flags.add(c);
      return "";
    });
  }

  // Named groups and backreferences.
  if (/\(\?P</.test(p)) {
    p = p.replace(/\(\?P<([A-Za-z_]\w*)>/g, "(?<$1>");
    notes.push({ level: "info", message: "(?P<name>…) → (?<name>…)." });
  }
  if (/\(\?'[A-Za-z_]\w*'/.test(p)) {
    p = p.replace(/\(\?'([A-Za-z_]\w*)'/g, "(?<$1>");
    notes.push({ level: "info", message: "(?'name'…) → (?<name>…)." });
  }
  if (/\(\?P=\w+\)/.test(p)) {
    p = p.replace(/\(\?P=(\w+)\)/g, "\\k<$1>");
    notes.push({ level: "info", message: "(?P=name) → \\k<name>." });
  }
  p = p.replace(/\\k'(\w+)'|\\k\{(\w+)\}|\\g\{(\w+)\}|\\g(\d)/g, (_m, a, b, c, d) => (d ? `\\${d}` : /^\d+$/.test(a ?? b ?? c) ? `\\${a ?? b ?? c}` : `\\k<${a ?? b ?? c}>`));

  // Anchors.
  if (/\\A/.test(p)) {
    p = p.replace(/\\A/g, flags.has("m") ? "(?<![\\s\\S])" : "^");
    notes.push({ level: "info", message: "\\A (start of text) → " + (flags.has("m") ? "(?<![\\s\\S]) because ^ means start of line under m." : "^.") });
  }
  if (/\\[Zz]/.test(p)) {
    const javaZ = (flavour === "java" || flavour === "pcre" || flavour === "dotnet") && /\\Z/.test(p);
    p = p.replace(/\\z/g, flags.has("m") ? "(?![\\s\\S])" : "$");
    p = p.replace(/\\Z/g, javaZ ? "(?=\\n?(?![\\s\\S]))" : flags.has("m") ? "(?![\\s\\S])" : "$");
    notes.push({ level: "info", message: javaZ ? "\\Z (end, before a final newline) → (?=\\n?(?![\\s\\S]))." : "\\z / \\Z (absolute end of text) → $." });
  }
  if (flavour === "python" && /\$/.test(p.replace(/\\\$/g, "")) && !flags.has("m")) {
    notes.push({ level: "info", message: "In Python, $ also matches just before a trailing newline; JavaScript's $ does not." });
  }

  // \K → lookbehind when it sits at the top level.
  if (/\\K/.test(p)) {
    const idx = p.indexOf("\\K");
    const before = p.slice(0, idx);
    if (!/[|()]/.test(before.replace(/\\./g, ""))) {
      p = `(?<=${before})${p.slice(idx + 2)}`;
      notes.push({ level: "info", message: "\\K rewritten as a lookbehind (?<=…) — same match text." });
    } else {
      runnable = false;
      notes.push({ level: "error", message: "\\K inside groups or alternations cannot be expressed in JavaScript." });
    }
  }

  // Possessive and atomic → plain (with a warning).
  if (/(?:[*+?]|\})\+/.test(p.replace(/\\./g, "__"))) {
    p = p.replace(/(\\.|\[(?:\\.|[^\]])*\])|([*+?]|\{\d+(?:,\d*)?\})\+/g, (m, esc, q) => (esc ? esc : q));
    notes.push({ level: "warning", message: "Possessive quantifiers became greedy — JavaScript may backtrack where the original would fail fast, so some non-matches can match here." });
  }
  if (/\(\?>/.test(p)) {
    p = p.replace(/\(\?>/g, "(?:");
    notes.push({ level: "warning", message: "Atomic groups (?>…) became non-capturing groups — backtracking into them is possible in JavaScript." });
  }

  // POSIX classes, \x{…}, \h, Python \U, Java \p{IsX} / \p{javaX}.
  if (/\[:[a-z]+:\]/.test(p)) {
    p = p.replace(/\[:(\^?)([a-z]+):\]/g, (m, neg, name) => (POSIX[name] && !neg ? POSIX[name] : m));
    notes.push({ level: "info", message: "POSIX classes [:name:] expanded to ASCII ranges." });
  }
  if (/\\x\{[0-9a-fA-F]+\}/.test(p)) {
    p = p.replace(/\\x\{([0-9a-fA-F]+)\}/g, "\\u{$1}");
    flags.add("u");
    notes.push({ level: "info", message: "\\x{…} → \\u{…} (u flag added)." });
  }
  if (/\\U[0-9a-fA-F]{8}/.test(p)) {
    p = p.replace(/\\U([0-9a-fA-F]{8})/g, (_, h: string) => `\\u{${h.replace(/^0+/, "") || "0"}}`);
    flags.add("u");
  }
  if (/\\h/.test(p)) p = p.replace(/\\h/g, "[ \\t\\u00a0]");
  if (/\\R/.test(p)) p = p.replace(/\\R/g, "(?:\\r\\n|[\\n\\v\\f\\r\\u0085\\u2028\\u2029])");
  if (/\\p\{Is[A-Z]/.test(p)) p = p.replace(/\\([pP])\{Is([A-Z][A-Za-z]+)\}/g, "\\$1{Script=$2}");
  if (/\\[pP]\{/.test(p)) {
    if (!flags.has("u") && !flags.has("v")) notes.push({ level: "info", message: "\\p{…} needs the u flag in JavaScript — added." });
    flags.add("u");
  }

  if (/\(\?\(/.test(p)) {
    runnable = false;
    notes.push({ level: "error", message: "Conditionals (?(…)…) have no JavaScript equivalent." });
  }
  if (/\(\?(?:R|[+-]?\d+|&\w+|P>\w+)\)/.test(p)) {
    runnable = false;
    notes.push({ level: "error", message: "Recursion (?R)/(?1)/(?&name) has no JavaScript equivalent." });
  }
  if (flavour === "python" || flavour === "rust" || flavour === "dotnet") {
    if (/\\w|\\d|\\b/.test(p)) notes.push({ level: "info", message: `${flavourName(flavour)} treats \\w, \\d and \\b as Unicode-aware by default; JavaScript's are ASCII-only.` });
  }
  if (flavour === "go" || flavour === "rust") notes.push({ level: "info", message: `${flavourName(flavour)} returns leftmost-first matches like JavaScript, but guarantees linear time.` });

  flags.add("g");
  return { source: p, flags: [...flags].filter((f) => "dgimsuvy".includes(f)).sort().join(""), notes, runnable };
}

/* ── snippets ────────────────────────────────────────────────────────── */

export type SnippetLang = "python" | "go" | "java" | "js" | "csharp" | "rust" | "php";
export const SNIPPET_LANGS: [SnippetLang, string][] = [
  ["python", "Python"],
  ["go", "Go"],
  ["java", "Java"],
  ["js", "JavaScript"],
  ["csharp", "C#"],
  ["rust", "Rust"],
  ["php", "PHP"],
];

/** Turn the (already JS-normalised or source) pattern into the target's syntax. */
export function adaptPattern(p: string, target: SnippetLang): { pattern: string; warnings: string[] } {
  const warnings: string[] = [];
  let out = p;
  const pyLike = target === "python";
  if (pyLike) {
    out = out.replace(/\(\?<([A-Za-z_]\w*)>/g, "(?P<$1>").replace(/\\k<(\w+)>/g, "(?P=$1)");
  } else if (target === "go") {
    out = out.replace(/\(\?<([A-Za-z_]\w*)>/g, "(?P<$1>");
  } else {
    out = out.replace(/\(\?P<([A-Za-z_]\w*)>/g, "(?<$1>").replace(/\(\?P=(\w+)\)/g, "\\k<$1>");
  }
  if (target === "js") out = out.replace(/\\u\{/g, "\\u{");
  if (target === "go" || target === "rust") {
    const probe = out.replace(/\\\\/g, "__");
    if (/\(\?<?[=!]/.test(probe)) warnings.push(`${target === "go" ? "Go RE2" : "Rust regex"} has no lookaround — compiling this pattern fails.`);
    if (/\\[1-9]|\\k</.test(probe)) warnings.push(`${target === "go" ? "Go RE2" : "Rust regex"} has no backreferences — compiling this pattern fails.`);
  }
  if (target === "python" && /\\[pP]\{/.test(out)) warnings.push("Python re has no \\p{…}; install and use the third-party regex module.");
  if (target === "js" && /\(\?>|(?:[*+?]|\})\+/.test(out.replace(/\\./g, "__"))) warnings.push("JavaScript has no atomic groups or possessive quantifiers.");
  return { pattern: out, warnings };
}

const pyStr = (p: string) => {
  if (!/\\$/.test(p.replace(/\\\\/g, ""))) {
    if (!p.includes('"') && !p.includes("\n")) return `r"${p}"`;
    if (!p.includes("'") && !p.includes("\n")) return `r'${p}'`;
    if (!p.includes('"""')) return `r"""${p}"""`;
  }
  return JSON.stringify(p);
};
const goStr = (p: string) => (p.includes("`") ? JSON.stringify(p) : `\`${p}\``);
const javaStr = (p: string) => '"' + p.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\t/g, "\\t") + '"';
const csStr = (p: string) => '@"' + p.replace(/"/g, '""') + '"';
const rustStr = (p: string) => {
  let hashes = "";
  while (p.includes('"' + hashes)) hashes += "#";
  return `r${hashes}"${p}"${hashes}`;
};
const phpStr = (p: string, flags: string) => "'/" + p.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/(^|[^\\])\//g, "$1\\/") + "/" + flags + "'";
const jsLit = (p: string, flags: string) => "/" + p.replace(/(\\.)|(\[(?:\\.|[^\]])*\])|\//g, (m, esc, cls) => esc ?? cls ?? "\\/") + "/" + flags;

export function snippet(lang: SnippetLang, rawPattern: string, flagSet: string, sample: string, groupNames: string[]): string {
  const { pattern, warnings } = adaptPattern(rawPattern, lang);
  const f = new Set(flagSet.split(""));
  const warn = (c: string) => warnings.map((w) => `${c} ⚠ ${w}`).join("\n") + (warnings.length ? "\n" : "");
  const sampleLine = sample.split("\n")[0].slice(0, 120);
  const named = groupNames.filter(Boolean);
  switch (lang) {
    case "python": {
      const fl = [f.has("i") && "re.IGNORECASE", f.has("m") && "re.MULTILINE", f.has("s") && "re.DOTALL", f.has("x") && "re.VERBOSE"].filter(Boolean).join(" | ");
      return `${warn("#")}import re

pattern = re.compile(${pyStr(pattern)}${fl ? `, ${fl}` : ""})
text = ${JSON.stringify(sampleLine)}

for m in pattern.finditer(text):
    print(m.start(), m.end(), repr(m.group(0)))${named.length ? `\n    print(m.groupdict())  # ${named.join(", ")}` : "\n    print(m.groups())"}

print(pattern.sub("<\\\\g<0>>", text))
`;
    }
    case "go": {
      const inline = ["i", "m", "s"].filter((x) => f.has(x)).join("");
      return `${warn("//")}package main

import (
\t"fmt"
\t"regexp"
)

func main() {
\tre := regexp.MustCompile(${goStr((inline ? `(?${inline})` : "") + pattern)})
\ttext := ${JSON.stringify(sampleLine)}

\tfor _, m := range re.FindAllStringSubmatchIndex(text, -1) {
\t\tfmt.Println(m[0], m[1], text[m[0]:m[1]])
\t}${named.length ? `\n\tfor _, name := range re.SubexpNames() {\n\t\tif name != "" {\n\t\t\tfmt.Println("group", name, re.SubexpIndex(name))\n\t\t}\n\t}` : ""}
\tfmt.Println(re.ReplaceAllString(text, "<$0>"))
}
`;
    }
    case "java": {
      const fl = [f.has("i") && "Pattern.CASE_INSENSITIVE", f.has("m") && "Pattern.MULTILINE", f.has("s") && "Pattern.DOTALL", f.has("x") && "Pattern.COMMENTS", f.has("u") && "Pattern.UNICODE_CHARACTER_CLASS"].filter(Boolean).join(" | ");
      return `${warn("//")}import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class Main {
    public static void main(String[] args) {
        Pattern p = Pattern.compile(${javaStr(pattern)}${fl ? `, ${fl}` : ""});
        String text = ${javaStr(sampleLine)};
        Matcher m = p.matcher(text);
        while (m.find()) {
            System.out.println(m.start() + "-" + m.end() + ": " + m.group());${named.map((n) => `\n            System.out.println("  ${n} = " + m.group(${javaStr(n)}));`).join("")}
        }
        System.out.println(p.matcher(text).replaceAll("<$0>"));
    }
}
`;
    }
    case "js": {
      const fl = ["d", "g", "i", "m", "s", "u", "v", "y"].filter((x) => f.has(x) || x === "g").join("");
      return `${warn("//")}const re = ${jsLit(pattern, fl)};
const text = ${JSON.stringify(sampleLine)};

for (const m of text.matchAll(re)) {
  console.log(m.index, m[0]${named.length ? ", m.groups" : ""});
}

console.log(text.replace(re, "<$&>"));
`;
    }
    case "csharp": {
      const fl = [f.has("i") && "RegexOptions.IgnoreCase", f.has("m") && "RegexOptions.Multiline", f.has("s") && "RegexOptions.Singleline", f.has("x") && "RegexOptions.IgnorePatternWhitespace"].filter(Boolean).join(" | ");
      return `${warn("//")}using System;
using System.Text.RegularExpressions;

var re = new Regex(${csStr(pattern)}${fl ? `, ${fl}` : ""});
var text = ${JSON.stringify(sampleLine)};

foreach (Match m in re.Matches(text))
{
    Console.WriteLine($"{m.Index}: {m.Value}");${named.map((n) => `\n    Console.WriteLine($"  ${n} = {m.Groups["${n}"].Value}");`).join("")}
}

Console.WriteLine(re.Replace(text, "<$0>"));
`;
    }
    case "rust": {
      const builder = ["i", "m", "s", "x"].some((x) => f.has(x));
      const ctor = builder
        ? `RegexBuilder::new(${rustStr(pattern)})${f.has("i") ? "\n        .case_insensitive(true)" : ""}${f.has("m") ? "\n        .multi_line(true)" : ""}${f.has("s") ? "\n        .dot_matches_new_line(true)" : ""}${f.has("x") ? "\n        .ignore_whitespace(true)" : ""}\n        .build()\n        .unwrap()`
        : `Regex::new(${rustStr(pattern)}).unwrap()`;
      return `${warn("//")}// Cargo.toml: regex = "1"
use regex::${builder ? "RegexBuilder" : "Regex"};

fn main() {
    let re = ${ctor};
    let text = ${JSON.stringify(sampleLine)};

    for caps in re.captures_iter(text) {
        let m = caps.get(0).unwrap();
        println!("{}-{}: {}", m.start(), m.end(), m.as_str());${named.map((n) => `\n        if let Some(g) = caps.name("${n}") { println!("  ${n} = {}", g.as_str()); }`).join("")}
    }

    println!("{}", re.replace_all(text, "<$0>"));
}
`;
    }
    case "php": {
      const fl = ["i", "m", "s", "x", "u"].filter((x) => f.has(x)).join("");
      return `${warn("//")}<?php
$pattern = ${phpStr(pattern, fl)};
$text = ${JSON.stringify(sampleLine).replace(/\$/g, "\\$")};

preg_match_all($pattern, $text, $matches, PREG_SET_ORDER | PREG_OFFSET_CAPTURE);
foreach ($matches as $m) {
    echo $m[0][1], ": ", $m[0][0], PHP_EOL;
}

echo preg_replace($pattern, '<$0>', $text), PHP_EOL;
`;
    }
  }
}
