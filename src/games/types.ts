/**
 * The contract between the arcade shell and a game module. Each game's
 * `index.ts` exports a `GameModule`; the registry lazy-loads it.
 */

/**
 * The arcade's mock points for this visit (src/arcade/mockWallet.ts), handed to
 * a game so its balance is shared with the lobby and other games. `saved` is
 * the game's own data from an earlier mount (history and so on).
 */
export type MockWalletPort = {
  balance: number;
  saved: unknown;
  save(next: { balance: number; saved: unknown }): void;
} & PointsRevealPort;

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

export type GameModule = {
  /** Mount on mock points. Returns `unmount`, safe to call more than once. */
  mountMock(element: HTMLElement, wallet: MockWalletPort): () => void;
};
