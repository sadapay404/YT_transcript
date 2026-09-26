import { describe, expect, it } from "vitest";

import {
  PasteParseError,
  describePasteFormat,
  parsePastedTranscript,
  parseTimecode,
} from "@/lib/transcript/paste";

describe("parseTimecode", () => {
  it("reads SRT commas, VTT dots, and bare minutes", () => {
    expect(parseTimecode("00:00:03,000")).toBe(3);
    expect(parseTimecode("01:02:03.250")).toBe(3723.25);
    expect(parseTimecode("1:02")).toBe(62);
    expect(parseTimecode("45")).toBe(45);
    expect(parseTimecode("not a time")).toBeNull();
  });
});

describe("parsePastedTranscript", () => {
  it("keeps a real SRT cue end and does not stretch it to the next cue", () => {
    const parsed = parsePastedTranscript(
      "1\n00:00:01,000 --> 00:00:02,000\nhello there\n\n2\n00:00:10,000 --> 00:00:12,500\nsecond line\n",
    );
    expect(parsed.format).toBe("srt");
    expect(parsed.timed).toBe(true);
    expect(parsed.segments[0].offset).toBe(1);
    expect(parsed.segments[0].duration).toBe(1);
    expect(parsed.segments[0].end).toBe(2);
    expect(parsed.segments[1].duration).toBe(2.5);
    expect(parsed.segments[1].end).toBe(12.5);
  });

  it("reads WebVTT and strips cue tags without inserting spaces", () => {
    const parsed = parsePastedTranscript(
      "WEBVTT\n\n00:00:01.000 --> 00:00:04.000\n<c>pricing</c> matters\n",
    );
    expect(parsed.format).toBe("vtt");
    expect(parsed.segments[0].text).toBe("pricing matters");
    expect(describePasteFormat(parsed.format)).toBe("WebVTT (.vtt)");
  });

  it("fills only missing panel durations, and estimates a window for the final cue", () => {
    const parsed = parsePastedTranscript("0:03\nhello there\n\n0:07\nis how attention works\n");
    expect(parsed.format).toBe("youtube-panel");
    expect(parsed.segments).toHaveLength(2);
    expect(parsed.segments[0].offset).toBe(3);
    expect(parsed.segments[0].end).toBe(7);
    expect(parsed.segments[0].duration).toBe(4);
    expect(parsed.segments[1].duration).toBeGreaterThan(0);
    expect(parsed.segments[1].end).toBeGreaterThan(7);
  });

  it("does not treat a stray timestamp as a panel transcript", () => {
    const parsed = parsePastedTranscript("0:00\nthis is just a note, not a transcript panel");
    expect(parsed.format).toBe("plain");
    expect(parsed.timed).toBe(false);
  });

  it("requires a colon before an inline stamp, so bare numbers stay prose", () => {
    const parsed = parsePastedTranscript(
      "We tried 30 variants.\n[00:12] the hook lands\n00:18 - and the second beat follows",
    );
    expect(parsed.format).toBe("inline");
    expect(parsed.segments.map((segment) => segment.offset)).toEqual([12, 18]);
    expect(parsed.segments[0].text).toContain("hook");
    expect(parsed.text).not.toMatch(/^30/);
  });

  it("accepts plain prose honestly, with no invented timeline", () => {
    const parsed = parsePastedTranscript("Just a paragraph about pricing.\n\nAnd a second one.");
    expect(parsed.format).toBe("plain");
    expect(parsed.timed).toBe(false);
    expect(parsed.segments.every((segment) => segment.offset === 0)).toBe(true);
    expect(parsed.warnings.join(" ")).toMatch(/seeking is off/i);
    expect(parsed.warnings.join(" ")).not.toMatch(/no captions/i);
  });

  it("rejects an empty paste", () => {
    expect(() => parsePastedTranscript("   ")).toThrow(PasteParseError);
  });
});
