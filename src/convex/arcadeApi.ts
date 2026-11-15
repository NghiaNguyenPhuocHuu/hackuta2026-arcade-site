import { makeFunctionReference } from "convex/server";
import type { ArcadeGameKey, ArcadePlayErrorCode, ArcadeState, TransferErrorCode, TransferKind } from "../../shared/arcade/rules";

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
    /** Profile balance. Null when not checked in. */
    points: number | null;
    /** Arcade wallet (what the games bet). Null when not checked in. */
    arcadePoints: number | null;
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

/** One deposit or withdrawal, as logged in `arcadeTransfers`. */
export type ArcadeTransfer = {
  transferId: string;
  kind: TransferKind;
  amount: number;
  profileBefore: number;
  profileAfter: number;
  arcadeBefore: number;
  arcadeAfter: number;
  createdAt: number;
};

export type TransferResponse =
  | { status: "ok"; transfer: ArcadeTransfer }
  | { status: "error"; code: TransferErrorCode };

/** Profile points → arcade wallet. `transferId` makes a retry safe (it never moves points twice). */
export const depositRef = makeFunctionReference<"mutation", { transferId: string; amount: number }, TransferResponse>(
  "arcade/transfers:deposit",
);

/** Arcade wallet → profile points. Works even when the arcade is closed. */
export const withdrawRef = makeFunctionReference<"mutation", { transferId: string; amount: number }, TransferResponse>(
  "arcade/transfers:withdraw",
);

/** The caller's own transfer log, newest first. Null when signed out or not checked in. */
export const getMyTransfersRef = makeFunctionReference<
  "query",
  { limit?: number },
  { profilePoints: number; arcadePoints: number; transfers: ArcadeTransfer[] } | null
>("arcade/transfers:getMyTransfers");
