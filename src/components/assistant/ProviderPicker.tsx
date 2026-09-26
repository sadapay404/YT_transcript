"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";

import type { AiProviderChoice, AiProviderStatus } from "@/lib/types";
import { AutoLogo, GeminiLogo, GroqLogo } from "@/components/assistant/AiLogos";
import { useChatStore } from "@/stores/useChatStore";
import { cn } from "@/lib/utils";

const OPTIONS: Array<{
  id: AiProviderChoice;
  label: string;
  hint: string;
  detail: string;
  Logo: (props: { className?: string }) => React.ReactElement;
}> = [
  {
    id: "auto",
    label: "Auto",
    hint: "(best available)",
    detail: "Gemini first, Groq instantly if Gemini is busy.",
    Logo: AutoLogo,
  },
  {
    id: "gemini",
    label: "Google Gemini",
    hint: "(recommended)",
    detail: "Reads the whole transcript. Best clip picks.",
    Logo: GeminiLogo,
  },
  {
    id: "groq",
    label: "Groq",
    hint: "(Very Fast)",
    detail: "Answers in a blink. Very long videos are trimmed.",
    Logo: GroqLogo,
  },
];

let statusRequest: Promise<AiProviderStatus | null> | null = null;
function loadProviderStatus(): Promise<AiProviderStatus | null> {
  statusRequest ??= fetch("/api/chat", { cache: "no-store" })
    .then((response) => (response.ok ? (response.json() as Promise<AiProviderStatus>) : null))
    .catch(() => null);
  return statusRequest;
}

/** Which providers have keys on this installation (null while unknown). */
export function useAiProviderStatus(): AiProviderStatus | null {
  const [status, setStatus] = useState<AiProviderStatus | null>(null);
  useEffect(() => {
    let alive = true;
    void loadProviderStatus().then((value) => {
      if (alive) setStatus(value);
    });
    return () => {
      alive = false;
    };
  }, []);
  return status;
}

/** The AI picker in NexAI's header: Auto (default), Google Gemini, Groq. */
export function ProviderPicker() {
  const provider = useChatStore((state) => state.provider);
  const setProvider = useChatStore((state) => state.setProvider);
  const hydrate = useChatStore((state) => state.hydrateAiPrefs);
  const status = useAiProviderStatus();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => hydrate(), [hydrate]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const current = OPTIONS.find((option) => option.id === provider) ?? OPTIONS[0];
  const ready = (id: AiProviderChoice) =>
    status === null ? true : id === "auto" ? status.gemini || status.groq : status[id];

  return (
    <div ref={root} className="relative" data-provider-picker>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Choose which AI answers"
        className="nexai-chip inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-elevated/80 pr-2 pl-1.5 text-[11.5px] font-medium text-ink transition-colors hover:border-line-strong"
      >
        <current.Logo className="h-4 w-4" />
        <span>{current.label}</span>
        <ChevronDown className={cn("h-3 w-3 text-ink-faint transition-transform", open && "rotate-180")} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            aria-label="AI provider"
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.14 }}
            className="nexai-menu absolute top-10 right-0 z-30 w-[17.5rem] origin-top-right rounded-2xl border border-line bg-elevated p-1.5 shadow-2xl"
          >
            <p className="px-2.5 pt-1.5 pb-1 text-[9.5px] font-semibold tracking-[0.16em] text-ink-faint uppercase">
              Answer with
            </p>
            {OPTIONS.map((option) => {
              const selected = option.id === provider;
              const available = ready(option.id);
              return (
                <button
                  key={option.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  onClick={() => {
                    setProvider(option.id);
                    setOpen(false);
                  }}
                  data-provider-option={option.id}
                  className={cn(
                    "flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors",
                    selected ? "bg-accent-soft" : "hover:bg-ink/[0.05]",
                  )}
                >
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-line bg-surface">
                    <option.Logo className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-1.5">
                      <span className="text-[12.5px] font-semibold text-ink">{option.label}</span>
                      <span className="text-[10px] text-ink-faint">{option.hint}</span>
                    </span>
                    <span className="mt-0.5 block text-[10.5px] leading-snug text-ink-soft">{option.detail}</span>
                    {!available && (
                      <span className="mt-1 inline-block rounded-full border border-line px-1.5 py-px text-[9.5px] text-ink-faint">
                        Not set up here — the other AI will answer
                      </span>
                    )}
                  </span>
                  {selected && <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-accent" />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
