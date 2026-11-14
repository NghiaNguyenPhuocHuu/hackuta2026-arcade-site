import { makeFunctionReference } from "convex/server";
import type { GenericId } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createConvexTest } from "../helpers/convexTestContext";
import { expectAdminErrorCode } from "../helpers/adminErrors";
import { seedStaff } from "../helpers/reviewTestKit";

const createWindow = makeFunctionReference<"mutation">("admin/slotWindows:createSlotWindow");
const updateWindow = makeFunctionReference<"mutation">("admin/slotWindows:updateSlotWindow");
const cancelWindow = makeFunctionReference<"mutation">("admin/slotWindows:cancelSlotWindow");
const listWindows = makeFunctionReference<"query">("admin/slotWindows:listSlotWindows");
const createInternal = makeFunctionReference<"mutation">("admin/slotWindows:createSlotWindowInternal");
const cancelInternal = makeFunctionReference<"mutation">("admin/slotWindows:cancelSlotWindowInternal");

const NOW = Date.UTC(2026, 10, 14, 19);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => vi.useRealTimers());

const NO_THROW = Symbol("no throw");
async function expectSlotError(run: Promise<unknown>, code: string) {
  let caught: unknown = NO_THROW;
  try {
    await run;
  } catch (error) {
    caught = error;
  }
  expect(caught, `expected ${code}`).not.toBe(NO_THROW);
  expect((caught as { data?: { code?: string } }).data?.code, String(caught)).toBe(code);
}

describe("organizer minigame windows", () => {
  it("lets admins create, edit, cancel, and list windows with an audit trail", async () => {
    const t = createConvexTest();
    const admin = await seedStaff(t);
    const { windowId } = await t.mutation(createWindow, {
      sessionToken: admin.sessionToken, opensAt: NOW + HOUR, closesAt: NOW + 2 * HOUR, label: "  Night one  ",
    });
    expect(await t.run((ctx) => ctx.db.get(windowId as GenericId<"slotWindows">))).toMatchObject({
      opensAt: NOW + HOUR, closesAt: NOW + 2 * HOUR, label: "Night one", createdBy: admin.adminId,
    });

    await t.mutation(updateWindow, {
      sessionToken: admin.sessionToken, windowId, opensAt: NOW + 30 * MINUTE, closesAt: NOW + 2 * HOUR,
    });
    expect(await t.query(listWindows, { sessionToken: admin.sessionToken })).toMatchObject([
      { windowId, opensAt: NOW + 30 * MINUTE, label: null, status: "scheduled" },
    ]);

    vi.setSystemTime(NOW + HOUR);
    await expectSlotError(t.mutation(updateWindow, {
      sessionToken: admin.sessionToken, windowId, opensAt: NOW + 50 * MINUTE, closesAt: NOW + 2 * HOUR,
    }), "SLOT_WINDOW_NOT_EDITABLE");
    await t.mutation(updateWindow, {
      sessionToken: admin.sessionToken, windowId, opensAt: NOW + 30 * MINUTE, closesAt: NOW + 3 * HOUR,
    });
    await t.mutation(cancelWindow, { sessionToken: admin.sessionToken, windowId });
    await expectSlotError(t.mutation(cancelWindow, { sessionToken: admin.sessionToken, windowId }), "SLOT_WINDOW_NOT_EDITABLE");
    expect(await t.query(listWindows, { sessionToken: admin.sessionToken })).toMatchObject([
      { windowId, status: "cancelled", cancelledAt: NOW + HOUR },
    ]);

    const logs = await t.run((ctx) => ctx.db.query("staffConfigLogs").collect());
    expect(logs.map((log) => log.action)).toEqual([
      "slot_window_created", "slot_window_updated", "slot_window_updated", "slot_window_cancelled",
    ]);
    for (const log of logs) expect(log).toMatchObject({ actorAdminId: admin.adminId, targetSlotWindowId: windowId });
  });

  it("is admin-only", async () => {
    const t = createConvexTest();
    const volunteer = await seedStaff(t, { role: "volunteer" });
    const args = { opensAt: NOW + HOUR, closesAt: NOW + 2 * HOUR };
    await expectAdminErrorCode(t.mutation(createWindow, { sessionToken: volunteer.sessionToken, ...args }), "NOT_AUTHORIZED");
    await expectAdminErrorCode(t.mutation(createWindow, { sessionToken: "f".repeat(64), ...args }), "NOT_AUTHENTICATED");
    await expectAdminErrorCode(t.query(listWindows, { sessionToken: volunteer.sessionToken }), "NOT_AUTHORIZED");
    expect(await t.run((ctx) => ctx.db.query("slotWindows").collect())).toEqual([]);
  });

  it("validates times, length, and overlap", async () => {
    const t = createConvexTest();
    const admin = await seedStaff(t);
    const s = admin.sessionToken;
    await expectSlotError(t.mutation(createWindow, { sessionToken: s, opensAt: NOW + HOUR, closesAt: NOW + HOUR }), "SLOT_WINDOW_INVALID");
    await expectSlotError(t.mutation(createWindow, { sessionToken: s, opensAt: NOW - 2 * HOUR, closesAt: NOW - HOUR }), "SLOT_WINDOW_INVALID");
    await expectSlotError(t.mutation(createWindow, { sessionToken: s, opensAt: NOW, closesAt: NOW + 7 * HOUR }), "SLOT_WINDOW_TOO_LONG");
    await expectSlotError(t.mutation(createWindow, { sessionToken: s, opensAt: NOW, closesAt: NOW + HOUR, label: "x".repeat(81) }), "SLOT_WINDOW_INVALID");

    const { windowId } = await t.mutation(createWindow, { sessionToken: s, opensAt: NOW + HOUR, closesAt: NOW + 2 * HOUR });
    await expectSlotError(t.mutation(createWindow, { sessionToken: s, opensAt: NOW + 90 * MINUTE, closesAt: NOW + 3 * HOUR }), "SLOT_WINDOW_OVERLAP");
    // Back-to-back windows are fine.
    await t.mutation(createWindow, { sessionToken: s, opensAt: NOW + 2 * HOUR, closesAt: NOW + 3 * HOUR });
    // A cancelled window no longer blocks its slot.
    await t.mutation(cancelWindow, { sessionToken: s, windowId });
    await t.mutation(createWindow, { sessionToken: s, opensAt: NOW + HOUR, closesAt: NOW + 2 * HOUR });
    expect(await t.run((ctx) => ctx.db.query("slotWindows").collect())).toHaveLength(3);
  });

  it("supports CLI create and cancel without an admin session", async () => {
    const t = createConvexTest();
    const { windowId } = await t.mutation(createInternal, { opensAt: NOW, closesAt: NOW + HOUR, label: "CLI" });
    const row = await t.run((ctx) => ctx.db.get(windowId as GenericId<"slotWindows">));
    expect(row).toMatchObject({ label: "CLI" });
    expect(row).not.toHaveProperty("createdBy");
    await expectSlotError(t.mutation(createInternal, { opensAt: NOW + 30 * MINUTE, closesAt: NOW + 2 * HOUR }), "SLOT_WINDOW_OVERLAP");
    await t.mutation(cancelInternal, { windowId });
    await expectSlotError(t.mutation(cancelInternal, { windowId }), "SLOT_WINDOW_NOT_EDITABLE");
    expect(await t.run((ctx) => ctx.db.query("staffConfigLogs").collect())).toEqual([]);
  });
});
