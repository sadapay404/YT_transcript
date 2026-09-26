import { clipColorAt } from "@/lib/constants";
import type {
  ClipOverlay,
  ClipPlan,
  HookType,
  RawClip,
  TranscriptPayload,
  TranscriptSegment,
  ViralClip,
} from "@/lib/types";

/** A spoken clip shorter than this is usually a timestamp glitch, not a useful moment. */
export const MIN_CLIP_SECONDS = 1.2;

const HOOK_TYPES = new Set<HookType>([
  "hook",
  "story",
  "insight",
  "funny",
  "controversial",
  "tutorial",
  "emotional",
  "data",
  "quote",
  "other",
]);

/**
 * Hydrate model output against the real caption rail. Model timestamps are
 * suggestions only: the mapper repairs an obvious millisecond response,
 * clamps to the spoken duration, snaps to complete caption lines, and drops a
 * range that cannot be found. A slightly shorter list is safer than a clip
 * that silently plays the wrong moment.
 */
export function mapClipPlan(
  plan: ClipPlan | RawClip[],
  transcript: TranscriptPayload | TranscriptSegment[],
  durationSeconds?: number,
): ViralClip[] {
  const safePlan: ClipPlan = Array.isArray(plan) ? { clips: plan } : plan;
  const segments = Array.isArray(transcript) ? transcript : transcript.segments;
  const duration =
    durationSeconds ??
    (Array.isArray(transcript) ? segments.at(-1)?.end ?? 0 : transcript.durationSeconds) ?? 0;
  const spokenLength = Math.max(
    0,
    Number.isFinite(duration) && duration > 0 ? duration : segments.at(-1)?.end ?? 0,
  );

  if (!spokenLength || segments.length === 0) return [];

  const mapped: ViralClip[] = [];
  safePlan.clips.forEach((raw, sourceIndex) => {
    const candidate = repairTimestamps(raw, spokenLength);
    if (!candidate || candidate.start > spokenLength) return;

    const range = locateRange(segments, candidate.start, candidate.end);
    if (!range) return;

    const start = clamp(segments[range.startIndex].offset, 0, spokenLength);
    const end = clamp(segments[range.endIndex].end, start, spokenLength);
    if (end <= start || end - start < MIN_CLIP_SECONDS) return;

    const actualText = segments
      .slice(range.startIndex, range.endIndex + 1)
      .map((segment) => segment.text.trim())
      .filter(Boolean)
      .join(" ");
    if (!actualText) return;

    const hook = normalizeHook(raw.hook_type);
    const repaired =
      candidate.repaired ||
      Math.abs(start - raw.start_time) > 0.01 ||
      Math.abs(end - raw.end_time) > 0.01;

    mapped.push({
      ...raw,
      // Do not export the model's unverified quote as the canonical caption.
      // The actual line text is what the reader can see and what Copy uses.
      transcript_text: actualText,
      id: `clip-${sourceIndex + 1}`,
      index: sourceIndex,
      color: clipColorAt(sourceIndex),
      start,
      end,
      hookType: hook,
      segmentIds: segments
        .slice(range.startIndex, range.endIndex + 1)
        .map((segment) => segment.id),
      segmentStartIndex: range.startIndex,
      segmentEndIndex: range.endIndex + 1,
      ...(repaired ? { repaired: true } : {}),
    });
  });

  return mapped.sort((a, b) => a.start - b.start || a.end - b.end || a.index - b.index);
}

/** Build the O(1) segment lookup used by the transcript rail. */
export function buildClipOverlay(clips: ViralClip[]): ClipOverlay {
  const bySegment = new Map<number, ViralClip[]>();
  for (const clip of clips) {
    for (const segmentId of clip.segmentIds) {
      const entries = bySegment.get(segmentId) ?? [];
      entries.push(clip);
      bySegment.set(segmentId, entries);
    }
  }
  return {
    clipId: clips.map((clip) => clip.id).join(","),
    bySegment,
    sorted: [...clips].sort((a, b) => a.start - b.start || a.index - b.index),
  };
}

/** Convenience for callers that need both values without rebuilding the map. */
export function mapClipPlanWithOverlay(
  plan: ClipPlan | RawClip[],
  transcript: TranscriptPayload | TranscriptSegment[],
  durationSeconds?: number,
): { clips: ViralClip[]; overlay: ClipOverlay } {
  const clips = mapClipPlan(plan, transcript, durationSeconds);
  return { clips, overlay: buildClipOverlay(clips) };
}

interface RepairedRange {
  start: number;
  end: number;
  repaired: boolean;
}

function repairTimestamps(raw: RawClip, duration: number): RepairedRange | null {
  let start = finite(raw.start_time);
  let end = finite(raw.end_time);
  if (start === null || end === null) return null;

  let repaired = false;
  // Gemini sometimes returns milliseconds. Only accept the conversion when both
  // bounds overshoot and the converted window is itself believable; this avoids
  // turning a genuine 52→400 second error into a 52→400 millisecond clip.
  if (start > duration && end > duration) {
    const millisecondStart = start / 1000;
    const millisecondEnd = end / 1000;
    const convertedLength = millisecondEnd - millisecondStart;
    if (
      millisecondStart >= 0 &&
      millisecondEnd > millisecondStart &&
      convertedLength >= MIN_CLIP_SECONDS &&
      millisecondEnd <= duration * 1.05
    ) {
      start = millisecondStart;
      end = millisecondEnd;
      repaired = true;
    }
  }

  // An impossible start is not salvageable by clamping: it would show a band at
  // the end of an unrelated video. Drop it instead. A wildly overshooting end
  // on a clip that already begins at the tail is the same kind of bad data.
  if (
    start > duration ||
    end <= 0 ||
    (end > duration * 2 && start >= duration * 0.8)
  ) return null;
  if (start < 0) {
    start = 0;
    repaired = true;
  }
  if (end < 0) return null;
  if (end > duration) {
    end = duration;
    repaired = true;
  }
  if (end <= start) return null;
  return { start, end, repaired };
}

function locateRange(
  segments: TranscriptSegment[],
  start: number,
  end: number,
): { startIndex: number; endIndex: number } | null {
  const indexes = segments
    .map((segment, index) => ({ segment, index }))
    .filter(({ segment }) => segment.end > start && segment.offset < end)
    .map(({ index }) => index);

  if (indexes.length === 0) {
    // A timestamp exactly on a caption boundary can miss both strict overlap
    // comparisons. Accept the containing line only when it is truly adjacent.
    const containing = segments.findIndex(
      (segment) => segment.offset <= start && segment.end >= start,
    );
    if (containing < 0) return null;
    return { startIndex: containing, endIndex: containing };
  }
  return {
    startIndex: Math.min(...indexes),
    endIndex: Math.max(...indexes),
  };
}

function normalizeHook(value: RawClip["hook_type"]): HookType {
  const hook = typeof value === "string" ? value.toLowerCase().trim() : "";
  return HOOK_TYPES.has(hook as HookType) ? (hook as HookType) : "other";
}

function finite(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
