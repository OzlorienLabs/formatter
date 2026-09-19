"use client";

import { useState } from "react";
import ToolIcon from "@/src/components/ToolIcon";
import { useApp } from "@/src/components/AppState";
import { RUNNABLE_SLUGS, dispatch } from "@/src/lib/tools-engine";
import { categoryOfTool, plateInk, plateTint, toolBySlug } from "@/src/lib/tools-registry";

const RUNNABLE = RUNNABLE_SLUGS.map((s) => toolBySlug(s)).filter(Boolean).sort((a, b) =>
  a!.title.localeCompare(b!.title)
) as NonNullable<ReturnType<typeof toolBySlug>>[];

export default function Pipelines() {
  const { pipeline, setPipeline, pipeSource, setPipeSource } = useApp();
  const [pick, setPick] = useState(RUNNABLE[0]?.slug ?? "json-formatter");
  const [result, setResult] = useState("");

  async function runChain() {
    let value = pipeSource;
    const log: string[] = [];
    for (const slug of pipeline) {
      const tool = toolBySlug(slug);
      try {
        value = await dispatch(slug, value, "", "default");
        log.push(`✓ ${tool?.title ?? slug}`);
      } catch (e) {
        log.push(`✗ ${tool?.title ?? slug} — ${(e as Error).message}`);
        setResult(`${log.join("\n")}\n\nChain stopped.`);
        return;
      }
    }
    setResult(`${log.join("\n")}\n\n${"─".repeat(40)}\n${value}`);
  }

  return (
    <div style={{ padding: "clamp(20px,3vw,40px) clamp(18px,3vw,44px) 72px", maxWidth: 1080 }}>
      <h1 style={{ margin: "0 0 var(--space-2)", fontSize: "clamp(30px,3.6vw,48px)", letterSpacing: "-.03em", lineHeight: 1.05 }}>
        Pipelines
      </h1>
      <p style={{ margin: "0 0 var(--space-6)", fontSize: 17, color: "var(--color-neutral-800)", maxWidth: "60ch" }}>
        Chain tools so the output of one becomes the input of the next. The whole chain runs in memory, in order, here.
      </p>

      <div className="g" style={{ padding: "var(--space-6)", borderRadius: "var(--radius-lg)", marginBottom: "var(--space-6)" }}>
        <label
          htmlFor="pipe-source"
          style={{ display: "block", margin: "0 0 8px", fontSize: 12, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--color-neutral-600)" }}
        >
          Source
        </label>
        <textarea
          id="pipe-source"
          className="mono scroll"
          spellCheck={false}
          value={pipeSource}
          onChange={(e) => setPipeSource(e.target.value)}
          placeholder="Paste the starting payload"
          style={{
            width: "100%",
            height: 110,
            border: "1px solid rgba(32,30,29,.14)",
            borderRadius: "var(--radius-md)",
            outline: "none",
            resize: "vertical",
            background: "rgba(255,255,255,.5)",
            padding: 12,
            fontSize: 13,
            lineHeight: 1.6,
          }}
        />
      </div>

      {pipeline.map((slug, n) => {
        const tool = toolBySlug(slug);
        const cat = tool ? categoryOfTool(tool) : null;
        const ink = cat ? plateInk(cat.plate) : "var(--plate-k)";
        const tint = cat ? plateTint(cat.plate) : "var(--plate-k-tint)";
        return (
          <div
            key={`${slug}-${n}`}
            className="g2 fi"
            style={{ display: "flex", alignItems: "center", gap: 13, padding: "13px 16px", borderRadius: "var(--radius-lg)", marginBottom: 10 }}
          >
            <span
              className="mono"
              style={{ width: 24, height: 24, display: "grid", placeItems: "center", borderRadius: "50%", background: tint, color: ink, fontSize: 12, flex: "none" }}
            >
              {n + 1}
            </span>
            <ToolIcon slug={slug} size={20} color={ink} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <strong style={{ display: "block", fontSize: 16 }}>{tool?.title ?? slug}</strong>
              <span
                className="mono"
                style={{ display: "block", fontSize: 12, color: "var(--color-neutral-600)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
              >
                {tool?.description ?? ""}
              </span>
            </span>
            <button
              className="ctl"
              type="button"
              title="Move up"
              aria-label={`Move ${tool?.title ?? slug} up`}
              disabled={n === 0}
              onClick={() => {
                const p = [...pipeline];
                [p[n - 1], p[n]] = [p[n], p[n - 1]];
                setPipeline(p);
              }}
              style={{ border: 0, background: "none", padding: 5, cursor: n === 0 ? "default" : "pointer", color: "var(--color-neutral-600)", opacity: n === 0 ? 0.35 : 1 }}
            >
              <ToolIcon name="arrow-up" size={15} />
            </button>
            <button
              className="ctl"
              type="button"
              title="Remove"
              aria-label={`Remove ${tool?.title ?? slug}`}
              onClick={() => setPipeline(pipeline.filter((_, k) => k !== n))}
              style={{ border: 0, background: "none", padding: 5, cursor: "pointer", color: "var(--color-neutral-600)" }}
            >
              <ToolIcon name="x" size={15} />
            </button>
          </div>
        );
      })}

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginTop: "var(--space-4)" }}>
        <select
          value={pick}
          onChange={(e) => setPick(e.target.value)}
          aria-label="Tool to add"
          style={{
            padding: "10px 12px",
            border: "1px solid rgba(32,30,29,.16)",
            borderRadius: "var(--radius-md)",
            background: "rgba(255,255,255,.6)",
            fontSize: 14.5,
            cursor: "pointer",
          }}
        >
          {RUNNABLE.map((t) => (
            <option key={t.slug} value={t.slug}>
              {t.title}
            </option>
          ))}
        </select>
        <button
          className="ctl"
          type="button"
          onClick={() => setPipeline([...pipeline, pick])}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            padding: "10px 15px",
            border: "1px solid rgba(32,30,29,.16)",
            borderRadius: "var(--radius-md)",
            background: "none",
            cursor: "pointer",
            fontSize: 14.5,
          }}
        >
          <ToolIcon name="plus" size={15} />
          Add step
        </button>
        <div style={{ flex: 1 }} />
        <button
          className="ctl"
          type="button"
          onClick={() => void runChain()}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            padding: "10px 20px",
            border: 0,
            borderRadius: "var(--radius-md)",
            background: "var(--color-accent-700)",
            color: "#fff",
            cursor: "pointer",
            fontSize: 15,
          }}
        >
          <ToolIcon name="play" size={15} color="#fff" />
          Run chain
        </button>
      </div>

      {result && (
        <div className="g fi" style={{ marginTop: "var(--space-6)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
          <div
            style={{
              padding: "9px 14px",
              borderBottom: "1px solid rgba(32,30,29,.1)",
              fontSize: 12,
              letterSpacing: ".12em",
              textTransform: "uppercase",
              color: "var(--color-neutral-600)",
            }}
          >
            Result
          </div>
          <pre
            className="mono scroll"
            data-testid="pipeline-result"
            style={{ margin: 0, padding: 14, maxHeight: 340, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 13, lineHeight: 1.6 }}
          >
            {result}
          </pre>
        </div>
      )}
    </div>
  );
}
