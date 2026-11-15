/**
 * The single place arcade games change points. A game mutation:
 *
 *   1. `beginPlay`     — who is playing; same playId again? (return that result,
 *                        charge nothing); is the arcade open and the game on?
 *   2. `cooldownLeft`  — too soon after this player's last play of this game?
 *   3. decides the result on the server
 *   4. `applyPlay`     — logs the play and updates checkedIn.points
 *
 * all inside one Convex mutation, so it is one transaction: two plays at once
 * (two tabs, or a spin while the shop deducts) run as if one after the other,
 * and the later one re-runs on the newer balance. Points can't be lost or
 * spent twice, and the balance never goes below 0.
 */
import type { DocumentByName } from "convex/server";
import type { DataModel, MutationCtx, QueryCtx } from "../lib/dataModel";
import { assertPointBalance } from "../../shared/admin/volunteerRules";
import { computeLedgerPoints, pointBalancePatch } from "../admin/pointsLedger";
import { normalizePlayId, type ArcadeGameKey, type ArcadePlayErrorCode } from "../../shared/arcade/rules";
import { gameGate, loadPlayer, playerProblem, type CheckedInDoc } from "./access";

export type PlayDoc = DocumentByName<DataModel, "arcadePlays">;

/** The stored play for this idempotency key, if any. */
export async function findPlay(ctx: QueryCtx | MutationCtx, checkedIn: CheckedInDoc, game: ArcadeGameKey, playId: string) {
  return ctx.db
    .query("arcadePlays")
    .withIndex("by_checkedIn_game_playId", (q) => q.eq("checkedInId", checkedIn._id).eq("game", game).eq("playId", playId))
    .first();
}

export type BeganPlay =
  | { kind: "new"; checkedIn: CheckedInDoc; playId: string }
  | { kind: "replay"; checkedIn: CheckedInDoc; play: PlayDoc }
  | { kind: "error"; code: ArcadePlayErrorCode };

/**
 * Start of every play. Order matters:
 *   - identity first (a stranger learns nothing about anyone's plays);
 *   - then the replay check, before the open/closed gate, so a retry of a
 *     play that already committed still gets its result after the arcade
 *     closes (it was charged; it must be shown);
 *   - then the arcade switch and the game switch.
 */
export async function beginPlay(ctx: MutationCtx, game: ArcadeGameKey, rawPlayId: unknown, now: number): Promise<BeganPlay> {
  const player = await loadPlayer(ctx);
  const problem = playerProblem(player);
  if (problem) return { kind: "error", code: problem };
  const checkedIn = player.checkedIn!;
  const playId = normalizePlayId(rawPlayId);
  if (!playId) return { kind: "error", code: "INVALID_PLAY_ID" };
  const existing = await findPlay(ctx, checkedIn, game, playId);
  if (existing) return { kind: "replay", checkedIn, play: existing };
  const { code } = await gameGate(ctx, game, now);
  if (code) return { kind: "error", code };
  return { kind: "new", checkedIn, playId };
}

/** Milliseconds until this player may play `game` again (0 = now). Server clock. */
export async function cooldownLeft(ctx: MutationCtx, checkedIn: CheckedInDoc, game: ArcadeGameKey, cooldownMs: number, now: number) {
  const last = await ctx.db
    .query("arcadePlays")
    .withIndex("by_checkedIn_game_createdAt", (q) => q.eq("checkedInId", checkedIn._id).eq("game", game))
    .order("desc")
    .first();
  if (!last) return 0;
  // A play stamped in the future (clock skew between servers) still counts as just now.
  const since = Math.max(0, now - last.createdAt);
  return since < cooldownMs ? cooldownMs - since : 0;
}

/** Current balance; rows from before the cached field fall back to the ledger. */
export async function currentPoints(ctx: MutationCtx, checkedIn: CheckedInDoc) {
  return assertPointBalance(checkedIn.points ?? (await computeLedgerPoints(ctx, checkedIn._id)));
}

const isPoints = (value: number) => Number.isSafeInteger(value) && value >= 0;

export type ApplyPlayInput = {
  checkedIn: CheckedInDoc;
  game: ArcadeGameKey;
  playId: string;
  /** Points taken for this play (> 0). */
  stake: number;
  /** Points given back, stake included (0 = lost everything). */
  payout: number;
  now: number;
};

export type ApplyPlayResult =
  | { ok: true; play: PlayDoc }
  | { ok: false; code: "INVALID_STAKE" | "INSUFFICIENT_POINTS" };

/**
 * Takes the stake, adds the payout, writes the `arcadePlays` row and the new
 * balance. Refuses a bad stake or one bigger than the balance; nothing is
 * written then. Throws (rolling back the whole mutation) only on corrupt data.
 */
export async function applyPlay(ctx: MutationCtx, input: ApplyPlayInput): Promise<ApplyPlayResult> {
  const { checkedIn, game, playId, stake, payout, now } = input;
  if (!isPoints(stake) || stake === 0) return { ok: false, code: "INVALID_STAKE" };
  if (!isPoints(payout)) throw new Error(`arcade: ${game} produced an invalid payout`);
  const previousPoints = await currentPoints(ctx, checkedIn);
  if (previousPoints < stake) return { ok: false, code: "INSUFFICIENT_POINTS" };
  const pointsDelta = payout - stake;
  const newPoints = assertPointBalance(previousPoints + pointsDelta);
  const id = await ctx.db.insert("arcadePlays", {
    checkedInId: checkedIn._id,
    game,
    playId,
    stake,
    payout,
    pointsDelta,
    previousPoints,
    newPoints,
    createdAt: now,
  });
  await ctx.db.patch(checkedIn._id, pointBalancePatch(previousPoints, newPoints, now));
  return { ok: true, play: (await ctx.db.get(id))! };
}
