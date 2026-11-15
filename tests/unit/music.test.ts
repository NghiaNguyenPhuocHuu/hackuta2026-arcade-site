import { describe, expect, it } from "vitest";
import { noteFrequency, parseBar } from "../../src/arcade/music";

describe("background music", () => {
  it("tunes notes to concert pitch", () => {
    expect(noteFrequency("A4")).toBeCloseTo(440, 6);
    expect(noteFrequency("C5")).toBeCloseTo(523.2511, 3);
    expect(noteFrequency("F#5")).toBeCloseTo(739.9888, 3);
    expect(noteFrequency("H2")).toBeNull();
    expect(noteFrequency("-")).toBeNull();
  });

  it("reads a bar of eighth notes, holds and rests", () => {
    expect(parseBar("E5 - G5 - C6 - B5 A5")).toEqual([[0, "E5", 2], [2, "G5", 2], [4, "C6", 2], [6, "B5", 1], [7, "A5", 1]]);
    expect(parseBar("G5 - - - D5 - G5 .")).toEqual([[0, "G5", 4], [4, "D5", 2], [6, "G5", 1]]);
    expect(parseBar(". . . .")).toEqual([]);
  });
});
