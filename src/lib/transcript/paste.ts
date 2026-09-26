/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Paste a transcript — the no-network path to real captions.
 * ─────────────────────────────────────────────────────────────────────────────
 *  Every server-side route to YouTube can be blocked: datacenter IPs get
 *  challenged, and a browser fetch is subject to YouTube's CORS policy. What is
 *  *always* available is the transcript already sitting in the visitor's own
 *  browser tab. This module turns that text into the same payload shape the
 *  scraper produces, so reading, seeking, clip bands, theming and every export
 *  work identically — no keys, no proxy, no network call.
 *
 *  Format coverage, in detection order:
 *   1. SRT            1\n00:00:01,000 --> 00:00:04,000\ntext
 *   2. WebVTT         WEBVTT\n\n00:00:01.000 --> 00:00:04.000\ntext
 *   3. YouTube panel  two lines per cue: "0:03" then "hello there."
 *   4. Inline stamps  "[00:12] hello" / "00:12 hello" / "(1:02:03) hello"
 *   5. Plain text     split into readable lines; no timestamps (still readable,
 *                     searchable, exportable — just not seekable)
 */
import type { RawTranscriptSegment, TranscriptSegment } from "@/lib/types";
import { countWords, normalizeCaption } from "@/lib/utils";

export type PasteFormat = "srt" | "vtt" | "youtube-panel" | "inline" | "plain";

export interface PastedTranscript {
  segments: TranscriptSegment[];
  format: PasteFormat;
  /** True when real timestamps were found (seeking is possible). */
  timed: boolean;
  /** Human-readable notes about anything lost or assumed in parsing. */
  warnings: string[];
  durationSeconds: number;
  text: string;
  wordCount: number;
  characterCount: number;
}

export class PasteParseError extends Error {
  readonly code = "empty-paste";
  constructor(message: string) {
    super(message);
    this.name = "PasteParseError";
  }
}

/* ─────────────────────────────── timecodes ──────────────────────────────── */

/** `1:02:03,500` / `01:02:03.5` / `2:03` / `45` → seconds, or null. */
export function parseTimecode(input: string): number | null {
  const trimmed = input.trim().replace(",", ".");
  if (!trimmed) return null;
  if (!/^\d{1,2}(:\d{2}){0,2}(\.\d{1,3})?$/.test(trimmed)) return null;

  const parts = trimmed.split(":");
  if (parts.length > 3) return null;

  const seconds = Number.parseFloat(parts.pop() as string);
  if (!Number.isFinite(seconds)) return null;

  const minutes = parts.length > 0 ? Number.parseInt(parts.pop() as string, 10) : 0;
  const hours = parts.length > 0 ? Number.parseInt(parts.pop() as string, 10) : 0;
  if ([minutes, hours].some((value) => !Number.isFinite(value))) return null;

  return hours * 3600 + minutes * 60 + seconds;
}

/** SRT/VTT cue header: `00:00:01,000 --> 00:00:04,000` (plus optional VTT settings). */
const CUE = /(\d{1,2}(?::\d{2}){1,2}[.,]\d{1,3})\s*-->\s*(\d{1,2}(?::\d{2}){1,2}[.,]\d{1,3})/;

/** YouTube's transcript panel: a bare timestamp on its own line. */
const PANEL_STAMP = /^(\d{1,2}(?::\d{2}){1,2})$/;

/**
 * A timecode inside running text: `[00:12]`, `(0:12)`, `00:12 -`, `1:02:03:`.
 * Minutes are required (at least one colon) — otherwise a bare "30" in prose
 * would be read as a timestamp and shred the sentence.
 */
const INLINE_STAMP = /[[(]?(\d{1,2}:\d{2}(?::\d{2})?)[\])]?\s*(?:[-–—:]\s*)?/g;

/* ─────────────────────────────── utilities ──────────────────────────────── */

/** Decode the entities that survive into exported .srt/.vtt files. */
function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&");
}

/**
 * How long a line probably takes to say, when its source gives no end time.
 * Normal speech is ~150 wpm (2.5 words/second); clamped so a one-word cue is
 * still visible and a long one does not run away with the timeline.
 */
export function estimateSpokenSeconds(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Number(Math.min(6, Math.max(1.2, words / 2.5)).toFixed(3));
}

/** Collapse a block of caption lines into one line of readable text. */
function flatten(block: string[]): string {
  return normalizeCaption(
    decodeEntities(
      block
        .join(" ")
        // Tags are removed outright, not replaced with a space — `<c>pricing</c>`
        // must not become `pricing .`
        .replace(/<[^>]+>/g, "")
        .replace(/\{\\[^}]*\}/g, ""), // SSA-style inline codes
    ),
  );
}

function finalise(raw: RawTranscriptSegment[]): {
  segments: TranscriptSegment[];
  durationSeconds: number;
  text: string;
  wordCount: number;
  characterCount: number;
} {
  // Sort defensively: panel copies and hand-edited files are not always in order.
  const ordered = [...raw].sort((a, b) => a.offset - b.offset);

  const segments: TranscriptSegment[] = ordered.map((segment, index) => ({
    ...segment,
    id: index,
    end: Number((segment.offset + segment.duration).toFixed(3)),
    charCount: segment.text.length,
  }));

  // Fill a *missing* duration (the YouTube panel format has none) from the next
  // line, so the active-line highlight has a window to work with. A real cue
  // end is left alone: .srt/.vtt files are authoritative, and their exact ends
  // are what clip ranges are computed from.
  for (let index = 0; index < segments.length - 1; index += 1) {
    const next = segments[index + 1];
    if (segments[index].duration <= 0 && next.offset > segments[index].offset) {
      segments[index].duration = Number((next.offset - segments[index].offset).toFixed(3));
      segments[index].end = next.offset;
    }
  }

  /* The final cue has nothing after it to bound it, so it would stay zero-wide:
   * it could never be the active line, and a clip range covering the whole
   * transcript would silently drop it. Estimate a window from the reading pace
   * instead — clearly an estimate, but a usable one. */
  const tail = segments.at(-1);
  if (tail && tail.duration <= 0) {
    tail.duration = estimateSpokenSeconds(tail.text);
    tail.end = Number((tail.offset + tail.duration).toFixed(3));
  }

  const text = segments.map((segment) => segment.text).join(" ");
  return {
    segments,
    durationSeconds: segments.at(-1)?.end ?? 0,
    text,
    wordCount: countWords(text),
    characterCount: text.length,
  };
}

/* ──────────────────────────────── parsers ───────────────────────────────── */

function parseCues(input: string): RawTranscriptSegment[] {
  const blocks = input.replace(/\r\n?/g, "\n").split(/\n{2,}/);
  const segments: RawTranscriptSegment[] = [];

  for (const block of blocks) {
    const lines = block.split("\n").filter((line) => line.trim().length > 0);
    if (lines.length === 0) continue;

    const cueIndex = lines.findIndex((line) => CUE.test(line));
    if (cueIndex === -1) continue;

    const match = CUE.exec(lines[cueIndex]);
    if (!match) continue;

    const start = parseTimecode(match[1]);
    const end = parseTimecode(match[2]);
    if (start === null) continue;

    const text = flatten(lines.slice(cueIndex + 1));
    if (!text) continue;

    segments.push({
      text,
      offset: start,
      // A zero/absent end is common in hand-edited files; keep a small window.
      duration: end !== null && end > start ? Number((end - start).toFixed(3)) : 0,
    });
  }

  return segments;
}

function parseYouTubePanel(input: string): RawTranscriptSegment[] {
  const lines = input.replace(/\r\n?/g, "\n").split("\n");
  const segments: RawTranscriptSegment[] = [];

  let pendingStart: number | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (pendingStart === null) return;
    const text = flatten(buffer);
    if (text) segments.push({ text, offset: pendingStart, duration: 0 });
    pendingStart = null;
    buffer = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const stamp = PANEL_STAMP.exec(trimmed);
    if (stamp) {
      const value = parseTimecode(stamp[1]);
      if (value !== null) {
        flush();
        pendingStart = value;
        continue;
      }
    }

    if (pendingStart !== null) buffer.push(trimmed);
  }
  flush();

  return segments;
}

function parseInline(input: string): RawTranscriptSegment[] {
  const segments: RawTranscriptSegment[] = [];

  for (const rawLine of input.replace(/\r\n?/g, "\n").split("\n")) {
    // A single line may carry several stamps, e.g. "0:01 hi 0:05 there", so
    // find the stamps and take the text between each pair.
    const stamps = [...rawLine.matchAll(INLINE_STAMP)].filter(
      (match) => parseTimecode(match[1]) !== null,
    );

    stamps.forEach((match, index) => {
      const start = parseTimecode(match[1]);
      if (start === null) return;

      const textStart = (match.index ?? 0) + match[0].length;
      const textEnd = index + 1 < stamps.length ? (stamps[index + 1].index ?? rawLine.length) : rawLine.length;
      const text = flatten([rawLine.slice(textStart, textEnd)]);
      if (!text) return;

      segments.push({ text, offset: start, duration: 0 });
    });
  }

  return segments;
}

function parsePlain(input: string): RawTranscriptSegment[] {
  // No timestamps: keep real paragraph/sentence boundaries so the reader still
  // gets a sensible rhythm (and the Gemini prompt still gets clean text).
  const blocks = input
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}|\n(?=[^\n])/g)
    .map((block) => flatten([block]))
    .filter((block) => block.length > 0);

  return blocks.map((text) => ({ text, offset: 0, duration: 0 }));
}

/* ─────────────────────────────── entry point ─────────────────────────────── */

export function parsePastedTranscript(input: string): PastedTranscript {
  const text = (input ?? "").replace(/\u00a0/g, " ").trim();
  if (!text) {
    throw new PasteParseError("Nothing was pasted — copy the transcript and try again.");
  }

  const warnings: string[] = [];
  let segments: RawTranscriptSegment[] = [];
  let format: PasteFormat = "plain";

  // Order matters: SRT/VTT are unambiguous, the panel format is next most
  // specific, then inline stamps, then plain text as the fallback.
  const looksSrt = CUE.test(text) && !/^WEBVTT/m.test(text);
  const looksVtt = /^WEBVTT/m.test(text);

  if (looksSrt || looksVtt) {
    format = looksVtt ? "vtt" : "srt";
    segments = parseCues(text);
  }

  if (segments.length === 0) {
    const panel = parseYouTubePanel(text);
    // The panel format needs at least two cues to be a believable match;
    // otherwise a stray "0:00" line would swallow a plain-text paste.
    if (panel.length >= 2) {
      format = "youtube-panel";
      segments = panel;
    }
  }

  if (segments.length === 0) {
    const inline = parseInline(text);
    if (inline.length >= 2) {
      format = "inline";
      segments = inline;
    }
  }

  if (segments.length === 0) {
    format = "plain";
    segments = parsePlain(text);
  }

  const timed = format !== "plain";
  if (!timed) {
    warnings.push(
      "No timestamps found, so seeking is off — reading, theming and every export still work. Copy YouTube's transcript panel (\"Show transcript\") to get timestamps.",
    );
  }
  if (format === "plain" && segments.length === 1) {
    warnings.push("That came through as one long block. Blank lines between paragraphs preserve the structure.");
  }
  if (segments.length === 0) {
    throw new PasteParseError("That text didn't contain anything readable.");
  }

  const finalised = finalise(segments);
  return { ...finalised, format, timed, warnings };
}

/** What we tell the user about where their paste went. */
export function describePasteFormat(format: PasteFormat): string {
  switch (format) {
    case "srt":
      return "SubRip (.srt)";
    case "vtt":
      return "WebVTT (.vtt)";
    case "youtube-panel":
      return "YouTube transcript panel";
    case "inline":
      return "timestamped notes";
    default:
      return "plain text";
  }
}
