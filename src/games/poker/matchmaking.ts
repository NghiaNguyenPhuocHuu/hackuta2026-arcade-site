import type { PokerAction, PublicTable } from "../../../shared/poker";

/**
 * Types shared by the poker table UI and the live client (liveMatchmaking.ts).
 * Every table, seat and chip lives on the server (arcade/poker).
 */
export type PokerPhase = "lobby" | "queued" | "table" | "result";

export type QueueEntry = { id: string; name: string; joinedAt: number };

export type PokerView = {
  /** The caller's poker player id ("" until the server knows them). */
  youId: string;
  phase: PokerPhase;
  /** The arcade wallet: the buy-in comes from it and chips go back to it. */
  balance: number;
  buyIn: number;
  queue: QueueEntry[];
  queuedAt: number | null;
  table: PublicTable | null;
  result: { returned: number; reason: string } | null;
  error: string | null;
};

export type PokerClient = {
  getView(): PokerView;
  subscribe(listener: (view: PokerView) => void): () => void;
  findTable(): void;
  cancelQueue(): void;
  act(action: PokerAction): void;
  leaveTable(): void;
  dispose(): void;
};
