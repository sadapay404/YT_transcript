/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  YouTube transcript probe — server only.
 * ─────────────────────────────────────────────────────────────────────────────
 *  Used by `/api/health?deep=1` and the /status page. It runs the **same
 *  multi-strategy pipeline the app uses**, so the diagnostics you see there are
 *  exactly what a real fetch would report.
 */
import {
  fetchCaptionsDirect,
  describeDiagnostics,
  type Diagnostic,
} from "@/lib/youtube/captions";
import { proxiedFetcher } from "@/lib/youtube/clients";
import { parseYouTubeUrl } from "@/lib/utils";

export interface ClassifiedTranscriptError {
  code: "disabled" | "empty" | "not-found" | "too-many-requests" | "blocked" | "network" | "unknown";
  message: string;
  hint: string;
}

/** Map a raw failure (library error, network error) onto our taxonomy. */
export function classifyTranscriptError(error: unknown): ClassifiedTranscriptError {
  const name = error instanceof Error ? error.name : "Error";
  const raw = error instanceof Error ? error.message : String(error);
  const text = raw.toLowerCase();

  switch (name) {
    case "YoutubeTranscriptTooManyRequestError":
      return {
        code: "too-many-requests",
        message: "YouTube is rate-limiting caption requests from this IP.",
        hint: "Datacenter IPs get throttled first. Retry in a few minutes, set TRANSCRIPT_PROXY_URL, or deploy where the egress is not flagged.",
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

  if (
    text.includes("enotfound") ||
    text.includes("fetch failed") ||
    text.includes("econnrefused") ||
    text.includes("eai_again")
  ) {
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
  /** Which strategy succeeded (e.g. "innertube:android"). */
  strategy?: string;
  /** Caption body format the parser recognised. */
  format?: string;
  /** Unit the winning parser reported (json3/srv3 → ms, classic/vtt → s). */
  timeUnit?: string;
  /** Per-strategy attempt log, always present. */
  diagnostics: string[];
  latencyMs: number;
  error?: ClassifiedTranscriptError;
}

/**
 * Fetch a transcript far enough to prove the pipeline works, and report which
 * strategy succeeded. Never throws.
 */
export async function probeTranscript(
  input: string,
  options: { lang?: string; timeoutMs?: number } = {},
): Promise<TranscriptProbeResult> {
  const startedAt = Date.now();
  const parsed = parseYouTubeUrl(input);

  if (!parsed) {
    return {
      ok: false,
      videoId: "",
      segmentCount: 0,
      diagnostics: [],
      latencyMs: Date.now() - startedAt,
      error: {
        code: "unknown",
        message: "That doesn't look like a YouTube link.",
        hint: "Try a full watch URL, a youtu.be short link, or a bare 11-character video id.",
      },
    };
  }

  const fetcher = proxiedFetcher();
  const result = await fetchCaptionsDirect(parsed.videoId, {
    ...(options.lang ? { lang: options.lang } : {}),
    timeoutMs: options.timeoutMs ?? 6_000,
    ...(fetcher ? { fetcher } : {}),
  });

  const diagnostics = describeDiagnostics(result.diagnostics);

  if (result.ok) {
    return {
      ok: true,
      videoId: parsed.videoId,
      language: result.language,
      segmentCount: result.segments.length,
      sample: result.segments
        .slice(0, 3)
        .map((segment) => segment.text)
        .join(" ")
        .slice(0, 180),
      durationSeconds: result.segments.at(-1)?.end,
      strategy: result.strategy,
      format: result.format,
      timeUnit: result.unit,
      diagnostics,
      latencyMs: Date.now() - startedAt,
    };
  }

  return {
    ok: false,
    videoId: parsed.videoId,
    segmentCount: 0,
    diagnostics,
    latencyMs: Date.now() - startedAt,
    error: result.videoUnavailable
      ? {
          code: "not-found",
          message: result.videoUnavailable,
          hint: "Check the link opens in a normal browser tab.",
        }
      : {
          code: result.environmentFailure ? "blocked" : "empty",
          message: result.environmentFailure
            ? "No caption strategy succeeded — YouTube appears to be blocking this server."
            : "No captions could be read for this video.",
          hint: result.environmentFailure
            ? "Datacenter IPs are commonly challenged. Set TRANSCRIPT_PROXY_URL, deploy elsewhere, or retry shortly."
            : "The video may have captions disabled, or only auto-captions that haven't been generated yet.",
        },
  };
}

export type { Diagnostic };
