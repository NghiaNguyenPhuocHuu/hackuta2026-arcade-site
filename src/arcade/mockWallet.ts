import type { MockWalletPort } from "../games/types";
import type { ArcadeTransfer, TransferResponse } from "../convex/arcadeApi";
import { balancesAfter, checkDeposit, checkWithdraw, type TransferKind } from "../../shared/arcade/rules";
import { holdPoints, releasePoints } from "./pointsReveal";

/**
 * Mock points for the whole visit, until the Convex adapters read the real
 * balances. Two balances, like the real backend:
 *
 *   - `profilePoints`: the HackUTA profile balance (`checkedIn.points`)
 *   - `balance`: the arcade wallet, which every game bets from
 *
 * Points move between them only through `mockTransfer` (deposit / withdraw),
 * which applies the same rules as `arcade/transfers` and keeps a log. Each
 * game also keeps its own saved data (history and so on) here, so leaving a
 * game and coming back changes nothing.
 */
export type MockWallet = {
  profilePoints: number;
  /** Arcade wallet: what the games bet. */
  balance: number;
  saved: Readonly<Record<string, unknown>>;
  /** Deposits and withdrawals, newest first. */
  transfers: readonly ArcadeTransfer[];
};

const START: MockWallet = { profilePoints: 200, balance: 0, saved: {}, transfers: [] };
/** Pretend network time, so the confirmation modal's pending state shows. */
const MOCK_LATENCY_MS = 400;

let wallet: MockWallet = START;
const listeners = new Set<() => void>();

export function getMockWallet(): MockWallet {
  return wallet;
}

function setMockWallet(next: MockWallet): void {
  wallet = next;
  for (const listener of listeners) listener();
}

export function subscribeMockWallet(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Takes arcade points for a game (poker's buy-in). */
export function spendMockPoints(amount: number): boolean {
  if (amount <= 0 || wallet.balance < amount) return false;
  setMockWallet({ ...wallet, balance: wallet.balance - amount });
  return true;
}

/** Gives arcade points back from a game (poker's cash-out). */
export function creditMockPoints(amount: number): void {
  if (amount <= 0) return;
  setMockWallet({ ...wallet, balance: wallet.balance + amount });
}

/**
 * Deposit (profile → arcade) or withdraw (arcade → profile), with the same
 * checks as the server. A repeated `transferId` returns the first result and
 * moves nothing. Deposits need the arcade open; withdrawals always work.
 */
export async function mockTransfer(
  kind: TransferKind,
  amount: number,
  transferId: string,
  { arcadeOpen = true, latencyMs = MOCK_LATENCY_MS, now = Date.now }: { arcadeOpen?: boolean; latencyMs?: number; now?: () => number } = {},
): Promise<TransferResponse> {
  if (latencyMs > 0) await new Promise((resolve) => setTimeout(resolve, latencyMs));
  const existing = wallet.transfers.find((t) => t.transferId === transferId);
  if (existing) return { status: "ok", transfer: existing };
  if (kind === "deposit" && !arcadeOpen) return { status: "error", code: "ARCADE_CLOSED" };
  const refused = kind === "deposit" ? checkDeposit(amount, wallet.profilePoints) : checkWithdraw(amount, wallet.balance);
  if (refused) return { status: "error", code: refused };
  const after = balancesAfter(kind, amount, wallet.profilePoints, wallet.balance);
  const transfer: ArcadeTransfer = {
    transferId,
    kind,
    amount,
    profileBefore: wallet.profilePoints,
    profileAfter: after.profile,
    arcadeBefore: wallet.balance,
    arcadeAfter: after.arcade,
    createdAt: now(),
  };
  setMockWallet({ ...wallet, profilePoints: after.profile, balance: after.arcade, transfers: [transfer, ...wallet.transfers] });
  return { status: "ok", transfer };
}

/** Tests only: back to 200 profile points, an empty arcade wallet, no log. */
export function resetMockWallet(): void {
  setMockWallet(START);
}

/** The wallet as one game sees it: the arcade balance only. */
export function mockWalletPort(gameKey: string): MockWalletPort {
  return {
    balance: wallet.balance,
    saved: wallet.saved[gameKey],
    save({ balance, saved }) {
      if (balance === wallet.balance && saved === wallet.saved[gameKey]) return;
      setMockWallet({ ...wallet, balance, saved: { ...wallet.saved, [gameKey]: saved } });
    },
    hold: (shown, maxMs) => holdPoints(gameKey, shown, maxMs),
    release: () => releasePoints(gameKey),
  };
}
