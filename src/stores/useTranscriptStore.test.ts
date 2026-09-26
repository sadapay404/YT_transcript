import { beforeEach, describe, expect, it, vi } from "vitest";

const { extractTranscriptAction, loadDemoTranscriptAction, fetchCaptionsInBrowser } = vi.hoisted(() => ({
  extractTranscriptAction: vi.fn(),
  loadDemoTranscriptAction: vi.fn(),
  fetchCaptionsInBrowser: vi.fn(),
}));

vi.mock("@/app/actions/transcript", () => ({
  extractTranscriptAction,
  loadDemoTranscriptAction,
}));
vi.mock("@/lib/transcript/browser-captions", () => ({ fetchCaptionsInBrowser }));

import { useTranscriptStore } from "@/stores/useTranscriptStore";
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

  it("does not browser-fetch an explicitly loaded demo", async () => {
    const loaded = demoResult();
    loaded.notice = "This is TranStudio's built-in demo transcript, not a YouTube video.";
    loadDemoTranscriptAction.mockResolvedValue(loaded);

    await useTranscriptStore.getState().loadDemo();

    expect(fetchCaptionsInBrowser).not.toHaveBeenCalled();
    expect(useTranscriptStore.getState().transcript?.source).toBe("demo");
  });
});
