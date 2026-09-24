"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ToolIcon from "@/src/components/ToolIcon";
import CodeEditor from "@/src/components/tool/CodeEditor";
import { CodeView } from "@/src/components/tool/OutputView";
import type { CustomProps } from "@/src/tools/types";
import {
  ALGS,
  algInfo,
  b64url,
  CLAIMS,
  claimRows,
  cleanToken,
  HEADER_PARAMS,
  parseJwt,
  signJwt,
  timeState,
  verifyJwt,
  type Jwt,
  type SecretEnc,
  type Verification,
} from "@/src/tools/lib/A-jwt";

const C_HEAD = "var(--color-accent-2-600)";
const C_PAY = "oklch(46% .14 290)";
const C_SIG = "var(--color-accent-700)";
const OK = "oklch(48% .12 150)";
const BAD = "var(--color-accent-2-700)";
const WARN = "var(--plate-y)";

const CSS = `
.jwtwb { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 440px), 1fr)); align-items: start; }
.jwtwb .col { display: grid; gap: 14px; min-width: 0; }
.jwtwb .tok { position: relative; font-family: var(--font-mono); line-height: 1.6; }
.jwtwb .tok pre, .jwtwb .tok textarea { margin: 0; padding: 12px 14px; border: 0; font: inherit; white-space: pre-wrap; word-break: break-all; overflow-wrap: anywhere; letter-spacing: 0; font-variant-ligatures: none; }
.jwtwb .tok pre { min-height: 150px; pointer-events: none; color: var(--color-neutral-900); }
.jwtwb .tok textarea { position: absolute; inset: 0; width: 100%; height: 100%; resize: none; outline: none; background: transparent; color: transparent; caret-color: var(--color-neutral-900); overflow: hidden; }
.jwtwb .tok textarea::selection { background: rgba(0,136,176,.22); color: transparent; }
.jwtwb .tok textarea::placeholder { color: var(--color-neutral-500); }
.jwtwb .badges { display: flex; flex-wrap: wrap; gap: 8px; }
.jwtwb .badge { display: inline-flex; align-items: center; gap: 6px; padding: 5px 11px; border-radius: 999px; font-size: 13.5px; border: 1px solid; background: rgba(255,255,255,.5); }
.jwtwb .sec { padding: 10px 12px 12px; display: grid; gap: 8px; }
.jwtwb .kv { font-size: 13px; color: var(--color-neutral-700); line-height: 1.5; }
.jwtwb .legend { display: flex; flex-wrap: wrap; gap: 6px 14px; padding: 8px 12px; border-top: 1px solid rgba(32,30,29,.08); font-size: 12.5px; color: var(--color-neutral-700); }
.jwtwb .legend i { display: inline-block; width: 9px; height: 9px; border-radius: 2px; margin-right: 6px; vertical-align: 0; }
.jwtwb .keybox { width: 100%; min-height: 104px; resize: vertical; font-family: var(--font-mono); font-size: 12.5px; line-height: 1.5; padding: 8px 10px; }
.jwtwb .claims { width: 100%; }
.jwtwb .claims td { white-space: normal; word-break: break-word; max-width: none; }
.jwtwb .claims td.k { white-space: nowrap; color: oklch(45% .13 250); }
.jwtwb .verdict { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border-radius: var(--radius-md); font-size: 14px; line-height: 1.45; }
.jwtwb .row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.jwtwb .out { font-family: var(--font-mono); font-size: 13px; line-height: 1.6; padding: 12px 14px; word-break: break-all; overflow-wrap: anywhere; white-space: pre-wrap; }
`;

function Colored({ token }: { token: string }) {
  const segs = token.split(".");
  const colors = [C_HEAD, C_PAY, C_SIG, C_PAY, C_SIG];
  return (
    <>
      {segs.map((s, i) => (
        <span key={i}>
          {i > 0 && <span style={{ color: "var(--color-neutral-500)" }}>.</span>}
          <span style={{ color: segs.length === 3 || segs.length === 5 ? colors[i] : i === 0 ? C_HEAD : C_PAY }}>{s}</span>
        </span>
      ))}
    </>
  );
}

function Badge({ tone, icon, children, title }: { tone: "ok" | "bad" | "warn" | "info"; icon: string; children: React.ReactNode; title?: string }) {
  const c = tone === "ok" ? OK : tone === "bad" ? BAD : tone === "warn" ? WARN : "var(--color-accent-700)";
  return (
    <span className="badge" style={{ color: c, borderColor: c }} title={title}>
      <ToolIcon name={icon} size={15} color={c} />
      {children}
    </span>
  );
}

function Pane({ title, right, children, color }: { title: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; color?: string }) {
  return (
    <section className="g pane">
      <div className="pane-head">
        <span className="lbl" style={color ? { color } : undefined}>{title}</span>
        <div style={{ flex: 1 }} />
        {right}
      </div>
      {children}
    </section>
  );
}

function useNow() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 15000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function CopyBtn({ text, label = "Copy", onCopied }: { text: string; label?: string; onCopied?: () => void }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn-icon"
      disabled={!text}
      onClick={() => {
        navigator.clipboard?.writeText(text).catch(() => {});
        setDone(true);
        onCopied?.();
        setTimeout(() => setDone(false), 1300);
      }}
    >
      <ToolIcon name={done ? "check" : "copy"} size={15} /> {done ? "Copied" : label}
    </button>
  );
}

function pretty(s: string) {
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}

function keyHint(alg: string) {
  const f = ALGS[alg]?.family;
  if (f === "HS") return "The shared secret the token was signed with";
  if (f === "ES") return `-----BEGIN PUBLIC KEY-----  (EC ${ALGS[alg].curve}), a certificate, or a JWK / JWKS`;
  if (f === "Ed") return "-----BEGIN PUBLIC KEY-----  (Ed25519) or an OKP JWK";
  if (f) return "-----BEGIN PUBLIC KEY-----, RSA PUBLIC KEY, CERTIFICATE, or a JWK / JWKS";
  return "Secret (HS*) or public key (RS/PS/ES)";
}

/* ── decode ──────────────────────────────────────────────────────────── */

function Decode({ p, mono }: { p: CustomProps; mono: number }) {
  const { inputs, opts, setInput, setOpt } = p;
  const token = inputs.token ?? "";
  const key = inputs.key ?? "";
  const enc = String(opts.enc ?? "text") as SecretEnc;
  const leeway = Number(opts.leeway ?? 0);
  const now = useNow();
  const parsed = useMemo((): { jwt?: Jwt; err?: string } => {
    if (!token.trim()) return {};
    try {
      return { jwt: parseJwt(token) };
    } catch (e) {
      return { err: (e as Error).message };
    }
  }, [token]);
  const jwt = parsed.jwt;
  const [ver, setVer] = useState<Verification | null>(null);
  const [verErr, setVerErr] = useState("");
  useEffect(() => {
    let live = true;
    setVerErr("");
    if (!jwt) {
      setVer(null);
      return;
    }
    verifyJwt(jwt, key, enc)
      .then((v) => live && setVer(v))
      .catch((e) => {
        if (!live) return;
        setVer(null);
        setVerErr((e as Error).message);
      });
    return () => {
      live = false;
    };
  }, [jwt, key, enc]);

  const alg = String(jwt?.header.alg ?? "");
  const fam = ALGS[alg]?.family;
  const t = jwt ? timeState(jwt.payload, now, leeway) : null;
  const rows = jwt ? claimRows(jwt.payload, now) : [];
  const checked = ver && !/not checked/i.test(ver.title);
  const lastRec = useRef("");

  useEffect(() => {
    if (ver?.ok && token !== lastRec.current) {
      lastRec.current = token;
      p.record(`${ver.title} · ${alg}`);
    }
  }, [ver, token, alg, p]);

  function resign() {
    if (!jwt) return;
    setInput("header", JSON.stringify(jwt.header, null, 2));
    setInput("payload", jwt.payloadIsJson ? JSON.stringify(jwt.payload, null, 2) : JSON.stringify(jwt.payloadText));
    setOpt("mode", "sign");
  }

  return (
    <div className="jwtwb">
      <div className="col">
        <Pane
          title="Encoded token"
          right={
            <>
              <span className="mono" style={{ fontSize: 11.5, color: "var(--color-neutral-600)" }}>{cleanToken(token).length.toLocaleString()} chars</span>
              <button
                type="button"
                className="btn-icon"
                title="Paste from clipboard"
                onClick={async () => {
                  try {
                    setInput("token", await navigator.clipboard.readText());
                  } catch {
                    /* clipboard blocked */
                  }
                }}
              >
                <ToolIcon name="clipboard-text" size={15} /> Paste
              </button>
              {token && (
                <button type="button" className="btn-icon" onClick={() => setInput("token", "")}>
                  <ToolIcon name="eraser" size={15} /> Clear
                </button>
              )}
            </>
          }
        >
          <div className="tok" style={{ fontSize: mono }}>
            <pre aria-hidden="true">
              <Colored token={token} />
              {"\n"}
            </pre>
            <textarea
              aria-label="JWT"
              id="tool-input"
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              autoCorrect="off"
              value={token}
              placeholder="Paste a JWT: eyJhbGciOi…"
              onChange={(e) => setInput("token", e.target.value)}
            />
          </div>
          {jwt && jwt.kind === "JWS" && (
            <div className="legend">
              <span><i style={{ background: C_HEAD }} />Header · {jwt.segs[0].length} chars</span>
              <span><i style={{ background: C_PAY }} />Payload · {jwt.segs[1].length} chars</span>
              <span><i style={{ background: C_SIG }} />Signature · {jwt.signature.length} bytes</span>
            </div>
          )}
        </Pane>

        {parsed.err && (
          <div role="alert" className="g errband" style={{ borderRadius: "var(--radius-lg)" }}>
            <ToolIcon name="warning-circle" size={18} color={BAD} />
            <span className="mono" style={{ fontSize: 13, color: BAD, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{parsed.err}</span>
          </div>
        )}

        <Pane
          title="Verify signature"
          right={
            fam === "HS" || !fam ? (
              <label className="opt">
                <span className="lbl">Secret is</span>
                <select className="sel" value={enc} onChange={(e) => setOpt("enc", e.target.value)} style={{ fontSize: 13, padding: "3px 6px" }}>
                  <option value="text">Text</option>
                  <option value="base64">Base64</option>
                  <option value="hex">Hex</option>
                </select>
              </label>
            ) : undefined
          }
        >
          <div className="sec">
            {alg && (
              <div className="kv">
                <b className="mono" style={{ color: C_HEAD }}>{alg}</b> — {algInfo(alg)}
              </div>
            )}
            <textarea
              className="inp keybox"
              aria-label={fam === "HS" ? "Secret" : "Public key"}
              spellCheck={false}
              value={key}
              placeholder={keyHint(alg)}
              onChange={(e) => setInput("key", e.target.value)}
            />
            {verErr ? (
              <div className="verdict" style={{ background: "rgba(214,0,108,.07)", color: BAD }}>
                <ToolIcon name="warning-circle" size={18} color={BAD} />
                <span>{verErr}</span>
              </div>
            ) : ver ? (
              <div className="verdict" style={{ background: !checked ? "rgba(0,136,176,.06)" : ver.ok ? "rgba(0,160,90,.08)" : "rgba(214,0,108,.07)" }} data-testid="jwt-verdict">
                <ToolIcon name={!checked ? "info" : ver.ok ? "seal-check" : "warning-circle"} size={20} color={!checked ? "var(--color-accent-700)" : ver.ok ? OK : BAD} />
                <span>
                  <b style={{ color: !checked ? undefined : ver.ok ? OK : BAD }}>{ver.title}</b>
                  <br />
                  <span style={{ fontSize: 13, color: "var(--color-neutral-700)" }}>{ver.detail}</span>
                </span>
              </div>
            ) : null}
          </div>
        </Pane>
      </div>

      <div className="col">
        {jwt ? (
          <>
            <div className="badges" aria-label="Token status">
              {!checked ? (
                <Badge tone="info" icon="key">Signature not checked</Badge>
              ) : ver?.ok ? (
                <Badge tone="ok" icon="seal-check">Signature verified</Badge>
              ) : (
                <Badge tone="bad" icon="warning-circle">Invalid signature</Badge>
              )}
              {t && t.state !== "none" && (
                <Badge tone={t.state === "valid" ? "ok" : t.state === "noexp" ? "warn" : "bad"} icon="clock-countdown" title={t.detail}>
                  {t.state === "valid" ? "Not expired" : t.title}
                </Badge>
              )}
              {alg && <Badge tone={alg === "none" ? "bad" : "info"} icon="shield-check">{alg}{jwt.header.typ ? ` · ${String(jwt.header.typ)}` : ""}</Badge>}
              {jwt.kind === "JWE" && <Badge tone="warn" icon="password">Encrypted (JWE)</Badge>}
            </div>
            {t && t.state !== "none" && <div className="kv" style={{ marginTop: -6 }}>{t.detail}{leeway ? ` · ${leeway}s clock skew allowed` : ""}</div>}
            {jwt.warnings.map((w) => (
              <div key={w} className="note" style={{ borderRadius: "var(--radius-md)", border: "1px solid rgba(185,141,0,.25)" }}>
                <ToolIcon name="info" size={16} color={WARN} />
                <span>{w}</span>
              </div>
            ))}
            <Pane title="Header" color={C_HEAD} right={<CopyBtn text={JSON.stringify(jwt.header, null, 2)} />}>
              <CodeView text={JSON.stringify(jwt.header, null, 2)} lang="json" fontSize={mono} />
              <div className="legend" style={{ display: "grid", gap: 2 }}>
                {Object.keys(jwt.header).filter((k) => HEADER_PARAMS[k]).map((k) => (
                  <span key={k}><b className="mono">{k}</b> — {HEADER_PARAMS[k]}</span>
                ))}
              </div>
            </Pane>
            {jwt.kind === "JWS" && (
              <Pane
                title="Payload"
                color={C_PAY}
                right={
                  <>
                    <CopyBtn text={jwt.payloadIsJson ? JSON.stringify(jwt.payload, null, 2) : jwt.payloadText} />
                    <button type="button" className="btn-icon" onClick={resign} title="Copy header and payload into Encode & sign">
                      <ToolIcon name="pencil-simple" size={15} /> Edit &amp; re-sign
                    </button>
                  </>
                }
              >
                <CodeView text={jwt.payloadIsJson ? JSON.stringify(jwt.payload, null, 2) : jwt.payloadText} lang={jwt.payloadIsJson ? "json" : "text"} fontSize={mono} wrap />
              </Pane>
            )}
            {rows.length > 0 && (
              <Pane title={`Claims (${rows.length})`}>
                <div className="scroll" style={{ overflow: "auto" }}>
                  <table className="dt claims">
                    <tbody>
                      {rows.map(([k, v, human, meaning]) => (
                        <tr key={k}>
                          <td className="k">{k}</td>
                          <td>
                            <span className="mono">{v}</span>
                            {human && (
                              <div style={{ fontSize: 12, color: k === "exp" && t?.state === "expired" ? BAD : k === "nbf" && t?.state === "notyet" ? BAD : "var(--color-neutral-600)" }}>{human}</div>
                            )}
                          </td>
                          <td style={{ fontFamily: "var(--font-sans, inherit)", fontSize: 12.5, color: "var(--color-neutral-600)" }}>{meaning}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Pane>
            )}
          </>
        ) : (
          <section className="g pane" style={{ padding: 18, color: "var(--color-neutral-600)", fontSize: 14.5, lineHeight: 1.6 }}>
            Paste a token to see its header, payload and claims. Nothing leaves this tab — decoding and signature checks run locally with WebCrypto.
          </section>
        )}
      </div>
    </div>
  );
}

/* ── sign ────────────────────────────────────────────────────────────── */

const QUICK_ALGS = ["HS256", "HS384", "HS512", "RS256", "PS256", "ES256", "ES384"];

function pem(label: string, der: ArrayBuffer) {
  const b = new Uint8Array(der);
  let bin = "";
  b.forEach((x) => (bin += String.fromCharCode(x)));
  const body = btoa(bin).match(/.{1,64}/g)!.join("\n");
  const dash = "-----";
  return `${dash}BEGIN ${label}${dash}\n${body}\n${dash}END ${label}${dash}`;
}

function Sign({ p, mono }: { p: CustomProps; mono: number }) {
  const { inputs, opts, setInput, setOpt } = p;
  const header = inputs.header ?? "";
  const payload = inputs.payload ?? "";
  const key = inputs.key ?? "";
  const enc = String(opts.enc ?? "text") as SecretEnc;
  const [signed, setSigned] = useState("");
  const [err, setErr] = useState("");
  const [pub, setPub] = useState("");
  const [busy, setBusy] = useState(false);

  const alg = useMemo(() => {
    try {
      return String(JSON.parse(header).alg ?? "");
    } catch {
      return "";
    }
  }, [header]);
  const fam = ALGS[alg]?.family;

  useEffect(() => {
    let live = true;
    signJwt(header, payload, key, enc)
      .then((t) => {
        if (!live) return;
        setSigned(t);
        setErr("");
      })
      .catch((e) => {
        if (!live) return;
        setErr((e as Error).message);
      });
    return () => {
      live = false;
    };
  }, [header, payload, key, enc]);

  function editJson(which: "header" | "payload", fn: (o: Record<string, unknown>) => void) {
    const src = which === "header" ? header : payload;
    let o: Record<string, unknown> = {};
    try {
      const v = JSON.parse(src || "{}");
      if (v && typeof v === "object" && !Array.isArray(v)) o = v;
    } catch {
      setErr(`Fix the ${which} JSON first.`);
      return;
    }
    fn(o);
    setInput(which, JSON.stringify(o, null, 2));
  }

  function setAlg(a: string) {
    editJson("header", (o) => {
      o.alg = a;
      if (!o.typ) o.typ = "JWT";
    });
    if (ALGS[a]?.family !== ALGS[alg]?.family) setPub("");
  }

  async function generate() {
    const spec = ALGS[alg];
    if (!spec) return;
    setBusy(true);
    try {
      const s = crypto.subtle;
      if (spec.family === "HS") {
        const b = crypto.getRandomValues(new Uint8Array(spec.bits / 8));
        setOpt("enc", "base64");
        setInput("key", b64url(b));
        setPub("");
        return;
      }
      const params =
        spec.family === "ES"
          ? { name: "ECDSA", namedCurve: spec.curve! }
          : spec.family === "Ed"
            ? { name: "Ed25519" }
            : { name: spec.family === "PS" ? "RSA-PSS" : "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: spec.hash };
      const kp = (await s.generateKey(params, true, ["sign", "verify"])) as CryptoKeyPair;
      setInput("key", pem("PRIVATE KEY", await s.exportKey("pkcs8", kp.privateKey)));
      setPub(pem("PUBLIC KEY", await s.exportKey("spki", kp.publicKey)));
    } catch (e) {
      setErr(`Key generation failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  function verifyIt() {
    setInput("token", signed);
    if (fam && fam !== "HS" && pub) setInput("key", pub);
    setOpt("mode", "decode");
    p.record(signed);
  }

  const now = Math.floor(Date.now() / 1000);
  const quick: [string, () => void][] = [
    ["iat = now", () => editJson("payload", (o) => void (o.iat = now))],
    ["exp +1 h", () => editJson("payload", (o) => void (o.exp = now + 3600))],
    ["exp +24 h", () => editJson("payload", (o) => void (o.exp = now + 86400))],
    ["exp +30 d", () => editJson("payload", (o) => void (o.exp = now + 30 * 86400))],
    ["nbf = now", () => editJson("payload", (o) => void (o.nbf = now))],
    ["jti", () => editJson("payload", (o) => void (o.jti = crypto.randomUUID?.() ?? String(Math.random()).slice(2)))],
    ["Pretty", () => { setInput("header", pretty(header)); setInput("payload", pretty(payload)); }],
  ];

  return (
    <div className="jwtwb">
      <div className="col">
        <Pane title="Header" color={C_HEAD}>
          <div className="row" style={{ padding: "8px 12px 0" }}>
            <span className="lbl" style={{ marginRight: 4 }}>alg</span>
            {QUICK_ALGS.map((a) => (
              <button key={a} type="button" className="chip" aria-pressed={alg === a} onClick={() => setAlg(a)}>
                {a}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", minHeight: 120 }}>
            <CodeEditor value={header} onChange={(v) => setInput("header", v)} lang="json" fontSize={mono} minHeight={120} label="Header JSON" />
          </div>
        </Pane>
        <Pane title="Payload" color={C_PAY}>
          <div className="row" style={{ padding: "8px 12px 0" }}>
            {quick.map(([l, fn]) => (
              <button key={l} type="button" className="chip" onClick={fn}>
                {l}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", minHeight: 230 }}>
            <CodeEditor value={payload} onChange={(v) => setInput("payload", v)} lang="json" fontSize={mono} minHeight={230} label="Payload JSON" />
          </div>
        </Pane>
      </div>
      <div className="col">
        <Pane
          title={fam === "HS" ? "Secret" : fam ? "Private key" : "Key"}
          right={
            <>
              {(fam === "HS" || !fam) && (
                <label className="opt">
                  <span className="lbl">Secret is</span>
                  <select className="sel" value={enc} onChange={(e) => setOpt("enc", e.target.value)} style={{ fontSize: 13, padding: "3px 6px" }}>
                    <option value="text">Text</option>
                    <option value="base64">Base64</option>
                    <option value="hex">Hex</option>
                  </select>
                </label>
              )}
              {fam && (
                <button type="button" className="btn btn-sm" onClick={generate} disabled={busy}>
                  <ToolIcon name="key" size={14} /> {busy ? "Generating…" : fam === "HS" ? "Random secret" : "New key pair"}
                </button>
              )}
            </>
          }
        >
          <div className="sec">
            {alg && <div className="kv"><b className="mono" style={{ color: C_HEAD }}>{alg}</b> — {algInfo(alg)}</div>}
            <textarea
              className="inp keybox"
              aria-label="Signing key"
              spellCheck={false}
              value={key}
              placeholder={fam === "HS" ? "Shared secret" : "-----BEGIN PRIVATE KEY----- (PKCS#8), RSA/EC PRIVATE KEY, or a private JWK"}
              onChange={(e) => setInput("key", e.target.value)}
            />
            {pub && (
              <details open>
                <summary className="kv" style={{ cursor: "pointer" }}>Matching public key (for verifiers)</summary>
                <div style={{ position: "relative" }}>
                  <pre className="out" style={{ margin: "6px 0 0", background: "rgba(32,30,29,.04)", borderRadius: "var(--radius-md)", fontSize: 11.5 }}>{pub}</pre>
                  <div style={{ position: "absolute", top: 8, right: 6 }}><CopyBtn text={pub} /></div>
                </div>
              </details>
            )}
          </div>
        </Pane>
        <Pane
          title="Signed token"
          right={
            <>
              <CopyBtn text={err ? "" : signed} onCopied={() => p.record(signed)} />
              <button type="button" className="btn btn-sm" disabled={!!err || !signed} onClick={verifyIt}>
                <ToolIcon name="seal-check" size={14} /> Verify in decoder
              </button>
            </>
          }
        >
          {err ? (
            <div role="alert" className="errband">
              <ToolIcon name="warning-circle" size={18} color={BAD} />
              <span className="mono" style={{ fontSize: 13, color: BAD, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{err}</span>
            </div>
          ) : null}
          <div className="out" data-testid="jwt-signed" style={{ opacity: err ? 0.45 : 1, minHeight: 90 }}>
            {signed ? <Colored token={signed} /> : <span style={{ color: "var(--color-neutral-500)" }}>The token appears here.</span>}
          </div>
          {signed && !err && (
            <div className="legend">
              <span>{signed.length} chars</span>
              <span><i style={{ background: C_HEAD }} />header</span>
              <span><i style={{ background: C_PAY }} />payload</span>
              <span><i style={{ background: C_SIG }} />signature</span>
            </div>
          )}
        </Pane>
        <section className="g pane" style={{ padding: "12px 14px", fontSize: 13.5, lineHeight: 1.55, color: "var(--color-neutral-700)" }}>
          <b>Registered claims:</b>{" "}
          {["iss", "sub", "aud", "exp", "nbf", "iat", "jti"].map((c, i) => (
            <span key={c}>
              {i > 0 && " · "}
              <span className="mono" title={CLAIMS[c]}>{c}</span>
            </span>
          ))}
          . Times are seconds since 1970 (NumericDate). Keep secrets at least as long as the hash: 32 bytes for HS256.
        </section>
      </div>
    </div>
  );
}

export default function JwtWorkbench(props: CustomProps) {
  const mono = props.mono;
  return (
    <>
      <style>{CSS}</style>
      {props.opts.mode === "sign" ? <Sign p={props} mono={mono} /> : <Decode p={props} mono={mono} />}
    </>
  );
}
