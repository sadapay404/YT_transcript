"use client";

import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

const STEPS = [
  "Reading every line",
  "Scoring opening hooks",
  "Cutting 15–90s moments",
  "Writing titles, captions & hashtags",
];

/**
 * What a clip request looks like while it runs. The steps advance on a timer
 * (the model does these in one pass), so they describe the work honestly
 * without pretending to report server progress.
 */
export function ClipScanning({ lines }: { lines: number }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setStep((value) => Math.min(STEPS.length - 1, value + 1)), 2600);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="nexai-scan rounded-2xl rounded-tl-md border border-line p-3" aria-live="polite" data-clip-scanning>
      <p className="text-[12.5px] font-semibold text-ink">Hunting for viral moments…</p>
      <p className="mt-0.5 text-[10.5px] text-ink-faint">
        {lines ? `${lines.toLocaleString()} lines · ` : ""}usually 10–30 seconds
      </p>
      <ol className="mt-2.5 flex flex-col gap-1.5">
        {STEPS.map((label, index) => (
          <li
            key={label}
            className={cn(
              "flex items-center gap-2 text-[11.5px] transition-colors",
              index < step ? "text-ink-soft" : index === step ? "text-ink" : "text-ink-faint/70",
            )}
          >
            <span className="flex h-4 w-4 items-center justify-center">
              {index < step ? (
                <Check className="h-3.5 w-3.5 text-success" />
              ) : index === step ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-line-strong" />
              )}
            </span>
            {label}
          </li>
        ))}
      </ol>
      <div className="mt-3 flex flex-col gap-1.5" aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <div key={index} className="flex items-center gap-2 rounded-xl border border-line bg-surface/60 p-2">
            <div className="skeleton h-8 w-8 shrink-0 rounded-lg" />
            <div className="flex-1 space-y-1.5">
              <div className="skeleton h-2.5" style={{ width: `${[78, 64, 70][index]}%` }} />
              <div className="skeleton h-2" style={{ width: `${[52, 44, 58][index]}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
