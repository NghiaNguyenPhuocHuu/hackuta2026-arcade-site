import { createRoot } from "react-dom/client";
import type { GameModule } from "../types";
import { createRouletteMockAdapter } from "./adapters/mockAdapter";
import { RouletteGame } from "./RouletteGame";
import "./roulette.css";

/** Wheel of the Fates as an arcade game module. */
export const game: GameModule = {
  mountMock(element, wallet) {
    const adapter = createRouletteMockAdapter({ balance: wallet.balance, saved: wallet.saved });
    const stopSync = adapter.subscribe(() => wallet.save({ balance: adapter.getState().balance, saved: adapter.saved() }));
    const container = document.createElement("div");
    element.appendChild(container);
    const root = createRoot(container);
    root.render(<RouletteGame adapter={adapter} />);
    let done = false;
    return () => {
      if (done) return;
      done = true;
      stopSync();
      adapter.dispose();
      // Unmount after the current render pass (React warns on synchronous unmount during one).
      queueMicrotask(() => {
        root.unmount();
        container.remove();
      });
    };
  },
};
