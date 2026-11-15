import type { GameModule } from "../types";
import { createConvexAdapter } from "./adapters/convexAdapter.js";
import { bridgeReactClient } from "./adapters/reactClientBridge";
import { mountOlympus21 } from "./mountOlympus21.js";

/**
 * Olympus 21 as an arcade game module (registry key "pvp-blackjack").
 * Player vs player on the live server: `admin/o21Tables` seats each signed-in,
 * checked-in hacker at a random open table with a free seat (or opens one).
 * No bots on real tables. The server decides everything; the lobby's points
 * follow the session query by themselves.
 *
 * (The in-browser mock with bots, `adapters/mockAdapter.js`, stays for the
 * engine tests only.)
 */
export const game: GameModule = {
  mount(element, host) {
    const adapter = createConvexAdapter({
      client: bridgeReactClient(host.client),
      onError: (error) => console.error("Olympus 21:", error),
    });
    const unmountGame = mountOlympus21(element, {
      adapter,
      view: "auto",
      playerName: host.player?.displayName.split(" ")[0],
    });
    let done = false;
    return () => {
      if (done) return;
      done = true;
      unmountGame();
      adapter.dispose();
    };
  },
};
