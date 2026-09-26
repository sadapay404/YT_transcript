import { afterEach, describe, expect, it } from "vitest";

import {
  classifyGeminiError,
  extractRecommendedModel,
  getGeminiModel,
  modelCandidates,
  resetDiscoveredGeminiModel,
  runWithModelFallback,
} from "@/lib/gemini/client";

afterEach(() => {
  resetDiscoveredGeminiModel();
  delete process.env.GEMINI_MODEL;
});

describe("extractRecommendedModel", () => {
  it("reads the replacement Google names in its own error", () => {
    const message =
      "models/gemini-2.5-flash is no longer available to new users. Please update your code to use models/gemini-3.8-flash";
    expect(extractRecommendedModel(message)).toBe("gemini-3.8-flash");
  });

  it("returns null when Google does not name a replacement", () => {
    expect(extractRecommendedModel("model not found")).toBeNull();
  });
});

describe("classifyGeminiError", () => {
  it("treats a retired model as model-unavailable, including not_found", () => {
    const failure = classifyGeminiError(
      new Error('{"status":"NOT_FOUND"} gemini-2.5-flash is no longer available. use models/gemini-3.8-flash'),
    );
    expect(failure.kind).toBe("model-unavailable");
    expect(failure.message).toContain("gemini-3.8-flash");
  });

  it("does not disguise a quota error as a model problem", () => {
    expect(classifyGeminiError(new Error("RESOURCE_EXHAUSTED: quota")).kind).toBe("quota");
  });
});

describe("runWithModelFallback", () => {
  it("pivots to the model named in Google's error, remembers it, and does not retry quota", async () => {
    const calls: string[] = [];
    const retired = new Error(
      "gemini-2.5-flash is no longer available to new users. Please update your code to use models/gemini-3.8-flash",
    );

    const switched = await runWithModelFallback(
      async (model) => {
        calls.push(model);
        if (model === "gemini-2.5-flash") throw retired;
        return "pong";
      },
      { candidates: ["gemini-2.5-flash", "gemini-2.5-flash-lite"] },
    );

    expect(switched.ok).toBe(true);
    if (!switched.ok) return;
    expect(switched.model).toBe("gemini-3.8-flash");
    expect(calls).toEqual(["gemini-2.5-flash", "gemini-3.8-flash"]);
    expect(getGeminiModel()).toBe("gemini-3.8-flash");
    expect(modelCandidates()[0]).toBe("gemini-3.8-flash");

    resetDiscoveredGeminiModel();
    const quota = await runWithModelFallback(
      async () => {
        throw new Error("429 resource_exhausted");
      },
      { candidates: ["gemini-2.5-flash", "gemini-2.5-flash-lite"] },
    );
    expect(quota.ok).toBe(false);
    if (quota.ok) return;
    expect(quota.failure.kind).toBe("quota");
    expect(quota.attempts).toHaveLength(1);
  });
});
