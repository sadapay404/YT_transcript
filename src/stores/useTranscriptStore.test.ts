import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  extractTranscriptAction,
  loadDemoTranscriptAction,
  fetchCaptionsInBrowser,
  fetchCaptionsViaConnector,
  detectConnector,
} = vi.hoisted(() => ({
  extractTranscriptAction: vi.fn(),
  loadDemoTranscriptAction: vi.fn(),
  fetchCaptionsInBrowser: vi.fn(),
  fetchCaptionsViaConnector: vi.fn(),
  detectConnector: vi.fn(),
}));

vi.mock("@/app/actions/transcript", () => ({
  extractTranscriptAction,
  loadDemoTranscriptAction,
}));
vi.mock("@/lib/transcript/browser-captions", () => ({ fetchCaptionsInBrowser, fetchCaptionsViaConnector }));
vi.mock("@/lib/connector/client", () => ({ detectConnector }));

import { useTranscriptStore } from "@/stores/useTranscriptStore";
import { usePlaybackStore } from "@/stores/usePlaybackStore";
import { buildDemoTranscript } from "@/lib/youtube/demo";
import type { FetchTranscriptResult } from "@/lib/types";

const VIDEO_ID = "dQw4w9WgXcQ";
const INPUT = `https://www.youtube.com/watch?v=${VIDEO_ID}&t=42`;

const browserSegments = [
  { id: 0, text: "Real browser caption", offset: 0, duration: 2, end: 2, charCount: 20 },
];

function demoResult(): Extract<FetchTranscriptResult, { ok: true }> {
  const transcript = buildDemoTranscript();
  return {
    ok: true,
    transcript,
    metadata: {
      videoId: transcript.videoId,
      url: "",
      title: "Welcome to TranStudio — read any video",
      author: "TranStudio",
      thumbnailUrl: "",
      durationSeconds: transcript.durationSeconds,
    },
    notice:
      "This host cannot load YouTube captions right now, so a built-in demo transcript is shown instead.",
    diagnostics: ["✗ server — blocked"],
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  // Default: no Connector add-on in this "browser".
  detectConnector.mockResolvedValue(null);
  fetchCaptionsViaConnector.mockResolvedValue(null);
  useTranscriptStore.getState().reset();
});

describe("automatic browser caption fallback", () => {
  it("keeps the server first and hydrates an environmental demo with browser captions", async () => {
    const events: string[] = [];
    extractTranscriptAction.mockImplementation(async () => {
      events.push("server");
      return demoResult();
    });
    fetchCaptionsInBrowser.mockImplementation(async () => {
      events.push("browser");
      return {
        ok: true,
        segments: browserSegments,
        format: "json3",
        language: "en",
        attempts: ["✓ en · json3 — 1 lines"],
      };
    });

    await useTranscriptStore.getState().extract(INPUT);

    const state = useTranscriptStore.getState();
    expect(events).toEqual(["server", "browser"]);
    expect(fetchCaptionsInBrowser).toHaveBeenCalledWith(VIDEO_ID, {
      lang: "en",
      timeoutMs: 8_000,
    });
    expect(state.status).toBe("success");
    expect(state.transcript?.source).toBe("browser");
    expect(state.transcript?.strategy).toBe("browser:json3");
    expect(state.transcript?.videoId).toBe(VIDEO_ID);
    expect(state.transcript?.text).toBe("Real browser caption");
    expect(state.metadata?.videoId).toBe(VIDEO_ID);
    expect(state.metadata?.startAt).toBe(42);
    expect(state.notice).toContain("browser path succeeded");
  });

  it("leaves the bundled demo usable when CORS or the visitor network refuses the read", async () => {
    extractTranscriptAction.mockResolvedValue(demoResult());
    fetchCaptionsInBrowser.mockResolvedValue({
      ok: false,
      reason: "Your browser could not read the caption endpoint.",
      attempts: ["✗ en · json3 — Failed to fetch"],
    });

    await useTranscriptStore.getState().extract(INPUT);

    const state = useTranscriptStore.getState();
    expect(state.status).toBe("success");
    expect(state.transcript?.source).toBe("demo");
    expect(state.transcript?.videoId).toBe("transtudio-demo");
    expect(state.metadata?.videoId).toBe("transtudio-demo");
    expect(state.error).toBeNull();
    expect(state.notice).toContain("direct browser read was not available");
    expect(state.notice).toContain("YouTube, CORS, or the network");
    expect(state.diagnostics).toContain("✗ en · json3 — Failed to fetch");
  });

  it("also retries the visitor connection when the server misclassifies a valid video", async () => {
    extractTranscriptAction.mockResolvedValue({
      ok: false,
      error: "not-found",
      message: "The video is not playable.",
      videoId: VIDEO_ID,
      hint: "The server could not verify the video.",
      diagnostics: ["✗ innertube:web — UNPLAYABLE"],
    } satisfies Extract<FetchTranscriptResult, { ok: false }>);
    fetchCaptionsInBrowser.mockResolvedValue({
      ok: true,
      segments: browserSegments,
      format: "srv3",
      language: "en",
      attempts: ["✓ player:en · srv3 — 1 lines"],
    });

    await useTranscriptStore.getState().extract(INPUT);

    const state = useTranscriptStore.getState();
    expect(fetchCaptionsInBrowser).toHaveBeenCalledWith(VIDEO_ID, {
      lang: undefined,
      timeoutMs: 8_000,
    });
    expect(state.status).toBe("success");
    expect(state.transcript?.source).toBe("browser");
    expect(state.transcript?.strategy).toBe("browser:srv3");
    expect(state.error).toBeNull();
  });

  it("keeps a non-demo server failure actionable when the visitor read also fails", async () => {
    extractTranscriptAction.mockResolvedValue({
      ok: false,
      error: "not-found",
      message: "The video is not playable.",
      videoId: VIDEO_ID,
      diagnostics: ["✗ innertube:web — UNPLAYABLE"],
    } satisfies Extract<FetchTranscriptResult, { ok: false }>);
    fetchCaptionsInBrowser.mockResolvedValue({
      ok: false,
      reason: "The browser could not read YouTube's captions.",
      attempts: ["✗ browser · player — Failed to fetch"],
    });

    await useTranscriptStore.getState().extract(INPUT);

    const state = useTranscriptStore.getState();
    expect(state.status).toBe("error");
    expect(state.transcript).toBeNull();
    expect(state.error?.code).toBe("blocked");
    expect(state.error?.hint).toContain("paste it here");
  });

  it("does not browser-fetch an explicitly loaded demo", async () => {
    const loaded = demoResult();
    loaded.notice = "This is TranStudio's built-in demo transcript, not a YouTube video.";
    loadDemoTranscriptAction.mockResolvedValue(loaded);

    await useTranscriptStore.getState().loadDemo();

    expect(fetchCaptionsInBrowser).not.toHaveBeenCalled();
    expect(useTranscriptStore.getState().transcript?.source).toBe("demo");
  });
});

function okResult(videoId: string, text: string): Extract<FetchTranscriptResult, { ok: true }> {
  return {
    ok: true,
    transcript: {
      videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      language: "en",
      languageLabel: "English",
      isAutoGenerated: false,
      source: "innertube",
      segments: [{ id: 0, text, offset: 0, duration: 2, end: 2, charCount: text.length }],
      text,
      wordCount: 2,
      characterCount: text.length,
      durationSeconds: 2,
      fetchedAt: new Date().toISOString(),
    },
    metadata: {
      videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      title: text,
      author: "",
      thumbnailUrl: "",
      durationSeconds: 2,
    },
  };
}

describe("TranStudio Connector add-on", () => {
  it("goes connector-first and skips the blocked server when the add-on answers", async () => {
    detectConnector.mockResolvedValue({ version: "1.0.0" });
    fetchCaptionsViaConnector.mockResolvedValue({
      ok: true,
      via: "connector",
      segments: browserSegments,
      format: "json3",
      language: "en",
      attempts: ["✓ connector · android-vr — 1 lines"],
    });

    await useTranscriptStore.getState().extract(INPUT);

    const state = useTranscriptStore.getState();
    expect(extractTranscriptAction).not.toHaveBeenCalled();
    expect(fetchCaptionsInBrowser).not.toHaveBeenCalled();
    expect(state.status).toBe("success");
    expect(state.transcript?.videoId).toBe(VIDEO_ID);
    expect(state.transcript?.strategy).toBe("connector:json3");
    expect(state.notice).toBeNull();
  });

  it("falls back to the server when the add-on is installed but can't get captions", async () => {
    detectConnector.mockResolvedValue({ version: "1.0.0" });
    fetchCaptionsViaConnector.mockResolvedValue({
      ok: false,
      via: "connector",
      reason: "No captions",
      attempts: ["✗ connector · android-vr — no tracks"],
    });
    extractTranscriptAction.mockResolvedValue(demoResult());
    fetchCaptionsInBrowser.mockResolvedValue({ ok: false, reason: "Failed to fetch", attempts: [] });

    await useTranscriptStore.getState().extract(INPUT);

    const state = useTranscriptStore.getState();
    expect(extractTranscriptAction).toHaveBeenCalledTimes(1);
    expect(state.diagnostics[0]).toBe("✗ connector · android-vr — no tracks");
    expect(state.transcript).not.toBeNull();
  });
});

describe("loading one video after another", () => {
  it("never lets an older, slower response replace the newer video", async () => {
    let resolveFirst: (value: FetchTranscriptResult) => void = () => {};
    extractTranscriptAction
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(async () => okResult("BBBBBBBBBBB", "Second video"));

    const first = useTranscriptStore.getState().extract("https://youtu.be/AAAAAAAAAAA");
    await useTranscriptStore.getState().extract("https://youtu.be/BBBBBBBBBBB");
    resolveFirst(okResult("AAAAAAAAAAA", "First video"));
    await first;

    const state = useTranscriptStore.getState();
    expect(state.transcript?.videoId).toBe("BBBBBBBBBBB");
    expect(state.metadata?.videoId).toBe("BBBBBBBBBBB");
    expect(state.transcript?.text).toBe("Second video");
  });

  it("resets the playback clock, active line and clip for the new video", async () => {
    extractTranscriptAction.mockResolvedValueOnce(okResult("AAAAAAAAAAA", "First video"));
    await useTranscriptStore.getState().extract("https://youtu.be/AAAAAAAAAAA");
    usePlaybackStore.setState({
      currentTime: 1,
      activeSegmentIndex: 0,
      loopRange: { start: 0, end: 2 },
    });

    extractTranscriptAction.mockResolvedValueOnce(okResult("BBBBBBBBBBB", "Second video"));
    await useTranscriptStore.getState().extract("https://youtu.be/BBBBBBBBBBB");

    const playback = usePlaybackStore.getState();
    expect(playback.currentTime).toBe(0);
    expect(playback.activeSegmentIndex).toBe(-1);
    expect(playback.loopRange).toBeNull();
  });
});
