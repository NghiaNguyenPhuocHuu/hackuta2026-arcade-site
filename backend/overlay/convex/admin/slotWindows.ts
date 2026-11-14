/**
 * Points minigame (Olympus Slots) play windows.
 *
 * Public exports are administrator-only and call `requireAdminRole` first.
 * The `*Internal` mutations are for organizers running the Convex CLI
 * (`npx convex run admin/slotWindows:createSlotWindowInternal ...`); they are
 * not callable from clients.
 *
 * A window is scheduled, live, or ended by its times and the server clock;
 * only cancellation is stored. Spins are allowed only while a window is live.
 */
import type { DocumentByName } from "convex/server";
import { v, type GenericId } from "convex/values";
import { internalMutation, mutation, query } from "../_generated/server";
import type { DataModel, MutationCtx, QueryCtx } from "../lib/dataModel";
import {
  SLOT_CLOSED_GRACE_MS,
  assertSlotWindowTimes,
  normalizeSlotWindowLabel,
  slotWindowError,
} from "../../shared/admin/slotRules";
import { requireAdminRole, sessionTokenArgs } from "./staffAuth";

/** Most windows one listing returns. */
export const MAX_SLOT_WINDOWS = 200;

type WindowDoc = DocumentByName<DataModel, "slotWindows">;
type WindowId = GenericId<"slotWindows">;
type AdminId = GenericId<"admins">;
export type SlotWindowStatus = "scheduled" | "live" | "ended" | "cancelled";
export type SlotGameStatus = "none" | "teaser" | "live" | "closed";

export function slotWindowStatus(window: Pick<WindowDoc, "opensAt" | "closesAt" | "cancelledAt">, now: number): SlotWindowStatus {
  if (window.cancelledAt !== undefined) return "cancelled";
  if (now < window.opensAt) return "scheduled";
  if (now < window.closesAt) return "live";
  return "ended";
}

/**
 * What hackers see right now:
 *   live   — a non-cancelled window contains `now`
 *   teaser — otherwise, the soonest non-cancelled window that opens later
 *   closed — otherwise, a window that was live ended (or was cancelled while live) in the last 12h
 *   none   — nothing scheduled or recently played
 */
export async function findGameWindow(ctx: QueryCtx | MutationCtx, now: number): Promise<{ status: SlotGameStatus; window: WindowDoc | null }> {
  const recent = await ctx.db
    .query("slotWindows")
    .withIndex("by_closesAt", (q) => q.gt("closesAt", now - SLOT_CLOSED_GRACE_MS))
    .take(MAX_SLOT_WINDOWS);

  const live = recent.find((w) => slotWindowStatus(w, now) === "live");
  if (live) return { status: "live", window: live };

  const upcoming = recent
    .filter((w) => slotWindowStatus(w, now) === "scheduled")
    .sort((a, b) => a.opensAt - b.opensAt)[0];
  if (upcoming) return { status: "teaser", window: upcoming };

  const endedAt = (w: WindowDoc) => (w.cancelledAt !== undefined ? w.cancelledAt : w.closesAt);
  const ended = recent
    .filter((w) => {
      if (w.cancelledAt !== undefined) return w.cancelledAt >= w.opensAt && w.cancelledAt > now - SLOT_CLOSED_GRACE_MS;
      return w.closesAt <= now;
    })
    .sort((a, b) => endedAt(b) - endedAt(a))[0];
  if (ended) return { status: "closed", window: ended };

  return { status: "none", window: null };
}

async function hasOverlappingWindow(ctx: MutationCtx, opensAt: number, closesAt: number, ignoreId?: WindowId) {
  const candidates = await ctx.db
    .query("slotWindows")
    .withIndex("by_closesAt", (q) => q.gt("closesAt", opensAt))
    .take(MAX_SLOT_WINDOWS);
  return candidates.some((w) => w._id !== ignoreId && w.cancelledAt === undefined && w.opensAt < closesAt);
}

type WindowInput = { opensAt: number; closesAt: number; label?: string };

async function validateWindow(ctx: MutationCtx, input: WindowInput, now: number, ignoreId?: WindowId) {
  assertSlotWindowTimes(input.opensAt, input.closesAt, now);
  const label = normalizeSlotWindowLabel(input.label);
  if (await hasOverlappingWindow(ctx, input.opensAt, input.closesAt, ignoreId)) {
    throw slotWindowError("SLOT_WINDOW_OVERLAP");
  }
  return { opensAt: input.opensAt, closesAt: input.closesAt, label };
}

async function insertWindow(ctx: MutationCtx, input: WindowInput, createdBy: AdminId | undefined) {
  const now = Date.now();
  const valid = await validateWindow(ctx, input, now);
  const windowId = await ctx.db.insert("slotWindows", {
    opensAt: valid.opensAt,
    closesAt: valid.closesAt,
    ...(valid.label ? { label: valid.label } : {}),
    ...(createdBy ? { createdBy } : {}),
    createdAt: now,
    updatedAt: now,
  });
  return { windowId, now };
}

async function cancelWindow(ctx: MutationCtx, windowId: WindowId, cancelledBy: AdminId | undefined) {
  const window = await ctx.db.get(windowId);
  if (!window) throw slotWindowError("SLOT_WINDOW_NOT_FOUND");
  const now = Date.now();
  const status = slotWindowStatus(window, now);
  if (status === "cancelled" || status === "ended") throw slotWindowError("SLOT_WINDOW_NOT_EDITABLE");
  await ctx.db.patch(windowId, {
    cancelledAt: now,
    ...(cancelledBy ? { cancelledBy } : {}),
    updatedAt: now,
  });
  return now;
}

/** Audit row. No `details`: `buildStaffConfigDetails` only accepts a fixed set of field names. */
function logWindow(
  ctx: MutationCtx,
  actorAdminId: AdminId,
  action: "slot_window_created" | "slot_window_updated" | "slot_window_cancelled",
  windowId: WindowId,
  now: number,
) {
  return ctx.db.insert("staffConfigLogs", {
    actorAdminId,
    action,
    targetSlotWindowId: windowId,
    createdAt: now,
  });
}

function toListRow(window: WindowDoc, now: number) {
  return {
    windowId: window._id,
    opensAt: window.opensAt,
    closesAt: window.closesAt,
    label: window.label ?? null,
    status: slotWindowStatus(window, now),
    cancelledAt: window.cancelledAt ?? null,
    createdAt: window.createdAt,
  };
}

const windowFieldArgs = {
  opensAt: v.number(),
  closesAt: v.number(),
  label: v.optional(v.string()),
};

/** Schedules a window. It may open now or later, must end in the future, and may not overlap another. */
export const createSlotWindow = mutation({
  args: { ...sessionTokenArgs, ...windowFieldArgs },
  handler: async (ctx, { sessionToken, ...input }) => {
    const actor = await requireAdminRole(ctx, sessionToken);
    const { windowId, now } = await insertWindow(ctx, input, actor._id);
    await logWindow(ctx, actor._id, "slot_window_created", windowId, now);
    return { windowId };
  },
});

/** Changes a scheduled or live window. Once live, the opening time is fixed; only the close time and label can change. */
export const updateSlotWindow = mutation({
  args: { ...sessionTokenArgs, windowId: v.id("slotWindows"), ...windowFieldArgs },
  handler: async (ctx, { sessionToken, windowId, ...input }) => {
    const actor = await requireAdminRole(ctx, sessionToken);
    const window = await ctx.db.get(windowId);
    if (!window) throw slotWindowError("SLOT_WINDOW_NOT_FOUND");
    const now = Date.now();
    const status = slotWindowStatus(window, now);
    if (status === "cancelled" || status === "ended") throw slotWindowError("SLOT_WINDOW_NOT_EDITABLE");
    if (status === "live" && input.opensAt !== window.opensAt) throw slotWindowError("SLOT_WINDOW_NOT_EDITABLE");
    const valid = await validateWindow(ctx, input, now, windowId);
    await ctx.db.patch(windowId, {
      opensAt: valid.opensAt,
      closesAt: valid.closesAt,
      label: valid.label,
      updatedAt: now,
    });
    await logWindow(ctx, actor._id, "slot_window_updated", windowId, now);
    return { ok: true as const };
  },
});

/** Ends a scheduled or live window for everyone, immediately. */
export const cancelSlotWindow = mutation({
  args: { ...sessionTokenArgs, windowId: v.id("slotWindows") },
  handler: async (ctx, { sessionToken, windowId }) => {
    const actor = await requireAdminRole(ctx, sessionToken);
    const now = await cancelWindow(ctx, windowId, actor._id);
    await logWindow(ctx, actor._id, "slot_window_cancelled", windowId, now);
    return { ok: true as const };
  },
});

/** Every window, newest first, with its status. */
export const listSlotWindows = query({
  args: { ...sessionTokenArgs },
  handler: async (ctx, { sessionToken }) => {
    await requireAdminRole(ctx, sessionToken);
    const now = Date.now();
    const rows = await ctx.db.query("slotWindows").withIndex("by_opensAt").order("desc").take(MAX_SLOT_WINDOWS);
    return rows.map((row) => toListRow(row, now));
  },
});

/** CLI: schedule a window without an admin session. Same validation as `createSlotWindow`. */
export const createSlotWindowInternal = internalMutation({
  args: windowFieldArgs,
  handler: async (ctx, input) => {
    const { windowId } = await insertWindow(ctx, input, undefined);
    return { windowId };
  },
});

/** CLI: cancel a window without an admin session. */
export const cancelSlotWindowInternal = internalMutation({
  args: { windowId: v.id("slotWindows") },
  handler: async (ctx, { windowId }) => {
    await cancelWindow(ctx, windowId, undefined);
    return { ok: true as const };
  },
});
