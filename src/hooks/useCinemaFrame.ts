"use client";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Cinema frame — a player that always fits, then shrinks as you read.
 * ─────────────────────────────────────────────────────────────────────────────
 *  Cinema mode is bounded to the viewport. The player starts as large as the
 *  frame allows while leaving a peek of transcript below it. Scrolling down
 *  first aligns the frame under the header, then shrinks the player towards a
 *  readable minimum; only after that does the transcript rail scroll inside
 *  its own frame. Scrolling up reverses the same order: the rail returns to its
 *  top, the player grows back, then the page moves.
 *
 *  The player never leaves the window, and the transcript never scrolls past
 *  it. Geometry is pure (see `computeCinemaGeometry`) so it can be tested
 *  without a browser.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/** Header height (3.5rem) plus a small breathing gap. */
const HEADER_OFFSET = 64;
/** Largest player width — the old Cinema cap (max-w-5xl). */
const MAX_PLAYER_WIDTH = 1024;
/** Default title + transport height until the real value is measured. */
const DEFAULT_CHROME = 112;

export interface CinemaGeometryInput {
  frameWidth: number;
  frameHeight: number;
  /** Height of the non-video part of the player panel (transport + title). */
  chrome: number;
  /** 0 = full-size player, 1 = fully shrunk. */
  progress: number;
}

export interface CinemaGeometry {
  /** Rendered player-panel width in px. */
  playerWidth: number;
  /** Rendered video height in px (16:9 of the width). */
  videoHeight: number;
  maxVideoHeight: number;
  minVideoHeight: number;
  /** Scroll distance (px) that takes the player from full size to minimum. */
  range: number;
}

export function computeCinemaGeometry({
  frameWidth,
  frameHeight,
  chrome,
  progress,
}: CinemaGeometryInput): CinemaGeometry {
  const width = Math.max(0, frameWidth);
  const height = Math.max(0, frameHeight);
  const p = Math.min(1, Math.max(0, progress));

  // Leave a visible slice of transcript even at full size, so readers know
  // there is text below the player to scroll to.
  const peek = Math.min(220, Math.max(96, height * 0.24));
  const byWidth = (Math.min(width, MAX_PLAYER_WIDTH) * 9) / 16;
  const byHeight = height - chrome - peek - 12;
  const maxVideoHeight = Math.max(90, Math.min(byWidth, byHeight));

  // Small enough to give the transcript most of the frame, large enough that
  // the video is still comfortably watchable.
  const minVideoHeight = Math.min(maxVideoHeight, Math.max(126, height * 0.26));
  const videoHeight = maxVideoHeight - (maxVideoHeight - minVideoHeight) * p;

  return {
    playerWidth: Math.round((videoHeight * 16) / 9),
    videoHeight: Math.round(videoHeight),
    maxVideoHeight: Math.round(maxVideoHeight),
    minVideoHeight: Math.round(minVideoHeight),
    range: Math.max(0, maxVideoHeight - minVideoHeight),
  };
}

interface UseCinemaFrameOptions {
  enabled: boolean;
  /** Changes when a new transcript loads, so the player returns to full size. */
  resetKey: string;
}

export function useCinemaFrame({ enabled, resetKey }: UseCinemaFrameOptions) {
  // Callback refs held in state: the frame mounts after AnimatePresence
  // finishes the previous view, so effects must re-run when the node appears.
  const [frame, frameRef] = useState<HTMLDivElement | null>(null);
  const [player, playerRef] = useState<HTMLDivElement | null>(null);

  const [size, setSize] = useState({ width: 0, height: 0 });
  const [chrome, setChrome] = useState(DEFAULT_CHROME);
  // Progress is keyed: a new video (or leaving Cinema) starts again with a
  // full-size player, derived during render instead of reset in an effect.
  const sessionKey = `${enabled ? "on" : "off"}|${resetKey}`;
  const [stored, setStored] = useState({ key: sessionKey, value: 0 });
  const progress = stored.key === sessionKey ? stored.value : 0;
  const progressRef = useRef(0);
  const sessionRef = useRef(sessionKey);
  useLayoutEffect(() => {
    if (sessionRef.current !== sessionKey) {
      sessionRef.current = sessionKey;
      progressRef.current = 0;
    }
  }, [sessionKey]);

  const geometry = computeCinemaGeometry({
    frameWidth: size.width,
    frameHeight: size.height,
    chrome,
    progress,
  });
  const rangeRef = useRef(geometry.range);
  useLayoutEffect(() => {
    rangeRef.current = geometry.range;
  }, [geometry.range]);

  const applyProgress = useCallback((next: number) => {
    const clamped = Math.min(1, Math.max(0, next));
    if (clamped === progressRef.current) return;
    progressRef.current = clamped;
    setStored({ key: sessionRef.current, value: clamped });
  }, []);

  /* ── Measure the frame and the player's non-video chrome ────────────── */
  useLayoutEffect(() => {
    if (!enabled || !frame) return;

    const measure = () => {
      const rect = frame.getBoundingClientRect();
      setSize((current) =>
        current.width === rect.width && current.height === rect.height
          ? current
          : { width: rect.width, height: rect.height },
      );
      if (player && player.offsetWidth > 0) {
        const measured = Math.round(player.offsetHeight - (player.offsetWidth * 9) / 16);
        if (measured > 40 && measured < 260) {
          setChrome((current) => (Math.abs(current - measured) > 1 ? measured : current));
        }
      }
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    if (player) observer.observe(player);
    return () => observer.disconnect();
  }, [enabled, frame, player]);

  /* ── Route scroll: align frame → shrink player → scroll rail ────────── */
  useEffect(() => {
    if (!enabled || !frame) return;

    const rail = () => frame.querySelector<HTMLElement>("[data-transcript-rail]");

    /** Returns true when the delta was consumed by the cinema behaviour. */
    const route = (deltaY: number, target: EventTarget | null): boolean => {
      if (deltaY === 0) return false;
      const range = rangeRef.current;
      const railEl = rail();
      const insideRail = Boolean(railEl && target instanceof Node && railEl.contains(target));

      if (deltaY > 0) {
        // 1. Bring the frame up under the header first.
        const offset = frame.getBoundingClientRect().top - HEADER_OFFSET;
        if (offset > 1) {
          window.scrollBy({ top: Math.min(deltaY, offset) });
          return true;
        }
        // 2. Shrink the player.
        if (range > 0 && progressRef.current < 1) {
          applyProgress(progressRef.current + deltaY / range);
          return true;
        }
        // 3. The rail scrolls natively (or the page, outside the rail).
        return false;
      }

      // Scrolling up: let the rail return to its top first.
      if (insideRail && railEl && railEl.scrollTop > 0) return false;
      if (range > 0 && progressRef.current > 0) {
        applyProgress(progressRef.current + deltaY / range);
        return true;
      }
      // Rails use overscroll containment, so hand the page its scroll back.
      if (insideRail) {
        window.scrollBy({ top: deltaY });
        return true;
      }
      return false;
    };

    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey) return; // pinch-zoom
      const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
      if (route(event.deltaY * scale, event.target)) event.preventDefault();
    };

    let lastTouchY: number | null = null;
    const onTouchStart = (event: TouchEvent) => {
      lastTouchY = event.touches[0]?.clientY ?? null;
    };
    const onTouchMove = (event: TouchEvent) => {
      const y = event.touches[0]?.clientY;
      if (y === undefined || lastTouchY === null) return;
      const delta = lastTouchY - y;
      lastTouchY = y;
      if (route(delta, event.target)) event.preventDefault();
    };
    const onTouchEnd = () => {
      lastTouchY = null;
    };

    frame.addEventListener("wheel", onWheel, { passive: false });
    frame.addEventListener("touchstart", onTouchStart, { passive: true });
    frame.addEventListener("touchmove", onTouchMove, { passive: false });
    frame.addEventListener("touchend", onTouchEnd);
    return () => {
      frame.removeEventListener("wheel", onWheel);
      frame.removeEventListener("touchstart", onTouchStart);
      frame.removeEventListener("touchmove", onTouchMove);
      frame.removeEventListener("touchend", onTouchEnd);
    };
  }, [enabled, frame, applyProgress]);

  return {
    frameRef,
    playerRef,
    geometry,
    progress,
    /** Measurement has happened, so sizes can be applied without a jump. */
    ready: size.height > 0,
  };
}
