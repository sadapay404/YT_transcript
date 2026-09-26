/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  TranStudio — design tokens & static configuration
 * ─────────────────────────────────────────────────────────────────────────────
 *  Every themeable surface in the app reads from here (or from the CSS custom
 *  properties these ids resolve to), so adding a 5th theme is a 12-line diff.
 */
import type {
  AppSettings,
  ClipColor,
  ExportPreset,
  FontOption,
  ThemeDefinition,
  ViewModeDefinition,
} from "./types";

export const APP_NAME = "TranStudio";
export const APP_SUBTITLE = "Transcript & Clip Studio";
export const APP_TAGLINE = "Read it. Clip it. Ship it.";
export const APP_DESCRIPTION =
  "Turn any YouTube video into a searchable, readable transcript — synchronized playback, AI-assisted reading and one-click exports to txt, srt, vtt and Markdown.";

/* ─────────────────────────────── Themes ─────────────────────────────────── */

export const THEMES: ThemeDefinition[] = [
  {
    id: "oled",
    label: "Pure OLED",
    tagline: "True black. Zero glare. Maximum focus.",
    scheme: "dark",
    swatch: ["#000000", "#121218", "#8b93ff"],
  },
  {
    id: "cyberpunk",
    label: "Cyberpunk",
    tagline: "Neon magenta + electric cyan on midnight chrome.",
    scheme: "dark",
    swatch: ["#06030d", "#ff2fb9", "#22d3ee"],
  },
  {
    id: "glass",
    label: "Aurora Glass",
    tagline: "Frosted panels floating over living gradients.",
    scheme: "dark",
    swatch: ["#070b1a", "#7c5cff", "#22d3ee"],
    signature: true,
  },
  {
    id: "zen",
    label: "Zen Paper",
    tagline: "Warm ink on cream paper. Distraction-free reading.",
    scheme: "light",
    swatch: ["#f6f0e4", "#2f2a23", "#b0562c"],
  },
];

/* ────────────────────────── Typography Studio ───────────────────────────── */

/**
 * Self-hosted via @fontsource — no Google Fonts request at runtime, so the app
 * works on restricted networks, offline-ish, and with zero third-party pings.
 */
export const FONT_OPTIONS: FontOption[] = [
  {
    id: "sans",
    label: "Inter",
    stack:
      "'Inter Variable', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    description: "Neutral, modern, great at every size.",
    package: "@fontsource-variable/inter",
  },
  {
    id: "serif",
    label: "Source Serif",
    stack:
      "'Source Serif 4 Variable', ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif",
    description: "Book-like rhythm for long reads.",
    package: "@fontsource-variable/source-serif-4",
  },
  {
    id: "dyslexic",
    label: "OpenDyslexic",
    stack: "'OpenDyslexic', 'Comic Sans MS', 'Trebuchet MS', sans-serif",
    description: "Weighted letterforms for easier decoding.",
    package: "@fontsource/opendyslexic",
  },
];

/**
 * Per-font "recommended reading" values applied when the user switches face —
 * OpenDyslexic wants air, Source Serif wants tighter tracking.
 */
export const FONT_RECOMMENDED: Record<
  FontOption["id"],
  { lineHeight: number; letterSpacing: number }
> = {
  sans: { lineHeight: 1.85, letterSpacing: 0.002 },
  serif: { lineHeight: 1.75, letterSpacing: 0 },
  dyslexic: { lineHeight: 2, letterSpacing: 0.018 },
};

export const FONT_SIZE_RANGE = { min: 0.875, max: 1.75, step: 0.0625 } as const; // rem
export const LINE_HEIGHT_RANGE = { min: 1.3, max: 2.4, step: 0.05 } as const;
export const LETTER_SPACING_RANGE = { min: -0.01, max: 0.06, step: 0.002 } as const; // em
export const MEASURE_RANGE = { min: 40, max: 100, step: 2 } as const; // ch

/* ────────────────────────── View modes (layout) ─────────────────────────── */

export const VIEW_MODES: ViewModeDefinition[] = [
  {
    id: "split",
    label: "Split",
    description: "Video and transcript side by side.",
  },
  {
    id: "cinema",
    label: "Cinema",
    description: "Big player up top, transcript in a rail below.",
  },
  {
    id: "read",
    label: "Read",
    description: "Transcript only — pure reading, zero video.",
  },
];

/* ─────────────────── Clip colour palette (16 distinct bands) ────────────── */

/**
 * Sixteen visually distinct Tailwind tints. Distinct hues (not just 4 repeats)
 * are what make neighbouring clips readable at a glance — see Step 5, where
 * `start_time`/`end_time` map onto transcript lines and get painted with these.
 */
export const CLIP_PALETTE: ClipColor[] = [
  {
    id: "rose",
    label: "Rose",
    bg: "bg-rose-500/20",
    bgActive: "bg-rose-500/30",
    border: "border-rose-400/50",
    accent: "bg-rose-400",
    hex: "#f43f5e",
    glow: "0 14px 44px -14px #f43f5e99",
  },
  {
    id: "red",
    label: "Signal Red",
    bg: "bg-red-500/20",
    bgActive: "bg-red-500/30",
    border: "border-red-400/50",
    accent: "bg-red-400",
    hex: "#ef4444",
    glow: "0 14px 44px -14px #ef444499",
  },
  {
    id: "orange",
    label: "Tangerine",
    bg: "bg-orange-500/20",
    bgActive: "bg-orange-500/30",
    border: "border-orange-400/50",
    accent: "bg-orange-400",
    hex: "#f97316",
    glow: "0 14px 44px -14px #f9731699",
  },
  {
    id: "amber",
    label: "Amber",
    bg: "bg-amber-500/20",
    bgActive: "bg-amber-500/30",
    border: "border-amber-400/50",
    accent: "bg-amber-400",
    hex: "#f59e0b",
    glow: "0 14px 44px -14px #f59e0b99",
  },
  {
    id: "yellow",
    label: "Highlighter",
    bg: "bg-yellow-500/20",
    bgActive: "bg-yellow-500/30",
    border: "border-yellow-400/50",
    accent: "bg-yellow-400",
    hex: "#eab308",
    glow: "0 14px 44px -14px #eab30899",
  },
  {
    id: "lime",
    label: "Lime",
    bg: "bg-lime-500/20",
    bgActive: "bg-lime-500/30",
    border: "border-lime-400/50",
    accent: "bg-lime-400",
    hex: "#84cc16",
    glow: "0 14px 44px -14px #84cc1699",
  },
  {
    id: "emerald",
    label: "Emerald",
    bg: "bg-emerald-500/20",
    bgActive: "bg-emerald-500/30",
    border: "border-emerald-400/50",
    accent: "bg-emerald-400",
    hex: "#10b981",
    glow: "0 14px 44px -14px #10b98199",
  },
  {
    id: "teal",
    label: "Teal",
    bg: "bg-teal-500/20",
    bgActive: "bg-teal-500/30",
    border: "border-teal-400/50",
    accent: "bg-teal-400",
    hex: "#14b8a6",
    glow: "0 14px 44px -14px #14b8a699",
  },
  {
    id: "cyan",
    label: "Cyan",
    bg: "bg-cyan-500/20",
    bgActive: "bg-cyan-500/30",
    border: "border-cyan-400/50",
    accent: "bg-cyan-400",
    hex: "#06b6d4",
    glow: "0 14px 44px -14px #06b6d499",
  },
  {
    id: "sky",
    label: "Sky",
    bg: "bg-sky-500/20",
    bgActive: "bg-sky-500/30",
    border: "border-sky-400/50",
    accent: "bg-sky-400",
    hex: "#0ea5e9",
    glow: "0 14px 44px -14px #0ea5e999",
  },
  {
    id: "blue",
    label: "Blue",
    bg: "bg-blue-500/20",
    bgActive: "bg-blue-500/30",
    border: "border-blue-400/50",
    accent: "bg-blue-400",
    hex: "#3b82f6",
    glow: "0 14px 44px -14px #3b82f699",
  },
  {
    id: "indigo",
    label: "Indigo",
    bg: "bg-indigo-500/20",
    bgActive: "bg-indigo-500/30",
    border: "border-indigo-400/50",
    accent: "bg-indigo-400",
    hex: "#6366f1",
    glow: "0 14px 44px -14px #6366f199",
  },
  {
    id: "violet",
    label: "Violet",
    bg: "bg-violet-500/20",
    bgActive: "bg-violet-500/30",
    border: "border-violet-400/50",
    accent: "bg-violet-400",
    hex: "#8b5cf6",
    glow: "0 14px 44px -14px #8b5cf699",
  },
  {
    id: "purple",
    label: "Purple",
    bg: "bg-purple-500/20",
    bgActive: "bg-purple-500/30",
    border: "border-purple-400/50",
    accent: "bg-purple-400",
    hex: "#a855f7",
    glow: "0 14px 44px -14px #a855f799",
  },
  {
    id: "fuchsia",
    label: "Fuchsia",
    bg: "bg-fuchsia-500/20",
    bgActive: "bg-fuchsia-500/30",
    border: "border-fuchsia-400/50",
    accent: "bg-fuchsia-400",
    hex: "#d946ef",
    glow: "0 14px 44px -14px #d946ef99",
  },
  {
    id: "pink",
    label: "Pink",
    bg: "bg-pink-500/20",
    bgActive: "bg-pink-500/30",
    border: "border-pink-400/50",
    accent: "bg-pink-400",
    hex: "#ec4899",
    glow: "0 14px 44px -14px #ec489999",
  },
];

/** Pick a palette entry by position — cycles, so 16+ clips still feel varied. */
export function clipColorAt(index: number): ClipColor {
  const size = CLIP_PALETTE.length;
  return CLIP_PALETTE[((index % size) + size) % size];
}

/* ────────────────────────────── Exports ─────────────────────────────────── */

export const EXPORT_PRESETS: ExportPreset[] = [
  {
    id: "txt",
    label: "Plain text",
    extension: ".txt",
    mimeType: "text/plain;charset=utf-8",
    description: "Cleanest possible text — ideal for pasting into any LLM.",
    supportsTimestamps: true,
    supportsMerging: true,
  },
  {
    id: "md",
    label: "Markdown",
    extension: ".md",
    mimeType: "text/markdown;charset=utf-8",
    description: "Headers, metadata table, optional timestamped blocks.",
    supportsTimestamps: true,
    supportsMerging: true,
  },
  {
    id: "srt",
    label: "SubRip (.srt)",
    extension: ".srt",
    mimeType: "application/x-subrip;charset=utf-8",
    description: "Drop straight into Premiere, Resolve or DaVinci.",
    supportsTimestamps: true,
    supportsMerging: false,
  },
  {
    id: "vtt",
    label: "WebVTT (.vtt)",
    extension: ".vtt",
    mimeType: "text/vtt;charset=utf-8",
    description: "Web-native captions with a metadata note block.",
    supportsTimestamps: true,
    supportsMerging: false,
  },
  {
    id: "json",
    label: "JSON",
    extension: ".json",
    mimeType: "application/json;charset=utf-8",
    description: "Structured segments + clips — perfect for automations.",
    supportsTimestamps: true,
    supportsMerging: false,
  },
  {
    id: "csv",
    label: "CSV",
    extension: ".csv",
    mimeType: "text/csv;charset=utf-8",
    description: "Spreadsheet-ready: index, start, end, text.",
    supportsTimestamps: true,
    supportsMerging: false,
  },
];

/* ─────────────────────────────── Gemini ─────────────────────────────────── */

export const GEMINI = {
  /**
   * Preferred model: free tier, 1M-token context, generous daily quota, no
   * credit card. Kept as the default because it is the one this project is
   * written for — but Google can retire a model for *new* accounts while it
   * keeps working for older ones, so nothing here assumes it will answer.
   */
  defaultModel: "gemini-2.5-flash",
  fallbackModel: "gemini-2.5-flash-lite",
  /**
   * Tried in order when Google reports the preferred model as unavailable.
   * Google's own error message usually names a replacement; that name is
   * preferred over this list, which is only a backstop.
   */
  modelFallbacks: ["gemini-3.8-flash", "gemini-flash-latest"],
  /** Model auto-detected via ListModels is cached this long. */
  modelCacheTtlMs: 10 * 60 * 1000,
  temperature: { chat: 0.7, clips: 0.55, summary: 0.4 },
  maxOutputTokens: { chat: 2400, clips: 8192, summary: 1200 },
  clipCount: { min: 10, max: 16, ideal: 12 },
  /** Guard rail: keep the injected transcript under ~120k tokens. */
  maxContextCharacters: 420_000,
} as const;

/* ─────────────────────────── Playback defaults ──────────────────────────── */

export const PLAYBACK = {
  /** How often the sync loop samples the player clock (ms). */
  tickMs: 120,
  /** Seconds the clip loop rewinds before the clip's end to avoid a hard cut. */
  clipEndPadding: 0.35,
  /** How long the "copied" confirmation stays on screen. */
  copyFeedbackMs: 1400,
} as const;

/* ──────────────────────────── App defaults ──────────────────────────────── */

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "zen",
  typography: {
    fontFamily: "sans",
    fontSize: 1.125,
    lineHeight: 1.85,
    letterSpacing: 0.002,
    measure: 66,
  },
  viewMode: "split",
  autoScroll: true,
  centerActiveLine: true,
  sidebarOpen: false,
  sidebarWidth: 420,
  showTimestamps: true,
  showClipHighlights: true,
  reduceMotion: false,
};

export const SIDEBAR_WIDTH_RANGE = { min: 340, max: 760 } as const;

/* ────────────────────────── Local storage keys ──────────────────────────── */

/**
 * Preferences live in a **cookie**, not localStorage, so the server can read
 * them and render the correct theme in the very first HTML response — no flash
 * of the wrong theme, no client-side boot script.
 */
export const PREFERENCES_COOKIE = "transtudio.prefs";
export const PREFERENCES_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

/** Non-preference client storage (chat drafts, transient UI state). */
export const STORAGE_KEYS = {
  chat: "transtudio.chat.v1",
} as const;

/* ──────────────────────────── Input helpers ─────────────────────────────── */

export const DEMO_URL = "https://www.youtube.com/watch?v=aircAruvnKk";

export const SUGGESTED_PROMPTS = [
  "Summarize this video in 5 bullets.",
  "What are the 3 biggest claims, and how well are they supported?",
  "Pull out every actionable step the speaker mentions.",
  "Explain the hardest concept here like I'm five.",
  "What did they say about pricing?",
] as const;
