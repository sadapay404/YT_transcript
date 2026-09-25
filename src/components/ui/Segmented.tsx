"use client";

/**
 * Animated segmented control. The active pill is a Framer Motion `layoutId`
 * element, so switching options *slides* the highlight instead of snapping —
 * the same technique used for view-mode changes across the whole app.
 */
import { useId } from "react";
import { motion } from "framer-motion";

import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  title?: string;
}

interface SegmentedProps<T extends string> {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  size?: "sm" | "md";
  className?: string;
  /** Accessible name for the group. */
  label: string;
}

const SPRING = { type: "spring", stiffness: 420, damping: 34, mass: 0.7 } as const;

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = "md",
  className,
  label,
}: SegmentedProps<T>) {
  const id = useId();

  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        "relative flex items-center gap-0.5 rounded-xl border border-line bg-ink/[0.04] p-1",
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            role="tab"
            type="button"
            title={option.title ?? option.label}
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative z-10 inline-flex items-center gap-1.5 rounded-lg font-semibold transition-colors duration-200",
              size === "sm" ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs",
              active
                ? "text-accent-ink"
                : "text-ink-soft hover:text-ink",
            )}
          >
            {active && (
              <motion.span
                layoutId={`segmented-${id}`}
                className="absolute inset-0 -z-10 rounded-lg bg-accent shadow-[0_8px_24px_-12px_var(--glow)]"
                transition={SPRING}
              />
            )}
            {option.icon}
            <span className="whitespace-nowrap">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
