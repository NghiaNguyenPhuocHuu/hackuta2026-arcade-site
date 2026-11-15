/**
 * Underworld sprites for Wheel of the Fates losses, in the same 16×16 format
 * as the gods in Olympus Slots (symbols.ts): one palette key per pixel, "."
 * transparent. Rendered with the same buildPaths, so they look like one set.
 */
import { SPRITE_PALETTE, buildPaths } from "../olympus-slots/symbols";

export const DEMON_PALETTE: Readonly<Record<string, string>> = Object.freeze({
  ...SPRITE_PALETTE,
  a: "#9aa8b4", // ashen skin
  A: "#6b7884", // ashen shade
  d: "#4a3f55", // dark fur
  D: "#2a2233", // robe / deep shadow
  e: "#ff3b30", // glowing eye
  f: "#ff6b3d", // fire
  x: "#efe6d0", // bone / teeth
  n: "#5fbf4a", // snake green
  N: "#2e7d32", // snake shade
  q: "#b9d98a", // gorgon skin
  t: "#8a5a3c", // bull hide
  T: "#5a3a26", // bull shade
  H: "#e3d3a8", // horn
  z: "#5ce1e6", // blue flame
});

export const DEMON_MAPS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  hades: Object.freeze([
    "..z..z.zz.z..z..",
    ".zcz.zczzcz.zcz.",
    ".zcczcccccczccz.",
    "..kaaaaaaaaaak..",
    "..kaaaaaaaaaak..",
    "..kaekaaaakeak..",
    "..kaaaaAAaaaak..",
    "..kaaakkkkaaak..",
    "..kaakxkkxkaak..",
    "...kaaaaaaaak...",
    "....kDDDDDDk....",
    "..kDDDDzzDDDDk..",
    ".kDDDDDzzDDDDDk.",
    "kDDDDDDzzDDDDDDk",
    "kDDDDDDDDDDDDDDk",
    "kDDDDDDDDDDDDDDk",
  ]),
  cerberus: Object.freeze([
    ".kk..........kk.",
    ".kdk........kdk.",
    ".kddkkkkkkkkddk.",
    ".kddddddddddddk.",
    "kddeeddddddeeddk",
    "kddeeddddddeeddk",
    "kddddddddddddddk",
    ".kdddddkkdddddk.",
    "..kddddkkddddk..",
    "..kdkxkxxkxkdk..",
    "..kdkfffffffdk..",
    "...kdkxkkxkdk...",
    "..kYkYkYkYkYkYk.",
    ".kDDDDDDDDDDDDDk",
    "kDDDDDDDDDDDDDDk",
    "kDDDDDDDDDDDDDDk",
  ]),
  medusa: Object.freeze([
    ".n.N.n..n.N.n...",
    "nNnNnNnnNnNnNn..",
    ".nNknnNnnNnnkNn.",
    "nNkqqqqqqqqqqkNn",
    ".nkqqqqqqqqqqkn.",
    "nNkqyykqqkyyqkNn",
    ".nkqqqqqqqqqqkn.",
    "..kqqqqNNqqqqk..",
    "..kqqqkmmkqqqk..",
    "...kqqqqqqqqk...",
    "....kkqqqqkk....",
    "..kNNNkkkkNNNk..",
    ".kNNNNNNNNNNNNk.",
    "kNNNNNNyyNNNNNNk",
    "kNNNNNNNNNNNNNNk",
    "kNNNNNNNNNNNNNNk",
  ]),
  minotaur: Object.freeze([
    "kHk..........kHk",
    "kHHk........kHHk",
    ".kHHkkkkkkkkHHk.",
    "..kkttttttttkk..",
    "...kttttttttk...",
    "..kttekttkettk..",
    "..kttttttttttk..",
    "..kttTTTTTTttk..",
    "..ktTTkTTkTTtk..",
    "..ktTTTTTTTTtk..",
    "...ktTTyyTTtk...",
    "....kkkyykkk....",
    "..kTTTkkkkTTTk..",
    ".kTTTTTTTTTTTTk.",
    "kTTTTTTTTTTTTTTk",
    "kTTTTTTTTTTTTTTk",
  ]),
});

export const DEMON_NAMES: Readonly<Record<string, string>> = Object.freeze({
  hades: "Hades",
  cerberus: "Cerberus",
  medusa: "Medusa",
  minotaur: "Minotaur",
});

const cache = new Map<string, string>();

/** Crisp SVG for a demon, built only from the static maps above. */
export function demonSvg(name: string): string {
  const rows = Object.prototype.hasOwnProperty.call(DEMON_MAPS, name) ? DEMON_MAPS[name] : undefined;
  if (!rows) return "";
  const hit = cache.get(name);
  if (hit) return hit;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${buildPaths(
    rows,
    (key) => DEMON_PALETTE[key] ?? "#2c5272",
  )}</svg>`;
  cache.set(name, svg);
  return svg;
}
