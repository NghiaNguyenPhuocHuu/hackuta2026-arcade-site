import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BROKE_MEME, gameKeyOf, shouldTaunt, TAUNT_GAMES, TAUNTS } from "../../src/arcade/brokeCat";
import { CAT_FRAMES } from "../../src/components/BrokeCatPopup";

describe("broke cat", () => {
  it("taunts once, when the balance drops to 0 in a solo game", () => {
    expect(shouldTaunt(10, 0, "olympus-slots")).toBe(true);
    expect(shouldTaunt(5, 0, "wheel-of-the-fates")).toBe(true);
    expect(shouldTaunt(0, 0, "olympus-slots")).toBe(false); // already broke: no repeat
    expect(shouldTaunt(null, 0, "olympus-slots")).toBe(false); // first balance seen
    expect(shouldTaunt(10, 5, "olympus-slots")).toBe(false);
  });

  it("leaves table games alone (a buy-in can empty the wallet on purpose) and pages outside games", () => {
    expect(shouldTaunt(50, 0, "olympus-poker")).toBe(false);
    expect(shouldTaunt(50, 0, "pvp-blackjack")).toBe(false);
    expect(shouldTaunt(50, 0, null)).toBe(false);
    expect([...TAUNT_GAMES].sort()).toEqual(["olympus-slots", "wheel-of-the-fates"]);
  });

  it("reads the game from /play/:key paths", () => {
    expect(gameKeyOf("/play/olympus-slots")).toBe("olympus-slots");
    expect(gameKeyOf("/play/wheel-of-the-fates/")).toBe("wheel-of-the-fates");
    expect(gameKeyOf("/wallet")).toBeNull();
  });

  it("draws the pixel cat on a 16×14 grid with known colours, and the meme picture is a local file", () => {
    for (const frame of CAT_FRAMES) {
      expect(frame).toHaveLength(14);
      for (const row of frame) {
        expect(row).toHaveLength(16);
        expect(row).toMatch(/^[.KSLPNT]+$/);
      }
    }
    expect(TAUNTS.length).toBeGreaterThan(0);
    // Served from public/, never hotlinked from another site.
    expect(BROKE_MEME.image).toBe("/memes/laughing-cat.jpg");
    expect(existsSync(join("public", BROKE_MEME.image!))).toBe(true);
    expect(BROKE_MEME.audio).toBe("/memes/laughing-cat.mp3");
    expect(existsSync(join("public", BROKE_MEME.audio!))).toBe(true);
  });
});
