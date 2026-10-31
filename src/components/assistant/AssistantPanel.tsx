"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUp,
  Captions,
  Download,
  Gauge,
  Lightbulb,
  ListChecks,
  ListOrdered,
  Quote,
  RotateCcw,
  Scissors,
  Square,
  X,
} from "lucide-react";

import type { ChatMode } from "@/lib/types";
import { useResizablePanel } from "@/hooks/useResizablePanel";
import { AssistantMessage } from "@/components/assistant/AssistantMessage";
import { NexAIMark } from "@/components/assistant/AiLogos";
import { ProviderPicker } from "@/components/assistant/ProviderPicker";
import { useChatStore } from "@/stores/useChatStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useTranscriptStore } from "@/stores/useTranscriptStore";
import { cn } from "@/lib/utils";

/** Secondary actions — clips are the headline, these are one tap away. */
const QUICK_ACTIONS: Array<{
  label: string;
  prompt: string;
  mode: ChatMode;
  Icon: typeof ListChecks;
}> = [
  { label: "Summarize", prompt: "Summarize this video in five faithful bullets.", mode: "summary", Icon: ListChecks },
  { label: "Chapters", prompt: "Break this video into chapters with timestamps.", mode: "chapters", Icon: ListOrdered },
  { label: "Best quotes", prompt: "Pull out the 5 most quotable lines, verbatim, with timestamps.", mode: "chat", Icon: Quote },
  { label: "Explain simply", prompt: "Explain the main idea of this video like I'm new to the topic.", mode: "chat", Icon: Lightbulb },
];

/**
 * NexAI — the transcript's AI studio. A drawer, not a third grid column, so
 * the video/transcript keep their readable width. Finding hook-first clips is
 * what people come here for, so it leads; everything else is a tap away.
 */
export function AssistantPanel() {
  const open = useSettingsStore((state) => state.sidebarOpen);
  const toggle = useSettingsStore((state) => state.toggleSidebar);
  const transcript = useTranscriptStore((state) => state.transcript);
  const messages = useChatStore((state) => state.messages);
  const isStreaming = useChatStore((state) => state.isStreaming);
  const sendMessage = useChatStore((state) => state.sendMessage);
  const findViralClips = useChatStore((state) => state.findViralClips);
  const retryLast = useChatStore((state) => state.retryLast);
  const stop = useChatStore((state) => state.stop);
  const clear = useChatStore((state) => state.clear);
  const { width, isResizing, separatorProps } = useResizablePanel();
  const [draft, setDraft] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const retryMessageId = [...messages]
    .reverse()
    .find((message) => message.role === "assistant" && message.status === "error" && message.retryable)
    ?.id;
  const lastMessage = messages.at(-1);

  // Keep the newest turn in view while it streams in.
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    // A finished clip plan is read from its top (the best clip), not its end.
    const node = lastMessage
      ? element.querySelector<HTMLElement>(`[data-message-id="${lastMessage.id}"]`)
      : null;
    if (lastMessage?.clipPlan && node) {
      element.scrollTo({ top: Math.max(0, node.offsetTop - 12), behavior: "smooth" });
      return;
    }
    element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
  }, [lastMessage, messages.length, lastMessage?.content.length, lastMessage?.status]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || isStreaming) return;
    setDraft("");
    void sendMessage(text);
  };

  const ask = (text: string, mode: ChatMode = "chat") => {
    if (isStreaming) return;
    void sendMessage(text, mode);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            aria-label="Close NexAI"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={toggle}
            className="fixed inset-0 top-14 z-40 cursor-default bg-ink/10 backdrop-blur-[1px]"
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="NexAI assistant"
            data-assistant-panel
            data-assistant-drawer
            initial={{ opacity: 0, x: 28 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 28 }}
            transition={{ type: "spring", stiffness: 360, damping: 34 }}
            className={cn(
              "panel nexai-panel fixed inset-x-3 bottom-3 top-[4.25rem] z-50 flex min-h-0 flex-col overflow-hidden shadow-2xl lg:inset-x-auto lg:right-4 lg:w-[min(var(--assistant-width),calc(100vw-2rem))]",
              isResizing && "select-none",
            )}
            style={{ "--assistant-width": `${width}px` } as React.CSSProperties}
          >
            <div
              {...separatorProps}
              className="absolute inset-y-0 left-0 z-20 hidden w-2 -translate-x-1/2 cursor-col-resize items-center justify-center lg:flex"
            >
              <span className="h-12 w-1 rounded-full bg-line-strong transition-colors hover:bg-accent" />
            </div>

            {/* ── Header ─────────────────────────────────────────────────── */}
            <header className="nexai-header relative z-10 flex shrink-0 items-center gap-2.5 border-b border-line px-3 py-2.5 lg:pl-4">
              <span className="nexai-badge relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
                <NexAIMark className="h-5 w-5" animated={isStreaming} />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="flex items-center gap-1.5 text-[14px] leading-tight font-bold tracking-tight text-ink">
                  NexAI
                </h2>
                <p className="truncate text-[10px] text-ink-faint">By Mubashir</p>
              </div>
              <ProviderPicker />
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={clear}
                  title="New conversation"
                  aria-label="New conversation"
                  className="btn btn-icon h-8 w-8 border border-line"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={toggle}
                title="Close NexAI"
                aria-label="Close NexAI"
                className="btn btn-icon h-8 w-8 border border-line"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </header>

            {/* ── Body ───────────────────────────────────────────────────── */}
            <div ref={scroller} className="relative min-h-0 flex-1 overflow-y-auto px-3 py-3 lg:px-4" data-own-scroll>
              {!transcript ? (
                <div className="flex h-full min-h-48 flex-col items-center justify-center text-center">
                  <span className="nexai-badge flex h-14 w-14 items-center justify-center rounded-2xl">
                    <NexAIMark className="h-7 w-7" />
                  </span>
                  <p className="mt-3 text-[14px] font-semibold text-ink">Load a video to wake NexAI</p>
                  <p className="mt-1 max-w-xs text-[12px] leading-relaxed text-ink-faint">
                    Paste a YouTube link above. NexAI reads the transcript and finds the moments worth clipping.
                  </p>
                </div>
              ) : messages.length === 0 ? (
                <EmptyState
                  lines={transcript.segments.length}
                  disabled={isStreaming}
                  onClips={findViralClips}
                  onAsk={ask}
                />
              ) : (
                <div className="flex flex-col gap-4">
                  {messages.map((message) => (
                    <AssistantMessage
                      key={message.id}
                      message={message}
                      onRetry={message.id === retryMessageId ? () => void retryLast() : undefined}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* ── Composer ───────────────────────────────────────────────── */}
            {transcript && (
              <div className="nexai-composer shrink-0 border-t border-line px-3 pt-2 pb-3 lg:px-4">
                {messages.length > 0 && (
                  <div className="mb-2 flex gap-1.5 overflow-x-auto pb-0.5">
                    <button
                      type="button"
                      disabled={isStreaming}
                      onClick={findViralClips}
                      className="nexai-cta-chip btn h-7 shrink-0 gap-1.5 rounded-full px-2.5 text-[10.5px] font-semibold disabled:opacity-50"
                    >
                      <Scissors className="h-3 w-3" /> Viral clips
                    </button>
                    {QUICK_ACTIONS.slice(0, 3).map(({ label, prompt, mode, Icon }) => (
                      <button
                        key={label}
                        type="button"
                        disabled={isStreaming}
                        onClick={() => ask(prompt, mode)}
                        className="btn h-7 shrink-0 gap-1.5 rounded-full border border-line px-2.5 text-[10.5px] disabled:opacity-50"
                      >
                        <Icon className="h-3 w-3" /> {label}
                      </button>
                    ))}
                  </div>
                )}
                <form
                  onSubmit={submit}
                  className="nexai-input flex items-end gap-2 rounded-2xl border border-line bg-surface p-1.5 transition-colors focus-within:border-accent/60"
                >
                  <textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    disabled={isStreaming}
                    rows={1}
                    maxLength={4000}
                    placeholder="Ask NexAI about this video…"
                    aria-label="Ask NexAI"
                    className="max-h-28 min-h-9 flex-1 resize-none bg-transparent px-2 py-2 text-[12.5px] text-ink outline-none placeholder:text-ink-faint"
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                  />
                  {isStreaming ? (
                    <button
                      type="button"
                      onClick={stop}
                      aria-label="Stop answer"
                      title="Stop"
                      className="btn btn-icon h-9 w-9 shrink-0 rounded-xl border border-line"
                    >
                      <Square className="h-3 w-3 fill-current" />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={!draft.trim()}
                      aria-label="Send question"
                      title="Send"
                      className="btn btn-primary btn-icon h-9 w-9 shrink-0 rounded-xl disabled:opacity-40"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                  )}
                </form>
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function EmptyState({
  lines,
  disabled,
  onClips,
  onAsk,
}: {
  lines: number;
  disabled: boolean;
  onClips: () => void;
  onAsk: (prompt: string, mode: ChatMode) => void;
}) {
  return (
    <div className="flex min-h-full flex-col gap-4" data-nexai-empty>
      {/* The headline job: hook-first clips. */}
      <section className="nexai-hero relative overflow-hidden rounded-2xl p-4">
        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface/70 px-2 py-0.5 text-[9.5px] font-semibold tracking-[0.14em] text-accent uppercase">
            <Scissors className="h-2.5 w-2.5" /> Most used
          </span>
          <h3 className="mt-2.5 text-[17px] leading-snug font-bold tracking-tight text-ink">
            Find the clips that hook in the first second
          </h3>
          <p className="mt-1.5 text-[12px] leading-relaxed text-ink-soft">
            NexAI reads all {lines.toLocaleString()} lines, scores every opening line for scroll-stopping power and
            paints the winners straight onto your transcript.
          </p>
          <button
            type="button"
            disabled={disabled}
            onClick={onClips}
            data-find-viral-clips
            className="nexai-cta mt-3.5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[13px] font-semibold disabled:opacity-60"
          >
            <NexAIMark className="h-4 w-4" />
            Find viral clips
          </button>
          <ul className="mt-3 grid grid-cols-3 gap-1.5 text-[10px] text-ink-soft">
            <li className="flex flex-col items-center gap-1 rounded-lg border border-line bg-surface/60 px-1.5 py-2 text-center">
              <Gauge className="h-3.5 w-3.5 text-accent" /> Hook score
            </li>
            <li className="flex flex-col items-center gap-1 rounded-lg border border-line bg-surface/60 px-1.5 py-2 text-center">
              <Captions className="h-3.5 w-3.5 text-accent" /> Caption + tags
            </li>
            <li className="flex flex-col items-center gap-1 rounded-lg border border-line bg-surface/60 px-1.5 py-2 text-center">
              <Download className="h-3.5 w-3.5 text-accent" /> CSV / SRT
            </li>
          </ul>
        </div>
      </section>

      <section>
        <p className="mb-2 text-[10px] font-semibold tracking-[0.16em] text-ink-faint uppercase">Or ask NexAI</p>
        <div className="grid grid-cols-2 gap-1.5">
          {QUICK_ACTIONS.map(({ label, prompt, mode, Icon }) => (
            <button
              key={label}
              type="button"
              disabled={disabled}
              onClick={() => onAsk(prompt, mode)}
              className="nexai-tile group flex items-center gap-2 rounded-xl border border-line bg-surface/60 px-2.5 py-2.5 text-left text-[11.5px] font-medium text-ink-soft transition-colors hover:border-accent/50 hover:text-ink disabled:opacity-50"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent transition-transform group-hover:scale-105">
                <Icon className="h-3.5 w-3.5" />
              </span>
              {label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
