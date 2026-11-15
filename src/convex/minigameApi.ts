import { makeFunctionReference } from "convex/server";

/**
 * Olympus Slots function references. The functions live in
 * `backend/overlay/convex/admin/slotSpin.ts`; keep these shapes in sync with it.
 * Its open/closed status comes from the arcade switch and the game's switch.
 */

export type MinigameServerStatus = "none" | "teaser" | "live" | "closed";

export type MinigameServerState = {
  status: MinigameServerStatus;
  window: { windowId: string; opensAt: number; closesAt: number } | null;
  serverNow: number;
  player: {
    participant: boolean;
    eligible: boolean;
    checkedIn: boolean;
    balance: number | null;
    /** Signed in, accepted and checked in (switches aside). */
    canPlay: boolean;
  };
  wagers: number[];
  defaultWager: number;
  cooldownMs: number;
  recentSpins: Array<{
    spinId: string;
    wager: number;
    payout: number;
    net: number;
    outcome: string;
    symbols: string[];
    createdAt: number;
  }>;
};

export type MinigameSpinErrorCode =
  | "NOT_SIGNED_IN"
  | "NOT_PARTICIPANT"
  | "NOT_ELIGIBLE"
  | "NOT_CHECKED_IN"
  | "INVALID_PLAY_ID"
  | "ARCADE_CLOSED"
  | "GAME_DISABLED"
  | "INVALID_WAGER"
  | "INSUFFICIENT_POINTS"
  | "COOLDOWN";

export type MinigameSpinResponse =
  | {
      status: "ok";
      spinId: string;
      outcome: string;
      symbols: string[];
      wager: number;
      payout: number;
      net: number;
      previousPoints: number;
      newPoints: number;
    }
  | { status: "error"; code: MinigameSpinErrorCode; retryAfterMs?: number };

/** Window status, balance, and last spins. Null when signed out. */
export const getMyMinigameStateRef = makeFunctionReference<
  "query",
  { nowBucket?: number },
  MinigameServerState | null
>("admin/slotSpin:getMyGameState");

/** One spin. `spinId` is the idempotency key: repeating it never charges twice. */
export const spinMinigameRef = makeFunctionReference<
  "mutation",
  { spinId: string; wager: number },
  MinigameSpinResponse
>("admin/slotSpin:spin");
