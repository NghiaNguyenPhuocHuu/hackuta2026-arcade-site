import { describe, expect, it } from "vitest";
import { ARCADE_GAMES, arcadeStateAt, bytesToBase64Url, isLaunchCodeShape } from "../../shared/arcade/rules";
import { GAMES } from "../../src/games/registry";

describe("arcade rules shared with the backend", () => {
  it("lists the same games, in the same order, as the site's registry", () => {
    expect(GAMES.map((game) => [game.key, game.name])).toEqual(ARCADE_GAMES.map((game) => [game.key, game.name]));
  });

  it("encodes 32 random bytes as a launch code the server accepts", () => {
    const code = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
    expect(isLaunchCodeShape(code)).toBe(true);
    expect(bytesToBase64Url(new Uint8Array(32).fill(255))).toBe("_".repeat(42) + "8");
  });

  it("closes an 'on' switch at its end time", () => {
    expect(arcadeStateAt({ mode: "on", closesAt: 1000 }, 999).status).toBe("on");
    expect(arcadeStateAt({ mode: "on", closesAt: 1000 }, 1000).status).toBe("off");
  });
});
