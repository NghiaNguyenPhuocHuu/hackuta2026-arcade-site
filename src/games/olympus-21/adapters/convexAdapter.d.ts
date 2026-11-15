/** Types for convexAdapter.js (plain browser JS, like the rest of the game). */
import type { TableView } from "../../../../shared/olympus21/engine.js";

export type CommandResult = { ok: boolean; code?: string };

/** The `ConvexClient` (convex/browser) shape the adapter calls. */
export type O21ConvexClient = {
  onUpdate(
    name: string,
    args: Record<string, unknown>,
    onValue: (value: unknown) => void,
    onError?: (error: unknown) => void,
  ): (() => void) | { unsubscribe(): void };
  mutation(name: string, args: Record<string, unknown>): Promise<unknown>;
};

export type O21BackendStatus = {
  status: "no_window" | "teaser" | "live" | "closed";
  window: { opensAt: number; closesAt: number } | null;
  player: { signedIn: boolean; eligible: boolean; checkedIn: boolean; name: string | null; balance: number };
  /** Arcade points a seat costs (they come back as chips when you leave). */
  buyIn: number;
  /** Waiting for a table. */
  queue: { queuedAt: number; waiting: number } | null;
  /** Left mid-round: chips come back when the round settles. */
  leaving: boolean;
  /** How the last table ended for you. */
  result: { returned: number; reason: string } | null;
  /** The table query failed before any answer (functions not deployed, or offline). */
  unavailable: boolean;
};

export type O21ConvexAdapter = {
  getState(): TableView | null;
  getStatus(): O21BackendStatus | null;
  subscribe(listener: (view: TableView | null) => void): () => void;
  join(): Promise<CommandResult>;
  cancelQueue(): Promise<CommandResult>;
  leave(): Promise<CommandResult>;
  placeWager(amount: number): Promise<CommandResult>;
  play(card: string, color?: string): Promise<CommandResult>;
  draw(): Promise<CommandResult>;
  ready(): Promise<CommandResult>;
  serverOffset(): number;
  serverNow(): number;
  dispose(): void;
};

export declare const TABLE_QUERY: string;
export declare const MUTATIONS: Record<"join" | "cancelQueue" | "leave" | "placeWager" | "play" | "draw" | "ready", string>;
export declare function mapStatus(server: unknown, serverNow?: number): O21BackendStatus;
export declare function mapResult(result: unknown): CommandResult;
export declare function createConvexAdapter(options: {
  client: O21ConvexClient;
  onError?: (error: unknown) => void;
  nowBucketMs?: number;
  now?: () => number;
}): O21ConvexAdapter;
