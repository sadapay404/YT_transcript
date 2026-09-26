/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Fetch captions from the visitor's own connection.
 * ─────────────────────────────────────────────────────────────────────────────
 *  The server-side ladder is limited by the *server's* IP: from Vercel (and any
 *  datacenter range) YouTube answers `LOGIN_REQUIRED — Sign in to confirm you're
 *  not a bot`, while the very same request from a home connection succeeds. So
 *  when the server reports a host block, the browser — sitting on the visitor's
 *  own network — is the better place to ask.
 *
 *  Two honest caveats, both surfaced to the user rather than hidden:
 *   • This depends on YouTube allowing a cross-origin (CORS) read of the caption
 *     endpoint. It may refuse; that is a dead end we report, not an error we
 *     dress up.
 *   • Only signed/normal caption URLs are requested, one format at a time, with
 *     a short timeout, so a refusal costs a moment and nothing else.
 */
import { parseCaptionBody } from "@/lib/youtube/parse";
import { normalizeSegments } from "@/lib/youtube/normalize";
import { withCaptionFormat, unsignedTimedTextUrl } from "@/lib/youtube/clients";
import type { TranscriptSegment } from "@/lib/types";

export interface BrowserCaptionFailure {
  ok: false;
  /** Short, user-facing reason. */
  reason: string;
  /** Every attempt, so the UI can show what was tried (same shape as the server). */
  attempts: string[];
}

export interface BrowserCaptionSuccess {
  ok: true;
  segments: TranscriptSegment[];
  format: string;
  language: string;
  attempts: string[];
}

export type BrowserCaptionResult = BrowserCaptionSuccess | BrowserCaptionFailure;

/** Ordered best-first: real JSON, then the two XML dialects, then WebVTT. */
const FORMATS = ["json3", "srv3", "vtt"] as const;

async function timedFetch(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      // No cookies: a logged-in YouTube session is not required for public
      // captions, and omitting credentials keeps this a plain CORS read.
      credentials: "omit",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Try to read a caption track directly from the browser.
 *
 * `captionBaseUrl` is the signed URL from a player response when we have one
 * (it is language-specific); otherwise the unsigned endpoint is tried for the
 * requested language and then English.
 */
export async function fetchCaptionsInBrowser(
  videoId: string,
  options: { lang?: string; captionBaseUrl?: string; timeoutMs?: number } = {},
): Promise<BrowserCaptionResult> {
  const timeoutMs = options.timeoutMs ?? 8_000;
  const attempts: string[] = [];

  const candidates: Array<{ label: string; base: string }> = [];
  if (options.captionBaseUrl) {
    candidates.push({ label: "your player's caption track", base: options.captionBaseUrl });
  }
  const language = options.lang?.toLowerCase();
  const languages = Array.from(new Set([language, language?.split("-")[0], "en"].filter(Boolean))) as string[];
  for (const code of languages) {
    candidates.push({ label: `${code} (auto-generated allowed)`, base: unsignedTimedTextUrl(videoId, code) });
  }

  for (const candidate of candidates) {
    for (const format of FORMATS) {
      const url = withCaptionFormat(candidate.base, format);
      try {
        const response = await timedFetch(url, timeoutMs);
        if (!response.ok) {
          attempts.push(`✗ ${candidate.label} · ${format} — HTTP ${response.status}`);
          continue;
        }

        const body = await response.text();
        if (!body.trim()) {
          attempts.push(`✗ ${candidate.label} · ${format} — empty`);
          continue;
        }

        const parsed = parseCaptionBody(body);
        if (parsed.empty) {
          attempts.push(`✗ ${candidate.label} · ${format} — parsed as ${parsed.format}, no text`);
          continue;
        }

        const normalized = normalizeSegments(parsed.segments, { forceUnit: parsed.unit });
        if (normalized.segments.length === 0) {
          attempts.push(`✗ ${candidate.label} · ${format} — no usable lines`);
          continue;
        }

        attempts.push(`✓ ${candidate.label} · ${parsed.format} — ${normalized.segments.length} lines`);
        return {
          ok: true,
          segments: normalized.segments,
          format: parsed.format,
          language: candidate.label.split(" ")[0],
          attempts,
        };
      } catch (error) {
        const detail = error instanceof Error ? error.message : "failed";
        // A CORS refusal and a network failure both land here; the browser does
        // not tell page scripts which one it was, so say so plainly.
        attempts.push(
          `✗ ${candidate.label} · ${format} — ${detail}. If every line says "Failed to fetch", YouTube did not allow this page to read captions; use the paste option instead.`,
        );
      }
    }
  }

  return {
    ok: false,
    reason:
      "The browser could not read YouTube's captions. YouTube, CORS, or the network may have refused the request.",
    attempts,
  };
}
