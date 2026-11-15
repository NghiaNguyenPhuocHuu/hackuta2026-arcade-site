/**
 * Shapes shared by the Olympus Slots SPA and its adapters.
 * The SPA never decides outcomes: an adapter (Convex or mock) is the source of truth.
 */

/** What the game screen shows. The backend's "none" (nothing scheduled) maps to "closed". */
export type GameStatus = "teaser" | "live" | "closed";

export type RecentSpin = {
  spinId: string;
  symbols: string[];
  outcomeId: string;
  outcomeLabel: string;
  wager: number;
  payout: number;
  /** payout − wager */
  delta: number;
  at: number;
};

export type GameState = {
  status: GameStatus;
  /** Whole points. 0 when the player has no balance (not checked in, signed out). */
  balance: number;
  /** Allowed presets, e.g. [5, 10, 25, 50]. */
  wagers: number[];
  /** ms epoch; drives the teaser countdown. */
  opensAt: number | null;
  /** ms epoch; drives "CLOSES IN mm:ss". */
  closesAt: number | null;
  /** Newest first, at most 5. */
  recentSpins: RecentSpin[];
};

export type SpinOutcome = { id: string; label: string; multiplier: number };

export type SpinFailureStatus =
  | "closed"
  | "invalid_wager"
  | "insufficient_points"
  | "rate_limited"
  | "signed_out"
  | "not_eligible"
  | "error";

export type SpinResult =
  | {
      status: "ok";
      symbols: string[];
      outcome: SpinOutcome;
      wager: number;
      payout: number;
      pointsBefore: number;
      pointsAfter: number;
    }
  | { status: SpinFailureStatus; code?: string };

export interface MinigameAdapter {
  getState(): GameState;
  /** Returns an unsubscribe function. */
  subscribe(listener: (state: GameState) => void): () => void;
  spin(args: { spinId: string; wager: number }): Promise<SpinResult>;
  dispose(): void;
}

export type TutorialMode = "first-visit" | "always" | "off";

export type MountMinigameOptions = {
  adapter?: MinigameAdapter;
  tutorial?: TutorialMode;
  player?: { id?: string; displayName: string };
};
