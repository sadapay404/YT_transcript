import { describe, expect, it } from "vitest";

import { routeCinemaScroll } from "@/hooks/useCinemaShrink";

describe("Cinema scroll routing", () => {
  it("spends a downward scroll on shrinking the player first", () => {
    const step = routeCinemaScroll(0, 100, 0, 320);
    expect(step.progress).toBeCloseTo(100 / 320);
    expect(step.railDelta).toBe(0);
  });

  it("hands the rest to the transcript once the player is at its minimum", () => {
    const step = routeCinemaScroll(0.9, 100, 0, 320);
    expect(step.progress).toBe(1);
    expect(step.railDelta).toBeCloseTo(100 - 0.1 * 320);
    expect(routeCinemaScroll(1, 80, 500, 320)).toEqual({ progress: 1, railDelta: 80 });
  });

  it("scrolls the transcript back to its top before growing the player", () => {
    expect(routeCinemaScroll(1, -100, 400, 320)).toEqual({ progress: 1, railDelta: -100 });
    const atTop = routeCinemaScroll(1, -160, 0, 320);
    expect(atTop.progress).toBeCloseTo(0.5);
    expect(atTop.railDelta).toBe(-0);
  });

  it("splits one upward gesture between the last of the transcript and the player", () => {
    const step = routeCinemaScroll(1, -100, 40, 320);
    expect(step.railDelta).toBe(-40);
    expect(step.progress).toBeCloseTo(1 - 60 / 320);
  });

  it("never leaves the 0–1 range", () => {
    expect(routeCinemaScroll(0, -500, 0).progress).toBe(0);
    expect(routeCinemaScroll(1, 5_000, 0).progress).toBe(1);
  });
});
