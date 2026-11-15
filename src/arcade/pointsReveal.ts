import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * Keeps a spin's result secret until the game has shown it.
 *
 * The server settles a spin the moment it is placed, and the new balance
 * reaches every screen at once (the shared wallet now, a live Convex query
 * later). The game itself waits for its animation, but without this a player
 * could spin, jump to the lobby or another game, and read the result off the
 * points pill seconds early.
 *
 * So a game `hold`s the shown balance when it spins (at the balance minus the
 * stake, which isn't a secret) and `release`s it when the result is revealed.
 * While a hold is on, the arcade shows the held number everywhere, and opening
 * a game waits for it to end (see `useRevealWait`). Leaving mid-spin doesn't
 * release it: it lasts until the reveal would have happened (`maxMs`).
 */
export type PointsHold = { id: number; game: string; shown: number; until: number };

let hold: PointsHold | null = null;
let nextId = 1;
let expiryTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function setHold(next: PointsHold | null) {
  if (expiryTimer !== null) clearTimeout(expiryTimer);
  expiryTimer = null;
  hold = next;
  if (next) expiryTimer = setTimeout(() => setHold(null), Math.max(0, next.until - Date.now()));
  emit();
}

/** Show `shown` instead of the live balance for at most `maxMs`, or until `release`. */
export function holdPoints(game: string, shown: number, maxMs: number, now = Date.now()): void {
  setHold({ id: nextId++, game, shown, until: now + Math.max(0, maxMs) });
}

/** The game has revealed its result: show the live balance again. Only ends this game's hold. */
export function releasePoints(game: string): void {
  if (hold?.game === game) setHold(null);
}

export function getPointsHold(): PointsHold | null {
  return hold;
}

export function subscribePointsHold(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The balance to display: the held one during a reveal, else `actual`. */
export function shownPoints(actual: number, current: PointsHold | null = hold): number {
  return current ? current.shown : actual;
}

export function usePointsHold(): PointsHold | null {
  return useSyncExternalStore(subscribePointsHold, getPointsHold, getPointsHold);
}

/**
 * For a game about to mount: the hold that was already on when it opened
 * (another game's spin still being revealed), or null once it ends. A hold the
 * game starts itself after mounting never blocks it.
 */
export function useRevealWait(): PointsHold | null {
  const current = usePointsHold();
  const [blockingId] = useState(() => getPointsHold()?.id ?? null);
  return current && current.id === blockingId ? current : null;
}

/** Seconds left until `until`, re-rendering each second. */
export function useSecondsLeft(until: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [until]);
  return until === null ? 0 : Math.max(0, Math.ceil((until - now) / 1000));
}

/** Tests only. */
export function resetPointsHold(): void {
  setHold(null);
}
