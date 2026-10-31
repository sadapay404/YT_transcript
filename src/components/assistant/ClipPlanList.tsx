"use client";

import { useMemo, useState } from "react";
import { Check, Clipboard, Copy, CornerDownRight, FileSpreadsheet, Pause, Play, Subtitles } from "lucide-react";

import type { ClipPlan, ViralClip } from "@/lib/types";
import {
  buildClipsCsv,
  buildClipsSrt,
  clipPostText,
  clipsFilename,
  rankClips,
  type ClipExportFormat,
} from "@/lib/export/clips";
import { useClipPlayback, writeClipboard } from "@/hooks/useClipPlayback";
import { usePlaybackStore } from "@/stores/usePlaybackStore";
import { useTranscriptStore } from "@/stores/useTranscriptStore";
import { cn } from "@/lib/utils";

type Sort = "score" | "time";

/**
 * The clip studio inside a NexAI answer: ranked, hook-first cards with
 * everything needed to post a clip, plus exports for the whole plan.
 */
export function ClipPlanList({ plan, clips }: { plan: ClipPlan; clips: ViralClip[] }) {
  const [sort, setSort] = useState<Sort>("score");
  const transcript = useTranscriptStore((state) => state.transcript);
  const title = useTranscriptStore((state) => state.metadata?.title) || "transtudio";
  const ranked = useMemo(() => rankClips(clips), [clips]);
  const rankOf = useMemo(() => new Map(ranked.map((clip, index) => [clip.id, index + 1])), [ranked]);
  const ordered = sort === "score" ? ranked : [...clips].sort((a, b) => a.start - b.start);

  const download = (format: ClipExportFormat) => {
    const content =
      format === "csv"
        ? buildClipsCsv(clips, transcript?.source === "demo" ? undefined : transcript?.videoId)
        : buildClipsSrt(clips);
    const blob = new Blob([content], {
      type: format === "csv" ? "text/csv;charset=utf-8" : "application/x-subrip;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = clipsFilename(title, format);
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };

  return (
    <section aria-label="Viral clip plan" data-clip-plan className="nexai-clips">
      <header className="nexai-clips-head rounded-2xl rounded-tl-md border border-line p-3">
        <div className="flex items-start gap-2.5">
          <div className="min-w-0 flex-1">
            <h4 className="text-[14px] font-bold tracking-tight text-ink">
              {clips.length} viral {clips.length === 1 ? "clip" : "clips"} found
            </h4>
            {plan.summary && <p className="mt-1 text-[11.5px] leading-relaxed text-ink-soft">{plan.summary}</p>}
          </div>
          {plan.overall_score !== undefined && (
            <div className="shrink-0 text-center" title="How clippable the whole video is">
              <ScoreRing value={plan.overall_score} hex="var(--accent)" size={40} />
              <p className="mt-0.5 text-[8.5px] tracking-[0.12em] text-ink-faint uppercase">Video</p>
            </div>
          )}
        </div>

        {clips.length > 0 && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <div className="inline-flex rounded-full border border-line bg-surface p-0.5" role="group" aria-label="Sort clips">
              {(["score", "time"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSort(value)}
                  aria-pressed={sort === value}
                  className={cn(
                    "h-6 rounded-full px-2.5 text-[10.5px] font-medium transition-colors",
                    sort === value ? "bg-accent text-accent-ink" : "text-ink-soft hover:text-ink",
                  )}
                >
                  {value === "score" ? "Top hooks" : "Timeline"}
                </button>
              ))}
            </div>
            <span className="flex-1" />
            <button
              type="button"
              onClick={() => download("csv")}
              title="Download every clip as a spreadsheet (CSV)"
              data-export-clips="csv"
              className="btn h-7 gap-1 rounded-full border border-line px-2.5 text-[10.5px]"
            >
              <FileSpreadsheet className="h-3 w-3" /> CSV
            </button>
            <button
              type="button"
              onClick={() => download("srt")}
              title="Download clip markers for your video editor (SRT)"
              data-export-clips="srt"
              className="btn h-7 gap-1 rounded-full border border-line px-2.5 text-[10.5px]"
            >
              <Subtitles className="h-3 w-3" /> SRT
            </button>
          </div>
        )}
      </header>

      {clips.length > 0 ? (
        <ol className="mt-2 flex flex-col gap-2">
          {ordered.map((clip) => (
            <ClipCard key={clip.id} clip={clip} rank={rankOf.get(clip.id) ?? clip.index + 1} />
          ))}
        </ol>
      ) : (
        <p className="mt-2 rounded-xl border border-line bg-ink/[0.04] px-3 py-2 text-[11.5px] text-ink-faint">
          The moments NexAI picked couldn&apos;t be matched to the caption timing, so nothing was painted. Retry for a
          fresh pick.
        </p>
      )}
    </section>
  );
}

function ClipCard({ clip, rank }: { clip: ViralClip; rank: number }) {
  const { play, copy, copied, armed, breathing } = useClipPlayback(clip);
  const [captionCopied, setCaptionCopied] = useState(false);
  const duration = Math.max(0, Math.round(clip.end - clip.start));
  const hasPost = Boolean(clip.caption || clip.hashtags?.length);

  const copyCaption = async () => {
    await writeClipboard(clipPostText(clip)).catch(() => undefined);
    setCaptionCopied(true);
    setTimeout(() => setCaptionCopied(false), 1_400);
  };

  return (
    <li
      className={cn("nexai-clip group relative overflow-hidden rounded-2xl border border-line p-3", armed && "is-armed")}
      style={{ "--clip-hex": clip.color.hex, "--clip-glow": clip.color.glow } as React.CSSProperties}
      data-clip-id={clip.id}
      data-playing={breathing ? "true" : "false"}
    >
      <span className="nexai-clip-edge absolute inset-y-0 left-0 w-1" aria-hidden="true" />
      <div className="flex items-start gap-2.5">
        <span className="nexai-rank flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-mono text-[11px] font-bold">
          #{rank}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] leading-snug font-semibold text-ink">{clip.title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-ink-faint">
            <span>
              {formatTime(clip.start)}–{formatTime(clip.end)}
            </span>
            <span aria-hidden="true">·</span>
            <span>{duration}s</span>
            <span className="rounded-full border border-line px-1.5 py-px font-sans text-[9.5px] tracking-wide text-ink-soft capitalize">
              {clip.hookType}
            </span>
          </div>
        </div>
        <div className="shrink-0 text-center" title="Hook score: how strongly the opening stops the scroll">
          <ScoreRing value={clip.viral_score} hex={clip.color.hex} size={38} />
          <p className="mt-0.5 text-[8.5px] tracking-[0.12em] text-ink-faint uppercase">Hook</p>
        </div>
      </div>

      {clip.hook_line && (
        <blockquote className="nexai-hookline mt-2.5 rounded-lg px-2.5 py-1.5 text-[11.5px] leading-relaxed text-ink">
          “{clip.hook_line}”
        </blockquote>
      )}
      {clip.reason && (
        <p className="mt-1.5 flex gap-1 text-[11px] leading-relaxed text-ink-soft">
          <CornerDownRight className="mt-0.5 h-3 w-3 shrink-0 text-ink-faint" />
          {clip.reason}
        </p>
      )}

      {hasPost && (
        <div className="mt-2.5 rounded-xl border border-dashed border-line bg-surface/60 px-2.5 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[9px] font-semibold tracking-[0.14em] text-ink-faint uppercase">Post caption</span>
            <button
              type="button"
              onClick={() => void copyCaption()}
              className="inline-flex items-center gap-1 text-[10px] font-medium text-accent hover:underline"
              aria-label={`Copy caption for ${clip.title}`}
            >
              {captionCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {captionCopied ? "Copied" : "Copy"}
            </button>
          </div>
          {clip.caption && <p className="mt-1 text-[11.5px] leading-relaxed text-ink-soft">{clip.caption}</p>}
          {clip.hashtags && clip.hashtags.length > 0 && (
            <p className="mt-1 flex flex-wrap gap-x-1.5 text-[11px] font-medium text-accent">
              {clip.hashtags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </p>
          )}
        </div>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={play}
          aria-label={armed ? `Stop ${clip.title}` : `Play ${clip.title} on loop`}
          data-armed={armed ? "true" : "false"}
          className={cn(
            "nexai-play btn h-8 gap-1.5 rounded-full px-3 text-[11px] font-semibold",
            armed && "is-armed",
          )}
        >
          {armed ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {armed ? "Stop loop" : "Play loop"}
        </button>
        <button
          type="button"
          onClick={() => usePlaybackStore.getState().seekTo(clip.start)}
          className="btn h-8 rounded-full border border-line px-2.5 text-[11px]"
          title="Jump the video and transcript to this clip"
        >
          Jump to
        </button>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => void copy().catch(() => undefined)}
          title={copied ? "Copied" : "Copy title, time range and transcript"}
          aria-label={copied ? `Copied ${clip.title}` : `Copy ${clip.title}`}
          className="btn btn-icon h-8 w-8 rounded-full border border-line"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Clipboard className="h-3.5 w-3.5" />}
        </button>
      </div>
    </li>
  );
}

function ScoreRing({ value, hex, size }: { value: number; hex: string; size: number }) {
  const score = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <span
      className="nexai-ring relative inline-flex items-center justify-center rounded-full"
      style={
        {
          width: size,
          height: size,
          "--ring-hex": hex,
          "--ring-value": `${score * 3.6}deg`,
        } as React.CSSProperties
      }
      aria-label={`${score} out of 100`}
    >
      <span className="relative font-mono text-[11px] font-bold text-ink tabular-nums">{score}</span>
    </span>
  );
}

function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return h
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
