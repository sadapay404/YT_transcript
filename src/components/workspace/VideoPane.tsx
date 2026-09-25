"use client";

/**
 * Player pane: the embed plus a custom transport bar.
 *
 * We hide YouTube's chrome (`controls: 0`) because the app draws its own —
 * a scrubbable progress rail, a live timecode, and (from Step 5) clip looping.
 * An "Open on YouTube" link keeps the native player one click away for anyone
 * who wants captions/settings/quality controls.
 */
import { motion } from "framer-motion";
import {
  ExternalLink,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useRef, useState } from "react";

import { cn, formatDuration, formatTimestamp } from "@/lib/utils";
import { YouTubePlayer } from "@/components/player/YouTubePlayer";
import { usePlaybackStore } from "@/stores/usePlaybackStore";
import { useTranscriptStore } from "@/stores/useTranscriptStore";

export function VideoPane({ className }: { className?: string }) {
  const metadata = useTranscriptStore((s) => s.metadata);
  const transcript = useTranscriptStore((s) => s.transcript);

  const status = usePlaybackStore((s) => s.status);
  const currentTime = usePlaybackStore((s) => s.currentTime);
  const duration = usePlaybackStore((s) => s.duration);
  const playerReady = usePlaybackStore((s) => s.playerReady);
  const playerError = usePlaybackStore((s) => s.playerError);
  const controller = usePlaybackStore((s) => s.controller);
  const togglePlay = usePlaybackStore((s) => s.togglePlay);
  const seekTo = usePlaybackStore((s) => s.seekTo);

  const [muted, setMuted] = useState(false);
  const railRef = useRef<HTMLDivElement>(null);

  const isDemo = transcript?.source === "demo";
  const isPlaying = status === "playing" || status === "buffering";
  const effectiveDuration = duration || transcript?.durationSeconds || 0;
  const progress =
    effectiveDuration > 0 ? Math.min(100, (currentTime / effectiveDuration) * 100) : 0;

  /** Mute is player state, not React state — read it back after toggling. */
  const toggleMute = () => {
    if (!controller) return;
    const next = !controller.isMuted();
    controller.setMuted(next);
    setMuted(next);
  };

  /** Click or drag anywhere on the rail to scrub. */
  const scrubTo = (clientX: number) => {
    const rail = railRef.current;
    if (!rail || effectiveDuration <= 0) return;
    const rect = rail.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    seekTo(ratio * effectiveDuration);
  };

  return (
    <section className={cn("flex flex-col", className)} aria-label="Video">
      {/* ── Video / placeholder ─────────────────────────────────────────── */}
      <div className="relative aspect-video w-full overflow-hidden rounded-t-[var(--radius-panel)] bg-black">
        {isDemo || !metadata?.videoId ? (
          <DemoBackdrop />
        ) : (
          <YouTubePlayer
            videoId={metadata.videoId}
            {...(metadata.startAt ? { startAt: metadata.startAt } : {})}
            className="h-full w-full"
          />
        )}

        {/* Buffering shimmer */}
        {!isDemo && status === "buffering" && !playerError && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25"
          >
            <Loader2 className="h-6 w-6 animate-spin text-white/80" />
          </motion.span>
        )}

        {/* Big play affordance before first playback */}
        {!isDemo && playerReady && !isPlaying && currentTime === 0 && (
          <button
            type="button"
            onClick={togglePlay}
            className="group absolute inset-0 flex items-center justify-center bg-black/20 transition-colors hover:bg-black/30"
            aria-label="Play video"
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-full border border-white/25 bg-black/45 backdrop-blur-md transition-transform group-hover:scale-105">
              <Play className="ml-1 h-6 w-6 text-white" />
            </span>
          </button>
        )}
      </div>

      {/* ── Transport ───────────────────────────────────────────────────── */}
      <div className="border-t border-line bg-surface-2/60 px-3 py-2.5">
        {/* Progress rail */}
        <div
          ref={railRef}
          role="slider"
          tabIndex={0}
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(effectiveDuration)}
          aria-valuenow={Math.round(currentTime)}
          aria-valuetext={`${formatTimestamp(currentTime, effectiveDuration >= 3600)} of ${formatDuration(effectiveDuration)}`}
          onPointerDown={(event) => {
            if (isDemo) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            scrubTo(event.clientX);
          }}
          onPointerMove={(event) => {
            if (event.buttons !== 1 || isDemo) return;
            scrubTo(event.clientX);
          }}
          onKeyDown={(event) => {
            if (isDemo) return;
            if (event.key === "ArrowRight") seekTo(currentTime + 5);
            if (event.key === "ArrowLeft") seekTo(currentTime - 5);
          }}
          className={cn(
            "group relative h-4 cursor-pointer",
            (isDemo || !playerReady) && "cursor-default opacity-60",
          )}
        >
          <span className="absolute top-1/2 h-1 w-full -translate-y-1/2 overflow-hidden rounded-full bg-ink/12">
            <span
              className="block h-full rounded-full bg-accent transition-[width] duration-150 ease-linear"
              style={{ width: `${progress}%` }}
            />
          </span>
          <span
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent opacity-0 shadow-[0_0_0_3px_var(--accent-soft)] transition-opacity group-hover:opacity-100"
            style={{ left: `${progress}%` }}
          />
        </div>

        {/* Controls */}
        <div className="mt-1.5 flex items-center gap-2">
          <button
            type="button"
            onClick={togglePlay}
            disabled={isDemo || !playerReady}
            title={isPlaying ? "Pause (space)" : "Play (space)"}
            className="btn btn-icon h-9 w-9 border border-line disabled:opacity-40"
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>

          <button
            type="button"
            onClick={() => seekTo(Math.max(0, currentTime - 10))}
            disabled={isDemo || !playerReady}
            title="Back 10 seconds"
            className="btn btn-icon hidden h-9 w-9 border border-line disabled:opacity-40 sm:inline-flex"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>

          <span className="font-mono text-[11.5px] text-ink-soft tabular-nums">
            <span className="text-ink">{formatTimestamp(currentTime, effectiveDuration >= 3600)}</span>
            <span className="text-ink-faint">
              {" / "}
              {effectiveDuration > 0 ? formatDuration(effectiveDuration) : "--:--"}
            </span>
          </span>

          <span className="flex-1" />

          {transcript && transcript.source !== "demo" && (
            <span className="chip hidden !text-[9px] sm:inline-flex">
              {transcript.source === "youtube-transcript" ? "scraped" : transcript.source}
            </span>
          )}

          <button
            type="button"
            onClick={toggleMute}
            disabled={isDemo || !playerReady}
            title="Mute / unmute"
            className="btn btn-icon h-9 w-9 border border-line disabled:opacity-40"
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>

          {metadata?.videoId && (
            <a
              href={`https://www.youtube.com/watch?v=${metadata.videoId}&t=${Math.floor(currentTime)}s`}
              target="_blank"
              rel="noreferrer"
              title="Open on YouTube"
              className="btn btn-icon h-9 w-9 border border-line"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

/** Shown for the demo transcript, which has no video behind it. */
function DemoBackdrop() {
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-canvas-2">
      <div className="absolute inset-0 bg-[radial-gradient(120%_100%_at_20%_0%,color-mix(in_oklab,var(--accent)_28%,transparent),transparent_62%)]" />
      <div className="aurora-grid absolute inset-0" />
      <div className="relative max-w-sm px-6 text-center">
        <p className="font-mono text-[10px] tracking-[0.2em] text-accent uppercase">
          Demo transcript
        </p>
        <p className="mt-2 text-[15px] font-semibold text-ink">
          There&apos;s no video behind this one
        </p>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-soft">
          It exists so you can read, seek and export without a network. Paste a real
          YouTube link to load an actual video.
        </p>
      </div>
    </div>
  );
}
