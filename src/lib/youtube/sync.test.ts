import { describe, expect, it } from "vitest";

import type { TranscriptSegment } from "@/lib/types";
import {
  effectiveDuration,
  findActiveSegmentIndex,
  nextScrollTop,
  segmentsInRange,
  transcriptProgress,
} from "@/lib/youtube/sync";

/** Build segments from [offset, duration] pairs with the given texts. */
function makeSegments(pairs: Array<[number, number]>, texts?: string[]): TranscriptSegment[] {
  return pairs.map(([offset, duration], index) => ({
    id: index,
    text: texts?.[index] ?? `line ${index}`,
    offset,
    duration,
    end: offset + duration,
    charCount: 6,
  }));
}

const SPACED = makeSegments([
  [0, 2],
  [2.5, 3], // deliberate 0.5s gap, as real captions have
  [6, 2],
  [9, 4],
  [14, 1],
]);

describe("findActiveSegmentIndex", () => {
  it("returns -1 before the first caption and for empty input", () => {
    const segments = makeSegments([[5, 2]]);
    expect(findActiveSegmentIndex(segments, 0)).toBe(-1);
    expect(findActiveSegmentIndex([], 10)).toBe(-1);
    expect(findActiveSegmentIndex(segments, Number.NaN)).toBe(-1);
  });

  it("marks the line whose window contains the time", () => {
    expect(findActiveSegmentIndex(SPACED, 0)).toBe(0);
    expect(findActiveSegmentIndex(SPACED, 1.9)).toBe(0);
    expect(findActiveSegmentIndex(SPACED, 2.6)).toBe(1);
    expect(findActiveSegmentIndex(SPACED, 9)).toBe(3);
  });

  it("keeps the previous line highlighted across inter-caption gaps", () => {
    // 2.2s sits between line 0 (ends 2.0) and line 1 (starts 2.5).
    expect(findActiveSegmentIndex(SPACED, 2.2)).toBe(0);
    // 8.2s sits between line 2 (ends 8) and line 3 (starts 9).
    expect(findActiveSegmentIndex(SPACED, 8.2)).toBe(2);
  });

  it("keeps the last line highlighted past the end of the transcript", () => {
    expect(findActiveSegmentIndex(SPACED, 99)).toBe(SPACED.length - 1);
  });

  it("stays correct across a long transcript (binary search sanity)", () => {
    const many = makeSegments(
      Array.from({ length: 5_000 }, (_, index) => [index * 3, 3] as [number, number]),
    );
    for (const index of [0, 1, 17, 1_234, 4_999]) {
      expect(findActiveSegmentIndex(many, index * 3 + 1)).toBe(index);
    }
  });

  it("handles a transcript whose first line starts at 0", () => {
    const segments = makeSegments([
      [0, 1],
      [1, 1],
    ]);
    expect(findActiveSegmentIndex(segments, 0)).toBe(0);
    expect(findActiveSegmentIndex(segments, 1.5)).toBe(1);
  });
});

describe("transcriptProgress", () => {
  it("reports 0–100 and clamps", () => {
    expect(transcriptProgress(SPACED, 0)).toBe(0);
    expect(transcriptProgress(SPACED, 7.5)).toBe(50); // end = 15
    expect(transcriptProgress(SPACED, 100)).toBe(100);
    expect(transcriptProgress([], 10)).toBe(0);
  });
});

describe("effectiveDuration", () => {
  it("prefers the caption length when the player agrees", () => {
    expect(effectiveDuration(SPACED, 15)).toBe(15);
  });

  it("trusts the player when metadata is still loading", () => {
    expect(effectiveDuration(SPACED, 0)).toBe(15);
    expect(effectiveDuration(SPACED, 900)).toBe(900);
  });

  it("falls back to the caption length when neither is known", () => {
    expect(effectiveDuration([], 0)).toBe(0);
  });
});

describe("segmentsInRange", () => {
  it("returns the lines overlapping a clip window", () => {
    expect(segmentsInRange(SPACED, 2.6, 8.5).map((s) => s.id)).toEqual([1, 2]);
    expect(segmentsInRange(SPACED, 0, 100).map((s) => s.id)).toEqual([0, 1, 2, 3, 4]);
  });

  it("returns nothing for an empty or inverted window", () => {
    expect(segmentsInRange(SPACED, 5, 5)).toEqual([]);
    expect(segmentsInRange(SPACED, 8, 2)).toEqual([]);
  });
});

describe("nextScrollTop", () => {
  // Viewport-relative rects, exactly as a component would measure them.
  const base = {
    containerTop: 0,
    containerHeight: 600,
    lineHeight: 40,
    currentScrollTop: 1000,
  };

  it("does nothing when the line is already comfortable (band mode)", () => {
    expect(nextScrollTop({ ...base, lineTop: 200, center: false })).toBeNull();
  });

  it("scrolls a line that is below the fold (band mode)", () => {
    // relative top 700 → content top 1700 → 1700 - 0 - 24
    expect(nextScrollTop({ ...base, lineTop: 700, center: false })).toBe(1676);
  });

  it("respects a sticky top inset in band mode", () => {
    // relative top 200 would be hidden under a 300px sticky player
    const target = nextScrollTop({
      ...base,
      lineTop: 200,
      center: false,
      topInset: 300,
    });
    expect(target).toBe(1200 - 300 - 24); // contentTop 1200
  });

  it("centers the line in center mode", () => {
    // contentTop 1400, container 600 → 1400 - 228 + 20
    expect(nextScrollTop({ ...base, lineTop: 400, center: true })).toBe(1192);
  });

  it("never returns a negative scroll position", () => {
    const target = nextScrollTop({
      ...base,
      currentScrollTop: 0,
      lineTop: 100,
      center: true,
    });
    expect(target ?? 0).toBe(0);
  });

  it("ignores sub-pixel churn to avoid jitter", () => {
    // target lands ~2px from the current position → not worth scrolling
    const target = nextScrollTop({
      ...base,
      currentScrollTop: 1000,
      lineTop: 210,
      center: true,
    });
    expect(target).toBeNull();
  });

  it("does not scroll an empty rail", () => {
    expect(
      nextScrollTop({ ...base, currentScrollTop: 0, lineTop: 0, center: false }),
    ).toBeNull();
  });
});
