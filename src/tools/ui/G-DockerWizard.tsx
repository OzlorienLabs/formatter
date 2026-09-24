"use client";

import { useMemo, useState } from "react";
import CodeEditor from "@/src/components/tool/CodeEditor";
import type { CustomProps } from "@/src/tools/types";
import { STACKS, dockerDefaults, type DockerCfg, type Flavour, type Service, type Stack } from "@/src/tools/lib/G-docker";
import GOut, { Check, Field, Sec, Seg, G_CSS } from "./G-Out";

const SERVICES: [Service, string][] = [["postgres", "PostgreSQL"], ["mysql", "MySQL"], ["redis", "Redis"], ["mongo", "MongoDB"], ["nginx", "nginx proxy"]];
const FLAVOURS: [Flavour, string][] = [["alpine", "Alpine"], ["slim", "Slim"], ["distroless", "Distroless"], ["full", "Full"]];

export default function DockerWizard({ inputs, setInput, result, error, mono, record }: CustomProps) {
  const [raw, setRaw] = useState(false);
  const cfg: DockerCfg = useMemo(() => {
    try {
      const v = JSON.parse(inputs.config || "{}");
      return { ...dockerDefaults((v?.stack as Stack) ?? "node"), ...v };
    } catch {
      return dockerDefaults("node");
    }
  }, [inputs.config]);
  const set = (p: Partial<DockerCfg>) => setInput("config", JSON.stringify({ ...cfg, ...p }, null, 2));
  const stack = STACKS.find((s) => s.id === cfg.stack) ?? STACKS[0];
  const pickStack = (id: Stack) => {
    const d = dockerDefaults(id);
    // keep the cross-cutting choices, reset stack-specific ones
    set({ ...d, multistage: cfg.multistage, nonroot: cfg.nonroot, healthcheck: cfg.healthcheck, healthPath: cfg.healthPath, cache: cfg.cache, services: cfg.services, name: cfg.name });
  };

  return (
    <div className="g-split">
      <style>{G_CSS}</style>
      <section className="g pane" aria-label="Dockerfile options">
        <div className="pane-head">
          <span className="lbl">Image</span>
          <div style={{ flex: 1 }} />
          <button type="button" className="btn-icon" aria-pressed={raw} onClick={() => setRaw(!raw)} title="Edit the configuration as JSON">
            {raw ? "Form" : "JSON"}
          </button>
          <button type="button" className="btn-icon" onClick={() => setInput("config", JSON.stringify(dockerDefaults(cfg.stack), null, 2))} title="Reset this stack to its defaults">
            Reset
          </button>
        </div>
        {raw ? (
          <div style={{ display: "flex", minHeight: 460 }}>
            <CodeEditor value={inputs.config} onChange={(v) => setInput("config", v)} lang="json" fontSize={mono} label="Configuration JSON" minHeight={460} />
          </div>
        ) : (
          <div className="g-form">
            <Sec title="Stack">
              <div className="g-choice" role="group" aria-label="Stack">
                {STACKS.map((s) => (
                  <button key={s.id} type="button" aria-pressed={cfg.stack === s.id} onClick={() => pickStack(s.id)}>
                    {s.label}
                  </button>
                ))}
              </div>
              <div className="g-row">
                {stack.pms.length > 1 && <Seg label="Package manager" value={cfg.pm} onChange={(pm) => set({ pm, build: cfg.stack === "node" && cfg.build ? cfg.build.replace(/^(npm|pnpm|yarn|bun) run/, `${pm === "npm" ? "npm" : pm} run`) : cfg.build })} choices={stack.pms} />}
                <Seg label="Base image flavour" value={cfg.flavour} onChange={(flavour) => set({ flavour })} choices={FLAVOURS} />
              </div>
            </Sec>
            <Sec title="Build & run">
              <div className="grid-form">
                <Field label={cfg.stack === "static" ? "nginx version" : cfg.stack === "java" ? "JDK version" : "Version"}>
                  <input className="inp mono" value={cfg.version} onChange={(e) => set({ version: e.target.value.trim() })} spellCheck={false} />
                </Field>
                <Field label="Port">
                  <input className="inp mono" value={cfg.port} onChange={(e) => set({ port: e.target.value.replace(/\D/g, "") })} inputMode="numeric" />
                </Field>
                <Field label="Service / image name">
                  <input className="inp mono" value={cfg.name} onChange={(e) => set({ name: e.target.value })} spellCheck={false} />
                </Field>
                {cfg.healthcheck && (
                  <Field label="Health path">
                    <input className="inp mono" value={cfg.healthPath} onChange={(e) => set({ healthPath: e.target.value })} spellCheck={false} />
                  </Field>
                )}
              </div>
              {!["php", "deno"].includes(cfg.stack) && (
                <Field label="Build command">
                  <input className="inp mono" value={cfg.build} placeholder="(none)" onChange={(e) => set({ build: e.target.value })} spellCheck={false} />
                </Field>
              )}
              {!["static", "php"].includes(cfg.stack) && (
                <Field label="Start command">
                  <input className="inp mono" value={cfg.start} onChange={(e) => set({ start: e.target.value })} spellCheck={false} />
                </Field>
              )}
              <div className="g-checks">
                <Check checked={cfg.multistage} onChange={(multistage) => set({ multistage })} title="Build in one stage, ship only the runtime">Multi-stage build</Check>
                <Check checked={cfg.nonroot} onChange={(nonroot) => set({ nonroot })}>Non-root user</Check>
                <Check checked={cfg.healthcheck} onChange={(healthcheck) => set({ healthcheck })}>HEALTHCHECK</Check>
                <Check checked={cfg.cache} onChange={(cache) => set({ cache })} title="RUN --mount=type=cache (BuildKit)">Cache mounts</Check>
              </div>
            </Sec>
            <Sec title="Environment">
              <textarea className="inp" rows={3} value={cfg.env} onChange={(e) => set({ env: e.target.value })} placeholder={"KEY=value\nLOG_LEVEL=info"} aria-label="Environment variables" spellCheck={false} />
              <p className="g-hint">Baked into the image with ENV — keep secrets out (the Lint tab warns). Compose adds connection URLs for the services below.</p>
            </Sec>
            <Sec title="docker-compose services">
              <div className="g-checks">
                {SERVICES.map(([id, label]) => (
                  <Check key={id} checked={cfg.services.includes(id)} onChange={(on) => set({ services: on ? [...cfg.services, id] : cfg.services.filter((x) => x !== id) })}>
                    {label}
                  </Check>
                ))}
              </div>
            </Sec>
          </div>
        )}
      </section>
      <GOut result={result} error={error} mono={mono} onCopy={record} filename="Dockerfile" label="Dockerfile" className="g-sticky" minHeight={560} />
    </div>
  );
}
