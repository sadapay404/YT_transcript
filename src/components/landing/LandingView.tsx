"use client";

import { motion } from "framer-motion";

import { ThemeGallery } from "@/components/studio/ThemeGallery";
import { TypographyStudio } from "@/components/studio/TypographyStudio";
import { UrlBar } from "@/components/workspace/UrlBar";

const HEADLINE = ["Read", "it.", "Clip", "it.", "Ship", "it."];

export function LandingView() {
  return (
    <main data-landing className="mx-auto w-full max-w-[1400px] px-4 pt-10 pb-20 sm:px-6">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="flex flex-col items-center text-center">
        <h1 className="text-4xl leading-[1.05] font-black tracking-tight sm:text-6xl lg:text-7xl">
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
          actually read — then let NexAI hunt the viral moments and paint them
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

      {/* ── Typography + themes ──────────────────────────────────────────── */}
      {/* Keep these as two equal studios: removing the old preview must not make
          Typography stretch into a loose, unintentional full-width slab. */}
      <section className="mt-14 grid items-start gap-4 lg:grid-cols-2">
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
            eyebrow="Themes"
            title="Choose your reading room"
            body="Four complete treatments for the same TranStudio workflow. Zen Paper is the calm default; Liquid Glass brings the most motion and depth."
          />
          <div className="mt-4">
            <ThemeGallery />
          </div>
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
