"use client";

/**
 * Theme picker. Writes straight to the settings store; `ThemeProvider` turns
 * the choice into `data-theme` + CSS variables on <html>, so switching is
 * instant and re-renders nothing else in the tree.
 */
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Leaf, Moon, Palette, Sparkles, Zap } from "lucide-react";

import { THEMES } from "@/lib/constants";
import type { ThemeId } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/stores/useSettingsStore";

const THEME_ICONS: Record<ThemeId, React.ReactNode> = {
  oled: <Moon className="h-4 w-4" />,
  cyberpunk: <Zap className="h-4 w-4" />,
  glass: <Sparkles className="h-4 w-4" />,
  zen: <Leaf className="h-4 w-4" />,
};

export function ThemeSwitcher({ compact = false }: { compact?: boolean }) {
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const active = THEMES.find((t) => t.id === theme) ?? THEMES[0];

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="btn btn-outline h-9 gap-2 pr-2.5 pl-2.5"
        title={`Theme: ${active.label}`}
      >
        <span className="text-accent">{THEME_ICONS[active.id]}</span>
        {!compact && (
          <span className="hidden text-[12.5px] font-semibold text-ink sm:inline">
            {active.label}
          </span>
        )}
        <Palette className="h-3.5 w-3.5 opacity-60" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 460, damping: 34 }}
            className="panel absolute right-0 z-50 mt-2 w-[19rem] origin-top-right overflow-hidden p-2 shadow-2xl sm:w-[21rem]"
          >
            <div className="px-2 pt-1 pb-2">
              <p className="text-[11px] font-semibold tracking-[0.14em] text-ink-faint uppercase">
                Theme
              </p>
              <p className="text-[11px] text-ink-faint">
                Applies instantly · saved to this device
              </p>
            </div>

            <div className="grid gap-1">
              {THEMES.map((definition, index) => {
                const isActive = definition.id === theme;
                return (
                  <motion.button
                    key={definition.id}
                    role="menuitemradio"
                    aria-checked={isActive}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.02 * index, duration: 0.22 }}
                    onClick={() => {
                      setTheme(definition.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "group flex items-center gap-3 rounded-xl border px-2.5 py-2 text-left transition-all",
                      isActive
                        ? "border-accent/50 bg-accent-soft"
                        : "border-transparent hover:border-line hover:bg-ink/[0.05]",
                    )}
                  >
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line"
                      style={{ background: definition.swatch[0] }}
                    >
                      <span className="text-accent">{THEME_ICONS[definition.id]}</span>
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-[13px] font-semibold text-ink">
                          {definition.label}
                        </span>
                        {definition.signature && (
                          <span className="chip chip-accent !text-[9px] !px-1.5 !py-0">
                            signature
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-ink-faint">
                        {definition.tagline}
                      </span>
                    </span>

                    <span className="flex shrink-0 items-center gap-1">
                      {definition.swatch.map((hex) => (
                        <span
                          key={hex}
                          className="h-3 w-3 rounded-full border border-line"
                          style={{ background: hex }}
                        />
                      ))}
                    </span>

                    <Check
                      className={cn(
                        "h-4 w-4 shrink-0 text-accent transition-opacity",
                        isActive ? "opacity-100" : "opacity-0",
                      )}
                    />
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
