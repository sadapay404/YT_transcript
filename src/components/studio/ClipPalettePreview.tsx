"use client";

/**
 * Step-5 preview: the 16-tint clip palette. Rendering the real Tailwind classes
 * here is also the visual contract test — if a class were missing from the
 * safelist, this grid would show it immediately.
 */
import { motion } from "framer-motion";
import { Copy, Play, Sparkles } from "lucide-react";

import { CLIP_PALETTE } from "@/lib/constants";

export function ClipPalettePreview() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-16">
        {CLIP_PALETTE.map((color, index) => (
          <motion.span
            key={color.id}
            initial={{ opacity: 0, scale: 0.6 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.02, type: "spring", stiffness: 400, damping: 26 }}
            whileHover={{ scale: 1.25, zIndex: 10 }}
            title={`${color.label} — ${color.bg} / ${color.hex}`}
            className={`h-7 rounded-md border ${color.bg} ${color.border}`}
          />
        ))}
      </div>

      {/* Two neighbouring clips: the colours are what visually separate them. */}
      <div className="flex flex-col gap-1.5">
        {[CLIP_PALETTE[6], CLIP_PALETTE[12]].map((color, index) => (
          <div
            key={color.id}
            className={`clip-band group flex items-start gap-3 px-3 py-2 ${color.bg}`}
            style={
              {
                "--clip-hex": color.hex,
                "--clip-glow": color.glow,
              } as React.CSSProperties
            }
          >
            <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${color.accent}`} />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-ink">
                {index === 0
                  ? "The 3-second hook that stops the scroll"
                  : "The counter-intuitive pricing insight"}
              </p>
              <p className="mt-0.5 line-clamp-2 text-[12px] text-ink-soft">
                {index === 0
                  ? "Because the honest truth is, nobody tells you this part in the first ten minutes…"
                  : "So we dropped the price, and revenue went up 40% in a single quarter."}
              </p>
              <div className="mt-1.5 flex items-center gap-2 text-[10px] font-medium text-ink-faint">
                <span className="font-mono tabular-nums">02:14 → 02:48</span>
                <span className="chip !py-0 !text-[9px]">
                  viral {index === 0 ? 94 : 88}
                </span>
              </div>
            </div>

            {/* Floating actions appear on hover — exactly how Step 5 behaves. */}
            <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              <button type="button" className="btn btn-icon h-7 w-7 border border-line" title="Copy clip">
                <Copy className="h-3 w-3" />
              </button>
              <button type="button" className="btn btn-icon h-7 w-7 border border-line" title="Play clip">
                <Play className="h-3 w-3" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <p className="flex items-center gap-1.5 text-[11px] text-ink-faint">
        <Sparkles className="h-3 w-3 text-accent" />
        Each Gemini clip gets its own tint, so touching clips never blur together.
      </p>
    </div>
  );
}
