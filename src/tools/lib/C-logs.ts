/** Log parsing (JSON lines, logfmt, Apache/Nginx, syslog, generic) and PII / secret redaction. */
import { fnv1a } from "./C-util";

export type Level = "ERROR" | "WARN" | "INFO" | "DEBUG" | "OTHER";
export type Entry = { raw: string; time: string; level: Level; levelRaw: string; source: string; message: string; format: string; lineNo: number };

export function normLevel(s: string | undefined | null): Level {
  const l = String(s ?? "").toLowerCase();
  if (/^(err|error|fatal|crit|critical|alert|emerg|emergency|severe|panic|e|f)$/.test(l)) return "ERROR";
  if (/^(warn|warning|w)$/.test(l)) return "WARN";
  if (/^(info|information|notice|informational|i|n)$/.test(l)) return "INFO";
  if (/^(debug|trace|verbose|fine|finer|finest|d|t|v)$/.test(l)) return "DEBUG";
  if (/^\d+$/.test(l)) {
    // pino / bunyan numeric levels
    const n = +l;
    if (n >= 50) return "ERROR";
    if (n >= 40) return "WARN";
    if (n >= 30) return "INFO";
    return "DEBUG";
  }
  return "OTHER";
}

const pick = (o: Record<string, unknown>, keys: string[]) => {
  for (const k of keys) {
    const v = k.includes(".") ? k.split(".").reduce<unknown>((a, p) => (a && typeof a === "object" ? (a as Record<string, unknown>)[p] : undefined), o) : o[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
};
const TIME_KEYS = ["time", "timestamp", "ts", "@timestamp", "date", "datetime", "t", "eventTime"];
const LEVEL_KEYS = ["level", "severity", "lvl", "log.level", "levelname", "loglevel", "status"];
const MSG_KEYS = ["msg", "message", "event", "text", "error.message", "err.message"];
const SRC_KEYS = ["logger", "name", "service", "source", "module", "component", "caller", "service.name", "app", "host", "hostname"];

function fmtTime(v: unknown): string {
  if (typeof v === "number") {
    const ms = v > 1e14 ? v / 1000 : v > 1e11 ? v : v * 1000;
    return new Date(ms).toISOString();
  }
  return String(v ?? "");
}

function parseLogfmt(l: string): Record<string, string> | null {
  const o: Record<string, string> = {};
  const re = /([\w.@-]+)=("(?:[^"\\]|\\.)*"|\S*)/g;
  let m: RegExpExecArray | null;
  let count = 0;
  while ((m = re.exec(l))) {
    o[m[1]] = m[2].startsWith('"') ? m[2].slice(1, -1).replace(/\\"/g, '"') : m[2];
    count++;
  }
  return count >= 2 && /^\s*[\w.@-]+=/.test(l) ? o : null;
}

const SYSLOG_SEV: Level[] = ["ERROR", "ERROR", "ERROR", "ERROR", "WARN", "INFO", "INFO", "DEBUG"];
const LEVEL_WORD = /\b(TRACE|DEBUG|INFO|NOTICE|WARN(?:ING)?|ERROR|ERR|FATAL|CRIT(?:ICAL)?|SEVERE)\b/;

export function parseLine(l: string, lineNo: number, force: string): Entry {
  const base: Entry = { raw: l, time: "", level: "OTHER", levelRaw: "", source: "", message: l, format: "text", lineNo };
  const t = l.trim();
  let m: RegExpExecArray | null;
  if ((force === "auto" || force === "json") && t.startsWith("{")) {
    try {
      const o = JSON.parse(t) as Record<string, unknown>;
      const lv = pick(o, LEVEL_KEYS);
      return { ...base, format: "json", time: fmtTime(pick(o, TIME_KEYS)), levelRaw: String(lv ?? ""), level: normLevel(lv as string), source: String(pick(o, SRC_KEYS) ?? ""), message: String(pick(o, MSG_KEYS) ?? t) };
    } catch {
      /* not JSON */
    }
  }
  if (force === "auto" || force === "combined") {
    m = /^(\S+) \S+ (\S+) \[([^\]]+)\] "([^"]*)" (\d{3}) (\S+)(?: "([^"]*)" "([^"]*)")?/.exec(t);
    if (m) {
      const st = +m[5];
      return { ...base, format: "combined", time: m[3], levelRaw: m[5], level: st >= 500 ? "ERROR" : st >= 400 ? "WARN" : "INFO", source: m[1], message: `${m[4]} → ${m[5]} (${m[6]} bytes)${m[8] ? ` · ${m[8]}` : ""}` };
    }
  }
  if (force === "auto" || force === "syslog") {
    m = /^<(\d{1,3})>1 (\S+) (\S+) (\S+) (\S+) (\S+) (-|\[.*?\]) ?(.*)$/.exec(t);
    if (m) return { ...base, format: "syslog", time: m[2], levelRaw: `pri ${m[1]}`, level: SYSLOG_SEV[+m[1] % 8], source: `${m[3]} ${m[4]}${m[5] !== "-" ? `[${m[5]}]` : ""}`, message: m[8] };
    m = /^(?:<(\d{1,3})>)?([A-Z][a-z]{2} [ \d]\d \d\d:\d\d:\d\d) (\S+) ([^\s:[]+)(?:\[(\d+)\])?: (.*)$/.exec(t);
    if (m) {
      const lv = m[1] ? SYSLOG_SEV[+m[1] % 8] : normLevel(LEVEL_WORD.exec(m[6])?.[1]);
      return { ...base, format: "syslog", time: m[2], levelRaw: m[1] ? `pri ${m[1]}` : "", level: lv === "OTHER" ? "INFO" : lv, source: `${m[3]} ${m[4]}${m[5] ? `[${m[5]}]` : ""}`, message: m[6] };
    }
  }
  if (force === "auto" || force === "logfmt") {
    const o = parseLogfmt(t);
    if (o) {
      const lv = pick(o, LEVEL_KEYS);
      return { ...base, format: "logfmt", time: String(pick(o, TIME_KEYS) ?? ""), levelRaw: String(lv ?? ""), level: normLevel(lv as string), source: String(pick(o, SRC_KEYS) ?? ""), message: String(pick(o, MSG_KEYS) ?? t) };
    }
  }
  // generic: "2026-09-24 10:00:00,123 ERROR [main] com.example.App - message"
  m = /^\[?(\d{4}-\d\d-\d\d[T ][\d:.,]+(?:Z|[+-]\d\d:?\d\d)?|\d\d:\d\d:\d\d(?:[.,]\d+)?|[A-Z][a-z]{2} \d\d? \d\d:\d\d:\d\d)\]?\s+(?:\[([^\]]+)\]\s+)?\[?(TRACE|DEBUG|INFO|NOTICE|WARN(?:ING)?|ERROR|ERR|FATAL|CRIT(?:ICAL)?|SEVERE|[TDIWEF])\]?:?\s+(?:\[([^\]]+)\]\s+)?(?:([\w.$/-]+(?:\.[\w$]+)+|[\w-]+)\s*(?:-|:)\s+)?(.*)$/.exec(t);
  if (m) return { ...base, format: "generic", time: m[1], levelRaw: m[3], level: normLevel(m[3]), source: [m[2], m[4], m[5]].filter(Boolean).join(" "), message: m[6] };
  m = /^\[?(TRACE|DEBUG|INFO|NOTICE|WARN(?:ING)?|ERROR|FATAL|CRITICAL)\]?[:\s]\s*(.*)$/.exec(t);
  if (m) return { ...base, format: "generic", levelRaw: m[1], level: normLevel(m[1]), message: m[2] };
  const w = LEVEL_WORD.exec(t);
  return { ...base, level: w ? normLevel(w[1]) : "OTHER", levelRaw: w?.[1] ?? "" };
}

/** Group lines into entries: indented lines, "at …" frames and "Caused by" continue the previous entry. */
export function parseLog(src: string, force = "auto"): Entry[] {
  const out: Entry[] = [];
  src.replace(/\r\n?/g, "\n").split("\n").forEach((l, k) => {
    if (!l.trim()) return;
    if (out.length && (/^\s+\S/.test(l) || /^(Caused by:|\.\.\. \d+ more)/.test(l) || /^(?:[a-z_$][\w$]*\.)+[A-Z][\w$]*(?:Exception|Error)(?::|$)/.test(l)) && !/^\s*\{/.test(l)) {
      const prev = out[out.length - 1];
      prev.raw += "\n" + l;
      return;
    }
    out.push(parseLine(l, k + 1, force));
  });
  return out;
}

/* ── redaction ──────────────────────────────────────────────────────── */

export type RuleId = "email" | "ip" | "card" | "jwt" | "auth" | "apikey" | "secret" | "uuid" | "phone" | "ssn";
export type Mask = "label" | "stars" | "pseudo";

function luhn(d: string): boolean {
  let sum = 0, alt = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = +d[i];
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

const PSEUDO_PREFIX: Record<RuleId, string> = { email: "user", ip: "ip", card: "card", jwt: "jwt", auth: "cred", apikey: "key", secret: "secret", uuid: "id", phone: "phone", ssn: "ssn" };
const ALREADY = /^(\[REDACTED(:\w+)?\]|\*{3}|(user|ip|card|jwt|cred|key|secret|id|phone|ssn)_[0-9a-f]{6}(@redacted\.invalid)?)$/;
const SECRET_KEYS = "password|passwd|pwd|pass|secret|client[_-]?secret|api[_-]?key|apikey|access[_-]?key|secret[_-]?key|private[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|auth[_-]?token|token|session[_-]?id|sessionid|cookie|set-cookie|credentials?|x-api-key";

type Rule = { id: RuleId; apply: (s: string, mask: (v: string) => string) => string };

const RULES: Rule[] = [
  { id: "jwt", apply: (s, mk) => s.replace(/\beyJ[A-Za-z0-9_-]{5,}\.eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g, mk) },
  {
    id: "auth",
    apply: (s, mk) =>
      s
        .replace(/\b(Bearer|Basic|Token|Digest|Negotiate)(\s+)([A-Za-z0-9._~+/=-]{8,})/g, (m, a: string, sp: string, v: string) => (ALREADY.test(v) ? m : a + sp + mk(v)))
        .replace(/(\/\/[^/\s:@]+:)([^\s/]+)(@)(?=[^@\s/]+(?::\d+)?(?:[/?#\s]|$))/g, (m, a: string, v: string, b: string) => (ALREADY.test(v) ? m : a + mk(v) + b)),
  },
  {
    id: "apikey",
    apply: (s, mk) =>
      s.replace(
        /\b(?:(?:AKIA|ASIA|AGPA|AIDA|AROA)[A-Z0-9]{16}|gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{22,255}|xox[abposr]-[A-Za-z0-9-]{10,}|(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{16,}|AIza[0-9A-Za-z_-]{35}|sk-(?:proj-)?[A-Za-z0-9_-]{20,}|glpat-[A-Za-z0-9_-]{20,}|npm_[A-Za-z0-9]{36})\b|https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/]+/g,
        mk
      ),
  },
  {
    id: "secret",
    apply: (s, mk) =>
      s
        // JSON: "password": "value"
        .replace(new RegExp(`("(?:${SECRET_KEYS})"\\s*:\\s*")((?:[^"\\\\]|\\\\.)*)(")`, "gi"), (m, a: string, v: string, b: string) => (!v || ALREADY.test(v) ? m : a + mk(v) + b))
        // key=value, key: value, key="value"
        .replace(new RegExp(`(\\b(?:${SECRET_KEYS})\\b["']?\\s*[=:]\\s*)("[^"]*"|'[^']*'|[^\\s&,;"'}]+)`, "gi"), (m, a: string, v: string) => {
          const q = /^["']/.test(v) ? v[0] : "";
          const inner = q ? v.slice(1, -1) : v;
          if (!inner || ALREADY.test(inner) || /^(Bearer|Basic|Token)$/i.test(inner) || /^\[REDACTED/.test(inner)) return m;
          return a + q + mk(inner) + q;
        }),
  },
  { id: "email", apply: (s, mk) => s.replace(/(?<![\w.+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, (m) => (/@redacted\.invalid$/.test(m) ? m : mk(m))) },
  {
    id: "card",
    apply: (s, mk) =>
      s.replace(/(?<![\d-])(?:\d[ -]?){12,18}\d(?![\d-])/g, (m) => {
        const d = m.replace(/\D/g, "");
        return d.length >= 13 && d.length <= 19 && luhn(d) && !/^(\d)\1+$/.test(d) ? mk(m) : m;
      }),
  },
  { id: "ssn", apply: (s, mk) => s.replace(/\b(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g, mk) },
  { id: "phone", apply: (s, mk) => s.replace(/(?<![\w.:/-])(?:\+\d{1,3}[ .-]?)?(?:\(\d{2,4}\)[ .-]?|\d{2,4}[ .-])\d{3,4}[ .-]\d{3,4}(?![\w.:/-])/g, (m) => (/^\d{4}-\d{2}-\d{2}$/.test(m) || m.replace(/\D/g, "").length < 9 ? m : mk(m))) },
  { id: "uuid", apply: (s, mk) => s.replace(/\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[089abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\b/g, mk) },
  {
    id: "ip",
    apply: (s, mk) =>
      s
        .replace(/(?<![\w.])(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}(?![\w.])/g, mk)
        .replace(/(?<![\w:.])(?:(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,6}:(?:[0-9a-fA-F]{1,4}(?::[0-9a-fA-F]{1,4}){0,5})?|::(?:[fF]{4}:)?[0-9a-fA-F]{1,4}(?::[0-9a-fA-F]{1,4}){0,5})(?![\w:])/g, (m) => (/[a-fA-F]|::/.test(m) && (m.match(/:/g) ?? []).length >= 2 ? mk(m) : m)),
  },
];

export const RULE_LABELS: Record<RuleId, string> = { email: "Emails", ip: "IP addresses", card: "Credit cards", jwt: "JWTs", auth: "Auth headers", apikey: "API keys", secret: "Secrets (key=value)", uuid: "UUIDs", phone: "Phone numbers", ssn: "US SSNs" };

export function makeRedactor(enabled: Set<RuleId>, mask: Mask) {
  const counts = new Map<RuleId, number>();
  const mapping = new Map<string, string>();
  const redact = (s: string): { text: string; hits: number } => {
    let hits = 0;
    let out = s;
    for (const r of RULES) {
      if (!enabled.has(r.id)) continue;
      out = r.apply(out, (v: string) => {
        hits++;
        counts.set(r.id, (counts.get(r.id) ?? 0) + 1);
        if (mask === "stars") return "***";
        if (mask === "label") return `[REDACTED:${r.id}]`;
        const key = r.id + "\0" + v;
        let tok = mapping.get(key);
        if (!tok) {
          tok = `${PSEUDO_PREFIX[r.id]}_${fnv1a(v).slice(0, 6)}${r.id === "email" ? "@redacted.invalid" : ""}`;
          mapping.set(key, tok);
        }
        return tok;
      });
    }
    return { text: out, hits };
  };
  return { redact, counts, mapping };
}
