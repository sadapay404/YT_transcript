"use client";

/**
 * One caption line. Clicking it seeks the video — the transcript is the control
 * surface, not just output.
 *
 * Performance note: long videos produce thousands of lines, so each line opts
 * into `content-visibility: auto` (the `.cv-auto` utility). The browser skips
 * layout and paint for off-screen lines while keeping the scroll height stable,
 * which keeps a 3-hour transcript smooth without a virtualisation library.
 */
import { memo } from "react";
import { motion } from "framer-motion";

import { cn, formatTimestamp } from "@/lib/utils";
import type { TranscriptSegment } from "@/lib/types";

interface TranscriptLineProps {
  segment: TranscriptSegment;
  active: boolean;
  showTimestamp: boolean;
  forceHours: boolean;
  /** Vertical gap between caption lines, driven by the Typography Studio. */
  onSeek: (start: number) => void;
}

function TranscriptLineComponent({
  segment,
  active,
  showTimestamp,
  forceHours,
  onSeek,
}: TranscriptLineProps) {
  return (
    <motion.li
      id={`seg-${segment.id}`}
      data-segment-id={segment.id}
      data-active={active}
      initial={false}
      animate={{ opacity: 1 }}
      className="cv-auto list-none"
    >
      <button
        type="button"
        onClick={() => onSeek(segment.offset)}
        title={`Play from ${formatTimestamp(segment.offset, forceHours)}`}
        className={cn(
          "transcript-line group flex w-full items-start gap-3 text-left",
          active && "rounded-xl bg-accent-soft",
        )}
      >
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
    prev.showTimestamp === next.showTimestamp &&
    prev.forceHours === next.forceHours,
);
