import { describe, expect, it } from "vitest";
import { clockParts, sealPercent, teaserLine, teaserPhase } from "../../src/arcade/teaser";

const MIN = 60_000;

describe("teaser phase", () => {
  it("steps far → warm → hot → final → open as the opening nears", () => {
    expect(teaserPhase(2 * 60 * MIN)).toBe("far");
    expect(teaserPhase(60 * MIN + 1)).toBe("far");
    expect(teaserPhase(60 * MIN)).toBe("warm");
    expect(teaserPhase(10 * MIN)).toBe("hot");
    expect(teaserPhase(10_000)).toBe("final");
    expect(teaserPhase(1)).toBe("final");
    expect(teaserPhase(0)).toBe("open");
    expect(teaserPhase(-5000)).toBe("open");
  });
});

describe("temple seal", () => {
  it("stays full until the last hour, then drains to zero", () => {
    expect(sealPercent(3 * 60 * MIN)).toBe(100);
    expect(sealPercent(60 * MIN)).toBe(100);
    expect(sealPercent(30 * MIN)).toBe(50);
    expect(sealPercent(0)).toBe(0);
    expect(sealPercent(-MIN)).toBe(0);
  });
});

describe("clock digits", () => {
  it("pads, rounds seconds up and caps hours at 99", () => {
    expect(clockParts(65 * MIN + 1500)).toEqual(["01", "05", "02"]);
    expect(clockParts(999)).toEqual(["00", "00", "01"]);
    expect(clockParts(0)).toEqual(["00", "00", "00"]);
    expect(clockParts(200 * 60 * MIN)).toEqual(["99", "00", "00"]);
  });
});

describe("Techno's teaser lines", () => {
  it("fills in the opening time and the seal", () => {
    expect(teaserLine("far", { at: "7:00 PM", seal: 100 }).line).toContain("7:00 PM");
    expect(teaserLine("hot", { at: "7:00 PM", seal: 12 }).line).toContain("12%");
    expect(teaserLine("open", { at: "7:00 PM", seal: 0 }).mood).toBe("cheer");
  });
});
