/**
 * Techno, the hacker mascot: a 16×16 pixel-art sprite with moods.
 * Pure module (no DOM): hackerFrame() returns static SVG markup plus a
 * pixel offset for the current animation frame. The host advances
 * `frame` every HACKER_FRAME_MS. All markup comes from the tables below.
 */
import { buildPaths } from "./symbols";

export const HACKER_MOODS = Object.freeze(["idle", "focus", "smug", "cheer", "sad", "shock"] as const);
export type HackerMood = (typeof HACKER_MOODS)[number];
export const HACKER_FRAME_MS = 150;

export const HACKER_PALETTE: Readonly<Record<string, string>> = Object.freeze({
  k: "#1a1028", // outline
  H: "#3d4470", // hoodie
  h: "#262b4a", // hood shadow
  s: "#e3a77a", // skin
  M: "#5a1f2a", // mouth
  w: "#f6eddf", // drawstrings / glint
  L: "#8ca1aa", // laptop
  c: "#5ce1e6", // sweat drop
  y: "#ffd23f", // cheer sparkles
});

const BASE: readonly string[] = Object.freeze([
  "................",
  ".....kkkkkk.....",
  "....kHHHHHHk....",
  "...kHHHHHHHHk...",
  "..kHHhhhhhhHHk..",
  "..kHhsssssshHk..",
  "..kHhEkEEkEhHk..",
  "..kHhsssssshHk..",
  "..kHhssMMsshHk..",
  "..kHHhsssshHHk..",
  "...kHHhhhhHHk...",
  "..kHHHHHHHHHHk..",
  ".kHHHHwHHwHHHHk.",
  "kHHkkkkkkkkkkHHk",
  "kHkLLLLLLLLLLkHk",
  "kkkLLLLggLLLLkkk",
]);

type EyeName = "center" | "side" | "glint" | "wide" | "shut" | "sweat";
type MouthName = "flat" | "smirk" | "grin" | "grinO" | "frown" | "open";

const EYES: Readonly<Record<EyeName, string>> = Object.freeze({
  center: "..kHhEkEEkEhHk..",
  side: "..kHhEEkEEkhHk..",
  glint: "..kHhEwEEwEhHk..",
  wide: "..kHhkkEEkkhHk..",
  shut: "..kHhEEEEEEhHk..",
  sweat: "..kHhEkEEkEhHkc.",
});

const MOUTH: Readonly<Record<MouthName, readonly [string, string]>> = Object.freeze({
  flat: Object.freeze(["..kHhssMMsshHk..", "..kHHhsssshHHk.."] as const),
  smirk: Object.freeze(["..kHhsssMMshHk..", "..kHHhsssshHHk.."] as const),
  grin: Object.freeze(["..kHhsMMMMshHk..", "..kHHhsssshHHk.."] as const),
  grinO: Object.freeze(["..kHhsMMMMshHk..", "..kHHhsMMshHHk.."] as const),
  frown: Object.freeze(["..kHhssMMsshHk..", "..kHHhMssMhHHk.."] as const),
  open: Object.freeze(["..kHhssMMsshHk..", "..kHHhsMMshHHk.."] as const),
});

const CHEER_ROWS = Object.freeze([".y............y.", "y..............y"] as const);

/** Exposed for tests. */
export const HACKER_MAPS = Object.freeze({ BASE, EYES, MOUTH, CHEER_ROWS });

const MOODS: Readonly<Record<HackerMood, { eyes: EyeName; mouth: MouthName; visor: string; blink: boolean }>> = Object.freeze({
  idle: { eyes: "center", mouth: "flat", visor: "#7ee081", blink: true },
  focus: { eyes: "center", mouth: "flat", visor: "#7ee081", blink: true },
  smug: { eyes: "side", mouth: "smirk", visor: "#7ee081", blink: true },
  cheer: { eyes: "glint", mouth: "grin", visor: "#ffd23f", blink: false },
  sad: { eyes: "sweat", mouth: "frown", visor: "#ff8a7a", blink: true },
  shock: { eyes: "wide", mouth: "open", visor: "#5ce1e6", blink: false },
});

const LOGO = "#5ce1e6";
const LOGO_ALT = "#7ee081";
const SVG_OPEN =
  '<svg class="minigame__hacker" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true" focusable="false">';

function isMood(mood: string): mood is HackerMood {
  return Object.prototype.hasOwnProperty.call(MOODS, mood);
}

/**
 * Render one animation frame of Techno. Unknown moods fall back to "idle".
 * dx/dy are in sprite pixels.
 */
export function hackerFrame(
  mood: string,
  { frame = 1, talking = false, still = false }: { frame?: number; talking?: boolean; still?: boolean } = {},
): { svg: string; dx: number; dy: number } {
  const name: HackerMood = isMood(mood) ? mood : "idle";
  const m = MOODS[name];
  const t = Number.isFinite(frame) ? Math.trunc(frame) : 1;

  const rows = BASE.slice();
  const eyes: EyeName = !still && m.blink && t % 26 === 0 ? "shut" : m.eyes;
  rows[6] = EYES[eyes];
  let mouth = m.mouth;
  if (!still && talking && Math.abs(t % 2) === 1) mouth = name === "cheer" ? "grinO" : "open";
  rows[8] = MOUTH[mouth][0];
  rows[9] = MOUTH[mouth][1];
  if (name === "cheer") rows[0] = still || t % 4 < 2 ? CHEER_ROWS[0] : CHEER_ROWS[1];

  const logo = !still && name === "focus" && Math.abs(t % 2) === 1 ? LOGO_ALT : LOGO;
  const colorOf = (key: string) => (key === "E" ? m.visor : key === "g" ? logo : HACKER_PALETTE[key] ?? "#ff00ff");

  let dx = 0;
  let dy = 0;
  if (!still) {
    const t4 = ((t % 4) + 4) % 4;
    if (name === "cheer") dy = t4 < 2 ? -1 : 0;
    else if (name === "shock") dx = [0, 1, 0, -1][t4] ?? 0;
    else if (name === "focus") dy = ((t % 6) + 6) % 6 < 3 ? 0 : 0.5;
    else if (name === "sad") dy = 0.5;
  }

  return { svg: `${SVG_OPEN}${buildPaths(rows, colorOf)}</svg>`, dx, dy };
}
