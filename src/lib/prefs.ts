/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Preferences — persisted in a COOKIE so the server can render them.
 * ─────────────────────────────────────────────────────────────────────────────
 *  Why a cookie instead of localStorage?
 *
 *  localStorage is invisible to the server, so a saved theme could only be
 *  applied *after* hydration (usually with an inline boot script and a brief
 *  flash of the default theme). A cookie travels with the request, so
 *  `layout.tsx` can put `data-theme` and the typography variables directly into
 *  the first byte of HTML. The result: zero flash, no boot script, and the
 *  theme survives a hard refresh even with JS disabled.
 *
 *  The payload is tiny (a few hundred bytes) and every field is validated on
 *  read, so a hand-edited or stale cookie can never break the app.
 */
import {
  DEFAULT_SETTINGS,
  FONT_SIZE_RANGE,
  FONT_OPTIONS,
  LETTER_SPACING_RANGE,
  LINE_HEIGHT_RANGE,
  MEASURE_RANGE,
  PREFERENCES_COOKIE,
  PREFERENCES_MAX_AGE,
  SIDEBAR_WIDTH_RANGE,
  THEMES,
} from "./constants";
import type {
  AppSettings,
  FontFamilyId,
  ThemeId,
  TypographySettings,
  ViewMode,
} from "./types";
import { clamp, round } from "./utils";

/* ───────────────────────────── Field guards ─────────────────────────────── */

const THEME_IDS = THEMES.map((theme) => theme.id);
const FONT_IDS = FONT_OPTIONS.map((font) => font.id);
const VIEW_MODES: ViewMode[] = ["split", "cinema", "read"];

function asTheme(value: unknown): ThemeId | undefined {
  return typeof value === "string" && (THEME_IDS as string[]).includes(value)
    ? (value as ThemeId)
    : undefined;
}

function asFont(value: unknown): FontFamilyId | undefined {
  return typeof value === "string" && (FONT_IDS as string[]).includes(value)
    ? (value as FontFamilyId)
    : undefined;
}

function asViewMode(value: unknown): ViewMode | undefined {
  return typeof value === "string" && (VIEW_MODES as string[]).includes(value)
    ? (value as ViewMode)
    : undefined;
}

function asBool(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function asNumber(
  value: unknown,
  range: { min: number; max: number },
  decimals = 4,
): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return round(clamp(value, range.min, range.max), decimals);
}

function asTypography(value: unknown): Partial<TypographySettings> {
  if (!value || typeof value !== "object") return {};
  const raw = value as Record<string, unknown>;
  const patch: Partial<TypographySettings> = {};

  const fontFamily = asFont(raw.fontFamily);
  if (fontFamily) patch.fontFamily = fontFamily;

  const fontSize = asNumber(raw.fontSize, FONT_SIZE_RANGE);
  if (fontSize !== undefined) patch.fontSize = fontSize;

  const lineHeight = asNumber(raw.lineHeight, LINE_HEIGHT_RANGE, 3);
  if (lineHeight !== undefined) patch.lineHeight = lineHeight;

  const letterSpacing = asNumber(raw.letterSpacing, LETTER_SPACING_RANGE);
  if (letterSpacing !== undefined) patch.letterSpacing = letterSpacing;

  const measure = asNumber(raw.measure, MEASURE_RANGE, 0);
  if (measure !== undefined) patch.measure = measure;

  return patch;
}

/* ──────────────────────────────── Parsing ───────────────────────────────── */

/** Cookie values may arrive percent-encoded; decode defensively. */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Parse a preferences cookie into a validated, partial settings object.
 *
 * Accepts both the zustand `persist` envelope
 * (`{"state":{…},"version":1}`) and a plain settings object, so the cookie
 * format can change without a migration step.
 */
export function parsePreferences(raw: string | undefined | null): Partial<AppSettings> {
  if (!raw) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(safeDecode(raw));
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object") return {};

  const record = parsed as Record<string, unknown>;
  const source =
    record.state && typeof record.state === "object"
      ? (record.state as Record<string, unknown>)
      : record;

  const result: Partial<AppSettings> = {};

  const theme = asTheme(source.theme);
  if (theme) result.theme = theme;

  const typography = asTypography(source.typography);
  if (Object.keys(typography).length > 0) result.typography = typography as TypographySettings;

  const viewMode = asViewMode(source.viewMode);
  if (viewMode) result.viewMode = viewMode;

  const booleans: Array<keyof AppSettings> = [
    "autoScroll",
    "centerActiveLine",
    "sidebarOpen",
    "showTimestamps",
    "showClipHighlights",
    "reduceMotion",
  ];
  for (const key of booleans) {
    const value = asBool(source[key]);
    if (value !== undefined) (result as Record<string, unknown>)[key] = value;
  }

  const sidebarWidth = asNumber(source.sidebarWidth, SIDEBAR_WIDTH_RANGE, 0);
  if (sidebarWidth !== undefined) result.sidebarWidth = sidebarWidth;

  return result;
}

/** Merge a parsed cookie over the defaults — always a complete settings object. */
export function resolvePreferences(raw: string | undefined | null): AppSettings {
  const parsed = parsePreferences(raw);
  return {
    ...DEFAULT_SETTINGS,
    ...parsed,
    typography: { ...DEFAULT_SETTINGS.typography, ...(parsed.typography ?? {}) },
  };
}

/** Compact serialisation for the cookie (zustand-compatible envelope). */
export function serializePreferences(settings: AppSettings): string {
  return JSON.stringify({ state: settings, version: 1 });
}

/* ───────────────────────────── Client helpers ───────────────────────────── */

export function readPreferencesCookie(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${PREFERENCES_COOKIE.replace(/\./g, "\\.")}=([^;]*)`),
  );
  return match?.[1];
}

export function writePreferencesCookie(value: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${PREFERENCES_COOKIE}=${encodeURIComponent(value)}; Max-Age=${PREFERENCES_MAX_AGE}; Path=/; SameSite=Lax`;
}

export function clearPreferencesCookie(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${PREFERENCES_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
}

/**
 * Storage adapter for zustand's `persist` middleware (cookie-backed). The
 * cookie name is fixed, so the incoming key is ignored by design.
 */
export const preferencesStorage = {
  getItem: (): string | null => readPreferencesCookie() ?? null,
  setItem: (_name: string, value: string): void => writePreferencesCookie(value),
  removeItem: (): void => clearPreferencesCookie(),
};
