"use client";

import { useEffect, useMemo, useState } from "react";
import CodeEditor from "@/src/components/tool/CodeEditor";
import type { CustomProps } from "@/src/tools/types";
import { CURL_DEFAULT, type CurlState } from "@/src/tools/lib/G-curl";
import { MYSQL_DEFAULT, ACTIONS, type MysqlState } from "@/src/tools/lib/G-mysql";
import { TAR_DEFAULT, detectCompression, type TarState } from "@/src/tools/lib/G-tar";
import GOut, { Check, Field, KVEditor, Sec, Seg, G_CSS } from "./G-Out";

/**
 * One form-driven builder for the curl, mysql and tar command generators.
 * The form state lives in inputs.form as JSON; the shell runs spec.run on
 * every change and the output pane shows the command, explanation and variants.
 */
export default function CmdBuilder(props: CustomProps) {
  const { slug, inputs, setInput, result, error, mono, record } = props;
  const defaults = slug === "curl-cmd-gen" ? CURL_DEFAULT : slug === "mysql-cmd-gen" ? MYSQL_DEFAULT : TAR_DEFAULT;
  const state = useMemo(() => {
    try {
      const v = JSON.parse(inputs.form || "{}");
      return { ...defaults, ...(v && typeof v === "object" ? v : {}) };
    } catch {
      return { ...defaults };
    }
  }, [inputs.form, defaults]);
  const update = (patch: object) => setInput("form", JSON.stringify({ ...state, ...patch }, null, 2));
  const [raw, setRaw] = useState(false);

  return (
    <div className="g-split">
      <style>{G_CSS}</style>
      <section className="g pane" aria-label="Command options">
        <div className="pane-head">
          <span className="lbl">{slug === "curl-cmd-gen" ? "Request" : slug === "mysql-cmd-gen" ? "MySQL task" : "Archive task"}</span>
          <div style={{ flex: 1 }} />
          <button type="button" className="btn-icon" onClick={() => setRaw(!raw)} aria-pressed={raw} title="Edit the form state as JSON (this is what pipelines and share links carry)">
            {raw ? "Form" : "JSON"}
          </button>
          <button type="button" className="btn-icon" onClick={() => setInput("form", JSON.stringify(defaults, null, 2))} title="Reset every field to its default">
            Reset
          </button>
        </div>
        {raw ? (
          <div style={{ display: "flex", minHeight: 460 }}>
            <CodeEditor value={inputs.form} onChange={(v) => setInput("form", v)} lang="json" fontSize={mono} label="Form state JSON" minHeight={460} />
          </div>
        ) : slug === "curl-cmd-gen" ? (
          <CurlForm s={state as CurlState} set={update} mono={mono} />
        ) : slug === "mysql-cmd-gen" ? (
          <MysqlForm s={state as MysqlState} set={update} />
        ) : (
          <TarForm s={state as TarState} set={update} />
        )}
      </section>
      <GOut result={result} error={error} mono={mono} onCopy={record} filename={slug === "curl-cmd-gen" ? "request.sh" : slug === "mysql-cmd-gen" ? "mysql.sh" : "tar.sh"} label="Command" className="g-sticky" minHeight={520} />
    </div>
  );
}

/* ── curl ────────────────────────────────────────────────────────────── */

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

function CurlForm({ s, set, mono }: { s: CurlState; set: (p: Partial<CurlState>) => void; mono: number }) {
  const [tab, setTab] = useState<"params" | "headers" | "body" | "auth" | "options">(s.bodyType !== "none" ? "body" : "params");
  // examples and history can swap the whole request: show the body when there is one
  useEffect(() => {
    if (s.bodyType !== "none") setTab("body");
  }, [s.bodyType]);
  const count = (rows: { k: string; on?: boolean }[]) => rows.filter((r) => r.k && r.on !== false).length;
  return (
    <div className="g-form">
      <div className="g-row" style={{ flexWrap: "nowrap" }}>
        <select className="sel mono" value={s.method} onChange={(e) => set({ method: e.target.value })} aria-label="HTTP method" style={{ fontWeight: 600, color: "var(--color-accent-800)" }}>
          {METHODS.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        <input className="inp mono" style={{ flex: 1, fontSize: 13.5 }} value={s.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://api.example.com/v1/items" aria-label="URL" spellCheck={false} />
      </div>
      <div className="tabs" role="tablist" style={{ borderBottom: "1px solid rgba(32,30,29,.1)" }}>
        {(
          [
            ["params", `Params${count(s.params) ? ` (${count(s.params)})` : ""}`],
            ["headers", `Headers${count(s.headers) ? ` (${count(s.headers)})` : ""}`],
            ["body", `Body${s.bodyType !== "none" ? " ·" : ""}`],
            ["auth", `Auth${s.auth !== "none" ? " ·" : ""}`],
            ["options", "Options"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {tab === "params" && <KVEditor rows={s.params} onChange={(params) => set({ params })} keyPh="parameter" addLabel="Add parameter" hint="Values are URL-encoded for you." />}
      {tab === "headers" && (
        <>
          <KVEditor rows={s.headers} onChange={(headers) => set({ headers })} keyPh="Header-Name" addLabel="Add header" />
          <div className="chips">
            {[
              ["Accept", "application/json"],
              ["Content-Type", "application/json"],
              ["Cache-Control", "no-cache"],
              ["If-None-Match", '"etag"'],
              ["X-Request-ID", "req-123"],
            ].map(([k, v]) => (
              <button key={k} type="button" className="chip" onClick={() => set({ headers: [...s.headers, { k, v, on: true }] })}>
                + {k}
              </button>
            ))}
          </div>
        </>
      )}
      {tab === "body" && (
        <div className="g-sec">
          <Seg
            label="Body type"
            value={s.bodyType}
            onChange={(bodyType) => set({ bodyType, method: bodyType !== "none" && s.method === "GET" ? "POST" : s.method })}
            choices={[["none", "None"], ["json", "JSON"], ["form", "Form"], ["multipart", "Multipart"], ["raw", "Raw"], ["binary", "File"]]}
          />
          {s.bodyType === "json" && (
            <>
              <div style={{ display: "flex", minHeight: 150, border: "1px solid rgba(32,30,29,.12)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
                <CodeEditor value={s.body} onChange={(body) => set({ body })} lang="json" fontSize={mono - 1} label="JSON body" minHeight={150} placeholder='{"name": "value"}' />
              </div>
              <Check checked={s.jsonFlag} onChange={(jsonFlag) => set({ jsonFlag })} title="curl 7.82+: sets Content-Type and Accept for you">
                Use --json (curl 7.82+)
              </Check>
            </>
          )}
          {(s.bodyType === "form" || s.bodyType === "multipart") && (
            <KVEditor rows={s.form} onChange={(form) => set({ form })} keyPh="field" addLabel="Add field" hint={s.bodyType === "multipart" ? "Prefix a value with @ to upload a file: @photo.jpg;type=image/jpeg" : "Sent as application/x-www-form-urlencoded."} />
          )}
          {s.bodyType === "raw" && (
            <>
              <Field label="Content-Type">
                <input className="inp mono" value={s.contentType} onChange={(e) => set({ contentType: e.target.value })} spellCheck={false} />
              </Field>
              <textarea className="inp" rows={6} value={s.body} onChange={(e) => set({ body: e.target.value })} aria-label="Raw body" spellCheck={false} />
            </>
          )}
          {s.bodyType === "binary" && (
            <div className="grid-form">
              <Field label="File path">
                <input className="inp mono" value={s.file} placeholder="payload.bin" onChange={(e) => set({ file: e.target.value })} spellCheck={false} />
              </Field>
              <Field label="Content-Type">
                <input className="inp mono" value={s.contentType} onChange={(e) => set({ contentType: e.target.value })} spellCheck={false} />
              </Field>
            </div>
          )}
          {s.bodyType === "none" && <p className="g-hint">No request body. Pick a type to send JSON, form fields, files or raw text.</p>}
        </div>
      )}
      {tab === "auth" && (
        <div className="g-sec">
          <Seg label="Authentication" value={s.auth} onChange={(auth) => set({ auth })} choices={[["none", "None"], ["basic", "Basic"], ["bearer", "Bearer"], ["digest", "Digest"], ["apikey", "API key"]]} />
          {(s.auth === "basic" || s.auth === "digest") && (
            <div className="grid-form">
              <Field label="User">
                <input className="inp mono" value={s.user} onChange={(e) => set({ user: e.target.value })} autoComplete="off" spellCheck={false} />
              </Field>
              <Field label="Password (blank = prompt)">
                <input className="inp mono" type="password" value={s.pass} onChange={(e) => set({ pass: e.target.value })} autoComplete="new-password" />
              </Field>
            </div>
          )}
          {s.auth === "bearer" && (
            <Field label="Token">
              <input className="inp mono" value={s.token} placeholder="eyJhbGciOi…" onChange={(e) => set({ token: e.target.value })} spellCheck={false} autoComplete="off" />
            </Field>
          )}
          {s.auth === "apikey" && (
            <div className="grid-form">
              <Field label="Name">
                <input className="inp mono" value={s.keyName} onChange={(e) => set({ keyName: e.target.value })} spellCheck={false} />
              </Field>
              <Field label="Value">
                <input className="inp mono" value={s.keyValue} onChange={(e) => set({ keyValue: e.target.value })} spellCheck={false} autoComplete="off" />
              </Field>
              <Field label="Send in">
                <select className="sel" value={s.keyIn} onChange={(e) => set({ keyIn: e.target.value as CurlState["keyIn"] })}>
                  <option value="header">Header</option>
                  <option value="query">Query string</option>
                </select>
              </Field>
            </div>
          )}
          {s.auth === "none" && <p className="g-hint">No credentials. Everything stays on this page — nothing is sent anywhere.</p>}
        </div>
      )}
      {tab === "options" && (
        <div className="g-sec">
          <div className="g-checks">
            <Check checked={s.follow} onChange={(follow) => set({ follow })}>Follow redirects (-L)</Check>
            <Check checked={s.compressed} onChange={(compressed) => set({ compressed })}>--compressed</Check>
            <Check checked={s.include} onChange={(include) => set({ include })}>Show headers (-i)</Check>
            <Check checked={s.verbose} onChange={(verbose) => set({ verbose })}>Verbose (-v)</Check>
            <Check checked={s.silent} onChange={(silent) => set({ silent })}>Silent (-sS)</Check>
            <Check checked={s.insecure} onChange={(insecure) => set({ insecure })}>Insecure (-k)</Check>
          </div>
          <div className="grid-form">
            <Field label="On HTTP errors">
              <select className="sel" value={s.fail} onChange={(e) => set({ fail: e.target.value as CurlState["fail"] })}>
                <option value="none">Print the error page</option>
                <option value="fail">--fail (exit 22, no body)</option>
                <option value="body">--fail-with-body</option>
              </select>
            </Field>
            <Field label="HTTP version">
              <select className="sel" value={s.http} onChange={(e) => set({ http: e.target.value as CurlState["http"] })}>
                <option value="default">Default</option>
                <option value="1.1">HTTP/1.1</option>
                <option value="2">HTTP/2</option>
                <option value="3">HTTP/3</option>
              </select>
            </Field>
            <Field label="Max time (s)">
              <input className="inp mono" inputMode="numeric" value={s.maxTime} onChange={(e) => set({ maxTime: e.target.value.replace(/[^\d.]/g, "") })} />
            </Field>
            <Field label="Connect timeout (s)">
              <input className="inp mono" inputMode="numeric" value={s.connectTimeout} onChange={(e) => set({ connectTimeout: e.target.value.replace(/[^\d.]/g, "") })} />
            </Field>
            <Field label="Retries">
              <input className="inp mono" inputMode="numeric" value={s.retry} onChange={(e) => set({ retry: e.target.value.replace(/\D/g, "") })} />
            </Field>
            <Field label="Save response">
              <select className="sel" value={s.output} onChange={(e) => set({ output: e.target.value as CurlState["output"] })}>
                <option value="none">To stdout</option>
                <option value="o">-o file…</option>
                <option value="O">-O remote name</option>
              </select>
            </Field>
            {s.output === "o" && (
              <Field label="Output file">
                <input className="inp mono" value={s.outFile} placeholder="response.json" onChange={(e) => set({ outFile: e.target.value })} spellCheck={false} />
              </Field>
            )}
            <Field label="Proxy">
              <input className="inp mono" value={s.proxy} placeholder="http://proxy:3128" onChange={(e) => set({ proxy: e.target.value })} spellCheck={false} />
            </Field>
            <Field label="Cookies (-b)">
              <input className="inp mono" value={s.cookie} placeholder="a=1; b=2  or  cookies.txt" onChange={(e) => set({ cookie: e.target.value })} spellCheck={false} />
            </Field>
            <Field label="Cookie jar (-c)">
              <input className="inp mono" value={s.cookieJar} placeholder="cookies.txt" onChange={(e) => set({ cookieJar: e.target.value })} spellCheck={false} />
            </Field>
            <Field label="User agent (-A)">
              <input className="inp mono" value={s.userAgent} placeholder="my-app/1.0" onChange={(e) => set({ userAgent: e.target.value })} spellCheck={false} />
            </Field>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── mysql ───────────────────────────────────────────────────────────── */

function MysqlForm({ s, set }: { s: MysqlState; set: (p: Partial<MysqlState>) => void }) {
  const a = s.action;
  const dumping = a === "dump" || a === "dumpTable" || a === "schema";
  return (
    <div className="g-form">
      <Sec title="Task">
        <div className="g-choice" role="group" aria-label="Action">
          {ACTIONS.map(([id, label]) => (
            <button key={id} type="button" aria-pressed={a === id} onClick={() => set({ action: id })}>
              {label}
            </button>
          ))}
        </div>
      </Sec>
      <Sec title="Connection">
        <div className="grid-form">
          <Field label="Host">
            <input className="inp mono" value={s.host} onChange={(e) => set({ host: e.target.value })} spellCheck={false} />
          </Field>
          <Field label="Port">
            <input className="inp mono" value={s.port} onChange={(e) => set({ port: e.target.value.replace(/\D/g, "") })} inputMode="numeric" />
          </Field>
          <Field label="User">
            <input className="inp mono" value={s.user} onChange={(e) => set({ user: e.target.value })} spellCheck={false} disabled={s.auth === "loginPath"} />
          </Field>
          <Field label="Password" hint="How the client gets the password">
            <select className="sel" value={s.auth} onChange={(e) => set({ auth: e.target.value as MysqlState["auth"] })}>
              <option value="prompt">Prompt (-p) — safest</option>
              <option value="loginPath">--login-path (mysql_config_editor)</option>
              <option value="env">MYSQL_PWD env (deprecated)</option>
              <option value="inline">Inline -pSECRET (insecure)</option>
              <option value="none">No password</option>
            </select>
          </Field>
          {(s.auth === "env" || s.auth === "inline") && (
            <Field label="Password value">
              <input className="inp mono" type="password" value={s.password} onChange={(e) => set({ password: e.target.value })} autoComplete="new-password" />
            </Field>
          )}
          {s.auth === "loginPath" && (
            <Field label="Login path">
              <input className="inp mono" value={s.loginPath} onChange={(e) => set({ loginPath: e.target.value })} spellCheck={false} />
            </Field>
          )}
          <Field label="TLS (--ssl-mode)">
            <select className="sel" value={s.ssl} onChange={(e) => set({ ssl: e.target.value as MysqlState["ssl"] })}>
              <option value="">Default (PREFERRED)</option>
              <option>DISABLED</option>
              <option>REQUIRED</option>
              <option>VERIFY_CA</option>
              <option>VERIFY_IDENTITY</option>
            </select>
          </Field>
          <Field label="Charset">
            <select className="sel" value={s.charset} onChange={(e) => set({ charset: e.target.value })}>
              <option value="utf8mb4">utf8mb4</option>
              <option value="utf8mb3">utf8mb3</option>
              <option value="latin1">latin1</option>
              <option value="">(server default)</option>
            </select>
          </Field>
        </div>
      </Sec>
      <Sec title="Target">
        <div className="grid-form">
          <Field label="Database">
            <input className="inp mono" value={s.database} onChange={(e) => set({ database: e.target.value })} spellCheck={false} disabled={s.allDatabases && a !== "restore" && a !== "dumpTable"} />
          </Field>
          {(a === "dumpTable" || a === "importCsv" || a === "check") && (
            <Field label={a === "check" ? "Table (optional)" : "Table"}>
              <input className="inp mono" value={s.table} onChange={(e) => set({ table: e.target.value })} spellCheck={false} />
            </Field>
          )}
          {(dumping || a === "restore") && (
            <Field label={a === "restore" ? "Dump file" : "Output file (blank = auto)"}>
              <input className="inp mono" value={s.file} placeholder={a === "restore" ? "shop.sql.gz" : "shop-$(date +%F).sql"} onChange={(e) => set({ file: e.target.value, gzip: a === "restore" ? /\.gz$/.test(e.target.value) || (!e.target.value && s.gzip) : s.gzip })} spellCheck={false} />
            </Field>
          )}
        </div>
        {(a === "dump" || a === "schema" || a === "check") && (
          <Check checked={s.allDatabases} onChange={(allDatabases) => set({ allDatabases })}>All databases</Check>
        )}
      </Sec>
      {dumping && (
        <Sec title="Dump options">
          <div className="g-checks">
            {a !== "schema" && <Check checked={s.singleTransaction} onChange={(singleTransaction) => set({ singleTransaction })} title="Consistent InnoDB snapshot without locking">--single-transaction</Check>}
            <Check checked={s.routines} onChange={(routines) => set({ routines })}>--routines</Check>
            <Check checked={s.triggers} onChange={(triggers) => set({ triggers })}>--triggers</Check>
            <Check checked={s.events} onChange={(events) => set({ events })}>--events</Check>
            {a !== "schema" && <Check checked={s.noData} onChange={(noData) => set({ noData })}>--no-data</Check>}
            <Check checked={s.gzip} onChange={(gzip) => set({ gzip })}>gzip</Check>
            <Check checked={!s.columnStats} onChange={(v) => set({ columnStats: !v })} title="mysqldump 8 against MySQL 5.7 / MariaDB">--column-statistics=0</Check>
          </div>
          {a === "dumpTable" && (
            <Field label="--where (optional)">
              <input className="inp mono" value={s.where} placeholder="created_at >= '2026-01-01'" onChange={(e) => set({ where: e.target.value })} spellCheck={false} />
            </Field>
          )}
        </Sec>
      )}
      {a === "restore" && (
        <Check checked={s.gzip} onChange={(gzip) => set({ gzip })}>The dump is gzipped (.sql.gz)</Check>
      )}
      {a === "exportCsv" && (
        <Sec title="Query">
          <textarea className="inp" rows={4} value={s.query} onChange={(e) => set({ query: e.target.value })} aria-label="SQL query" spellCheck={false} />
          <div className="grid-form">
            <Field label="CSV file">
              <input className="inp mono" value={s.csvFile} onChange={(e) => set({ csvFile: e.target.value })} spellCheck={false} />
            </Field>
          </div>
          <div className="g-checks">
            <Check checked={s.csvHeader} onChange={(csvHeader) => set({ csvHeader })}>Header row</Check>
            <Check checked={s.outfile} onChange={(outfile) => set({ outfile })} title="Server-side export: the file is written on the database host">Server-side INTO OUTFILE</Check>
          </div>
        </Sec>
      )}
      {a === "importCsv" && (
        <Sec title="CSV file">
          <div className="grid-form">
            <Field label="Local CSV path">
              <input className="inp mono" value={s.csvFile} onChange={(e) => set({ csvFile: e.target.value })} spellCheck={false} />
            </Field>
          </div>
          <Check checked={s.csvHeader} onChange={(csvHeader) => set({ csvHeader })}>First line is a header (IGNORE 1 LINES)</Check>
        </Sec>
      )}
      {a === "createUser" && (
        <Sec title="New account">
          <div className="grid-form">
            <Field label="User name">
              <input className="inp mono" value={s.newUser} onChange={(e) => set({ newUser: e.target.value })} spellCheck={false} />
            </Field>
            <Field label="Allowed host" hint="% = anywhere, localhost, or a pattern like 10.0.%">
              <input className="inp mono" value={s.newUserHost} onChange={(e) => set({ newUserHost: e.target.value })} spellCheck={false} />
            </Field>
            <Field label="Password">
              <input className="inp mono" type="password" value={s.newPassword} onChange={(e) => set({ newPassword: e.target.value })} autoComplete="new-password" />
            </Field>
            <Field label="Privileges">
              <select className="sel" value={s.privileges} onChange={(e) => set({ privileges: e.target.value })}>
                <option value="SELECT">Read only (SELECT)</option>
                <option value="SELECT, INSERT, UPDATE, DELETE">Read/write data</option>
                <option value="SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, DROP, REFERENCES">App + migrations</option>
                <option value="SELECT, LOCK TABLES, SHOW VIEW, EVENT, TRIGGER, PROCESS">Backup user</option>
                <option value="ALL PRIVILEGES">ALL PRIVILEGES</option>
              </select>
            </Field>
          </div>
          <p className="g-hint">Grants apply to {s.database ? <code>{s.database}.*</code> : <code>*.*</code>} — set Database above to limit them.</p>
        </Sec>
      )}
      {a === "check" && (
        <Sec title="Mode">
          <Seg label="Check mode" value={s.checkMode} onChange={(checkMode) => set({ checkMode })} choices={[["check", "Check"], ["auto-repair", "Check + repair"], ["repair", "Repair"], ["analyze", "Analyze"], ["optimize", "Optimize"]]} />
        </Sec>
      )}
      <Sec title="Docker">
        <div className="grid-form">
          <Field label="Container name" hint="Used by the docker exec variant (toggle it in the options bar)">
            <input className="inp mono" value={s.container} onChange={(e) => set({ container: e.target.value })} spellCheck={false} />
          </Field>
        </div>
      </Sec>
    </div>
  );
}

/* ── tar ─────────────────────────────────────────────────────────────── */

const EXT: Record<string, string> = { none: ".tar", gzip: ".tar.gz", bzip2: ".tar.bz2", xz: ".tar.xz", zstd: ".tar.zst", auto: ".tar.gz" };

function TarForm({ s, set }: { s: TarState; set: (p: Partial<TarState>) => void }) {
  const writing = s.op === "create" || s.op === "append" || s.op === "update";
  const setCompression = (compression: TarState["compression"]) => {
    // keep the archive suffix in step with the compressor when creating
    let archive = s.archive;
    if (s.op === "create" && compression !== "auto") archive = archive.replace(/\.(tar(\.(gz|bz2|xz|zst))?|tgz|tbz2?|txz|tzst)$/i, "") + EXT[compression];
    set({ compression, archive });
  };
  return (
    <div className="g-form">
      <Sec title="Operation">
        <Seg label="Operation" value={s.op} onChange={(op) => set({ op, compression: (op === "append" || op === "update") ? "none" : s.compression, archive: (op === "append" || op === "update") ? s.archive.replace(/\.(gz|bz2|xz|zst)$/i, "") : s.archive })} choices={[["create", "Create"], ["extract", "Extract"], ["list", "List"], ["append", "Append"], ["update", "Update"], ["diff", "Compare"]]} />
      </Sec>
      <Sec title="Archive">
        <Seg label="Compression" value={s.compression} onChange={setCompression} choices={[["none", "None"], ["gzip", "gzip"], ["bzip2", "bzip2"], ["xz", "xz"], ["zstd", "zstd"], ["auto", "Auto"]]} />
        <div className="grid-form">
          <Field label="Archive file">
            <input
              className="inp mono"
              value={s.archive}
              onChange={(e) => {
                const archive = e.target.value;
                const d = !writing ? detectCompression(archive) : null;
                set(d ? { archive, compression: d } : { archive });
              }}
              spellCheck={false}
            />
          </Field>
          <Field label={s.op === "extract" ? "Extract into (-C)" : "Change to directory (-C)"}>
            <input className="inp mono" value={s.dir} placeholder={s.op === "extract" ? "/opt/app" : "(current directory)"} onChange={(e) => set({ dir: e.target.value })} spellCheck={false} />
          </Field>
          {s.op === "extract" && (
            <Field label="--strip-components">
              <input className="inp mono" type="number" min={0} max={10} value={s.strip} onChange={(e) => set({ strip: Math.max(0, Math.min(10, e.target.valueAsNumber || 0)) })} />
            </Field>
          )}
        </div>
      </Sec>
      {(writing || s.op === "diff") && (
        <Sec title="Files">
          <Field label="Paths to archive (space-separated)">
            <input className="inp mono" value={s.paths} onChange={(e) => set({ paths: e.target.value })} spellCheck={false} />
          </Field>
          <Field label="Exclude (one pattern per line)">
            <textarea className="inp" rows={3} value={s.excludes} onChange={(e) => set({ excludes: e.target.value })} spellCheck={false} />
          </Field>
        </Sec>
      )}
      {(s.op === "extract" || s.op === "list") && (
        <Sec title="Members">
          <Field label="Only these paths (optional, space-separated)">
            <input className="inp mono" value={s.members} placeholder="etc/nginx/nginx.conf" onChange={(e) => set({ members: e.target.value })} spellCheck={false} />
          </Field>
          {s.op === "extract" && (
            <Field label="Exclude (one pattern per line)">
              <textarea className="inp" rows={2} value={s.excludes} onChange={(e) => set({ excludes: e.target.value })} spellCheck={false} />
            </Field>
          )}
        </Sec>
      )}
      <Sec title="Flags">
        <div className="g-checks">
          <Check checked={s.verbose} onChange={(verbose) => set({ verbose })}>Verbose (-v)</Check>
          {s.op === "extract" && <Check checked={s.preserve} onChange={(preserve) => set({ preserve })}>Preserve permissions (-p)</Check>}
          {s.op === "extract" && <Check checked={s.keepOld} onChange={(keepOld) => set({ keepOld })}>Keep existing files (-k)</Check>}
          {writing && <Check checked={s.follow} onChange={(follow) => set({ follow })}>Follow symlinks (-h)</Check>}
          {writing && <Check checked={s.excludeVcs} onChange={(excludeVcs) => set({ excludeVcs })}>Skip .git etc.</Check>}
          <Check checked={s.long} onChange={(long) => set({ long })}>Long options</Check>
        </div>
        <div className="g-row">
          <span className="lbl" style={{ fontSize: 11 }}>tar flavour</span>
          <Seg label="tar flavour" value={s.flavor} onChange={(flavor) => set({ flavor })} choices={[["gnu", "GNU (Linux)"], ["bsd", "bsdtar (macOS)"]]} />
        </div>
      </Sec>
    </div>
  );
}
