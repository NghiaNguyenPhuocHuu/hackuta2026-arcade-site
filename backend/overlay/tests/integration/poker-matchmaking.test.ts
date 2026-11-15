import { makeFunctionReference } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createConvexTest } from "../helpers/convexTestContext";

const getView = makeFunctionReference<"query">("arcade/poker:getMyPokerView");
const joinQueue = makeFunctionReference<"mutation">("arcade/poker:joinQueue");
const cancelQueue = makeFunctionReference<"mutation">("arcade/poker:cancelQueue");
const act = makeFunctionReference<"mutation">("arcade/poker:act");
const trySeat = makeFunctionReference<"mutation">("arcade/poker:trySeat");

const NOW = Date.UTC(2026, 10, 14, 19);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("event poker matchmaking", () => {
  it("starts two waiting humans at the same table after the fill delay", async () => {
    const t = createConvexTest();
    expect(await t.mutation(joinQueue, { playerToken: "hero-alpha", displayName: "Athena" })).toEqual({
      status: "ok",
      phase: "queued",
    });
    expect(await t.mutation(joinQueue, { playerToken: "hero-beta", displayName: "Ares" })).toEqual({
      status: "ok",
      phase: "queued",
    });

    const queued = await t.query(getView, { playerToken: "hero-alpha" });
    expect(queued.phase).toBe("queued");
    expect(queued.balance).toBe(100);
    expect(queued.queue).toHaveLength(2);

    vi.setSystemTime(NOW + 2_500);
    await t.mutation(trySeat, {});

    const a = await t.query(getView, { playerToken: "hero-alpha" });
    const b = await t.query(getView, { playerToken: "hero-beta" });
    expect(a.phase).toBe("table");
    expect(b.phase).toBe("table");
    expect(a.table?.id).toBe(b.table?.id);
    expect(a.table?.seats).toHaveLength(2);
    expect(a.youId).toBeTruthy();
    expect(a.table?.you?.id).toBe(a.youId);
  });

  it("fills a solo queue with shades and never leaks the deck or the other hole cards", async () => {
    const t = createConvexTest();
    await t.mutation(joinQueue, { playerToken: "hero-solo", displayName: "Hermes" });
    vi.setSystemTime(NOW + 6_000);
    await t.mutation(trySeat, {});

    const view = await t.query(getView, { playerToken: "hero-solo" });
    expect(view.phase).toBe("table");
    expect(view.table?.seats.length).toBe(4);
    expect(view.table?.seats.filter((seat: { isBot: boolean }) => seat.isBot)).toHaveLength(3);
    expect(view.table?.you?.id).toBe(view.youId);
    expect(view.table?.seats.find((seat: { id: string }) => seat.id === view.youId)?.hole).toHaveLength(2);
    for (const seat of view.table?.seats ?? []) {
      if (seat.id !== view.youId) expect(seat.hole).toBeNull();
    }

    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain('"deck"');

    const secrets = await t.run(async (ctx) => {
      const tables = await ctx.db.query("pokerTables").collect();
      const table = tables[0];
      return { deck: table?.deck.length ?? 0, status: table?.status };
    });
    expect(secrets.status).toBe("playing");
    expect(secrets.deck).toBeGreaterThan(0);
  });

  it("refunds the buy-in when leaving the queue", async () => {
    const t = createConvexTest();
    await t.mutation(joinQueue, { playerToken: "hero-leave", displayName: "Hera" });
    expect(await t.mutation(cancelQueue, { playerToken: "hero-leave" })).toEqual({ status: "ok" });
    const view = await t.query(getView, { playerToken: "hero-leave" });
    expect(view.phase).toBe("lobby");
    expect(view.balance).toBe(200);
  });

  it("refuses a second buy-in when the stack is too small", async () => {
    const t = createConvexTest();
    await t.mutation(joinQueue, { playerToken: "hero-broke", displayName: "Dionysus" });
    expect(await t.mutation(cancelQueue, { playerToken: "hero-broke" })).toEqual({ status: "ok" });
    await t.run(async (ctx) => {
      const players = await ctx.db.query("pokerPlayers").collect();
      await ctx.db.patch(players[0]!._id, { points: 40 });
    });
    expect(await t.mutation(joinQueue, { playerToken: "hero-broke", displayName: "Dionysus" })).toEqual({
      status: "error",
      code: "INSUFFICIENT_POINTS",
    });
  });

  it("rejects an action off-turn", async () => {
    const t = createConvexTest();
    await t.mutation(joinQueue, { playerToken: "hero-one", displayName: "One" });
    await t.mutation(joinQueue, { playerToken: "hero-two", displayName: "Two" });
    vi.setSystemTime(NOW + 2_500);
    await t.mutation(trySeat, {});

    const a = await t.query(getView, { playerToken: "hero-one" });
    const b = await t.query(getView, { playerToken: "hero-two" });
    const waiter = a.table?.you?.legal?.length ? "hero-two" : "hero-one";
    const waitingView = waiter === "hero-one" ? a : b;
    expect(waitingView.table?.you?.legal ?? []).not.toContain("fold");
    expect(await t.mutation(act, { playerToken: waiter, action: { type: "fold" } })).toEqual({
      status: "error",
      code: "NOT_YOUR_TURN",
    });
  });
});
