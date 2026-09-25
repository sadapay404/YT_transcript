/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  YouTube transcript probe — server only.
 * ─────────────────────────────────────────────────────────────────────────────
 *  A deliberately thin layer over `youtube-transcript` used by
 *  `/api/health?deep=1` and the /status page so you can verify that caption
 *  scraping works *from the machine that will actually run it* (your laptop or
 *  your host) before blaming the app.
 *
 *  Step 2 builds the full payload/action on top of these same helpers.
 */
import { YoutubeTranscript } from "youtube-transcript";

import type { TranscriptErrorCode } from "@/lib/types";
import { normalizeCaption, parseYouTubeUrl } from "@/lib/utils";
import { detectTimeUnit, toSeconds } from "@/lib/youtube/normalize";

export interface ClassifiedTranscriptError {
  code: TranscriptErrorCode;
  message: string;
  hint: string;
}

/**
 * Map the library's error classes (and Node's network errors) onto our own
 * taxonomy, with a remedy that is actually useful.
 */
export function classifyTranscriptError(error: unknown): ClassifiedTranscriptError {
  const name = error instanceof Error ? error.name : "Error";
  const raw = error instanceof Error ? error.message : String(error);

  switch (name) {
    case "YoutubeTranscriptTooManyRequestError":
      return {
        code: "too-many-requests",
        message: "YouTube is rate-limiting transcript requests from this IP.",
        hint: "Datacenter IPs get throttled first. Retry in a few minutes, set TRANSCRIPT_PROXY_URL, or run/ deploy somewhere with a residential-ish egress (Vercel usually works).",
      };
    case "YoutubeTranscriptDisabledError":
      return {
        code: "disabled",
        message: "Captions are disabled for this video.",
        hint: "Pick a video that has subtitles — the video itself is fine otherwise.",
      };
    case "YoutubeTranscriptNotAvailableError":
      return {
        code: "empty",
        message: "This video has no transcript available.",
        hint: "Auto-captions may not exist yet (very new uploads) or the language isn't published.",
      };
    case "YoutubeTranscriptNotAvailableLanguageError":
      return {
        code: "empty",
        message: "No captions in the requested language.",
        hint: "Omit the language to accept whatever YouTube publishes first.",
      };
    case "YoutubeTranscriptVideoUnavailableError":
      return {
        code: "not-found",
        message: "That video is private, deleted or region-locked.",
        hint: "Check the link opens in a normal browser tab.",
      };
    default:
      break;
  }

  const text = raw.toLowerCase();
  if (text.includes("enotfound") || text.includes("fetch failed") || text.includes("econnrefused") || text.includes("eai_again")) {
    return {
      code: "blocked",
      message: "This server cannot reach youtube.com.",
      hint: "Sandboxes and some CI environments block outbound traffic. Test locally or on your deploy host — /status will show green there.",
    };
  }
  if (text.includes("aborted") || text.includes("timeout")) {
    return {
      code: "network",
      message: "YouTube took too long to answer.",
      hint: "Retry once; long videos can take a few seconds.",
    };
  }

  return {
    code: "unknown",
    message: raw || "Unknown transcript error.",
    hint: "Retry once. If it persists, the video may use a caption format YouTube has changed.",
  };
}

export interface TranscriptProbeResult {
  ok: boolean;
  videoId: string;
  language?: string;
  segmentCount: number;
  /** First line, trimmed — proof that real text came back. */
  sample?: string;
  durationSeconds?: number;
  /** Which unit the payload turned out to be in (normalization is defensive). */
  timeUnit?: "ms" | "s";
  latencyMs: number;
  error?: ClassifiedTranscriptError;
}

/**
 * Fetch a transcript just far enough to prove the pipeline works.
 * Never throws: every failure is classified and returned.
 */
export async function probeTranscript(
  input: string,
  options: { lang?: string; timeoutMs?: number } = {},
): Promise<TranscriptProbeResult> {
  const timeoutMs = options.timeoutMs ?? 12_000;
  const startedAt = Date.now();
  const parsed = parseYouTubeUrl(input);

  if (!parsed) {
    return {
      ok: false,
      videoId: "",
      segmentCount: 0,
      latencyMs: Date.now() - startedAt,
      error: {
        code: "invalid-url",
        message: "That doesn't look like a YouTube link.",
        hint: "Try a full watch URL, a youtu.be short link, or a bare 11-character video id.",
      },
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const raw = await YoutubeTranscript.fetchTranscript(parsed.videoId, {
      ...(options.lang ? { lang: options.lang } : {}),
      // The library accepts a custom fetch, which is how we enforce a timeout.
      fetch: ((input_, init) =>
        fetch(input_, { ...init, signal: controller.signal })) as typeof fetch,
    });

    const segments = raw
      .map((segment) => ({ ...segment, text: normalizeCaption(segment.text ?? "") }))
      .filter((segment) => segment.text.length > 0);

    const last = segments.at(-1);
    const unit = detectTimeUnit(segments);

    return {
      ok: segments.length > 0,
      videoId: parsed.videoId,
      language: raw[0]?.lang,
      segmentCount: segments.length,
      sample: segments.slice(0, 3).map((s) => s.text).join(" ").slice(0, 180),
      // The library reports ms on one code path and seconds on another, so the
      // unit is detected from the payload rather than assumed.
      durationSeconds: last
        ? toSeconds(last.offset, unit) + toSeconds(last.duration, unit)
        : undefined,
      timeUnit: unit,
      latencyMs: Date.now() - startedAt,
      ...(segments.length === 0
        ? {
            error: {
              code: "empty" as const,
              message: "YouTube returned an empty caption track.",
              hint: "The video may only have auto-captions that haven't been generated yet.",
            },
          }
        : {}),
    };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      videoId: parsed.videoId,
      segmentCount: 0,
      latencyMs: Date.now() - startedAt,
      error: aborted
        ? {
            code: "network",
            message: `No answer from YouTube within ${Math.round(timeoutMs / 1000)}s.`,
            hint: "Retry, or check that the host allows outbound HTTPS to youtube.com.",
          }
        : classifyTranscriptError(error),
    };
  } finally {
    clearTimeout(timer);
  }
}
