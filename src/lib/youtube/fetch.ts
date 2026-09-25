/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  The core engine — URL in, complete transcript payload out. SERVER ONLY.
 * ─────────────────────────────────────────────────────────────────────────────
 *  Pipeline:
 *    1. validate + parse the URL           (client and server share the parser)
 *    2. metadata in parallel with captions (InnerTube → oEmbed, both optional)
 *    3. scrape captions                    (youtube-transcript, no API key)
 *    4. normalise ms-vs-seconds + shape    (validated by the unit tests)
 *    5. on "cannot reach YouTube", optionally serve the demo transcript
 *
 *  Everything is timeout-guarded and every failure is classified into the app's
 *  error taxonomy, so the UI can always show something actionable.
 */
import { YoutubeTranscript } from "youtube-transcript";

import { GEMINI } from "@/lib/constants";
import type {
  FetchTranscriptResult,
  TranscriptErrorCode,
  TranscriptPayload,
  TranscriptSource,
} from "@/lib/types";
import { parseYouTubeUrl } from "@/lib/utils";
import { buildDemoTranscript, DEMO_AUTHOR, DEMO_TITLE } from "@/lib/youtube/demo";
import {
  fetchVideoMetadata,
  pickCaptionTrack,
  type VideoMetadataResult,
} from "@/lib/youtube/metadata";
import { normalizeSegments } from "@/lib/youtube/normalize";
import { classifyTranscriptError } from "@/lib/youtube/probe";

export interface FetchTranscriptOptions {
  /** Preferred caption language, e.g. "en". Falls back to what YouTube offers. */
  lang?: string;
  /** Total budget for the whole operation. */
  timeoutMs?: number;
  /**
   * When the network is unreachable (sandbox/CI/datacenter egress), return the
   * demo transcript instead of a hard failure. Real errors — deleted video,
   * captions disabled — are still reported as errors.
   */
  allowDemoFallback?: boolean;
}

/** Constrain concurrent scraper calls (YouTube throttles bursts aggressively). */
const MAX_CONCURRENT_SCRAPES = 2;
let inFlight = 0;
const queue: Array<() => void> = [];

async function withScrapeSlot<T>(task: () => Promise<T>): Promise<T> {
  if (inFlight >= MAX_CONCURRENT_SCRAPES) {
    await new Promise<void>((resolve) => queue.push(resolve));
  }
  inFlight += 1;
  try {
    return await task();
  } finally {
    inFlight -= 1;
    queue.shift()?.();
  }
}

/**
 * Optional egress proxy for hosts whose IP range YouTube throttles.
 * `TRANSCRIPT_PROXY_URL` may be either a prefix (`https://proxy/`) or a URL
 * template containing `{url}`.
 */
function makeProxyFetch(): typeof fetch | undefined {
  const proxy = process.env.TRANSCRIPT_PROXY_URL?.trim();
  if (!proxy) return undefined;

  const rewrite = (input: RequestInfo | URL): string => {
    const target = typeof input === "string" ? input : input.toString();
    return proxy.includes("{url}")
      ? proxy.replace("{url}", encodeURIComponent(target))
      : `${proxy.replace(/\/$/, "")}/${target}`;
  };

  return ((input: RequestInfo | URL, init?: RequestInit) =>
    fetch(rewrite(input), init)) as typeof fetch;
}

/** Wrap a fetch so it always carries an abort signal (Scraper can hang). */
function timedFetch(signal: AbortSignal): typeof fetch {
  const base = makeProxyFetch() ?? fetch;
  return ((input: RequestInfo | URL, init?: RequestInit) =>
    base(input, { ...init, signal })) as typeof fetch;
}

/**
 * Last-resort metadata when every YouTube endpoint is unreachable. Shaped like
 * a full result so `Promise.all` keeps a single, predictable type.
 */
function minimalMetadata(videoId: string): VideoMetadataResult {
  return {
    videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    title: "",
    author: "",
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    durationSeconds: 0,
    captionTracks: [],
    hasOnlyAutoCaptions: false,
    resolvedBy: "fallback",
  };
}

function demoResult(reason: string): FetchTranscriptResult {
  const demo = buildDemoTranscript();
  return {
    ok: true,
    transcript: demo,
    metadata: {
      videoId: demo.videoId,
      url: "",
      title: DEMO_TITLE,
      author: DEMO_AUTHOR,
      thumbnailUrl: "",
      durationSeconds: demo.durationSeconds,
    },
    // Surfaced so the UI can explain *why* this isn't the requested video.
    notice: reason,
  };
}

/**
 * Fetch a full transcript for a video URL or id.
 * This is the only entry point Step 2's UI (and later steps' export/clip code)
 * needs; it never throws.
 */
export async function fetchTranscriptForUrl(
  input: string,
  options: FetchTranscriptOptions = {},
): Promise<FetchTranscriptResult> {
  const totalBudget = options.timeoutMs ?? 20_000;
  const allowDemoFallback = options.allowDemoFallback ?? true;

  // ── 1. Parse ─────────────────────────────────────────────────────────────
  const parsed = parseYouTubeUrl(input);
  if (!parsed) {
    return {
      ok: false,
      error: "invalid-url",
      message: "That doesn't look like a YouTube link.",
      hint: "Paste a watch URL, a youtu.be short link, or an 11-character video id.",
    };
  }

  // Explicit demo mode beats any network call.
  if (process.env.TRANSTUDIO_DEMO_MODE === "1") {
    return demoResult("TRANSTUDIO_DEMO_MODE is enabled.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), totalBudget);

  try {
    // ── 2. Metadata and captions run concurrently ───────────────────────────
    const metadataPromise = fetchVideoMetadata(parsed.videoId, {
      timeoutMs: Math.min(9_000, totalBudget),
      signal: controller.signal,
    });

    const captionsPromise = withScrapeSlot(() =>
      YoutubeTranscript.fetchTranscript(parsed.videoId, {
        ...(options.lang ? { lang: options.lang } : {}),
        fetch: timedFetch(controller.signal),
      }),
    );

    const [metadata, rawCaptions] = await Promise.all([
      metadataPromise.catch(() => minimalMetadata(parsed.videoId)),
      captionsPromise,
    ]);

    // ── 3. Normalise (handles ms-vs-seconds and the cross-check) ────────────
    const preferredTrack = pickCaptionTrack(metadata.captionTracks, options.lang);
    const normalized = normalizeSegments(rawCaptions, {
      videoDurationSeconds: metadata.durationSeconds || undefined,
    });

    if (normalized.segments.length === 0) {
      return {
        ok: false,
        error: "empty",
        message: "This video has no readable captions.",
        hint: "Try a video with subtitles, or load the demo transcript to explore the app.",
        videoId: parsed.videoId,
      };
    }

    const language = preferredTrack?.languageCode ?? rawCaptions[0]?.lang ?? "en";
    const source: TranscriptSource = "youtube-transcript";

    const transcript: TranscriptPayload = {
      videoId: parsed.videoId,
      url: metadata.url || parsed.url,
      language,
      languageLabel:
        preferredTrack?.name ??
        (metadata.hasOnlyAutoCaptions ? `${language} (auto-generated)` : language),
      isAutoGenerated: preferredTrack?.kind === "asr",
      source,
      segments: normalized.segments,
      text: normalized.text,
      wordCount: normalized.wordCount,
      characterCount: normalized.characterCount,
      durationSeconds: normalized.durationSeconds,
      fetchedAt: new Date().toISOString(),
    };

    // Guard rail for the Gemini step: keep the payload within a sane context.
    if (transcript.characterCount > GEMINI.maxContextCharacters) {
      // Trimming happens in Step 4's prompt builder; log for now so it is
      // visible during development rather than silently truncated.
      console.warn(
        `[transtudio] transcript is ${transcript.characterCount} chars (limit ${GEMINI.maxContextCharacters}) — the AI context will be chunked.`,
      );
    }

    const durationSeconds =
      metadata.durationSeconds || transcript.durationSeconds;

    return {
      ok: true,
      transcript,
      metadata: {
        videoId: parsed.videoId,
        url: transcript.url,
        title: metadata.title,
        author: metadata.author,
        thumbnailUrl: metadata.thumbnailUrl,
        durationSeconds,
        ...(parsed.startAt ? { startAt: parsed.startAt } : {}),
      },
    };
  } catch (error) {
    const classified = classifyTranscriptError(error);

    // A blocked/absent network is an environment problem, not a user problem —
    // show the demo so the app stays usable and say so honestly.
    const environmentFailure =
      classified.code === "blocked" || classified.code === "network";
    if (environmentFailure && allowDemoFallback) {
      return demoResult(classified.message);
    }

    return {
      ok: false,
      error: classified.code as TranscriptErrorCode,
      message: classified.message,
      hint: classified.hint,
      videoId: parsed.videoId,
    };
  } finally {
    clearTimeout(timer);
  }
}
