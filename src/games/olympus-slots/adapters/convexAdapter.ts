/**
 * Convex game backend adapter, backed by `admin/slotSpin` on the deployment the
 * portal's ConvexReactClient points at.
 *
 * - The client is the portal's shared ConvexReactClient. ConvexAuthProvider has
 *   already authenticated it, so the adapter never touches credentials.
 * - The server decides everything: window status, balance, outcome, payout.
 *   The adapter only maps shapes and flips the status at the exact window
 *   edges so the UI changes on time between server updates.
 * - The game-state query takes a coarse `nowBucket` so Convex re-runs it as
 *   time passes (queries are cached by their arguments).
 */
import type { ConvexReactClient } from "convex/react";
import { SLOT_OUTCOMES, SLOT_WAGERS } from "../../../../shared/admin/slotRules";
import {
  getMyMinigameStateRef,
  spinMinigameRef,
  type MinigameServerState,
  type MinigameSpinResponse,
} from "../../../convex/minigameApi";
import type { GameState, GameStatus, MinigameAdapter, SpinFailureStatus, SpinOutcome, SpinResult } from "../types";

/** The part of ConvexReactClient the adapter uses (lets tests pass a fake). */
export type MinigameConvexClient = Pick<ConvexReactClient, "watchQuery" | "mutation">;

export type ConvexAdapterOptions = {
  client: MinigameConvexClient;
  /** Width of the `nowBucket` cache key. */
  nowBucketMs?: number;
  now?: () => number;
  onError?: (error: unknown) => void;
};

/** What the SPA keeps beyond GameState (useful for hosts and tests). */
export type ConvexGameState = GameState & {
  windowId: string | null;
  player: { signedIn: boolean; eligible: boolean; checkedIn: boolean; balance: number | null };
};

/** Backend spin error code → SPA failure status. */
const ERROR_STATUS: Readonly<Record<string, SpinFailureStatus>> = Object.freeze({
  ARCADE_CLOSED: "closed",
  GAME_DISABLED: "closed",
  INVALID_WAGER: "invalid_wager",
  INSUFFICIENT_POINTS: "insufficient_points",
  COOLDOWN: "rate_limited",
  NOT_SIGNED_IN: "signed_out",
  NOT_PARTICIPANT: "not_eligible",
  NOT_ELIGIBLE: "not_eligible",
  NOT_CHECKED_IN: "not_eligible",
});

function outcomeInfo(id: string): SpinOutcome {
  const outcome = SLOT_OUTCOMES.find((candidate) => candidate.id === id);
  return outcome
    ? { id: outcome.id, label: outcome.label, multiplier: outcome.multiplier }
    : { id: String(id), label: String(id), multiplier: 0 };
}

function toCount(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

/**
 * Pure mapping from `getMyGameState` (null when signed out) to the SPA state.
 * `now` is the client clock, used only to flip status at window edges.
 */
export function mapGameState(server: MinigameServerState | null | undefined, now = Date.now()): ConvexGameState {
  if (!server) {
    return {
      status: "closed",
      balance: 0,
      wagers: [...SLOT_WAGERS],
      opensAt: null,
      closesAt: null,
      windowId: null,
      recentSpins: [],
      player: { signedIn: false, eligible: false, checkedIn: false, balance: null },
    };
  }
  const window = server.window;
  let status: GameStatus = server.status === "teaser" || server.status === "live" ? server.status : "closed"; // "none" → closed
  if (window) {
    if (status === "teaser" && now >= window.opensAt) status = "live";
    if (status !== "closed" && now >= window.closesAt) status = "closed";
  }
  const balance = server.player.balance;
  return {
    status,
    balance: toCount(balance),
    wagers: server.wagers.length ? [...server.wagers] : [...SLOT_WAGERS],
    opensAt: window ? window.opensAt : null,
    closesAt: window ? window.closesAt : null,
    windowId: window ? window.windowId : null,
    recentSpins: server.recentSpins.map((spin) => {
      const outcome = outcomeInfo(spin.outcome);
      return {
        spinId: spin.spinId,
        symbols: [...spin.symbols],
        outcomeId: outcome.id,
        outcomeLabel: outcome.label,
        wager: spin.wager,
        payout: spin.payout,
        delta: spin.net,
        at: spin.createdAt,
      };
    }),
    player: {
      signedIn: true,
      eligible: server.player.eligible,
      checkedIn: server.player.checkedIn,
      balance: typeof balance === "number" && Number.isSafeInteger(balance) ? balance : null,
    },
  };
}

/** Pure mapping from the backend's spin response to the SPA spin result. */
export function mapSpinResult(result: MinigameSpinResponse | null | undefined): SpinResult {
  if (!result || typeof result !== "object") return { status: "error" };
  if (result.status === "ok") {
    return {
      status: "ok",
      symbols: [...result.symbols],
      outcome: outcomeInfo(result.outcome),
      wager: result.wager,
      payout: result.payout,
      pointsBefore: result.previousPoints,
      pointsAfter: result.newPoints,
    };
  }
  if (result.status === "error") return { status: ERROR_STATUS[result.code] ?? "error", code: result.code };
  return { status: "error" };
}

function newSpinId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `spin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function createConvexAdapter({ client, nowBucketMs = 15_000, now = Date.now, onError }: ConvexAdapterOptions): Omit<MinigameAdapter, "getState"> & {
  getState(): ConvexGameState;
} {
  const listeners = new Set<(state: GameState) => void>();
  let server: MinigameServerState | null = null;
  let state = mapGameState(null, now());
  let disposed = false;
  let bucket: number | null = null;
  let unsubscribeWatch: (() => void) | null = null;
  let edgeTimer: ReturnType<typeof setTimeout> | null = null;

  const bucketFor = (time: number) => Math.floor(time / nowBucketMs);

  function getState(): ConvexGameState {
    return {
      ...state,
      wagers: [...state.wagers],
      recentSpins: state.recentSpins.map((spin) => ({ ...spin, symbols: [...spin.symbols] })),
      player: { ...state.player },
    };
  }

  function emit() {
    if (disposed) return;
    state = mapGameState(server, now());
    const snapshot = getState();
    for (const listener of listeners) listener(snapshot);
    scheduleEdge();
  }

  /** Re-map exactly at the next window edge so teaser → live → closed flips on time. */
  function scheduleEdge() {
    if (edgeTimer !== null) clearTimeout(edgeTimer);
    edgeTimer = null;
    const window = server?.window;
    if (!window || disposed) return;
    const t = now();
    const next = [window.opensAt, window.closesAt].filter((edge) => edge > t).sort((a, b) => a - b)[0];
    if (next === undefined) return;
    edgeTimer = setTimeout(() => {
      emit();
      resubscribe(true);
    }, Math.min(next - t + 50, 2 ** 31 - 1));
  }

  function readWatch(watch: { localQueryResult(): MinigameServerState | null | undefined }) {
    try {
      const value = watch.localQueryResult();
      if (value === undefined) return; // still loading
      server = value;
      emit();
    } catch (error) {
      onError?.(error);
    }
  }

  function resubscribe(force = false) {
    if (disposed) return;
    const nextBucket = bucketFor(now());
    if (!force && nextBucket === bucket) return;
    bucket = nextBucket;
    const previous = unsubscribeWatch;
    const watch = client.watchQuery(getMyMinigameStateRef, { nowBucket: bucket });
    unsubscribeWatch = watch.onUpdate(() => readWatch(watch));
    readWatch(watch); // cached result, if Convex already has one
    previous?.();
  }

  const ticker = setInterval(() => resubscribe(), Math.max(1000, Math.floor(nowBucketMs / 3)));

  function subscribe(listener: (state: GameState) => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  async function spin({ spinId, wager }: { spinId: string; wager: number }): Promise<SpinResult> {
    if (disposed) return { status: "closed" };
    try {
      const result = await client.mutation(spinMinigameRef, { spinId: spinId || newSpinId(), wager });
      return mapSpinResult(result);
    } catch (error) {
      onError?.(error);
      return { status: "error" };
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    clearInterval(ticker);
    if (edgeTimer !== null) clearTimeout(edgeTimer);
    unsubscribeWatch?.();
    unsubscribeWatch = null;
    listeners.clear();
  }

  resubscribe(true);
  return { getState, subscribe, spin, dispose };
}
