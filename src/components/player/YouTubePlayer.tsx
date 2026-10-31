"use client";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  YouTube player — raw IFrame Player API, no wrapper dependency.
 * ─────────────────────────────────────────────────────────────────────────────
 *  Why not react-player? The clipper needs millisecond-accurate `getCurrentTime`
 *  polling and an exact loop window (`setLoopRange`), both of which are trivial
 *  against the raw API and awkward through a wrapper. It also keeps the bundle
 *  smaller and removes a dependency from the free-tier build.
 *
 *  The API script is loaded once per page (singleton promise) so mounting two
 *  players never double-loads it, and the player publishes its clock into the
 *  playback store for the transcript to follow.
 */
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";

import { PLAYBACK } from "@/lib/constants";
import type { ClipRange, PlaybackController, PlayerStatus } from "@/lib/types";
import { usePlaybackStore } from "@/stores/usePlaybackStore";

/* ────────────────────── Minimal typings for the YT API ──────────────────── */

interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  mute(): void;
  unMute(): void;
  isMuted(): boolean;
  setVolume(volume: number): void;
  destroy(): void;
  getIframe(): HTMLIFrameElement;
}

interface YTPlayerEvent {
  target: YTPlayer;
  data: number;
}

interface YTNamespace {
  Player: new (
    element: HTMLElement | string,
    options: {
      videoId: string;
      host?: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (event: YTPlayerEvent) => void;
        onStateChange?: (event: YTPlayerEvent) => void;
        onError?: (event: YTPlayerEvent) => void;
      };
    },
  ) => YTPlayer;
  PlayerState: {
    UNSTARTED: number;
    ENDED: number;
    PLAYING: number;
    PAUSED: number;
    BUFFERING: number;
    CUED: number;
  };
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YTNamespace> | null = null;

/** Load https://www.youtube.com/iframe_api exactly once, with a timeout. */
function loadYouTubeApi(timeoutMs = 12_000): Promise<YTNamespace> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("The YouTube API needs a browser."));
  }
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;

  apiPromise = new Promise<YTNamespace>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-transtudio-yt-api="true"]',
    );

    const timer = setTimeout(() => {
      apiPromise = null;
      reject(new Error("YouTube player timed out while loading."));
    }, timeoutMs);

    const settle = () => {
      if (window.YT?.Player) {
        clearTimeout(timer);
        resolve(window.YT);
      }
    };

    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      settle();
    };

    if (!existing) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.dataset.transtudioYtApi = "true";
      script.onerror = () => {
        clearTimeout(timer);
        apiPromise = null;
        reject(new Error("Could not load the YouTube player script."));
      };
      document.head.appendChild(script);
    } else {
      // Script tag already exists (e.g. after a Fast Refresh) — poll briefly.
      const poll = setInterval(() => {
        if (window.YT?.Player) {
          clearInterval(poll);
          settle();
        }
      }, 120);
      setTimeout(() => clearInterval(poll), timeoutMs);
    }
  });

  return apiPromise;
}

function mapPlayerState(code: number): PlayerStatus {
  switch (code) {
    case 1:
      return "playing";
    case 2:
      return "paused";
    case 3:
      return "buffering";
    case 0:
      return "ended";
    case 5:
      return "unstarted";
    default:
      return "unstarted";
  }
}

/** Human-readable reasons the embed refuses to load. */
const PLAYER_ERRORS: Record<number, string> = {
  2: "The video id looks invalid.",
  5: "This video can't play in an embedded player.",
  100: "This video is private or has been removed.",
  101: "The owner doesn't allow this video to be embedded.",
  150: "The owner doesn't allow this video to be embedded.",
};

/* ─────────────────────────────── Component ──────────────────────────────── */

interface YouTubePlayerProps {
  /** React 19 passes `ref` as a regular prop for function components. */
  ref?: React.Ref<PlaybackController>;
  videoId: string;
  /** Deep-link start time (from `?t=`). */
  startAt?: number;
  /** Autoplay is attempted on user-initiated loads only. */
  autoPlay?: boolean;
  className?: string;
}

export function YouTubePlayer({
  ref,
  videoId,
  startAt,
  autoPlay = false,
  className,
}: YouTubePlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const loopRef = useRef<ClipRange | null>(null);
  const tickRef = useRef<number | null>(null);

  // Action references are stable in zustand, so subscribing to them individually
  // keeps this component out of the 120ms playback-tick render path.
  const playerError = usePlaybackStore((s) => s.playerError);
  const registerController = usePlaybackStore((s) => s.registerController);
  const setPlayerReady = usePlaybackStore((s) => s.setPlayerReady);
  const setPlayerError = usePlaybackStore((s) => s.setPlayerError);
  const handleStateChange = usePlaybackStore((s) => s.handleStateChange);
  const updateTime = usePlaybackStore((s) => s.updateTime);
  const setDuration = usePlaybackStore((s) => s.setDuration);

  /**
   * The imperative controller: one stable object for the component's lifetime
   * that always talks to whichever player instance is currently mounted (it
   * closes over `playerRef`, never over the instance itself).
   */
  const controller = useMemo<PlaybackController>(
    () => ({
      seekTo(seconds: number) {
        playerRef.current?.seekTo(Math.max(0, seconds), true);
      },
      play() {
        playerRef.current?.playVideo();
      },
      pause() {
        playerRef.current?.pauseVideo();
      },
      toggle() {
        const player = playerRef.current;
        if (!player) return;
        const state = player.getPlayerState();
        if (state === 1 || state === 3) player.pauseVideo();
        else player.playVideo();
      },
      getCurrentTime: () => playerRef.current?.getCurrentTime() ?? 0,
      getDuration: () => playerRef.current?.getDuration() ?? 0,
      setMuted(muted: boolean) {
        if (muted) playerRef.current?.mute();
        else playerRef.current?.unMute();
      },
      isMuted: () => playerRef.current?.isMuted() ?? false,
      setLoopRange(range: ClipRange | null) {
        loopRef.current = range;
      },
    }),
    [],
  );

  useImperativeHandle(ref, () => controller, [controller]);

  /* ── Clock: drives the transcript highlight and the progress bar ──────── */
  const startClock = useCallback(() => {
    if (tickRef.current !== null) return;

    tickRef.current = window.setInterval(() => {
      const player = playerRef.current;
      if (!player) return;

      let current = 0;
      let total = 0;
      try {
        current = player.getCurrentTime() ?? 0;
        total = player.getDuration() ?? 0;
      } catch {
        return; // Player mid-teardown.
      }

      // Clip loop: jump back instead of letting the clip run past its end.
      const loop = loopRef.current;
      if (loop && current >= loop.end - PLAYBACK.clipEndPadding) {
        player.seekTo(loop.start, true);
        current = loop.start;
      }

      updateTime(current, total);
      if (total > 0) setDuration(total);
    }, PLAYBACK.tickMs);
  }, [updateTime, setDuration]);

  const stopClock = useCallback(() => {
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  /* ── Mount player for the current videoId ─────────────────────────────── */
  useEffect(() => {
    let cancelled = false;
    // Demo transcripts have no video to play.
    if (!videoId || videoId === "transtudio-demo") return;

    void (async () => {
      try {
        const YT = await loadYouTubeApi();
        if (cancelled || !containerRef.current) return;

        playerRef.current?.destroy();

        // A fresh div per instance: the API replaces the element it's given.
        const mount = document.createElement("div");
        mount.className = "h-full w-full";
        containerRef.current.replaceChildren(mount);

        const player = new YT.Player(mount, {
          videoId,
          host: "https://www.youtube-nocookie.com",
          playerVars: {
            controls: 0, // we draw our own transport
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
            disablekb: 1,
            iv_load_policy: 3,
            fs: 0,
            origin: window.location.origin,
            ...(startAt ? { start: Math.floor(startAt) } : {}),
            ...(autoPlay ? { autoplay: 1 } : {}),
          },
          events: {
            onReady: (event) => {
              if (cancelled) return;
              playerRef.current = event.target;
              setDuration(event.target.getDuration() ?? 0);

              registerController(controller);
              setPlayerReady(true);
              // A previous failure must not linger on a now-healthy player.
              setPlayerError(null);

              const armedLoop = usePlaybackStore.getState().loopRange;
              loopRef.current = armedLoop;
              if (armedLoop) {
                // A clip can be armed while this player was unmounted (Read
                // mode). Adopt it before the first user-visible frame.
                event.target.seekTo(armedLoop.start, true);
                event.target.playVideo();
                updateTime(armedLoop.start, event.target.getDuration() ?? 0);
              } else {
                if (startAt) event.target.seekTo(startAt, true);
                updateTime(startAt ?? 0, event.target.getDuration() ?? 0);
              }
            },
            onStateChange: (event) => {
              if (cancelled) return;
              const status = mapPlayerState(event.data);
              handleStateChange(status);
              registerController(controller);

              if (status === "playing" || status === "buffering") startClock();
              if (status === "paused" || status === "ended") {
                // One last sample so the marker lands exactly on the pause point.
                const player = playerRef.current;
                if (player) updateTime(player.getCurrentTime() ?? 0);
                stopClock();
              }
            },
            onError: (event) => {
              if (cancelled) return;
              setPlayerError(
                PLAYER_ERRORS[event.data] ?? "This video could not be played.",
              );
              stopClock();
            },
          },
        });

        playerRef.current = player;
      } catch (error) {
        if (cancelled) return;
        setPlayerError(
          error instanceof Error
            ? error.message
            : "The YouTube player could not be loaded.",
        );
      }
    })();

    return () => {
      cancelled = true;
      stopClock();
      try {
        playerRef.current?.destroy();
      } catch {
        /* already gone */
      }
      playerRef.current = null;
      registerController(null);
      setPlayerReady(false);
      handleStateChange("unstarted");
    };
    // Every dependency is stable (memoised controller, zustand actions,
    // useCallback clock helpers), so in practice this effect re-runs only when
    // the video identity changes — which is exactly when it should.
  }, [
    videoId,
    startAt,
    autoPlay,
    controller,
    handleStateChange,
    registerController,
    setDuration,
    setPlayerError,
    setPlayerReady,
    startClock,
    stopClock,
    updateTime,
  ]);

  /* ── Pause the clock if the tab is hidden (saves battery, avoids drift) ─ */
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) stopClock();
      else if (playerRef.current?.getPlayerState() === 1) startClock();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [startClock, stopClock]);

  return (
    <div className={className}>
      <div className="relative h-full w-full bg-black">
        <div ref={containerRef} className="absolute inset-0 h-full w-full [&_iframe]:h-full [&_iframe]:w-full" />

        {playerError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-canvas/92 p-6 text-center">
            <p className="text-[13px] font-semibold text-ink">{playerError}</p>
            <p className="max-w-sm text-[12px] text-ink-soft">
              The transcript is unaffected — you can still read, copy and export it.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
