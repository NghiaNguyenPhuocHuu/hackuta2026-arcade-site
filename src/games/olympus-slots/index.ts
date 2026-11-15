import type { GameModule } from "../types";
import { createConvexAdapter } from "./adapters/convexAdapter";
import { mountMinigame } from "./mountMinigame";

/** Olympus Slots as an arcade game module, on the live server (admin/slotSpin). */
export const game: GameModule = {
  mount(element, host) {
    const adapter = createConvexAdapter({ client: host.client, onError: (error) => console.error("[slots]", error) });
    const unmountGame = mountMinigame(element, { adapter, points: host.reveal });
    let done = false;
    return () => {
      if (done) return;
      done = true;
      unmountGame();
      adapter.dispose();
    };
  },
};
