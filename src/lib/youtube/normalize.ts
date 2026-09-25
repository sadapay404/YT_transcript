/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Timestamp normalization — the single riskiest detail in the whole pipeline.
 * ─────────────────────────────────────────────────────────────────────────────
 *  `youtube-transcript` returns **milliseconds** on its primary path (srv3
 *  `<p t="12345" d="678">`) but **seconds** on its classic fallback
 *  (`<text start="12.3" dur="4.1">`). Both shapes satisfy the same TypeScript
 *  type, so a wrong assumption silently scatters every line across the wrong
 *  minute of the video.
 *
 *  Rather than trusting one branch, we detect the unit from the payload itself
 *  and then let the player's *real* duration verify us at render time
 *  (see `rescaleIfImplausible`), which self-heals any misdetection.
 */
import type { RawTranscriptSegment, TranscriptSegment } from "@/lib/types";
import { clamp, normalizeCaption } from "@/lib/utils";

export type TimeUnit = "ms" | "s";

/** Beyond this many seconds we assume milliseconds (~6h of talking). */
const MS_THRESHOLD_SECONDS = 21_600;
/** Caption lines are seconds apart, not minutes — so a >60s median = ms. */
const MS_MEDIAN_GAP_SECONDS = 60;

/** Median of a numeric list (mutates a copy, never the input). */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Decide whether a caption track is expressed in milliseconds or seconds.
 *
 * Signals, in priority order:
 *  1. Any fractional value → seconds. The classic `<text start="12.3">` path
 *     uses `parseFloat`, so decimals only ever appear in seconds.
 *  2. Largest timestamp beyond 21 600 → milliseconds (that would be a 6h+ video
 *     otherwise).
 *  3. Median gap between consecutive captions above 60 → milliseconds. This is
 *     what makes short clips decidable: real caption lines sit 1–4s apart, so a
 *     track whose *typical* gap is 60+ "units" can only be milliseconds.
 *  4. Otherwise → seconds.
 */
export function detectTimeUnit(segments: RawTranscriptSegment[]): TimeUnit {
  if (segments.length === 0) return "s";

  let max = 0;
  let hasFraction = false;
  const offsets: number[] = [];

  for (const segment of segments) {
    const offset = Number(segment.offset) || 0;
    const duration = Number(segment.duration) || 0;
    if (!Number.isInteger(offset) || !Number.isInteger(duration)) hasFraction = true;
    offsets.push(offset);
    const end = offset + duration;
    if (end > max) max = end;
  }

  if (hasFraction) return "s";
  if (max > MS_THRESHOLD_SECONDS) return "ms";

  const gaps: number[] = [];
  for (let i = 1; i < offsets.length; i += 1) {
    const gap = offsets[i] - offsets[i - 1];
    if (gap > 0) gaps.push(gap);
  }
  if (gaps.length >= 2 && max > 1000 && median(gaps) > MS_MEDIAN_GAP_SECONDS) {
    return "ms";
  }

  return "s";
}

/** Divide by 1000 only when needed. */
export function toSeconds(value: number, unit: TimeUnit): number {
  return unit === "ms" ? value / 1000 : value;
}

export interface NormalizeOptions {
  /** Language label reported by the scraper. */
  language?: string;
  /** Known video length — enables the plausibility check below. */
  videoDurationSeconds?: number;
  /**
   * Trust the caller: our own parsers know the unit from the format they read
   * (json3 and srv3 are milliseconds, classic XML and WebVTT are seconds).
   * Detection is only used for third-party payloads of unknown origin.
   */
  forceUnit?: TimeUnit;
}

export interface NormalizedTranscript {
  unit: TimeUnit;
  /** True when `videoDurationSeconds` contradicted the detection and we fixed it. */
  rescaled: boolean;
  segments: TranscriptSegment[];
  text: string;
  wordCount: number;
  characterCount: number;
  durationSeconds: number;
}

/**
 * Convert raw scraper output into the app's canonical seconds-based segments.
 * Empty lines are dropped, overlapping/gapped offsets are preserved (YouTube
 * does both), and `end` is clamped to be strictly after `start`.
 */
export function normalizeSegments(
  raw: RawTranscriptSegment[],
  options: NormalizeOptions = {},
): NormalizedTranscript {
  let unit = options.forceUnit ?? detectTimeUnit(raw);
  let rescaled = false;
  const rawEnd = raw.reduce(
    (max, segment) =>
      Math.max(max, (Number(segment.offset) || 0) + (Number(segment.duration) || 0)),
    0,
  );
  const detectedDuration = toSeconds(rawEnd, unit);

  // Self-heal: the player knows the true length, so if our guess implies a
  // video five times longer than reality, the unit was almost certainly wrong.
  // Skipped when the caller stated the unit explicitly.
  if (
    !options.forceUnit &&
    options.videoDurationSeconds &&
    options.videoDurationSeconds > 0 &&
    detectedDuration > options.videoDurationSeconds * 1.5
  ) {
    const flipped: TimeUnit = unit === "ms" ? "s" : "ms";
    const flippedDuration = toSeconds(rawEnd, flipped);
    if (flippedDuration <= options.videoDurationSeconds * 1.5) {
      unit = flipped;
      rescaled = true;
    }
  }

  const segments: TranscriptSegment[] = [];

  for (const item of raw) {
    const text = normalizeCaption(item.text ?? "");
    if (!text) continue;

    const offset = Math.max(0, toSeconds(Number(item.offset) || 0, unit));
    const duration = Math.max(0, toSeconds(Number(item.duration) || 0, unit));

    segments.push({
      id: segments.length,
      text,
      offset: Number(offset.toFixed(3)),
      duration: Number(duration.toFixed(3)),
      // A zero-duration caption still needs a visible window to be clickable.
      end: Number(Math.max(offset + duration, offset + 0.15).toFixed(3)),
      charCount: text.length,
    });
  }

  const text = segments.map((segment) => segment.text).join(" ");
  const last = segments.at(-1);

  return {
    unit,
    rescaled,
    segments,
    text,
    wordCount: text ? text.split(/\s+/).length : 0,
    characterCount: text.length,
    durationSeconds: last ? last.end : 0,
  };
}

/**
 * Re-check a client-side transcript against the *real* player duration and
 * return corrected segments when the server's unit guess was wrong. Called once
 * per video from the sync engine (Step 3) — cheap, and it makes the pipeline
 * immune to YouTube changing caption formats.
 */
export function rescaleIfImplausible(
  segments: TranscriptSegment[],
  videoDurationSeconds: number,
): TranscriptSegment[] | null {
  if (!segments.length || !videoDurationSeconds || videoDurationSeconds <= 0) {
    return null;
  }
  const last = segments.at(-1);
  if (!last || last.end <= videoDurationSeconds * 1.5) return null;

  // Only auto-correct an unmistakable ~1000× overshoot. A 2–50× overshoot is
  // ambiguous (trailing silence, a partial caption track) and is left alone
  // rather than silently mangled.
  const overshoot = last.end / videoDurationSeconds;
  if (overshoot < 50) return null;

  const factor = 1 / 1000;
  return segments.map((segment) => ({
    ...segment,
    offset: Number((segment.offset * factor).toFixed(3)),
    duration: Number((segment.duration * factor).toFixed(3)),
    end: Number((segment.end * factor).toFixed(3)),
  }));
}

/** Progress helper for the transcript rail's scrubber. */
export function progressFor(
  currentTime: number,
  duration: number,
): number {
  if (!duration || duration <= 0) return 0;
  return clamp(currentTime / duration, 0, 1);
}
