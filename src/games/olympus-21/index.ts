import type { GameModule } from "../types";
import { createConvexAdapter } from "./adapters/convexAdapter.js";
import { bridgeReactClient } from "./adapters/reactClientBridge";
import { mountOlympus21 } from "./mountOlympus21.js";

/**
 * Olympus 21 as an arcade game module (registry key "pvp-blackjack").
 * Live server only (`arcade/olympus21`), with Olympus Poker's matchmaking:
 * buy in from the arcade wallet, wait in the event-wide queue, and the server
 * seats you with other hackers (humans only, no bots). Chips go back to the
 * wallet when you leave. The server decides everything.
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
