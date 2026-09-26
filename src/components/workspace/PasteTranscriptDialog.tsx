"use client";

/**
 * Paste a transcript — the path that works when every network route is blocked.
 *
 * Reads YouTube's own "Show transcript" copy, .srt/.vtt files, timestamped
 * notes, or plain text. Everything downstream (sync, clip bands, exports) works
 * on the result, so this is a real transcript, not a degraded one.
 */
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, ClipboardPaste, Loader2, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { useTranscriptStore } from "@/stores/useTranscriptStore";

const PLACEHOLDER = `0:03
so the first thing I want to talk about

0:07
is how attention actually works

…or paste an .srt / .vtt file, or notes like [00:12] your own words.`;

export function PasteTranscriptDialog() {
  const open = useTranscriptStore((s) => s.pasteOpen);
  const onClose = useTranscriptStore((s) => s.closePaste);
  const loadFromPaste = useTranscriptStore((s) => s.loadFromPaste);
  const [text, setText] = useState("");
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  // Focus the field when the dialog opens, and let Escape close it (the
  // workspace keyboard shortcuts already stand down while a dialog is open).
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => areaRef.current?.focus(), 40);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  const submit = async () => {
    setBusy(true);
    const result = loadFromPaste(text);
    setFeedback(result);
    setBusy(false);
    if (result.ok) {
      // Give the confirmation a beat to be read, then get out of the way.
      setTimeout(() => {
        onClose();
        setText("");
        setFeedback(null);
      }, 900);
    }
  };

  const pasteFromClipboard = async () => {
    try {
      const clip = await navigator.clipboard.readText();
      if (clip) {
        setText(clip);
        setFeedback(null);
        areaRef.current?.focus();
      }
    } catch {
      areaRef.current?.focus();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4 backdrop-blur-sm"
          onClick={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="paste-transcript-title"
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            className="panel flex max-h-[85vh] w-full max-w-2xl flex-col gap-3 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="paste-transcript-title" className="text-[15px] font-bold text-ink">
                  Paste a transcript
                </h2>
                <p className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">
                  On YouTube: <span className="text-ink">⋯ → Show transcript</span>, select all of it
                  (Ctrl/Cmd+A inside that panel), copy, and paste below. Subtitles (.srt/.vtt) and
                  timestamped notes work too.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                title="Close"
                className="btn btn-icon h-8 w-8 shrink-0 border border-line text-ink-faint hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <textarea
              ref={areaRef}
              value={text}
              spellCheck={false}
              onChange={(event) => {
                setText(event.target.value);
                if (feedback) setFeedback(null);
              }}
              placeholder={PLACEHOLDER}
              aria-label="Transcript text"
              className="min-h-[38vh] flex-1 resize-y rounded-xl border border-line bg-ink/[0.03] p-3 font-mono text-[12.5px] leading-relaxed text-ink outline-none placeholder:text-ink-faint focus:border-accent/50"
            />

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void pasteFromClipboard()}
                className="btn h-9 gap-1.5 border border-line px-2.5 text-[12.5px]"
              >
                <ClipboardPaste className="h-3.5 w-3.5" />
                Paste from clipboard
              </button>

              <button
                type="button"
                onClick={() => void submit()}
                disabled={busy || text.trim().length === 0}
                className="btn btn-primary h-9 gap-1.5 px-3 text-[12.5px]"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Use this transcript
              </button>

              <AnimatePresence initial={false}>
                {feedback && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className={cn(
                      "flex items-center gap-1.5 text-[12px]",
                      feedback.ok
                        ? "text-emerald-700 scheme-dark:text-emerald-300"
                        : "text-danger",
                    )}
                  >
                    {feedback.ok ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5" />
                    )}
                    {feedback.message}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
