import { EXPORT_PRESETS } from "@/lib/constants";
import type {
  ExportFormat,
  ExportOptions,
  TranscriptPayload,
  TranscriptSegment,
  ViralClip,
} from "@/lib/types";

export interface ExportResult {
  content: string;
  filename: string;
  mimeType: string;
  format: ExportFormat;
}

/**
 * Merge caption-sized cues into readable paragraphs without treating every
 * short, punctuated YouTube cue as a paragraph. The two-cue/roughly-120
 * character floor is intentional: caption tracks often cut a sentence every
 * forty characters.
 */
export function mergeIntoParagraphs(segments: TranscriptSegment[]): string[] {
  const paragraphs: string[] = [];
  let current: string[] = [];
  let characters = 0;

  const flush = () => {
    const text = current.join(" ").replace(/\s+/g, " ").trim();
    if (text) paragraphs.push(text);
    current = [];
    characters = 0;
  };

  for (const segment of segments) {
    const text = segment.text.trim();
    if (!text) continue;
    current.push(text);
    characters += text.length + (current.length > 1 ? 1 : 0);

    const endsNaturally = /[.!?。！？]["'”’)]?$/.test(text);
    const isLongEnough = characters >= 120 && current.length >= 2;
    const isVeryLong = characters >= 260 && current.length >= 3;
    if (endsNaturally && (isLongEnough || isVeryLong)) flush();
  }
  flush();
  return paragraphs;
}

export function buildTxt(
  transcript: TranscriptPayload,
  options: Pick<ExportOptions, "includeTimestamps" | "includeHeader" | "mergeSentences"> = {
    includeTimestamps: false,
    includeHeader: true,
    mergeSentences: true,
  },
): string {
  const header = options.includeHeader ? buildPlainHeader(transcript) : "";
  const body = options.mergeSentences
    ? mergeIntoParagraphs(transcript.segments).join("\n\n")
    : transcript.segments
        .map((segment) =>
          options.includeTimestamps
            ? `[${formatTimestamp(segment.offset)}] ${segment.text.trim()}`
            : segment.text.trim(),
        )
        .filter(Boolean)
        .join("\n");

  // A timestamped merged paragraph gets one honest start marker; retaining all
  // individual cues would defeat the point of the readable text export.
  const timedBody =
    options.includeTimestamps && options.mergeSentences
      ? mergeTimedParagraphs(transcript.segments)
      : body;
  return [header, timedBody].filter(Boolean).join("\n\n").trimEnd() + "\n";
}

export function buildMarkdown(
  transcript: TranscriptPayload,
  options: Pick<ExportOptions, "includeTimestamps" | "includeHeader" | "mergeSentences"> = {
    includeTimestamps: true,
    includeHeader: true,
    mergeSentences: true,
  },
): string {
  const title = transcriptTitle(transcript);
  const lines: string[] = [];
  if (options.includeHeader) {
    lines.push(`# ${title}`, "", `- **Video ID:** \`${transcript.videoId}\``, `- **Language:** ${transcript.languageLabel || transcript.language}`, `- **Duration:** ${formatDuration(transcript.durationSeconds)}`, "");
  }

  if (options.mergeSentences) {
    const paragraphs = options.includeTimestamps
      ? mergeTimedParagraphs(transcript.segments)
      : mergeIntoParagraphs(transcript.segments);
    lines.push(...paragraphs.flatMap((paragraph) => [paragraph, ""]));
  } else {
    for (const segment of transcript.segments) {
      const prefix = options.includeTimestamps ? `**[${formatTimestamp(segment.offset)}]** ` : "";
      lines.push(`${prefix}${segment.text.trim()}`, "");
    }
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

export function buildSrt(transcript: TranscriptPayload): string {
  return transcript.segments
    .map(
      (segment, index) =>
        `${index + 1}\n${formatSrtTime(segment.offset)} --> ${formatSrtTime(segment.end)}\n${segment.text.trim()}\n`,
    )
    .join("\n");
}

export function buildVtt(transcript: TranscriptPayload): string {
  const header = ["WEBVTT", "", `NOTE ${transcriptTitle(transcript)}`, ""].join("\n");
  const body = transcript.segments
    .map(
      (segment) => `${formatVttTime(segment.offset)} --> ${formatVttTime(segment.end)}\n${segment.text.trim()}\n`,
    )
    .join("\n");
  return `${header}${body}`;
}

export function buildJson(transcript: TranscriptPayload, clips: ViralClip[] = []): string {
  return `${JSON.stringify(
    {
      app: "TranStudio",
      video: {
        id: transcript.videoId,
        title: transcriptTitle(transcript),
        url: transcript.url,
        language: transcript.language,
        durationSeconds: transcript.durationSeconds,
      },
      segments: transcript.segments.map((segment) => ({
        i: segment.id,
        start: roundTime(segment.offset),
        end: roundTime(segment.end),
        text: segment.text,
      })),
      clips: clips.map((clip) => ({
        id: clip.id,
        title: clip.title,
        start: clip.start,
        end: clip.end,
        score: clip.viral_score,
        hookType: clip.hookType,
        text: clip.transcript_text,
      })),
    },
    null,
    2,
  )}\n`;
}

export function buildCsv(transcript: TranscriptPayload): string {
  const rows = [
    ["index", "start_seconds", "end_seconds", "text"],
    ...transcript.segments.map((segment) => [
      String(segment.id),
      String(roundTime(segment.offset)),
      String(roundTime(segment.end)),
      segment.text,
    ]),
  ];
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

/** Build the selected download and its honest filename in one place. */
export function buildExport(
  transcript: TranscriptPayload,
  clips: ViralClip[] = [],
  options: ExportOptions = {
    format: "txt",
    includeTimestamps: false,
    includeHeader: true,
    mergeSentences: true,
  },
): ExportResult {
  const preset = EXPORT_PRESETS.find((entry) => entry.id === options.format) ?? EXPORT_PRESETS[0];
  let content: string;
  switch (options.format) {
    case "md":
      content = buildMarkdown(transcript, options);
      break;
    case "srt":
      content = buildSrt(transcript);
      break;
    case "vtt":
      content = buildVtt(transcript);
      break;
    case "json":
      content = buildJson(transcript, clips);
      break;
    case "csv":
      content = buildCsv(transcript);
      break;
    case "txt":
    default:
      content = buildTxt(transcript, options);
      break;
  }
  return {
    content,
    filename: exportFilename(transcript, preset.extension.slice(1)),
    mimeType: preset.mimeType,
    format: preset.id,
  };
}

export function buildExportContent(
  transcript: TranscriptPayload,
  clips: ViralClip[] = [],
  options?: ExportOptions,
): string {
  return buildExport(transcript, clips, options).content;
}

export function exportFilename(transcript: TranscriptPayload, extension: string): string {
  const title = transcriptTitle(transcript);
  const meaningfulTitle = !/^untitled video$/i.test(title) && !/^pasted transcript/i.test(title);
  const slug = meaningfulTitle ? slugify(title) : `transtudio-${slugify(transcript.videoId || "transcript")}`;
  return `${slug || "transtudio-transcript"}.${extension.replace(/^\./, "")}`;
}

function mergeTimedParagraphs(segments: TranscriptSegment[]): string[] {
  const paragraphs: string[] = [];
  let current: TranscriptSegment[] = [];
  let characters = 0;
  const flush = () => {
    if (!current.length) return;
    const text = current.map((segment) => segment.text.trim()).filter(Boolean).join(" ");
    if (text) paragraphs.push(`[${formatTimestamp(current[0].offset)}] ${text}`);
    current = [];
    characters = 0;
  };
  for (const segment of segments) {
    const text = segment.text.trim();
    if (!text) continue;
    current.push(segment);
    characters += text.length + (current.length > 1 ? 1 : 0);
    if (/[.!?。！？]["'”’)]?$/.test(text) && characters >= 120 && current.length >= 2) flush();
  }
  flush();
  return paragraphs;
}

function buildPlainHeader(transcript: TranscriptPayload): string {
  return [
    transcriptTitle(transcript),
    `Video: ${transcript.url || transcript.videoId}`,
    `Language: ${transcript.languageLabel || transcript.language}`,
    `Duration: ${formatDuration(transcript.durationSeconds)}`,
    "—".repeat(24),
  ].join("\n");
}

function transcriptTitle(transcript: TranscriptPayload): string {
  return transcript.title?.trim() || (transcript.videoId === "pasted" ? "Pasted transcript" : "Untitled video");
}

function formatTimestamp(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const minutes = Math.floor(safe / 60);
  const rest = Math.floor(safe % 60);
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function formatSrtTime(seconds: number): string {
  return formatLongTime(seconds, ",");
}

function formatVttTime(seconds: number): string {
  return formatLongTime(seconds, ".");
}

function formatLongTime(seconds: number, decimal: "," | "."): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const whole = Math.floor(safe % 60);
  const milliseconds = Math.round((safe - Math.floor(safe)) * 1000);
  const carry = milliseconds >= 1000 ? 1 : 0;
  const ms = milliseconds >= 1000 ? 0 : milliseconds;
  const second = whole + carry;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(second).padStart(2, "0")}${decimal}${String(ms).padStart(3, "0")}`;
}

function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds || 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const rest = safe % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`
    : `${minutes}:${String(rest).padStart(2, "0")}`;
}

function roundTime(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}
