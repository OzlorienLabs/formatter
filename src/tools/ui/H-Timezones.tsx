"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ToolIcon from "@/src/components/ToolIcon";
import OutputView from "@/src/components/tool/OutputView";
import type { CustomProps, View } from "@/src/tools/types";
import { DEFAULT_ZONES } from "@/src/tools/time";
import {
  abbr, allZones, cityOf, dayDelta, dstInfo, fmtDate, fmtDateShort, fmtOffset, fmtTime, fmtTransition, localZone, nextTransition, offsetMin, overlapIntervals,
  parseRefTime, partsIn, resolveZone, searchZones, toLocalInput, zonedToUtc, entryName,
} from "@/src/tools/lib/H-tz";

const CSS = `
.h-tz { display: grid; gap: 12px; }
.h-tz-bar { display: flex; flex-wrap: wrap; gap: 10px 14px; align-items: center; padding: 10px 12px; }
.h-tz-bar .grp { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.h-tz-live { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: oklch(42% .12 150); padding: 3px 9px; border-radius: 999px; background: rgba(0,160,90,.09); }
.h-tz-live i { width: 7px; height: 7px; border-radius: 50%; background: oklch(58% .14 150); animation: h-tz-pulse 1.6s ease-in-out infinite; }
@keyframes h-tz-pulse { 50% { opacity: .3 } }
.calm .h-tz-live i { animation: none; }
.h-tz-add { position: relative; }
.h-tz-add input { width: 260px; max-width: 70vw; }
.h-tz-sug { position: absolute; z-index: 30; top: calc(100% + 4px); left: 0; min-width: 300px; max-height: 320px; overflow: auto; padding: 4px; border-radius: var(--radius-lg); background: var(--color-surface); border: 1px solid var(--color-neutral-300); box-shadow: var(--shadow-lg); }
.h-tz-sug button { display: flex; width: 100%; justify-content: space-between; gap: 10px; padding: 6px 9px; border: 0; background: none; text-align: left; cursor: pointer; font-size: 13.5px; border-radius: var(--radius-md); }
.h-tz-sug button[aria-selected="true"], .h-tz-sug button:hover { background: var(--color-accent-100); }
.h-tz-sug small { color: var(--color-neutral-600); font-family: var(--font-mono); font-size: 11.5px; }
.h-tz-scroll { overflow-x: auto; }
.h-tz-grid { display: grid; grid-template-columns: minmax(250px, 300px) repeat(24, minmax(34px, 1fr)); min-width: 1080px; position: relative; }
.h-tz-grid > div { border-bottom: 1px solid rgba(32,30,29,.07); }
.h-tz-head { position: sticky; top: 0; z-index: 2; font-size: 11px; color: var(--color-neutral-600); text-align: center; padding: 6px 0 5px; font-family: var(--font-mono); background: var(--color-surface); }
.h-tz-head.ov { color: oklch(42% .12 150); }
.h-tz-head.ov::after { content: ""; display: block; height: 3px; margin: 4px 2px 0; border-radius: 2px; background: oklch(62% .14 150); }
.h-tz-info { position: sticky; left: 0; z-index: 1; background: var(--color-surface); padding: 9px 10px 9px 8px; display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; gap: 2px 8px; align-items: center; border-right: 1px solid rgba(32,30,29,.1); }
.h-tz-info .ord { display: grid; gap: 1px; grid-row: span 3; }
.h-tz-info .ord button { border: 0; background: none; padding: 0 2px; cursor: pointer; color: var(--color-neutral-500); font-size: 11px; line-height: 1.2; }
.h-tz-info .ord button:hover:not(:disabled) { color: var(--color-accent-800); }
.h-tz-info .ord button:disabled { opacity: .3; cursor: default; }
.h-tz-city { font-size: 15px; font-weight: 500; color: var(--color-neutral-900); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.h-tz-home { font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: var(--color-accent-800); background: var(--color-accent-100); padding: 1px 6px; border-radius: 999px; margin-left: 6px; vertical-align: 2px; }
.h-tz-time { font-family: var(--font-mono); font-size: 19px; font-variant-numeric: tabular-nums; text-align: right; color: var(--color-neutral-900); white-space: nowrap; }
.h-tz-meta { font-size: 11.5px; color: var(--color-neutral-600); font-family: var(--font-mono); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.h-tz-badge { font-family: inherit; font-size: 10px; letter-spacing: .06em; text-transform: uppercase; padding: 0 5px; border-radius: 4px; margin-left: 4px; }
.h-tz-cell { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: var(--font-mono); font-size: 12px; cursor: pointer; border-left: 1px solid rgba(255,255,255,.7); min-height: 58px; color: var(--color-neutral-800); background: rgba(255,255,255,.55); user-select: none; }
.h-tz-cell.night { background: rgba(38,42,72,.16); color: var(--color-neutral-600); }
.h-tz-cell.work { background: var(--color-accent-100); color: var(--color-accent-900); }
.h-tz-cell.ov { background: rgba(0,160,90,.16); color: oklch(35% .1 150); }
.h-tz-cell.hov { box-shadow: inset 0 0 0 2px rgba(0,136,176,.35); }
.h-tz-cell.ref { box-shadow: inset 0 0 0 2px var(--color-accent-600); }
.h-tz-cell .dt { font-size: 9.5px; color: var(--color-neutral-600); letter-spacing: .02em; font-family: var(--font-sans, inherit); }
.h-tz-cell .mm { font-size: 9.5px; opacity: .7; }
.h-tz-rm { border: 0; background: none; cursor: pointer; color: var(--color-neutral-500); padding: 2px; grid-row: span 3; align-self: start; }
.h-tz-rm:hover { color: var(--color-accent-2-700); }
.h-tz-foot { display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: center; padding: 8px 12px; border-top: 1px solid rgba(32,30,29,.08); font-size: 13px; color: var(--color-neutral-700); }
.h-tz-legend { display: inline-flex; gap: 12px; flex-wrap: wrap; font-size: 12px; color: var(--color-neutral-600); }
.h-tz-legend i { display: inline-block; width: 12px; height: 12px; border-radius: 3px; vertical-align: -2px; margin-right: 4px; }
.h-tz-out { min-height: 280px; }
.h-tz-rm { grid-column: 4; grid-row: 1 / span 3; }
.h-tz-meta.wide { grid-column: 2 / 4; }
@media (max-width: 760px) {
  .h-tz-grid { grid-template-columns: 132px repeat(24, 38px); min-width: 0; }
  .h-tz-info { grid-template-columns: minmax(0, 1fr) auto; padding: 8px 6px 8px 10px; }
  .h-tz-info .ord { display: none; }
  .h-tz-rm { grid-column: 2; grid-row: 1; }
  .h-tz-time { grid-column: 1; text-align: left; }
  .h-tz-meta.off, .h-tz-meta.wide { grid-column: 1 / 3; }
  .h-tz-meta.date { display: none; }
  .h-tz-time { font-size: 15px; }
  .h-tz-city { font-size: 14px; }
  .h-tz-home { display: none; }
}
`;

const HOUR = 3600000;

export default function Timezones({ inputs, opts, setInput, result, error, mono, record }: CustomProps) {
  const zonesList = useMemo(() => allZones(), []);
  const tokens = useMemo(() => (inputs.zones?.trim() ? inputs.zones : DEFAULT_ZONES).split(/[,\n;]+/).map((s) => s.trim()).filter(Boolean), [inputs.zones]);
  const entries = useMemo(() => {
    const seen = new Set<string>();
    const out: { token: string; zone: string | null }[] = [];
    for (const t of tokens) {
      const z = resolveZone(t, zonesList);
      if (z && seen.has(z)) continue;
      if (z) seen.add(z);
      out.push({ token: t, zone: z });
    }
    return out;
  }, [tokens, zonesList]);
  const zones = entries.filter((e) => e.zone).map((e) => e.zone!) as string[];
  const nameOf = (z: string) => {
    const e = entries.find((x) => x.zone === z);
    return e ? entryName(e.token, z) : cityOf(z);
  };
  const bad = entries.filter((e) => !e.zone).map((e) => e.token);
  const home = zones[0] ?? "UTC";
  const live = !inputs.time?.trim() || /^now$/i.test(inputs.time.trim());
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    const iv = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [live]);
  const parsed = parseRefTime(inputs.time ?? "", home, clock);
  const t = live ? clock : parsed ?? clock;
  const h12 = opts.clock === "12";
  const ws = Number(opts.workStart ?? 9), we = Number(opts.workEnd ?? 17);
  const hp = partsIn(home, t);
  const dayStart = zonedToUtc(home, hp.y, hp.mo, hp.d, 0, 0);
  const cols = useMemo(() => Array.from({ length: 24 }, (_, i) => dayStart + i * HOUR), [dayStart]);
  const refCol = Math.max(0, Math.min(23, Math.floor((t - dayStart) / HOUR)));
  const [hover, setHover] = useState<number | null>(null);
  const [flash, setFlash] = useState("");
  const say = (m: string) => {
    setFlash(m);
    setTimeout(() => setFlash(""), 1600);
  };

  const isWork = (z: string, at: number) => {
    const p = partsIn(z, at);
    const hm = p.h + p.mi / 60;
    return p.wd >= 1 && p.wd <= 5 && hm >= ws && hm < we;
  };
  const ovCols = useMemo(() => new Set(cols.map((c, i) => (zones.length && zones.every((z) => isWork(z, c) && isWork(z, c + HOUR - 60000)) ? i : -1)).filter((i) => i >= 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cols, zones.join(","), ws, we]);
  const overlap = useMemo(() => (zones.length ? overlapIntervals(zones, dayStart, ws, we) : []), [zones.join(","), dayStart, ws, we]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── list editing ──────────────────────────────────────────────── */
  const writeTokens = (list: string[], keepInstant = true) => {
    const nextHome = resolveZone(list[0] ?? "", zonesList);
    setInput("zones", list.join(", "));
    // Keep the same instant when the home zone changes (the stored time is wall time in the first zone).
    if (keepInstant && !live && nextHome && nextHome !== home) setInput("time", toLocalInput(nextHome, t));
  };
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= entries.length) return;
    const list = entries.map((e) => e.token);
    [list[i], list[j]] = [list[j], list[i]];
    writeTokens(list);
  };
  const remove = (i: number) => writeTokens(entries.filter((_, k) => k !== i).map((e) => e.token));
  const makeHome = (i: number) => {
    const list = entries.map((e) => e.token);
    const [x] = list.splice(i, 1);
    writeTokens([x, ...list]);
  };

  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [open, setOpen] = useState(false);
  const sugg = useMemo(() => searchZones(q, zonesList, 12), [q, zonesList]);
  const addZone = (z: string, alias?: string) => {
    if (zones.includes(z)) {
      say(`${nameOf(z)} (${z}) is already listed`);
    } else {
      writeTokens([...entries.map((e) => e.token), alias ?? z], false);
      say(`Added ${alias ?? cityOf(z)}`);
    }
    setQ("");
    setOpen(false);
  };
  const addBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (addBox.current && !addBox.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  /* ── time controls ─────────────────────────────────────────────── */
  const setTime = (at: number) => setInput("time", toLocalInput(home, at));
  const summaryAt = (at: number) => zones.map((z) => {
    const p = partsIn(z, at);
    return `${nameOf(z)} ${fmtTime(p, h12)} ${abbr(z, at)}${dayDelta(partsIn(home, at), p) ? ` (${fmtDateShort(p)})` : ""}`;
  }).join(" · ");
  const meetingLine = `${fmtDate(hp)} — ${summaryAt(t)}`;

  const views: View[] = result?.views ?? [];
  const [tab, setTab] = useState(0);
  const active = views[Math.min(tab, Math.max(0, views.length - 1))];
  const hoverAt = hover !== null ? cols[hover] : null;

  return (
    <div className="h-tz">
      <style>{CSS}</style>
      <section className="g pane" aria-label="Reference time and zones">
        <div className="h-tz-bar">
          <div className="grp">
            <span className="lbl">Time in {nameOf(home)}</span>
            <input
              className="inp mono"
              type="datetime-local"
              value={toLocalInput(home, t)}
              onChange={(e) => e.target.value && setInput("time", e.target.value)}
              aria-label={`Reference date and time in ${home}`}
            />
            {live ? (
              <span className="h-tz-live"><i /> Live</span>
            ) : (
              <button type="button" className="btn btn-sm" onClick={() => setInput("time", "")} title="Follow the current time">
                <ToolIcon name="clock-countdown" size={15} /> Now
              </button>
            )}
          </div>
          <div className="seg" role="group" aria-label="Shift time">
            <button type="button" onClick={() => setTime(t - 86400000)} title="One day earlier">−1d</button>
            <button type="button" onClick={() => setTime(t - HOUR)} title="One hour earlier">−1h</button>
            <button type="button" onClick={() => setTime(t + HOUR)} title="One hour later">+1h</button>
            <button type="button" onClick={() => setTime(t + 86400000)} title="One day later">+1d</button>
          </div>
          <div style={{ flex: 1 }} />
          <div className="h-tz-add" ref={addBox}>
            <input
              className="inp"
              value={q}
              placeholder="Add a city, zone or abbreviation…"
              aria-label="Add time zone"
              role="combobox"
              aria-controls="h-tz-sugg"
              aria-expanded={open && sugg.length > 0}
              onChange={(e) => { setQ(e.target.value); setSel(0); setOpen(true); }}
              onFocus={() => setOpen(true)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(sugg.length - 1, s + 1)); }
                else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
                else if (e.key === "Enter") {
                  e.preventDefault();
                  const hit = sugg[sel];
                  const z = hit?.zone ?? resolveZone(q, zonesList);
                  if (z) addZone(z, hit?.alias);
                  else say(`No zone matches "${q}"`);
                } else if (e.key === "Escape") setOpen(false);
              }}
            />
            {open && sugg.length > 0 && (
              <div className="h-tz-sug" role="listbox" id="h-tz-sugg">
                {sugg.map((s, i) => (
                  <button key={s.zone + s.label} type="button" role="option" aria-selected={i === sel} onMouseEnter={() => setSel(i)} onClick={() => addZone(s.zone, s.alias)}>
                    <span>{s.label}</span>
                    <small>{fmtOffset(offsetMin(s.zone, t))}</small>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button type="button" className="btn btn-sm" onClick={() => writeTokens(["local", ...entries.map((e) => e.token).filter((x) => x !== "local" && resolveZone(x, zonesList) !== localZone())])} title="Put your own zone first">
            <ToolIcon name="globe-hemisphere-west" size={15} /> My zone first
          </button>
        </div>
        {flash && <div className="note" role="status" style={{ background: "rgba(0,160,90,.07)", borderColor: "rgba(0,160,90,.2)" }}>{flash}</div>}
        {bad.length > 0 && <div className="errband" style={{ fontSize: 13.5 }}><ToolIcon name="warning-circle" size={17} color="var(--color-accent-2-700)" /> Not recognised: {bad.join(", ")} — use a city, an IANA name (Europe/Paris) or UTC+5:30.</div>}

        <div className="h-tz-scroll scroll" style={{ borderTop: "1px solid rgba(32,30,29,.1)" }} onMouseLeave={() => setHover(null)}>
          <div className="h-tz-grid" role="grid" aria-label="24-hour comparison">
            <div className="h-tz-head" style={{ textAlign: "left", paddingLeft: 12, position: "sticky", left: 0, zIndex: 3 }}>
              {fmtDate(hp)} · hours in {nameOf(home)}
            </div>
            {cols.map((c, i) => {
              const p = partsIn(home, c);
              return (
                <div key={i} className={`h-tz-head${ovCols.has(i) ? " ov" : ""}`} title={ovCols.has(i) ? "Everyone is in working hours" : undefined}>
                  {h12 ? `${p.h % 12 || 12}${p.h < 12 ? "a" : "p"}` : String(p.h).padStart(2, "0")}
                </div>
              );
            })}
            {zones.map((z, zi) => {
              const p = partsIn(z, t);
              const off = offsetMin(z, t);
              const d = dstInfo(z, t);
              const nx = d.observes ? nextTransition(z, t) : null;
              const dd = dayDelta(hp, p);
              const entryIndex = entries.findIndex((e) => e.zone === z);
              return [
                <div key={z + "-info"} className="h-tz-info" title={`${z}\n${fmtOffset(off)}${nx ? `\nNext change: ${fmtTransition(nx, h12)}` : "\nNo DST"}`}>
                  <div className="ord">
                    <button type="button" onClick={() => move(entryIndex, -1)} disabled={zi === 0} aria-label={`Move ${nameOf(z)} up`}>▲</button>
                    <button type="button" onClick={() => makeHome(entryIndex)} disabled={zi === 0} aria-label={`Make ${nameOf(z)} home`} title="Make home">⌂</button>
                    <button type="button" onClick={() => move(entryIndex, 1)} disabled={zi === zones.length - 1} aria-label={`Move ${nameOf(z)} down`}>▼</button>
                  </div>
                  <div className="h-tz-city">
                    {nameOf(z)}
                    {z === localZone() && <span className="h-tz-home" style={{ background: "rgba(0,160,90,.1)", color: "oklch(42% .12 150)" }}>you</span>}
                    {zi === 0 && <span className="h-tz-home">home</span>}
                  </div>
                  <div className="h-tz-time">{fmtTime(p, h12)}</div>
                  <div className="h-tz-meta off">
                    {fmtOffset(off).replace("UTC", "")} {abbr(z, t)}
                    {d.observes && <span className="h-tz-badge" style={{ background: d.active ? "rgba(237,187,0,.18)" : "rgba(32,30,29,.06)" }}>{d.active ? "DST" : "std"}</span>}
                  </div>
                  <div className="h-tz-meta date" style={{ textAlign: "right" }}>
                    {fmtDateShort(p)}
                    {dd !== 0 && <span className="h-tz-badge" style={{ background: "rgba(0,136,176,.1)", color: "var(--color-accent-800)" }}>{dd > 0 ? "+" : ""}{dd}d</span>}
                  </div>
                  <div className="h-tz-meta wide">{nx ? `DST ${nx.after > nx.before ? "starts" : "ends"} ${fmtDateShort(partsIn(z, nx.at))}` : z.split("/")[0] === "Etc" || z === "UTC" ? "Coordinated Universal Time" : "No DST"}</div>
                  <button type="button" className="h-tz-rm" onClick={() => remove(entryIndex)} aria-label={`Remove ${nameOf(z)}`} title="Remove" style={{ display: zones.length > 1 ? undefined : "none" }}>
                    <ToolIcon name="x" size={14} />
                  </button>
                </div>,
                ...cols.map((c, i) => {
                  const cp = partsIn(z, c);
                  const work = isWork(z, c);
                  const night = cp.h < 7 || cp.h >= 22;
                  const newDay = i === 0 || partsIn(z, cols[i - 1]).d !== cp.d;
                  const cls = ["h-tz-cell", ovCols.has(i) ? "ov" : work ? "work" : night ? "night" : "", hover === i ? "hov" : "", refCol === i ? "ref" : ""].join(" ");
                  return (
                    <div key={z + i} className={cls} role="gridcell" onMouseEnter={() => setHover(i)} onClick={() => setTime(c)} title={`${nameOf(z)}: ${fmtDateShort(cp)} ${fmtTime(cp, h12)} — click to set this time`}>
                      {newDay && <span className="dt">{fmtDateShort(cp).split(" ").slice(0, 2).join(" ")}</span>}
                      <span>{h12 ? `${cp.h % 12 || 12}${cp.h < 12 ? "a" : "p"}` : cp.h}</span>
                      {cp.mi !== 0 && <span className="mm">:{String(cp.mi).padStart(2, "0")}</span>}
                    </div>
                  );
                }),
              ];
            })}
          </div>
        </div>
        <div className="h-tz-foot">
          {hoverAt !== null ? (
            <span className="mono" style={{ fontSize: 12.5 }}>{summaryAt(hoverAt)}</span>
          ) : (
            <span>
              <b style={{ fontWeight: 500 }}>Overlap {ws}:00–{we}:00:</b>{" "}
              {overlap.length
                ? overlap.map(([a, b]) => `${fmtTime(partsIn(home, a), h12)}–${fmtTime(partsIn(home, b), h12)} ${nameOf(home)}`).join(", ")
                : "none on this day — see the Comparison tab for the least painful slots"}
            </span>
          )}
          <div style={{ flex: 1 }} />
          <span className="h-tz-legend">
            <span><i style={{ background: "var(--color-accent-100)" }} />working</span>
            <span><i style={{ background: "rgba(0,160,90,.16)" }} />everyone working</span>
            <span><i style={{ background: "rgba(38,42,72,.16)" }} />night</span>
          </span>
        </div>
      </section>

      <section className="g pane h-tz-out" aria-label="Summary">
        <div className="pane-head">
          <div className="tabs" role="tablist" style={{ flex: 1, minWidth: 0 }}>
            {views.map((v, i) => (
              <button key={v.label} type="button" role="tab" aria-selected={active === v} onClick={() => setTab(i)}>{v.label}</button>
            ))}
          </div>
          <button type="button" className="btn-icon" onClick={() => { navigator.clipboard?.writeText(meetingLine).catch(() => {}); record(meetingLine); say("Meeting line copied"); }} title={meetingLine}>
            <ToolIcon name="calendar-dots" size={15} /> Copy meeting line
          </button>
          <button type="button" className="btn-icon" disabled={!result?.text} onClick={() => { navigator.clipboard?.writeText(result?.text ?? "").catch(() => {}); record(result?.text ?? ""); say("Summary copied"); }}>
            <ToolIcon name="copy" size={15} /> Copy table
          </button>
        </div>
        {error && (
          <div className="errband">
            <ToolIcon name="warning-circle" size={18} color="var(--color-accent-2-700)" />
            <span style={{ fontSize: 13.5 }}>{error}</span>
          </div>
        )}
        <div className="scroll" style={{ flex: 1, overflow: "auto", minHeight: 0 }}>{active ? <OutputView out={active.out} fontSize={mono} /> : null}</div>
      </section>
    </div>
  );
}
