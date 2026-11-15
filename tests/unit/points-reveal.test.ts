import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPointsHold, holdPoints, releasePoints, resetPointsHold, shownPoints, subscribePointsHold } from "../../src/arcade/pointsReveal";
import { maxRevealMs } from "../../src/games/wheel-of-the-fates/Wheel";

beforeEach(() => {
  vi.useFakeTimers();
  resetPointsHold();
});
afterEach(() => {
  resetPointsHold();
  vi.useRealTimers();
});

describe("points reveal hold", () => {
  it("shows the held balance until the game releases it", () => {
    holdPoints("wheel-of-the-fates", 80, 10_000);
    expect(shownPoints(130)).toBe(80);
    releasePoints("wheel-of-the-fates");
    expect(shownPoints(130)).toBe(130);
  });

  it("ends by itself at the deadline when the player left mid-spin", () => {
    const listener = vi.fn();
    const stop = subscribePointsHold(listener);
    holdPoints("olympus-slots", 90, 3000);
    vi.advanceTimersByTime(2999);
    expect(getPointsHold()).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(getPointsHold()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
  });

  it("only lets the game that holds release it", () => {
    holdPoints("olympus-slots", 90, 3000);
    releasePoints("wheel-of-the-fates");
    expect(shownPoints(110)).toBe(90);
  });

  it("re-holding replaces the deadline (answer in: wait only for the landing)", () => {
    holdPoints("wheel-of-the-fates", 80, 15_000);
    holdPoints("wheel-of-the-fates", 80, 2000);
    vi.advanceTimersByTime(2000);
    expect(getPointsHold()).toBeNull();
  });

  it("covers the wheel's longest landing", () => {
    // Normal: 1.4 s minimum spin + up to 6.9 s landing.
    expect(maxRevealMs(false)).toBeGreaterThanOrEqual(1400 + 6900);
    expect(maxRevealMs(true)).toBeLessThan(maxRevealMs(false));
  });
});
