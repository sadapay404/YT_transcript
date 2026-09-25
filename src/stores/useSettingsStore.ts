"use client";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Settings store — the single source of truth for theming, typography,
 *  layout and view behaviour. Persisted to localStorage so a refresh keeps the
 *  studio exactly how the user left it.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import {
  DEFAULT_SETTINGS,
  FONT_SIZE_RANGE,
  LETTER_SPACING_RANGE,
  LINE_HEIGHT_RANGE,
  MEASURE_RANGE,
  SIDEBAR_WIDTH_RANGE,
  THEMES,
  STORAGE_KEYS,
} from "@/lib/constants";
import type {
  AppSettings,
  FontFamilyId,
  ThemeId,
  TypographySettings,
  ViewMode,
} from "@/lib/types";
import { clamp, round } from "@/lib/utils";

interface SettingsActions {
  setTheme: (theme: ThemeId) => void;
  cycleTheme: (direction?: 1 | -1) => void;
  /** Jump back to a stock theme id, or every value at once with no args. */
  resetTheme: () => void;

  setFontFamily: (family: FontFamilyId) => void;
  setFontSize: (size: number) => void;
  nudgeFontSize: (delta: number) => void;
  setLineHeight: (value: number) => void;
  setLetterSpacing: (value: number) => void;
  setMeasure: (value: number) => void;
  setTypography: (patch: Partial<TypographySettings>) => void;
  resetTypography: () => void;

  setViewMode: (mode: ViewMode) => void;
  cycleViewMode: () => void;

  toggleAutoScroll: () => void;
  toggleCenterActiveLine: () => void;
  toggleTimestamps: () => void;
  toggleClipHighlights: () => void;
  toggleReduceMotion: () => void;

  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setSidebarWidth: (width: number) => void;

  /** Full reset (used by the "restore defaults" button). */
  resetAll: () => void;
}

export type SettingsState = AppSettings & SettingsActions;

/** Values only — used by `persist.partialize` so actions never hit storage. */
function pickSettings(state: SettingsState): AppSettings {
  return {
    theme: state.theme,
    typography: state.typography,
    viewMode: state.viewMode,
    autoScroll: state.autoScroll,
    centerActiveLine: state.centerActiveLine,
    sidebarOpen: state.sidebarOpen,
    sidebarWidth: state.sidebarWidth,
    showTimestamps: state.showTimestamps,
    showClipHighlights: state.showClipHighlights,
    reduceMotion: state.reduceMotion,
  };
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_SETTINGS,

      setTheme: (theme) => set({ theme }),

      cycleTheme: (direction = 1) => {
        const ids = THEMES.map((t) => t.id);
        const current = ids.indexOf(get().theme);
        const next = (current + direction + ids.length) % ids.length;
        set({ theme: ids[next] });
      },

      resetTheme: () => set({ theme: DEFAULT_SETTINGS.theme }),

      setFontFamily: (fontFamily) =>
        set((s) => ({ typography: { ...s.typography, fontFamily } })),

      setFontSize: (fontSize) =>
        set((s) => ({
          typography: {
            ...s.typography,
            fontSize: round(
              clamp(fontSize, FONT_SIZE_RANGE.min, FONT_SIZE_RANGE.max),
              4,
            ),
          },
        })),

      nudgeFontSize: (delta) => get().setFontSize(get().typography.fontSize + delta),

      setLineHeight: (lineHeight) =>
        set((s) => ({
          typography: {
            ...s.typography,
            lineHeight: round(
              clamp(lineHeight, LINE_HEIGHT_RANGE.min, LINE_HEIGHT_RANGE.max),
              3,
            ),
          },
        })),

      setLetterSpacing: (letterSpacing) =>
        set((s) => ({
          typography: {
            ...s.typography,
            letterSpacing: round(
              clamp(
                letterSpacing,
                LETTER_SPACING_RANGE.min,
                LETTER_SPACING_RANGE.max,
              ),
              4,
            ),
          },
        })),

      setMeasure: (measure) =>
        set((s) => ({
          typography: {
            ...s.typography,
            measure: round(clamp(measure, MEASURE_RANGE.min, MEASURE_RANGE.max), 0),
          },
        })),

      setTypography: (patch) =>
        set((s) => ({ typography: { ...s.typography, ...patch } })),

      resetTypography: () => set({ typography: DEFAULT_SETTINGS.typography }),

      setViewMode: (viewMode) => set({ viewMode }),

      cycleViewMode: () => {
        const order: ViewMode[] = ["split", "cinema", "read"];
        const next = order[(order.indexOf(get().viewMode) + 1) % order.length];
        set({ viewMode: next });
      },

      toggleAutoScroll: () => set((s) => ({ autoScroll: !s.autoScroll })),
      toggleCenterActiveLine: () =>
        set((s) => ({ centerActiveLine: !s.centerActiveLine })),
      toggleTimestamps: () => set((s) => ({ showTimestamps: !s.showTimestamps })),
      toggleClipHighlights: () =>
        set((s) => ({ showClipHighlights: !s.showClipHighlights })),
      toggleReduceMotion: () => set((s) => ({ reduceMotion: !s.reduceMotion })),

      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setSidebarWidth: (width) =>
        set({
          sidebarWidth: Math.round(
            clamp(width, SIDEBAR_WIDTH_RANGE.min, SIDEBAR_WIDTH_RANGE.max),
          ),
        }),

      resetAll: () => set({ ...DEFAULT_SETTINGS }),
    }),
    {
      name: STORAGE_KEYS.settings,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: pickSettings,
      // Defensive merge: a stale/partial blob can never break the store.
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<AppSettings>;
        return {
          ...current,
          ...saved,
          typography: {
            ...current.typography,
            ...(saved.typography ?? {}),
          },
        };
      },
    },
  ),
);

/* ──────────────────────────── Convenience hooks ─────────────────────────── */

/**
 * True once the persisted blob has been merged into the store.
 *
 * Implemented with `useSyncExternalStore` (instead of an effect + setState) so
 * React uses the server snapshot during hydration and swaps to the live value
 * right after — no cascading render, no hydration mismatch for components that
 * render a value derived from saved settings.
 */
function subscribeHydration(onChange: () => void) {
  const unsubFinish = useSettingsStore.persist.onFinishHydration(onChange);
  const unsubRehydrate = useSettingsStore.persist.onHydrate(onChange);
  return () => {
    unsubFinish();
    unsubRehydrate();
  };
}

export function useSettingsHydrated(): boolean {
  return useSyncExternalStore(
    subscribeHydration,
    () => useSettingsStore.persist.hasHydrated(),
    () => false,
  );
}

/** Selector shorthand so components don't subscribe to the whole store. */
export const useTheme = () => useSettingsStore((s) => s.theme);
export const useTypography = () => useSettingsStore((s) => s.typography);
export const useViewMode = () => useSettingsStore((s) => s.viewMode);
