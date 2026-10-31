"use client";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  useFollowAlong — the rail tracks the voice
 * ─────────────────────────────────────────────────────────────────────────────
 *  Owns exactly one question: *where should the transcript be scrolled to, and
 *  is the reader still happy for us to decide?*
 *
 *  · Every time the spoken line changes, the rail scrolls so that line sits in
 *    the comfortable band — or dead centre, per "Center the active line" —
 *    using the unit-tested maths in `lib/youtube/sync.ts`. No maths here.
 *  · The moment the reader scrolls the rail themselves (a wheel, a finger, a
 *    scroll key, or a dragged scrollbar that drifts away from where we parked
 *    it) following pauses and `paused` flips true, so the pane can offer
 *    **Resume following**. Clicking that, or any line, hands it back.
 *  · "Reduce motion" turns the glide into an instant jump. Motion is never the
 *    point; knowing where the voice is, is.
 *
 *  Nothing here is stateful enough to be worth a store: it is per-pane,
 *  per-mount behaviour, and it must never re-render 5 000 lines to move a
 *  scrollbar.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import { FOLLOW } from "@/lib/constants";
import type { TranscriptSegment } from "@/lib/types";
import {
  driftedFromEngine,
  isScrollContainer,
  isTakeoverKey,
} from "@/lib/youtube/follow";
import { nextScrollTop } from "@/lib/youtube/sync";

export interface FollowAlongOptions {
  segments: TranscriptSegment[];
  /** Index of the line being spoken; -1 during the lead-in, by design. */
  activeIndex: number;
  /** The "Follow along" switch. */
  enabled: boolean;
  /** The "Center the active line" switch. */
  center: boolean;
  /** The "Reduce motion" switch. */
  reduceMotion: boolean;
  /** Changing this starts following over — a new video, a pasted transcript. */
  resetKey?: string;
  /** Changing this re-anchors without pausing — typography, or a layout switch. */
  reflowKey?: string;
}

export interface FollowAlong {
  /** The rail is tracking playback right now. */
  following: boolean;
  /** The reader scrolled away: the pane should offer "Resume following". */
  paused: boolean;
  /** Hand the rail back to the video, and glide to the active line. */
  resume: () => void;
  /** Goes on the scrollable element that holds the lines. */
  containerRef: RefObject<HTMLDivElement | null>;
}

/**
 * How far the rail should move to show `line`, or `null` when it is already
 * where it belongs. All of the arithmetic — and all of the reasons for it —
 * lives in `sync.nextScrollTop`, which is unit-tested.
 */
function measure(
  container: HTMLElement,
  line: HTMLElement,
  center: boolean,
): number | null {
  const containerRect = container.getBoundingClientRect();
  const lineRect = line.getBoundingClientRect();

  return nextScrollTop({
    containerTop: containerRect.top,
    containerHeight: container.clientHeight,
    lineTop: lineRect.top,
    lineHeight: lineRect.height,
    currentScrollTop: container.scrollTop,
    center,
  });
}

export function useFollowAlong({
  segments,
  activeIndex,
  enabled,
  center,
  reduceMotion,
  resetKey,
  reflowKey,
}: FollowAlongOptions): FollowAlong {
  const containerRef = useRef<HTMLDivElement>(null);

  /* ── Following, without a single state-resetting effect ────────────────────
   * We remember *at which material* the reader took over, not a boolean. New
   * material — a different video, a pasted transcript, the switch coming back
   * on — makes the keys differ again, which is exactly "start following". So
   * "reset when the material changes" falls out of the derivation instead of
   * needing an effect that would cascade renders. */
  const materialKey = `${resetKey ?? ""}|${enabled ? "follow" : "off"}`;
  const [takeover, setTakeover] = useState<string | null>(null);
  const following = takeover !== materialKey;
  const paused = enabled && !following;

  /* Where the engine last parked the rail, and until when the scroll events it
     sees are its own. Refs, not state: these change on every tick and must
     never cause a render. */
  const expectedTopRef = useRef(0);
  const settleUntilRef = useRef(0);
  const graceUntilRef = useRef(0);
  /** Mirrors `enabled && following` for the async correction passes. */
  const engagedRef = useRef(true);

  useEffect(() => {
    engagedRef.current = enabled && following;
  }, [enabled, following]);

  /* A reflow is not a takeover: moving a typography slider (or switching
     layout) can shift the rail on its own, so re-anchor rather than pause. */
  useEffect(() => {
    expectedTopRef.current = containerRef.current?.scrollTop ?? 0;
    settleUntilRef.current = 0;
  }, [reflowKey]);

  /* ── The move ───────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!enabled || !following || activeIndex < 0) return;

    const container = containerRef.current;
    if (!container) return;

    const line = container.querySelector<HTMLElement>(
      `[data-segment-index="${activeIndex}"]`,
    );
    if (!line) return;

    const smooth = !reduceMotion;

    /* In Read mode, and on phones where the panel is free to grow, the rail is
       not a scroller at all — the page is. Hand the centring to the browser,
       which also keeps the line clear of any sticky chrome above it. */
    if (!isScrollContainer(container)) {
      line.scrollIntoView({
        behavior: smooth ? "smooth" : "auto",
        block: center ? "center" : "nearest",
      });
      expectedTopRef.current = container.scrollTop;
      return;
    }

    const target = measure(container, line, center);
    if (target === null) {
      /* Already comfortable. Remember where we are, so the next scroll event
         isn't blamed on the engine. */
      expectedTopRef.current = container.scrollTop;
      return;
    }

    expectedTopRef.current = target;
    settleUntilRef.current = performance.now() + FOLLOW.settleMs;
    container.scrollTo({ top: target, behavior: smooth ? "smooth" : "auto" });

    /* ── …and then make sure it actually landed ───────────────────────────────
     * `content-visibility: auto` lets the browser skip off-screen lines, so a
     * line that has never been painted can measure from its placeholder box.
     * Seeking across an hour of video is exactly that case, and the first jump
     * can land short. Once the rail has settled, look again and finish the move
     * instantly. The passes are capped, so a pathological layout can never turn
     * into a scroll fight. */
    let attempts = 1;
    const timers: number[] = [];

    const correct = () => {
      if (!engagedRef.current) return;
      const next = measure(container, line, center);
      if (next === null) return; // landed: the line is where it belongs
      expectedTopRef.current = next;
      container.scrollTo({ top: next, behavior: "auto" });
      if (attempts++ < FOLLOW.maxCorrections) {
        timers.push(window.setTimeout(correct, FOLLOW.correctionMs));
      }
    };

    timers.push(window.setTimeout(correct, FOLLOW.settleMs));
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [activeIndex, center, enabled, following, reduceMotion, segments]);

  /* ── Who is driving? ────────────────────────────────────────────────────── */
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;

    const takeOver = () => {
      // Momentum from a trackpad keeps firing after "Resume following" is
      // clicked; a beat of grace stops that from instantly re-pausing.
      if (performance.now() < graceUntilRef.current) return;
      setTakeover(materialKey);
    };

    const onWheel = () => takeOver();

    const onTouchMove = () => takeOver();

    const onKeyDown = (event: KeyboardEvent) => {
      if (isTakeoverKey(event.key)) takeOver();
    };

    /* The backstop for gestures we cannot see: dragging the scrollbar doesn't
       emit a wheel event, it just moves. Anything that drifts away from where
       the engine parked the rail is the reader. */
    const onScroll = () => {
      const now = performance.now();
      if (now < settleUntilRef.current || now < graceUntilRef.current) return;
      if (!isScrollContainer(container)) return;
      if (!driftedFromEngine(container.scrollTop, expectedTopRef.current)) return;
      takeOver();
    };

    container.addEventListener("wheel", onWheel, { passive: true });
    container.addEventListener("touchmove", onTouchMove, { passive: true });
    container.addEventListener("keydown", onKeyDown);
    container.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("keydown", onKeyDown);
      container.removeEventListener("scroll", onScroll);
    };
  }, [enabled, materialKey]);

  const resume = useCallback(() => {
    // Momentum from a trackpad keeps firing after the click; the grace window
    // stops that from instantly pausing us again.
    graceUntilRef.current = performance.now() + FOLLOW.resumeGraceMs;
    setTakeover(null); // the move effect above takes it from here
  }, []);

  return { following, paused, resume, containerRef };
}
