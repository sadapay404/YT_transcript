"use client";

import { useId } from "react";

import { cn } from "@/lib/utils";

/**
 * NexAI's mark: a four-point spark in a blue → violet → rose gradient, the
 * visual language people already read as "AI". Unique gradient ids per
 * instance so several marks on one page never share (and break) a <defs>.
 */
export function NexAIMark({ className, animated = false }: { className?: string; animated?: boolean }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 24 24" className={cn("nexai-mark", animated && "nexai-mark--live", className)} aria-hidden="true">
      <defs>
        <linearGradient id={`nx-a-${id}`} x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4C8DFF" />
          <stop offset="0.52" stopColor="#9B6BFF" />
          <stop offset="1" stopColor="#FF6FA3" />
        </linearGradient>
        <radialGradient id={`nx-b-${id}`} cx="12" cy="12" r="8" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fff" stopOpacity="0.85" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <path
        d="M12 1.5c.5 4.9 2.4 7.9 5.6 9.3 1.3.6 2.9.9 4.9 1.2-4.9.5-7.9 2.4-9.3 5.6-.6 1.3-.9 2.9-1.2 4.9-.5-4.9-2.4-7.9-5.6-9.3C5.1 12.6 3.5 12.3 1.5 12c4.9-.5 7.9-2.4 9.3-5.6.6-1.3.9-2.9 1.2-4.9Z"
        fill={`url(#nx-a-${id})`}
      />
      <circle cx="12" cy="12" r="3.2" fill={`url(#nx-b-${id})`} />
      <path
        d="M19.3 2.2c.15 1.2.6 1.9 1.4 2.25.35.15.75.25 1.3.3-1.2.15-1.95.6-2.3 1.4-.15.35-.25.75-.3 1.3-.15-1.2-.6-1.95-1.4-2.3-.35-.15-.75-.25-1.3-.3 1.2-.15 1.95-.6 2.3-1.4.15-.35.25-.75.3-1.25Z"
        fill="#FFB86B"
      />
    </svg>
  );
}

/** Google Gemini's spark (colour version; icon path from @lobehub/icons, MIT). */
export function GeminiLogo({ className }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  const d =
    "M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z";
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`g0-${id}`} gradientUnits="userSpaceOnUse" x1="7" x2="11" y1="15.5" y2="12">
          <stop stopColor="#08B962" />
          <stop offset="1" stopColor="#08B962" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`g1-${id}`} gradientUnits="userSpaceOnUse" x1="8" x2="11.5" y1="5.5" y2="11">
          <stop stopColor="#F94543" />
          <stop offset="1" stopColor="#F94543" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`g2-${id}`} gradientUnits="userSpaceOnUse" x1="3.5" x2="17.5" y1="13.5" y2="12">
          <stop stopColor="#FABC12" />
          <stop offset=".46" stopColor="#FABC12" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={d} fill="#3186FF" />
      <path d={d} fill={`url(#g0-${id})`} />
      <path d={d} fill={`url(#g1-${id})`} />
      <path d={d} fill={`url(#g2-${id})`} />
    </svg>
  );
}

/** Groq's mark in its brand orange (icon path from @lobehub/icons, MIT). */
export function GroqLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect width="24" height="24" rx="6" fill="#F55036" />
      <path
        transform="translate(2.4 2.4) scale(0.8)"
        fill="#fff"
        d="M12.036 2c-3.853-.035-7 3-7.036 6.781-.035 3.782 3.055 6.872 6.908 6.907h2.42v-2.566h-2.292c-2.407.028-4.38-1.866-4.408-4.23-.029-2.362 1.901-4.298 4.308-4.326h.1c2.407 0 4.358 1.915 4.365 4.278v6.305c0 2.342-1.944 4.25-4.323 4.279a4.375 4.375 0 01-3.033-1.252l-1.851 1.818A7 7 0 0012.029 22h.092c3.803-.056 6.858-3.083 6.879-6.816v-6.5C18.907 4.963 15.817 2 12.036 2z"
      />
    </svg>
  );
}

/** "Auto": both providers, Gemini in front. */
export function AutoLogo({ className }: { className?: string }) {
  return (
    <span className={cn("relative inline-flex", className)} aria-hidden="true">
      <GroqLogo className="absolute right-0 bottom-0 h-[62%] w-[62%] rounded-[4px] ring-1 ring-[var(--surface)]" />
      <GeminiLogo className="absolute top-0 left-0 h-[72%] w-[72%]" />
    </span>
  );
}
