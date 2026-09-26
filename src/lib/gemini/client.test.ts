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
    // Model names and env-var instructions never reach the reader.
    expect(failure.message).not.toContain("gemini-3.8-flash");
    expect(`${failure.message} ${failure.remedy}`).not.toContain("GEMINI_MODEL");
  });

  it("turns Google's high-demand 503 into a friendly recoverable failure", () => {
    const failure = classifyGeminiError(
      new Error(
        '{"error":{"code":503,"message":"This model is currently experiencing high demand.","status":"UNAVAILABLE"}}',
      ),
    );
    expect(failure.kind).toBe("temporarily-unavailable");
    expect(failure.message).toBe("Gemini is temporarily busy right now.");
    expect(failure.message).not.toContain("UNAVAILABLE");
    expect(failure.retryable).toBe(true);
  });

  it("does not disguise a quota error as a model problem", () => {
    expect(classifyGeminiError(new Error("RESOURCE_EXHAUSTED: quota")).kind).toBe("quota");
  });
});

describe("runWithModelFallback", () => {
  it("keeps an explicit pin first until it is refused, then keeps it as a fallback", async () => {
    process.env.GEMINI_MODEL = "gemini-pinned";
    expect(modelCandidates()[0]).toBe("gemini-pinned");

    const result = await runWithModelFallback(
      async (model) => {
        if (model === "gemini-pinned") {
          throw new Error("model not found; use models/gemini-3.8-flash instead");
        }
        return "pong";
      },
      { candidates: modelCandidates() },
    );

    expect(result.ok).toBe(true);
    expect(modelCandidates()[0]).toBe("gemini-3.8-flash");
    expect(modelCandidates()).toContain("gemini-pinned");
  });

  it("retries one temporary 503, then falls back without an unbounded loop", async () => {
    const calls: string[] = [];
    const result = await runWithModelFallback(
      async (model) => {
        calls.push(model);
        if (model === "primary") {
          throw new Error('{"code":503,"status":"UNAVAILABLE","message":"high demand"}');
        }
        return "pong";
      },
      { candidates: ["primary", "fallback"], transientRetryDelayMs: 0 },
    );

    expect(result.ok).toBe(true);
    expect(calls).toEqual(["primary", "primary", "fallback"]);
  });

  it("pivots to the model named in Google's error, remembers it, and bounds quota retries", async () => {
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
    // Quotas are per model: one other model is tried, then it stops.
    expect(quota.attempts).toHaveLength(2);
  });

  it("answers from the next model when the first hits its per-model quota", async () => {
    const calls: string[] = [];
    const result = await runWithModelFallback(
      async (model) => {
        calls.push(model);
        if (model === "flash") throw new Error("429 RESOURCE_EXHAUSTED quota");
        return "pong";
      },
      { candidates: ["flash", "flash-lite"] },
    );
    expect(result.ok).toBe(true);
    expect(calls).toEqual(["flash", "flash-lite"]);
    // The cooled model moves to the back for the next request.
    expect(modelCandidates({ discovered: ["flash", "flash-lite"] }).indexOf("flash")).toBeGreaterThan(
      modelCandidates({ discovered: ["flash", "flash-lite"] }).indexOf("flash-lite"),
    );
  });

  it("puts a valid client hint first and ignores junk hints", () => {
    expect(modelCandidates({ preferred: ["gemini-3.5-flash-lite"] })[0]).toBe("gemini-3.5-flash-lite");
    expect(modelCandidates({ preferred: ["bad model; rm -rf"] })).not.toContain("bad model; rm -rf");
  });

  it("stops starting new attempts after the deadline", async () => {
    const calls: string[] = [];
    const result = await runWithModelFallback(
      async (model) => {
        calls.push(model);
        return "pong";
      },
      { candidates: ["a", "b"], deadline: Date.now() - 1 },
    );
    expect(result.ok).toBe(false);
    expect(calls).toEqual([]);
  });
});
