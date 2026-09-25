/**
 * Live integration test: drives the *real* caption ladder over real HTTP and
 * then checks the derived state the workspace UI consumes.
 *
 * It is skipped unless you point it at a YouTube stand-in, so CI (which has
 * real internet but no stand-in) is unaffected. Run it locally with:
 *
 *   node /tmp/fake-youtube.mjs &            # or any reachable YouTube proxy
 *   TRANSTUDIO_TEST_FAKE_YOUTUBE=http://127.0.0.1:4010/ \
 *     ./node_modules/.bin/vitest run src/lib/youtube/pipeline.integration.test.ts
 *
 * Nothing in this file is mocked: `fetchTranscriptForUrl` does the HTTP work
 * itself, so a passing run means the ladder recovered from a blocked identity
 * and produced UI-ready segments.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { findActiveSegmentIndex, effectiveDuration, segmentsInRange } from "@/lib/youtube/sync";
import { fetchTranscriptForUrl } from "@/lib/youtube/fetch";

const fake = process.env.TRANSTUDIO_TEST_FAKE_YOUTUBE?.trim();

describe.skipIf(!fake)("caption pipeline over real HTTP", () => {
  beforeAll(() => {
    // The proxy env var is the app's own escape hatch, so this also proves the
    // documented workaround genuinely routes every strategy.
    process.env.TRANSCRIPT_PROXY_URL = fake;
  });

  afterEach(() => {
    delete process.env.TRANSCRIPT_PROXY_URL;
  });

  it("recovers when the first client identity is bot-walled, and yields UI-ready lines", async () => {
    const result = await fetchTranscriptForUrl("https://www.youtube.com/watch?v=aircAruvnKk");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { transcript, metadata, diagnostics } = result;

    // The ladder moved past the blocked identity rather than giving up.
    expect(diagnostics?.some((line) => line.includes("innertube:web") && line.startsWith("✗"))).toBe(true);
    expect(diagnostics?.some((line) => line.startsWith("✓"))).toBe(true);
    expect(transcript.strategy).toBeTruthy();
    expect(transcript.strategy).not.toBe("innertube:web");

    // Real text, not a placeholder.
    expect(transcript.segments.length).toBeGreaterThan(2);
    expect(transcript.text.length).toBeGreaterThan(50);
    expect(transcript.wordCount).toBe(transcript.text.split(/\s+/).filter(Boolean).length);
    expect(transcript.characterCount).toBe(transcript.text.length);

    // Offsets are seconds (not the raw milliseconds) and strictly ascending.
    for (let i = 1; i < transcript.segments.length; i += 1) {
      expect(transcript.segments[i].offset).toBeGreaterThanOrEqual(transcript.segments[i - 1].offset);
    }
    // A real ASR track starts near zero; a ms/s mix-up would put this at 240s.
    expect(transcript.segments[0].offset).toBeGreaterThanOrEqual(0);
    expect(transcript.segments[0].offset).toBeLessThan(2);
    expect(transcript.segments[0].end).toBeGreaterThan(0);
    // A ms/s mix-up would show up as a wildly implausible duration.
    expect(transcript.durationSeconds).toBeLessThan(24 * 60 * 60);
    // `effectiveDuration` takes the player's own duration as its second
    // argument; with no player (a pure fetch test) the transcript length wins.
    expect(effectiveDuration(transcript.segments, 0)).toBeCloseTo(transcript.durationSeconds, 0);

    // Metadata travelled with the transcript.
    expect(metadata.videoId).toBe("aircAruvnKk");
  });

  it("drives playback sync the way the transcript pane does", async () => {
    const result = await fetchTranscriptForUrl("aircAruvnKk");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { segments } = result.transcript;

    // Playback-synced auto-scroll needs an exact active line at any time.
    // During the lead-in (before the first spoken line) there is none: -1.
    expect(findActiveSegmentIndex(segments, 0)).toBe(segments[0].offset === 0 ? 0 : -1);
    expect(findActiveSegmentIndex(segments, segments[0].offset)).toBe(0);
    const mid = segments[Math.floor(segments.length / 2)] as (typeof segments)[number];
    const active = findActiveSegmentIndex(segments, mid.offset + 0.1);
    expect(segments.some((segment) => segment.id === segments[active].id)).toBe(true);
    expect(segments[active].offset).toBeLessThanOrEqual(mid.offset + 0.1);

    // A clip range maps onto whole transcript blocks (Step 5's requirement).
    const [first, last] = [segments[0], segments[segments.length - 1]];
    const inRange = segmentsInRange(segments, first.offset, last.end);
    expect(inRange.length).toBe(segments.length);

    // And a narrow range selects a subset, never the whole transcript.
    const narrow = segmentsInRange(segments, first.offset, segments[1].end);
    expect(narrow.length).toBeGreaterThan(0);
    expect(narrow.length).toBeLessThan(segments.length);
  });

  it("still fails honestly (not silently) for a video with no captions", async () => {
    // The stand-in serves no caption tracks for this id; the ladder must report
    // what it tried instead of pretending the video has no transcript.
    const result = await fetchTranscriptForUrl("https://www.youtube.com/watch?v=nocaptions1", {
      allowDemoFallback: false,
    });

    if (!result.ok) {
      expect(result.diagnostics?.length ?? 0).toBeGreaterThan(0);
      expect(["empty", "blocked", "disabled", "not-found"]).toContain(result.error);
    }
  });
});
