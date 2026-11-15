import { makeFunctionReference } from "convex/server";
import type { PokerAction, PublicTable } from "../../shared/poker";

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
  | { status: "error"; code: "INVALID_TOKEN" | "INSUFFICIENT_POINTS" };

export type PokerOkOrError =
  | { status: "ok" }
  | { status: "error"; code: string };

export const getMyPokerViewRef = makeFunctionReference<"query", { playerToken: string }, PokerServerView>(
  "arcade/poker:getMyPokerView",
);

export const joinPokerQueueRef = makeFunctionReference<
  "mutation",
  { playerToken: string; displayName: string },
  PokerJoinResponse
>("arcade/poker:joinQueue");

export const cancelPokerQueueRef = makeFunctionReference<"mutation", { playerToken: string }, PokerOkOrError>(
  "arcade/poker:cancelQueue",
);

export const pokerActRef = makeFunctionReference<
  "mutation",
  { playerToken: string; action: PokerAction },
  PokerOkOrError
>("arcade/poker:act");

export const leavePokerTableRef = makeFunctionReference<"mutation", { playerToken: string }, PokerOkOrError>(
  "arcade/poker:leaveTable",
);
