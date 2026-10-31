import { describe, expect, it } from "vitest";

import { buildTranscriptContext, buildUserPrompt } from "@/lib/gemini/prompts";
import type { ChatTranscriptContext } from "@/lib/types";

const context: ChatTranscriptContext = {
  videoId: "v",
  title: "A video",
  durationSeconds: 20,
  text: "The flat payload is the source of truth.",
  segments: [{ i: 0, t: 0, d: 4, x: "A different caption line." }],
  language: "en",
};

describe("assistant prompt context", () => {
  it("prefers legitimate flat text for chat", () => {
    expect(buildTranscriptContext(context, "chat")).toContain("flat payload");
    expect(buildTranscriptContext(context, "chat")).not.toContain("different caption");
  });

  it("uses timed records for clip mode", () => {
    expect(buildTranscriptContext(context, "clips")).toContain("0:00.00–0:04.00");
    expect(buildTranscriptContext(context, "clips")).toContain("different caption");
  });

  it("falls back to segments when text is absent", () => {
    expect(buildTranscriptContext({ ...context, text: "" }, "chat")).toContain("different caption");
  });

  it("trims at a word boundary and says what happened", () => {
    const result = buildTranscriptContext({ ...context, text: "one two three four five six seven eight nine ten eleven twelve thirteen fourteen" }, "chat", 70);
    expect(result).toContain("Context note");
    expect(result).not.toContain("fourteen");
  });

  it("includes history and the user request in normal prompts", () => {
    const prompt = buildUserPrompt("summary", "What matters?", context, [{ role: "user", content: "Earlier" }]);
    expect(prompt).toContain("Earlier");
    expect(prompt).toContain("What matters?");
  });
});
