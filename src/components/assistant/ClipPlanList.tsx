"use client";

import { Scissors, Sparkles } from "lucide-react";

import type { ClipPlan, ViralClip } from "@/lib/types";
import { ClipActions } from "@/components/workspace/ClipActions";
import { cn } from "@/lib/utils";

export function ClipPlanList({ plan, clips }: { plan: ClipPlan; clips: ViralClip[] }) {
  return (
    <section className="mt-3 border-t border-line pt-3" aria-label="Viral clip plan" data-clip-plan>
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-accent"><Scissors className="h-3.5 w-3.5" /></span>
        <div className="min-w-0">
          <h4 className="text-[12px] font-semibold text-ink">Viral moments</h4>
          <p className="text-[10.5px] text-ink-faint">
            {clips.length} mapped {clips.length === 1 ? "clip" : "clips"}
            {plan.overall_score !== undefined ? ` · ${Math.round(plan.overall_score)}/100 overall` : ""}
          </p>
        </div>
      </div>
      {plan.summary && <p className="mt-2 text-[11.5px] leading-relaxed text-ink-soft">{plan.summary}</p>}
      {clips.length > 0 ? (
        <ol className="mt-2 flex max-h-72 flex-col gap-1.5 overflow-y-auto pr-1">
          {clips.map((clip) => (
            <li
              key={clip.id}
              className={cn("group rounded-lg border border-line px-2.5 py-2", clip.color.bg)}
              style={{ "--clip-hex": clip.color.hex, "--clip-glow": clip.color.glow } as React.CSSProperties}
              data-clip-id={clip.id}
            >
              <div className="flex items-start gap-2">
                <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", clip.color.accent)} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-medium text-ink">{clip.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-ink-soft">{clip.transcript_text}</p>
                  <div className="mt-1 flex items-center gap-2 font-mono text-[9.5px] text-ink-faint">
                    <span>{formatTime(clip.start)}–{formatTime(clip.end)}</span>
                    <span className="chip !px-1.5 !py-0 !text-[9px]">{clip.hookType}</span>
                    <span className="inline-flex items-center gap-1"><Sparkles className="h-2.5 w-2.5 text-accent" />{Math.round(clip.viral_score)}</span>
                  </div>
                </div>
                <ClipActions clip={clip} compact className="shrink-0 opacity-70 transition-opacity group-hover:opacity-100" />
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-2 rounded-lg border border-line bg-ink/[0.04] px-2.5 py-2 text-[11px] text-ink-faint">
          The model returned moments that could not be located in the caption timing, so no unsafe bands were painted.
        </p>
      )}
    </section>
  );
}

function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}
