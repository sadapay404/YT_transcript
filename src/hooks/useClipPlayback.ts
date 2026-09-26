"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { PLAYBACK } from "@/lib/constants";
import type { ViralClip } from "@/lib/types";
import { usePlaybackStore } from "@/stores/usePlaybackStore";
import { useSettingsStore } from "@/stores/useSettingsStore";

/** Copy and loop controls shared by clip cards and transcript bands. */
export function useClipPlayback(clip: ViralClip) {
  const loopRange = usePlaybackStore((state) => state.loopRange);
  const status = usePlaybackStore((state) => state.status);
  const playClip = usePlaybackStore((state) => state.playClip);
  const clearClip = usePlaybackStore((state) => state.clearClip);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const armed = loopRange?.clipId === clip.id;
  // "Armed" is a persistent selection; breathing is only for actual playback.
  // Keeping them separate means a paused loop still shows Stop, not Play again.
  const breathing = armed && (status === "playing" || status === "buffering");

  const play = useCallback(() => {
    if (usePlaybackStore.getState().loopRange?.clipId === clip.id) {
      clearClip();
      return;
    }
    // Read mode intentionally has no player mounted. Switch first so the next
    // player can adopt the range that playClip arms before touching anything.
    if (useSettingsStore.getState().viewMode === "read") {
      useSettingsStore.getState().setViewMode("split");
    }
    playClip({ start: clip.start, end: clip.end, clipId: clip.id });
  }, [clearClip, clip.end, clip.id, clip.start, playClip]);

  const stop = useCallback(() => clearClip(), [clearClip]);

  const copy = useCallback(async () => {
    const content = [
      clip.title,
      `[${formatClipTime(clip.start)}–${formatClipTime(clip.end)}]`,
      clip.transcript_text,
    ]
      .filter(Boolean)
      .join("\n");
    await writeClipboard(content);
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), PLAYBACK.copyFeedbackMs);
  }, [clip.end, clip.start, clip.title, clip.transcript_text]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return {
    play,
    stop,
    copy,
    copied,
    armed,
    breathing,
    playing: breathing,
    isPlaying: breathing,
  };
}

export async function copyClip(clip: ViralClip): Promise<void> {
  const content = [
    clip.title,
    `[${formatClipTime(clip.start)}–${formatClipTime(clip.end)}]`,
    clip.transcript_text,
  ]
    .filter(Boolean)
    .join("\n");
  await writeClipboard(content);
}

export async function writeClipboard(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  if (typeof document === "undefined") throw new Error("Clipboard is unavailable in this browser.");
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Clipboard is unavailable in this browser.");
}

function formatClipTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  return `${String(minutes).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}
