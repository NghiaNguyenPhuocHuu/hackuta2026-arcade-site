import type { MockWalletPort } from "../games/types";
import { holdPoints, releasePoints } from "./pointsReveal";

/**
 * Mock points for the whole visit, until the Convex adapters (step 3 of
 * docs/ARCADE_PLAN.md) read the real balance. One balance is shared by every
 * game and the lobby's points pill, and each game keeps its own saved data
 * (history and so on), so leaving a game and coming back changes nothing.
 */
export type MockWallet = { balance: number; saved: Readonly<Record<string, unknown>> };

let wallet: MockWallet = { balance: 200, saved: {} };
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

/** The wallet as one game sees it. */
export function mockWalletPort(gameKey: string): MockWalletPort {
  return {
    balance: wallet.balance,
    saved: wallet.saved[gameKey],
    save({ balance, saved }) {
      if (balance === wallet.balance && saved === wallet.saved[gameKey]) return;
      setMockWallet({ balance, saved: { ...wallet.saved, [gameKey]: saved } });
    },
    hold: (shown, maxMs) => holdPoints(gameKey, shown, maxMs),
    release: () => releasePoints(gameKey),
  };
}
