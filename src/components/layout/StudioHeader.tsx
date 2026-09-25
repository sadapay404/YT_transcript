"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { AudioLines, Download, PanelRight, Settings2, Sparkles } from "lucide-react";

import { APP_NAME, APP_SUBTITLE } from "@/lib/constants";
import { ThemeSwitcher } from "@/components/layout/ThemeSwitcher";
import { ViewModeSwitch } from "@/components/layout/ViewModeSwitch";
import { useSettingsStore } from "@/stores/useSettingsStore";

/**
 * Sticky application chrome. Kept deliberately thin (56px) so the media pane
 * and transcript rail get every available pixel.
 */
export function StudioHeader() {
  const sidebarOpen = useSettingsStore((s) => s.sidebarOpen);
  const toggleSidebar = useSettingsStore((s) => s.toggleSidebar);
  const exportReady = false; // Step 5 wires the export menu in.

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/72 backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto flex h-14 max-w-[1900px] items-center gap-3 px-3 sm:px-4">
        {/* ── Brand ─────────────────────────────────────────────────────── */}
        <Link href="/" className="group flex items-center gap-2.5 select-none">
          <span className="relative flex h-8 w-8 items-center justify-center rounded-[0.6rem] border border-line-strong bg-ink/[0.06]">
            <motion.span
              className="absolute inset-0 rounded-[0.6rem] bg-accent/25 blur-md"
              animate={{ opacity: [0.4, 0.85, 0.4] }}
              transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
            />
            <AudioLines className="relative h-4 w-4 text-accent" />
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-gradient text-[15px] font-bold tracking-tight">
              {APP_NAME}
            </span>
            <span className="mt-0.5 hidden text-[10px] font-medium tracking-[0.16em] text-ink-faint uppercase sm:block">
              {APP_SUBTITLE}
            </span>
          </span>
        </Link>

        <span className="mx-1 hidden h-6 w-px bg-line md:block" />

        {/* ── Layout mode ───────────────────────────────────────────────── */}
        <div className="hidden md:block">
          <ViewModeSwitch />
        </div>

        <div className="flex-1" />

        {/* ── Actions ───────────────────────────────────────────────────── */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={!exportReady}
            title="Export transcript (Step 5)"
            className="btn hidden h-9 gap-2 border border-line px-2.5 sm:flex"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="text-[12.5px]">Export</span>
          </button>

          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noreferrer"
            title="Get a free Gemini API key (no credit card)"
            className="btn hidden h-9 gap-2 border border-line px-2.5 lg:flex"
          >
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            <span className="text-[12.5px]">Free API key</span>
          </a>

          <ThemeSwitcher />

          <button
            type="button"
            onClick={toggleSidebar}
            aria-pressed={sidebarOpen}
            title="Toggle the Gemini assistant panel"
            className="btn btn-icon h-9 w-9 border border-line"
          >
            <PanelRight className="h-4 w-4" />
          </button>

          <button
            type="button"
            title="Studio settings (Step 3)"
            className="btn btn-icon hidden h-9 w-9 border border-line sm:inline-flex"
          >
            <Settings2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
