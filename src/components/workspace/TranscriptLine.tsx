"use client";

/**
 * One caption line. Clicking it seeks the video — the transcript is the control
 * surface, not just output.
 *
 * Step 3 adds the kinetic highlight: the wash that marks the spoken line is a
 * *single* element shared between lines by Framer Motion's `layoutId`, so it
 * travels from sentence to sentence instead of cross-fading in place. The
 * element that moves is the same one CSS has always called `.active-wash`.
 *
 * Performance note: long videos produce thousands of lines, so each line opts
 * into `content-visibility: auto` (the `.cv-auto` utility). The browser skips
 * layout and paint for off-screen lines while keeping the scroll height stable,
 * which keeps a 3-hour transcript smooth without a virtualisation library.
 */
import { memo } from "react";
import { motion } from "framer-motion";

import { cn, formatTimestamp } from "@/lib/utils";
import type { TranscriptSegment, ViralClip } from "@/lib/types";
import { ClipActions } from "@/components/workspace/ClipActions";

/**
 * One id for one moving highlight: when the spoken line changes, the old
 * element unmounts and the new one mounts with the same `layoutId`, and Motion
 * animates between the two boxes.
 */
const ACTIVE_WASH_LAYOUT_ID = "transtudio-active-wash";

/** Snappy enough to feel like the highlight is being *dragged* by the voice. */
const WASH_SPRING = {
  type: "spring",
  stiffness: 420,
  damping: 38,
  mass: 0.7,
} as const;

interface TranscriptLineProps {
  segment: TranscriptSegment;
  /** Position in `segments` — what the follow engine looks up. */
  index: number;
  active: boolean;
  showTimestamp: boolean;
  forceHours: boolean;
  /** Reduced motion: the wash changes lines without a journey. */
  reduceMotion: boolean;
  /** Called with the line's start time; the pane resumes following as well. */
  onSeek: (start: number) => void;
  /** Verified clip bands that cover this caption line. */
  clips: ViralClip[];
  /** Selection and actual playback are separate states. */
  clipArmed: boolean;
  clipPlaying: boolean;
}

function TranscriptLineComponent({
  segment,
  index,
  active,
  showTimestamp,
  forceHours,
  reduceMotion,
  onSeek,
  clips,
  clipArmed,
  clipPlaying,
}: TranscriptLineProps) {
  const actionClips = clips.filter((clip) => clip.segmentStartIndex === index);
  return (
    <motion.li
      id={`seg-${index}`}
      data-segment-index={index}
      data-segment-id={segment.id}
      data-active={active}
      data-clip-id={clips[0]?.id}
      data-armed={clipArmed ? "true" : "false"}
      data-playing={clipPlaying ? "true" : "false"}
      initial={false}
      animate={{ opacity: 1 }}
      className={cn("group cv-auto list-none", clips.length > 0 && "clip-band")}
      style={clips[0] ? { "--clip-hex": clips[0].color.hex, "--clip-glow": clips[0].color.glow } as React.CSSProperties : undefined}
    >
      <button
        type="button"
        onClick={() => onSeek(segment.offset)}
        /* `data-active` lives on the button, which is the element carrying
           `.transcript-line` — that is what the reading-surface CSS keys off. */
        data-active={active}
        title={`Play from ${formatTimestamp(segment.offset, forceHours)}`}
        className="transcript-line group flex w-full items-start gap-3 text-left"
      >
        {active && (
          <motion.span
            layoutId={ACTIVE_WASH_LAYOUT_ID}
            aria-hidden="true"
            className="active-wash"
            transition={reduceMotion ? { duration: 0 } : WASH_SPRING}
          />
        )}

        {showTimestamp && (
          <span
            className={cn(
              "mt-[0.35em] shrink-0 font-mono text-[11px] tabular-nums transition-colors",
              active ? "text-accent" : "text-ink-faint group-hover:text-ink-soft",
            )}
          >
            {formatTimestamp(segment.offset, forceHours)}
          </span>
        )}

        <span className="min-w-0 flex-1">{segment.text}</span>

        {/* Active marker: a quiet bar that becomes a glowing dot while playing. */}
        <span
          aria-hidden="true"
          className={cn(
            "mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full transition-all duration-300",
            active
              ? "bg-accent shadow-[0_0_14px_var(--glow)]"
              : "bg-transparent group-hover:bg-line-strong",
          )}
        />
      </button>
      {actionClips.length > 0 && (
        <span className="absolute top-1/2 right-2 z-10 flex -translate-y-1/2 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {actionClips.map((clip) => <ClipActions key={clip.id} clip={clip} compact />)}
        </span>
      )}
    </motion.li>
  );
}

/**
 * Memoised on purpose: the rail re-renders on every playback tick, but only the
 * two lines whose `active` flag changed should actually reconcile.
 */
export const TranscriptLine = memo(
  TranscriptLineComponent,
  (prev, next) =>
    prev.active === next.active &&
    prev.segment.id === next.segment.id &&
    prev.index === next.index &&
    prev.showTimestamp === next.showTimestamp &&
    prev.forceHours === next.forceHours &&
    prev.reduceMotion === next.reduceMotion &&
    prev.clips.length === next.clips.length &&
    prev.clips.every((clip, index) => clip.id === next.clips[index]?.id) &&
    prev.clipArmed === next.clipArmed &&
    prev.clipPlaying === next.clipPlaying,
);
