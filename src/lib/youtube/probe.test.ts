import { describe, expect, it } from "vitest";

import { classifyTranscriptError } from "@/lib/youtube/probe";

/** Recreate the library's error class names without importing its runtime. */
function errorNamed(name: string, message = "boom") {
  const error = new Error(message);
  error.name = name;
  return error;
}

describe("classifyTranscriptError", () => {
  it("maps rate limiting and suggests a proxy", () => {
    const result = classifyTranscriptError(
      errorNamed("YoutubeTranscriptTooManyRequestError"),
    );
    expect(result.code).toBe("too-many-requests");
    expect(result.hint).toContain("TRANSCRIPT_PROXY_URL");
  });

  it("maps disabled captions", () => {
    expect(classifyTranscriptError(errorNamed("YoutubeTranscriptDisabledError")).code).toBe(
      "disabled",
    );
  });

  it("maps missing/empty caption tracks", () => {
    expect(classifyTranscriptError(errorNamed("YoutubeTranscriptNotAvailableError")).code).toBe(
      "empty",
    );
    expect(
      classifyTranscriptError(errorNamed("YoutubeTranscriptNotAvailableLanguageError")).code,
    ).toBe("empty");
  });

  it("maps unavailable videos", () => {
    expect(
      classifyTranscriptError(errorNamed("YoutubeTranscriptVideoUnavailableError")).code,
    ).toBe("not-found");
  });

  it("recognises a blocked network as such (sandbox / CI case)", () => {
    const result = classifyTranscriptError(
      errorNamed("TypeError", "fetch failed: getaddrinfo ENOTFOUND www.youtube.com"),
    );
    expect(result.code).toBe("blocked");
    expect(result.hint).toMatch(/sandbox|deploy host/i);
  });

  it("falls back to a generic classification", () => {
    expect(classifyTranscriptError(errorNamed("WeirdError", "kaboom")).code).toBe("unknown");
    expect(classifyTranscriptError("a string").code).toBe("unknown");
  });
});
