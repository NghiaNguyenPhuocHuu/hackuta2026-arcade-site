import { makeFunctionReference } from "convex/server";
import type { PokerAction, PublicTable } from "../../shared/poker";

/**
 * Olympus Poker function references (backend/overlay/convex/arcade/poker.ts).
 * The player is the signed-in hacker; no function takes an id or token.
 */

export type PokerQueueEntry = { id: string; name: string; joinedAt: number };

export type PokerServerView = {
  youId: string | null;
  phase: "lobby" | "queued" | "table" | "result";
  balance: number;
  buyIn: number;
  queue: PokerQueueEntry[];
  queuedAt: number | null;
  table: PublicTable | null;
  result: { returned: number; reason: string } | null;
  error: string | null;
};

export type PokerJoinResponse =
  | { status: "ok"; phase: "queued" | "table" }
  | { status: "error"; code: string };

export type PokerOkOrError =
  | { status: "ok" }
  | { status: "error"; code: string };

export const getMyPokerViewRef = makeFunctionReference<"query", Record<string, never>, PokerServerView>(
  "arcade/poker:getMyPokerView",
);

export const joinPokerQueueRef = makeFunctionReference<
  "mutation",
  Record<string, never>,
  PokerJoinResponse
>("arcade/poker:joinQueue");

export const cancelPokerQueueRef = makeFunctionReference<"mutation", Record<string, never>, PokerOkOrError>(
  "arcade/poker:cancelQueue",
);

export const pokerActRef = makeFunctionReference<
  "mutation",
  { action: PokerAction },
  PokerOkOrError
>("arcade/poker:act");

export const leavePokerTableRef = makeFunctionReference<"mutation", Record<string, never>, PokerOkOrError>(
  "arcade/poker:leaveTable",
);
