"use client";

import { Check, Clipboard, Pause, Play } from "lucide-react";

import type { ViralClip } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useClipPlayback } from "@/hooks/useClipPlayback";

export function ClipActions({
  clip,
  compact = false,
  className,
}: {
  clip: ViralClip;
  compact?: boolean;
  className?: string;
}) {
  const { copy, copied, play, armed, breathing } = useClipPlayback(clip);

  return (
    <span
      className={cn("clip-floating inline-flex items-center gap-1", className)}
      data-clip-actions={clip.id}
      data-armed={armed ? "true" : "false"}
      data-playing={breathing ? "true" : "false"}
    >
      <button
        type="button"
        aria-label={copied ? `Copied ${clip.title}` : `Copy ${clip.title}`}
        title={copied ? "Copied" : "Copy clip"}
        onClick={(event) => {
          event.stopPropagation();
          void copy().catch(() => undefined);
        }}
        className={cn(
          "btn btn-icon border border-line bg-elevated/80 backdrop-blur-md",
          compact ? "h-7 w-7" : "h-8 w-8",
        )}
      >
        {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Clipboard className="h-3.5 w-3.5" />}
      </button>
      <button
        type="button"
        aria-label={armed ? `Stop ${clip.title}` : `Play ${clip.title}`}
        title={armed ? "Stop clip loop" : "Loop play clip"}
        data-playing={breathing ? "true" : "false"}
        data-armed={armed ? "true" : "false"}
        onClick={(event) => {
          event.stopPropagation();
          play();
        }}
        className={cn(
          "btn btn-icon border border-line bg-elevated/80 backdrop-blur-md",
          compact ? "h-7 w-7" : "h-8 w-8",
          armed && "border-accent/60 text-accent",
        )}
      >
        {armed ? <Pause className="h-3.5 w-3.5" /> : <Play className="ml-0.5 h-3.5 w-3.5" />}
      </button>
    </span>
  );
}
