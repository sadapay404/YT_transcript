/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Innertube clients — the identity we fetch as.
 * ─────────────────────────────────────────────────────────────────────────────
 *  Why several? YouTube decides *per client* whether to expose caption tracks,
 *  and from datacenter IPs (Vercel, CI, sandboxes) the WEB client frequently
 *  hides them or hits a "confirm you're not a bot" wall, while another client
 *  happily returns them. Trying more than one identity is the single most
 *  effective fix for "no transcript found for every video".
 *
 *  Each entry must look *exactly* like the real client: the URL carries that
 *  client's public API key and the headers carry its client name + version.
 *  YouTube validates all three; a mismatch is answered with a 400 or an empty
 *  response, which previously looked indistinguishable from "no captions".
 */
import type { TimeUnit } from "@/lib/youtube/parse";

export interface InnertubeClient {
  /** Stable id used in diagnostics and as the reported strategy. */
  id: string;
  label: string;
  /** Public Innertube API key for this client (sent as `?key=`). */
  apiKey: string;
  /** Numeric client id YouTube expects in `X-YouTube-Client-Name`. */
  clientNameId: number;
  /** Request headers, including the User-Agent the client would really send. */
  headers: Record<string, string>;
  /** Innertube `context` object for the POST body. */
  context: Record<string, unknown>;
  /** Send consent cookies (needed for the HTML/watch-page path in the EU). */
  consent?: boolean;
}

const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const VR_UA = "com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12; GB) gzip";

/** Consent + visitor cookies that make YouTube skip its interstitial. */
export const CONSENT_COOKIE =
  "CONSENT=YES+cb.20210328-17-p0.en+FX+410; SOCS=CAISNQgDEitib3FfaWRlbnRpdHlmcm9udGVuZHVpc2VydmVyXzIwMjMwODI5LjA3X3AxGgJlbiACGgYIgLC_pwY";

export const INNERTUBE_CLIENTS: InnertubeClient[] = [
  {
    id: "web",
    label: "WEB",
    apiKey: "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
    clientNameId: 1,
    headers: {
      "content-type": "application/json",
      "user-agent": CHROME_UA,
      "accept-language": "en-US,en;q=0.9",
      origin: "https://www.youtube.com",
      referer: "https://www.youtube.com/",
      cookie: CONSENT_COOKIE,
    },
    context: {
      client: {
        clientName: "WEB",
        clientVersion: "2.20250201.00.00",
        hl: "en",
        gl: "US",
      },
      user: { lockedSafetyMode: false },
    },
    consent: true,
  },
  {
    id: "android-vr",
    label: "ANDROID_VR",
    // The VR client is the most reliable server-side identity in practice: no
    // consent wall, no sign-in requirement, and it keeps exposing caption
    // tracks from datacenter IPs.
    apiKey: "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
    clientNameId: 28,
    headers: {
      "content-type": "application/json",
      "user-agent": VR_UA,
      "accept-language": "en-US,en;q=0.9",
    },
    context: {
      client: {
        clientName: "ANDROID_VR",
        clientVersion: "1.60.19",
        androidSdkVersion: 32,
        deviceMake: "Oculus",
        deviceModel: "Quest 3",
        osName: "Android",
        osVersion: "12",
        hl: "en",
        gl: "US",
        userAgent: VR_UA,
      },
    },
  },
  {
    id: "web-embedded",
    label: "WEB_EMBEDDED_PLAYER",
    apiKey: "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
    clientNameId: 56,
    headers: {
      "content-type": "application/json",
      "user-agent": CHROME_UA,
      "accept-language": "en-US,en;q=0.9",
      origin: "https://www.youtube.com",
      referer: "https://www.youtube.com/",
      cookie: CONSENT_COOKIE,
    },
    context: {
      client: {
        clientName: "WEB_EMBEDDED_PLAYER",
        clientVersion: "1.20250201.00.00",
        hl: "en",
        gl: "US",
      },
      thirdParty: { embedUrl: "https://www.youtube.com/" },
    },
    consent: true,
  },
  {
    id: "tv-embedded",
    label: "TVHTML5_SIMPLY_EMBEDDED_PLAYER",
    // The embedded-TV identity takes a different path through YouTube's checks,
    // so it is worth one request when the browser-like clients are walled.
    // ios and android are deliberately absent: both return HTTP 400 in production,
    // which is a configuration failure, not evidence about the video.
    apiKey: "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
    clientNameId: 85,
    headers: {
      "content-type": "application/json",
      "user-agent":
        "Mozilla/5.0 (PlayStation; PlayStation 4/12.00) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15",
      "accept-language": "en-US,en;q=0.9",
      origin: "https://www.youtube.com",
      referer: "https://www.youtube.com/tv",
      cookie: CONSENT_COOKIE,
    },
    context: {
      client: {
        clientName: "TVHTML5_SIMPLY_EMBEDDED_PLAYER",
        clientVersion: "2.0",
        clientScreen: "EMBED",
        hl: "en",
        gl: "US",
      },
      thirdParty: { embedUrl: "https://www.youtube.com/tv" },
    },
    consent: true,
  },
];

/**
 * Optional egress proxy for hosts whose IP range YouTube throttles.
 *
 * `TRANSCRIPT_PROXY_URL` may be a prefix (`https://proxy/`) or a template
 * containing `{url}`. It is applied to *every* YouTube request — Innertube
 * player POSTs, signed and unsigned `timedtext`, and the watch page — so the
 * escape hatch works no matter which strategy would have succeeded.
 */
export function proxiedFetcher(): typeof fetch | undefined {
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

/** The client used for follow-up requests (watch page, unsigned timedtext). */
export const PRIMARY_CLIENT = INNERTUBE_CLIENTS[0];

/** Headers for fetching a signed `timedtext` URL. */
export function timedTextHeaders(client: InnertubeClient): Record<string, string> {
  return {
    "accept-language": "en-US,en;q=0.9",
    "user-agent": client.headers["user-agent"] ?? CHROME_UA,
    ...(client.consent ? { cookie: CONSENT_COOKIE } : {}),
  };
}

/**
 * The Innertube player endpoint, with the client's public API key and the
 * client identity headers that must accompany the POST body.
 */
export function playerRequest(client: InnertubeClient): { url: string; headers: Record<string, string> } {
  return {
    url: `https://www.youtube.com/youtubei/v1/player?key=${client.apiKey}&prettyPrint=false`,
    headers: {
      ...client.headers,
      "x-youtube-client-name": String(client.clientNameId),
      "x-youtube-client-version": String(
        (client.context.client as { clientVersion?: string })?.clientVersion ?? "",
      ),
    },
  };
}

/**
 * Force the response format on a signed caption URL. The URL is signed, so the
 * only safe edit is adding/replacing the `fmt` parameter.
 */
export function withCaptionFormat(
  baseUrl: string,
  format: "json3" | "srv3" | "vtt",
): string {
  try {
    const url = new URL(baseUrl);
    url.searchParams.set("fmt", format);
    return url.toString();
  } catch {
    return baseUrl.includes("?")
      ? `${baseUrl}&fmt=${format}`
      : `${baseUrl}?fmt=${format}`;
  }
}

/**
 * The public `timedtext` endpoint, unsigned. Manual caption tracks are often
 * served here without any player round-trip at all — one cheap request that
 * sometimes succeeds when every Innertube client is blocked.
 */
export function unsignedTimedTextUrl(videoId: string, lang: string, asr = false): string {
  const params = new URLSearchParams({
    v: videoId,
    lang,
    fmt: "json3",
  });
  if (asr) params.set("kind", "asr");
  return `https://www.youtube.com/api/timedtext?${params.toString()}`;
}

/** Exposed for tests: the unit each parser reports. */
export type CaptionTimeUnit = TimeUnit;
