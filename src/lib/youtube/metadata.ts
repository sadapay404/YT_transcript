/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Video metadata — title, channel, duration, caption tracks.
 * ─────────────────────────────────────────────────────────────────────────────
 *  `youtube-transcript` only returns caption lines, so we make one lightweight
 *  InnerTube call ourselves for the parts the UI needs (and that the caption
 *  normalizer benefits from):
 *
 *   • title + author       → header, export filenames
 *   • lengthSeconds        → lets the normalizer self-heal a wrong ms/s guess
 *   • captionTracks[]      → which languages exist, and whether they're ASR
 *                            (auto-generated), plus manual-after-auto ordering
 *
 *  Every path degrades gracefully: InnerTube → oEmbed → bare minimum. Metadata
 *  is a nice-to-have; a failure here must never stop a transcript loading.
 */
import type { VideoMetadata } from "@/lib/types";
import { youtubeThumbnail } from "@/lib/utils";

const INNERTUBE_URL = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";
const OEMBED_URL = "https://www.youtube.com/oembed";

/** Public web client key — the same one youtube.com uses in the browser. */
const INNERTUBE_CONTEXT = {
  client: {
    clientName: "WEB",
    clientVersion: "2.20250101.00.00",
    hl: "en",
    gl: "US",
  },
} as const;

export interface CaptionTrack {
  languageCode: string;
  /** Human label from YouTube, e.g. "English (auto-generated)". */
  name?: string;
  /** `asr` means auto-generated speech recognition. */
  kind?: string;
  isTranslatable?: boolean;
}

export interface VideoMetadataResult extends VideoMetadata {
  title: string;
  author: string;
  durationSeconds: number;
  /** Empty when captions are unavailable — the caller decides what to do. */
  captionTracks: CaptionTrack[];
  /** True when YouTube only exposes ASR captions. */
  hasOnlyAutoCaptions: boolean;
  /** Which strategy actually produced the data (surfaced in /status). */
  resolvedBy: "innertube" | "oembed" | "fallback";
}

export interface MetadataOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

/** Prefer a manual track in the requested (or UI) language, else the first. */
export function pickCaptionTrack(
  tracks: CaptionTrack[],
  preferredLanguage?: string,
): CaptionTrack | undefined {
  if (tracks.length === 0) return undefined;

  const manual = tracks.filter((track) => track.kind !== "asr");
  const pool = manual.length > 0 ? manual : tracks;

  if (preferredLanguage) {
    const exact = pool.find(
      (track) => track.languageCode?.toLowerCase() === preferredLanguage.toLowerCase(),
    );
    if (exact) return exact;

    const prefix = pool.find((track) =>
      track.languageCode?.toLowerCase().startsWith(preferredLanguage.split("-")[0]),
    );
    if (prefix) return prefix;
  }

  // Prefer English, then anything manual, then whatever is left.
  return pool.find((track) => track.languageCode?.startsWith("en")) ?? pool[0];
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  externalSignal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  externalSignal?.addEventListener("abort", onAbort, { once: true });

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", onAbort);
  }
}

interface InnerTubePlayerResponse {
  videoDetails?: {
    videoId?: string;
    title?: string;
    author?: string;
    lengthSeconds?: string;
    isLiveContent?: boolean;
  };
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: Array<{
        baseUrl?: string;
        name?: { simpleText?: string; runs?: Array<{ text?: string }> };
        languageCode?: string;
        kind?: string;
        isTranslatable?: boolean;
      }>;
    };
  };
  playabilityStatus?: { status?: string; reason?: string };
}

/** Primary path: the same InnerTube endpoint the web player itself calls. */
async function fetchViaInnerTube(
  videoId: string,
  options: MetadataOptions,
): Promise<VideoMetadataResult | null> {
  const response = await fetchWithTimeout(
    INNERTUBE_URL,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // A plain fetch UA is rejected by YouTube, so identify as a browser.
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "accept-language": "en-US,en;q=0.9",
      },
      body: JSON.stringify({ context: INNERTUBE_CONTEXT, videoId }),
      cache: "no-store",
    },
    options.timeoutMs ?? 9_000,
    options.signal,
  );

  if (!response.ok) return null;

  const data = (await response.json()) as InnerTubePlayerResponse;
  const details = data.videoDetails;
  if (!details?.title) return null;

  const rawTracks =
    data.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];

  const captionTracks: CaptionTrack[] = rawTracks
    .filter((track) => Boolean(track.languageCode))
    .map((track) => ({
      languageCode: track.languageCode as string,
      name:
        track.name?.simpleText ??
        track.name?.runs?.map((run) => run.text ?? "").join("") ??
        undefined,
      kind: track.kind,
      isTranslatable: track.isTranslatable,
    }));

  return {
    videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    title: details.title,
    author: details.author ?? "",
    thumbnailUrl: youtubeThumbnail(videoId, "hq"),
    durationSeconds: Number(details.lengthSeconds ?? 0) || 0,
    captionTracks,
    hasOnlyAutoCaptions:
      captionTracks.length > 0 && captionTracks.every((track) => track.kind === "asr"),
    resolvedBy: "innertube",
  };
}

interface OEmbedResponse {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
}

/** Fallback path: oEmbed is lighter and more permissive than InnerTube. */
async function fetchViaOEmbed(
  videoId: string,
  options: MetadataOptions,
): Promise<VideoMetadataResult | null> {
  const url = `${OEMBED_URL}?url=${encodeURIComponent(
    `https://www.youtube.com/watch?v=${videoId}`,
  )}&format=json`;

  const response = await fetchWithTimeout(
    url,
    { headers: { accept: "application/json" }, cache: "no-store" },
    options.timeoutMs ?? 7_000,
    options.signal,
  );

  if (!response.ok) return null;
  const data = (await response.json()) as OEmbedResponse;
  if (!data.title) return null;

  return {
    videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    title: data.title,
    author: data.author_name ?? "",
    thumbnailUrl: data.thumbnail_url ?? youtubeThumbnail(videoId, "hq"),
    // oEmbed does not expose duration or caption tracks; the player fills in
    // duration once it loads, and the normalizer simply skips the cross-check.
    durationSeconds: 0,
    captionTracks: [],
    hasOnlyAutoCaptions: false,
    resolvedBy: "oembed",
  };
}

/**
 * Resolve metadata for a video, trying each strategy in turn.
 * Never throws — the last resort is a valid (if sparse) result.
 */
export async function fetchVideoMetadata(
  videoId: string,
  options: MetadataOptions = {},
): Promise<VideoMetadataResult> {
  for (const strategy of [fetchViaInnerTube, fetchViaOEmbed]) {
    try {
      const result = await strategy(videoId, options);
      if (result) return result;
    } catch {
      // Try the next strategy.
    }
  }

  return {
    videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    title: "",
    author: "",
    thumbnailUrl: youtubeThumbnail(videoId, "hq"),
    durationSeconds: 0,
    captionTracks: [],
    hasOnlyAutoCaptions: false,
    resolvedBy: "fallback",
  };
}
