import { describe, expect, it, vi } from "vitest";
import {
  BET_CATALOGUE,
  FIRE_NUMBERS,
  POCKET_COUNT,
  ROULETTE_LIMITS,
  WHEEL_ORDER,
  bestReturn,
  checkBets,
  dayKey,
  mergeBets,
  pocketColor,
  returnFor,
  spinPocket,
  winningBetIds,
  type PlacedBet,
} from "../../shared/roulette/rules";
import {
  createRouletteConvexAdapter,
  mapRouletteSpin,
  mapRouletteTable,
  type RouletteConvexClient,
} from "../../src/games/wheel-of-the-fates/adapters/convexAdapter";
import type { RouletteServerTable } from "../../src/convex/rouletteApi";
import { DEMON_MAPS, demonSvg } from "../../src/games/wheel-of-the-fates/demons";
import { errorLine, resultLine } from "../../src/games/wheel-of-the-fates/dialogue";
import { omenFor } from "../../src/games/wheel-of-the-fates/omens";
import { landingTime, pocketAngle } from "../../src/games/wheel-of-the-fates/Wheel";

const player = { balance: 1000, lossToday: 0 };

/** Position of a number on the table: column 1–12 along the long side, lane 0–2 across. */
const place = (n: number) => ({ col: Math.ceil(n / 3), lane: (n - 1) % 3 });

describe("roulette rules", () => {
  it("has a single-zero wheel with 18 Fire pockets", () => {
    expect(WHEEL_ORDER).toHaveLength(POCKET_COUNT);
    expect([...WHEEL_ORDER].sort((a, b) => a - b)).toEqual(Array.from({ length: 37 }, (_, i) => i));
    expect(FIRE_NUMBERS.size).toBe(18);
    expect(pocketColor(0)).toBe("olympus");
    expect(pocketColor(1)).toBe("fire");
    expect(pocketColor(2)).toBe("night");
    // Colors alternate around the wheel after the zero.
    for (let i = 1; i < WHEEL_ORDER.length - 1; i++) {
      expect(pocketColor(WHEEL_ORDER[i]!)).not.toBe(pocketColor(WHEEL_ORDER[i + 1]!));
    }
  });

  it("lists every standard bet exactly once", () => {
    const count = (kind: string) => [...BET_CATALOGUE.values()].filter((d) => d.kind === kind).length;
    expect(count("straight")).toBe(37);
    expect(count("split")).toBe(33 + 24 + 3);
    expect(count("street")).toBe(12);
    expect(count("corner")).toBe(22);
    expect(count("dozen")).toBe(3);
    expect(count("column")).toBe(3);
    expect(count("even")).toBe(6);
  });

  it("only joins numbers that touch on the table", () => {
    for (const def of BET_CATALOGUE.values()) {
      const nums = def.numbers.filter((n) => n !== 0);
      if (def.kind === "split" && !def.numbers.includes(0)) {
        const [a, b] = nums.map(place);
        expect(Math.abs(a!.col - b!.col) + Math.abs(a!.lane - b!.lane)).toBe(1);
      }
      if (def.kind === "corner") {
        const spots = nums.map(place);
        expect(new Set(spots.map((s) => s.col)).size).toBe(2);
        expect(new Set(spots.map((s) => s.lane)).size).toBe(2);
      }
      if (def.kind === "street") expect(new Set(nums.map((n) => place(n).col)).size).toBe(1);
    }
  });

  it("returns 36/37 of the stake on average for every bet (2.7% edge)", () => {
    for (const def of BET_CATALOGUE.values()) {
      const bets = [{ betId: def.id, amount: 10 }];
      let total = 0;
      for (let pocket = 0; pocket < POCKET_COUNT; pocket++) total += returnFor(bets, pocket);
      expect(total / POCKET_COUNT / 10).toBeCloseTo(36 / 37, 10);
    }
  });

  it("pays stake plus odds on a win and nothing on a loss", () => {
    const bets = [
      { betId: "straight:17", amount: 10 },
      { betId: "fire", amount: 5 },
      { betId: "split:17-20", amount: 5 },
    ];
    expect(returnFor(bets, 17)).toBe(10 * 36 + 0 + 5 * 18); // 17 is Night
    expect(returnFor(bets, 20)).toBe(5 * 18);
    expect(returnFor(bets, 1)).toBe(5 * 2);
    expect(returnFor(bets, 0)).toBe(0);
    expect(winningBetIds(bets, 17)).toEqual(["straight:17", "split:17-20"]);
    expect(bestReturn(bets)).toBe(450);
  });

  it("checks bets against the Standard limits", () => {
    const ok = checkBets([{ betId: "fire", amount: 10 }, { betId: "fire", amount: 5 }], player);
    expect(ok).toEqual({ ok: true, bets: [{ betId: "fire", amount: 15 }], stake: 15, bestReturn: 30 });
    expect(checkBets([], player)).toEqual({ ok: false, code: "EMPTY" });
    expect(checkBets([{ betId: "split:3-30", amount: 5 }], player)).toEqual({ ok: false, code: "UNKNOWN_BET" });
    expect(checkBets([{ betId: "fire", amount: 7 }], player)).toEqual({ ok: false, code: "BAD_AMOUNT" });
    expect(checkBets([{ betId: "fire", amount: -5 }], player)).toEqual({ ok: false, code: "BAD_AMOUNT" });
    expect(checkBets([{ betId: "straight:7", amount: 15 }], player)).toEqual({ ok: false, code: "STRAIGHT_LIMIT" });
    expect(checkBets([{ betId: "dozen:1", amount: 25 }, { betId: "dozen:2", amount: 30 }], player)).toEqual({ ok: false, code: "STAKE_LIMIT" });
    // A number plus every split around it: one pocket would pay too much.
    const stacked = ["straight:17", "split:14-17", "split:17-20", "split:16-17", "split:17-18"].map((betId) => ({ betId, amount: 10 }));
    expect(checkBets(stacked, player)).toEqual({ ok: false, code: "PAYOUT_LIMIT" });
    expect(checkBets([{ betId: "fire", amount: 25 }], { balance: 20, lossToday: 0 })).toEqual({ ok: false, code: "INSUFFICIENT_POINTS" });
    expect(checkBets([{ betId: "fire", amount: 25 }], { balance: 500, lossToday: 280 })).toEqual({ ok: false, code: "DAILY_LOSS_LIMIT" });
    expect(checkBets([{ betId: "fire", amount: 20 }], { balance: 500, lossToday: 280 }).ok).toBe(true);
    expect(mergeBets([{ betId: "odd", amount: 5 }, { betId: "odd", amount: -5 }])).toEqual([]);
  });

  it("maps any random number to a pocket", () => {
    expect(spinPocket(() => 0)).toBe(0);
    expect(spinPocket(() => 0.999999)).toBe(36);
    expect(spinPocket(() => 1)).toBe(36);
    expect(spinPocket(() => Number.NaN)).toBe(0);
  });

  it("resets the daily limit at midnight in Arlington, not UTC", () => {
    // 2026-11-15 03:00 UTC is still the evening of Nov 14 in Texas.
    expect(dayKey(Date.UTC(2026, 10, 15, 3))).toBe("2026-11-14");
    expect(dayKey(Date.UTC(2026, 10, 15, 7))).toBe("2026-11-15");
  });
});

describe("roulette on the server (Convex adapter)", () => {
  function fakeClient() {
    const watches: Array<{ value: RouletteServerTable | null | undefined; listeners: Set<() => void>; stopped: boolean }> = [];
    const mutation = vi.fn(async (_ref: unknown, args: { spinId: string; bets: PlacedBet[] }) => ({
      status: "ok" as const,
      spin: { spinId: args.spinId, pocket: 17, bets: args.bets, stake: 10, returned: 360, net: 350, at: 1 },
      balance: 450,
    }));
    const client = {
      watchQuery: () => {
        const entry = { value: undefined as RouletteServerTable | null | undefined, listeners: new Set<() => void>(), stopped: false };
        watches.push(entry);
        return {
          onUpdate(callback: () => void) {
            entry.listeners.add(callback);
            return () => {
              entry.stopped = true;
              entry.listeners.delete(callback);
            };
          },
          localQueryResult: () => entry.value,
          journal: () => undefined,
        };
      },
      mutation,
    } as unknown as RouletteConvexClient;
    const push = (value: RouletteServerTable | null) => {
      const entry = watches[watches.length - 1]!;
      entry.value = value;
      for (const listener of entry.listeners) listener();
    };
    return { client, mutation, push, watches };
  }

  const table = (patch: Partial<RouletteServerTable> = {}): RouletteServerTable => ({
    status: "live",
    closesAt: null,
    serverNow: 1,
    problem: null,
    balance: 100,
    lossToday: 0,
    limits: ROULETTE_LIMITS,
    history: [],
    ...patch,
  });

  it("shows the server's table live, and closed while loading, signed out or unable to play", () => {
    expect(mapRouletteTable(undefined)).toMatchObject({ status: "closed", balance: 0 });
    expect(mapRouletteTable(null)).toMatchObject({ status: "closed" });
    expect(mapRouletteTable(table({ problem: "NOT_CHECKED_IN" })).status).toBe("closed");
    expect(mapRouletteTable(table({ balance: 75, lossToday: 25 }))).toMatchObject({ status: "live", balance: 75, lossToday: 25 });

    const { client, push } = fakeClient();
    const adapter = createRouletteConvexAdapter({ client });
    const seen: string[] = [];
    adapter.subscribe(() => seen.push(`${adapter.getState().status}:${adapter.getState().balance}`));
    expect(adapter.getState().status).toBe("closed");
    push(table({ balance: 120 }));
    push(table({ balance: 90 }));
    expect(seen).toEqual(["live:120", "live:90"]);
    adapter.dispose();
  });

  it("sends spins to the server and maps its refusals to the game's codes", async () => {
    const { client, mutation } = fakeClient();
    const adapter = createRouletteConvexAdapter({ client });
    const bets = [{ betId: "straight:17", amount: 10 }];
    expect(await adapter.spin({ spinId: "s1", bets })).toMatchObject({ status: "ok", balance: 450, spin: { pocket: 17 } });
    expect(mutation).toHaveBeenCalledWith(expect.anything(), { spinId: "s1", bets });
    const cases: Array<[string, string]> = [
      ["ARCADE_CLOSED", "CLOSED"],
      ["GAME_DISABLED", "CLOSED"],
      ["NOT_SIGNED_IN", "SIGNED_OUT"],
      ["NOT_CHECKED_IN", "NOT_ELIGIBLE"],
      ["INVALID_PLAY_ID", "ERROR"],
      ["DAILY_LOSS_LIMIT", "DAILY_LOSS_LIMIT"],
      ["STRAIGHT_LIMIT", "STRAIGHT_LIMIT"],
    ];
    for (const [server, game] of cases) {
      expect(mapRouletteSpin({ status: "error", code: server as never })).toEqual({ status: "error", code: game });
    }
    expect(mapRouletteSpin({ status: "error", code: "COOLDOWN", retryAfterMs: 1200 })).toEqual({ status: "error", code: "COOLDOWN", retryAfterMs: 1200 });
    mutation.mockRejectedValueOnce(new Error("offline"));
    expect(await adapter.spin({ spinId: "s2", bets })).toEqual({ status: "error", code: "ERROR" });
    adapter.dispose();
    expect(await adapter.spin({ spinId: "s3", bets })).toEqual({ status: "error", code: "CLOSED" });
  });

  it("re-reads the table when the arcade's closing time passes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const { client, push, watches } = fakeClient();
    const adapter = createRouletteConvexAdapter({ client });
    push(table({ closesAt: 5_000 }));
    expect(watches).toHaveLength(1);
    vi.advanceTimersByTime(4_300);
    expect(watches).toHaveLength(2);
    expect(watches[0]!.stopped).toBe(true);
    adapter.dispose();
    vi.useRealTimers();
  });
});

describe("roulette wheel and dialogue", () => {
  it("lands the ball exactly on the server's pocket", () => {
    for (const pocket of [0, 17, 26, 32]) {
      const [w0, b0, vw, vb] = [123.4, -987.6, 150, 480];
      const T = landingTime(w0, b0, vw, vb, pocket, 2.6);
      expect(T).toBeGreaterThanOrEqual(2.6);
      const wheelEnd = w0 + (vw * T) / 3;
      const ballEnd = b0 - (vb * T) / 3;
      const offset = (((ballEnd - wheelEnd - pocketAngle(pocket)) % 360) + 360) % 360;
      expect(Math.min(offset, 360 - offset)).toBeCloseTo(0, 6);
    }
  });

  it("has a line for every result and error", () => {
    const base = { spinId: "s", bets: [], stake: 10, at: 0 };
    expect(resultLine({ ...base, pocket: 0, returned: 360, net: 350 }).title).toBe("OLYMPUS!");
    expect(resultLine({ ...base, pocket: 17, returned: 360, net: 350 }).tone).toBe("gold");
    expect(resultLine({ ...base, pocket: 5, returned: 20, net: 10 }).tone).toBe("green");
    expect(resultLine({ ...base, pocket: 5, returned: 10, net: 0 }).tone).toBe("marble");
    expect(resultLine({ ...base, pocket: 5, returned: 0, net: -10 }).line).toContain("-10 pts");
    expect(errorLine("STRAIGHT_LIMIT").line).toContain("10 pts");
    expect(errorLine("COOLDOWN", ROULETTE_LIMITS, 1200).line).toContain("Wait 2 s");
  });
});

describe("gods and demons", () => {
  const spin = (pocket: number, net: number, returned = net + 20) => ({ spinId: "s", bets: [], stake: 20, pocket, net, returned, at: 0 });

  it("sends a god for a win, a demon for a loss and Odysseus for a draw", () => {
    expect(omenFor(spin(5, 10), () => 0)).toMatchObject({ kind: "god", big: false, name: "Athena", quote: "Wisdom wins the day. +10 pts." });
    expect(omenFor(spin(17, 340))).toMatchObject({ kind: "god", big: true, name: "Zeus" });
    expect(omenFor(spin(0, 15))).toMatchObject({ kind: "god", big: true, name: "Zeus" });
    expect(omenFor(spin(5, -10, 10), () => 0.99)).toMatchObject({ kind: "demon", big: false, name: "Minotaur", quote: "Lost in my labyrinth. −10 pts." });
    expect(omenFor(spin(5, -40, 0))).toMatchObject({ kind: "demon", big: true, name: "Hades" });
    expect(omenFor(spin(0, -10, 0))).toMatchObject({ kind: "demon", big: true, name: "Hades" });
    expect(omenFor(spin(5, 0))).toMatchObject({ kind: "mortal", name: "Odysseus" });
  });

  it("draws every demon on a 16×16 grid", () => {
    for (const [name, rows] of Object.entries(DEMON_MAPS)) {
      expect(rows).toHaveLength(16);
      for (const row of rows) expect(row).toHaveLength(16);
      expect(demonSvg(name)).toContain("<path");
    }
    expect(demonSvg("nobody")).toBe("");
  });
});
