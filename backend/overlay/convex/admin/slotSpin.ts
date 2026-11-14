/**
 * Points minigame (Olympus Slots) — hacker-facing game state and spins.
 *
 * Lives in admin (like `participantShop.ts`) so the whole points system is
 * tested in one place; synced to profile with the rest of the backend.
 *
 * Every call needs a signed-in applicant account (Convex Auth). A spin is only
 * allowed for an accepted, checked-in participant while a window is live; the
 * server rolls the outcome and writes the balance change in one transaction.
 * Expected refusals come back as `{ status: "error", code }` instead of
 * throwing, so the minigame can show them in-game.
 */
import type { DocumentByName } from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { getAuthUser } from "../lib/applications";
import type { DataModel, MutationCtx, QueryCtx } from "../lib/dataModel";
import { assertPointBalance } from "../../shared/admin/volunteerRules";
import {
  SLOT_DEFAULT_WAGER,
  SLOT_SPIN_COOLDOWN_MS,
  SLOT_SPIN_ID_MAX_LENGTH,
  SLOT_WAGERS,
  isAllowedWager,
  payoutFor,
  rollOutcome,
  symbolsFor,
  type RandomFn,
} from "../../shared/admin/slotRules";
import { checkedInForParticipant } from "./checkedInLookup";
import { isParticipantEligible, pointBalancePatch } from "./pointsLedger";
import { findGameWindow } from "./slotWindows";

/** Spins listed in the game state. */
export const SLOT_RECENT_SPINS = 5;

type SpinDoc = DocumentByName<DataModel, "slotSpins">;

export type SlotSpinErrorCode =
  | "NOT_SIGNED_IN"
  | "NOT_PARTICIPANT"
  | "NOT_ELIGIBLE"
  | "NOT_CHECKED_IN"
  | "INVALID_SPIN_ID"
  | "WINDOW_CLOSED"
  | "INVALID_WAGER"
  | "INSUFFICIENT_POINTS"
  | "COOLDOWN";

/** Uniform [0, 1) from Web Crypto when the runtime has it, else Math.random. */
const serverRandom: RandomFn = () => {
  const webCrypto = (globalThis as { crypto?: { getRandomValues?: (array: Uint32Array) => Uint32Array } }).crypto;
  if (webCrypto?.getRandomValues) {
    const buffer = new Uint32Array(1);
    webCrypto.getRandomValues(buffer);
    return buffer[0]! / 2 ** 32;
  }
  return Math.random();
};

function spinError(code: SlotSpinErrorCode, extra: { retryAfterMs?: number } = {}) {
  return { status: "error" as const, code, ...extra };
}

function spinResult(row: SpinDoc) {
  return {
    status: "ok" as const,
    spinId: row.spinId,
    outcome: row.outcome,
    symbols: row.symbols,
    wager: row.wager,
    payout: row.payout,
    net: row.pointsDelta,
    previousPoints: row.previousPoints,
    newPoints: row.newPoints,
  };
}

function recentRow(row: SpinDoc) {
  return {
    spinId: row.spinId,
    wager: row.wager,
    payout: row.payout,
    net: row.pointsDelta,
    outcome: row.outcome,
    symbols: row.symbols,
    createdAt: row.createdAt,
  };
}

/** The signed-in user's participant, eligibility, and check-in row. Null user when signed out. */
async function myPlayer(ctx: QueryCtx | MutationCtx) {
  const user = await getAuthUser(ctx);
  if (!user) return { user: null, participant: null, eligible: false, checkedIn: null };
  const participant = await ctx.db
    .query("participants")
    .withIndex("by_auth_user", (q) => q.eq("authUserId", user._id))
    .unique();
  if (!participant) return { user, participant: null, eligible: false, checkedIn: null };
  const eligible = await isParticipantEligible(ctx, participant);
  const checkedIn = await checkedInForParticipant(ctx, participant._id);
  return { user, participant, eligible, checkedIn };
}

/**
 * Window status, the caller's balance, and their last spins. Null when signed
 * out. `nowBucket` only changes the cache key so clients re-run the query as
 * windows open and close; the server clock decides the status.
 */
export const getMyGameState = query({
  args: { nowBucket: v.optional(v.number()) },
  handler: async (ctx) => {
    const { user, participant, eligible, checkedIn } = await myPlayer(ctx);
    if (!user) return null;
    const now = Date.now();
    const { status, window } = await findGameWindow(ctx, now);
    const spins = checkedIn
      ? await ctx.db
        .query("slotSpins")
        .withIndex("by_checkedIn_createdAt", (q) => q.eq("checkedInId", checkedIn._id))
        .order("desc")
        .take(SLOT_RECENT_SPINS)
      : [];
    return {
      status,
      window: window
        ? { windowId: window._id, opensAt: window.opensAt, closesAt: window.closesAt }
        : null,
      serverNow: now,
      player: {
        participant: participant !== null,
        eligible,
        checkedIn: checkedIn !== null,
        balance: checkedIn ? checkedIn.points : null,
      },
      wagers: [...SLOT_WAGERS],
      defaultWager: SLOT_DEFAULT_WAGER,
      cooldownMs: SLOT_SPIN_COOLDOWN_MS,
      recentSpins: spins.map(recentRow),
    };
  },
});

/**
 * One spin. `spinId` is the client's idempotency key: repeating it returns the
 * stored result without charging again. The wager is taken and the payout
 * added in this transaction; `pointsDelta` (payout − wager) feeds
 * `computeLedgerPoints`.
 */
export const spin = mutation({
  args: { spinId: v.string(), wager: v.number() },
  handler: async (ctx, { spinId, wager }) => {
    const { user, participant, eligible, checkedIn } = await myPlayer(ctx);
    if (!user) return spinError("NOT_SIGNED_IN");
    if (!participant) return spinError("NOT_PARTICIPANT");
    if (!eligible) return spinError("NOT_ELIGIBLE");
    if (!checkedIn) return spinError("NOT_CHECKED_IN");

    const key = spinId.trim();
    if (!key || key.length > SLOT_SPIN_ID_MAX_LENGTH) return spinError("INVALID_SPIN_ID");
    const existing = await ctx.db
      .query("slotSpins")
      .withIndex("by_checkedIn_spinId", (q) => q.eq("checkedInId", checkedIn._id).eq("spinId", key))
      .first();
    if (existing) return spinResult(existing);

    const now = Date.now();
    const { status, window } = await findGameWindow(ctx, now);
    if (status !== "live" || !window) return spinError("WINDOW_CLOSED");
    if (!isAllowedWager(wager)) return spinError("INVALID_WAGER");

    const previousPoints = assertPointBalance(checkedIn.points ?? 0);
    if (previousPoints < wager) return spinError("INSUFFICIENT_POINTS");

    const last = await ctx.db
      .query("slotSpins")
      .withIndex("by_checkedIn_createdAt", (q) => q.eq("checkedInId", checkedIn._id))
      .order("desc")
      .first();
    if (last && now - last.createdAt < SLOT_SPIN_COOLDOWN_MS) {
      return spinError("COOLDOWN", { retryAfterMs: SLOT_SPIN_COOLDOWN_MS - (now - last.createdAt) });
    }

    const outcome = rollOutcome(serverRandom);
    const symbols = symbolsFor(outcome.id, serverRandom);
    const payout = payoutFor(wager, outcome);
    const pointsDelta = payout - wager;
    const newPoints = assertPointBalance(previousPoints + pointsDelta);

    const spinRowId = await ctx.db.insert("slotSpins", {
      checkedInId: checkedIn._id,
      windowId: window._id,
      spinId: key,
      wager,
      payout,
      pointsDelta,
      outcome: outcome.id,
      symbols,
      previousPoints,
      newPoints,
      createdAt: now,
    });
    await ctx.db.patch(checkedIn._id, pointBalancePatch(previousPoints, newPoints, now));
    const row = await ctx.db.get(spinRowId);
    return spinResult(row!);
  },
});
