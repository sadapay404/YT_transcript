/**
 * Clip-plan exports: a spreadsheet for planning and an SRT for editors.
 *
 * CSV — one row per clip with everything needed to cut and post it (times,
 * hook score, hook line, caption, hashtags and a deep link to the moment).
 * SRT — one cue per clip over its real time range, so an editor (Premiere,
 * DaVinci, CapCut) shows every clip as a labelled marker on the timeline.
 */
import type { ViralClip } from "@/lib/types";
import { csvCell, formatSrtTime, roundTime } from "@/lib/export/formats";

export type ClipExportFormat = "csv" | "srt";

/** Clips in rank order (highest hook score first, then earliest). */
export function rankClips(clips: ViralClip[]): ViralClip[] {
  return [...clips].sort((a, b) => b.viral_score - a.viral_score || a.start - b.start);
}

export function clipHashtags(clip: ViralClip): string {
  return (clip.hashtags ?? []).join(" ");
}

/** Caption + hashtags, ready to paste into Shorts / Reels / TikTok. */
export function clipPostText(clip: ViralClip): string {
  return [clip.caption?.trim() || clip.title, clipHashtags(clip)].filter(Boolean).join("\n\n");
}

export function buildClipsCsv(clips: ViralClip[], videoId?: string): string {
  const linkable = Boolean(videoId && /^[\w-]{11}$/.test(videoId));
  const rows = [
    [
      "rank",
      "title",
      "start",
      "end",
      "start_seconds",
      "end_seconds",
      "duration_seconds",
      "hook_score",
      "hook_type",
      "hook_line",
      "caption",
      "hashtags",
      "why_it_works",
      "transcript",
      "link",
    ],
    ...rankClips(clips).map((clip, index) => [
      String(index + 1),
      clip.title,
      clock(clip.start),
      clock(clip.end),
      String(roundTime(clip.start)),
      String(roundTime(clip.end)),
      String(roundTime(clip.end - clip.start)),
      String(Math.round(clip.viral_score)),
      clip.hookType,
      clip.hook_line ?? "",
      clip.caption ?? "",
      clipHashtags(clip),
      clip.reason ?? "",
      clip.transcript_text,
      linkable ? `https://youtu.be/${videoId}?t=${Math.floor(clip.start)}` : "",
    ]),
  ];
  // BOM so Excel opens UTF-8 (emoji, accents) correctly.
  return `\uFEFF${rows.map((row) => row.map((cell) => csvCell(safeCell(cell))).join(",")).join("\r\n")}\r\n`;
}

export function buildClipsSrt(clips: ViralClip[]): string {
  const ranked = rankClips(clips);
  const rank = new Map(ranked.map((clip, index) => [clip.id, index + 1]));
  return `${[...clips]
    .sort((a, b) => a.start - b.start)
    .map((clip, index) => {
      const lines = [
        `#${rank.get(clip.id)} ${clip.title} (hook ${Math.round(clip.viral_score)})`,
        clip.hook_line ? `“${clip.hook_line}”` : "",
      ].filter(Boolean);
      return `${index + 1}\n${formatSrtTime(clip.start)} --> ${formatSrtTime(clip.end)}\n${lines.join("\n")}`;
    })
    .join("\n\n")}\n`;
}

export function clipsFilename(base: string, format: ClipExportFormat): string {
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "transtudio"}-viral-clips.${format}`;
}

/** Spreadsheet formula injection guard: never start a cell with = + - @. */
function safeCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function clock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return h
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}
