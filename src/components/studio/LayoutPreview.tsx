"use client";

/**
 * A live, interactive preview of the three view modes — the *same* Framer
 * Motion `layout` technique the real workspace uses in Step 2/3, so what you
 * see here is exactly how the panes will reflow once a video is loaded.
 */
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Play } from "lucide-react";

import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/stores/useSettingsStore";

const LINES = [
  "So the first thing I want to talk about is attention.",
  "Every platform is fighting for the same 30 seconds of your day.",
  "That's why the hook matters more than the middle.",
  "If the first three seconds miss, nothing else gets seen.",
  "Let me show you exactly how we test a hook.",
  "We run five variants before we ever touch the edit.",
];

const SPRING = { type: "spring", stiffness: 300, damping: 30 } as const;

export function LayoutPreview() {
  const viewMode = useSettingsStore((s) => s.viewMode);
  const [active, setActive] = useState(2);

  // Cycle the "playhead" so the kinetic highlight is visible at a glance.
  useEffect(() => {
    const timer = setInterval(() => setActive((i) => (i + 1) % LINES.length), 2200);
    return () => clearInterval(timer);
  }, []);

  return (
    <motion.div
      layout
      transition={SPRING}
      className={cn(
        "grid gap-3",
        viewMode === "split" && "md:grid-cols-2",
        viewMode === "cinema" && "grid-cols-1",
        viewMode === "read" && "mx-auto w-full max-w-2xl grid-cols-1",
      )}
    >
      <AnimatePresence initial={false} mode="popLayout">
        {viewMode !== "read" && (
          <motion.div
            key="preview-player"
            layout
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.94 }}
            transition={SPRING}
            className={cn(
              "relative overflow-hidden rounded-2xl border border-line bg-canvas-2",
              viewMode === "cinema" ? "aspect-[21/9]" : "aspect-video",
            )}
          >
            <div className="absolute inset-0 bg-[radial-gradient(120%_100%_at_20%_10%,color-mix(in_oklab,var(--accent)_35%,transparent),transparent_60%)]" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="relative flex h-12 w-12 items-center justify-center rounded-full border border-line-strong bg-canvas/60 backdrop-blur">
                <span className="animate-pulse-ring absolute inset-0 rounded-full border border-accent/60" />
                <Play className="h-5 w-5 text-ink" />
              </span>
            </div>
            <div className="absolute inset-x-3 bottom-3">
              <div className="h-1 overflow-hidden rounded-full bg-white/15">
                <motion.div
                  className="h-full rounded-full bg-accent"
                  animate={{ width: `${((active + 1) / LINES.length) * 100}%` }}
                  transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        layout
        transition={SPRING}
        className="panel relative overflow-hidden p-2.5"
      >
        <div className="flex flex-col gap-0.5">
          {LINES.map((line, index) => (
            <div
              key={line}
              className="relative rounded-lg px-2 py-1.5 text-[12.5px]"
              style={{ color: index === active ? "var(--ink)" : "var(--ink-faint)" }}
            >
              {index === active && (
                <motion.span
                  layoutId="preview-active-wash"
                  className="active-wash"
                  transition={SPRING}
                />
              )}
              <span className="mr-2 font-mono text-[9.5px] tabular-nums opacity-70">
                {String(Math.floor(index * 0.42)).padStart(2, "0")}:{String((index * 17) % 60).padStart(2, "0")}
              </span>
              {line}
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
