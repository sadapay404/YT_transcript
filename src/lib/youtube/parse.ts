/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Caption parsers — pure, unit-tested, and defensive about format.
 * ─────────────────────────────────────────────────────────────────────────────
 *  The previous implementation relied on `youtube-transcript`, which only
 *  understands two XML shapes. When YouTube answered with anything else
 *  (json3, WebVTT, a consent page) the parser returned an **empty array** and
 *  the app said "no captions" for every video — a silent failure.
 *
 *  So: detect the format from the body, parse all four shapes YouTube actually
 *  serves, and always report the *time unit* explicitly (ms vs s) instead of
 *  leaving anyone to guess.
 */
import type { RawTranscriptSegment } from "@/lib/types";
import { normalizeCaption } from "@/lib/utils";

export type TimeUnit = "ms" | "s";

export type CaptionFormat = "json3" | "srv3" | "classic" | "vtt" | "unknown";

export interface ParsedCaptions {
  segments: RawTranscriptSegment[];
  /** Explicit unit — feeds `normalizeSegments(raw, { forceUnit })`. */
  unit: TimeUnit;
  format: CaptionFormat;
  /** True when the body was recognised but contained no usable text. */
  empty: boolean;
}

/* ───────────────────────────── HTML entities ────────────────────────────── */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#39": "'",
  "#34": '"',
  "#38": "&",
};

export function decodeEntities(text: string): string {
  return text
    .replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (match, code: string) => {
      if (code.startsWith("#x") || code.startsWith("#X")) {
        const value = Number.parseInt(code.slice(2), 16);
        return Number.isFinite(value) ? safeFromCodePoint(value) : match;
      }
      if (code.startsWith("#")) {
        const value = Number.parseInt(code.slice(1), 10);
        return Number.isFinite(value) ? safeFromCodePoint(value) : match;
      }
      return NAMED_ENTITIES[code] ?? match;
    })
    // Bare ampersands inside ASR text are common; normalise them last.
    .replace(/&(?!(?:[a-zA-Z]+|#\d+|#x[0-9a-f]+);)/g, "&");
}

function safeFromCodePoint(value: number): string {
  try {
    return String.fromCodePoint(value);
  } catch {
    return "";
  }
}

/* ──────────────────────────── Format detection ──────────────────────────── */

export function detectCaptionFormat(body: string): CaptionFormat {
  const head = body.slice(0, 400).trimStart();

  if (head.startsWith("WEBVTT")) return "vtt";
  if (head.startsWith("{")) {
    // json3 is the only JSON shape YouTube's timedtext endpoint returns.
    return head.includes('"events"') || head.includes('"wireMagic"') ? "json3" : "unknown";
  }
  if (head.includes("<p ") && /\st="\d+"/.test(head)) return "srv3";
  if (head.includes("<text ")) return "classic";
  // Some responses put the root tag after an XML declaration/whitespace.
  if (body.includes("<p t=")) return "srv3";
  if (body.includes("<text start=")) return "classic";
  return "unknown";
}

/** Detect + parse in one call. Never throws. */
export function parseCaptionBody(body: string): ParsedCaptions {
  const format = detectCaptionFormat(body);

  switch (format) {
    case "json3":
      return { ...parseJson3Body(body), format: "json3" };
    case "srv3":
      return { ...parseSrv3Xml(body), format: "srv3" };
    case "classic":
      return { ...parseClassicXml(body), format: "classic" };
    case "vtt":
      return { ...parseVtt(body), format: "vtt" };
    default:
      return { segments: [], unit: "s", format: "unknown", empty: true };
  }
}

/* ─────────────────────────────── json3 ──────────────────────────────────── */

interface Json3Event {
  tStartMs?: number;
  dDurationMs?: number;
  aAppend?: number;
  segs?: Array<{ utf8?: string }>;
}

interface Json3Body {
  events?: Json3Event[];
}

/** A caption line as it is being built from (possibly word-level) events. */
interface LineDraft {
  text: string;
  startMs: number;
  endMs: number;
}

/** Median of a numeric list (never mutates the input). */
function medianOf(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Force a new line if a single line grows past this (ASR safety valve). */
const MAX_LINE_CHARS = 118;
/** …or if the speaker pauses for longer than this. */
const MAX_LINE_GAP_MS = 900;
/** …or if one line would run longer than this (run-on ASR). */
const MAX_LINE_MS = 9_000;

/**
 * Parse YouTube's `fmt=json3` payload.
 *
 * Auto-generated tracks emit **word-level** events plus `aAppend` continuation
 * events whose text is just "\n" — that newline is YouTube's own line marker.
 * Rebuilding lines from those markers gives natural, readable captions instead
 * of one line per word.
 */
export function parseJson3Body(body: string): {
  segments: RawTranscriptSegment[];
  unit: TimeUnit;
  empty: boolean;
} {
  let payload: Json3Body;
  try {
    payload = JSON.parse(body) as Json3Body;
  } catch {
    return { segments: [], unit: "ms", empty: true };
  }

  const events = (Array.isArray(payload.events) ? payload.events : []).filter(
    (event): event is Json3Event => Boolean(event && Array.isArray(event.segs)),
  );

  /**
   * Manual tracks deliver one event per caption line; auto-generated tracks
   * deliver one event per *word*. Merging word-level events rebuilds readable
   * lines, but merging line-level events would destroy YouTube's own
   * granularity (and, later, the precision of clip ranges) — so detect which
   * kind of payload this is before merging anything.
   */
  const durations = events.map((event) => Number(event.dDurationMs ?? 0)).filter((value) => value > 0);
  const lengths = events.map((event) => (event.segs ?? []).map((seg) => seg.utf8 ?? "").join("").trim().length).filter((value) => value > 0);
  const wordLevel = medianOf(durations) < 1_500 && medianOf(lengths) < 45;

  const segments: RawTranscriptSegment[] = [];
  let draft: LineDraft | null = null;

  const flush = () => {
    if (!draft) return;
    const text = normalizeCaption(draft.text);
    if (text) {
      segments.push({
        text,
        offset: Math.max(0, Math.round(draft.startMs)),
        // Always leave a visible window, even for instantaneous events.
        duration: Math.max(200, Math.round(draft.endMs - draft.startMs)),
      });
    }
    draft = null;
  };

  for (const event of events) {
    const raw = (event.segs ?? []).map((seg) => seg.utf8 ?? "").join("");
    if (!raw) continue;

    const startMs = Number(event.tStartMs ?? 0);
    const durationMs = Number(event.dDurationMs ?? 0);
    const endMs = startMs + (durationMs > 0 ? durationMs : 0);
    // "\n" (or text ending in one) is YouTube's explicit line break.
    const breaksLine = raw.includes("\n");
    const text = raw.replace(/\s+/g, " ");

    if (!wordLevel) {
      // Line-level payload: one event is one line, exactly as YouTube built it.
      if (text.trim()) {
        segments.push({
          text: normalizeCaption(text),
          offset: Math.max(0, Math.round(startMs)),
          duration: Math.max(200, Math.round(durationMs)),
        });
      }
      continue;
    }

    if (draft && startMs - draft.endMs > MAX_LINE_GAP_MS) flush();

    if (text.trim()) {
      if (!draft) {
        draft = { text: text.trimStart(), startMs, endMs: Math.max(endMs, startMs + 400) };
      } else {
        draft.text += text;
        draft.endMs = Math.max(draft.endMs, endMs, draft.startMs + 400);
      }
    }

    if (draft) {
      const overlong =
        draft.text.length >= MAX_LINE_CHARS || draft.endMs - draft.startMs >= MAX_LINE_MS;
      if (breaksLine || overlong) flush();
    }
  }

  flush();

  return { segments, unit: "ms", empty: segments.length === 0 };
}

/**
 * Read an attribute from a tag's attribute string.
 *
 * Deliberately NOT part of the tag regex: an optional group after a lazy
 * `[^>]*?` gets skipped by the engine, which silently dropped `d="…"` (and
 * `dur="…"`) — the exact class of bug that produced empty transcripts. Parsing
 * the attributes separately is order-independent and cannot regress that way.
 */
function readAttr(attributes: string, name: string): string | undefined {
  const match = attributes.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`));
  return match?.[1];
}

/* ──────────────────────────── srv3 (XML) ────────────────────────────────── */

/**
 * `<p t="12340" d="2000"><s>Hello</s><s> world</s></p>`
 * Values are **milliseconds**.
 */
export function parseSrv3Xml(xml: string): {
  segments: RawTranscriptSegment[];
  unit: TimeUnit;
  empty: boolean;
} {
  const segments: RawTranscriptSegment[] = [];
  const paragraph = /<p\s([^>]*)>([\s\S]*?)<\/p>/g;

  let match: RegExpExecArray | null;
  while ((match = paragraph.exec(xml)) !== null) {
    const attributes = match[1] ?? "";
    const startMs = Number.parseInt(readAttr(attributes, "t") ?? "", 10);
    if (!Number.isFinite(startMs)) continue;

    const parsedDuration = Number.parseInt(readAttr(attributes, "d") ?? "", 10);
    const durationMs = Number.isFinite(parsedDuration) ? parsedDuration : 0;
    const inner = match[2] ?? "";

    // Prefer the word nodes; fall back to stripping tags from the paragraph.
    const words: string[] = [];
    const word = /<s[^>]*>([\s\S]*?)<\/s>/g;
    let wordMatch: RegExpExecArray | null;
    while ((wordMatch = word.exec(inner)) !== null) words.push(wordMatch[1]);

    const rawText = words.length > 0 ? words.join("") : inner.replace(/<[^>]+>/g, " ");
    const text = normalizeCaption(decodeEntities(rawText));
    if (!text) continue;

    segments.push({
      text,
      offset: startMs,
      duration: Math.max(200, durationMs),
    });
  }

  return { segments, unit: "ms", empty: segments.length === 0 };
}

/* ─────────────────────────── classic (XML) ──────────────────────────────── */

/**
 * `<text start="12.34" dur="4.56">Hello&amp;world</text>`
 * Values are **seconds** (floats).
 */
export function parseClassicXml(xml: string): {
  segments: RawTranscriptSegment[];
  unit: TimeUnit;
  empty: boolean;
} {
  const segments: RawTranscriptSegment[] = [];
  const node = /<text\s([^>]*)>([\s\S]*?)<\/text>/g;

  let match: RegExpExecArray | null;
  while ((match = node.exec(xml)) !== null) {
    const attributes = match[1] ?? "";
    const start = Number.parseFloat(readAttr(attributes, "start") ?? "");
    if (!Number.isFinite(start)) continue;

    const parsedDuration = Number.parseFloat(readAttr(attributes, "dur") ?? "");
    const duration = Number.isFinite(parsedDuration) ? parsedDuration : 0;
    const text = normalizeCaption(decodeEntities(match[2] ?? "").replace(/<[^>]+>/g, " "));
    if (!text) continue;

    segments.push({
      text,
      offset: start,
      duration: Math.max(0.2, Number.isFinite(duration) ? duration : 0),
    });
  }

  return { segments, unit: "s", empty: segments.length === 0 };
}

/* ─────────────────────────────── WebVTT ─────────────────────────────────── */

/** `00:01:02.500 --> 00:01:04.000` (hour part optional, `.` or `,`). */
const VTT_TIMING =
  /(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})\s*-->\s*(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/;

function vttSeconds(hours?: string, minutes?: string, seconds?: string, ms?: string) {
  return (
    Number(hours ?? 0) * 3600 +
    Number(minutes ?? 0) * 60 +
    Number(seconds ?? 0) +
    Number((ms ?? "0").padEnd(3, "0")) / 1000
  );
}

export function parseVtt(body: string): {
  segments: RawTranscriptSegment[];
  unit: TimeUnit;
  empty: boolean;
} {
  const segments: RawTranscriptSegment[] = [];
  const blocks = body.replace(/\r\n/g, "\n").split(/\n{2,}/);

  for (const block of blocks) {
    const lines = block.split("\n").filter((line) => line.trim().length > 0);
    const timingIndex = lines.findIndex((line) => VTT_TIMING.test(line));
    if (timingIndex === -1) continue;

    const match = lines[timingIndex].match(VTT_TIMING);
    if (!match) continue;

    const start = vttSeconds(match[1], match[2], match[3], match[4]);
    const end = vttSeconds(match[5], match[6], match[7], match[8]);

    const text = normalizeCaption(
      lines
        .slice(timingIndex + 1)
        .join(" ")
        // Strip inline tags (<c>, <00:00:01.000>) and the speaker prefix.
        .replace(/<[^>]+>/g, "")
        .replace(/^[A-Z][A-Za-z0-9 _-]{0,30}:\s*/, ""),
    );
    if (!text) continue;

    segments.push({
      text: decodeEntities(text),
      offset: Number(start.toFixed(3)),
      duration: Number(Math.max(0.2, end - start).toFixed(3)),
    });
  }

  return { segments, unit: "s", empty: segments.length === 0 };
}

/* ─────────────────────── Watch-page HTML extraction ─────────────────────── */

/**
 * Pull `ytInitialPlayerResponse` out of a watch page.
 *
 * Uses a brace-matching scan (string- and escape-aware) rather than a regex,
 * because the JSON contains nested objects and escaped quotes that a regex
 * cannot reliably delimit.
 */
export function extractInitialPlayerResponse(html: string): unknown | null {
  const markers = [
    "ytInitialPlayerResponse = ",
    "ytInitialPlayerResponse=",
    '"ytInitialPlayerResponse":',
  ];

  for (const marker of markers) {
    const at = html.indexOf(marker);
    if (at === -1) continue;

    const start = html.indexOf("{", at + marker.length);
    if (start === -1) continue;

    const json = readBalancedJson(html, start);
    if (!json) continue;

    try {
      return JSON.parse(json) as unknown;
    } catch {
      continue;
    }
  }

  return null;
}

/** Return the balanced `{…}` slice starting at `start`, or null. */
function readBalancedJson(source: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < source.length; index += 1) {
    const char = source[index];

    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }

    // Bail out on absurdly long scans (malformed page).
    if (index - start > 4_000_000) return null;
  }

  return null;
}

/* ─────────────────────────── Player response ────────────────────────────── */

export interface CaptionTrackInfo {
  baseUrl: string;
  languageCode: string;
  name?: string;
  kind?: string;
  isTranslatable?: boolean;
}

export interface PlayerResponseInfo {
  status: string;
  reason?: string;
  videoId?: string;
  title?: string;
  author?: string;
  lengthSeconds?: number;
  captionTracks: CaptionTrackInfo[];
  /** True when every available track is auto-generated (ASR). */
  onlyAutoGenerated: boolean;
}

/** Normalise either an Innertube response or scraped HTML into our shape. */
export function readPlayerResponse(payload: unknown): PlayerResponseInfo {
  const root = (payload ?? {}) as {
    playabilityStatus?: { status?: string; reason?: string };
    videoDetails?: {
      videoId?: string;
      title?: string;
      author?: string;
      lengthSeconds?: string | number;
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
  };

  const rawTracks =
    root.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];

  const captionTracks: CaptionTrackInfo[] = rawTracks
    .filter((track): track is typeof track & { baseUrl: string; languageCode: string } =>
      Boolean(track?.baseUrl && track?.languageCode),
    )
    .map((track) => ({
      baseUrl: track.baseUrl,
      languageCode: track.languageCode,
      ...(track.name?.simpleText || track.name?.runs
        ? {
            name:
              track.name?.simpleText ??
              track.name?.runs?.map((run) => run.text ?? "").join(""),
          }
        : {}),
      ...(track.kind ? { kind: track.kind } : {}),
      ...(track.isTranslatable !== undefined
        ? { isTranslatable: track.isTranslatable }
        : {}),
    }));

  return {
    status: root.playabilityStatus?.status ?? "UNKNOWN",
    ...(root.playabilityStatus?.reason ? { reason: root.playabilityStatus.reason } : {}),
    ...(root.videoDetails?.videoId ? { videoId: root.videoDetails.videoId } : {}),
    ...(root.videoDetails?.title ? { title: root.videoDetails.title } : {}),
    ...(root.videoDetails?.author ? { author: root.videoDetails.author } : {}),
    ...(Number(root.videoDetails?.lengthSeconds) > 0
      ? { lengthSeconds: Number(root.videoDetails?.lengthSeconds) }
      : {}),
    captionTracks,
    onlyAutoGenerated:
      captionTracks.length > 0 && captionTracks.every((track) => track.kind === "asr"),
  };
}
