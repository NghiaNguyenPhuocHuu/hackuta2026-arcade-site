/** Types for mockAdapter.js: the in-browser Olympus 21 table (shared engine + bots). */
import type { TableView } from "../../../../shared/olympus21/engine.js";

export type CommandResult = { ok: boolean; code?: string };

export type WindowStatus = "live" | "teaser" | "closed";

export type Olympus21Adapter = {
  playerId: string;
  getState(): TableView;
  subscribe(listener: (view: TableView) => void): () => void;
  join(name?: string, opts?: { bots?: number }): Promise<CommandResult>;
  leave(): Promise<CommandResult>;
  placeWager(amount: number): Promise<CommandResult>;
  play(card: string, color?: string): Promise<CommandResult>;
  draw(): Promise<CommandResult>;
  ready(): Promise<CommandResult>;
  getStatus(): { status: WindowStatus; window: { opensAt: number | null; closesAt: number | null } | null; player: null };
  setWindow(next: { status: WindowStatus; opensAt?: number | null; closesAt?: number | null }): CommandResult;
  dispose(): void;
};

export declare function createMockAdapter(options?: {
  playerId?: string;
  name?: string;
  /** Bots that top the table up after you sit (0–3). */
  bots?: number;
  /** Your starting points at the table. */
  balance?: number;
  botBalance?: number;
  timings?: object;
  seed?: number;
  latencyMs?: number;
}): Olympus21Adapter;
