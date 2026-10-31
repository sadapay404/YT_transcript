"use client";

import { useId } from "react";

import { cn } from "@/lib/utils";

/**
 * TranStudio's mark — an open book with a speech waveform running through it —
 * redrawn as SVG so it follows the live theme. Colours come from `--logo-*`
 * variables in globals.css: terracotta on Zen Paper, white/indigo on Pure OLED,
 * neon on Cyberpunk and a violet → cyan gradient on Liquid Glass.
 *
 * The book is drawn symmetrically inside its viewBox, so it always sits in the
 * optical centre of whatever box contains it.
 */
export function TranStudioMark({ className }: { className?: string }) {
  const gradientId = `tran-wave-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden="true"
      className={cn("tran-logo-mark", className)}
    >
      <defs>
        <linearGradient id={gradientId} x1="6" y1="0" x2="94" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" style={{ stopColor: "var(--logo-wave-a)" }} />
          <stop offset="1" style={{ stopColor: "var(--logo-wave-b)" }} />
        </linearGradient>
      </defs>

      {/* Pages */}
      <g
        className="tran-logo-book"
        strokeWidth="3.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M50 28C43 22 33 19.5 22 20.5V70C33 69 43 71.5 50 77.5C57 71.5 67 69 78 70V20.5C67 19.5 57 22 50 28Z" />
        <path d="M50 28V77.5" />
        <path d="M14 27V77C28 76 40 78 50 84C60 78 72 76 86 77V27" />
      </g>

      {/* Voice waveform threading through the book */}
      <path
        d="M5 55C13 47 21 46 28 51C33 55 37 56 41 52L45 57L49 38L53.5 68L57.5 45L61 55C67 50 76 49 95 55"
        stroke={`url(#${gradientId})`}
        strokeWidth="3.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Mark + wordmark lockup (footer). */
export function TranStudioWordmark({ className }: { className?: string }) {
  return (
    <div
      className={cn("flex items-center gap-2", className)}
      role="img"
      aria-label="TranStudio by Mubashir"
    >
      <TranStudioMark className="h-9 w-9 shrink-0" />
      <span className="flex flex-col leading-none">
        <span className="tran-logo-name text-[19px] font-bold tracking-[-0.03em]">
          TranStudio
        </span>
        <span className="tran-logo-by mt-0.5 text-[9.5px] font-semibold tracking-[0.18em] uppercase">
          By Mubashir
        </span>
      </span>
    </div>
  );
}
