"use client";

/**
 * Transcript store — owns the fetch lifecycle and the parsed transcript.
 * Deliberately UI-free: components subscribe, the server action stays the only
 * thing that knows how scraping works.
 */
import { create } from "zustand";

import type {
  AsyncStatus,
  FetchTranscriptResult,
  TranscriptErrorCode,
  TranscriptPayload,
  VideoMetadata,
} from "@/lib/types";
import { extractTranscriptAction, loadDemoTranscriptAction } from "@/app/actions/transcript";

export interface TranscriptError {
  code: TranscriptErrorCode;
  message: string;
  hint?: string;
  /** Per-strategy attempt log — shown behind a "technical details" toggle. */
  diagnostics?: string[];
}

interface TranscriptState {
  status: AsyncStatus;
  /** The URL currently loaded or attempted (for the address bar + retry). */
  input: string;
  transcript: TranscriptPayload | null;
  metadata: VideoMetadata | null;
  error: TranscriptError | null;
  /** Set when the server had to substitute the demo transcript. */
  notice: string | null;
  /** Attempt log for the loaded transcript (success or failure). */
  diagnostics: string[];
  /** Non-blocking metadata warnings surfaced under the player. */
  lastFetchedAt: number | null;

  /** Mirrors the URL field so a retry (or deep link) can prefill it. */
  setInput: (input: string) => void;
  extract: (input: string) => Promise<void>;
  retry: () => Promise<void>;
  loadDemo: () => Promise<void>;
  reset: () => void;
}

export const useTranscriptStore = create<TranscriptState>((set, get) => ({
  status: "idle",
  input: "",
  transcript: null,
  metadata: null,
  error: null,
  notice: null,
  diagnostics: [],
  lastFetchedAt: null,

  setInput: (input) => set({ input }),

  extract: async (input: string) => {
    const trimmed = input.trim();
    if (!trimmed) return;

    set({
      status: "loading",
      input: trimmed,
      error: null,
      notice: null,
      diagnostics: [],
      // Keep the previous transcript visible while loading so the layout
      // doesn't collapse and re-flow on every fetch.
    });

    try {
      const result = await extractTranscriptAction(trimmed);
      applyResult(result, set);
    } catch (error) {
      set({
        status: "error",
        transcript: null,
        metadata: null,
        error: {
          code: "unknown",
          message:
            error instanceof Error
              ? error.message
              : "The request failed before it reached the server.",
          hint: "Check your connection and try again.",
        },
      });
    }
  },

  retry: async () => {
    const { input } = get();
    if (input) await get().extract(input);
  },

  loadDemo: async () => {
    set({ status: "loading", error: null, notice: null, diagnostics: [] });
    try {
      const result = await loadDemoTranscriptAction();
      applyResult(result, set);
    } catch {
      set({
        status: "error",
        error: {
          code: "unknown",
          message: "Could not load the demo transcript.",
        },
      });
    }
  },

  reset: () =>
    set({
      status: "idle",
      input: "",
      transcript: null,
      metadata: null,
      error: null,
      notice: null,
      diagnostics: [],
      lastFetchedAt: null,
    }),
}));

type Setter = (partial: Partial<TranscriptState>) => void;

function applyResult(result: FetchTranscriptResult, set: Setter) {
  if (result.ok) {
    set({
      status: "success",
      transcript: result.transcript,
      metadata: result.metadata,
      error: null,
      notice: result.notice ?? null,
      diagnostics: result.diagnostics ?? [],
      lastFetchedAt: Date.now(),
    });
    return;
  }

  set({
    status: "error",
    transcript: null,
    metadata: null,
    notice: null,
    diagnostics: result.diagnostics ?? [],
    error: {
      code: result.error,
      message: result.message,
      ...(result.hint ? { hint: result.hint } : {}),
      ...(result.diagnostics ? { diagnostics: result.diagnostics } : {}),
    },
  });
}
