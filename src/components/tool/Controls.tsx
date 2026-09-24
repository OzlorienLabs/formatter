"use client";

import type { OptionSpec, Opts } from "@/src/tools/types";
import { choiceLabel, choiceValue } from "@/src/tools/types";

/** One option control, rendered from its spec. Used by the tool shell and pipeline steps. */
export function OptionControl({
  spec,
  value,
  onChange,
  compact,
}: {
  spec: OptionSpec;
  value: string | number | boolean | undefined;
  onChange: (v: string | number | boolean) => void;
  compact?: boolean;
}) {
  const v = value ?? spec.default;
  const title = spec.hint;
  switch (spec.type) {
    case "toggle":
      return (
        <label className="tog" title={title}>
          <input type="checkbox" checked={!!v} onChange={(e) => onChange(e.target.checked)} />
          {spec.label}
        </label>
      );
    case "segment":
      if (!compact && spec.choices.length <= 6)
        return (
          <span className="opt" title={title}>
            <span className="lbl">{spec.label}</span>
            <span className="seg" role="group" aria-label={spec.label}>
              {spec.choices.map((c) => (
                <button key={choiceValue(c)} type="button" className="ctl" aria-pressed={String(v) === choiceValue(c)} onClick={() => onChange(choiceValue(c))}>
                  {choiceLabel(c)}
                </button>
              ))}
            </span>
          </span>
        );
    // falls through to a select when compact or long
    case "select":
      return (
        <label className="opt" title={title}>
          <span className="lbl">{spec.label}</span>
          <select className="sel" value={String(v)} onChange={(e) => onChange(e.target.value)} aria-label={spec.label}>
            {spec.choices.map((c) => (
              <option key={choiceValue(c)} value={choiceValue(c)}>
                {choiceLabel(c)}
              </option>
            ))}
          </select>
        </label>
      );
    case "number":
      return (
        <label className="opt" title={title}>
          <span className="lbl">{spec.label}</span>
          <input
            className="inp"
            type="number"
            value={Number(v)}
            min={spec.min}
            max={spec.max}
            step={spec.step ?? 1}
            onChange={(e) => {
              const n = e.target.valueAsNumber;
              if (Number.isFinite(n)) onChange(n);
            }}
            style={{ width: 84 }}
            aria-label={spec.label}
          />
        </label>
      );
    case "text":
      return (
        <label className="opt" title={title}>
          <span className="lbl">{spec.label}</span>
          <input
            className="inp mono"
            type="text"
            value={String(v)}
            placeholder={spec.placeholder}
            onChange={(e) => onChange(e.target.value)}
            style={{ width: spec.width ?? 140, fontSize: 13 }}
            aria-label={spec.label}
            spellCheck={false}
          />
        </label>
      );
    case "color":
      return (
        <label className="opt" title={title}>
          <span className="lbl">{spec.label}</span>
          <input type="color" value={String(v)} onChange={(e) => onChange(e.target.value)} style={{ width: 34, height: 28, border: 0, background: "none", padding: 0, cursor: "pointer" }} aria-label={spec.label} />
          <input className="inp mono" value={String(v)} onChange={(e) => onChange(e.target.value)} style={{ width: 86, fontSize: 12.5 }} aria-label={`${spec.label} value`} />
        </label>
      );
  }
}

export function OptionsBar({
  options,
  opts,
  setOpt,
  compact,
}: {
  options: OptionSpec[];
  opts: Opts;
  setOpt: (id: string, v: string | number | boolean) => void;
  compact?: boolean;
}) {
  return (
    <>
      {options
        .filter((o) => !o.show || o.show(opts))
        .map((o) => (
          <OptionControl key={o.id} spec={o} value={opts[o.id]} onChange={(v) => setOpt(o.id, v)} compact={compact} />
        ))}
    </>
  );
}
