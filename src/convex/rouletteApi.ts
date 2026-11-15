import { makeFunctionReference } from "convex/server";
import type { ArcadePlayErrorCode } from "../../shared/arcade/rules";
import type { BetErrorCode, PlacedBet, RouletteLimits } from "../../shared/roulette/rules";

/**
 * Wheel of the Fates function references. The functions live in
 * `backend/overlay/convex/arcade/roulette.ts`; keep these shapes in sync.
 */
export type RouletteServerSpin = {
  spinId: string;
  pocket: number;
  bets: PlacedBet[];
  stake: number;
  returned: number;
  net: number;
  at: number;
};

export type RouletteServerTable = {
  status: "live" | "closed";
  closesAt: number | null;
  serverNow: number;
  problem: ArcadePlayErrorCode | null;
  /** The arcade wallet. */
  balance: number;
  lossToday: number;
  limits: RouletteLimits;
  history: RouletteServerSpin[];
};

export type RouletteServerSpinResponse =
  | { status: "ok"; spin: RouletteServerSpin; balance: number }
  | { status: "error"; code: ArcadePlayErrorCode | BetErrorCode; retryAfterMs?: number };

/** The caller's table. Null when signed out. */
export const getMyRouletteTableRef = makeFunctionReference<"query", { nowBucket?: number }, RouletteServerTable | null>(
  "arcade/roulette:getMyTable",
);

/** One spin; the server picks the pocket. `spinId` makes a retry safe. */
export const rouletteSpinRef = makeFunctionReference<"mutation", { spinId: string; bets: PlacedBet[] }, RouletteServerSpinResponse>(
  "arcade/roulette:spin",
);
