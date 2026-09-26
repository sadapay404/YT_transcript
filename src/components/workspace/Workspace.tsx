"use client";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  The studio: URL bar → video pane + transcript rail.
 * ─────────────────────────────────────────────────────────────────────────────
 *  Layout modes are expressed as CSS grid transitions with Framer Motion
 *  `layout`, so switching between Split / Cinema / Read reflows the panes
 *  smoothly and — crucially — never remounts the player (no reloaded video,
 *  no lost playback position).
 */
import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ChevronRight, ClipboardPaste, Info, Keyboard, RefreshCw } from "lucide-react";

import { cn, shouldPullIntoView } from "@/lib/utils";
import { PasteTranscriptDialog } from "@/components/workspace/PasteTranscriptDialog";
import { UrlBar } from "@/components/workspace/UrlBar";
import { TranscriptPane } from "@/components/workspace/TranscriptPane";
import { VideoPane } from "@/components/workspace/VideoPane";
import { AssistantPanel } from "@/components/assistant/AssistantPanel";
import { usePlaybackStore } from "@/stores/usePlaybackStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useTranscriptStore } from "@/stores/useTranscriptStore";

const SPRING = { type: "spring", stiffness: 260, damping: 30 } as const;

export function Workspace() {
  const status = useTranscriptStore((s) => s.status);
  const transcript = useTranscriptStore((s) => s.transcript);
  const metadata = useTranscriptStore((s) => s.metadata);
  const error = useTranscriptStore((s) => s.error);
  const notice = useTranscriptStore((s) => s.notice);
  const loadDemo = useTranscriptStore((s) => s.loadDemo);
  const fetchInBrowser = useTranscriptStore((s) => s.fetchInBrowser);
  const openPaste = useTranscriptStore((s) => s.openPaste);

  const viewMode = useSettingsStore((s) => s.viewMode);
  const togglePlay = usePlaybackStore((s) => s.togglePlay);
  const controller = usePlaybackStore((s) => s.controller);

  const rootRef = useRef<HTMLDivElement>(null);

  const hasTranscript = Boolean(transcript && transcript.segments.length > 0);
  const canTryBrowser = transcript?.source === "demo" && notice?.includes("This host cannot");
  const readingOnly = viewMode === "read";

  /** False while the studio renders nothing — the landing owns that state. */
  const mounted = status !== "idle" || hasTranscript;
  const pulledIntoView = useRef(false);

  /* ── Glide into view ──────────────────────────────────────────────────────
   * The landing sits above the studio, so a link pasted in the hero mounts the
   * studio off-screen. Pull it into view once, on its first appearance — the
   * effect has to key off `mounted`, because the node it scrolls to does not
   * exist yet while the studio is still rendering null. */
  useEffect(() => {
    if (!mounted || pulledIntoView.current) return;

    const element = rootRef.current;
    if (!element) return;
    pulledIntoView.current = true;

    const rect = element.getBoundingClientRect();
    if (!shouldPullIntoView(rect, window.innerHeight)) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    element.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  }, [mounted]);

  /* ── Keyboard shortcuts (only when the reader isn't typing) ───────────── */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.code === "Space") {
        event.preventDefault();
        if (controller) togglePlay();
      }
      if (event.key === "j" || event.key === "J") usePlaybackStore.getState().seekTo(usePlaybackStore.getState().currentTime - 10);
      if (event.key === "l" || event.key === "L") usePlaybackStore.getState().seekTo(usePlaybackStore.getState().currentTime + 10);
      // 1–3 switch layout mode — the same control as the header. Skipped while
      // a popover/dialog is open so the keys never fight a focused control.
      if (document.querySelector('[role="dialog"], [role="menu"]')) return;
      if (event.key === "1") useSettingsStore.getState().setViewMode("split");
      if (event.key === "2") useSettingsStore.getState().setViewMode("cinema");
      if (event.key === "3") useSettingsStore.getState().setViewMode("read");
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [controller, togglePlay]);

  // Nothing to show until something is being read: the landing page above owns
  // the empty state, the slogan and the URL bar. The paste dialog stays mounted
  // either way — the hero can open it before the studio exists, and a successful
  // paste must not remount it out from under the confirmation.
  return (
    <>
    <PasteTranscriptDialog />
    {mounted && (
    <div
      ref={rootRef}
      className="mx-auto flex w-full max-w-[1900px] flex-1 scroll-mt-16 flex-col gap-3 px-3 py-3 sm:px-4 sm:py-4">
      {/* ── Input row ───────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <UrlBar />
      </div>

      {/* ── Notices ─────────────────────────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {notice && hasTranscript && (
          <Notice tone="info" icon={<Info className="h-3.5 w-3.5" />}>
            <div className="flex flex-col gap-2">
              <span>{notice} The app stays fully usable — reading, seeking and exporting all work.</span>
              {canTryBrowser && (
                <span className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void fetchInBrowser()}
                    className="btn btn-primary h-8 gap-1.5 px-2.5 text-[11px]"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Try from my connection
                  </button>
                  <button
                    type="button"
                    onClick={openPaste}
                    className="btn h-8 gap-1.5 border border-line px-2.5 text-[11px]"
                  >
                    <ClipboardPaste className="h-3 w-3" />
                    Paste a transcript
                  </button>
                </span>
              )}
            </div>
          </Notice>
        )}
      </AnimatePresence>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
      <div className="min-w-0 flex-1">
      <AnimatePresence mode="wait" initial={false}>
        {status === "loading" && !hasTranscript ? (
          <LoadingState key="loading" />
        ) : status === "error" && error ? (
          <ErrorState
            key="error"
            message={error.message}
            hint={error.hint}
            code={error.code}
            diagnostics={error.diagnostics}
            onDemo={() => void loadDemo()}
            onPaste={openPaste}
            onBrowserFetch={() => void fetchInBrowser()}
          />
        ) : (
          <motion.div
            key="studio"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className={cn(
              "grid min-h-0 flex-1 gap-3",
              // Split: side-by-side, transcript rail beside the player.
              viewMode === "split" &&
                "lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]",
              // Cinema: player full width on top, transcript as a wide rail below.
              viewMode === "cinema" && "grid-cols-1",
              // Read: transcript only, centred to a comfortable measure.
              readingOnly && "mx-auto w-full max-w-3xl grid-cols-1",
            )}
          >
            {/* Player */}
            <AnimatePresence initial={false} mode="popLayout">
              {!readingOnly && (
                <motion.div
                  key="player-pane"
                  layout
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={SPRING}
                  className={cn(
                    "panel overflow-hidden lg:sticky lg:top-[3.75rem] lg:self-start",
                    viewMode === "cinema" && "mx-auto w-full max-w-5xl",
                  )}
                >
                  <VideoPane />

                  {/* Title block */}
                  <div className="flex items-start justify-between gap-3 border-t border-line px-3 py-2.5">
                    <div className="min-w-0">
                      <h1 className="truncate text-[13.5px] font-semibold text-ink">
                        {metadata?.title || (transcript?.source === "demo" ? "Demo transcript" : "Untitled video")}
                      </h1>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px] text-ink-faint">
                        {metadata?.author && <span className="truncate">{metadata.author}</span>}
                        {metadata?.author && <span>·</span>}
                        <span className="font-mono">{metadata?.videoId}</span>
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Transcript */}
            <motion.div
              layout
              transition={SPRING}
              className={cn(
                "panel flex min-h-0 flex-col overflow-hidden",
                viewMode === "cinema" && "max-h-[70vh]",
                viewMode === "split" && "lg:max-h-[calc(100dvh-11rem)]",
                readingOnly && "min-h-[70vh]",
              )}
            >
              <TranscriptPane />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
      <AssistantPanel />
      </div>

      {/* ── Shortcut hint ───────────────────────────────────────────────── */}
      {hasTranscript && (
        <p className="hidden items-center justify-center gap-3 pb-1 text-[11px] text-ink-faint md:flex">
          <span className="inline-flex items-center gap-1">
            <Keyboard className="h-3 w-3" />
            <span className="kbd">Space</span> play/pause
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="kbd">J</span>/<span className="kbd">L</span> ±10s
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="kbd">1</span>
            <span className="kbd">2</span>
            <span className="kbd">3</span> layout
          </span>
          <span>click any line to jump there</span>
        </p>
      )}
    </div>
    )}
    </>
  );
}

/* ─────────────────────────────── States ─────────────────────────────────── */

function Notice({
  children,
  tone,
  icon,
}: {
  children: React.ReactNode;
  tone: "info" | "warn";
  icon?: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6, height: 0 }}
      animate={{ opacity: 1, y: 0, height: "auto" }}
      exit={{ opacity: 0, y: -6, height: 0 }}
      className={cn(
        "flex items-start gap-2 overflow-hidden rounded-xl border px-3 py-2 text-[12px] leading-relaxed",
        tone === "info"
          ? "border-line bg-ink/[0.04] text-ink-soft"
          : "border-amber-400/40 bg-amber-500/10 text-amber-700 scheme-dark:text-amber-200",
      )}
    >
      <span className="mt-0.5 shrink-0 text-accent">{icon}</span>
      <div className="min-w-0">{children}</div>
    </motion.div>
  );
}

function ErrorState({
  message,
  hint,
  code,
  diagnostics,
  onDemo,
  onPaste,
  onBrowserFetch,
}: {
  message: string;
  hint?: string;
  code: string;
  diagnostics?: string[];
  onDemo: () => void;
  onPaste: () => void;
  onBrowserFetch: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="panel flex flex-col items-start gap-3 p-5"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-danger/40 bg-danger/10 text-danger">
        <AlertTriangle className="h-4 w-4" />
      </span>

      <div>
        <h2 className="text-[15px] font-semibold text-ink">
          Couldn&apos;t read that video
        </h2>
        <p className="mt-1 text-[13px] text-ink-soft">{message}</p>
        {hint && (
          <p className="mt-2 rounded-lg border border-line bg-ink/[0.04] px-2.5 py-1.5 text-[12px] text-ink-soft">
            {hint}
          </p>
        )}
        <p className="mt-2 font-mono text-[10.5px] text-ink-faint">code: {code}</p>

        {/* Exactly what was tried, and what each attempt said. This is what
            turns "no transcript found" into an actionable report. */}
        {diagnostics && diagnostics.length > 0 && (
          <details className="group mt-2.5">
            <summary className="flex cursor-pointer items-center gap-1 text-[11.5px] text-ink-faint transition-colors hover:text-ink-soft">
              <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
              What was tried ({diagnostics.length})
            </summary>
            <ul className="mt-1.5 flex flex-col gap-1 rounded-lg border border-line bg-ink/[0.04] px-2.5 py-2 font-mono text-[10.5px] leading-relaxed text-ink-soft">
              {diagnostics.map((line, index) => (
                <li key={`${line}-${index}`} className="break-words">
                  {line}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Two routes that need nothing from this server: the visitor's own
            connection, and the transcript already in their browser tab. */}
        <button type="button" onClick={onBrowserFetch} className="btn btn-primary h-9 gap-2 px-3">
          <RefreshCw className="h-3.5 w-3.5" />
          Try from my connection
        </button>
        <button type="button" onClick={onPaste} className="btn h-9 gap-2 border border-line px-3">
          <ClipboardPaste className="h-3.5 w-3.5" />
          Paste a transcript
        </button>
        <button type="button" onClick={onDemo} className="btn btn-outline h-9 gap-2 px-3">
          Demo transcript
        </button>
        <a href="/status" className="btn btn-outline h-9 gap-2 px-3">
          Run diagnostics
        </a>
      </div>
    </motion.div>
  );
}

/** First-load skeleton: mirrors the real layout so nothing shifts on arrival. */
function LoadingState() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)]"
    >
      <div className="panel overflow-hidden">
        <div className="aspect-video w-full bg-ink/[0.05]" />
        <div className="space-y-2 border-t border-line p-3">
          <div className="skeleton h-3.5 w-2/3" />
          <div className="skeleton h-3 w-1/3" />
        </div>
      </div>

      <div className="panel flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between">
          <div className="skeleton h-3 w-24" />
          <div className="skeleton h-3 w-40" />
        </div>
        {Array.from({ length: 9 }).map((_, index) => (
          <div key={index} className="flex items-start gap-3">
            <div className="skeleton mt-0.5 h-3 w-9 shrink-0" />
            <div
              className="skeleton h-3.5"
              style={{ width: `${[92, 78, 86, 64, 90, 72, 84, 58, 88][index]}%` }}
            />
          </div>
        ))}
        <p className="mt-auto text-[12px] text-ink-faint">
          Fetching captions…
        </p>
      </div>
    </motion.div>
  );
}
