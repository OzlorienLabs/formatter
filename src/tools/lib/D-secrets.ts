/**
 * Secret-scanning rules (in the spirit of gitleaks / trufflehog) plus a
 * Shannon-entropy detector and redaction.
 */

export type Severity = "critical" | "high" | "medium" | "low";
export type Rule = {
  id: string;
  name: string;
  severity: Severity;
  re: RegExp;
  /** Capture group holding the secret itself (defaults to the whole match). */
  group?: number;
  /** Reject a candidate (placeholders, env references). */
  reject?: (secret: string, whole: string) => boolean;
  hint: string;
};

const placeholder = (s: string) =>
  /^(\$\{?[\w.]+\}?|\{\{.*\}\}|<[^>]+>|%[\w]+%|\*+|x{4,}|\.\.\.|null|none|true|false|undefined|process\.env\.\w+|os\.environ.*|env\(.*\)|your[_-]?\w*|changeme_later|example|redacted|\[redacted\]|string|password|secret|token)$/i.test(s) ||
  /^(\$\(|\$\{|process\.env|os\.getenv|ENV\[|getenv\(|System\.getenv|config\.|settings\.|vault:)/i.test(s);

export const RULES: Rule[] = [
  { id: "private-key", name: "Private key (PEM)", severity: "critical", re: /-----BEGIN ((?:RSA |EC |DSA |OPENSSH |ENCRYPTED |PGP )?PRIVATE KEY(?: BLOCK)?)-----[\s\S]*?-----END \1-----/g, hint: "Rotate the key pair and remove it from history (git filter-repo / BFG)." },
  { id: "aws-access-key-id", name: "AWS access key ID", severity: "high", re: /\b((?:AKIA|ASIA|ABIA|ACCA|AGPA|AIDA|AIPA|ANPA|ANVA|AROA|APKA)[A-Z0-9]{16})\b/g, group: 1, hint: "Deactivate the key in IAM and create a new one; prefer roles or SSO." },
  { id: "aws-secret-access-key", name: "AWS secret access key", severity: "critical", re: /\b(?:aws_?secret_?(?:access_?)?key(?:_id)?|secretAccessKey|AWS_SECRET)\b["']?\s*[:=]\s*["']?([A-Za-z0-9/+=]{40})(?![A-Za-z0-9/+=])/gi, group: 1, hint: "Rotate in IAM immediately — a secret key plus its key ID grants API access." },
  { id: "github-pat", name: "GitHub token", severity: "critical", re: /\b(gh[pousr]_[A-Za-z0-9]{36,255})\b/g, group: 1, hint: "Revoke at github.com/settings/tokens (ghp_ personal, gho_ OAuth, ghu_ user-to-server, ghs_ server-to-server, ghr_ refresh)." },
  { id: "github-fine-grained", name: "GitHub fine-grained PAT", severity: "critical", re: /\b(github_pat_[A-Za-z0-9]{22}_[A-Za-z0-9]{59})\b/g, group: 1, hint: "Revoke the fine-grained token in GitHub settings." },
  { id: "gitlab-pat", name: "GitLab personal access token", severity: "critical", re: /\b(glpat-[A-Za-z0-9_-]{20,})\b/g, group: 1, hint: "Revoke under GitLab → Preferences → Access tokens." },
  { id: "slack-token", name: "Slack token", severity: "high", re: /\b(xox[baprs]-[0-9A-Za-z-]{10,})\b/g, group: 1, hint: "Revoke the token in the Slack app configuration." },
  { id: "slack-webhook", name: "Slack webhook URL", severity: "high", re: /(https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]{6,}\/B[A-Z0-9]{6,}\/[A-Za-z0-9]{20,})/g, group: 1, hint: "Anyone with the URL can post to the channel — regenerate the webhook." },
  { id: "stripe-secret", name: "Stripe secret / restricted key", severity: "critical", re: /\b((?:sk|rk)_(?:live|test)_[0-9A-Za-z]{16,})\b/g, group: 1, hint: "Roll the key in the Stripe dashboard (live keys can move money)." },
  { id: "stripe-publishable", name: "Stripe publishable key", severity: "low", re: /\b(pk_(?:live|test)_[0-9A-Za-z]{16,})\b/g, group: 1, hint: "Publishable keys are meant for browsers — informational only." },
  { id: "google-api-key", name: "Google API key", severity: "high", re: /\b(AIza[0-9A-Za-z_-]{35})\b/g, group: 1, hint: "Restrict or regenerate the key in Google Cloud Console → Credentials." },
  { id: "google-oauth-secret", name: "Google OAuth client secret", severity: "critical", re: /\b(GOCSPX-[0-9A-Za-z_-]{28})\b/g, group: 1, hint: "Reset the client secret in Google Cloud Console." },
  { id: "twilio-api-key", name: "Twilio API key SID", severity: "high", re: /\b(SK[0-9a-f]{32})\b/g, group: 1, hint: "Delete the API key in the Twilio console." },
  { id: "twilio-account-sid", name: "Twilio account SID", severity: "medium", re: /\b(AC[0-9a-f]{32})\b/g, group: 1, hint: "Account SIDs are identifiers; check that the auth token is not nearby." },
  { id: "sendgrid", name: "SendGrid API key", severity: "critical", re: /\b(SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43})\b/g, group: 1, hint: "Delete the key in SendGrid → Settings → API Keys." },
  { id: "mailgun", name: "Mailgun API key", severity: "high", re: /\b(key-[0-9a-f]{32})\b/g, group: 1, hint: "Rotate the key in the Mailgun control panel." },
  { id: "npm-token", name: "npm access token", severity: "critical", re: /\b(npm_[A-Za-z0-9]{36})\b/g, group: 1, hint: "Revoke with `npm token revoke` — it can publish packages." },
  { id: "pypi-token", name: "PyPI API token", severity: "critical", re: /\b(pypi-AgEIcHlwaS5vcmc[A-Za-z0-9_-]{50,})/g, group: 1, hint: "Remove the token at pypi.org/manage/account/token." },
  { id: "anthropic", name: "Anthropic API key", severity: "critical", re: /\b(sk-ant-(?:api|admin)\d{2}-[A-Za-z0-9_-]{80,})/g, group: 1, hint: "Delete the key in the Anthropic Console → API keys." },
  { id: "openai", name: "OpenAI API key", severity: "critical", re: /\b(sk-(?:proj|svcacct|admin)-[A-Za-z0-9_-]{40,}|sk-[A-Za-z0-9]{20}T3BlbkFJ[A-Za-z0-9]{20}|sk-[A-Za-z0-9]{48})\b/g, group: 1, hint: "Revoke the key on the OpenAI platform → API keys." },
  { id: "huggingface", name: "Hugging Face token", severity: "high", re: /\b(hf_[A-Za-z0-9]{34,})\b/g, group: 1, hint: "Invalidate at huggingface.co/settings/tokens." },
  { id: "shopify", name: "Shopify access token", severity: "high", re: /\b(shp(?:at|ca|pa|ss)_[a-fA-F0-9]{32})\b/g, group: 1, hint: "Rotate in the Shopify admin." },
  { id: "digitalocean", name: "DigitalOcean token", severity: "high", re: /\b(do[pro]_v1_[a-f0-9]{64})\b/g, group: 1, hint: "Delete under DigitalOcean → API → Tokens." },
  { id: "telegram-bot", name: "Telegram bot token", severity: "high", re: /\b(\d{8,10}:AA[A-Za-z0-9_-]{33})\b/g, group: 1, hint: "Revoke with @BotFather (/revoke)." },
  { id: "discord-webhook", name: "Discord webhook URL", severity: "medium", re: /(https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]{60,})/g, group: 1, hint: "Delete and recreate the webhook." },
  { id: "azure-storage", name: "Azure storage connection string", severity: "critical", re: /(DefaultEndpointsProtocol=https?;AccountName=[a-z0-9]{3,24};AccountKey=([A-Za-z0-9+/]{86}==)(?:;EndpointSuffix=[\w.]+)?)/g, group: 2, hint: "Rotate the storage account key (Access keys → Rotate)." },
  { id: "jwt", name: "JSON Web Token", severity: "medium", re: /\b(eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{10,})/g, group: 1, hint: "A bearer token: anyone holding it is the user until it expires." },
  { id: "url-credentials", name: "Credentials in URL", severity: "high", re: /\b([a-z][a-z0-9+.-]{1,20}:\/\/[^\s:/?#@"'`]{1,64}:)([^\s@/"'`]{3,128})(@[^\s"'`]+)/gi, group: 2, reject: (s) => placeholder(s) || /^\$\{|^\$\w+$/.test(s), hint: "Move the password to a secret store or environment variable." },
  {
    id: "assignment",
    name: "Hard-coded secret assignment",
    severity: "high",
    re: /(?:^|[\s,{;(])["']?((?:[\w.-]*?)(?:password|passwd|pwd|secret|token|api[_-]?key|apikey|access[_-]?key|private[_-]?key|client[_-]?secret|auth[_-]?key|credentials?))["']?\s*(?:=|:=|=>|:)\s*(["'`]?)([^\s"'`,;#})]{6,})\2/gi,
    group: 3,
    reject: (s, whole) => placeholder(s) || /^[A-Z_][A-Z0-9_]*$/.test(s) && /[:=]\s*[A-Z_]{3,}$/.test(whole) || /^(https?:)?\/\//.test(s) || /\(|\)$/.test(s),
    hint: "Load it from the environment or a secrets manager instead of source.",
  },
];

export const shannon = (s: string) => {
  const f = new Map<string, number>();
  for (const c of s) f.set(c, (f.get(c) ?? 0) + 1);
  let h = 0;
  for (const n of f.values()) {
    const p = n / s.length;
    h -= p * Math.log2(p);
  }
  return h;
};

export type Finding = { rule: string; name: string; severity: Severity; line: number; col: number; start: number; end: number; secret: string; entropy: number; hint: string };

export function scan(text: string, o: { entropy: boolean; threshold: number; minLen: number; low: boolean }): Finding[] {
  const raw: Finding[] = [];
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") lineStarts.push(i + 1);
  const pos = (i: number) => {
    let lo = 0, hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= i) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, col: i - lineStarts[lo] + 1 };
  };
  RULES.forEach((r) => {
    if (!o.low && r.severity === "low") return;
    r.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = r.re.exec(text))) {
      const g = r.group ?? 0;
      const secret = m[g];
      if (!secret) continue;
      if (r.reject?.(secret, m[0])) continue;
      const at = m.index + (g ? m[0].lastIndexOf(secret) : 0);
      const { line, col } = pos(at);
      raw.push({ rule: r.id, name: r.name, severity: r.severity, line, col, start: at, end: at + secret.length, secret, entropy: shannon(secret), hint: r.hint });
      if (m[0].length === 0) r.re.lastIndex++;
    }
  });
  if (o.entropy) {
    const re = /[A-Za-z0-9+/_=.-]{8,}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const s = m[0].replace(/^[._-]+|[._=-]+$/g, "");
      if (s.length < o.minLen) continue;
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) continue; // UUID
      if (/^[a-z]+([._-][a-z]+)*$/i.test(s) || /^[\d.]+$/.test(s) || /\//.test(s) && /^[\w.-]+(\/[\w.-]+)+$/.test(s) && !/\d/.test(s)) continue; // words, versions, paths
      if (!/\d/.test(s) || !/[A-Za-z]/.test(s)) continue;
      const hexOnly = /^[0-9a-f]+$/i.test(s);
      const h = shannon(s);
      if (h < (hexOnly ? o.threshold - 0.9 : o.threshold)) continue;
      const at = m.index + m[0].indexOf(s);
      const { line, col } = pos(at);
      raw.push({ rule: "high-entropy", name: `High-entropy string (${hexOnly ? "hex" : "base64-ish"})`, severity: "medium", line, col, start: at, end: at + s.length, secret: s, entropy: h, hint: "Random-looking string — check whether it is a credential." });
    }
  }
  // Keep the most specific finding for overlapping spans (rule order = priority, entropy last).
  const prio = (f: Finding) => (f.rule === "high-entropy" ? 1000 : f.rule === "assignment" ? 900 : RULES.findIndex((r) => r.id === f.rule));
  raw.sort((a, b) => prio(a) - prio(b) || a.start - b.start);
  const kept: Finding[] = [];
  for (const f of raw) if (!kept.some((k) => f.start < k.end && k.start < f.end)) kept.push(f);
  return kept.sort((a, b) => a.start - b.start);
}

export function mask(secret: string, style: string, f: Finding): string {
  if (style === "label") return `[REDACTED:${f.rule}]`;
  if (style === "partial") {
    if (secret.includes("\n")) return secret.split("\n")[0] + "\n[REDACTED]\n" + secret.split("\n").pop();
    const keep = Math.min(6, Math.floor(secret.length / 4));
    return secret.slice(0, keep) + "*".repeat(Math.max(4, Math.min(24, secret.length - keep - 2))) + secret.slice(-2);
  }
  if (style === "fixed") return "********";
  return secret.replace(/[^\n]/g, "*");
}

export function redact(text: string, findings: Finding[], style: string): string {
  let out = "";
  let p = 0;
  for (const f of [...findings].sort((a, b) => a.start - b.start)) {
    if (f.start < p) continue;
    out += text.slice(p, f.start) + mask(text.slice(f.start, f.end), style, f);
    p = f.end;
  }
  return out + text.slice(p);
}
