import type { ConvexReactClient } from "convex/react";
import { ROULETTE_LIMITS } from "../../../../shared/roulette/rules";
import {
  getMyRouletteTableRef,
  rouletteSpinRef,
  type RouletteServerSpinResponse,
  type RouletteServerTable,
} from "../../../convex/rouletteApi";
import type { RouletteAdapter, RouletteErrorCode, RouletteSpinResult, RouletteState } from "../types";

export type RouletteConvexClient = Pick<ConvexReactClient, "watchQuery" | "mutation">;

const CLOSED: RouletteState = { status: "closed", balance: 0, lossToday: 0, limits: ROULETTE_LIMITS, history: [] };

/** The server's table → what the game shows. Null (signed out) or not yet loaded → closed and empty. */
export function mapRouletteTable(table: RouletteServerTable | null | undefined): RouletteState {
  if (!table) return CLOSED;
  return {
    status: table.status === "live" && table.problem === null ? "live" : "closed",
    balance: table.balance,
    lossToday: table.lossToday,
    limits: table.limits,
    history: table.history,
  };
}

/** Server refusal → the game's error codes (its dialogue has a line for each). */
export function mapRouletteSpin(result: RouletteServerSpinResponse | null | undefined): RouletteSpinResult {
  if (!result || typeof result !== "object") return { status: "error", code: "ERROR" };
  if (result.status === "ok") return { status: "ok", spin: result.spin, balance: result.balance };
  const code = result.code;
  const mapped: RouletteErrorCode =
    code === "ARCADE_CLOSED" || code === "GAME_DISABLED"
      ? "CLOSED"
      : code === "NOT_SIGNED_IN"
        ? "SIGNED_OUT"
        : code === "NOT_PARTICIPANT" || code === "NOT_ELIGIBLE" || code === "NOT_CHECKED_IN"
          ? "NOT_ELIGIBLE"
          : code === "INVALID_PLAY_ID" || code === "INVALID_STAKE"
            ? "ERROR"
            : code;
  return { status: "error", code: mapped, ...(result.retryAfterMs !== undefined ? { retryAfterMs: result.retryAfterMs } : {}) };
}

/**
 * Wheel of the Fates on the live server: the table is a live query (balance,
 * history and status update by themselves), and every spin is decided by
 * arcade/roulette:spin. Re-subscribes at the arcade's closing time so the
 * wheel closes on time.
 */
export function createRouletteConvexAdapter({
  client,
  onError,
}: {
  client: RouletteConvexClient;
  onError?: (error: unknown) => void;
}): RouletteAdapter {
  const listeners = new Set<() => void>();
  let state: RouletteState = CLOSED;
  let disposed = false;
  let bucket = 0;
  let stopWatch: (() => void) | null = null;
  let edge: ReturnType<typeof setTimeout> | null = null;

  function read(watch: { localQueryResult(): RouletteServerTable | null | undefined }) {
    let table: RouletteServerTable | null | undefined;
    try {
      table = watch.localQueryResult();
    } catch (error) {
      onError?.(error);
      return;
    }
    if (table === undefined) return; // still loading
    state = mapRouletteTable(table);
    for (const listener of listeners) listener();
    if (edge !== null) clearTimeout(edge);
    edge = null;
    if (table?.closesAt && !disposed) {
      const wait = Math.max(0, table.closesAt - Date.now()) + 250;
      edge = setTimeout(() => subscribe(), Math.min(wait, 2 ** 31 - 1));
    }
  }

  function subscribe() {
    if (disposed) return;
    bucket += 1;
    const previous = stopWatch;
    const watch = client.watchQuery(getMyRouletteTableRef, { nowBucket: bucket });
    stopWatch = watch.onUpdate(() => read(watch));
    read(watch);
    previous?.();
  }
  subscribe();

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async spin({ spinId, bets }) {
      if (disposed) return { status: "error", code: "CLOSED" };
      try {
        return mapRouletteSpin(await client.mutation(rouletteSpinRef, { spinId, bets }));
      } catch (error) {
        onError?.(error);
        return { status: "error", code: "ERROR" };
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (edge !== null) clearTimeout(edge);
      stopWatch?.();
      listeners.clear();
    },
  };
}
