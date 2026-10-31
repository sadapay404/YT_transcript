import { describe, expect, it } from "vitest";

import { buildClipsCsv, buildClipsSrt, clipPostText, rankClips } from "@/lib/export/clips";
import type { ViralClip } from "@/lib/types";

const color = { id: "x", label: "x", bg: "", bgActive: "", border: "", accent: "", hex: "#10b981", glow: "" };
const clip = (over: Partial<ViralClip>): ViralClip => ({
  title: "A clip",
  start_time: 0,
  end_time: 30,
  transcript_text: "words",
  viral_score: 50,
  id: "clip-1",
  index: 0,
  color,
  start: 0,
  end: 30,
  hookType: "hook",
  segmentIds: [0],
  segmentStartIndex: 0,
  segmentEndIndex: 1,
  ...over,
});

const clips = [
  clip({ id: "a", title: "Early", start: 10, end: 40, viral_score: 60 }),
  clip({
    id: "b",
    title: "=HYPERLINK(\"x\")",
    start: 100,
    end: 130,
    viral_score: 91,
    hook_line: "Nobody tells you this",
    caption: "The truth, finally.",
    hashtags: ["#truth", "#shorts"],
  }),
];

describe("clip exports", () => {
  it("ranks by hook score", () => {
    expect(rankClips(clips).map((c) => c.id)).toEqual(["b", "a"]);
  });

  it("writes a spreadsheet-safe CSV with links", () => {
    const csv = buildClipsCsv(clips, "dQw4w9WgXcQ");
    expect(csv.startsWith("\uFEFFrank,title")).toBe(true);
    expect(csv).toContain("https://youtu.be/dQw4w9WgXcQ?t=100");
    expect(csv).toContain("#truth #shorts");
    // Formula injection is neutralised.
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
  });

  it("writes one SRT cue per clip, in timeline order, labelled with rank", () => {
    const srt = buildClipsSrt(clips);
    expect(srt).toContain("00:00:10,000 --> 00:00:40,000");
    expect(srt.indexOf("Early")).toBeLessThan(srt.indexOf("HYPERLINK"));
    expect(srt).toContain("#1 =HYPERLINK");
    expect(srt).toContain("“Nobody tells you this”");
  });

  it("builds post text from caption and hashtags", () => {
    expect(clipPostText(clips[1])).toBe("The truth, finally.\n\n#truth #shorts");
    expect(clipPostText(clips[0])).toBe("Early");
  });
});
