import { describe, expect, it } from "vitest";

import { extractJsonCandidates, parseClipPlan } from "@/lib/clips/parse";

describe("clip response parsing", () => {
  it("accepts a fenced plan with prose around it", () => {
    const plan = parseClipPlan(`Here are the moments:\n\n\`\`\`json\n{"clips":[{"title":"Hook","start_time":1,"end_time":8,"transcript_text":"A quote","viral_score":91}]}\n\`\`\``);
    expect(plan.clips).toHaveLength(1);
    expect(plan.clips[0].viral_score).toBe(91);
  });

  it("handles braces inside quoted transcript text", () => {
    const candidates = extractJsonCandidates('{"clips":[{"title":"A {shape}","start_time":0,"end_time":4,"transcript_text":"Use {braces}","viral_score":4}]}');
    expect(candidates).toHaveLength(1);
    expect(JSON.parse(candidates[0]).clips[0].title).toBe("A {shape}");
  });

  it("drops unusable clips and clamps model scores", () => {
    const plan = parseClipPlan('{"clips":[{"title":"","start_time":"2","end_time":"8","transcript_text":" quote ","viral_score":140},{"title":"bad","start_time":1,"end_time":2,"transcript_text":"","viral_score":20}]}');
    expect(plan.clips).toHaveLength(1);
    expect(plan.clips[0].viral_score).toBe(100);
    expect(plan.clips[0].transcript_text).toBe("quote");
  });

  it("fails clearly when there is no JSON plan", () => {
    expect(() => parseClipPlan("I could not find any clips.")).toThrow("no usable clip plan");
  });
});

describe("clip post extras", () => {
  it("keeps hook line, caption and normalises hashtags", () => {
    const plan = parseClipPlan(
      JSON.stringify({
        clips: [
          {
            title: "Hook",
            start_time: 1,
            end_time: 31,
            transcript_text: "Nobody tells you this",
            viral_score: 88,
            hook_line: "Nobody tells you this",
            caption: "The truth about morning routines.",
            hashtags: "#Morning, routine ##habits #morning",
          },
        ],
      }),
    );
    expect(plan.clips[0]).toMatchObject({
      hook_line: "Nobody tells you this",
      caption: "The truth about morning routines.",
      hashtags: ["#Morning", "#routine", "#habits", "#morning"],
    });
  });

  it("leaves the extras out when the model omits them", () => {
    const plan = parseClipPlan(
      JSON.stringify({ clips: [{ title: "x", start_time: 0, end_time: 20, transcript_text: "y", viral_score: 5 }] }),
    );
    expect(plan.clips[0]).not.toHaveProperty("hashtags");
    expect(plan.clips[0]).not.toHaveProperty("caption");
  });
});
