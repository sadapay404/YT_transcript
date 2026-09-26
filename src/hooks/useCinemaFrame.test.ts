import { describe, expect, it } from "vitest";

import { computeCinemaGeometry } from "@/hooks/useCinemaFrame";

const base = { frameWidth: 1400, frameHeight: 820, chrome: 112 };

describe("Cinema frame geometry", () => {
  it("fits the full-size player inside the frame with a transcript peek", () => {
    const g = computeCinemaGeometry({ ...base, progress: 0 });
    // Player (video + chrome) leaves room below it inside the frame.
    expect(g.videoHeight + base.chrome).toBeLessThan(base.frameHeight - 90);
    expect(g.playerWidth).toBeLessThanOrEqual(1024);
    expect(g.playerWidth / g.videoHeight).toBeCloseTo(16 / 9, 1);
  });

  it("never exceeds a short window", () => {
    const g = computeCinemaGeometry({ frameWidth: 1400, frameHeight: 520, chrome: 112, progress: 0 });
    expect(g.videoHeight + 112).toBeLessThan(520);
  });

  it("shrinks monotonically to the minimum and stops there", () => {
    const sizes = [0, 0.25, 0.5, 0.75, 1, 1.5].map(
      (progress) => computeCinemaGeometry({ ...base, progress }).videoHeight,
    );
    for (let i = 1; i < sizes.length; i += 1) expect(sizes[i]).toBeLessThanOrEqual(sizes[i - 1]!);
    const g = computeCinemaGeometry({ ...base, progress: 1 });
    expect(g.videoHeight).toBe(g.minVideoHeight);
    expect(sizes.at(-1)).toBe(g.minVideoHeight);
    expect(g.range).toBeCloseTo(g.maxVideoHeight - g.minVideoHeight, 0);
  });

  it("leaves most of the frame to the transcript once fully shrunk", () => {
    const g = computeCinemaGeometry({ ...base, progress: 1 });
    const transcript = base.frameHeight - g.videoHeight - base.chrome;
    expect(transcript).toBeGreaterThan(base.frameHeight * 0.5);
  });

  it("follows the width on narrow windows", () => {
    const g = computeCinemaGeometry({ frameWidth: 390, frameHeight: 760, chrome: 112, progress: 0 });
    expect(g.playerWidth).toBeLessThanOrEqual(390);
  });
});
