"use client";

import { motion } from "framer-motion";
import {
  Captions,
  Download,
  Palette,
  Scissors,
  Sparkles,
  Wand2,
} from "lucide-react";

import { APP_TAGLINE } from "@/lib/constants";
import { ClipPalettePreview } from "@/components/studio/ClipPalettePreview";
import { LayoutPreview } from "@/components/studio/LayoutPreview";
import { ThemeGallery } from "@/components/studio/ThemeGallery";
import { TypographyStudio } from "@/components/studio/TypographyStudio";
import { ViewModeSwitch } from "@/components/layout/ViewModeSwitch";
import { UrlBar } from "@/components/workspace/UrlBar";

const HEADLINE = ["Read", "it.", "Clip", "it.", "Ship", "it."];

const FEATURES = [
  {
    icon: <Captions className="h-4 w-4" />,
    title: "Synchronized transcript",
    body: "Server-side caption scraping — no YouTube API quota, no keys. Lines follow the audio, and clicking any sentence seeks the player.",
  },
  {
    icon: <Scissors className="h-4 w-4" />,
    title: "Viral clip engine",
    body: "Gemini reads the whole transcript and returns 10–16 structured clips with timestamps, hooks and virality scores.",
  },
  {
    icon: <Wand2 className="h-4 w-4" />,
    title: "Colour-coded sync",
    body: "Every clip paints its own tint across the transcript, with floating copy + loop-play controls attached to the block.",
  },
  {
    icon: <Download className="h-4 w-4" />,
    title: "Export anywhere",
    body: "TXT, Markdown, SRT, VTT, JSON or CSV — with or without timestamps, in one click.",
  },
  {
    icon: <Palette className="h-4 w-4" />,
    title: "Four full themes",
    body: "Pure OLED, Cyberpunk, Aurora Glass and Zen Paper — each one a complete token set, not a filter.",
  },
  {
    icon: <Sparkles className="h-4 w-4" />,
    title: "Zero cost stack",
    body: "Next.js on a free host, Gemini free tier, self-hosted fonts. No credit card at any point.",
  },
];

export function LandingView() {
  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 pt-10 pb-20 sm:px-6">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="flex flex-col items-center text-center">
        <motion.span
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="chip chip-accent"
        >
          <Sparkles className="h-3 w-3" />
          {APP_TAGLINE}
        </motion.span>

        <h1 className="mt-5 text-4xl leading-[1.05] font-black tracking-tight sm:text-6xl lg:text-7xl">
          {HEADLINE.map((word, index) => (
            <motion.span
              key={word + index}
              initial={{ opacity: 0, y: 24, filter: "blur(12px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{
                delay: 0.08 * index,
                duration: 0.7,
                ease: [0.22, 1, 0.36, 1],
              }}
              className={`mr-[0.28em] inline-block ${
                index % 2 === 1 ? "text-gradient" : "text-ink"
              }`}
            >
              {word}
            </motion.span>
          ))}
        </h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-5 max-w-2xl text-[15px] leading-relaxed text-ink-soft"
        >
          Paste a YouTube link and get a synced, searchable transcript you can
          actually read — then let Gemini hunt the viral moments and paint them
          straight onto the text. Free forever, no API quotas, no sign-up.
        </motion.p>

        {/* The real thing — paste a link and the transcript loads. */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55, type: "spring", stiffness: 260, damping: 28 }}
          className="mt-8 w-full max-w-2xl"
        >
          <UrlBar autoFocus />
        </motion.div>
      </section>

      {/* ── Layout preview ───────────────────────────────────────────────── */}
      <section className="mt-14">
        <SectionHeading
          eyebrow="View modes"
          title="Fluid panes"
          body="Switch the layout and the panes reflow with shared-layout animation — no remount, no jank, no video reload."
          action={<ViewModeSwitch />}
        />
        <div className="panel mt-4 p-3">
          <LayoutPreview />
        </div>
      </section>

      {/* ── Themes ───────────────────────────────────────────────────────── */}
      <section className="mt-14">
        <SectionHeading
          eyebrow="Design system"
          title="Four complete themes"
          body="Each theme is a full token set — surfaces, ink, accents, glow, blur — driven by CSS variables on <html>. Switching never re-mounts a component."
        />
        <div className="mt-4">
          <ThemeGallery />
        </div>
      </section>

      {/* ── Typography + palette ─────────────────────────────────────────── */}
      <section className="mt-14 grid gap-4 lg:grid-cols-2">
        <div className="panel p-4">
          <SectionHeading
            eyebrow="Typography studio"
            title="Built for long reads"
            body="Size, leading, tracking and line length — plus an OpenDyslexic option for readers who need it."
          />
          <div className="mt-4">
            <TypographyStudio />
          </div>
        </div>

        <div className="panel p-4">
          <SectionHeading
            eyebrow="Step 5 preview"
            title="16-tint clip palette"
            body="Distinct hues for neighbouring clips, applied to transcript bands with hover elevation and floating actions."
          />
          <div className="mt-4">
            <ClipPalettePreview />
          </div>
        </div>
      </section>

      {/* ── Feature grid ─────────────────────────────────────────────────── */}
      <section className="mt-14">
        <SectionHeading
          eyebrow="What's coming"
          title="Everything in the build plan"
          body="Five steps, each one shippable on its own."
        />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, index) => (
            <motion.article
              key={feature.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.04, duration: 0.5 }}
              whileHover={{ y: -4 }}
              className="panel group p-4"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-line-strong bg-accent-soft text-accent transition-colors group-hover:border-accent/50">
                {feature.icon}
              </span>
              <h3 className="mt-3 text-[14px] font-bold text-ink">{feature.title}</h3>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-soft">
                {feature.body}
              </p>
            </motion.article>
          ))}
        </div>
      </section>
    </main>
  );
}

function SectionHeading({
  eyebrow,
  title,
  body,
  action,
}: {
  eyebrow: string;
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        <p className="text-[11px] font-semibold tracking-[0.16em] text-accent uppercase">
          {eyebrow}
        </p>
        <h2 className="mt-1.5 text-2xl font-bold tracking-tight text-ink sm:text-[28px]">
          {title}
        </h2>
        {body && (
          <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">{body}</p>
        )}
      </div>
      {action}
    </div>
  );
}
