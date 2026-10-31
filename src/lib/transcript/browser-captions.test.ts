import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchCaptionsInBrowser } from "@/lib/transcript/browser-captions";

const JSON3 = JSON.stringify({
  wireMagic: "pb3",
  events: [{ tStartMs: 0, dDurationMs: 2_000, segs: [{ utf8: "Visitor caption." }] }],
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("visitor browser caption routes", () => {
  it("uses a browser player response to discover signed caption URLs", async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("youtubei/v1/player")) {
        expect(init?.method).toBe("POST");
        return new Response(
          JSON.stringify({
            captions: {
              playerCaptionsTracklistRenderer: {
                captionTracks: [
                  {
                    baseUrl: "https://www.youtube.com/api/timedtext?lang=en&v=visitor00001",
                    languageCode: "en",
                  },
                ],
              },
            },
          }),
          { status: 200 },
        );
      }
      expect(url).toContain("api/timedtext");
      expect(url).toContain("fmt=json3");
      return new Response(JSON3, { status: 200 });
    });
    vi.stubGlobal("fetch", fetch);

    const result = await fetchCaptionsInBrowser("visitor00001", { lang: "en", timeoutMs: 100 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.language).toBe("en");
      expect(result.segments[0].text).toBe("Visitor caption.");
      expect(result.attempts[0]).toContain("browser · player");
    }
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("keeps the unsigned timedtext route when the player CORS request is refused", async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("youtubei/v1/player")) {
        throw new TypeError("Failed to fetch");
      }
      return new Response(JSON3, { status: 200 });
    });
    vi.stubGlobal("fetch", fetch);

    const result = await fetchCaptionsInBrowser("visitor00001", { lang: "en", timeoutMs: 100 });

    expect(result.ok).toBe(true);
    expect(result.attempts.some((attempt) => attempt.includes("browser · player"))).toBe(true);
    expect(result.attempts.some((attempt) => attempt.includes("en (auto-generated allowed)"))).toBe(true);
  });
});
