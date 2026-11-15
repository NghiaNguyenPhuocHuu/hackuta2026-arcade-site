/**
 * Admin switches for the arcade: the site switch (off / scheduled / on),
 * launch codes, backup sign-in, and each game's on/off switch.
 *
 * Public exports are administrator-only (`requireAdminRole` first) and write
 * an audit row to `staffConfigLogs`. The `*Internal` versions are for
 * organizers on the Convex CLI (`npx convex run arcade/admin:...Internal`);
 * clients can't call them.
 */
import { ConvexError, v, type GenericId } from "convex/values";
import { internalMutation, mutation, query } from "../_generated/server";
import type { MutationCtx } from "../lib/dataModel";
import { requireAdminRole, sessionTokenArgs } from "../admin/staffAuth";
import {
  ARCADE_GAMES,
  ARCADE_SETTINGS_ERROR_MESSAGES,
  checkArcadeSettings,
  isArcadeGameKey,
  type ArcadeSettingsErrorCode,
} from "../../shared/arcade/rules";
import { gameRow, loadArcade, loadGames, settingsRow, DEFAULT_SETTINGS } from "./access";

type AdminId = GenericId<"admins">;

function settingsError(code: ArcadeSettingsErrorCode) {
  return new ConvexError({ code, message: ARCADE_SETTINGS_ERROR_MESSAGES[code] });
}

const settingsArgs = {
  mode: v.union(v.literal("off"), v.literal("scheduled"), v.literal("on")),
  opensAt: v.optional(v.union(v.number(), v.null())),
  closesAt: v.optional(v.union(v.number(), v.null())),
  launchEnabled: v.optional(v.boolean()),
  backupSignIn: v.optional(v.boolean()),
};

type SettingsArgs = {
  mode: "off" | "scheduled" | "on";
  opensAt?: number | null;
  closesAt?: number | null;
  launchEnabled?: boolean;
  backupSignIn?: boolean;
};

/** Writes the one settings row (creates it the first time). Unset switches keep their value. */
async function writeSettings(ctx: MutationCtx, input: SettingsArgs, actor: AdminId | undefined) {
  const now = Date.now();
  const checked = checkArcadeSettings(input, now);
  if (!checked.ok) throw settingsError(checked.code);
  const row = await settingsRow(ctx);
  const { mode, opensAt, closesAt } = checked.value;
  const next = {
    mode,
    ...(opensAt !== undefined ? { opensAt } : {}),
    ...(closesAt !== undefined ? { closesAt } : {}),
    launchEnabled: input.launchEnabled ?? row?.launchEnabled ?? DEFAULT_SETTINGS.launchEnabled,
    backupSignIn: input.backupSignIn ?? row?.backupSignIn ?? DEFAULT_SETTINGS.backupSignIn,
    ...(actor ? { updatedBy: actor } : {}),
    updatedAt: now,
  };
  if (row) await ctx.db.replace(row._id, { key: "arcade", ...next });
  else await ctx.db.insert("arcadeSettings", { key: "arcade", ...next });
  if (actor) await ctx.db.insert("staffConfigLogs", { actorAdminId: actor, action: "arcade_settings_updated", createdAt: now });
  return now;
}

const gameArgs = { key: v.string(), enabled: v.boolean() };

async function writeGame(ctx: MutationCtx, input: { key: string; enabled: boolean }, actor: AdminId | undefined) {
  if (!isArcadeGameKey(input.key)) throw settingsError("ARCADE_UNKNOWN_GAME");
  const known = ARCADE_GAMES.find((game) => game.key === input.key)!;
  const now = Date.now();
  const row = await gameRow(ctx, input.key);
  if (row) await ctx.db.patch(row._id, { enabled: input.enabled, updatedBy: actor, updatedAt: now }); // CLI clears updatedBy
  else
    await ctx.db.insert("arcadeGames", {
      key: known.key,
      name: known.name,
      order: known.order,
      enabled: input.enabled,
      ...(actor ? { updatedBy: actor } : {}),
      updatedAt: now,
    });
  if (actor) {
    await ctx.db.insert("staffConfigLogs", {
      actorAdminId: actor,
      action: "arcade_game_updated",
      targetArcadeGameKey: known.key,
      createdAt: now,
    });
  }
}

/** The admin tab: stored settings, how they read now, and every game's switch. */
export const getArcadeAdmin = query({
  args: { ...sessionTokenArgs },
  handler: async (ctx, { sessionToken }) => {
    await requireAdminRole(ctx, sessionToken);
    const now = Date.now();
    const { settings, state } = await loadArcade(ctx, now);
    return { serverNow: now, settings, state, games: await loadGames(ctx) };
  },
});

/** Changes the site switch. Leaving `launchEnabled` / `backupSignIn` out keeps them as they are. */
export const updateArcadeSettings = mutation({
  args: { ...sessionTokenArgs, ...settingsArgs },
  handler: async (ctx, { sessionToken, ...input }) => {
    const actor = await requireAdminRole(ctx, sessionToken);
    await writeSettings(ctx, input, actor._id);
    return { ok: true as const };
  },
});

/** Switches one game on or off. */
export const updateArcadeGame = mutation({
  args: { ...sessionTokenArgs, ...gameArgs },
  handler: async (ctx, { sessionToken, ...input }) => {
    const actor = await requireAdminRole(ctx, sessionToken);
    await writeGame(ctx, input, actor._id);
    return { ok: true as const };
  },
});

/** CLI: change the site switch without an admin session. Same checks. */
export const updateArcadeSettingsInternal = internalMutation({
  args: settingsArgs,
  handler: async (ctx, input) => {
    await writeSettings(ctx, input, undefined);
    return { ok: true as const };
  },
});

/** CLI: switch one game on or off without an admin session. */
export const updateArcadeGameInternal = internalMutation({
  args: gameArgs,
  handler: async (ctx, input) => {
    await writeGame(ctx, input, undefined);
    return { ok: true as const };
  },
});
