/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Playback ↔ transcript synchronization (pure functions)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Step 2 uses these to mark the line that matches the playhead. Step 3 layers
 *  auto-scrolling and the kinetic highlight on top of the very same lookups, so
 *  the maths lives here, is unit-tested, and never needs duplicating in a
 *  component.
 *
 *  Transcripts are sorted by `offset` and typically have 1 000–5 000 lines, so
 *  a binary search keeps every lookup at ~12 comparisons instead of scanning
 *  the whole array on each playback tick (8× per second).
 */
import type { TranscriptSegment } from "@/lib/types";

/**
 * Index of the segment covering `time`, or -1 before the first line.
 *
 * A line "covers" the playhead from its own offset until the next line starts —
 * not merely its own `offset + duration` — because YouTube leaves gaps between
 * captions (and sometimes zeros the duration). Using the next offset as the
 * boundary means the highlight never blinks off mid-sentence.
 */
export function findActiveSegmentIndex(
  segments: TranscriptSegment[],
  time: number,
): number {
  if (segments.length === 0 || !Number.isFinite(time)) return -1;

  // Before the first caption (or during a lead-in), highlight the first line.
  if (time < segments[0].offset) return -1;

  let low = 0;
  let high = segments.length - 1;
  let result = 0;

  while (low <= high) {
    const mid = (low + high) >> 1;
    if (segments[mid].offset <= time) {
      result = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return result;
}

/** Percentage of the transcript completed at `time` (0–100). */
export function transcriptProgress(
  segments: TranscriptSegment[],
  time: number,
): number {
  const last = segments.at(-1);
  if (!last || last.end <= 0) return 0;
  return Math.min(100, Math.max(0, (time / last.end) * 100));
}

/**
 * Total spoken length. Prefers the real player duration when it is known and
 * sane, so a partially-published caption track doesn't make the progress bar
 * finish early.
 */
export function effectiveDuration(
  segments: TranscriptSegment[],
  playerDuration: number,
): number {
  const fromSegments = segments.at(-1)?.end ?? 0;
  if (playerDuration > 0 && fromSegments > 0) {
    // Trust the player unless it disagrees wildly (still-loading metadata).
    return Math.abs(playerDuration - fromSegments) > 5 ? playerDuration : fromSegments;
  }
  return playerDuration || fromSegments;
}

/** Segments whose text overlaps a window — the basis of clip ranges in Step 5. */
export function segmentsInRange(
  segments: TranscriptSegment[],
  start: number,
  end: number,
): TranscriptSegment[] {
  if (end <= start) return [];
  const first = Math.max(0, findActiveSegmentIndex(segments, start));
  const last = Math.max(first, findActiveSegmentIndex(segments, Math.max(start, end - 0.001)));
  return segments.slice(first, last + 1);
}

/**
 * Decide whether the transcript rail should scroll, and to where.
 *
 * Deliberately takes **viewport-relative rect values** (`getBoundingClientRect`)
 * plus the container's current `scrollTop`, because that is exactly what a
 * component can measure — no hidden coordinate conversion to get wrong.
 *
 * Returns the `scrollTop` the container should adopt, or `null` when no
 * scrolling is needed: either the line is already comfortably in view (band
 * mode) or the move would be sub-pixel churn.
 */
export function nextScrollTop(options: {
  /** container.getBoundingClientRect().top */
  containerTop: number;
  containerHeight: number;
  /** targetLine.getBoundingClientRect().top */
  lineTop: number;
  lineHeight: number;
  /** container.scrollTop right now */
  currentScrollTop: number;
  /** Sticky chrome overlapping the top of the rail (header, player). */
  topInset?: number;
  /** Anything overlapping the bottom (composer, clip bar). */
  bottomInset?: number;
  /** Center the line (reading-optimised) instead of merely keeping it visible. */
  center?: boolean;
}): number | null {
  const {
    containerTop,
    containerHeight,
    lineTop,
    lineHeight,
    currentScrollTop,
    topInset = 0,
    bottomInset = 0,
    center = true,
  } = options;

  /** Line position relative to the top of the container's visible area. */
  const relativeTop = lineTop - containerTop;
  /** The same line's position inside the scrollable content. */
  const contentTop = currentScrollTop + relativeTop;

  const viewTop = topInset;
  const viewBottom = containerHeight - bottomInset;
  const comfortablyVisible =
    relativeTop >= viewTop + 8 && relativeTop + lineHeight <= viewBottom - 8;

  if (comfortablyVisible && !center) return null;

  const target = center
    ? contentTop - containerHeight * 0.38 + lineHeight / 2
    : contentTop - topInset - 24;

  const clamped = Math.max(0, target);
  // Ignore moves the eye can't see, so the rail never jitters between ticks.
  if (Math.abs(clamped - currentScrollTop) < 4) return null;
  return clamped;
}
