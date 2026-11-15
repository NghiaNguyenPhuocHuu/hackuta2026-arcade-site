import type { ArcadeServerSession } from "../convex/arcadeApi";
import { isArcadeGameKey, isLaunchCodeShape } from "../../shared/arcade/rules";
import type { ArcadeSession } from "./useArcadeSession";

/**
 * Pure helpers for the live (Convex) arcade session. Kept free of React so
 * tests can run them in node.
 */

/**
 * "live" reads the arcade from Convex (needs the step 1 backend on the
 * deployment); anything else keeps the mock. `?preview=` always forces the mock,
 * so the status screens can still be previewed against a live build.
 */
export function backendModeFrom(envValue: string | undefined, search: string): "live" | "mock" {
  if (new URLSearchParams(search).has("preview")) return "mock";
  return envValue?.trim().toLowerCase() === "live" ? "live" : "mock";
}

/** `getArcadeSession`'s answer (undefined while loading) → what the UI reads. */
export function toArcadeSession(server: ArcadeServerSession | undefined, authLoading: boolean): ArcadeSession {
  const empty: ArcadeSession = { status: "loading", problem: null, opensAt: null, closesAt: null, player: null, games: [] };
  if (authLoading || server === undefined) return empty;
  const games = server.games
    .filter((game) => isArcadeGameKey(game.key))
    .map((game) => ({ key: game.key, enabled: game.enabled }));
  const base = { ...empty, games, opensAt: server.arcade.opensAt, closesAt: server.arcade.closesAt };
  if (!server.player) return { ...base, status: "signed-out" };
  const player = {
    displayName: server.player.displayName,
    email: server.player.email,
    points: server.player.points ?? 0,
  };
  if (server.player.problem) return { ...base, status: "blocked", problem: server.player.problem, player };
  return { ...base, status: server.arcade.status, player };
}

/**
 * Milliseconds until the session query should re-run because the schedule
 * changes by itself (opens or closes), or null when nothing is due.
 */
export function msUntilNextChange(server: ArcadeServerSession | undefined): number | null {
  const next = server?.arcade.nextChangeAt;
  if (typeof next !== "number" || !Number.isFinite(next)) return null;
  // A little after the edge, so the server clock has passed it too.
  return Math.min(Math.max(0, next - server!.serverNow) + 250, 2 ** 31 - 1);
}

/** The launch code from `/launch#code=…`, or null if missing or malformed. */
export function readLaunchCode(hash: string): string | null {
  const code = new URLSearchParams(hash.replace(/^#/, "")).get("code");
  return isLaunchCodeShape(code) ? code : null;
}
