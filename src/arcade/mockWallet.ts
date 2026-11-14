import type { RecentSpin } from "../games/olympus-slots/types";

/**
 * Mock points for the whole visit, until the Convex adapter (step 3 of
 * docs/ARCADE_PLAN.md) reads the real balance. Without it every game mount
 * started a fresh 200-point wallet, so leaving Slots and coming back reset
 * the balance and history, and the lobby's points pill never moved.
 */
export type MockWallet = { balance: number; recentSpins: RecentSpin[] };

let wallet: MockWallet = { balance: 200, recentSpins: [] };
const listeners = new Set<() => void>();

export function getMockWallet(): MockWallet {
  return wallet;
}

export function setMockWallet(next: MockWallet): void {
  if (next.balance === wallet.balance && next.recentSpins === wallet.recentSpins) return;
  wallet = next;
  for (const listener of listeners) listener();
}

export function subscribeMockWallet(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
