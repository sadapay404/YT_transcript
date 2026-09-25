import { describe, expect, it } from "vitest";

import type { RawTranscriptSegment } from "@/lib/types";
import {
  detectTimeUnit,
  normalizeSegments,
  rescaleIfImplausible,
} from "@/lib/youtube/normalize";

/** srv3 shape: milliseconds, integers. */
const MILLISECONDS: RawTranscriptSegment[] = [
  { text: "Hello and welcome", offset: 0, duration: 2200 },
  { text: "to the show.", offset: 2200, duration: 1800 },
  { text: "Today we talk pricing.", offset: 4000, duration: 3100 },
];

/** classic shape: seconds, often fractional. */
const SECONDS: RawTranscriptSegment[] = [
  { text: "Hello and welcome", offset: 0, duration: 2.2 },
  { text: "to the show.", offset: 2.2, duration: 1.8 },
  { text: "Today we talk pricing.", offset: 4, duration: 3.1 },
];

describe("detectTimeUnit", () => {
  it("detects milliseconds from large integer offsets", () => {
    expect(detectTimeUnit(MILLISECONDS)).toBe("ms");
  });

  it("detects seconds from fractional offsets", () => {
    expect(detectTimeUnit(SECONDS)).toBe("s");
  });

  it("treats a short integer track as seconds", () => {
    expect(detectTimeUnit([{ text: "hi", offset: 4, duration: 2 }])).toBe("s");
  });

  it("handles an empty track", () => {
    expect(detectTimeUnit([])).toBe("s");
  });
});

describe("normalizeSegments", () => {
  it("converts milliseconds to seconds", () => {
    const result = normalizeSegments(MILLISECONDS);
    expect(result.unit).toBe("ms");
    expect(result.segments[1].offset).toBe(2.2);
    expect(result.segments[1].duration).toBe(1.8);
    expect(result.segments[1].end).toBe(4);
    expect(result.durationSeconds).toBe(7.1);
  });

  it("leaves second-based payloads alone", () => {
    const result = normalizeSegments(SECONDS);
    expect(result.unit).toBe("s");
    expect(result.segments[2].offset).toBe(4);
    expect(result.durationSeconds).toBe(7.1);
  });

  it("produces identical output for both upstream shapes", () => {
    expect(normalizeSegments(MILLISECONDS).segments).toEqual(
      normalizeSegments(SECONDS).segments,
    );
  });

  it("assigns sequential ids, char counts and joined text", () => {
    const result = normalizeSegments(SECONDS);
    expect(result.segments.map((s) => s.id)).toEqual([0, 1, 2]);
    expect(result.segments[0].charCount).toBe("Hello and welcome".length);
    expect(result.text).toBe("Hello and welcome to the show. Today we talk pricing.");
    expect(result.wordCount).toBe(10);
  });

  it("drops empty/whitespace-only lines and re-indexes", () => {
    const result = normalizeSegments([
      { text: "  ", offset: 0, duration: 1 },
      { text: " real line ", offset: 1, duration: 1 },
      { text: "", offset: 2, duration: 1 },
    ]);
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0]).toMatchObject({ id: 0, text: "real line", offset: 1 });
  });

  it("collapses newlines inside a caption into single spaces", () => {
    const result = normalizeSegments([
      { text: "two\nlines  here", offset: 0, duration: 1 },
    ]);
    expect(result.segments[0].text).toBe("two lines here");
  });

  it("gives zero-duration captions a clickable window", () => {
    const result = normalizeSegments([{ text: "blip", offset: 5, duration: 0 }]);
    expect(result.segments[0].end).toBe(5.15);
  });

  it("never produces negative offsets", () => {
    const result = normalizeSegments([{ text: "x", offset: -100, duration: 1 }]);
    expect(result.segments[0].offset).toBe(0);
  });

  it("does not rescale a payload it already read correctly", () => {
    const result = normalizeSegments(MILLISECONDS, { videoDurationSeconds: 8 });
    expect(result.rescaled).toBe(false);
    expect(result.durationSeconds).toBeLessThan(8);
  });

  it("self-heals when the real video duration contradicts the guess", () => {
    // A single 4000-unit caption in a 6 second clip: with no gaps to measure,
    // the heuristic can only say "seconds" — the known duration corrects it.
    const ambiguous: RawTranscriptSegment[] = [
      { text: "one short clip", offset: 0, duration: 4000 },
    ];
    const result = normalizeSegments(ambiguous, { videoDurationSeconds: 6 });

    expect(result.rescaled).toBe(true);
    expect(result.unit).toBe("ms");
    expect(result.durationSeconds).toBe(4);
    expect(result.durationSeconds).toBeLessThanOrEqual(6);
  });
});

describe("rescaleIfImplausible", () => {
  it("returns null when timestamps already fit the video", () => {
    const { segments } = normalizeSegments(SECONDS);
    expect(rescaleIfImplausible(segments, 10)).toBeNull();
  });

  it("rescales segments that overshoot the player duration", () => {
    const segments = normalizeSegments(MILLISECONDS).segments.map((s) => ({
      ...s,
      offset: s.offset * 1000,
      end: s.end * 1000,
    }));
    const fixed = rescaleIfImplausible(segments, 8);
    expect(fixed).not.toBeNull();
    expect(fixed?.[1].offset).toBeCloseTo(2.2, 3);
  });

  it("is defensive about missing durations", () => {
    const { segments } = normalizeSegments(SECONDS);
    expect(rescaleIfImplausible(segments, 0)).toBeNull();
    expect(rescaleIfImplausible([], 100)).toBeNull();
  });
});
