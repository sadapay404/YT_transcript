"use client";

/**
 * The one input that matters: paste a link, get a transcript.
 * Validates locally (instant feedback, no round trip) and keeps the primary
 * recovery paths — example link and paste — close to the input.
 */
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ClipboardPaste, Link2, Loader2, X } from "lucide-react";

import { DEMO_URL } from "@/lib/constants";
import { cn, parseYouTubeUrl } from "@/lib/utils";
import { useTranscriptStore } from "@/stores/useTranscriptStore";

export function UrlBar({ autoFocus = false }: { autoFocus?: boolean }) {
  const status = useTranscriptStore((s) => s.status);
  /** The field value lives in the store, so "retry" and deep links prefill for
   *  free and there is no state mirroring effect to keep in sync. */
  const value = useTranscriptStore((s) => s.input);
  const setValue = useTranscriptStore((s) => s.setInput);
  const extract = useTranscriptStore((s) => s.extract);
  /** Pasting needs no network at all, so it is offered up front rather than
   *  only after a fetch fails — it is the one path that always works. */
  const openPaste = useTranscriptStore((s) => s.openPaste);

  const [touched, setTouched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  /* ── Autofocus, on pointers only ──────────────────────────────────────────
   * The hero bar asks for focus so a link can be pasted straight away. On
   * touch devices that would fling a keyboard over the landing the moment the
   * page opens, so it is limited to fine pointers, and `preventScroll` keeps
   * the page exactly where the visitor left it while the DOM settles. */
  useEffect(() => {
    if (!autoFocus) return;
    const input = inputRef.current;
    if (!input) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    input.focus({ preventScroll: true });
  }, [autoFocus]);

  const trimmed = value.trim();
  const parsed = trimmed ? parseYouTubeUrl(trimmed) : null;
  const invalid = touched && trimmed.length > 0 && !parsed;
  const loading = status === "loading";

  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    setTouched(true);
    if (!trimmed) return;
    if (!parseYouTubeUrl(trimmed)) {
      inputRef.current?.focus();
      return;
    }
    await extract(trimmed);
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setValue(text.trim());
        setTouched(true);
      }
    } catch {
      // Clipboard permission denied — leave the field alone.
      inputRef.current?.focus();
    }
  };

  return (
    <form onSubmit={submit} className="w-full">
      <div
        className={cn(
          "panel group flex items-center gap-2 p-1.5 transition-colors",
          invalid ? "border-danger/50" : "focus-within:border-accent/50",
        )}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink/[0.05] text-ink-faint">
          <Link2 className="h-4 w-4" />
        </span>

        <input
          ref={inputRef}
          value={value}
          spellCheck={false}
          inputMode="url"
          aria-label="YouTube video URL"
          aria-invalid={invalid}
          placeholder="Paste a YouTube link — watch, youtu.be, shorts, live, or just the id"
          onChange={(event) => {
            setValue(event.target.value);
            if (!touched) setTouched(true);
          }}
          onBlur={() => setTouched(true)}
          className="h-9 min-w-0 flex-1 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-ink-faint"
        />

        {/* Clear */}
        <AnimatePresence initial={false}>
          {value.length > 0 && (
            <motion.button
              type="button"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              onClick={() => {
                setValue("");
                setTouched(false);
                inputRef.current?.focus();
              }}
              title="Clear"
              className="btn btn-icon h-8 w-8 shrink-0 text-ink-faint"
            >
              <X className="h-3.5 w-3.5" />
            </motion.button>
          )}
        </AnimatePresence>

        {/* Clipboard (hidden on touch devices, where the OS handles it) */}
        <button
          type="button"
          onClick={pasteFromClipboard}
          title="Paste from clipboard"
          className="btn btn-icon hidden h-8 w-8 shrink-0 text-ink-faint hover:text-ink sm:inline-flex"
        >
          <ClipboardPaste className="h-3.5 w-3.5" />
        </button>

        <button
          type="submit"
          disabled={loading || trimmed.length === 0}
          className="btn btn-primary h-9 shrink-0 gap-1.5 px-3"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <>
              <span className="hidden sm:inline">Extract</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </>
          )}
        </button>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 px-1">
        <AnimatePresence mode="wait" initial={false}>
          {invalid ? (
            <motion.p
              key="invalid"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-[11.5px] text-danger"
            >
              That doesn&apos;t look like a YouTube link yet.
            </motion.p>
          ) : (
            <motion.p
              key="hint"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-[11.5px] text-ink-faint"
            >
              No key, no sign-up. Works with any public video that has captions.
            </motion.p>
          )}
        </AnimatePresence>

        <button
          type="button"
          onClick={() => {
            setValue(DEMO_URL);
            setTouched(true);
          }}
          className="text-[11.5px] text-ink-faint underline decoration-dotted transition-colors hover:text-ink-soft"
        >
          use an example link
        </button>

        <span className="text-ink-faint/50">·</span>

        <button
          type="button"
          onClick={openPaste}
          className="inline-flex items-center gap-1 text-[11.5px] text-ink-faint underline decoration-dotted transition-colors hover:text-ink-soft"
        >
          <ClipboardPaste className="h-3 w-3" />
          already have a transcript? paste it
        </button>
      </div>
    </form>
  );
}
