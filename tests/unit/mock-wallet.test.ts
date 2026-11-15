import { beforeEach, describe, expect, it } from "vitest";
import { getMockWallet, mockTransfer, mockWalletPort, resetMockWallet } from "../../src/arcade/mockWallet";

const fast = { latencyMs: 0, now: () => 1_000 };

beforeEach(() => resetMockWallet());

describe("mock wallet (deposit / withdraw)", () => {
  it("starts with profile points and an empty arcade wallet", () => {
    expect(getMockWallet()).toMatchObject({ profilePoints: 200, balance: 0, transfers: [] });
  });

  it("deposits and withdraws with a log, like the server", async () => {
    expect(await mockTransfer("deposit", 50, "d1", fast)).toMatchObject({
      status: "ok",
      transfer: { kind: "deposit", amount: 50, profileBefore: 200, profileAfter: 150, arcadeBefore: 0, arcadeAfter: 50 },
    });
    expect(await mockTransfer("withdraw", 20, "w1", fast)).toMatchObject({ status: "ok", transfer: { profileAfter: 170, arcadeAfter: 30 } });
    expect(getMockWallet()).toMatchObject({ profilePoints: 170, balance: 30 });
    expect(getMockWallet().transfers.map((t) => t.transferId)).toEqual(["w1", "d1"]);
  });

  it("refuses what the server refuses, and never moves points twice for one id", async () => {
    expect(await mockTransfer("deposit", 201, "x", fast)).toEqual({ status: "error", code: "INSUFFICIENT_POINTS" });
    expect(await mockTransfer("withdraw", 1, "y", fast)).toEqual({ status: "error", code: "INSUFFICIENT_ARCADE_POINTS" });
    expect(await mockTransfer("deposit", 2.5, "z", fast)).toEqual({ status: "error", code: "INVALID_AMOUNT" });
    expect(await mockTransfer("deposit", 10, "closed", { ...fast, arcadeOpen: false })).toEqual({ status: "error", code: "ARCADE_CLOSED" });
    const first = await mockTransfer("deposit", 10, "same", fast);
    expect(await mockTransfer("deposit", 90, "same", fast)).toEqual(first);
    expect(getMockWallet()).toMatchObject({ profilePoints: 190, balance: 10 });
  });

  it("gives games the arcade balance only", async () => {
    await mockTransfer("deposit", 40, "d", fast);
    const port = mockWalletPort("olympus-slots");
    expect(port.balance).toBe(40);
    port.save({ balance: 30, saved: [] });
    expect(getMockWallet()).toMatchObject({ profilePoints: 160, balance: 30 });
  });
});
