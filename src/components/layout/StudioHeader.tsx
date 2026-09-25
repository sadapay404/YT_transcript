"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { AudioLines, PanelRight } from "lucide-react";

import { APP_NAME, APP_SUBTITLE } from "@/lib/constants";
import { StylePanel } from "@/components/layout/StylePanel";
import { ThemeSwitcher } from "@/components/layout/ThemeSwitcher";
import { ViewModeSwitch } from "@/components/layout/ViewModeSwitch";
import { useSettingsStore } from "@/stores/useSettingsStore";

/**
 * Sticky application chrome — deliberately thin (56px) so the player and the
 * transcript rail get every available pixel. Only working controls live here.
 */
export function StudioHeader() {
  const sidebarOpen = useSettingsStore((s) => s.sidebarOpen);
  const toggleSidebar = useSettingsStore((s) => s.toggleSidebar);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/72 backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto flex h-14 max-w-[1900px] items-center gap-3 px-3 sm:px-4">
        {/* ── Brand ─────────────────────────────────────────────────────── */}
        <Link href="/" className="group flex items-center gap-2.5 select-none">
          <span className="relative flex h-8 w-8 items-center justify-center rounded-[0.6rem] border border-line-strong bg-ink/[0.06]">
            <motion.span
              className="absolute inset-0 rounded-[0.6rem] bg-accent/25 blur-md"
              animate={{ opacity: [0.35, 0.8, 0.35] }}
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

        {/* ── Actions: theme, style studio, assistant panel ─────────────── */}
        <div className="flex items-center gap-1.5">
          <ThemeSwitcher />
          <StylePanel />

          <button
            type="button"
            onClick={toggleSidebar}
            aria-pressed={sidebarOpen}
            title="Assistant panel"
            className="btn btn-icon h-9 w-9 border border-line"
          >
            <PanelRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
