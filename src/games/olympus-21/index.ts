import type { GameModule } from "../types";
import { createMockAdapter } from "./adapters/mockAdapter.js";
import { createConvexAdapter } from "./adapters/convexAdapter.js";
import { bridgeReactClient } from "./adapters/reactClientBridge";
import { mountOlympus21 } from "./mountOlympus21.js";

/**
 * Olympus 21 as an arcade game module (registry key "pvp-blackjack").
 * Mock mode runs the shared engine in the browser with up to 3 bots; the
 * hacker sits down with the arcade wallet's balance and every change to their
 * table balance (wager, payout) is written back, so the lobby stays in step.
 * Live mode is player vs player on real points: the server (`admin/o21Tables`)
 * seats each signed-in hacker at a random open table with a free seat (or
 * opens one), and the lobby's points pill follows `checkedIn.points` by itself.
 */
export const game: GameModule = {
  mountMock(element, wallet, options) {
    const adapter = createMockAdapter({ balance: wallet.balance, name: options?.player?.displayName });
    let last = wallet.balance;
    const stopSync = adapter.subscribe((view) => {
      const balance = view.me?.balance;
      if (typeof balance !== "number" || balance === last) return;
      last = balance;
      wallet.save({ balance, saved: null });
    });
    const unmountGame = mountOlympus21(element, {
      adapter,
      view: "auto",
      playerName: options?.player?.displayName.split(" ")[0],
    });
    let done = false;
    return () => {
      if (done) return;
      done = true;
      unmountGame();
      stopSync();
      adapter.dispose();
    };
  },
  mountLive(element, { client, player }) {
    const adapter = createConvexAdapter({
      client: bridgeReactClient(client),
      onError: (error) => console.error("Olympus 21:", error),
    });
    const unmountGame = mountOlympus21(element, {
      adapter,
      view: "auto",
      playerName: player?.displayName.split(" ")[0],
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
