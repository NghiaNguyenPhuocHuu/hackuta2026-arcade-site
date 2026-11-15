import { useEffect, useState } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { getArcadeSessionRef } from "../convex/arcadeApi";
import type { ArcadePlayErrorCode } from "../../shared/arcade/rules";
import { shownPoints, usePointsHold } from "./pointsReveal";
import type { GameKey } from "../games/registry";

/**
 * What the arcade UI reads from the server: the arcade switch, the games, and
 * the signed-in hacker with both balances. Live: Convex re-runs the query
 * whenever any of it changes (a spin, a deposit, an admin switch).
 */
export type ArcadeStatus = "loading" | "signed-out" | "off" | "scheduled" | "on";

export type ArcadeGameState = {
  key: GameKey;
  enabled: boolean;
};

export type ArcadeSession = {
  status: ArcadeStatus;
  /** ms epoch; set when status is "scheduled" or "on" with an end time. */
  opensAt: number | null;
  closesAt: number | null;
  player: {
    displayName: string;
    email: string | null;
    /** Why this account can't play (not checked in, …), or null. */
    problem: ArcadePlayErrorCode | null;
    /** Profile balance (HackUTA points). */
    points: number;
    /** Arcade wallet: what the games bet. Deposit and withdraw move points between the two. */
    arcadePoints: number;
  } | null;
  games: ArcadeGameState[];
};

const EMPTY: Omit<ArcadeSession, "status"> = { opensAt: null, closesAt: null, player: null, games: [] };

/**
 * Re-renders at `at` (and returns a number that changed), so a query keyed on
 * it re-runs exactly when the arcade's schedule opens or closes.
 */
function useBucketUntil(at: number | null | undefined): number {
  const [bucket, setBucket] = useState(0);
  useEffect(() => {
    if (!at) return;
    const wait = Math.max(0, at - Date.now()) + 250;
    const id = window.setTimeout(() => setBucket((b) => b + 1), Math.min(wait, 2 ** 31 - 1));
    return () => window.clearTimeout(id);
  }, [at, bucket]);
  return bucket;
}

export function useArcadeSession(): ArcadeSession {
  const auth = useConvexAuth();
  const [nextChangeAt, setNextChangeAt] = useState<number | null>(null);
  const nowBucket = useBucketUntil(nextChangeAt);
  const server = useQuery(getArcadeSessionRef, auth.isAuthenticated ? { nowBucket } : "skip");
  useEffect(() => setNextChangeAt(server?.arcade.nextChangeAt ?? null), [server?.arcade.nextChangeAt]);
  // During a spin's reveal every screen shows the held balance, not the result.
  const hold = usePointsHold();

  if (auth.isLoading) return { status: "loading", ...EMPTY };
  if (!auth.isAuthenticated) return { status: "signed-out", ...EMPTY };
  if (server === undefined) return { status: "loading", ...EMPTY };
  if (!server.player) return { status: "signed-out", ...EMPTY };
  return {
    status: server.arcade.status,
    opensAt: server.arcade.opensAt,
    closesAt: server.arcade.closesAt,
    player: {
      displayName: server.player.displayName,
      email: server.player.email,
      problem: server.player.problem,
      points: server.player.points ?? 0,
      arcadePoints: shownPoints(server.player.arcadePoints ?? 0, hold),
    },
    games: server.games.map((game) => ({ key: game.key, enabled: game.enabled })),
  };
}

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
