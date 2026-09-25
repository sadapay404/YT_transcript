"use server";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Server action: extract a transcript.
 * ─────────────────────────────────────────────────────────────────────────────
 *  Runs on the server, so:
 *   • caption scraping happens outside the browser → no CORS problems;
 *   • the request comes from the host's IP, not the visitor's;
 *   • no API key or scraping logic is ever shipped to the client.
 *
 *  Kept intentionally thin: validation and all business logic live in
 *  `lib/youtube/fetch.ts` so they can be unit-tested and reused.
 */
import type { FetchTranscriptResult } from "@/lib/types";
import { fetchTranscriptForUrl } from "@/lib/youtube/fetch";
import { buildDemoTranscript } from "@/lib/youtube/demo";

/** Hard cap on the string we accept, so a huge body can't be used as a probe. */
const MAX_INPUT_LENGTH = 2_048;

export async function extractTranscriptAction(
  input: string,
  options: { lang?: string } = {},
): Promise<FetchTranscriptResult> {
  const trimmed = (input ?? "").trim();

  if (!trimmed) {
    return {
      ok: false,
      error: "invalid-url",
      message: "Paste a YouTube link to get started.",
      hint: "Any format works: youtube.com/watch?v=…, youtu.be/…, /shorts/…, or just the video id.",
    };
  }

  if (trimmed.length > MAX_INPUT_LENGTH) {
    return {
      ok: false,
      error: "invalid-url",
      message: "That input is far too long to be a video link.",
      hint: "Paste only the video URL or its 11-character id.",
    };
  }

  return fetchTranscriptForUrl(trimmed, { lang: options.lang });
}

/**
 * Load the bundled demo transcript. Exposed as its own action so the UI can
 * offer it explicitly (and so a curious reader can explore without a video).
 */
export async function loadDemoTranscriptAction(): Promise<FetchTranscriptResult> {
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
    notice: "This is TranStudio's built-in demo transcript, not a YouTube video.",
  };
}
