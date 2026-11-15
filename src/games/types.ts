import type { ConvexReactClient } from "convex/react";

/**
 * The contract between the arcade shell and a game module. Each game's
 * `index.ts` exports a `GameModule`; the registry lazy-loads it.
 */

/**
 * Keeps a spin's result off the rest of the arcade until the game shows it
 * (src/arcade/pointsReveal.ts). Call `hold` when a spin starts, with the
 * balance the game is showing (stake taken) and the longest the reveal can
 * take; call `release` once the result is on screen or the spin failed.
 */
export type PointsRevealPort = {
  hold(shown: number, maxMs: number): void;
  release(): void;
};

/** What the arcade gives a game when it mounts it. */
export type GameHost = {
  /** The signed-in Convex client: the game's server functions find the player from its session. */
  client: ConvexReactClient;
  reveal: PointsRevealPort;
  /** For display only; the server never takes the player from the browser. */
  player: { displayName: string } | null;
};

export type GameModule = {
  /** Mounts the game on the live server. Returns `unmount`, safe to call more than once. */
  mount(element: HTMLElement, host: GameHost): () => void;
};
