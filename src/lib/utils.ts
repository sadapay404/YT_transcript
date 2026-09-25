/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  TranStudio — shared utilities (safe on both client and server)
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Tailwind-aware `class` joiner (last-write-wins on conflicting utilities). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* ───────────────────────────── Number helpers ───────────────────────────── */

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

/** Round to a given number of decimals — via exponential notation, so
 *  `round(1.005, 2)` is `1.01` rather than `1` (float-drift safe). */
export function round(value: number, decimals = 2) {
  if (!Number.isFinite(value)) return value;
  const shifted = Number(`${value}e${decimals}`);
  if (Number.isNaN(shifted)) return value;
  return Number(`${Math.round(shifted)}e-${decimals}`);
}

export function uid(prefix = "id") {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

/* ───────────────────────────── Time formatting ──────────────────────────── */

/**
 * `1:02:03` / `12:34` — used for transcript badges, clip pills and tooltips.
 * Pass `forceHours` for talk-length videos so columns never jump around.
 */
export function formatTimestamp(seconds: number, forceHours = false): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const total = Math.floor(safe);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hours > 0 || forceHours) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

/** `01:02:03,250` — SubRip timecode. */
export function toSrtTimecode(seconds: number): string {
  const safe = Math.max(0, seconds);
  const ms = Math.round((safe % 1) * 1000);
  const total = Math.floor(safe);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)},${String(ms).padStart(3, "0")}`;
}

/** `01:02:03.250` — WebVTT timecode. */
export function toVttTimecode(seconds: number): string {
  return toSrtTimecode(seconds).replace(",", ".");
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** `1h 04m` / `12m 30s` — human duration for metadata chips. */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${pad(m)}m`;
  if (m > 0) return `${m}m ${pad(s)}s`;
  return `${s}s`;
}

/** Approximate reading time for the transcript header. */
export function readingMinutes(wordCount: number, wpm = 220): number {
  return Math.max(1, Math.round(wordCount / wpm));
}

/* ───────────────────────────── String helpers ───────────────────────────── */

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function countWords(text: string): number {
  const matches = text.match(/\S+/g);
  return matches ? matches.length : 0;
}

/** Collapse caption whitespace/newlines for storage + prompt friendliness. */
export function normalizeCaption(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\u200b/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();
}

export function slugify(text: string, fallback = "transcript"): string {
  const slug = text
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
  return slug || fallback;
}

/** Escape a CSV cell (quotes doubled, cell wrapped when needed). */
export function csvCell(value: string | number): string {
  const str = String(value ?? "");
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/* ──────────────────────────── YouTube parsing ───────────────────────────── */

export interface ParsedVideo {
  videoId: string;
  /** Canonical watch URL (no tracking params). */
  url: string;
  /** Deep-link start time in seconds, when the URL carried `t`/`start`. */
  startAt?: number;
}

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/**
 * Accepts every URL flavour a human might paste:
 *   watch?v=, youtu.be/, /embed/, /shorts/, /live/, /v/, music. & nocookie
 * hosts, extra query params, timestamps (`?t=90`, `?t=1m30s`, `&start=90`),
 * or a bare 11-character video id.
 */
export function parseYouTubeUrl(input: string): ParsedVideo | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;

  // Bare id
  if (VIDEO_ID_RE.test(raw)) {
    return { videoId: raw, url: `https://www.youtube.com/watch?v=${raw}` };
  }

  let url: URL;
  try {
    url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\.|^m\./, "").toLowerCase();
  const isYouTube =
    host === "youtube.com" ||
    host === "youtube-nocookie.com" ||
    host === "youtu.be" ||
    host.endsWith(".youtube.com");
  if (!isYouTube) return null;

  let videoId: string | null = null;

  if (host === "youtu.be") {
    videoId = url.pathname.split("/").filter(Boolean)[0] ?? null;
  } else if (url.pathname === "/watch") {
    videoId = url.searchParams.get("v");
  } else {
    const parts = url.pathname.split("/").filter(Boolean);
    const [first, second] = parts;
    if (["embed", "shorts", "live", "v", "video"].includes(first) && second) {
      videoId = second;
    }
  }

  if (!videoId || !VIDEO_ID_RE.test(videoId)) return null;

  const startAt = parseTimeParam(
    url.searchParams.get("t") ??
      url.searchParams.get("start") ??
      url.searchParams.get("time_continue"),
  );

  const parsed: ParsedVideo = {
    videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
  };
  if (typeof startAt === "number") parsed.startAt = startAt;
  return parsed;
}

/**
 * `90`, `90s`, `1m30s`, `1h2m3s` → seconds.
 * Zero/negative values return `undefined`: `?t=0` means "from the start", which
 * is the same as no deep link, so callers can skip seeking entirely.
 */
export function parseTimeParam(value: string | null): number | undefined {
  if (!value) return undefined;

  if (/^\d+$/.test(value)) {
    const seconds = Number(value);
    return seconds > 0 ? seconds : undefined;
  }

  const match = value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
  if (!match) return undefined;
  const [, h, m, s] = match;
  const total = Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(s ?? 0);
  return total > 0 ? total : undefined;
}

export function youtubeThumbnail(videoId: string, quality: "default" | "mq" | "hq" | "sd" | "max" = "hq") {
  const map = {
    default: "default",
    mq: "mqdefault",
    hq: "hqdefault",
    sd: "sddefault",
    max: "maxresdefault",
  } as const;
  return `https://i.ytimg.com/vi/${videoId}/${map[quality]}.jpg`;
}

export function youtubeEmbedUrl(videoId: string, opts: { start?: number; autoplay?: boolean } = {}) {
  const params = new URLSearchParams({
    rel: "0",
    modestbranding: "1",
    playsinline: "1",
    enablejsapi: "1",
    origin: typeof window !== "undefined" ? window.location.origin : "",
  });
  if (opts.start) params.set("start", String(Math.floor(opts.start)));
  if (opts.autoplay) params.set("autoplay", "1");
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
}

/* ─────────────────────────────── Misc ──────────────────────────────────── */

export function safeJsonParse<T>(value: string | null | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}
