import type { GameModule } from "../types";
import { createMockAdapter } from "./adapters/mockAdapter";
import { mountMinigame } from "./mountMinigame";
import type { RecentSpin } from "./types";

/** Olympus Slots as an arcade game module. */
export const game: GameModule = {
  mountMock(element, wallet) {
    const adapter = createMockAdapter({
      balance: wallet.balance,
      recentSpins: Array.isArray(wallet.saved) ? (wallet.saved as RecentSpin[]) : [],
    });
    const stopSync = adapter.subscribe(({ balance, recentSpins }) => wallet.save({ balance, saved: recentSpins }));
    const unmountGame = mountMinigame(element, { adapter, points: wallet });
    let done = false;
    return () => {
      if (done) return;
      done = true;
      unmountGame();
      stopSync();
      adapter.dispose();
    };
  },
};
