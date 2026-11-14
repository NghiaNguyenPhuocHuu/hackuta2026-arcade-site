/**
 * Who appears after a spin: a god for a win, a demon for a loss, Odysseus for
 * a stake that comes back. Static copy; only the points are filled in.
 */
import { symbolLabel, symbolSvg } from "../olympus-slots/symbols";
import { DEMON_NAMES, demonSvg } from "./demons";
import type { RouletteSpin } from "./types";

export type Omen = {
  kind: "god" | "demon" | "mortal";
  /** Zeus or Hades: bigger entrance, louder sound. */
  big: boolean;
  name: string;
  svg: string;
  quote: string;
};

const GOD_QUOTES: Readonly<Record<string, string>> = {
  zeus: "By my thunder, the heavens pay you +{n}!",
  athena: "Wisdom wins the day. +{n} pts.",
  apollo: "The sun shines on your thread. +{n} pts.",
  poseidon: "The tide rolls in your favor. +{n} pts.",
  hermes: "Swift fortune, delivered. +{n} pts.",
  aphrodite: "Fortune adores you. +{n} pts.",
  hera: "The queen of Olympus approves. +{n} pts.",
};

const DEMON_QUOTES: Readonly<Record<string, string>> = {
  hades: "Your points belong to the Underworld now. −{n} pts.",
  cerberus: "Three heads, one hunger. −{n} pts.",
  medusa: "Look into my eyes... and lose {n} pts.",
  minotaur: "Lost in my labyrinth. −{n} pts.",
};

const SMALL_GODS = ["athena", "apollo", "poseidon", "hermes", "aphrodite", "hera"] as const;
const SMALL_DEMONS = ["cerberus", "medusa", "minotaur"] as const;

/** A big loss: 30 points or more, or the Olympus pocket taking everything. */
const BIG_LOSS = 30;
/** A big win: 100 points or more, or a win on the Olympus pocket. */
const BIG_WIN = 100;

export function omenFor(spin: RouletteSpin, random: () => number = Math.random): Omen {
  const n = Math.abs(spin.net);
  const fill = (text: string) => text.split("{n}").join(String(n));
  const pickFrom = <T,>(list: readonly T[]) => list[Math.min(list.length - 1, Math.floor(random() * list.length))]!;

  if (spin.net > 0) {
    const big = spin.net >= BIG_WIN || spin.pocket === 0;
    const god = big ? "zeus" : pickFrom(SMALL_GODS);
    return { kind: "god", big, name: symbolLabel(god), svg: symbolSvg(god), quote: fill(GOD_QUOTES[god]!) };
  }
  if (spin.net < 0) {
    const big = n >= BIG_LOSS || (spin.pocket === 0 && spin.returned === 0);
    const demon = big ? "hades" : pickFrom(SMALL_DEMONS);
    return { kind: "demon", big, name: DEMON_NAMES[demon]!, svg: demonSvg(demon), quote: fill(DEMON_QUOTES[demon]!) };
  }
  return {
    kind: "mortal",
    big: false,
    name: symbolLabel("odysseus"),
    svg: symbolSvg("odysseus"),
    quote: "A long voyage, and back where you started.",
  };
}
