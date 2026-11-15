/** Types for mountOlympus21.js (plain browser JS ported from the minigame prototype). */
import type { Olympus21Adapter } from "./adapters/mockAdapter.js";
import type { O21ConvexAdapter } from "./adapters/convexAdapter.js";

export type MountOlympus21Options = {
  /** Mock (in-browser engine + bots) or Convex (real tables, server-side matchmaking). */
  adapter: Olympus21Adapter | O21ConvexAdapter;
  /** "auto" picks the table (laptop) or hand (phone) layout by width. */
  view?: "auto" | "table" | "hand";
  /** Phone pairing link shown as a QR code (LAN sandbox only). */
  pairUrl?: string;
  pairNote?: string;
  /** Pre-fills the name field in the lobby. */
  playerName?: string;
};

/** Mounts the game in `el`. Returns `unmount()`, safe to call more than once. */
export declare function mountOlympus21(el: HTMLElement, options: MountOlympus21Options): () => void;
