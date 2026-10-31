/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Follow-along verdicts (pure functions)
 * ─────────────────────────────────────────────────────────────────────────────
 *  `sync.ts` answers *"which line is being spoken, and how far should the rail
 *  scroll to show it"*. This module answers the other half of Step 3: **"is the
 *  reader still happy for us to drive?"**
 *
 *  Every judgement a scroll listener has to make lives here, takes plain
 *  numbers, and is unit-tested. The React hook beside it
 *  (`src/hooks/useFollowAlong.ts`) only wires these to browser events, so the
 *  behaviour can be reasoned about — and tested — without a DOM.
 */
import { FOLLOW } from "@/lib/constants";

/**
 * Keys that mean "I'm moving the rail myself".
 *
 * Space is deliberately absent: the studio binds it to play/pause, and pausing
 * is not scrolling. Arrow left/right are absent too — they scrub the video.
 */
const TAKEOVER_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "PageUp",
  "PageDown",
  "Home",
  "End",
]);

export function isTakeoverKey(key: string): boolean {
  return TAKEOVER_KEYS.has(key);
}

/**
 * True when the rail has drifted away from where the engine parked it.
 *
 * A wheel, a finger or a key are caught directly, but a *dragged scrollbar* says
 * nothing at all until it moves — this is what notices that. The tolerance
 * absorbs the browser's own sub-pixel adjustments (scroll anchoring, a
 * `content-visibility` re-measure) so only a deliberate move counts.
 */
export function driftedFromEngine(
  scrollTop: number,
  expectedTop: number,
  tolerance: number = FOLLOW.driftTolerance,
): boolean {
  if (!Number.isFinite(scrollTop) || !Number.isFinite(expectedTop)) return false;
  return Math.abs(scrollTop - expectedTop) > tolerance;
}

/**
 * Is the rail its own scroll container — or is the page scrolling instead?
 *
 * The same pane runs in four layouts. In Split on a desktop the rail is a
 * fixed-height scroller that owns its `scrollTop`; in Read mode, and on phones
 * where the panel is free to grow, the transcript flows with the page and there
 * is nothing inside to scroll. Following has to work in both, and this decides
 * whether we drive `scrollTop` or hand the centring to `scrollIntoView`.
 */
export function isScrollContainer(
  metrics: { scrollHeight: number; clientHeight: number },
  slack = 4,
): boolean {
  return metrics.scrollHeight - metrics.clientHeight > slack;
}
