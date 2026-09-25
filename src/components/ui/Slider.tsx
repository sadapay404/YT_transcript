"use client";

/**
 * Labelled range slider used by the Typography Studio. Styled through the
 * `.range-input` component class so the track/thumb inherit the active theme.
 */
import { useId } from "react";

import { cn } from "@/lib/utils";

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** Formatted value shown on the right of the label. */
  display: string;
  onChange: (value: number) => void;
  /** Fine control hint, e.g. "Small / Large" edge labels. */
  edgeLabels?: [string, string];
  className?: string;
  disabled?: boolean;
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
  edgeLabels,
  className,
  disabled,
}: SliderProps) {
  const id = useId();

  return (
    <div className={cn("select-none", className)}>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <label
          htmlFor={id}
          className="text-[11px] font-semibold tracking-wide text-ink-soft uppercase"
        >
          {label}
        </label>
        <span className="font-mono text-[11px] tabular-nums text-ink">{display}</span>
      </div>

      <input
        id={id}
        type="range"
        className="range-input"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuetext={display}
        onChange={(event) => onChange(Number(event.target.value))}
      />

      {edgeLabels && (
        <div className="mt-0.5 flex justify-between text-[10px] text-ink-faint">
          <span>{edgeLabels[0]}</span>
          <span>{edgeLabels[1]}</span>
        </div>
      )}
    </div>
  );
}
