import { describe, expect, it, vi } from "vitest";
import { backendModeFrom, msUntilNextChange, readLaunchCode, toArcadeSession } from "../../src/arcade/liveSession";
import type { ArcadeServerSession } from "../../src/convex/arcadeApi";
import { bridgeReactClient, type BridgeableClient } from "../../src/games/olympus-21/adapters/reactClientBridge";
import { createConvexAdapter } from "../../src/games/olympus-21/adapters/convexAdapter.js";

const NOW = 1_800_000_000_000;

function server(overrides: Partial<ArcadeServerSession> = {}): ArcadeServerSession {
  return {
    serverNow: NOW,
    arcade: { status: "on", opensAt: null, closesAt: NOW + 3_600_000, nextChangeAt: NOW + 3_600_000 },
    signIn: { launchEnabled: true, backupSignIn: false },
    games: [
      { key: "olympus-slots", name: "Olympus Slots", enabled: true },
      { key: "pvp-blackjack", name: "Olympus 21", enabled: true },
    ],
    player: { displayName: "Alex Rivera", email: "alex@example.com", problem: null, points: 140 },
    ...overrides,
  };
}

describe("backendModeFrom", () => {
  it("is live only when asked, and ?preview always forces the mock", () => {
    expect(backendModeFrom(undefined, "")).toBe("mock");
    expect(backendModeFrom("mock", "")).toBe("mock");
    expect(backendModeFrom(" LIVE ", "")).toBe("live");
    expect(backendModeFrom("live", "?preview=off")).toBe("mock");
  });
});

describe("toArcadeSession", () => {
  it("is loading until auth and the query have answered", () => {
    expect(toArcadeSession(undefined, false).status).toBe("loading");
    expect(toArcadeSession(server(), true).status).toBe("loading");
  });

  it("maps a signed-in, checked-in hacker with the arcade on", () => {
    const session = toArcadeSession(server(), false);
    expect(session.status).toBe("on");
    expect(session.problem).toBeNull();
    expect(session.player).toEqual({ displayName: "Alex Rivera", email: "alex@example.com", points: 140 });
    expect(session.games).toEqual([
      { key: "olympus-slots", enabled: true },
      { key: "pvp-blackjack", enabled: true },
    ]);
    expect(session.closesAt).toBe(NOW + 3_600_000);
  });

  it("is signed-out with no player", () => {
    expect(toArcadeSession(server({ player: null }), false).status).toBe("signed-out");
  });

  it("is blocked with the reason when the account can't play, whatever the switch says", () => {
    const session = toArcadeSession(
      server({ player: { displayName: "Sam", email: null, problem: "NOT_CHECKED_IN", points: null } }),
      false,
    );
    expect(session.status).toBe("blocked");
    expect(session.problem).toBe("NOT_CHECKED_IN");
    expect(session.player?.points).toBe(0);
  });

  it("follows the arcade switch and drops games the site doesn't know", () => {
    const off = server({
      arcade: { status: "off", opensAt: null, closesAt: null, nextChangeAt: null },
      games: [{ key: "mystery-game" as never, name: "?", enabled: true }],
    });
    const session = toArcadeSession(off, false);
    expect(session.status).toBe("off");
    expect(session.games).toEqual([]);
  });
});

describe("msUntilNextChange", () => {
  it("waits until just after the next edge on the server clock", () => {
    expect(msUntilNextChange(server())).toBe(3_600_000 + 250);
    expect(msUntilNextChange(server({ arcade: { status: "on", opensAt: null, closesAt: null, nextChangeAt: null } }))).toBeNull();
    expect(msUntilNextChange(undefined)).toBeNull();
  });

  it("never schedules in the past", () => {
    const late = server({ arcade: { status: "on", opensAt: null, closesAt: NOW - 10, nextChangeAt: NOW - 10 } });
    expect(msUntilNextChange(late)).toBe(250);
  });
});

describe("readLaunchCode", () => {
  const code = "A".repeat(43);
  it("reads a well-formed code from the fragment", () => {
    expect(readLaunchCode(`#code=${code}`)).toBe(code);
    expect(readLaunchCode(`code=${code}`)).toBe(code);
  });
  it("refuses missing or malformed codes", () => {
    expect(readLaunchCode("")).toBeNull();
    expect(readLaunchCode("#code=short")).toBeNull();
    expect(readLaunchCode(`#code=${code}!`)).toBeNull();
  });
});

/** A ConvexReactClient stand-in: one watch per query, results pushed by the test. */
function fakeReactClient() {
  const watches: Array<{ name: string; args: unknown; value: unknown; error: unknown; listeners: Set<() => void> }> = [];
  const mutations: Array<{ name: string; args: Record<string, unknown> }> = [];
  const nameOf = (ref: unknown) => String((ref as Record<symbol, unknown>)[Symbol.for("functionName")]);
  const client = {
    watchQuery(ref: unknown, args: unknown) {
      const watch = { name: nameOf(ref), args, value: undefined as unknown, error: null as unknown, listeners: new Set<() => void>() };
      watches.push(watch);
      return {
        onUpdate(cb: () => void) {
          watch.listeners.add(cb);
          return () => watch.listeners.delete(cb);
        },
        localQueryResult() {
          if (watch.error) throw watch.error;
          return watch.value;
        },
      };
    },
    async mutation(ref: unknown, args: Record<string, unknown>) {
      mutations.push({ name: nameOf(ref), args });
      return { ok: true, serverNow: Date.now() };
    },
  } as unknown as BridgeableClient;
  const push = (index: number, value: unknown, error: unknown = null) => {
    const watch = watches[index]!;
    watch.value = value;
    watch.error = error;
    for (const cb of watch.listeners) cb();
  };
  return { client, watches, mutations, push };
}

describe("bridgeReactClient", () => {
  it("delivers query results by name, skips loading, reports errors, and unsubscribes", () => {
    const fake = fakeReactClient();
    const bridge = bridgeReactClient(fake.client);
    const onValue = vi.fn();
    const onError = vi.fn();
    const stop = bridge.onUpdate("admin/o21Tables:getMyTable", { nowBucket: 1 }, onValue, onError);
    expect(fake.watches[0]).toMatchObject({ name: "admin/o21Tables:getMyTable", args: { nowBucket: 1 } });
    expect(onValue).not.toHaveBeenCalled();
    fake.push(0, { status: "live" });
    expect(onValue).toHaveBeenCalledWith({ status: "live" });
    fake.push(0, undefined, new Error("boom"));
    expect(onError).toHaveBeenCalledTimes(1);
    (stop as () => void)();
    fake.push(0, { status: "closed" });
    expect(onValue).toHaveBeenCalledTimes(1);
  });

  it("delivers a cached result right away", () => {
    const fake = fakeReactClient();
    const bridge = bridgeReactClient(fake.client);
    // Prime the cache through the first watch, then subscribe again.
    const original = fake.client.watchQuery.bind(fake.client);
    (fake.client as { watchQuery: unknown }).watchQuery = (ref: unknown, args: unknown) => {
      const watch = (original as (r: unknown, a: unknown) => { onUpdate: unknown; localQueryResult: () => unknown })(ref, args);
      fake.watches[fake.watches.length - 1]!.value = { status: "teaser" };
      return watch;
    };
    const onValue = vi.fn();
    bridge.onUpdate("admin/o21Tables:getMyTable", {}, onValue);
    expect(onValue).toHaveBeenCalledWith({ status: "teaser" });
  });

  it("drives the Olympus 21 Convex adapter: status from the query, auto-match join with an action id", async () => {
    const fake = fakeReactClient();
    const adapter = createConvexAdapter({ client: bridgeReactClient(fake.client) });
    try {
      expect(adapter.getStatus()).toBeNull();
      fake.push(0, {
        status: "live",
        window: { opensAt: NOW - 1000, closesAt: Date.now() + 3_600_000 },
        player: { signedIn: true, eligible: true, checkedIn: true, name: "Alex", balance: 140 },
        view: null,
        serverNow: Date.now(),
      });
      expect(adapter.getStatus()).toMatchObject({ status: "live", player: { checkedIn: true, balance: 140 } });
      expect(adapter.getState()).toBeNull();
      await expect(adapter.join("Alex")).resolves.toEqual({ ok: true });
      expect(fake.mutations[0]!.name).toBe("admin/o21Tables:join");
      expect(fake.mutations[0]!.args).toMatchObject({ name: "Alex" });
      expect(typeof fake.mutations[0]!.args.actionId).toBe("string");
      expect(fake.mutations[0]!.args).not.toHaveProperty("bots");
    } finally {
      adapter.dispose();
    }
  });
});
