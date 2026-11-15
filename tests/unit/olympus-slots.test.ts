import { afterEach, describe, expect, it, vi } from "vitest";
import type { MinigameServerState } from "../../src/convex/minigameApi";
import { createConvexAdapter, mapGameState, mapSpinResult, type MinigameConvexClient } from "../../src/games/olympus-slots/adapters/convexAdapter";
import { createMockAdapter } from "../../src/games/olympus-slots/adapters/mockAdapter";
import { dialogueFor, formatOpensAt, lossRun, TUTORIAL_STEPS } from "../../src/games/olympus-slots/dialogue";
import { hackerFrame } from "../../src/games/olympus-slots/hacker";
import { SPRITE_MAPS, symbolLabel, symbolSvg } from "../../src/games/olympus-slots/symbols";
import { SLOT_SYMBOLS } from "../../shared/admin/slotRules";

const NOW = 1_800_000_000_000;

function serverState(overrides: Partial<MinigameServerState> = {}): MinigameServerState {
  return {
    status: "live",
    window: { windowId: "win1", opensAt: NOW - 60_000, closesAt: NOW + 60_000 },
    serverNow: NOW,
    player: { participant: true, eligible: true, checkedIn: true, balance: 120, canPlay: true },
    wagers: [5, 10, 25, 50],
    defaultWager: 10,
    cooldownMs: 2000,
    recentSpins: [{ spinId: "s1", wager: 10, payout: 20, net: 10, outcome: "win", symbols: ["hera", "hera", "hera", "zeus"], createdAt: NOW - 1000 }],
    ...overrides,
  };
}

/** A fake ConvexReactClient: one watch per call, results pushed by the test. */
function fakeClient() {
  const watches: Array<{ args: unknown; value: MinigameServerState | null | undefined; error: unknown; listeners: Set<() => void>; unsubscribed: boolean }> = [];
  const mutation = vi.fn(async (_ref: unknown, args: { spinId: string; wager: number }) => ({
    status: "ok" as const, spinId: args.spinId, outcome: "push", symbols: ["hera", "hera", "zeus", "zeus"],
    wager: args.wager, payout: args.wager, net: 0, previousPoints: 120, newPoints: 120,
  }));
  const client = {
    watchQuery: (_ref: unknown, args: unknown) => {
      const entry = { args, value: undefined as MinigameServerState | null | undefined, error: null as unknown, listeners: new Set<() => void>(), unsubscribed: false };
      watches.push(entry);
      return {
        onUpdate(callback: () => void) {
          entry.listeners.add(callback);
          return () => {
            entry.unsubscribed = true;
            entry.listeners.delete(callback);
          };
        },
        localQueryResult() {
          if (entry.error) throw entry.error;
          return entry.value;
        },
        journal: () => undefined,
      };
    },
    mutation,
  } as unknown as MinigameConvexClient;
  function push(value: MinigameServerState | null, index = watches.length - 1) {
    const entry = watches[index]!;
    entry.value = value;
    for (const listener of entry.listeners) listener();
  }
  function fail(error: unknown, index = watches.length - 1) {
    const entry = watches[index]!;
    entry.error = error;
    for (const listener of entry.listeners) listener();
  }
  return { client, watches, push, fail, mutation };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("mapGameState", () => {
  it("treats signed out as closed with no balance", () => {
    const state = mapGameState(null, NOW);
    expect(state).toMatchObject({ status: "closed", balance: 0, windowId: null, player: { signedIn: false } });
    expect(state.wagers).toEqual([5, 10, 25, 50]);
  });

  it("maps a live window, balance, and recent spins", () => {
    const state = mapGameState(serverState(), NOW);
    expect(state).toMatchObject({ status: "live", balance: 120, opensAt: NOW - 60_000, closesAt: NOW + 60_000, windowId: "win1" });
    expect(state.recentSpins[0]).toMatchObject({ spinId: "s1", outcomeId: "win", outcomeLabel: "Win", delta: 10, at: NOW - 1000 });
  });

  it("maps none to closed, and flips teaser/live at the window edges on the client clock", () => {
    expect(mapGameState(serverState({ status: "none", window: null }), NOW).status).toBe("closed");
    const teaser = serverState({ status: "teaser", window: { windowId: "w", opensAt: NOW, closesAt: NOW + 10 } });
    expect(mapGameState(teaser, NOW - 1).status).toBe("teaser");
    expect(mapGameState(teaser, NOW).status).toBe("live");
    expect(mapGameState(teaser, NOW + 10).status).toBe("closed");
  });

  it("keeps a missing balance at 0 and an unknown outcome readable", () => {
    const state = mapGameState(serverState({
      player: { participant: true, eligible: false, checkedIn: false, balance: null, canPlay: false },
      wagers: [],
      recentSpins: [{ spinId: "s", wager: 5, payout: 0, net: -5, outcome: "mystery", symbols: [], createdAt: NOW }],
    }), NOW);
    expect(state.balance).toBe(0);
    expect(state.player.balance).toBeNull();
    expect(state.wagers).toEqual([5, 10, 25, 50]);
    expect(state.recentSpins[0]).toMatchObject({ outcomeId: "mystery", outcomeLabel: "mystery" });
  });
});

describe("mapSpinResult", () => {
  it("maps ok results and every server error code", () => {
    expect(mapSpinResult({ status: "ok", spinId: "a", outcome: "big", symbols: ["zeus", "zeus", "zeus", "zeus"], wager: 10, payout: 50, net: 40, previousPoints: 100, newPoints: 140 }))
      .toEqual({ status: "ok", symbols: ["zeus", "zeus", "zeus", "zeus"], outcome: { id: "big", label: "Big win", multiplier: 5 }, wager: 10, payout: 50, pointsBefore: 100, pointsAfter: 140 });
    const codes = {
      ARCADE_CLOSED: "closed", GAME_DISABLED: "closed", INVALID_WAGER: "invalid_wager", INSUFFICIENT_POINTS: "insufficient_points", COOLDOWN: "rate_limited",
      NOT_SIGNED_IN: "signed_out", NOT_PARTICIPANT: "not_eligible", NOT_ELIGIBLE: "not_eligible", NOT_CHECKED_IN: "not_eligible", INVALID_PLAY_ID: "error",
    } as const;
    for (const [code, status] of Object.entries(codes)) {
      expect(mapSpinResult({ status: "error", code: code as keyof typeof codes })).toEqual({ status, code });
    }
    expect(mapSpinResult(null)).toEqual({ status: "error" });
  });
});

describe("createConvexAdapter", () => {
  it("subscribes with a nowBucket, emits mapped state, and spins through the mutation", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const fake = fakeClient();
    const adapter = createConvexAdapter({ client: fake.client, nowBucketMs: 15_000 });
    expect(fake.watches[0]!.args).toEqual({ nowBucket: Math.floor(NOW / 15_000) });
    const listener = vi.fn();
    const unsubscribe = adapter.subscribe(listener);
    fake.push(serverState());
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ status: "live", balance: 120 }));
    expect(adapter.getState().player.signedIn).toBe(true);

    const result = await adapter.spin({ spinId: "spin-1", wager: 10 });
    expect(fake.mutation).toHaveBeenCalledWith(expect.anything(), { spinId: "spin-1", wager: 10 });
    expect(result).toMatchObject({ status: "ok", outcome: { id: "push" } });
    unsubscribe();
    adapter.dispose();
    expect(fake.watches[0]!.unsubscribed).toBe(true);
    expect(await adapter.spin({ spinId: "late", wager: 10 })).toEqual({ status: "closed" });
  });

  it("moves to a new bucket as time passes and flips status at the closing edge", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const fake = fakeClient();
    const adapter = createConvexAdapter({ client: fake.client, nowBucketMs: 3000 });
    fake.push(serverState({ window: { windowId: "w", opensAt: NOW - 1000, closesAt: NOW + 2000 } }));
    expect(adapter.getState().status).toBe("live");
    vi.advanceTimersByTime(2100);
    expect(adapter.getState().status).toBe("closed");
    expect(fake.watches.length).toBeGreaterThan(1);
    expect(fake.watches[0]!.unsubscribed).toBe(true);
    adapter.dispose();
  });

  it("reports query and mutation errors without throwing", async () => {
    const onError = vi.fn();
    const fake = fakeClient();
    const adapter = createConvexAdapter({ client: fake.client, onError });
    fake.fail(new Error("query failed"));
    expect(onError).toHaveBeenCalledTimes(1);
    fake.mutation.mockRejectedValueOnce(new Error("offline"));
    expect(await adapter.spin({ spinId: "x", wager: 5 })).toEqual({ status: "error" });
    expect(onError).toHaveBeenCalledTimes(2);
    adapter.dispose();
    adapter.dispose();
  });
});

describe("createMockAdapter", () => {
  it("starts from a carried-over balance and history", () => {
    const spin = { spinId: "s1", symbols: ["zeus", "zeus", "hera", "hera"], outcomeId: "push", outcomeLabel: "Two pairs", wager: 10, payout: 10, delta: 0, at: 1 };
    const adapter = createMockAdapter({ balance: 140, recentSpins: [spin], latencyMs: 0 });
    expect(adapter.getState()).toMatchObject({ balance: 140, recentSpins: [spin] });
    adapter.dispose();
  });

  it("enforces the server's rules", async () => {
    const adapter = createMockAdapter({ balance: 30, latencyMs: 0, random: () => 0.99 });
    expect(await adapter.spin({ spinId: "a", wager: 7 })).toEqual({ status: "invalid_wager" });
    expect(await adapter.spin({ spinId: "b", wager: 50 })).toEqual({ status: "insufficient_points" });
    const first = await adapter.spin({ spinId: "c", wager: 10 });
    expect(first.status).toBe("ok");
    expect(await adapter.spin({ spinId: "c", wager: 10 })).toBe(first);
    expect(await adapter.spin({ spinId: "d", wager: 10 })).toEqual({ status: "rate_limited" });
    expect(adapter.getState().recentSpins).toHaveLength(1);
    adapter.setStatus("closed");
    expect(await adapter.spin({ spinId: "e", wager: 5 })).toEqual({ status: "closed" });
    adapter.dispose();
  });

  it("flips teaser → live → closed on its own", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const adapter = createMockAdapter({ status: "teaser", opensAt: NOW + 1000, closesAt: NOW + 2000, latencyMs: 0 });
    const statuses: string[] = [];
    adapter.subscribe((state) => statuses.push(state.status));
    vi.advanceTimersByTime(2500);
    expect(statuses).toEqual(["live", "closed"]);
    adapter.dispose();
  });
});

describe("game content", () => {
  it("has a 16×16 sprite and a label for every reel symbol", () => {
    for (const symbol of SLOT_SYMBOLS) {
      const rows = SPRITE_MAPS[symbol]!;
      expect(rows).toHaveLength(16);
      for (const row of rows) expect(row).toHaveLength(16);
      expect(symbolLabel(symbol)).not.toBe(symbol);
      expect(symbolSvg(symbol)).toContain("<path");
      expect(symbolSvg(symbol, { silhouette: true })).toContain("#2c5272");
    }
    expect(symbolSvg("nobody")).toContain("M3 3h10v10H3z");
  });

  it("animates Techno for every mood", () => {
    for (const mood of ["idle", "focus", "smug", "cheer", "sad", "shock", "unknown"]) {
      const frame = hackerFrame(mood, { frame: 3, talking: true });
      expect(frame.svg.startsWith("<svg")).toBe(true);
    }
    expect(hackerFrame("cheer", { still: true })).toMatchObject({ dx: 0, dy: 0 });
  });

  it("picks Techno's lines for each state", () => {
    expect(dialogueFor({ status: "teaser", opensAt: null }).title).toBe("THE GATES ARE SEALED");
    expect(dialogueFor({ status: "closed" }).line).toContain("GG, mortal");
    expect(dialogueFor({ spinning: true }).mood).toBe("focus");
    expect(dialogueFor({ tutorialStep: 1 }).title).toBe(TUTORIAL_STEPS[1]!.title);
    expect(dialogueFor({ shortOfPoints: true, balance: 3 }).line).toContain("coffers are empty");
    const result = { outcome: "win", net: 10, wager: 10, reels: ["odysseus", "odysseus", "odysseus", "zeus"], quipIndex: 0, lossStreak: 0, prevLosses: 0 };
    expect(dialogueFor({ result }).title).toBe("THREE ODYSSEUS!");
    expect(dialogueFor({ result: { ...result, outcome: "lose", net: -10, lossStreak: 3 } }).mood).toBe("shock");
    expect(lossRun([{ net: -5 }, { net: -5 }, { net: 10 }])).toBe(2);
    expect(formatOpensAt("soon")).toBeNull();
  });
});
