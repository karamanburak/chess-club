"use client";

import { useState } from "react";
import { cleanTimeControl } from "@/lib/challenges";
import { useT } from "./I18nProvider";

/** The club's usual tempi, one tap away; anything else is typed. */
export const TIME_CONTROL_PRESETS = ["1+0", "3+2", "10+0", "10+2"] as const;

/**
 * Time control as preset chips plus a free field: tapping a chip fills the field, typing keeps only digits and
 * one "+" (see cleanTimeControl). The field is what the form submits, so presets and manual entry meet there.
 */
export function TimeControlField({ name = "timeControl", defaultValue = "" }: { name?: string; defaultValue?: string }) {
  const { t } = useT();
  const m = t.challenges;
  const [value, setValue] = useState(defaultValue);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {TIME_CONTROL_PRESETS.map((p) => {
        const active = value === p;
        return (
          <button
            key={p}
            type="button"
            onClick={() => setValue(p)}
            aria-pressed={active}
            className={`font-mono text-xs rounded-lg border px-2.5 py-1.5 transition-colors ${active ? "bg-accent text-accent-fg border-accent" : "bg-panel-2 border-line text-fg hover:border-muted/60"}`}
          >
            {p}
          </button>
        );
      })}
      <input
        name={name}
        required
        inputMode="numeric"
        pattern="\d+(\+\d+)?"
        title={m.timeControlHint}
        maxLength={20}
        value={value}
        onChange={(e) => setValue(cleanTimeControl(e.target.value))}
        placeholder={m.timeControlCustom}
        aria-label={m.timeControl}
        className="w-28 font-mono"
      />
    </div>
  );
}
