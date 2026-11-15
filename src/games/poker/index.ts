import type { GameModule } from "../types";
import { mountPoker } from "./mountPoker";

/** Olympus Poker as an arcade game module. Live matchmaking uses Convex. */
export const game: GameModule = {
  mountMock(element, _wallet, options) {
    return mountPoker(element, {
      player: options?.player,
    });
  },
};
