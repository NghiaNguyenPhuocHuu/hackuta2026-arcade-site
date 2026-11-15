/** Types for convexAdapter.js (plain browser JS ported from the minigame prototype). */
import type { TableView } from "../../../../shared/olympus21/engine.js";
import type { CommandResult } from "./mockAdapter.js";

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
};

export type O21ConvexAdapter = {
  getState(): TableView | null;
  getStatus(): O21BackendStatus | null;
  subscribe(listener: (view: TableView | null) => void): () => void;
  join(name?: string): Promise<CommandResult>;
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
export declare const MUTATIONS: Record<"join" | "leave" | "placeWager" | "play" | "draw" | "ready", string>;
export declare function mapStatus(server: unknown, serverNow?: number): O21BackendStatus;
export declare function mapResult(result: unknown): CommandResult;
export declare function createConvexAdapter(options: {
  client: O21ConvexClient;
  onError?: (error: unknown) => void;
  nowBucketMs?: number;
  now?: () => number;
}): O21ConvexAdapter;
