/** Types for mountOlympus21.js (plain browser JS). */
import type { O21ConvexAdapter } from "./adapters/convexAdapter.js";

export type MountOlympus21Options = {
  /** The live server (`arcade/olympus21`) through the Convex adapter. */
  adapter: O21ConvexAdapter;
  /** "auto" picks the table (laptop: hand in a tray below) or hand (phone) layout by width. */
  view?: "auto" | "table" | "hand";
};

/** Mounts the game in `el`. Returns `unmount()`, safe to call more than once. */
export declare function mountOlympus21(el: HTMLElement, options: MountOlympus21Options): () => void;
