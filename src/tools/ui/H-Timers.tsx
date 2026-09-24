"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ToolIcon from "@/src/components/ToolIcon";
import CodeEditor from "@/src/components/tool/CodeEditor";
import OutputView, { downloadBlob } from "@/src/components/tool/OutputView";
import type { CustomProps, View } from "@/src/tools/types";
import { parseDuration, timerText, toCompact } from "@/src/tools/lib/H-duration";
import { lapsCsv, parseNums, readStopwatch, type Stopwatch } from "@/src/tools/time";

type Mode = "stopwatch" | "countdown" | "pomodoro" | "intervals" | "convert";
const TABS: { id: Mode; label: string; icon: string }[] = [
  { id: "stopwatch", label: "Stopwatch", icon: "timer" },
  { id: "countdown", label: "Countdown", icon: "clock-countdown" },
  { id: "pomodoro", label: "Pomodoro", icon: "circle-half" },
  { id: "intervals", label: "Intervals", icon: "lightning" },
  { id: "convert", label: "Convert", icon: "arrows-clockwise" },
];

const CSS = `
.h-tm { display: grid; gap: 12px; }
.h-tm-tabs { display: flex; gap: 4px; flex-wrap: wrap; padding: 6px; }
.h-tm-tabs button { display: inline-flex; align-items: center; gap: 7px; padding: 8px 14px; border: 0; border-radius: var(--radius-md); background: transparent; cursor: pointer; font-size: 14.5px; color: var(--color-neutral-700); }
.h-tm-tabs button:hover { background: rgba(0,136,176,.07); color: var(--color-accent-800); }
.h-tm-tabs button[aria-selected="true"] { background: var(--color-accent-700); color: #fff; }
.h-tm-tabs .dot { width: 7px; height: 7px; border-radius: 50%; background: oklch(62% .16 150); box-shadow: 0 0 0 3px rgba(0,160,90,.18); }
.h-tm-body { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 14px; }
.h-tm-face { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; padding: 26px 18px; min-height: 380px; }
.h-tm-big { font-family: var(--font-mono); font-variant-numeric: tabular-nums; font-size: clamp(44px, 8vw, 92px); letter-spacing: -.03em; line-height: 1; color: var(--color-neutral-900); }
.h-tm-big small { font-size: .45em; color: var(--color-neutral-600); letter-spacing: 0; }
.h-tm-sub { font-size: 13.5px; color: var(--color-neutral-600); text-align: center; }
.h-tm-ctl { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
.h-tm-ctl .btn { min-width: 96px; justify-content: center; }
.h-tm-ctl .btn-primary { min-width: 128px; }
.h-tm-side { display: flex; flex-direction: column; min-height: 380px; }
.h-tm-side .body { padding: 14px; display: grid; gap: 14px; align-content: start; }
.h-tm-laps { width: 100%; border-collapse: collapse; font-family: var(--font-mono); font-size: 13px; }
.h-tm-laps th { text-align: right; font-weight: 500; color: var(--color-neutral-600); font-size: 11.5px; letter-spacing: .06em; text-transform: uppercase; padding: 6px 12px; border-bottom: 1px solid rgba(32,30,29,.1); position: sticky; top: 0; background: var(--color-surface); }
.h-tm-laps td { text-align: right; padding: 6px 12px; border-bottom: 1px solid rgba(32,30,29,.06); font-variant-numeric: tabular-nums; }
.h-tm-laps th:first-child, .h-tm-laps td:first-child { text-align: left; }
.h-tm-laps tr.fast td { color: oklch(45% .13 150); background: rgba(0,160,90,.06); }
.h-tm-laps tr.slow td { color: var(--color-accent-2-700); background: rgba(214,0,108,.05); }
.h-tm-tag { font-family: var(--font-sans, inherit); font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase; margin-left: 6px; }
.h-tm-ring { position: relative; width: min(300px, 70vw); aspect-ratio: 1; }
.h-tm-ring svg { width: 100%; height: 100%; transform: rotate(-90deg); }
.h-tm-ring .inner { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; }
.h-tm-ring .inner .h-tm-big { font-size: clamp(38px, 6vw, 60px); }
.h-tm-phase { font-size: 12px; letter-spacing: .12em; text-transform: uppercase; padding: 3px 10px; border-radius: 999px; }
.h-tm-done { animation: h-tm-pulse 1s ease-in-out infinite; }
@keyframes h-tm-pulse { 50% { opacity: .35 } }
.calm .h-tm-done { animation: none; }
.h-tm-hms { display: flex; gap: 8px; align-items: end; flex-wrap: wrap; }
.h-tm-hms label { display: grid; gap: 4px; font-size: 12px; color: var(--color-neutral-600); }
.h-tm-hms input { width: 74px; font-family: var(--font-mono); font-size: 18px; text-align: center; }
.h-tm-dots { display: flex; gap: 6px; }
.h-tm-dots i { width: 10px; height: 10px; border-radius: 50%; border: 1.5px solid var(--color-accent-600); }
.h-tm-dots i.on { background: var(--color-accent-600); }
.h-tm-bar { display: flex; width: 100%; max-width: 520px; height: 10px; border-radius: 6px; overflow: hidden; gap: 2px; }
.h-tm-bar span { flex: 1; background: rgba(32,30,29,.08); position: relative; overflow: hidden; }
.h-tm-bar span b { position: absolute; inset: 0; transform-origin: left; }
.h-tm-keys { display: flex; flex-wrap: wrap; gap: 10px; font-size: 12.5px; color: var(--color-neutral-600); justify-content: center; }
.h-tm-conv { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14px; min-height: 460px; }
@media (max-width: 1000px) { .h-tm-body, .h-tm-conv { grid-template-columns: minmax(0, 1fr); } .h-tm-face { min-height: 300px; } .h-tm-side { min-height: 0; } }
`;

/* ── sound + notifications ─────────────────────────────────────────── */

let audio: AudioContext | null = null;
function ctx(): AudioContext | null {
  try {
    if (!audio) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      audio = new AC();
    }
    if (audio.state === "suspended") void audio.resume();
    return audio;
  } catch {
    return null;
  }
}
/** Short sine beeps: count × dur seconds at freq Hz. */
function beep(freq = 880, dur = 0.14, count = 1, gap = 0.12) {
  const ac = ctx();
  if (!ac) return;
  const t0 = ac.currentTime + 0.02;
  for (let i = 0; i < count; i++) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    const t = t0 + i * (dur + gap);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ac.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
}
function alarm() {
  beep(988, 0.16, 3, 0.1);
  setTimeout(() => beep(1175, 0.16, 3, 0.1), 700);
  setTimeout(() => beep(1319, 0.3, 2, 0.12), 1400);
}
function notify(title: string, body: string) {
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.hidden) new Notification(title, { body, silent: false });
  } catch {
    /* notifications unsupported */
  }
}

const now = () => performance.timeOrigin + performance.now();

/** Re-render on every animation frame while `on` (plus a 250 ms interval so hidden tabs still advance). */
function useTicker(on: boolean): number {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!on) return;
    let raf = 0;
    const loop = () => {
      setT(now());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const iv = setInterval(() => setT(now()), 250);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(iv);
    };
  }, [on]);
  return t;
}

/* ── a generic countdown engine ────────────────────────────────────── */

type Clock = { running: boolean; startAt: number; acc: number };
const stopped: Clock = { running: false, startAt: 0, acc: 0 };
const elapsedOf = (c: Clock) => c.acc + (c.running ? now() - c.startAt : 0);

function Ring({ frac, color, children, done }: { frac: number; color: string; children: React.ReactNode; done?: boolean }) {
  const r = 46;
  const C = 2 * Math.PI * r;
  return (
    <div className="h-tm-ring">
      <svg viewBox="0 0 100 100" aria-hidden>
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(32,30,29,.08)" strokeWidth="5" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - Math.max(0, Math.min(1, frac)))} className={done ? "h-tm-done" : undefined} style={{ transition: "stroke .3s" }} />
      </svg>
      <div className="inner">{children}</div>
    </div>
  );
}

const ACC = "oklch(54% .11 225)";
const MAG = "#d6006c";
const GREEN = "oklch(58% .14 150)";
const AMBER = "#b98d00";

type Handlers = { toggle?: () => void; reset?: () => void; lap?: () => void };

export default function Timers(props: CustomProps) {
  const { inputs, opts, setOpt } = props;
  const mode = ((opts.mode as Mode) || "stopwatch") as Mode;
  const [running, setRunning] = useState<Record<string, boolean>>({});
  const [titles, setTitles] = useState<Record<string, string | null>>({});
  const handlers = useRef<Record<string, Handlers>>({});
  const anyRunning = Object.values(running).some(Boolean);
  const tick = useTicker(anyRunning);
  const sound = opts.sound !== false;

  const report = useCallback((id: Mode, on: boolean, title: string | null) => {
    setRunning((r) => (r[id] === on ? r : { ...r, [id]: on }));
    setTitles((t) => (t[id] === title ? t : { ...t, [id]: title }));
  }, []);

  // Tab title shows the active (or any running) timer.
  const baseTitle = useRef<string>("");
  useEffect(() => {
    if (!baseTitle.current) baseTitle.current = document.title;
    const t = titles[mode] ?? Object.values(titles).find(Boolean) ?? null;
    document.title = t ? `${t} · ${baseTitle.current}` : baseTitle.current;
  }, [titles, mode]);
  useEffect(() => () => {
    if (baseTitle.current) document.title = baseTitle.current;
  }, []);

  // Keyboard: Space start/pause, R reset, L lap — ignored while typing in a field.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement;
      if (el && (el.closest("input, textarea, select, [contenteditable=true]") || e.metaKey || e.ctrlKey || e.altKey)) return;
      if (mode === "convert") return;
      const h = handlers.current[mode];
      if (!h) return;
      if (e.code === "Space") {
        e.preventDefault();
        h.toggle?.();
      } else if (e.key === "r" || e.key === "R") h.reset?.();
      else if (e.key === "l" || e.key === "L") h.lap?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode]);

  const reg = (id: Mode) => (h: Handlers) => {
    handlers.current[id] = h;
  };

  return (
    <div className="h-tm">
      <style>{CSS}</style>
      <div className="g" style={{ borderRadius: "var(--radius-lg)" }}>
        <div className="h-tm-tabs" role="tablist" aria-label="Timer mode">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={mode === t.id} onClick={() => setOpt("mode", t.id)}>
              <ToolIcon name={t.icon} size={17} /> {t.label}
              {running[t.id] && <span className="dot" title="Running" />}
            </button>
          ))}
        </div>
      </div>
      <div hidden={mode !== "stopwatch"}>
        <StopwatchPanel {...props} tick={tick} report={report} register={reg("stopwatch")} />
      </div>
      <div hidden={mode !== "countdown"}>
        <CountdownPanel {...props} tick={tick} report={report} register={reg("countdown")} sound={sound} />
      </div>
      <div hidden={mode !== "pomodoro"}>
        <PomodoroPanel {...props} tick={tick} report={report} register={reg("pomodoro")} sound={sound} />
      </div>
      <div hidden={mode !== "intervals"}>
        <IntervalPanel {...props} tick={tick} report={report} register={reg("intervals")} sound={sound} />
      </div>
      {mode === "convert" && <ConvertPanel {...props} />}
    </div>
  );
}

type PanelProps = CustomProps & { tick: number; report: (id: Mode, on: boolean, title: string | null) => void; register: (h: Handlers) => void; sound?: boolean };

function Keys({ lap }: { lap?: boolean }) {
  return (
    <div className="h-tm-keys">
      <span><kbd className="kbd">Space</kbd> start / pause</span>
      {lap && <span><kbd className="kbd">L</kbd> lap</span>}
      <span><kbd className="kbd">R</kbd> reset</span>
    </div>
  );
}

/* ── Stopwatch ─────────────────────────────────────────────────────── */

function StopwatchPanel({ inputs, setInput, record, report, register }: PanelProps) {
  const sw = useMemo(() => readStopwatch(inputs.stopwatch), [inputs.stopwatch]);
  const save = (s: Stopwatch) => setInput("stopwatch", JSON.stringify(s));
  const elapsed = sw.a + (sw.s !== null ? now() - sw.s : 0);
  const on = sw.s !== null;
  const [copied, setCopied] = useState(false);

  useEffect(() => report("stopwatch", on, on ? `⏱ ${timerText(elapsed, false)}` : null));

  const toggle = () => (on ? save({ ...sw, a: sw.a + now() - sw.s!, s: null }) : save({ ...sw, s: now() }));
  const lap = () => on && save({ ...sw, laps: [...sw.laps, Math.round(sw.a + now() - sw.s!)] });
  const reset = () => save({ a: 0, s: null, laps: [] });
  register({ toggle, lap, reset });

  const laps = sw.laps.map((split, i) => ({ n: i + 1, split, lap: split - (sw.laps[i - 1] ?? 0) }));
  const current = on || sw.a ? elapsed - (sw.laps[sw.laps.length - 1] ?? 0) : 0;
  const lapTimes = laps.map((l) => l.lap);
  const fastest = laps.length > 1 ? Math.min(...lapTimes) : -1;
  const slowest = laps.length > 1 ? Math.max(...lapTimes) : -1;
  const avg = laps.length ? lapTimes.reduce((a, b) => a + b, 0) / laps.length : 0;

  const csv = () => lapsCsv(sw.laps);
  return (
    <div className="h-tm-body">
      <section className="g pane h-tm-face" aria-label="Stopwatch">
        <div className="h-tm-big" aria-live="off" role="timer">
          {timerText(elapsed).replace(/\.\d\d$/, "")}
          <small>.{timerText(elapsed).slice(-2)}</small>
        </div>
        <div className="h-tm-sub">{laps.length ? `Lap ${laps.length + 1} · ${timerText(current)}` : on ? "Running" : sw.a ? "Paused" : "Ready"}</div>
        <div className="h-tm-ctl">
          <button type="button" className="btn btn-primary" onClick={toggle}>
            <ToolIcon name={on ? "pause" : "play"} size={16} color="#fff" /> {on ? "Pause" : sw.a ? "Resume" : "Start"}
          </button>
          <button type="button" className="btn" onClick={lap} disabled={!on}>
            <ToolIcon name="flow-arrow" size={16} /> Lap
          </button>
          <button type="button" className="btn" onClick={reset} disabled={!on && !sw.a && !sw.laps.length}>
            <ToolIcon name="arrow-counter-clockwise" size={16} /> Reset
          </button>
        </div>
        <Keys lap />
      </section>
      <section className="g pane h-tm-side" aria-label="Laps">
        <div className="pane-head">
          <span className="lbl">Laps {laps.length ? `(${laps.length})` : ""}</span>
          <div style={{ flex: 1 }} />
          <button type="button" className="btn-icon" disabled={!laps.length} onClick={() => { const t = csv(); navigator.clipboard?.writeText(t).catch(() => {}); record(t); setCopied(true); setTimeout(() => setCopied(false), 1400); }}>
            <ToolIcon name={copied ? "check" : "copy"} size={15} /> {copied ? "Copied" : "Copy CSV"}
          </button>
          <button type="button" className="btn-icon" disabled={!laps.length} onClick={() => { const t = csv(); downloadBlob(new Blob([t + "\n"], { type: "text/csv" }), "laps.csv"); record(t); }}>
            <ToolIcon name="download-simple" size={15} /> .csv
          </button>
        </div>
        {laps.length ? (
          <>
            <div className="scroll" style={{ overflow: "auto", maxHeight: 360, flex: 1 }}>
              <table className="h-tm-laps">
                <thead>
                  <tr><th>Lap</th><th>Lap time</th><th>Split</th><th>vs avg</th></tr>
                </thead>
                <tbody>
                  {laps.slice().reverse().map((l) => {
                    const d = l.lap - avg;
                    return (
                      <tr key={l.n} className={l.lap === fastest ? "fast" : l.lap === slowest ? "slow" : undefined}>
                        <td>
                          {l.n}
                          {l.lap === fastest && <span className="h-tm-tag">fastest</span>}
                          {l.lap === slowest && <span className="h-tm-tag">slowest</span>}
                        </td>
                        <td>{timerText(l.lap)}</td>
                        <td>{timerText(l.split)}</td>
                        <td>{laps.length > 1 ? `${d >= 0 ? "+" : "−"}${(Math.abs(d) / 1000).toFixed(2)}s` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="h-tm-sub" style={{ padding: 10, borderTop: "1px solid rgba(32,30,29,.08)" }}>
              Average lap {timerText(avg)} {laps.length > 1 && <>· spread {timerText(slowest - fastest)}</>}
            </div>
          </>
        ) : (
          <p className="h-tm-sub" style={{ padding: 24 }}>Press <b>Lap</b> (or <kbd className="kbd">L</kbd>) while running to record split times. The fastest and slowest laps are highlighted.</p>
        )}
      </section>
    </div>
  );
}

/* ── Countdown ─────────────────────────────────────────────────────── */

const PRESETS: [string, string][] = [["30s", "30s"], ["1m", "1m"], ["3m", "3m"], ["5m", "5m"], ["10m", "10m"], ["15m", "15m"], ["25m", "25m"], ["45m", "45m"], ["1h", "1h"]];

function CountdownPanel({ inputs, setInput, record, report, register, sound }: PanelProps) {
  const spec = inputs.countdown?.trim() || "5m";
  let total = 300_000;
  let bad = "";
  try {
    total = Math.max(1000, Math.round(parseDuration(spec).seconds * 1000));
  } catch (e) {
    bad = (e as Error).message;
  }
  const [c, setC] = useState<Clock>(stopped);
  const [extra, setExtra] = useState(0);
  const [ringing, setRinging] = useState(false);
  const [perm, setPerm] = useState<string>(() => (typeof Notification !== "undefined" ? Notification.permission : "unsupported"));
  const fired = useRef(false);
  const full = total + extra;
  const left = Math.max(0, full - elapsedOf(c));
  const done = c.acc > 0 || c.running ? left <= 0 : false;

  useEffect(() => {
    if (c.running && left <= 0 && !fired.current) {
      fired.current = true;
      setC({ running: false, startAt: 0, acc: full });
      setRinging(true);
      if (sound) alarm();
      notify("Time's up", `${toCompact(full / 1000)} countdown finished`);
      record(`Countdown ${toCompact(full / 1000)} finished`);
    }
  });
  useEffect(() => report("countdown", c.running, c.running ? `⏳ ${timerText(left, false)}` : ringing ? "⏰ Time's up" : null));
  useEffect(() => {
    if (!ringing || !sound) return;
    const iv = setInterval(alarm, 4000);
    const stop = setTimeout(() => setRinging(false), 30000);
    return () => {
      clearInterval(iv);
      clearTimeout(stop);
    };
  }, [ringing, sound]);

  const toggle = () => {
    ctx();
    setRinging(false);
    if (c.running) setC({ running: false, startAt: 0, acc: elapsedOf(c) });
    else if (left <= 0) {
      fired.current = false;
      setExtra(0);
      setC({ running: true, startAt: now(), acc: 0 });
    } else {
      fired.current = false;
      setC({ running: true, startAt: now(), acc: c.acc });
    }
  };
  const reset = () => {
    setC(stopped);
    setExtra(0);
    setRinging(false);
    fired.current = false;
  };
  register({ toggle, reset });

  const hms = (() => {
    const s = Math.round(total / 1000);
    return { h: Math.floor(s / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
  })();
  const setHms = (h: number, m: number, s: number) => {
    const parts = [h ? `${h}h` : "", m ? `${m}m` : "", s ? `${s}s` : ""].filter(Boolean);
    setInput("countdown", parts.join(" ") || "0s");
    reset();
  };
  const endsAt = c.running ? new Date(Date.now() + left).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : null;
  const color = ringing || done ? MAG : left < 10_000 && c.running ? AMBER : ACC;

  return (
    <div className="h-tm-body">
      <section className="g pane h-tm-face" aria-label="Countdown">
        <Ring frac={full ? left / full : 0} color={color} done={ringing}>
          <span className="h-tm-phase" style={{ background: ringing ? "rgba(214,0,108,.1)" : "rgba(0,136,176,.08)", color: ringing ? MAG : "var(--color-accent-800)" }}>{ringing ? "Time's up" : c.running ? "Running" : c.acc ? "Paused" : "Countdown"}</span>
          <div className="h-tm-big" role="timer">{timerText(Math.ceil(left / 1000) * 1000, false)}</div>
          <div className="h-tm-sub">{endsAt ? `ends at ${endsAt}` : `of ${toCompact(full / 1000)}`}</div>
        </Ring>
        <div className="h-tm-ctl">
          <button type="button" className="btn btn-primary" onClick={toggle} disabled={!!bad}>
            <ToolIcon name={c.running ? "pause" : "play"} size={16} color="#fff" /> {c.running ? "Pause" : c.acc && left > 0 ? "Resume" : "Start"}
          </button>
          <button type="button" className="btn" onClick={() => setExtra((x) => x + 60_000)} disabled={!c.running && !c.acc}>
            <ToolIcon name="plus" size={16} /> 1 min
          </button>
          <button type="button" className="btn" onClick={reset}>
            <ToolIcon name="arrow-counter-clockwise" size={16} /> Reset
          </button>
          {ringing && (
            <button type="button" className="btn btn-danger" onClick={() => setRinging(false)}>
              <ToolIcon name="stop" size={16} /> Stop alarm
            </button>
          )}
        </div>
        <Keys />
      </section>
      <section className="g pane h-tm-side" aria-label="Countdown settings">
        <div className="pane-head"><span className="lbl">Set time</span></div>
        <div className="body">
          <div className="h-tm-hms">
            <label>Hours<input className="inp" type="number" min={0} max={99} value={hms.h} onChange={(e) => setHms(+e.target.value || 0, hms.m, hms.s)} /></label>
            <label>Minutes<input className="inp" type="number" min={0} max={59} value={hms.m} onChange={(e) => setHms(hms.h, +e.target.value || 0, hms.s)} /></label>
            <label>Seconds<input className="inp" type="number" min={0} max={59} value={hms.s} onChange={(e) => setHms(hms.h, hms.m, +e.target.value || 0)} /></label>
          </div>
          <div className="chips" role="group" aria-label="Presets">
            {PRESETS.map(([v, l]) => (
              <button key={v} type="button" className="chip" aria-pressed={spec === v} onClick={() => { setInput("countdown", v); reset(); }}>{l}</button>
            ))}
          </div>
          <label style={{ display: "grid", gap: 4, fontSize: 13, color: "var(--color-neutral-700)" }}>
            Or type any duration
            <input className="inp mono" value={inputs.countdown ?? ""} placeholder="e.g. 1h 20m, 90s, PT45M, 12:30" onChange={(e) => { setInput("countdown", e.target.value); reset(); }} />
          </label>
          {bad && <div className="issue error">{bad}</div>}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" className="btn btn-sm" disabled={perm !== "default"} onClick={() => Notification.requestPermission().then(setPerm).catch(() => {})}>
              <ToolIcon name="info" size={15} /> {perm === "granted" ? "Notifications on" : perm === "denied" ? "Notifications blocked" : perm === "unsupported" ? "No notifications" : "Enable notifications"}
            </button>
            <button type="button" className="btn btn-sm" onClick={() => { ctx(); alarm(); }}>
              <ToolIcon name="play" size={15} /> Test sound
            </button>
          </div>
          <p className="h-tm-sub" style={{ textAlign: "left", margin: 0 }}>The alarm uses Web Audio (no sound files). Notifications appear only when this tab is in the background.</p>
        </div>
      </section>
    </div>
  );
}

/* ── Pomodoro ──────────────────────────────────────────────────────── */

type Phase = "focus" | "short" | "long";
const PHASE_LABEL: Record<Phase, string> = { focus: "Focus", short: "Short break", long: "Long break" };
const PHASE_COLOR: Record<Phase, string> = { focus: MAG, short: GREEN, long: ACC };

function PomodoroPanel({ inputs, setInput, record, report, register, sound }: PanelProps) {
  const [focus, short, long, every, auto] = parseNums(inputs.pomodoro, [25, 5, 15, 4, 1]);
  const n = Math.max(1, Math.round(every));
  const [phase, setPhase] = useState<Phase>("focus");
  const [round, setRound] = useState(1);
  const [doneCount, setDoneCount] = useState(0);
  const [c, setC] = useState<Clock>(stopped);
  const len = (phase === "focus" ? focus : phase === "short" ? short : long) * 60_000 || 60_000;
  const left = Math.max(0, len - elapsedOf(c));

  const advance = useCallback(
    (skipped: boolean) => {
      let nextPhase: Phase;
      let nextRound = round;
      if (phase === "focus") {
        if (!skipped) setDoneCount((d) => d + 1);
        nextPhase = round >= n ? "long" : "short";
      } else {
        nextPhase = "focus";
        nextRound = phase === "long" ? 1 : round + 1;
      }
      setPhase(nextPhase);
      setRound(nextRound);
      setC(auto && !skipped ? { running: true, startAt: now(), acc: 0 } : stopped);
      if (!skipped) {
        if (sound) nextPhase === "focus" ? beep(660, 0.2, 3, 0.1) : beep(880, 0.25, 2, 0.15);
        notify(nextPhase === "focus" ? "Back to focus" : "Break time", `${PHASE_LABEL[nextPhase]} — ${toCompact(((nextPhase === "focus" ? focus : nextPhase === "short" ? short : long) * 60))}`);
        record(`Pomodoro: ${PHASE_LABEL[phase]} done → ${PHASE_LABEL[nextPhase]}`);
      }
    },
    [phase, round, n, auto, sound, focus, short, long, record]
  );

  useEffect(() => {
    if (c.running && left <= 0) advance(false);
  });
  useEffect(() => report("pomodoro", c.running, c.running ? `${phase === "focus" ? "🍅" : "☕"} ${timerText(left, false)}` : null));

  const toggle = () => {
    ctx();
    setC(c.running ? { running: false, startAt: 0, acc: elapsedOf(c) } : { running: true, startAt: now(), acc: c.acc });
  };
  const reset = () => {
    setC(stopped);
    setPhase("focus");
    setRound(1);
  };
  register({ toggle, reset });

  const set = (i: number, v: number) => {
    const arr = [focus, short, long, every, auto];
    arr[i] = v;
    setInput("pomodoro", arr.join(","));
  };
  return (
    <div className="h-tm-body">
      <section className="g pane h-tm-face" aria-label="Pomodoro">
        <Ring frac={left / len} color={PHASE_COLOR[phase]}>
          <span className="h-tm-phase" style={{ background: phase === "focus" ? "rgba(214,0,108,.09)" : "rgba(0,160,90,.1)", color: PHASE_COLOR[phase] }}>{PHASE_LABEL[phase]}</span>
          <div className="h-tm-big" role="timer">{timerText(Math.ceil(left / 1000) * 1000, false)}</div>
          <div className="h-tm-dots" aria-label={`Session ${round} of ${n}`}>
            {Array.from({ length: n }, (_, i) => <i key={i} className={i < round - (phase === "focus" ? 1 : 0) || phase === "long" ? "on" : undefined} />)}
          </div>
        </Ring>
        <div className="h-tm-ctl">
          <button type="button" className="btn btn-primary" onClick={toggle}>
            <ToolIcon name={c.running ? "pause" : "play"} size={16} color="#fff" /> {c.running ? "Pause" : c.acc ? "Resume" : "Start"}
          </button>
          <button type="button" className="btn" onClick={() => advance(true)}>
            <ToolIcon name="arrow-right" size={16} /> Skip
          </button>
          <button type="button" className="btn" onClick={reset}>
            <ToolIcon name="arrow-counter-clockwise" size={16} /> Reset
          </button>
        </div>
        <div className="h-tm-sub">Session {round} of {n} · {doneCount} focus block{doneCount === 1 ? "" : "s"} completed</div>
        <Keys />
      </section>
      <section className="g pane h-tm-side" aria-label="Pomodoro settings">
        <div className="pane-head"><span className="lbl">Cycle</span></div>
        <div className="body">
          <div className="grid-form" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))" }}>
            <label>Focus (min)<input className="inp" type="number" min={1} max={180} value={focus} onChange={(e) => set(0, Math.max(1, +e.target.value || 1))} /></label>
            <label>Short break<input className="inp" type="number" min={1} max={60} value={short} onChange={(e) => set(1, Math.max(1, +e.target.value || 1))} /></label>
            <label>Long break<input className="inp" type="number" min={1} max={120} value={long} onChange={(e) => set(2, Math.max(1, +e.target.value || 1))} /></label>
            <label>Long break every<input className="inp" type="number" min={1} max={12} value={every} onChange={(e) => set(3, Math.max(1, +e.target.value || 1))} /></label>
          </div>
          <label className="tog"><input type="checkbox" checked={!!auto} onChange={(e) => set(4, e.target.checked ? 1 : 0)} /> Start the next phase automatically</label>
          <div className="chips">
            {[["25,5,15,4", "Classic 25/5"], ["50,10,30,3", "Deep 50/10"], ["90,20,30,2", "Ultradian 90/20"], ["15,3,10,4", "Sprint 15/3"]].map(([v, l]) => (
              <button key={v} type="button" className="chip" aria-pressed={`${focus},${short},${long},${every}` === v} onClick={() => { setInput("pomodoro", `${v},${auto}`); reset(); }}>{l}</button>
            ))}
          </div>
          <p className="h-tm-sub" style={{ textAlign: "left", margin: 0 }}>
            One cycle: {n} × {focus} min focus with {short} min breaks, then {long} min — {toCompact(n * focus * 60 + (n - 1) * short * 60 + long * 60)} in total.
          </p>
        </div>
      </section>
    </div>
  );
}

/* ── Intervals / HIIT ──────────────────────────────────────────────── */

type Seg = { kind: "prep" | "work" | "rest"; ms: number; round: number };

function IntervalPanel({ inputs, setInput, record, report, register, sound }: PanelProps) {
  const [work, rest, rounds, prep] = parseNums(inputs.intervals, [30, 15, 8, 10]);
  const R = Math.max(1, Math.round(rounds));
  const segs = useMemo(() => {
    const s: Seg[] = [];
    if (prep > 0) s.push({ kind: "prep", ms: prep * 1000, round: 0 });
    for (let i = 1; i <= R; i++) {
      s.push({ kind: "work", ms: Math.max(1, work) * 1000, round: i });
      if (i < R && rest > 0) s.push({ kind: "rest", ms: rest * 1000, round: i });
    }
    return s;
  }, [work, rest, R, prep]);
  const totalMs = segs.reduce((a, s) => a + s.ms, 0);
  const [c, setC] = useState<Clock>(stopped);
  const el = Math.min(totalMs, elapsedOf(c));
  let idx = 0, acc = 0;
  while (idx < segs.length - 1 && el >= acc + segs[idx].ms) acc += segs[idx++].ms;
  const seg = segs[idx];
  const segLeft = Math.max(0, acc + seg.ms - el);
  const finished = el >= totalMs && (c.acc > 0 || c.running);
  const lastBeep = useRef<string>("");

  useEffect(() => {
    if (!c.running) return;
    if (finished) {
      setC({ running: false, startAt: 0, acc: totalMs });
      if (sound) alarm();
      notify("Workout complete", `${R} rounds done`);
      record(`Intervals: ${R} × ${work}s/${rest}s complete`);
      return;
    }
    const secLeft = Math.ceil(segLeft / 1000);
    const key = `${idx}:${secLeft}`;
    if (key !== lastBeep.current) {
      if (secLeft <= 3 && secLeft >= 1 && sound) beep(740, 0.09);
      if (lastBeep.current && lastBeep.current.split(":")[0] !== String(idx) && sound) beep(seg.kind === "work" ? 1175 : 587, 0.35);
      lastBeep.current = key;
    }
  });
  useEffect(() => report("intervals", c.running, c.running ? `${seg.kind === "work" ? "🔥" : "·"} ${timerText(segLeft, false)}` : null));

  const toggle = () => {
    ctx();
    if (finished) {
      lastBeep.current = "";
      setC({ running: true, startAt: now(), acc: 0 });
    } else setC(c.running ? { running: false, startAt: 0, acc: elapsedOf(c) } : { running: true, startAt: now(), acc: c.acc });
  };
  const reset = () => {
    setC(stopped);
    lastBeep.current = "";
  };
  register({ toggle, reset });

  const color = finished ? ACC : seg.kind === "work" ? MAG : seg.kind === "rest" ? GREEN : AMBER;
  const label = finished ? "Done" : seg.kind === "work" ? "Work" : seg.kind === "rest" ? "Rest" : "Get ready";
  const set = (i: number, v: number) => {
    const arr = [work, rest, rounds, prep];
    arr[i] = v;
    setInput("intervals", arr.join(","));
    reset();
  };
  return (
    <div className="h-tm-body">
      <section className="g pane h-tm-face" aria-label="Interval timer">
        <Ring frac={finished ? 1 : segLeft / seg.ms} color={color} done={finished}>
          <span className="h-tm-phase" style={{ background: "rgba(32,30,29,.05)", color }}>{label}</span>
          <div className="h-tm-big" role="timer">{finished ? "00:00" : timerText(Math.ceil(segLeft / 1000) * 1000, false)}</div>
          <div className="h-tm-sub">{seg.round ? `Round ${seg.round} of ${R}` : `${R} rounds ahead`}</div>
        </Ring>
        <div className="h-tm-bar" aria-hidden>
          {segs.map((s, i) => {
            const start = segs.slice(0, i).reduce((a, x) => a + x.ms, 0);
            const f = Math.max(0, Math.min(1, (el - start) / s.ms));
            return (
              <span key={i} style={{ flex: s.ms }}>
                <b style={{ background: s.kind === "work" ? MAG : s.kind === "rest" ? GREEN : AMBER, transform: `scaleX(${f})` }} />
              </span>
            );
          })}
        </div>
        <div className="h-tm-ctl">
          <button type="button" className="btn btn-primary" onClick={toggle}>
            <ToolIcon name={c.running ? "pause" : "play"} size={16} color="#fff" /> {c.running ? "Pause" : finished ? "Again" : c.acc ? "Resume" : "Start"}
          </button>
          <button type="button" className="btn" onClick={reset}>
            <ToolIcon name="arrow-counter-clockwise" size={16} /> Reset
          </button>
        </div>
        <div className="h-tm-sub">Total {timerText(totalMs, false)} · remaining {timerText(Math.max(0, totalMs - el), false)}</div>
        <Keys />
      </section>
      <section className="g pane h-tm-side" aria-label="Interval settings">
        <div className="pane-head"><span className="lbl">Workout</span></div>
        <div className="body">
          <div className="grid-form" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))" }}>
            <label>Work (s)<input className="inp" type="number" min={1} max={3600} value={work} onChange={(e) => set(0, Math.max(1, +e.target.value || 1))} /></label>
            <label>Rest (s)<input className="inp" type="number" min={0} max={3600} value={rest} onChange={(e) => set(1, Math.max(0, +e.target.value || 0))} /></label>
            <label>Rounds<input className="inp" type="number" min={1} max={99} value={rounds} onChange={(e) => set(2, Math.max(1, +e.target.value || 1))} /></label>
            <label>Get ready (s)<input className="inp" type="number" min={0} max={120} value={prep} onChange={(e) => set(3, Math.max(0, +e.target.value || 0))} /></label>
          </div>
          <div className="chips">
            {[["20,10,8,10", "Tabata 20/10 × 8"], ["40,20,10,10", "HIIT 40/20 × 10"], ["45,15,12,10", "Circuit 45/15 × 12"], ["60,60,6,5", "EMOM-ish 60/60"]].map(([v, l]) => (
              <button key={v} type="button" className="chip" aria-pressed={`${work},${rest},${rounds},${prep}` === v} onClick={() => { setInput("intervals", v); reset(); }}>{l}</button>
            ))}
          </div>
          <p className="h-tm-sub" style={{ textAlign: "left", margin: 0 }}>Beeps count down the last 3 seconds of every phase; a high tone starts work, a low tone starts rest.</p>
        </div>
      </section>
    </div>
  );
}

/* ── Convert ───────────────────────────────────────────────────────── */

function ConvertPanel({ inputs, setInput, result, error, mono, record }: CustomProps) {
  const views: View[] = result?.views ?? (result ? [{ label: "Result", out: { kind: "text", text: result.text } }] : []);
  const [tab, setTab] = useState(0);
  const [copied, setCopied] = useState(false);
  const active = views[Math.min(tab, Math.max(0, views.length - 1))];
  return (
    <div className="h-tm-conv">
      <section className="g pane" aria-label="Durations">
        <div className="pane-head"><span className="lbl">Durations — one per line</span></div>
        <div style={{ display: "flex", flex: 1, minHeight: 360 }}>
          <CodeEditor id="h-durations" value={inputs.duration ?? ""} onChange={(v) => setInput("duration", v)} fontSize={mono} label="Durations" placeholder={"1h 20m 5s\nPT1H20M\n01:20:05\n4805\nstandup: 15m"} minHeight={360} />
        </div>
      </section>
      <section className="g pane" aria-label="Converted">
        <div className="pane-head">
          <div className="tabs" role="tablist" style={{ flex: 1, minWidth: 0 }}>
            {views.map((v, i) => (
              <button key={v.label} type="button" role="tab" aria-selected={active === v} onClick={() => setTab(i)}>{v.label}</button>
            ))}
          </div>
          <button type="button" className="btn-icon" disabled={!result?.text} onClick={() => { navigator.clipboard?.writeText(result?.text ?? "").catch(() => {}); record(result?.text ?? ""); setCopied(true); setTimeout(() => setCopied(false), 1400); }}>
            <ToolIcon name={copied ? "check" : "copy"} size={15} /> {copied ? "Copied" : "Copy"}
          </button>
        </div>
        {error && (
          <div className="errband">
            <ToolIcon name="warning-circle" size={18} color="var(--color-accent-2-700)" />
            <span style={{ whiteSpace: "pre-wrap", fontSize: 13.5 }}>{error}</span>
          </div>
        )}
        {result?.notes?.map((n) => (
          <div key={n} className="note">{n}</div>
        ))}
        <div className="scroll" style={{ flex: 1, overflow: "auto", minHeight: 0 }}>{active ? <OutputView out={active.out} fontSize={mono} /> : <p className="h-tm-sub" style={{ padding: 16 }}>Type a duration on the left.</p>}</div>
      </section>
    </div>
  );
}
