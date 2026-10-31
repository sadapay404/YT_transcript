import { describe, expect, it } from "vitest";

import { FOLLOW } from "@/lib/constants";
import {
  driftedFromEngine,
  isScrollContainer,
  isTakeoverKey,
} from "@/lib/youtube/follow";

describe("isTakeoverKey", () => {
  it("recognises the keys that scroll a rail", () => {
    for (const key of ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"]) {
      expect(isTakeoverKey(key)).toBe(true);
    }
  });

  it("leaves the app's own shortcuts alone", () => {
    // Space is play/pause, J/L are ±10s, 1–3 switch layout, Enter activates a
    // focused line — none of them mean "stop following".
    for (const key of [" ", "Space", "j", "L", "1", "3", "Enter", "ArrowLeft", "ArrowRight", ""]) {
      expect(isTakeoverKey(key)).toBe(false);
    }
  });
});

describe("driftedFromEngine", () => {
  it("ignores the browser's own sub-pixel nudges", () => {
    expect(driftedFromEngine(1000, 1000)).toBe(false);
    expect(driftedFromEngine(1012, 1000)).toBe(false);
    expect(driftedFromEngine(988, 1000)).toBe(false);
  });

  it("notices a deliberate move in either direction", () => {
    expect(driftedFromEngine(1400, 1000)).toBe(true);
    expect(driftedFromEngine(300, 1000)).toBe(true);
  });

  it("treats the tolerance as inclusive", () => {
    expect(driftedFromEngine(1000 + FOLLOW.driftTolerance, 1000)).toBe(false);
    expect(driftedFromEngine(1001 + FOLLOW.driftTolerance, 1000)).toBe(true);
    expect(driftedFromEngine(1000, 1000, 400)).toBe(false);
    expect(driftedFromEngine(1401, 1000, 400)).toBe(true);
  });

  it("says nothing when a measurement is unusable", () => {
    expect(driftedFromEngine(Number.NaN, 1000)).toBe(false);
    expect(driftedFromEngine(1000, Number.NaN)).toBe(false);
    expect(driftedFromEngine(Number.POSITIVE_INFINITY, 1000)).toBe(false);
  });
});

describe("isScrollContainer", () => {
  it("is true when the content overflows the box", () => {
    expect(isScrollContainer({ scrollHeight: 9_000, clientHeight: 600 })).toBe(true);
  });

  it("is false when the rail flows with the page instead", () => {
    expect(isScrollContainer({ scrollHeight: 600, clientHeight: 600 })).toBe(false);
    expect(isScrollContainer({ scrollHeight: 9_000, clientHeight: 9_000 })).toBe(false);
    expect(isScrollContainer({ scrollHeight: 0, clientHeight: 0 })).toBe(false);
  });

  it("ignores a couple of pixels of rounding", () => {
    expect(isScrollContainer({ scrollHeight: 603, clientHeight: 600 })).toBe(false);
    expect(isScrollContainer({ scrollHeight: 605, clientHeight: 600 })).toBe(true);
  });
});
