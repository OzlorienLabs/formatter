"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import ToolIcon from "@/src/components/ToolIcon";
import { useApp } from "@/src/components/AppState";
import {
  CATEGORIES,
  TOOLS,
  categoryOfTool,
  plateInk,
  toolBySlug,
} from "@/src/lib/tools-registry";

const POPULAR = ["json-formatter", "base64-decoder", "jwt-decoder", "epoch-converter", "regex-tester"];

const COUNTS = new Map(
  CATEGORIES.map((c) => [c.slug, TOOLS.filter((t) => categoryOfTool(t).slug === c.slug).length])
);

function ledger(n: string, label: string, color?: string) {
  return (
    <div>
      <div style={{ fontSize: 42, lineHeight: 1, letterSpacing: "-.03em", color }}>{n}</div>
      <div style={{ fontSize: 14, color: "var(--color-neutral-700)", marginTop: 4 }}>{label}</div>
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const { recents, setPaletteOpen } = useApp();
  const [q, setQ] = useState("");
  const cats = useRef<HTMLElement>(null);
  const privacy = useRef<HTMLElement>(null);

  function go() {
    router.push(q.trim() ? `/tools?q=${encodeURIComponent(q.trim())}` : "/tools");
  }

  function scrollTo(el: HTMLElement | null) {
    if (el) window.scrollTo({ top: el.offsetTop - 60, behavior: "smooth" });
  }

  return (
    <div>
      <header
        className="g2"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          display: "flex",
          alignItems: "center",
          gap: "var(--space-4)",
          padding: "12px clamp(16px,4vw,56px)",
          borderWidth: "0 0 1px 0",
          borderRadius: 0,
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <ToolIcon name="brackets-angle" size={24} color="var(--color-accent-700)" />
          <strong style={{ fontSize: 19, letterSpacing: "-.02em" }}>Formatter</strong>
        </span>
        <nav style={{ display: "flex", gap: "var(--space-4)", marginLeft: "var(--space-4)", fontSize: 15 }}>
          <Link href="/tools">All tools</Link>
          <a href="#cats" onClick={(e) => { e.preventDefault(); scrollTo(cats.current); }}>
            Categories
          </a>
          <a href="#privacy" onClick={(e) => { e.preventDefault(); scrollTo(privacy.current); }}>
            Privacy
          </a>
        </nav>
        <div style={{ flex: 1 }} />
        <Link
          className="ctl"
          href="/tools"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "9px 16px",
            border: "1px solid var(--color-accent-700)",
            borderRadius: "var(--radius-lg)",
            background: "var(--color-accent-700)",
            color: "#fff",
            fontSize: 15,
          }}
        >
          Open the workbench
          <ToolIcon name="arrow-right" size={15} color="#fff" />
        </Link>
      </header>

      <section
        className="hero"
        style={{ padding: "clamp(40px,7vw,100px) clamp(16px,4vw,56px) clamp(28px,4vw,56px)", maxWidth: 1560 }}
      >
        <div
          className="homegrid"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0,1.3fr) minmax(300px,.7fr)",
            gap: "clamp(24px,4vw,64px)",
            alignItems: "end",
          }}
        >
          <div>
            <p
              className="fu"
              style={{
                margin: "0 0 var(--space-4)",
                fontSize: 13,
                letterSpacing: ".14em",
                textTransform: "uppercase",
                color: "var(--color-accent-700)",
              }}
            >
              No accounts · No uploads · Nothing leaves the tab
            </p>
            <h1
              className="fu d1"
              style={{ margin: 0, fontSize: "clamp(44px,7.4vw,104px)", lineHeight: 0.94, letterSpacing: "-.03em", maxWidth: "14ch" }}
            >
              <span style={{ display: "block" }}>Paste it in.</span>
              <span style={{ display: "block", color: "var(--color-accent-700)" }}>Read it out.</span>
            </h1>
            <p
              className="fu d2"
              style={{
                margin: "var(--space-6) 0 0",
                fontSize: "clamp(18px,1.5vw,22px)",
                lineHeight: 1.5,
                maxWidth: "54ch",
                color: "var(--color-neutral-800)",
                textWrap: "pretty",
              }}
            >
              A hundred and twenty-five small tools for the messy middle of a working day — the malformed JSON, the
              base64 blob, the timestamp nobody can read. Every one of them runs here, in this browser.
            </p>

            <div
              className="fu d3 g"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                marginTop: "var(--space-8)",
                padding: "6px 6px 6px 18px",
                borderRadius: "var(--radius-lg)",
                maxWidth: 640,
              }}
            >
              <ToolIcon name="magnifying-glass" size={20} color="var(--color-neutral-700)" />
              <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") go();
                }}
                placeholder="Search 125 tools — try json, base64, cron, diff"
                aria-label="Search tools"
                style={{ flex: 1, border: 0, background: "transparent", outline: "none", padding: "12px 0", fontSize: 17 }}
              />
              <kbd
                className="mono"
                onClick={() => setPaletteOpen(true)}
                style={{
                  padding: "5px 9px",
                  borderRadius: "var(--radius-md)",
                  background: "rgba(32,30,29,.07)",
                  fontSize: 12,
                  color: "var(--color-neutral-700)",
                  cursor: "pointer",
                }}
              >
                ⌘K
              </kbd>
              <button
                className="ctl"
                type="button"
                onClick={go}
                style={{
                  padding: "11px 20px",
                  border: 0,
                  borderRadius: "var(--radius-md)",
                  background: "var(--color-accent-700)",
                  color: "#fff",
                  cursor: "pointer",
                  fontSize: 15,
                }}
              >
                Search
              </button>
            </div>

            <p className="fu d4" style={{ margin: "var(--space-4) 0 0", fontSize: 14, color: "var(--color-neutral-700)" }}>
              Popular right now:{" "}
              {POPULAR.map((s) => (
                <Link key={s} href={`/tools/${s}`} style={{ marginRight: 14 }}>
                  {toolBySlug(s)?.title}
                </Link>
              ))}
            </p>
          </div>

          <div className="g fu d4" style={{ padding: "var(--space-6)", borderRadius: "var(--radius-lg)" }}>
            <p
              style={{
                margin: "0 0 var(--space-4)",
                fontSize: 12,
                letterSpacing: ".14em",
                textTransform: "uppercase",
                color: "var(--color-neutral-700)",
              }}
            >
              The ledger
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-6)" }}>
              {ledger("125", "tools", "var(--color-accent-700)")}
              {ledger("18", "categories", "var(--color-accent-2-700)")}
              {ledger("0", "bytes uploaded")}
              {ledger("∞", "runs, no limit")}
            </div>
            <div
              style={{
                marginTop: "var(--space-6)",
                paddingTop: "var(--space-6)",
                borderTop: "1px solid rgba(32,30,29,.12)",
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontSize: 14,
                color: "var(--color-neutral-800)",
              }}
            >
              <ToolIcon name="wifi-slash" size={18} color="var(--color-accent-700)" />
              Works with the network unplugged.
            </div>
          </div>
        </div>
      </section>

      {recents.length > 0 && (
        <section style={{ padding: "0 clamp(16px,4vw,56px) clamp(24px,4vw,48px)", maxWidth: 1560 }}>
          <h2
            style={{
              margin: "0 0 var(--space-4)",
              fontSize: 14,
              letterSpacing: ".14em",
              textTransform: "uppercase",
              color: "var(--color-neutral-700)",
              fontWeight: 400,
            }}
          >
            Where you left off
          </h2>
          <div
            className="toolgrid"
            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(250px,1fr))", gap: "var(--space-3)" }}
          >
            {recents.map((s) => {
              const t = toolBySlug(s);
              if (!t) return null;
              const cat = categoryOfTool(t);
              return (
                <Link
                  key={s}
                  className="g lift ctl"
                  href={`/tools/${s}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "14px 16px",
                    borderRadius: "var(--radius-lg)",
                    color: "var(--color-text)",
                  }}
                >
                  <ToolIcon slug={s} size={22} color={plateInk(cat.plate)} />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 16, letterSpacing: "-.01em" }}>{t.title}</span>
                    <span
                      style={{
                        display: "block",
                        fontSize: 12.5,
                        color: "var(--color-neutral-700)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {cat.title}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <section id="cats" ref={cats} style={{ padding: "clamp(24px,4vw,56px) clamp(16px,4vw,56px)", maxWidth: 1560 }}>
        <h2 style={{ margin: "0 0 var(--space-2)", fontSize: "clamp(28px,3.4vw,46px)", letterSpacing: "-.025em", lineHeight: 1.05 }}>
          Eighteen shelves
        </h2>
        <p style={{ margin: "0 0 var(--space-8)", fontSize: 17, color: "var(--color-neutral-800)", maxWidth: "60ch" }}>
          Each category is a plate — cyan, magenta, yellow or black — so a tool&rsquo;s home is legible at a glance, in
          the index, in the rail and in your history.
        </p>
        <div
          className="catcols"
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(270px,1fr))", gap: "var(--space-6)" }}
        >
          {CATEGORIES.map((c) => {
            const ink = plateInk(c.plate);
            const sample = TOOLS.filter((t) => categoryOfTool(t).slug === c.slug).slice(0, 3);
            return (
              <div key={c.slug}>
                <Link
                  className="ctl"
                  href={`/categories/${c.slug}`}
                  style={{ display: "flex", alignItems: "baseline", gap: 9, color: "var(--color-text)" }}
                >
                  <span
                    aria-hidden="true"
                    style={{ width: 9, height: 9, borderRadius: 2, background: ink, flex: "none", transform: "translateY(-1px)" }}
                  />
                  <strong style={{ fontSize: 19, letterSpacing: "-.015em" }}>{c.title}</strong>
                  <span className="mono" style={{ fontSize: 12, color: "var(--color-neutral-600)" }}>
                    {COUNTS.get(c.slug)}
                  </span>
                </Link>
                <p style={{ margin: "6px 0 10px", fontSize: 14, color: "var(--color-neutral-700)", lineHeight: 1.45 }}>
                  {c.blurb}
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {sample.map((t) => (
                    <Link
                      key={t.slug}
                      className="ctl gi"
                      href={`/tools/${t.slug}`}
                      style={{ padding: "4px 10px", borderRadius: 999, fontSize: 13, color: "var(--color-neutral-800)" }}
                    >
                      {t.title}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section
        id="privacy"
        ref={privacy}
        style={{ padding: "clamp(24px,4vw,56px) clamp(16px,4vw,56px) clamp(56px,8vw,120px)", maxWidth: 1560 }}
      >
        <div
          className="homegrid"
          style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: "clamp(24px,4vw,72px)" }}
        >
          <div>
            <h2
              style={{ margin: "0 0 var(--space-4)", fontSize: "clamp(26px,3vw,40px)", letterSpacing: "-.025em", lineHeight: 1.1 }}
            >
              Nothing is sent anywhere
            </h2>
            <p
              style={{
                margin: 0,
                fontSize: 17,
                lineHeight: 1.6,
                color: "var(--color-neutral-800)",
                maxWidth: "52ch",
                textWrap: "pretty",
              }}
            >
              There is no server to receive your input. Formatting, hashing, parsing and diffing happen in the page.
              Share links encode the payload in the URL fragment, which browsers never transmit. History and favourites
              sit in this browser&rsquo;s local storage and can be wiped in one click from Settings.
            </p>
          </div>
          <div style={{ display: "grid", gap: "var(--space-4)", alignContent: "start" }}>
            {[
              {
                icon: "clock-counter-clockwise",
                color: "var(--color-accent-700)",
                head: "History that remembers the run",
                body: "Every execution is logged with its input, output and options. Restore one and the workbench comes back exactly as it was.",
              },
              {
                icon: "star",
                color: "var(--color-accent-2-700)",
                head: "Favourites pinned to the rail",
                body: "Star the six you actually use. They sit above everything else, next to what you touched most recently.",
              },
              {
                icon: "flow-arrow",
                color: "var(--color-accent-700)",
                head: "Pipelines for the two-step jobs",
                body: "Decode, then pretty-print, then hash. Chain tools and keep the chain.",
              },
            ].map((r) => (
              <div
                key={r.head}
                className="g2"
                style={{ display: "flex", gap: 14, padding: "var(--space-6)", borderRadius: "var(--radius-lg)" }}
              >
                <ToolIcon name={r.icon} size={24} color={r.color} />
                <div>
                  <strong style={{ display: "block", fontSize: 17 }}>{r.head}</strong>
                  <span style={{ fontSize: 15, color: "var(--color-neutral-700)" }}>{r.body}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
