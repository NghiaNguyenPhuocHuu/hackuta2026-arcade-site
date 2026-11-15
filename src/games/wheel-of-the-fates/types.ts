import type { BetErrorCode, PlacedBet, RouletteLimits } from "../../../shared/roulette/rules";

export type RouletteStatus = "live" | "closed";

export type RouletteSpin = {
  spinId: string;
  pocket: number;
  bets: PlacedBet[];
  stake: number;
  /** Stakes and winnings paid back. */
  returned: number;
  /** returned − stake. */
  net: number;
  at: number;
};

export type RouletteState = {
  status: RouletteStatus;
  balance: number;
  /** Net points lost today (0 when the player is up), for the daily loss limit. */
  lossToday: number;
  limits: RouletteLimits;
  /** Newest first. */
  history: RouletteSpin[];
};

export type RouletteErrorCode = BetErrorCode | "COOLDOWN" | "CLOSED" | "SIGNED_OUT" | "NOT_ELIGIBLE" | "ERROR";

export type RouletteSpinResult =
  | { status: "ok"; spin: RouletteSpin; balance: number }
  | { status: "error"; code: RouletteErrorCode; retryAfterMs?: number };

/** What the game needs from a backend. Mock now, Convex in plan step 3. */
export interface RouletteAdapter {
  /** Returns the same object until something changes (safe for useSyncExternalStore). */
  getState(): RouletteState;
  subscribe(listener: () => void): () => void;
  /** `spinId` is the idempotency key: repeating it never charges twice. */
  spin(input: { spinId: string; bets: PlacedBet[] }): Promise<RouletteSpinResult>;
  dispose(): void;
}
