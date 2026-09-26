import { describe, expect, it } from "vitest";

import { rankGeminiModels } from "@/lib/gemini/models";

const listed = [
  "models/gemini-2.5-flash",
  "models/gemini-3.5-flash",
  "models/gemini-3.5-flash-lite",
  "models/gemini-3.8-flash",
  "models/gemini-3.8-flash-preview-tts",
  "models/gemini-3.8-pro",
  "models/gemini-flash-latest",
  "models/gemini-flash-lite-latest",
  "models/gemini-3.8-flash-live",
  "models/gemini-embedding-001",
  "models/gemini-3.8-flash-image",
  "models/gemma-3-27b-it",
].map((name) => ({ name, supportedActions: ["generateContent"] }));

describe("rankGeminiModels", () => {
  it("puts the newest stable Flash first and a Flash-Lite right behind it", () => {
    const ranked = rankGeminiModels(listed);
    expect(ranked[0]).toBe("gemini-3.8-flash");
    expect(ranked[1]).toBe("gemini-3.5-flash-lite");
  });

  it("skips Pro (not free), TTS, live, image, embedding and Gemma models", () => {
    const ranked = rankGeminiModels(listed);
    for (const excluded of ["pro", "tts", "live", "image", "embedding", "gemma"]) {
      expect(ranked.some((id) => id.includes(excluded))).toBe(false);
    }
  });

  it("keeps aliases after the stable versions of their family", () => {
    const ranked = rankGeminiModels(listed);
    expect(ranked.indexOf("gemini-flash-latest")).toBeGreaterThan(ranked.indexOf("gemini-2.5-flash"));
  });

  it("ignores models that cannot generate content", () => {
    expect(rankGeminiModels([{ name: "models/gemini-9-flash", supportedActions: ["embedContent"] }])).toEqual([]);
  });
});
