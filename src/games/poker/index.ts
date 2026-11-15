import type { GameModule } from "../types";
import { mountPoker } from "./mountPoker";

/** Olympus Poker as an arcade game module, on the live server (arcade/poker). */
export const game: GameModule = {
  mount(element) {
    return mountPoker(element);
  },
};
