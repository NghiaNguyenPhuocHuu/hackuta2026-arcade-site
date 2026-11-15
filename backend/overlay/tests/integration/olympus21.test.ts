import { makeFunctionReference } from "convex/server";
import type { GenericId } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createConvexTest, type ConvexTestInstance } from "../helpers/convexTestContext";
import { NOW, openArcade, seedPlayer, updateGameInternal, walletOf } from "../helpers/arcadeTestKit";

const getMyTable = makeFunctionReference<"query">("arcade/olympus21:getMyTable");
const joinQueue = makeFunctionReference<"mutation">("arcade/olympus21:joinQueue");
const cancelQueue = makeFunctionReference<"mutation">("arcade/olympus21:cancelQueue");
const leave = makeFunctionReference<"mutation">("arcade/olympus21:leave");
const placeWager = makeFunctionReference<"mutation">("arcade/olympus21:placeWagerMove");
const trySeat = makeFunctionReference<"mutation">("arcade/olympus21:trySeat");
const tick = makeFunctionReference<"mutation">("arcade/olympus21:tick");
const GAME = "pvp-blackjack";
const BUY_IN = 50;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const profileOf = (t: ConvexTestInstance, id: GenericId<"checkedIn">) => t.run(async (ctx) => (await ctx.db.get(id))?.points);
const tableIds = (t: ConvexTestInstance) => t.run(async (ctx) => (await ctx.db.query("o21LiveTables").collect()).map((row) => row._id));

describe("Olympus 21 live tables", () => {
  it("seats two queued hackers together after the fill delay, buy-in from the arcade wallet", async () => {
    const t = createConvexTest();
    await openArcade(t, [GAME]);
    const a = await seedPlayer(t, { points: 50, arcadePoints: 200 });
    const b = await seedPlayer(t, { arcadePoints: 150 });
    expect(await a.player.mutation(joinQueue, {})).toMatchObject({ ok: true });
    expect(await b.player.mutation(joinQueue, {})).toMatchObject({ ok: true });

    const queued = await a.player.query(getMyTable, {});
    expect(queued).toMatchObject({ status: "live", buyIn: BUY_IN, queue: { waiting: 2 }, view: null, player: { checkedIn: true, balance: 200 - BUY_IN } });
    expect(await walletOf(t, a.checkedInId!)).toBe(200 - BUY_IN);
    expect(await profileOf(t, a.checkedInId!)).toBe(50);

    vi.setSystemTime(NOW + 2_500);
    await t.mutation(trySeat, {});
    const va = await a.player.query(getMyTable, {});
    const vb = await b.player.query(getMyTable, {});
    expect(va.queue).toBeNull();
    expect(va.view?.tableId).toBe(vb.view?.tableId);
    expect(va.view?.seats).toHaveLength(2);
    expect(va.view?.seats.every((seat: { bot: boolean }) => !seat.bot)).toBe(true);
    expect(va.view?.me?.balance).toBe(BUY_IN);
  });

  it("keeps a lone hacker waiting (no bots), and never leaks hands or the piles once seated", async () => {
    const t = createConvexTest();
    await openArcade(t, [GAME]);
    const a = await seedPlayer(t, { arcadePoints: 300 });
    const b = await seedPlayer(t, { arcadePoints: 300 });
    await a.player.mutation(joinQueue, {});
    vi.setSystemTime(NOW + 60_000);
    await t.mutation(trySeat, {});
    expect(await a.player.query(getMyTable, {})).toMatchObject({ view: null, queue: { waiting: 1 } });
    await b.player.mutation(joinQueue, {});
    vi.setSystemTime(NOW + 62_500);
    await t.mutation(trySeat, {});
    const view = (await a.player.query(getMyTable, {})).view;
    expect(view?.seats).toHaveLength(2);
    expect(view?.seats.some((seat: { bot: boolean }) => seat.bot)).toBe(false);
    const text = JSON.stringify(view);
    expect(text).not.toContain("drawPile");
    expect(text).not.toContain("playPile");
    for (const seat of view!.seats) expect(seat).not.toHaveProperty("hand");
  });

  it("refunds the buy-in when leaving the queue", async () => {
    const t = createConvexTest();
    await openArcade(t, [GAME]);
    const a = await seedPlayer(t, { arcadePoints: 120 });
    await a.player.mutation(joinQueue, {});
    expect(await walletOf(t, a.checkedInId!)).toBe(120 - BUY_IN);
    expect(await a.player.mutation(cancelQueue, {})).toMatchObject({ ok: true });
    expect(await walletOf(t, a.checkedInId!)).toBe(120);
    // A second cancel changes nothing.
    await a.player.mutation(cancelQueue, {});
    expect(await walletOf(t, a.checkedInId!)).toBe(120);
  });

  it("pays the chips back when a hacker stands up between rounds; the other's table breaks and pays them too", async () => {
    const t = createConvexTest();
    await openArcade(t, [GAME]);
    const a = await seedPlayer(t, { arcadePoints: 100 });
    const b = await seedPlayer(t, { arcadePoints: 100 });
    await a.player.mutation(joinQueue, {});
    await b.player.mutation(joinQueue, {});
    vi.setSystemTime(NOW + 2_500);
    await t.mutation(trySeat, {});
    expect(await walletOf(t, a.checkedInId!)).toBe(100 - BUY_IN);
    expect(await a.player.mutation(leave, {})).toMatchObject({ ok: true });
    expect(await walletOf(t, a.checkedInId!)).toBe(100);
    expect(await walletOf(t, b.checkedInId!)).toBe(100);
    expect((await a.player.query(getMyTable, {})).result).toMatchObject({ returned: BUY_IN, reason: "You left the table." });
    expect((await b.player.query(getMyTable, {})).result).toMatchObject({ returned: BUY_IN, reason: "The table closed." });
    // Leaving again never pays twice.
    await a.player.mutation(leave, {});
    expect(await walletOf(t, a.checkedInId!)).toBe(100);
  });

  it("closes open tables and pays everyone out on the next tick once the game is switched off", async () => {
    const t = createConvexTest();
    await openArcade(t, [GAME]);
    const a = await seedPlayer(t, { arcadePoints: 100 });
    const b = await seedPlayer(t, { arcadePoints: 100 });
    await a.player.mutation(joinQueue, {});
    await b.player.mutation(joinQueue, {});
    vi.setSystemTime(NOW + 2_500);
    await t.mutation(trySeat, {});
    await t.mutation(updateGameInternal, { key: GAME, enabled: false });
    const [tableId] = await tableIds(t);
    await t.mutation(tick, { tableId });
    expect(await walletOf(t, a.checkedInId!)).toBe(100);
    expect(await walletOf(t, b.checkedInId!)).toBe(100);
    expect((await a.player.query(getMyTable, {})).status).toBe("closed");
    // Moves are refused with the switch's reason.
    expect(await a.player.mutation(placeWager, { amount: 10 })).toMatchObject({ ok: false });
  });

  it("refuses a buy-in the wallet can't cover, hackers who can't play, and a closed game", async () => {
    const t = createConvexTest();
    await openArcade(t, [GAME]);
    const poor = await seedPlayer(t, { arcadePoints: BUY_IN - 1 });
    expect(await poor.player.mutation(joinQueue, {})).toMatchObject({ ok: false, code: "INSUFFICIENT_POINTS" });
    expect(await walletOf(t, poor.checkedInId!)).toBe(BUY_IN - 1);
    const notIn = await seedPlayer(t, { checkedIn: false });
    expect(await notIn.player.mutation(joinQueue, {})).toMatchObject({ ok: false, code: "NOT_CHECKED_IN" });
    expect(await t.mutation(joinQueue, {})).toMatchObject({ ok: false, code: "NOT_SIGNED_IN" });

    const t2 = createConvexTest();
    await openArcade(t2, []);
    const rich = await seedPlayer(t2, { arcadePoints: 500 });
    expect(await rich.player.mutation(joinQueue, {})).toMatchObject({ ok: false, code: "GAME_DISABLED" });
  });

  it("every chip is accounted for in arcadePlays: buy-ins out, cash-outs and refunds in", async () => {
    const t = createConvexTest();
    await openArcade(t, [GAME]);
    const a = await seedPlayer(t, { arcadePoints: 250 });
    const b = await seedPlayer(t, { arcadePoints: 250 });
    await a.player.mutation(joinQueue, {});
    await b.player.mutation(joinQueue, {});
    vi.setSystemTime(NOW + 2_500);
    await t.mutation(trySeat, {});
    await b.player.mutation(leave, {});
    const plays = await t.run(async (ctx) => (await ctx.db.query("arcadePlays").collect()).filter((row) => row.game === GAME));
    for (const id of [a.checkedInId!, b.checkedInId!]) {
      const net = plays.filter((row) => row.checkedInId === id).reduce((sum, row) => sum + row.pointsDelta, 0);
      expect(250 + net).toBe(await walletOf(t, id));
    }
  });
});
