"use client";

/**
 * Style & reading preferences, in one popover:
 * typeface, sizing, reading aids, layout and playback behaviour. Theme choice
 * lives in the landing studio so the header stays calm and focused.
 *
 * Everything writes to the settings store, which mirrors to a cookie — so the
 * server renders the saved look on the next request, with no flash.
 */
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Baseline, Eye, LayoutTemplate, X } from "lucide-react";

import { Switch } from "@/components/ui/Switch";
import { TypographyStudio } from "@/components/studio/TypographyStudio";
import { ViewModeSwitch } from "@/components/layout/ViewModeSwitch";
import { useSettingsStore } from "@/stores/useSettingsStore";

export function StylePanel() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const autoScroll = useSettingsStore((s) => s.autoScroll);
  const centerActiveLine = useSettingsStore((s) => s.centerActiveLine);
  const showTimestamps = useSettingsStore((s) => s.showTimestamps);
  const showClipHighlights = useSettingsStore((s) => s.showClipHighlights);
  const reduceMotion = useSettingsStore((s) => s.reduceMotion);

  const toggleAutoScroll = useSettingsStore((s) => s.toggleAutoScroll);
  const toggleCenterActiveLine = useSettingsStore((s) => s.toggleCenterActiveLine);
  const toggleTimestamps = useSettingsStore((s) => s.toggleTimestamps);
  const toggleClipHighlights = useSettingsStore((s) => s.toggleClipHighlights);
  const toggleReduceMotion = useSettingsStore((s) => s.toggleReduceMotion);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Style & reading settings"
        className="btn btn-icon h-9 w-9 border border-line"
      >
        <Baseline className="h-4 w-4" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="Style settings"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 440, damping: 34 }}
            className="panel absolute right-0 z-50 mt-2 max-h-[78vh] w-[20.5rem] origin-top-right overflow-y-auto p-3 shadow-2xl sm:w-[23rem]"
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[11px] font-semibold tracking-[0.14em] text-ink-faint uppercase">
                Style studio
              </p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="btn btn-icon h-7 w-7 text-ink-faint"
                title="Close"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Layout */}
            <Section icon={<LayoutTemplate className="h-3.5 w-3.5" />} title="Layout">
              <ViewModeSwitch />
            </Section>

            {/* Typography */}
            <Section icon={<Baseline className="h-3.5 w-3.5" />} title="Typography">
              <TypographyStudio showSample={false} />
            </Section>

            {/* Reading aids */}
            <Section icon={<Eye className="h-3.5 w-3.5" />} title="Reading & playback">
              <div className="flex flex-col gap-0.5">
                <Switch
                  checked={autoScroll}
                  onChange={() => toggleAutoScroll()}
                  label="Follow along"
                  description="Auto-scroll the transcript as the video plays"
                />
                <Switch
                  checked={centerActiveLine}
                  onChange={() => toggleCenterActiveLine()}
                  label="Center the active line"
                  description="Keep the current sentence mid-screen"
                />
                <Switch
                  checked={showTimestamps}
                  onChange={() => toggleTimestamps()}
                  label="Show timestamps"
                  description="Offset badge beside every line"
                />
                <Switch
                  checked={showClipHighlights}
                  onChange={() => toggleClipHighlights()}
                  label="Highlight clips"
                  description="Paint detected clips onto the transcript"
                />
                <Switch
                  checked={reduceMotion}
                  onChange={() => toggleReduceMotion()}
                  label="Reduce motion"
                  description="Minimise animation across the app"
                />
              </div>
            </Section>

            <p className="mt-3 border-t border-line pt-2 text-[11px] text-ink-faint">
              Preferences are stored in a cookie, so your theme is applied before the
              page even paints.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3 last:mb-0">
      <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-ink-soft uppercase">
        <span className="text-accent">{icon}</span>
        {title}
      </p>
      {children}
    </div>
  );
}
