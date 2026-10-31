"use client";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Cinema: theater player that shrinks as you read
 * ─────────────────────────────────────────────────────────────────────────────
 *  Sizing lives entirely in CSS (`.cinema-stage` is a size container and the
 *  player's width is derived from its height budget), so the player can never
 *  be larger than the window — no measurement, no layout race, no overflow.
 *
 *  This hook only owns ONE number: `--cinema-p`, the shrink progress (0 = the
 *  biggest player that still leaves the transcript visible, 1 = the compact
 *  minimum). Scrolling down anywhere on the stage first spends the gesture on
 *  shrinking the player and then scrolls the transcript; scrolling up scrolls
 *  the transcript back to its top and only then grows the player again. The
 *  value is written straight to the element's style — no React re-render per
 *  wheel tick — and the page itself never scrolls in Cinema.
 */
import { useCallback, useEffect, useRef, useState } from "react";

/** Pixels of scroll that take the player from full size to its minimum. */
export const CINEMA_SHRINK_RANGE = 320;

export interface CinemaScrollStep {
  /** New progress, clamped to [0, 1]. */
  progress: number;
  /** Pixels still to apply to the transcript rail after the shrink used its share. */
  railDelta: number;
}

/**
 * Pure routing of one scroll gesture between "resize the player" and "scroll
 * the transcript". Exported for tests — this is the whole behaviour contract.
 */
export function routeCinemaScroll(
  progress: number,
  deltaY: number,
  railScrollTop: number,
  range: number = CINEMA_SHRINK_RANGE,
): CinemaScrollStep {
  const p = clamp01(progress);
  const safeRange = Math.max(1, range);
  if (deltaY > 0) {
    // Down: shrink first, then hand the remainder to the transcript.
    const room = (1 - p) * safeRange;
    const used = Math.min(room, deltaY);
    return { progress: clamp01(p + used / safeRange), railDelta: deltaY - used };
  }
  if (deltaY < 0) {
    // Up: the transcript returns to its top first; only then does the player grow.
    const railUp = Math.min(railScrollTop, -deltaY);
    const remaining = -deltaY - railUp;
    const grow = Math.min(p * safeRange, remaining);
    return { progress: clamp01(p - grow / safeRange), railDelta: -railUp };
  }
  return { progress: p, railDelta: 0 };
}

export function useCinemaShrink({ enabled, resetKey }: { enabled: boolean; resetKey: string }) {
  const [stage, setStage] = useState<HTMLDivElement | null>(null);
  const progress = useRef(0);
  // Compactness is remembered per transcript, so a reset never needs setState.
  const [compactFor, setCompactFor] = useState<string | null>(null);
  const compactRef = useRef(false);
  const keyRef = useRef(resetKey);

  const apply = useCallback(
    (element: HTMLElement, next: number, animate = false) => {
      progress.current = clamp01(next);
      element.style.setProperty("--cinema-p", progress.current.toFixed(4));
      if (animate) {
        element.dataset.cinemaAnimate = "";
        window.setTimeout(() => delete element.dataset.cinemaAnimate, 420);
      }
      const isCompact = progress.current > 0.5;
      if (isCompact !== compactRef.current) {
        compactRef.current = isCompact;
        setCompactFor(isCompact ? keyRef.current : null);
      }
    },
    [],
  );

  // New material starts at the full theater size.
  useEffect(() => {
    if (keyRef.current !== resetKey) {
      keyRef.current = resetKey;
      progress.current = 0;
      compactRef.current = false;
    }
    // Re-entering Cinema with the same video keeps the size the reader chose.
    stage?.style.setProperty("--cinema-p", progress.current.toFixed(4));
  }, [stage, resetKey]);

  useEffect(() => {
    if (!enabled || !stage) return;
    const rail = () => stage.querySelector<HTMLElement>("[data-transcript-rail]");

    const route = (deltaY: number, event: Event) => {
      const target = event.target as HTMLElement | null;
      // Popovers/menus inside the stage keep their own scrolling.
      if (target?.closest("[role='menu'], [role='listbox'], [data-own-scroll]")) return;
      const railElement = rail();
      if (!railElement) return;
      const insideRail = railElement.contains(target);
      const step = routeCinemaScroll(progress.current, deltaY, railElement.scrollTop);

      const consumedByShrink = step.progress !== progress.current;
      if (consumedByShrink) apply(stage, step.progress);

      if (consumedByShrink || !insideRail) {
        // We own this gesture: stop the page (and the follow engine, for a
        // pure resize) from also reacting to it, and move the rail ourselves.
        event.preventDefault();
        if (step.railDelta !== 0) railElement.scrollTop += step.railDelta;
        else event.stopPropagation();
      }
      // Otherwise it's an ordinary transcript scroll: let the browser do it.
    };

    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey) return; // pinch-zoom
      const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? stage.clientHeight : 1;
      route(event.deltaY * scale, event);
    };

    let lastY: number | null = null;
    const onTouchStart = (event: TouchEvent) => {
      lastY = event.touches.length === 1 ? event.touches[0].clientY : null;
    };
    const onTouchMove = (event: TouchEvent) => {
      if (lastY === null || event.touches.length !== 1) return;
      const y = event.touches[0].clientY;
      const delta = lastY - y;
      lastY = y;
      route(delta, event);
    };
    const onTouchEnd = () => {
      lastY = null;
    };

    stage.addEventListener("wheel", onWheel, { passive: false, capture: true });
    stage.addEventListener("touchstart", onTouchStart, { passive: true });
    stage.addEventListener("touchmove", onTouchMove, { passive: false, capture: true });
    stage.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      stage.removeEventListener("wheel", onWheel, { capture: true });
      stage.removeEventListener("touchstart", onTouchStart);
      stage.removeEventListener("touchmove", onTouchMove, { capture: true });
      stage.removeEventListener("touchend", onTouchEnd);
    };
  }, [apply, enabled, stage]);

  /** The explicit control: jump between the theater size and the compact size. */
  const toggle = useCallback(() => {
    if (!stage) return;
    apply(stage, progress.current > 0.5 ? 0 : 1, true);
  }, [apply, stage]);

  return { stageRef: setStage, compact: enabled && compactFor === resetKey, toggle };
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}
