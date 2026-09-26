import { describe, expect, it } from "vitest";

import { providerOrder } from "@/lib/ai/providers";
import { classifyGroqStatus, groqPromptBudgetCharacters, planGroqModels } from "@/lib/ai/groq";

describe("providerOrder", () => {
  it("auto leads with Gemini and keeps Groq as the backup", () => {
    expect(providerOrder("auto", { gemini: true, groq: true })).toEqual(["gemini", "groq"]);
  });
  it("a manual Groq choice leads with Groq but still falls back", () => {
    expect(providerOrder("groq", { gemini: true, groq: true })).toEqual(["groq", "gemini"]);
  });
  it("skips providers without a key", () => {
    expect(providerOrder("groq", { gemini: true, groq: false })).toEqual(["gemini"]);
    expect(providerOrder("auto", { gemini: false, groq: false })).toEqual([]);
  });
});

describe("Groq sizing", () => {
  it("only plans models whose free-tier TPM fits the request", () => {
    expect(planGroqModels(2_000, 1_500)).toContain("openai/gpt-oss-120b");
    const big = planGroqModels(20_000, 3_400);
    expect(big).toEqual(["meta-llama/llama-4-scout-17b-16e-instruct"]);
    expect(planGroqModels(60_000, 3_400)).toEqual([]);
  });
  it("drops models Groq no longer lists", () => {
    const live = new Set(["llama-3.3-70b-versatile"]);
    expect(planGroqModels(2_000, 1_000, live)).toEqual(["llama-3.3-70b-versatile"]);
  });
  it("gives a positive trim budget for the largest model", () => {
    expect(groqPromptBudgetCharacters(3_400)).toBeGreaterThan(50_000);
  });
  it("classifies HTTP failures without leaking provider text", () => {
    expect(classifyGroqStatus(429).kind).toBe("quota");
    expect(classifyGroqStatus(413).kind).toBe("too-large");
    expect(classifyGroqStatus(401).kind).toBe("invalid-key");
    expect(classifyGroqStatus(503, "{\"error\":\"x\"}").message).not.toContain("{");
  });
});
