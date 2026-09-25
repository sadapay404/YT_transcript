import { describe, expect, it } from "vitest";

import {
  clamp,
  csvCell,
  formatDuration,
  formatTimestamp,
  normalizeCaption,
  parseTimeParam,
  parseYouTubeUrl,
  readingMinutes,
  round,
  shouldPullIntoView,
  slugify,
  toSrtTimecode,
  toVttTimecode,
  truncate,
  youtubeThumbnail,
} from "@/lib/utils";

describe("parseYouTubeUrl", () => {
  it("parses a standard watch URL and strips tracking params", () => {
    expect(
      parseYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123&t=42"),
    ).toEqual({
      videoId: "dQw4w9WgXcQ",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      startAt: 42,
    });
  });

  it("parses every common URL flavour", () => {
    const cases: Array<[string, string]> = [
      ["https://youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
      ["https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
      ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
      ["https://www.youtube.com/live/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
      ["https://m.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
      ["https://music.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
      ["https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
      ["dQw4w9WgXcQ", "dQw4w9WgXcQ"],
      ["  dQw4w9WgXcQ  ", "dQw4w9WgXcQ"],
    ];
    for (const [input, expected] of cases) {
      expect(parseYouTubeUrl(input)?.videoId, input).toBe(expected);
    }
  });

  it("understands human timestamps", () => {
    expect(parseYouTubeUrl("https://youtu.be/dQw4w9WgXcQ?t=1m30s")?.startAt).toBe(90);
    expect(parseYouTubeUrl("https://youtu.be/dQw4w9WgXcQ?t=90s")?.startAt).toBe(90);
    expect(parseYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&start=125")?.startAt).toBe(125);
  });

  it("rejects junk, non-YouTube hosts and malformed ids", () => {
    for (const input of [
      "",
      "   ",
      "not a url",
      "https://vimeo.com/123456",
      "https://www.youtube.com/watch?v=tooshort",
      "https://www.youtube.com/",
      "https://www.youtube.com/watch",
      "https://example.com/watch?v=dQw4w9WgXcQ",
    ]) {
      expect(parseYouTubeUrl(input), input).toBeNull();
    }
  });
});

describe("parseTimeParam", () => {
  it("parses raw seconds and h/m/s notation", () => {
    expect(parseTimeParam("90")).toBe(90);
    expect(parseTimeParam("1h2m3s")).toBe(3723);
    expect(parseTimeParam("2m")).toBe(120);
    expect(parseTimeParam("0")).toBeUndefined();
    expect(parseTimeParam("abc")).toBeUndefined();
    expect(parseTimeParam(null)).toBeUndefined();
  });
});

describe("timestamp formatting", () => {
  it("formats mm:ss and h:mm:ss", () => {
    expect(formatTimestamp(0)).toBe("0:00");
    expect(formatTimestamp(65)).toBe("1:05");
    expect(formatTimestamp(3725)).toBe("1:02:05");
    expect(formatTimestamp(3725, true)).toBe("1:02:05");
    expect(formatTimestamp(-5)).toBe("0:00");
    expect(formatTimestamp(Number.NaN)).toBe("0:00");
  });

  it("formats SubRip and WebVTT timecodes", () => {
    expect(toSrtTimecode(3725.25)).toBe("01:02:05,250");
    expect(toVttTimecode(3725.25)).toBe("01:02:05.250");
    expect(toSrtTimecode(0)).toBe("00:00:00,000");
  });

  it("formats human durations", () => {
    expect(formatDuration(0)).toBe("—");
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(150)).toBe("2m 30s");
    expect(formatDuration(3900)).toBe("1h 05m");
  });

  it("estimates reading time", () => {
    expect(readingMinutes(0)).toBe(1);
    expect(readingMinutes(660)).toBe(3);
  });
});

describe("text helpers", () => {
  it("normalises caption whitespace", () => {
    expect(normalizeCaption("  a\n\nb   c  ")).toBe("a b c");
    expect(normalizeCaption("zero\u200bwidth")).toBe("zerowidth");
  });

  it("truncates with an ellipsis", () => {
    expect(truncate("abcdef", 10)).toBe("abcdef");
    expect(truncate("abcdef", 4)).toBe("abc…");
  });

  it("slugifies titles", () => {
    expect(slugify("How to Ship: Fast! (2026)")).toBe("how-to-ship-fast-2026");
    expect(slugify("   ")).toBe("transcript");
    expect(slugify("!!!")).toBe("transcript");
  });

  it("escapes CSV cells", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell(12)).toBe("12");
  });
});

describe("misc helpers", () => {
  it("clamps and rounds", () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-5, 0, 3)).toBe(0);
    expect(round(1.005, 2)).toBe(1.01);
  });

  it("builds thumbnails", () => {
    expect(youtubeThumbnail("dQw4w9WgXcQ")).toBe(
      "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    );
    expect(youtubeThumbnail("dQw4w9WgXcQ", "max")).toContain("maxresdefault");
  });
});

describe("shouldPullIntoView", () => {
  /**
   * The home page stacks the landing above the studio, so a link pasted in the
   * hero can mount the studio far off-screen. This decides whether to bring it
   * into view — the bug it guards against is the studio never scrolling at all
   * (the effect fired while the studio was still rendering null).
   */
  const viewport = 900;

  it("pulls the studio up when it mounted below the fold", () => {
    expect(shouldPullIntoView({ top: 1150, bottom: 1500 }, viewport)).toBe(true);
    expect(shouldPullIntoView({ top: 3000, bottom: 3400 }, viewport)).toBe(true);
  });

  it("pulls the studio up when it mounted above the viewport", () => {
    expect(shouldPullIntoView({ top: -600, bottom: -100 }, viewport)).toBe(true);
    expect(shouldPullIntoView({ top: -400, bottom: -1 }, viewport)).toBe(true);
  });

  it("leaves an already-visible studio where it is", () => {
    expect(shouldPullIntoView({ top: 100, bottom: 800 }, viewport)).toBe(false);
    expect(shouldPullIntoView({ top: 0, bottom: 900 }, viewport)).toBe(false);
    // Straddles the 60% line but is genuinely on screen.
    expect(shouldPullIntoView({ top: 500, bottom: 1600 }, viewport)).toBe(false);
  });

  it("does nothing without a measurable viewport", () => {
    expect(shouldPullIntoView({ top: 1000, bottom: 1400 }, 0)).toBe(false);
    expect(shouldPullIntoView({ top: 1000, bottom: 1400 }, -1)).toBe(false);
    expect(shouldPullIntoView({ top: 1000, bottom: 1400 }, Number.NaN)).toBe(false);
    expect(shouldPullIntoView({ top: Number.NaN, bottom: 10 }, viewport)).toBe(false);
  });
});
