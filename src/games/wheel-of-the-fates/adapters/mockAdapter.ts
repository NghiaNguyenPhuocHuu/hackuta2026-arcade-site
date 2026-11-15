/**
 * Mock roulette backend for local play and tests. Enforces the same rules the
 * server will: bet checks and limits, cooldown, daily loss limit, spinId
 * idempotency. The pocket is picked here only because there is no server yet.
 */
import {
  ROULETTE_LIMITS,
  checkBets,
  dayKey,
  returnFor,
  spinPocket,
  type PlacedBet,
  type RandomFn,
  type RouletteLimits,
} from "../../../../shared/roulette/rules";
import type { RouletteAdapter, RouletteSpin, RouletteSpinResult, RouletteState, RouletteStatus } from "../types";

export const ROULETTE_HISTORY_LIMIT = 12;

/** What the mock carries between visits (stored in the arcade's mock wallet). */
export type RouletteSaved = { history: RouletteSpin[]; day: string; netToday: number };

export type RouletteMockOptions = {
  balance?: number;
  saved?: unknown;
  status?: RouletteStatus;
  limits?: RouletteLimits;
  random?: RandomFn;
  latencyMs?: number;
  now?: () => number;
};

function readSaved(value: unknown): RouletteSaved | null {
  if (!value || typeof value !== "object") return null;
  const saved = value as Partial<RouletteSaved>;
  if (!Array.isArray(saved.history) || typeof saved.day !== "string" || typeof saved.netToday !== "number") return null;
  return { history: saved.history.slice(0, ROULETTE_HISTORY_LIMIT), day: saved.day, netToday: saved.netToday };
}

export type RouletteMockAdapter = RouletteAdapter & {
  setStatus(status: RouletteStatus): void;
  /** History and today's tally, for the arcade's mock wallet. */
  saved(): RouletteSaved;
};

export function createRouletteMockAdapter(options: RouletteMockOptions = {}): RouletteMockAdapter {
  const random = options.random ?? Math.random;
  const latencyMs = options.latencyMs ?? 400;
  const now = options.now ?? Date.now;
  const limits = options.limits ?? ROULETTE_LIMITS;
  const start = readSaved(options.saved);

  let day = start?.day ?? dayKey(now());
  let netToday = start?.netToday ?? 0;
  let state: RouletteState = {
    status: options.status ?? "live",
    balance: options.balance ?? 200,
    lossToday: 0,
    limits,
    history: start?.history ?? [],
  };
  const listeners = new Set<() => void>();
  const results = new Map<string, RouletteSpinResult>();
  let lastSpinAt = -Infinity;
  let disposed = false;

  function rollDay() {
    const today = dayKey(now());
    if (today !== day) {
      day = today;
      netToday = 0;
    }
  }

  function update(patch: Partial<RouletteState>) {
    rollDay();
    state = { ...state, ...patch, lossToday: Math.max(0, -netToday) };
    if (disposed) return;
    for (const listener of listeners) listener();
  }
  update({});

  async function spin({ spinId, bets }: { spinId: string; bets: PlacedBet[] }): Promise<RouletteSpinResult> {
    if (latencyMs > 0) await new Promise((resolve) => setTimeout(resolve, latencyMs));
    if (disposed) return { status: "error", code: "CLOSED" };
    const repeated = results.get(spinId);
    if (repeated) return repeated;
    if (state.status !== "live") return { status: "error", code: "CLOSED" };

    const at = now();
    if (at - lastSpinAt < limits.cooldownMs) {
      return { status: "error", code: "COOLDOWN", retryAfterMs: limits.cooldownMs - (at - lastSpinAt) };
    }
    rollDay();
    const check = checkBets(bets, { balance: state.balance, lossToday: Math.max(0, -netToday) }, limits);
    if (!check.ok) return { status: "error", code: check.code };

    const pocket = spinPocket(random);
    const returned = returnFor(check.bets, pocket);
    const net = returned - check.stake;
    const record: RouletteSpin = { spinId, pocket, bets: check.bets, stake: check.stake, returned, net, at };
    lastSpinAt = at;
    netToday += net;
    const result: RouletteSpinResult = { status: "ok", spin: record, balance: state.balance + net };
    results.set(spinId, result);
    update({ balance: state.balance + net, history: [record, ...state.history].slice(0, ROULETTE_HISTORY_LIMIT) });
    return result;
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    spin,
    setStatus: (status) => update({ status }),
    saved: () => ({ history: state.history, day, netToday }),
    dispose() {
      disposed = true;
      listeners.clear();
    },
  };
}
