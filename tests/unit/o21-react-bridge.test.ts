import { describe, expect, it, vi } from "vitest";
import { bridgeReactClient, type BridgeableClient } from "../../src/games/olympus-21/adapters/reactClientBridge";
import { createConvexAdapter } from "../../src/games/olympus-21/adapters/convexAdapter.js";

const NOW = 1_800_000_000_000;

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
    const stop = bridge.onUpdate("arcade/olympus21:getMyTable", { nowBucket: 1 }, onValue, onError);
    expect(fake.watches[0]).toMatchObject({ name: "arcade/olympus21:getMyTable", args: { nowBucket: 1 } });
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
    bridge.onUpdate("arcade/olympus21:getMyTable", {}, onValue);
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
      await expect(adapter.join()).resolves.toEqual({ ok: true });
      expect(fake.mutations[0]!.name).toBe("arcade/olympus21:joinQueue");
      expect(fake.mutations[0]!.args).not.toHaveProperty("name");
      expect(typeof fake.mutations[0]!.args.actionId).toBe("string");
      expect(fake.mutations[0]!.args).not.toHaveProperty("bots");
    } finally {
      adapter.dispose();
    }
  });
});
