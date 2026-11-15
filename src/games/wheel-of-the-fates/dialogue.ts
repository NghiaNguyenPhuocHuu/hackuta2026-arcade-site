/**
 * Techno's lines for Wheel of the Fates, in the arcade's dark heroic voice.
 * Pure module: only numbers are substituted into static copy.
 */
import type { HackerMood } from "../olympus-slots/hacker";
import { COLOR_NAMES, ROULETTE_LIMITS, pocketColor, type RouletteLimits } from "../../../shared/roulette/rules";
import type { RouletteErrorCode, RouletteSpin } from "./types";

export type Tone = "gold" | "green" | "cyan" | "coral" | "marble";
export type Line = { title: string; line: string; tone: Tone; mood: HackerMood };

export const INTRO: Line = {
  title: "THE FATES AWAIT.",
  line: "Clotho spins, Lachesis measures, Atropos cuts. Lay your chips on the table, hero, and let the wheel decide.",
  tone: "cyan",
  mood: "smug",
};

export const SPINNING: Line = {
  title: "THE THREAD IS SPINNING...",
  line: "No more offerings. The Fates are weighing your fate.",
  tone: "cyan",
  mood: "focus",
};

export const CLOSED: Line = {
  title: "THE TEMPLE IS SEALED",
  line: "The Fates have set down their thread. Come back when the gates open.",
  tone: "gold",
  mood: "sad",
};

const pick = <T,>(list: readonly T[], seed: number): T => list[Math.abs(Math.trunc(seed)) % list.length]!;

/** Spoken name of a pocket: "17 Fire", "0 Olympus". */
export function pocketName(pocket: number): string {
  return `${pocket} ${COLOR_NAMES[pocketColor(pocket)]}`;
}

export function resultLine(spin: RouletteSpin): Line {
  const name = pocketName(spin.pocket).toUpperCase();
  const seed = spin.pocket + spin.stake;
  if (spin.pocket === 0 && spin.net > 0) {
    return { title: "OLYMPUS!", line: `+${spin.net} pts. The ball found the gods' own pocket, and so did you.`, tone: "gold", mood: "cheer" };
  }
  if (spin.net >= 100) {
    return {
      title: `${name}! THE FATES SMILE`,
      line: pick([`+${spin.net} pts. Even Atropos lowered her shears.`, `+${spin.net} pts. Your thread shines gold. They'll sing of this spin.`], seed),
      tone: "gold",
      mood: "cheer",
    };
  }
  if (spin.net > 0) {
    return {
      title: `${name}.`,
      line: pick([`+${spin.net} pts. The thread holds. Your legend grows.`, `+${spin.net} pts. Lachesis measured you a little longer.`], seed),
      tone: "green",
      mood: "smug",
    };
  }
  if (spin.net === 0) {
    return { title: `${name}.`, line: "Your offering returns. The Fates are undecided.", tone: "marble", mood: "idle" };
  }
  if (spin.returned > 0) {
    return { title: `${name}.`, line: `${spin.net} pts. Some threads held, others were cut.`, tone: "coral", mood: "sad" };
  }
  if (spin.pocket === 0) {
    return { title: "OLYMPUS TAKES ALL", line: `${spin.net} pts. The gods claimed their own pocket.`, tone: "coral", mood: "shock" };
  }
  return {
    title: `${name}. CUT.`,
    line: pick([`${spin.net} pts. Atropos cuts the thread.`, `${spin.net} pts. Swallowed by the Underworld.`, `${spin.net} pts. The Fates are cruel tonight. Rise again.`], seed),
    tone: "coral",
    mood: "sad",
  };
}

export function errorLine(code: RouletteErrorCode, limits: RouletteLimits = ROULETTE_LIMITS, retryAfterMs = 0): Line {
  const coral = (title: string, line: string, mood: HackerMood = "sad"): Line => ({ title, line, tone: "coral", mood });
  switch (code) {
    case "EMPTY":
      return { title: "NO OFFERING YET", line: "Pick a chip and lay it on the table first.", tone: "cyan", mood: "idle" };
    case "STRAIGHT_LIMIT":
      return coral("ONE NUMBER, ONE LIMIT", `The Fates allow at most ${limits.maxStraightStake} pts on a single number.`);
    case "STAKE_LIMIT":
      return coral("THE ALTAR IS FULL", `Offerings are capped at ${limits.maxStakePerSpin} pts per spin.`);
    case "PAYOUT_LIMIT":
      return coral("TOO GREEDY, MORTAL", `No spin may pay more than ${limits.maxPayoutPerSpin} pts. Spread your chips thinner.`, "smug");
    case "TOO_MANY_BETS":
      return coral("TOO MANY THREADS", `At most ${limits.maxBetsPerSpin} bets on one spin.`);
    case "INSUFFICIENT_POINTS":
      return coral("YOUR COFFERS RUN DRY", "You don't have enough points for that offering.");
    case "DAILY_LOSS_LIMIT":
      return coral("THE FATES SAY ENOUGH", `That could take you past today's ${limits.dailyLossLimit} pt loss limit. Try a smaller offering, or return tomorrow.`, "shock");
    case "COOLDOWN":
      return coral("THE WHEEL IS SETTLING", `One spin every ${Math.round(limits.cooldownMs / 1000)} seconds. Wait ${Math.max(1, Math.ceil(retryAfterMs / 1000))} s.`, "idle");
    case "CLOSED":
      return CLOSED;
    case "SIGNED_OUT":
      return coral("WHO GOES THERE?", "Open the arcade from your HackUTA profile to play.");
    case "NOT_ELIGIBLE":
      return coral("NOT YET, MORTAL", "Only accepted, checked-in hackers can play.");
    case "UNKNOWN_BET":
    case "BAD_AMOUNT":
    case "ERROR":
    default:
      return coral("THE THREAD SNAGGED", "Something went wrong. Your points are safe. Try again.", "shock");
  }
}
