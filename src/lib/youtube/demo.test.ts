import { describe, expect, it } from "vitest";

import {
  buildDemoSegments,
  buildDemoTranscript,
  DEMO_SEGMENT_COUNT,
} from "@/lib/youtube/demo";
import { findActiveSegmentIndex } from "@/lib/youtube/sync";

describe("buildDemoSegments", () => {
  const segments = buildDemoSegments();

  it("produces a realistic number of caption lines", () => {
    expect(segments.length).toBeGreaterThan(20);
    expect(DEMO_SEGMENT_COUNT).toBe(segments.length);
  });

  it("never emits an empty line", () => {
    for (const segment of segments) {
      expect(segment.text.trim().length).toBeGreaterThan(0);
    }
  });

  it("advances monotonically with no overlaps or negative gaps", () => {
    let previousEnd = -1;
    for (const segment of segments) {
      expect(segment.offset).toBeGreaterThan(previousEnd);
      expect(segment.duration).toBeGreaterThan(0);
      previousEnd = segment.offset + segment.duration;
    }
  });

  it("derives duration from word count (~2.6 words/second)", () => {
    for (const segment of segments.slice(0, 5)) {
      const words = segment.text.split(/\s+/).length;
      expect(segment.duration).toBeGreaterThan(words / 4);
      expect(segment.duration).toBeLessThan(words / 1.5);
    }
  });

  it("splits a custom script on sentence boundaries", () => {
    const custom = buildDemoSegments("One. Two! Three?");
    expect(custom.map((segment) => segment.text)).toEqual(["One.", "Two!", "Three?"]);
  });
});

describe("buildDemoTranscript", () => {
  const transcript = buildDemoTranscript();

  it("is a complete, self-consistent payload", () => {
    expect(transcript.source).toBe("demo");
    expect(transcript.videoId).toBe("transtudio-demo");
    expect(transcript.segments.length).toBeGreaterThan(20);
    expect(transcript.wordCount).toBeGreaterThan(150);
    expect(transcript.characterCount).toBe(transcript.text.length);
    expect(transcript.durationSeconds).toBeGreaterThan(60);
  });

  it("is detected as seconds (not milliseconds) by the normalizer", () => {
    // The demo exercises the same normalisation path as real captions.
    expect(transcript.segments[0].offset).toBeLessThan(5);
    expect(transcript.segments[0].end).toBeGreaterThan(transcript.segments[0].offset);
  });

  it("has sequential ids matching their array positions", () => {
    transcript.segments.forEach((segment, index) => {
      expect(segment.id).toBe(index);
    });
  });

  it("describes the product, so the demo doubles as onboarding", () => {
    expect(transcript.text).toMatch(/TranStudio/);
    expect(transcript.text).toMatch(/transcript/i);
  });

  it("produces playable, seekable content for the sync engine", () => {
    // Midway through the demo should land on a real line, not -1.
    const midway = transcript.durationSeconds / 2;
    const index = findActiveSegmentIndex(transcript.segments, midway);
    expect(index).toBeGreaterThan(0);
    expect(index).toBeLessThan(transcript.segments.length);
  });
});
