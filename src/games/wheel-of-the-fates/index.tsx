import { createRoot } from "react-dom/client";
import type { GameModule } from "../types";
import { createRouletteConvexAdapter } from "./adapters/convexAdapter";
import { RouletteGame } from "./RouletteGame";
import "./roulette.css";

/** Wheel of the Fates as an arcade game module, on the live server (arcade/roulette). */
export const game: GameModule = {
  mount(element, host) {
    const adapter = createRouletteConvexAdapter({ client: host.client, onError: (error) => console.error("[wheel]", error) });
    const container = document.createElement("div");
    element.appendChild(container);
    const root = createRoot(container);
    root.render(<RouletteGame adapter={adapter} points={host.reveal} />);
    let done = false;
    return () => {
      if (done) return;
      done = true;
      adapter.dispose();
      // Unmount after the current render pass (React warns on synchronous unmount during one).
      queueMicrotask(() => {
        root.unmount();
        container.remove();
      });
    };
  },
};
