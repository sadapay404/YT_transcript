"use client";

/**
 * Playback store — the single source of truth for "where are we in the video".
 *
 * The player component publishes state here; the transcript, progress bar and
 * (in Step 5) the clip engine read from it. Keeping this outside React state
 * means a 120ms playback tick re-renders only the components that subscribe to
 * the values they actually use.
 */
import { create } from "zustand";

import type {
  ClipRange,
  PlaybackController,
  PlayerStatus,
} from "@/lib/types";
import { findActiveSegmentIndex } from "@/lib/youtube/sync";
import { useTranscriptStore } from "@/stores/useTranscriptStore";

interface PlaybackStore {
  status: PlayerStatus;
  currentTime: number;
  duration: number;
  activeSegmentIndex: number;
  /** Clip currently looping, if any (Step 5's "Play clip"). */
  loopRange: ClipRange | null;
  /** True until the IFrame player reports ready. */
  playerReady: boolean;
  /** Set when the player cannot load at all (private/blocked embed). */
  playerError: string | null;

  /** Registered by the player component; lets any UI drive playback. */
  controller: PlaybackController | null;

  registerController: (controller: PlaybackController | null) => void;
  setPlayerReady: (ready: boolean) => void;
  setPlayerError: (message: string | null) => void;
  handleStateChange: (status: PlayerStatus) => void;
  /** Called by the player's clock on every tick. */
  updateTime: (currentTime: number, duration?: number) => void;
  setDuration: (duration: number) => void;
  setLoopRange: (range: ClipRange | null) => void;

  /* Convenience commands — safe to call before the player is ready. */
  seekTo: (seconds: number) => void;
  togglePlay: () => void;
  playClip: (range: ClipRange) => void;
  clearClip: () => void;
}

export const usePlaybackStore = create<PlaybackStore>((set, get) => ({
  status: "unstarted",
  currentTime: 0,
  duration: 0,
  activeSegmentIndex: -1,
  loopRange: null,
  playerReady: false,
  playerError: null,
  controller: null,

  registerController: (controller) => set({ controller }),

  setPlayerReady: (playerReady) => set({ playerReady }),

  setPlayerError: (playerError) => set({ playerError }),

  handleStateChange: (status) =>
    set((state) => {
      // Leaving a looping clip should clear the loop indicator.
      if (status === "ended" && state.loopRange) return { status, loopRange: null };
      return { status };
    }),

  updateTime: (currentTime, duration) =>
    set((state) => {
      const segments = useTranscriptStore.getState().transcript?.segments;
      const activeSegmentIndex = segments
        ? findActiveSegmentIndex(segments, currentTime)
        : -1;

      const nextDuration = duration && duration > 0 ? duration : state.duration;

      // Avoid pointless renders: only publish changed values.
      if (
        state.currentTime === currentTime &&
        state.duration === nextDuration &&
        state.activeSegmentIndex === activeSegmentIndex
      ) {
        return state;
      }

      return {
        currentTime,
        duration: nextDuration,
        activeSegmentIndex,
      };
    }),

  setDuration: (duration) => set({ duration: duration > 0 ? duration : 0 }),

  setLoopRange: (loopRange) => set({ loopRange }),

  seekTo: (seconds) => {
    const { controller } = get();
    if (!controller) return;
    controller.seekTo(Math.max(0, seconds));
    // Optimistically move the marker so the UI responds instantly.
    get().updateTime(Math.max(0, seconds));
  },

  togglePlay: () => {
    get().controller?.toggle();
  },

  playClip: (range) => {
    const { controller } = get();
    if (!controller) return;
    set({ loopRange: range });
    controller.setLoopRange(range);
    controller.seekTo(range.start);
    controller.play();
    get().updateTime(range.start);
  },

  clearClip: () => {
    set({ loopRange: null });
    get().controller?.setLoopRange(null);
  },
}));
