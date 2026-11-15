import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BROKE_MEME, COPE_BUTTONS, gameKeyOf, pickRoast, ROAST_LINES, ROAST_TITLES, shouldTaunt, TAUNT_GAMES } from "../../src/arcade/brokeCat";
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

  it("draws the pixel cat on a 16×14 grid with known colours, and the meme clip is a local file", () => {
    for (const frame of CAT_FRAMES) {
      expect(frame).toHaveLength(14);
      for (const row of frame) {
        expect(row).toHaveLength(16);
        expect(row).toMatch(/^[.KSLPNT]+$/);
      }
    }
    // Served from public/, never hotlinked from another site.
    expect(BROKE_MEME.video).toBe("/memes/laughing-cat.mp4");
    // The still shows until the clip plays, and stays if it can't.
    expect(BROKE_MEME.image).toBe("/memes/laughing-cat.jpg");
    for (const path of [BROKE_MEME.video, BROKE_MEME.image, BROKE_MEME.audio]) {
      if (path) expect(existsSync(join("public", path))).toBe(true);
    }
  });

  it("picks a headline, a roast and a cope from their lists, at both ends of the range", () => {
    expect(pickRoast(() => 0)).toEqual({ title: ROAST_TITLES[0], line: ROAST_LINES[0], cope: COPE_BUTTONS[0] });
    const last = pickRoast(() => 0.999999);
    expect(last).toEqual({ title: ROAST_TITLES.at(-1), line: ROAST_LINES.at(-1), cope: COPE_BUTTONS.at(-1) });
    for (const list of [ROAST_TITLES, ROAST_LINES, COPE_BUTTONS]) {
      expect(list.length).toBeGreaterThan(3);
      expect(new Set(list).size).toBe(list.length);
    }
  });
});
