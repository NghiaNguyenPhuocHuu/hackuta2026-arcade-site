/**
 * Mock game backend for the portal's mock-auth mode (VITE_USE_MOCK_API) and
 * tests. Enforces the same rules as the server: live window only, preset
 * wagers, balance check, 2 s cooldown, spinId idempotency. Teaser → live →
 * closed flips happen on timers.
 */
import {
  SLOT_SPIN_COOLDOWN_MS,
  SLOT_WAGERS,
  isValidWager,
  payoutFor,
  rollOutcome,
  symbolsFor,
  type RandomFn,
} from "../../../../shared/admin/slotRules";
import type { GameState, GameStatus, MinigameAdapter, RecentSpin, SpinResult } from "../types";

const RECENT_SPIN_LIMIT = 5;
const MOCK_LATENCY_MS = 150;

export type MockAdapterOptions = {
  balance?: number;
  status?: GameStatus;
  opensAt?: number | null;
  closesAt?: number | null;
  random?: RandomFn;
  latencyMs?: number;
};

export type MockAdapter = MinigameAdapter & {
  /** Change the window state (and optionally its times). */
  setStatus(status: GameStatus, times?: { opensAt?: number | null; closesAt?: number | null }): void;
};

export function createMockAdapter(options: MockAdapterOptions = {}): MockAdapter {
  const random = options.random ?? Math.random;
  const latencyMs = options.latencyMs ?? MOCK_LATENCY_MS;
  const state: GameState = {
    status: options.status ?? "live",
    balance: options.balance ?? 200,
    wagers: [...SLOT_WAGERS],
    opensAt: options.opensAt ?? null,
    closesAt: options.closesAt ?? null,
    recentSpins: [],
  };
  const listeners = new Set<(state: GameState) => void>();
  const results = new Map<string, SpinResult>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let lastSpinAt = -Infinity;
  let disposed = false;

  function later(fn: () => void, ms: number) {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, Math.max(0, ms));
    timers.add(id);
  }

  function clearTimers() {
    for (const id of timers) clearTimeout(id);
    timers.clear();
  }

  function getState(): GameState {
    return {
      ...state,
      wagers: [...state.wagers],
      recentSpins: state.recentSpins.map((spin) => ({ ...spin, symbols: [...spin.symbols] })),
    };
  }

  function emit() {
    if (disposed) return;
    const snapshot = getState();
    for (const listener of listeners) listener(snapshot);
  }

  function scheduleFlips() {
    clearTimers();
    const now = Date.now();
    if (state.status === "teaser" && state.opensAt !== null) later(() => setStatus("live"), state.opensAt - now);
    if (state.status !== "closed" && state.closesAt !== null) later(() => setStatus("closed"), state.closesAt - now);
  }

  function setStatus(status: GameStatus, times: { opensAt?: number | null; closesAt?: number | null } = {}) {
    if (disposed) return;
    state.status = status;
    if ("opensAt" in times) state.opensAt = times.opensAt ?? null;
    if ("closesAt" in times) state.closesAt = times.closesAt ?? null;
    scheduleFlips();
    emit();
  }

  function subscribe(listener: (state: GameState) => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  async function spin({ spinId, wager }: { spinId: string; wager: number }): Promise<SpinResult> {
    if (latencyMs > 0) await new Promise((resolve) => setTimeout(resolve, latencyMs));
    if (disposed) return { status: "closed" };
    const repeated = results.get(spinId);
    if (repeated) return repeated;
    if (state.status !== "live") return { status: "closed" };

    const now = Date.now();
    if (now - lastSpinAt < SLOT_SPIN_COOLDOWN_MS) return { status: "rate_limited" };
    if (!SLOT_WAGERS.includes(wager)) return { status: "invalid_wager" };
    if (!isValidWager(wager, state.balance)) return { status: "insufficient_points" };

    const outcome = rollOutcome(random);
    const payout = payoutFor(wager, outcome);
    const symbols = symbolsFor(outcome.id, random);
    const pointsBefore = state.balance;
    const pointsAfter = pointsBefore - wager + payout;

    state.balance = pointsAfter;
    lastSpinAt = now;
    const result: SpinResult = {
      status: "ok",
      symbols: [...symbols],
      outcome: { id: outcome.id, label: outcome.label, multiplier: outcome.multiplier },
      wager,
      payout,
      pointsBefore,
      pointsAfter,
    };
    results.set(spinId, result);
    const recent: RecentSpin = {
      spinId,
      symbols: [...symbols],
      outcomeId: outcome.id,
      outcomeLabel: outcome.label,
      wager,
      payout,
      delta: payout - wager,
      at: now,
    };
    state.recentSpins = [recent, ...state.recentSpins].slice(0, RECENT_SPIN_LIMIT);
    emit();
    return result;
  }

  function dispose() {
    disposed = true;
    clearTimers();
    listeners.clear();
  }

  scheduleFlips();
  return { getState, subscribe, spin, setStatus, dispose };
}
