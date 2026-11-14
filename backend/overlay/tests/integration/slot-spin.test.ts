import { makeFunctionReference } from "convex/server";
import type { GenericId } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeLedgerPoints } from "../../convex/admin/pointsLedger";
import { createConvexTest, type ConvexTestInstance } from "../helpers/convexTestContext";
import { seedApplicant, seedStaff } from "../helpers/reviewTestKit";

const getState = makeFunctionReference<"query">("admin/slotSpin:getMyGameState");
const spin = makeFunctionReference<"mutation">("admin/slotSpin:spin");
const createWindowInternal = makeFunctionReference<"mutation">("admin/slotWindows:createSlotWindowInternal");
const cancelWindowInternal = makeFunctionReference<"mutation">("admin/slotWindows:cancelSlotWindowInternal");

const NOW = Date.UTC(2026, 10, 14, 19);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
let tokenCounter = 0;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Forces the server RNG (Web Crypto) to return `value` in [0, 1) for every draw. */
function forceRandom(value: number) {
  vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(((array: Uint32Array) => {
    array.fill(Math.floor(value * 2 ** 32));
    return array;
  }) as typeof globalThis.crypto.getRandomValues);
}
// rollOutcome: floor(x*100) <5 big, <25 win, <50 push, else lose.
const BIG = 0;
const WIN = 0.1;
const PUSH = 0.3;
const LOSE = 0.99;

async function seedPlayer(
  t: ConvexTestInstance,
  options: { points?: number; checkedIn?: boolean; review?: string; participant?: boolean; ledger?: boolean } = {},
) {
  const admin = await seedStaff(t);
  const applicant = await seedApplicant(t, { review: { status: options.review ?? "accepted" } });
  const player = t.withIdentity({ subject: applicant.userId });
  if (options.participant === false) return { player, admin, applicant, participantId: null, checkedInId: null };
  tokenCounter += 1;
  const registrationQr = tokenCounter.toString(16).padStart(64, "a");
  const points = options.points ?? 100;
  const ids = await t.run(async (ctx) => {
    const participantId = await ctx.db.insert("participants", {
      applicationId: applicant.applicationId,
      authUserId: applicant.userId,
      acceptedAt: 1,
      acceptedBy: admin.adminId,
      qrCodeToken: registrationQr,
      createdAt: 1,
      updatedAt: 1,
    });
    if (options.checkedIn === false) return { participantId, checkedInId: null };
    const badge = `HACKUTA-BADGE-${String(tokenCounter).padStart(4, "0")}`;
    const checkedInId = await ctx.db.insert("checkedIn", {
      participantId,
      applicationId: applicant.applicationId,
      authUserId: applicant.userId,
      acceptedAt: 1,
      acceptedBy: admin.adminId,
      checkedInAt: 1,
      checkedInBy: admin.adminId,
      qrCodeToken: badge,
      registrationQrCodeToken: registrationQr,
      points,
      createdAt: 1,
      updatedAt: 1,
    });
    if (options.ledger !== false && points > 0) {
      // Make the cached balance match the ledger so parity checks are meaningful.
      await ctx.db.insert("volunteerActionLogs", {
        actorAdminId: admin.adminId,
        checkedInId,
        action: "admin_adjust",
        pointsDelta: points,
        previousPoints: 0,
        newPoints: points,
        reason: "seed",
        createdAt: 1,
      });
    }
    return { participantId, checkedInId };
  });
  return { player, admin, applicant, ...ids };
}

async function openWindow(t: ConvexTestInstance, opensAt = NOW - MINUTE, closesAt = NOW + HOUR) {
  const { windowId } = await t.mutation(createWindowInternal, { opensAt, closesAt });
  return windowId as GenericId<"slotWindows">;
}

const balanceOf = (t: ConvexTestInstance, id: GenericId<"checkedIn">) => t.run(async (ctx) => (await ctx.db.get(id))?.points);
const ledgerOf = (t: ConvexTestInstance, id: GenericId<"checkedIn">) => t.run((ctx) => computeLedgerPoints(ctx, id));
const spinRows = (t: ConvexTestInstance) => t.run((ctx) => ctx.db.query("slotSpins").collect());

describe("minigame access", () => {
  it("returns null state and NOT_SIGNED_IN when signed out", async () => {
    const t = createConvexTest();
    await openWindow(t);
    expect(await t.query(getState, {})).toBeNull();
    expect(await t.mutation(spin, { spinId: "a", wager: 10 })).toEqual({ status: "error", code: "NOT_SIGNED_IN" });
  });

  it("refuses applicants who are not participants, not accepted, or not checked in", async () => {
    const t = createConvexTest();
    await openWindow(t);
    const none = await seedPlayer(t, { participant: false });
    expect(await none.player.mutation(spin, { spinId: "a", wager: 10 })).toMatchObject({ code: "NOT_PARTICIPANT" });
    expect(await none.player.query(getState, {})).toMatchObject({
      status: "live", player: { participant: false, eligible: false, checkedIn: false, balance: null },
    });

    const waitlisted = await seedPlayer(t, { review: "waitlisted" });
    expect(await waitlisted.player.mutation(spin, { spinId: "a", wager: 10 })).toMatchObject({ code: "NOT_ELIGIBLE" });

    const notCheckedIn = await seedPlayer(t, { checkedIn: false });
    expect(await notCheckedIn.player.mutation(spin, { spinId: "a", wager: 10 })).toMatchObject({ code: "NOT_CHECKED_IN" });
    expect(await notCheckedIn.player.query(getState, {})).toMatchObject({
      player: { participant: true, eligible: true, checkedIn: false, balance: null },
    });
    expect(await spinRows(t)).toEqual([]);
  });
});

describe("window status", () => {
  it("moves none → teaser → live → closed → none with the server clock", async () => {
    const t = createConvexTest();
    const { player } = await seedPlayer(t);
    expect(await player.query(getState, {})).toMatchObject({ status: "none", window: null, serverNow: NOW });

    const windowId = await openWindow(t, NOW + 30 * MINUTE, NOW + 90 * MINUTE);
    expect(await player.query(getState, {})).toMatchObject({
      status: "teaser", window: { windowId, opensAt: NOW + 30 * MINUTE, closesAt: NOW + 90 * MINUTE },
    });
    expect(await player.mutation(spin, { spinId: "early", wager: 10 })).toMatchObject({ code: "WINDOW_CLOSED" });

    vi.setSystemTime(NOW + 30 * MINUTE);
    expect(await player.query(getState, { nowBucket: 1 })).toMatchObject({ status: "live", window: { windowId } });

    vi.setSystemTime(NOW + 90 * MINUTE);
    expect(await player.query(getState, { nowBucket: 2 })).toMatchObject({ status: "closed", window: { windowId } });
    expect(await player.mutation(spin, { spinId: "late", wager: 10 })).toMatchObject({ code: "WINDOW_CLOSED" });

    vi.setSystemTime(NOW + 90 * MINUTE + 13 * HOUR);
    expect(await player.query(getState, { nowBucket: 3 })).toMatchObject({ status: "none", window: null });
  });

  it("treats a cancelled scheduled window as gone and a cancelled live window as closed", async () => {
    const t = createConvexTest();
    const { player } = await seedPlayer(t);
    const scheduled = await openWindow(t, NOW + 30 * MINUTE, NOW + HOUR);
    await t.mutation(cancelWindowInternal, { windowId: scheduled });
    expect(await player.query(getState, {})).toMatchObject({ status: "none" });

    const live = await openWindow(t, NOW - MINUTE, NOW + HOUR);
    expect(await player.query(getState, {})).toMatchObject({ status: "live" });
    vi.setSystemTime(NOW + 5 * MINUTE);
    await t.mutation(cancelWindowInternal, { windowId: live });
    expect(await player.query(getState, {})).toMatchObject({ status: "closed", window: { windowId: live } });
    expect(await player.mutation(spin, { spinId: "x", wager: 10 })).toMatchObject({ code: "WINDOW_CLOSED" });
  });
});

describe("spins", () => {
  it("validates the wager, the balance, and the spin id", async () => {
    const t = createConvexTest();
    await openWindow(t);
    const { player } = await seedPlayer(t, { points: 5 });
    expect(await player.mutation(spin, { spinId: "a", wager: 15 })).toMatchObject({ code: "INVALID_WAGER" });
    expect(await player.mutation(spin, { spinId: "a", wager: 10.5 })).toMatchObject({ code: "INVALID_WAGER" });
    expect(await player.mutation(spin, { spinId: "a", wager: 10 })).toMatchObject({ code: "INSUFFICIENT_POINTS" });
    expect(await player.mutation(spin, { spinId: "  ", wager: 10 })).toMatchObject({ code: "INVALID_SPIN_ID" });
    expect(await player.mutation(spin, { spinId: "x".repeat(65), wager: 10 })).toMatchObject({ code: "INVALID_SPIN_ID" });
    expect(await spinRows(t)).toEqual([]);
  });

  it("pays a win into the real balance and keeps the ledger in step", async () => {
    const t = createConvexTest();
    const windowId = await openWindow(t);
    const { player, checkedInId } = await seedPlayer(t, { points: 100 });
    forceRandom(WIN);
    const result = await player.mutation(spin, { spinId: "spin-win", wager: 10 });
    expect(result).toMatchObject({
      status: "ok", spinId: "spin-win", outcome: "win", wager: 10, payout: 20, net: 10, previousPoints: 100, newPoints: 110,
    });
    const symbols = (result as { symbols: string[] }).symbols;
    expect(symbols).toHaveLength(4);
    expect(Math.max(...symbols.map((s) => symbols.filter((x) => x === s).length))).toBe(3);
    expect(await balanceOf(t, checkedInId!)).toBe(110);
    expect(await ledgerOf(t, checkedInId!)).toBe(110);
    expect(await spinRows(t)).toMatchObject([
      { checkedInId, windowId, spinId: "spin-win", wager: 10, payout: 20, pointsDelta: 10, outcome: "win", previousPoints: 100, newPoints: 110, createdAt: NOW },
    ]);
    expect(await t.run(async (ctx) => (await ctx.db.get(checkedInId!))?.pointsReachedAt)).toBe(NOW);
  });

  it("takes the wager on a loss, refunds on a push, and pays 5× on Zeus", async () => {
    const t = createConvexTest();
    await openWindow(t);
    const { player, checkedInId } = await seedPlayer(t, { points: 100 });

    forceRandom(LOSE);
    expect(await player.mutation(spin, { spinId: "l", wager: 25 })).toMatchObject({ outcome: "lose", payout: 0, net: -25, newPoints: 75 });
    vi.setSystemTime(NOW + 3000);
    forceRandom(PUSH);
    expect(await player.mutation(spin, { spinId: "p", wager: 25 })).toMatchObject({ outcome: "push", payout: 25, net: 0, newPoints: 75 });
    vi.setSystemTime(NOW + 6000);
    forceRandom(BIG);
    expect(await player.mutation(spin, { spinId: "b", wager: 50 })).toMatchObject({
      outcome: "big", symbols: ["zeus", "zeus", "zeus", "zeus"], payout: 250, net: 200, newPoints: 275,
    });
    expect(await balanceOf(t, checkedInId!)).toBe(275);
    expect(await ledgerOf(t, checkedInId!)).toBe(275);

    const state = await player.query(getState, {});
    expect(state).toMatchObject({ player: { balance: 275 }, wagers: [5, 10, 25, 50], defaultWager: 10, cooldownMs: 2000 });
    expect((state as { recentSpins: Array<{ spinId: string; outcome: string }> }).recentSpins.map((s) => [s.spinId, s.outcome]))
      .toEqual([["b", "big"], ["p", "push"], ["l", "lose"]]);
  });

  it("can bet down to exactly zero", async () => {
    const t = createConvexTest();
    await openWindow(t);
    const { player, checkedInId } = await seedPlayer(t, { points: 10 });
    forceRandom(LOSE);
    expect(await player.mutation(spin, { spinId: "all-in", wager: 10 })).toMatchObject({ newPoints: 0 });
    expect(await balanceOf(t, checkedInId!)).toBe(0);
    expect(await t.run((ctx) => ctx.db.get(checkedInId!))).not.toHaveProperty("pointsReachedAt");
  });

  it("returns the stored result for a repeated spin id without charging again", async () => {
    const t = createConvexTest();
    const windowId = await openWindow(t);
    const { player, checkedInId } = await seedPlayer(t, { points: 100 });
    forceRandom(LOSE);
    const first = await player.mutation(spin, { spinId: "same", wager: 10 });
    forceRandom(BIG);
    vi.setSystemTime(NOW + 10_000);
    expect(await player.mutation(spin, { spinId: "same", wager: 50 })).toEqual(first);
    await t.mutation(cancelWindowInternal, { windowId });
    expect(await player.mutation(spin, { spinId: "same", wager: 10 })).toEqual(first);
    expect(await spinRows(t)).toHaveLength(1);
    expect(await balanceOf(t, checkedInId!)).toBe(90);
  });

  it("enforces the 2 second cooldown between spins", async () => {
    const t = createConvexTest();
    await openWindow(t);
    const { player } = await seedPlayer(t, { points: 100 });
    forceRandom(LOSE);
    await player.mutation(spin, { spinId: "one", wager: 10 });
    vi.setSystemTime(NOW + 500);
    expect(await player.mutation(spin, { spinId: "two", wager: 10 })).toEqual({ status: "error", code: "COOLDOWN", retryAfterMs: 1500 });
    vi.setSystemTime(NOW + 2000);
    expect(await player.mutation(spin, { spinId: "two", wager: 10 })).toMatchObject({ status: "ok", newPoints: 80 });
  });

  it("keeps players' spins and balances separate", async () => {
    const t = createConvexTest();
    await openWindow(t);
    const a = await seedPlayer(t, { points: 100 });
    const b = await seedPlayer(t, { points: 50 });
    forceRandom(WIN);
    await a.player.mutation(spin, { spinId: "shared-id", wager: 10 });
    await b.player.mutation(spin, { spinId: "shared-id", wager: 10 });
    expect(await balanceOf(t, a.checkedInId!)).toBe(110);
    expect(await balanceOf(t, b.checkedInId!)).toBe(60);
    expect((await b.player.query(getState, {}) as { recentSpins: unknown[] }).recentSpins).toHaveLength(1);
  });
});
