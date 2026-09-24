/**
 * Line-based YAML lint: duplicate keys, tabs, trailing spaces, long lines,
 * inconsistent indentation, YAML 1.1 gotchas (yes/no/on/off, octal-looking
 * numbers, sexagesimal 1:30, version numbers that turn into floats) and
 * anchors / aliases / merge keys. Complements js-yaml's syntax errors.
 */

export type LintIssue = { level: "error" | "warning" | "info"; message: string; line?: number; col?: number };
export type LintOpts = { maxLen: number; style: boolean; gotchas: boolean };

function stripComment(v: string): string {
  let q = "";
  for (let i = 0; i < v.length; i++) {
    const c = v[i];
    if (q) { if (c === q && !(q === "'" && v[i + 1] === "'")) q = ""; else if (q === "'" && c === "'" ) i++; continue; }
    if ((c === '"' || c === "'") && (i === 0 || /[\s,[{:]/.test(v[i - 1]))) { q = c; continue; }
    if (c === "#" && (i === 0 || /\s/.test(v[i - 1]))) return v.slice(0, i).trimEnd();
  }
  return v.trimEnd();
}

export function lintYaml(src: string, o: LintOpts): { issues: LintIssue[]; anchors: string[]; aliases: number } {
  const issues: LintIssue[] = [];
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  let blockIndent = -1;
  const keyScopes = new Map<number, Map<string, number>>();
  const incs = new Map<number, number>();
  const incLines: { line: number; inc: number; seq: boolean }[] = [];
  let prevIndent = 0;
  const anchors = new Map<string, number>();
  const aliasUse = new Map<string, number>();
  let aliases = 0;
  let trailing = 0, long = 0;

  const scalarGotcha = (raw: string, line: number, col: number) => {
    if (!o.gotchas) return;
    let v = raw.trim();
    v = v.replace(/^(&\S+\s+|!\S+\s+)+/, "");
    if (!v || /^["'[{|>*&!]/.test(v)) return;
    if (/^(yes|no|on|off|y|n)$/i.test(v))
      issues.push({ level: "warning", message: `Unquoted "${v}" is a string in YAML 1.2 but a boolean (${/^(yes|on|y)$/i.test(v)}) in YAML 1.1 parsers (PyYAML, Go yaml.v2, older Ruby). Quote it or use true/false.`, line, col });
    else if (/^[-+]?0[0-7]+$/.test(v) && v.replace(/^[-+]/, "") !== "0")
      issues.push({ level: "warning", message: `${v} looks octal: YAML 1.1 reads it as ${parseInt(v, 8)}, YAML 1.2 as ${parseInt(v, 10)}. Quote it if it is an ID, zip code or file mode.`, line, col });
    else if (/^\d{1,2}(:[0-5]\d){1,2}$/.test(v))
      issues.push({ level: "warning", message: `${v} is a base-60 number in YAML 1.1 (${v.split(":").reduce((a, b) => a * 60 + Number(b), 0)}). Quote times and port mappings like "22:22".`, line, col });
    else if (/^\d+\.\d*0$/.test(v))
      issues.push({ level: "warning", message: `${v} is parsed as the number ${Number(v)} — trailing zeros are lost. Quote version numbers.`, line, col });
  };

  const findRefs = (text: string, line: number, offset: number) => {
    const clean = text.replace(/"(?:[^"\\]|\\.)*"|'(?:[^']|'')*'/g, (m) => " ".repeat(m.length));
    for (const m of clean.matchAll(/(^|[\s[{,])&([^\s,[\]{}]+)/g)) {
      const name = m[2];
      if (anchors.has(name)) issues.push({ level: "info", message: `Anchor &${name} redefined (first at line ${anchors.get(name)}); later aliases use the new value`, line });
      anchors.set(name, line);
    }
    for (const m of clean.matchAll(/(^|[\s[{,])\*([^\s,[\]{}]+)/g)) {
      aliases++;
      aliasUse.set(m[2], (aliasUse.get(m[2]) ?? 0) + 1);
      if (!anchors.has(m[2])) issues.push({ level: "error", message: `Alias *${m[2]} refers to an anchor that is not defined above`, line, col: offset + (m.index ?? 0) + m[1].length + 1 });
    }
  };

  for (let idx = 0; idx < lines.length; idx++) {
    const ln = idx + 1;
    const line = lines[idx];
    if (o.style) {
      if (/[ \t]+$/.test(line)) { trailing++; if (trailing <= 20) issues.push({ level: "warning", message: "Trailing whitespace", line: ln, col: line.trimEnd().length + 1 }); }
      if ([...line].length > o.maxLen) { long++; if (long <= 20) issues.push({ level: "warning", message: `Line is ${[...line].length} characters (limit ${o.maxLen})`, line: ln, col: o.maxLen + 1 }); }
    }
    const lead = /^[ \t]*/.exec(line)![0];
    const indent = lead.length;
    if (!line.trim()) continue;
    if (blockIndent >= 0) {
      if (indent > blockIndent) continue;
      blockIndent = -1;
    }
    if (lead.includes("\t")) issues.push({ level: "error", message: "Tab used for indentation — YAML allows only spaces", line: ln, col: lead.indexOf("\t") + 1 });
    const t = line.trim();
    if (t.startsWith("#")) continue;
    if (t === "---" || t.startsWith("--- ") || t === "..." || t.startsWith("%")) {
      keyScopes.clear();
      prevIndent = 0;
      if (t.startsWith("--- ")) findRefs(t.slice(4), ln, 4);
      continue;
    }
    if (/\t/.test(line.slice(indent)) && !/["']/.test(line) && o.style) issues.push({ level: "info", message: "Tab character inside a value", line: ln, col: line.indexOf("\t", indent) + 1 });

    // indentation step
    if (indent > prevIndent) {
      const inc = indent - prevIndent;
      incs.set(inc, (incs.get(inc) ?? 0) + 1);
      incLines.push({ line: ln, inc, seq: /^\s*-(\s|$)/.test(line) });
    }
    prevIndent = indent;

    // strip "- " sequence markers (possibly several: "- - a")
    let rest = line.slice(indent);
    let eff = indent;
    let seq = false;
    while (/^-(\s|$)/.test(rest)) {
      seq = true;
      const m = /^-\s*/.exec(rest)!;
      eff += m[0].length;
      rest = rest.slice(m[0].length);
    }
    for (const k of [...keyScopes.keys()]) if (k > eff || (seq && k >= eff)) keyScopes.delete(k);
    if (!rest) continue;
    findRefs(stripComment(rest), ln, eff);

    // key: value
    const km = /^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^\s#'"[{&*!|>][^#]*?|<<)\s*:(\s|$)/.exec(rest);
    if (km && !/^[[{]/.test(rest)) {
      const key = km[1].replace(/^"(.*)"$/s, "$1").replace(/^'(.*)'$/s, "$1");
      let scope = keyScopes.get(eff);
      if (!scope) { scope = new Map(); keyScopes.set(eff, scope); }
      if (key === "<<") issues.push({ level: "info", message: "Merge key <<: — supported by js-yaml and YAML 1.1 parsers, not part of YAML 1.2 core", line: ln, col: eff + 1 });
      else if (scope.has(key)) issues.push({ level: "warning", message: `Duplicate key "${key}" (first defined on line ${scope.get(key)}); most parsers keep only the last value`, line: ln, col: eff + 1 });
      else scope.set(key, ln);
      if (o.gotchas && /^(yes|no|on|off|y|n)$/i.test(key)) issues.push({ level: "warning", message: `Key "${key}" becomes a boolean key in YAML 1.1 parsers — quote it`, line: ln, col: eff + 1 });
      const value = stripComment(rest.slice(km[0].length));
      if (/^[|>][-+0-9]*$/.test(value.replace(/^(&\S+\s+|!\S+\s+)+/, ""))) { blockIndent = indent; continue; }
      scalarGotcha(value, ln, eff + km[0].length + 1);
      continue;
    }
    const value = stripComment(rest);
    if (/^[|>][-+0-9]*$/.test(value)) { blockIndent = indent; continue; }
    if (seq) scalarGotcha(value, ln, eff + 1);
  }

  if (trailing > 20) issues.push({ level: "warning", message: `…and ${trailing - 20} more lines with trailing whitespace` });
  if (long > 20) issues.push({ level: "warning", message: `…and ${long - 20} more long lines` });
  if (o.style && incs.size > 1) {
    // Sequence items under a key may sit at +0 or +2; only flag steps that are neither the dominant one nor a multiple of it.
    const dominant = [...incs.entries()].sort((a, b) => b[1] - a[1])[0][0];
    let shown = 0;
    for (const { line, inc, seq } of incLines) {
      // "- item" lines may legitimately sit at +2 (or +0) under a key.
      if (inc === dominant || (seq && inc <= dominant)) continue;
      if (++shown > 10) break;
      issues.push({ level: "warning", message: `Inconsistent indentation: indented by ${inc} here, ${dominant} elsewhere`, line, col: 1 });
    }
  }
  for (const [name, line] of anchors) {
    const used = aliasUse.get(name) ?? 0;
    issues.push(used ? { level: "info", message: `Anchor &${name} is reused by ${used} alias${used === 1 ? "" : "es"}`, line } : { level: "warning", message: `Anchor &${name} is never used`, line });
  }
  return { issues, anchors: [...anchors.keys()], aliases };
}
