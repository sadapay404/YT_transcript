"use client";

/** Accessible animated toggle with a spring-driven thumb. */
import { motion } from "framer-motion";

import { cn } from "@/lib/utils";

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  icon,
  className,
  disabled,
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "group flex w-full items-center justify-between gap-3 rounded-xl px-2 py-2 text-left transition-colors",
        "hover:bg-ink/[0.05] disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        {icon && <span className="text-ink-faint group-hover:text-ink-soft">{icon}</span>}
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-medium text-ink">{label}</span>
          {description && (
            <span className="block truncate text-[11px] text-ink-faint">
              {description}
            </span>
          )}
        </span>
      </span>

      <span
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors duration-300",
          checked
            ? "border-accent/60 bg-accent/85"
            : "border-line-strong bg-ink/10",
        )}
      >
        <motion.span
          layout
          transition={{ type: "spring", stiffness: 520, damping: 32 }}
          className={cn(
            "absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full bg-white shadow-sm",
            checked ? "left-[calc(100%-1rem)]" : "left-0.5",
          )}
        />
      </span>
    </button>
  );
}
