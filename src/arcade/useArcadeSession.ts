import { useEffect, useState, useSyncExternalStore } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { getMockWallet, subscribeMockWallet } from "./mockWallet";
import { shownPoints, usePointsHold } from "./pointsReveal";
import { IS_LIVE } from "./backendMode";
import { msUntilNextChange, toArcadeSession } from "./liveSession";
import { getArcadeSessionRef } from "../convex/arcadeApi";
import type { GameKey } from "../games/registry";
import type { ArcadePlayErrorCode } from "../../shared/arcade/rules";

/**
 * What the arcade UI needs from the server: arcade settings, per-game
 * switches, the signed-in hacker and their points. With
 * VITE_ARCADE_BACKEND=live it comes from `arcade/session:getArcadeSession`;
 * otherwise (and always with ?preview=) from the mock below.
 */
/** "blocked": signed in, but this account can't play (see `problem`). */
export type ArcadeStatus = "loading" | "signed-out" | "blocked" | "off" | "scheduled" | "on";

export type ArcadeGameState = {
  key: GameKey;
  enabled: boolean;
};

export type ArcadeSession = {
  status: ArcadeStatus;
  /** Why a signed-in account can't play (status "blocked"), else null. */
  problem: ArcadePlayErrorCode | null;
  /** ms epoch; set when status is "scheduled" or "on" with an end time. */
  opensAt: number | null;
  closesAt: number | null;
  player: { displayName: string; email: string | null; points: number } | null;
  games: ArcadeGameState[];
};

const PREVIEWS: readonly ArcadeStatus[] = ["loading", "signed-out", "off", "scheduled", "on"];

/**
 * Local preview of every screen until the backend exists: add ?preview=off,
 * ?preview=scheduled, ?preview=signed-out or ?preview=loading to the URL.
 */
function previewStatus(): ArcadeStatus {
  const value = new URLSearchParams(window.location.search).get("preview");
  return PREVIEWS.includes(value as ArcadeStatus) ? (value as ArcadeStatus) : "on";
}

/** ?preview=scheduled&opensIn=15 opens the mock in 15 seconds (default: 1 hour). */
function previewOpensInMs(): number | null {
  const value = Number(new URLSearchParams(window.location.search).get("opensIn"));
  return Number.isFinite(value) && value > 0 ? value * 1000 : null;
}

function mockSession(status: ArcadeStatus, now: number): ArcadeSession {
  const hour = 60 * 60 * 1000;
  return {
    status,
    problem: null,
    opensAt: status === "scheduled" ? now + (previewOpensInMs() ?? hour) : status === "on" ? now - hour : null,
    closesAt: status === "scheduled" ? now + 3 * hour : status === "on" ? now + 2 * hour : null,
    player: status === "signed-out" || status === "loading" ? null : { displayName: "Alex Rivera", email: "alex@example.com", points: 200 },
    games: [
      { key: "olympus-slots", enabled: true },
      { key: "wheel-of-the-fates", enabled: true },
      { key: "olympus-poker", enabled: true },
      { key: "pvp-blackjack", enabled: true },
    ],
  };
}

function useMockSession(): ArcadeSession {
  const [session] = useState(() => mockSession(previewStatus(), Date.now()));
  const wallet = useSyncExternalStore(subscribeMockWallet, getMockWallet);
  // During a spin's reveal every screen shows the held balance, not the result.
  const hold = usePointsHold();
  return session.player ? { ...session, player: { ...session.player, points: shownPoints(wallet.balance, hold) } } : session;
}

function useLiveSession(): ArcadeSession {
  const { isLoading } = useConvexAuth();
  // Changes when the schedule opens or closes, so Convex re-runs the query then.
  const [nowBucket, setNowBucket] = useState(0);
  const server = useQuery(getArcadeSessionRef, { nowBucket });
  const wait = msUntilNextChange(server);
  useEffect(() => {
    if (wait === null) return;
    const id = window.setTimeout(() => setNowBucket(Date.now()), wait);
    return () => window.clearTimeout(id);
  }, [wait, server?.arcade.nextChangeAt]);
  return toArcadeSession(server, isLoading);
}

/** Chosen once per page load (VITE_ARCADE_BACKEND), so the hook order never changes. */
export const useArcadeSession: () => ArcadeSession = IS_LIVE ? useLiveSession : useMockSession;

/** Re-renders every `intervalMs` so countdowns stay current. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** "1h 05m", "12m 30s", "45s". */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

/** "7:00 PM" in the viewer's time zone. */
export function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** "AR" from "Alex Rivera" (same rule as profile's avatar). */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 1).toUpperCase();
  return `${parts[0]!.slice(0, 1)}${parts[parts.length - 1]!.slice(0, 1)}`.toUpperCase();
}
