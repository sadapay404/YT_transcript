"use client";

/**
 * Large theme cards (the switcher popover has the compact version). Each card
 * previews the palette it will apply: canvas, panel and accent.
 */
import { motion } from "framer-motion";
import { Check, Leaf, Moon, Sparkles, Zap } from "lucide-react";

import { THEMES } from "@/lib/constants";
import type { ThemeId } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/stores/useSettingsStore";

const ICONS: Record<ThemeId, React.ReactNode> = {
  oled: <Moon className="h-4 w-4" />,
  cyberpunk: <Zap className="h-4 w-4" />,
  glass: <Sparkles className="h-4 w-4" />,
  zen: <Leaf className="h-4 w-4" />,
};

export function ThemeGallery() {
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);

  return (
    <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-2">
      {THEMES.map((definition, index) => {
        const active = definition.id === theme;
        return (
          <motion.button
            key={definition.id}
            type="button"
            onClick={() => setTheme(definition.id)}
            aria-pressed={active}
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.05, type: "spring", stiffness: 320, damping: 30 }}
            whileHover={{ y: -4 }}
            className={cn(
              "group relative overflow-hidden rounded-2xl border p-3 text-left transition-shadow",
              active
                ? "border-accent/60 shadow-[0_18px_60px_-30px_var(--glow)]"
                : "border-line hover:border-line-strong",
            )}
            style={{ background: definition.swatch[0] }}
          >
            {/* Mini palette preview */}
            <span
              className="absolute inset-x-0 top-0 h-16 opacity-90"
              style={{
                background: `radial-gradient(120% 100% at 15% 0%, ${definition.swatch[2]}55, transparent 60%),
                             linear-gradient(180deg, transparent, ${definition.swatch[0]})`,
              }}
            />

            <span className="relative flex items-start justify-between">
              <span
                className="flex h-8 w-8 items-center justify-center rounded-lg border"
                style={{
                  borderColor: `${definition.swatch[1]}40`,
                  background: `${definition.swatch[1]}22`,
                  color: definition.swatch[1],
                }}
              >
                {ICONS[definition.id]}
              </span>
              {active && (
                <span className="chip chip-accent !py-0 !text-[9px]">
                  <Check className="h-2.5 w-2.5" /> live
                </span>
              )}
            </span>

            <span className="relative mt-8 block">
              <span className="block text-[13.5px] font-bold" style={{ color: definition.swatch[1] }}>
                {definition.label}
              </span>
              <span
                className="mt-0.5 block text-[11px] leading-snug"
                style={{ color: `${definition.swatch[1]}aa` }}
              >
                {definition.tagline}
              </span>
              <span
                className="mt-1.5 block text-[10px] leading-snug"
                style={{ color: `${definition.swatch[1]}88` }}
              >
                {definition.detail}
              </span>
              {definition.warning && (
                <span className="mt-2 inline-flex rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-[9.5px] font-semibold text-amber-700 scheme-dark:text-amber-200">
                  {definition.warning}
                </span>
              )}
            </span>

            <span className="relative mt-2.5 flex items-center gap-1">
              {definition.swatch.map((hex) => (
                <span
                  key={hex}
                  className="h-2.5 w-2.5 rounded-full border border-white/15"
                  style={{ background: hex }}
                />
              ))}
              <span
                className="ml-1 font-mono text-[9.5px] tracking-wide uppercase"
                style={{ color: `${definition.swatch[1]}88` }}
              >
                {definition.id}
              </span>
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}
