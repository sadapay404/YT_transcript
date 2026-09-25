"use client";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  ThemeProvider — pushes the settings store onto the document.
 * ─────────────────────────────────────────────────────────────────────────────
 *  Design decision: theme switching costs **zero React re-renders** because it
 *  is expressed as `data-theme` + CSS custom properties on <html>. Tailwind
 *  utilities read those variables (`bg-surface`, `text-ink`, …), so a theme
 *  change is a single attribute write — instantly, everywhere, no flash.
 */
import { useEffect, useMemo } from "react";
import { MotionConfig } from "framer-motion";

import { FONT_OPTIONS, THEMES } from "@/lib/constants";
import type { ColorScheme, ThemeId } from "@/lib/types";
import { useSettingsStore } from "@/stores/useSettingsStore";

/** Browser chrome colour (mobile address bar) per theme. */
const THEME_COLORS: Record<ThemeId, string> = {
  oled: "#000000",
  cyberpunk: "#06030d",
  glass: "#070b1a",
  zen: "#f6f0e4",
};

const SCHEME_BY_THEME: Record<ThemeId, ColorScheme> = {
  oled: "dark",
  cyberpunk: "dark",
  glass: "dark",
  zen: "light",
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSettingsStore((s) => s.theme);
  const typography = useSettingsStore((s) => s.typography);
  const reduceMotion = useSettingsStore((s) => s.reduceMotion);

  // ── Colour theme → data attributes ────────────────────────────────────────
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.scheme = SCHEME_BY_THEME[theme] ?? "dark";

    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (meta) meta.content = THEME_COLORS[theme] ?? "#000000";
  }, [theme]);

  // ── Motion preference → data attribute (kills CSS animations too) ─────────
  useEffect(() => {
    document.documentElement.dataset.motion = reduceMotion ? "reduced" : "full";
  }, [reduceMotion]);

  // ── Typography Studio → CSS variables consumed by `.reading-type` ─────────
  useEffect(() => {
    const root = document.documentElement;
    const stack =
      FONT_OPTIONS.find((f) => f.id === typography.fontFamily)?.stack ??
      FONT_OPTIONS[0].stack;

    root.style.setProperty("--transcript-font", stack);
    root.style.setProperty("--transcript-size", `${typography.fontSize}rem`);
    root.style.setProperty("--transcript-leading", String(typography.lineHeight));
    root.style.setProperty(
      "--transcript-tracking",
      `${typography.letterSpacing}em`,
    );
    root.style.setProperty("--transcript-measure", `${typography.measure}ch`);
  }, [typography]);

  // Memoised so MotionConfig's props stay referentially stable.
  const motionProps = useMemo(
    () => ({ reducedMotion: reduceMotion ? ("always" as const) : ("user" as const) }),
    [reduceMotion],
  );

  return <MotionConfig {...motionProps}>{children}</MotionConfig>;
}

/** Read the active theme definition (label, swatches, colour scheme…). */
export function useActiveTheme() {
  const theme = useSettingsStore((s) => s.theme);
  return useMemo(
    () => THEMES.find((t) => t.id === theme) ?? THEMES[0],
    [theme],
  );
}
