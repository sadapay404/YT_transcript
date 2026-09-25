import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  fetchCaptionsDirect,
  pickTrack,
  describeDiagnostics,
} from "@/lib/youtube/captions";
import { withCaptionFormat } from "@/lib/youtube/clients";

/* ───────────────────────────── fixtures ─────────────────────────────────── */

function playerResponse(options: {
  status?: string;
  reason?: string;
  tracks?: Array<{ lang: string; kind?: string; name?: string }>;
}) {
  const { status = "OK", reason, tracks = [] } = options;
  return {
    playabilityStatus: reason ? { status, reason } : { status },
    videoDetails: {
      videoId: "dQw4w9WgXcQ",
      title: "A real video",
      author: "Some channel",
      lengthSeconds: "212",
    },
    ...(tracks.length > 0
      ? {
          captions: {
            playerCaptionsTracklistRenderer: {
              captionTracks: tracks.map((track) => ({
                baseUrl: `https://www.youtube.com/api/timedtext?v=dQw4w9WgXcQ&lang=${track.lang}${
                  track.kind ? `&kind=${track.kind}` : ""
                }&expire=1767225600&signature=Cg0KC2VLZzR2OE5mZ0FZ&caps=asr`,
                languageCode: track.lang,
                ...(track.kind ? { kind: track.kind } : {}),
                name: { simpleText: track.name ?? track.lang.toUpperCase() },
              })),
            },
          },
        }
      : {}),
  };
}

const JSON3_BODY = JSON.stringify({
  wireMagic: "pb3",
  events: [
    { tStartMs: 240, dDurationMs: 2000, segs: [{ utf8: "Hello and welcome " }, { utf8: "to the show." }] },
    { tStartMs: 3240, dDurationMs: 1500, segs: [{ utf8: "Today we talk about pricing." }] },
    { tStartMs: 5200, dDurationMs: 2000, segs: [{ utf8: "And why it matters." }] },
  ],
});

const CLASSIC_XML =
  '<?xml version="1.0"?><transcript><text start="0" dur="2.2">Hello and welcome</text>' +
  '<text start="2.2" dur="1.8">to the show.</text></transcript>';

/** A fetch stub driven by a routing function. */
function mockFetch(route: (url: string, init?: RequestInit) => Response | null) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const response = route(url, init);
    if (!response) throw new Error(`fetch failed: no route for ${url}`);
    return response;
  });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function text(body: string, status = 200) {
  return new Response(body, { status, headers: { "content-type": "text/plain" } });
}

/** Which Innertube client a request used, straight from its identity header. */
const CLIENT_IDS: Record<string, string> = {
  "1": "web",
  "28": "android-vr",
  "5": "ios",
  "3": "android",
  "56": "web-embedded",
};

function clientOf(init?: RequestInit): string {
  const headers = (init?.headers ?? {}) as Record<string, string>;
  return CLIENT_IDS[headers["x-youtube-client-name"] ?? ""] ?? "unknown";
}

/** Unsigned `api/timedtext` probes carry no signature — only v/lang/fmt. */
function isUnsignedTimedText(url: string): boolean {
  return url.includes("/api/timedtext") && !url.includes("&signature=");
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/* ───────────────────────────── track picking ────────────────────────────── */

describe("pickTrack", () => {
  const tracks = [
    { baseUrl: "a", languageCode: "es" },
    { baseUrl: "b", languageCode: "en", kind: "asr" },
    { baseUrl: "c", languageCode: "en" },
  ];

  it("prefers a manual track over ASR", () => {
    expect(pickTrack(tracks)?.baseUrl).toBe("c");
  });

  it("honours a requested language, including region prefixes", () => {
    expect(pickTrack(tracks, "es")?.baseUrl).toBe("a");
    expect(pickTrack(tracks, "en-GB")?.baseUrl).toBe("c");
  });

  it("falls back to ASR when that is all there is", () => {
    expect(pickTrack([{ baseUrl: "b", languageCode: "en", kind: "asr" }])?.baseUrl).toBe("b");
  });

  it("returns undefined for no tracks", () => {
    expect(pickTrack([])).toBeUndefined();
  });
});

describe("withCaptionFormat", () => {
  it("overrides an existing fmt parameter without breaking the signed URL", () => {
    const url = withCaptionFormat(
      "https://www.youtube.com/api/timedtext?v=abc&lang=en&fmt=srv3&expire=123",
      "json3",
    );
    expect(url).toContain("fmt=json3");
    expect(url).not.toContain("fmt=srv3");
    expect(url).toContain("expire=123");
    expect(url).toContain("v=abc");
  });
});

/* ───────────────────────── the strategy ladder ──────────────────────────── */

describe("fetchCaptionsDirect — success paths", () => {
  it("uses WEB when it exposes captions, and reports the strategy", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch((url) => {
        if (url.includes("/youtubei/v1/player")) {
          return json(playerResponse({ tracks: [{ lang: "en" }] }));
        }
        if (url.includes("timedtext")) return text(JSON3_BODY);
        return null;
      }),
    );

    const result = await fetchCaptionsDirect("dQw4w9WgXcQ");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.strategy).toBe("innertube:web");
    expect(result.format).toBe("json3");
    expect(result.language).toBe("en");
    expect(result.isAutoGenerated).toBe(false);
    expect(result.title).toBe("A real video");
    expect(result.durationSeconds).toBe(212);
    // json3 is milliseconds → normalised to seconds.
    expect(result.segments[0].offset).toBeCloseTo(0.24, 3);
    expect(result.segments).toHaveLength(3);
  });

  it("falls back to a different client identity when WEB hides captions (the datacenter-IP case)", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch((url, init) => {
        if (url.includes("/youtubei/v1/player")) {
          // WEB returns playability OK but no caption tracks — exactly what
          // YouTube does for flagged IP ranges.
          const client = clientOf(init);
          return client === "web"
            ? json(playerResponse({ tracks: [] }))
            : json(playerResponse({ tracks: [{ lang: "en", kind: "asr", name: "English (auto-generated)" }] }));
        }
        if (url.includes("timedtext")) return text(JSON3_BODY);
        return null;
      }),
    );

    const result = await fetchCaptionsDirect("dQw4w9WgXcQ");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.strategy).toBe("innertube:android-vr");
    expect(result.isAutoGenerated).toBe(true);
    expect(result.diagnostics.some((d) => d.strategy === "innertube:web" && !d.ok)).toBe(true);
  });

  it("moves past a bot wall to the next client", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch((url, init) => {
        if (url.includes("/youtubei/v1/player")) {
          return clientOf(init) === "web"
            ? json(
                playerResponse({
                  status: "LOGIN_REQUIRED",
                  reason: "Sign in to confirm you're not a bot",
                }),
              )
            : json(playerResponse({ tracks: [{ lang: "en" }] }));
        }
        if (url.includes("timedtext")) return text(JSON3_BODY);
        return null;
      }),
    );

    const result = await fetchCaptionsDirect("dQw4w9WgXcQ");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.strategy).toBe("innertube:android-vr");
  });

  it("parses classic XML when only that format is served", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch((url) => {
        if (url.includes("/youtubei/v1/player")) {
          return json(playerResponse({ tracks: [{ lang: "en" }] }));
        }
        if (url.includes("timedtext")) {
          // json3 request → YouTube answers with classic XML anyway.
          return text(CLASSIC_XML);
        }
        return null;
      }),
    );

    const result = await fetchCaptionsDirect("dQw4w9WgXcQ");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.format).toBe("classic");
    // Classic XML is seconds → 2.2, not 2200.
    expect(result.segments[1].offset).toBeCloseTo(2.2, 3);
  });

  it("retries the timedtext fetch in another format when one comes back empty", async () => {
    let timedTextCalls = 0;
    vi.stubGlobal(
      "fetch",
      mockFetch((url) => {
        if (url.includes("/youtubei/v1/player")) {
          return json(playerResponse({ tracks: [{ lang: "en" }] }));
        }
        if (url.includes("timedtext")) {
          timedTextCalls += 1;
          // First attempt (fmt=json3) returns an error page; second succeeds.
          return timedTextCalls === 1 ? text("<html>error</html>") : text(JSON3_BODY);
        }
        return null;
      }),
    );

    const result = await fetchCaptionsDirect("dQw4w9WgXcQ");
    expect(result.ok).toBe(true);
    expect(timedTextCalls).toBeGreaterThan(1);
  });

  it("uses unsigned timedtext when every client identity is blocked", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch((url) => {
        if (url.includes("/youtubei/v1/player")) {
          return json(
            playerResponse({ status: "LOGIN_REQUIRED", reason: "Sign in to confirm you're not a bot" }),
          );
        }
        // The unsigned endpoint answers even though the API refuses.
        if (isUnsignedTimedText(url)) return text(JSON3_BODY);
        return null;
      }),
    );

    const result = await fetchCaptionsDirect("dQw4w9WgXcQ");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.strategy).toBe("timedtext:unsigned");
    expect(result.segments).toHaveLength(3);
    expect(result.language).toBe("en");
    expect(result.diagnostics.some((d) => d.strategy === "innertube:web" && !d.ok)).toBe(true);
  });

  it("honours a requested language on the unsigned rung", async () => {
    const requested: string[] = [];
    vi.stubGlobal(
      "fetch",
      mockFetch((url) => {
        if (url.includes("/youtubei/v1/player")) return json(playerResponse({ status: "LOGIN_REQUIRED", reason: "bot" }));
        if (isUnsignedTimedText(url)) {
          const lang = new URL(url).searchParams.get("lang") ?? "";
          const asr = new URL(url).searchParams.get("kind") === "asr";
          requested.push(`${lang}${asr ? "(asr)" : ""}`);
          return lang === "es" && !asr ? text(JSON3_BODY) : text("");
        }
        return null;
      }),
    );

    const result = await fetchCaptionsDirect("dQw4w9WgXcQ", { lang: "es" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.language).toBe("es");
    // Spanish is asked for first, not after English.
    expect(requested[0]).toBe("es");
  });

  it("scrapes the watch page when the unsigned endpoint also fails", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch((url) => {
        if (url.includes("/youtubei/v1/player")) throw new Error("fetch failed: ENOTFOUND");
        if (isUnsignedTimedText(url)) return text("");
        if (url.includes("/watch?")) {
          return text(
            `<html><script>var ytInitialPlayerResponse = ${JSON.stringify(
              playerResponse({ tracks: [{ lang: "en" }] }),
            )};</script></html>`,
          );
        }
        if (url.includes("timedtext")) return text(JSON3_BODY);
        return null;
      }),
    );

    const result = await fetchCaptionsDirect("dQw4w9WgXcQ");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.strategy).toBe("watch-page");
    expect(result.segments.length).toBe(3);
  });

  it("stops at the deadline instead of grinding through every identity", async () => {
    const startedAt = Date.now();
    vi.stubGlobal(
      "fetch",
      mockFetch((url) => {
        if (url.includes("/youtubei/v1/player")) {
          return json(
            playerResponse({ status: "LOGIN_REQUIRED", reason: "Sign in to confirm you're not a bot" }),
          );
        }
        return text("<html>consent</html>");
      }),
    );

    const result = await fetchCaptionsDirect("dQw4w9WgXcQ", { deadlineMs: 1_200, timeoutMs: 400 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // Fast, bounded, and it tells the user it gave up rather than hanging.
    expect(Date.now() - startedAt).toBeLessThan(6_000);
    expect(result.environmentFailure).toBe(true);
  });
});

describe("fetchCaptionsDirect — failure paths", () => {
  it("classifies a bot wall across all clients as an environment failure", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch((url) => {
        if (url.includes("/youtubei/v1/player")) {
          return json(
            playerResponse({ status: "LOGIN_REQUIRED", reason: "Sign in to confirm you're not a bot" }),
          );
        }
        // Watch page also refuses (consent page with no player response).
        return text("<html>Before you continue to YouTube…</html>");
      }),
    );

    const result = await fetchCaptionsDirect("dQw4w9WgXcQ");
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.environmentFailure).toBe(true);
    // Every attempt is recorded, including the watch-page fallback.
    expect(result.diagnostics.length).toBeGreaterThanOrEqual(3);
    expect(result.diagnostics.some((d) => d.strategy === "watch-page")).toBe(true);
  });

  it("classifies a total network outage as an environment failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("fetch failed: getaddrinfo ENOTFOUND www.youtube.com");
      }),
    );

    const result = await fetchCaptionsDirect("dQw4w9WgXcQ");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.environmentFailure).toBe(true);
  });

  it("reports a private/deleted video as a video problem, not an environment one", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch((url) => {
        if (url.includes("/youtubei/v1/player")) {
          return json(
            playerResponse({ status: "UNPLAYABLE", reason: "This video is unavailable" }),
          );
        }
        return text("<html><body>no player here</body></html>");
      }),
    );

    const result = await fetchCaptionsDirect("dQw4w9WgXcQ");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.environmentFailure).toBe(false);
    expect(result.videoUnavailable).toBeTruthy();
  });

  it("never throws, whatever the network does", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("boom");
      }),
    );
    await expect(fetchCaptionsDirect("dQw4w9WgXcQ")).resolves.toBeDefined();
  });
});

describe("describeDiagnostics", () => {
  it("renders a readable one-line report per attempt", () => {
    const lines = describeDiagnostics([
      { strategy: "innertube:web", ok: false, detail: "LOGIN_REQUIRED — not a bot" },
      { strategy: "innertube:android", ok: true, detail: "json3, 412 lines" },
    ]);
    expect(lines[0]).toContain("✗ innertube:web");
    expect(lines[1]).toContain("✓ innertube:android");
    expect(lines[1]).toContain("412 lines");
  });
});
