import { makeFunctionReference } from "convex/server";
import type { ArcadeGameKey, ArcadePlayErrorCode, ArcadeState } from "../../shared/arcade/rules";

/**
 * Arcade function references. The functions live in
 * `backend/overlay/convex/arcade/`; keep these shapes in sync with them.
 */

export type ArcadeServerSession = {
  serverNow: number;
  arcade: ArcadeState;
  signIn: { launchEnabled: boolean; backupSignIn: boolean };
  games: Array<{ key: ArcadeGameKey; name: string; enabled: boolean }>;
  /** Null when signed out. */
  player: {
    displayName: string;
    email: string | null;
    /** First reason this account can't play (switches aside), or null. */
    problem: ArcadePlayErrorCode | null;
    /** Null when not checked in. */
    points: number | null;
  } | null;
};

/** Everything the arcade UI reads: switch, games, and the signed-in hacker's points. */
export const getArcadeSessionRef = makeFunctionReference<"query", { nowBucket?: number }, ArcadeServerSession>(
  "arcade/session:getArcadeSession",
);

export type LaunchCodeResponse =
  | { status: "ok"; code: string; expiresAt: number }
  | { status: "error"; code: string; retryAfterMs?: number };

/** Profile calls this (signed in there) before opening `<arcade>/launch#code=…`. */
export const createLaunchCodeRef = makeFunctionReference<"mutation", Record<string, never>, LaunchCodeResponse>(
  "arcade/launch:createLaunchCode",
);
