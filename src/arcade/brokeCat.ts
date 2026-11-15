/**
 * The "broke cat": when a hacker's arcade balance drops to 0 in a solo game,
 * a pixel cat laughs at them (with a laugh track) and points them to the
 * Wallet. Table games are left out: buying in to Poker or Olympus 21 can
 * empty the wallet on purpose (the points become chips), which isn't a loss.
 */
import { ChipTune } from "../games/sound";

/** Solo games, where an empty wallet means the points were lost. */
export const TAUNT_GAMES: ReadonlySet<string> = new Set(["olympus-slots", "wheel-of-the-fates"]);

/**
 * Meme files in `public/` (local, never hotlinked). The first one set wins:
 * a `video` autoplays with its own sound; else an `image` (with `audio`, or the
 * chiptune laugh); else the pixel cat and the chiptune laugh.
 */
export const BROKE_MEME: { video: string | null; image: string | null; audio: string | null } = {
  video: "/memes/laughing-cat.mp4",
  image: null,
  audio: null,
};

/** The headline, in big type. */
export const ROAST_TITLES: readonly string[] = [
  "BROKE. 0 POINTS.",
  "WALLET: EMPTY. EGO: ALSO EMPTY.",
  "SKILL ISSUE DETECTED.",
  "GG. GO NEXT.",
  "YOU HAD ONE JOB.",
  "0 POINTS. 100% COMMITMENT.",
];

/** The roast under it. Trash talk about the play, never about the person. */
export const ROAST_LINES: readonly string[] = [
  "The cat watched the whole thing. The cat has never laughed this hard.",
  "Even Hades leaves a tip. You left nothing.",
  "You bet it all. The Fates said no. The cat said HA.",
  "Broke speedrun, any%. New world record.",
  "Zeus threw lightning blindfolded and still aimed better than your bets.",
  "Your points are in a better place now. That place is the house.",
  "Have you tried winning? Just a thought.",
  "Imagine hacking for 24 hours and losing to a slot machine.",
  "The house always wins. The house would like to thank you personally.",
  "Sisyphus called. At least his rock comes back.",
  "Icarus flew too close to the sun. You flew straight into it.",
  "Your commit history is cleaner than your betting history.",
];

/** The close button: the player's cope. */
export const COPE_BUTTONS: readonly string[] = [
  "I'm not mad",
  "It was rigged",
  "I wasn't even trying",
  "That was a warm-up",
  "Lag. Definitely lag.",
  "I'm literally fine",
];

export type Roast = { title: string; line: string; cope: string };

/** One random headline, roast and cope; `random` is injectable for tests. */
export function pickRoast(random: () => number = Math.random): Roast {
  const pick = (list: readonly string[]) => list[Math.floor(random() * list.length) % list.length]!;
  return { title: pick(ROAST_TITLES), line: pick(ROAST_LINES), cope: pick(COPE_BUTTONS) };
}

/**
 * Taunt once, when the balance the player can see goes from something to 0 in
 * a solo game. `prev` is null until the first balance is known.
 */
export function shouldTaunt(prev: number | null, next: number, gameKey: string | null): boolean {
  return prev !== null && prev > 0 && next === 0 && gameKey !== null && TAUNT_GAMES.has(gameKey);
}

/** The game key of a `/play/:key` path, else null. */
export function gameKeyOf(pathname: string): string | null {
  const match = /^\/play\/([^/]+)/.exec(pathname);
  return match ? match[1]! : null;
}

/** A chiptune cat laugh: wheezy "ha"s that fall in pitch, a snort, then a smug meow. */
export class LaughTrack extends ChipTune {
  constructor() {
    super(0.36);
  }

  laugh() {
    const has = [988, 932, 880, 831, 784, 740, 698, 659];
    has.forEach((freq, i) => {
      const at = i * 0.16;
      this.tone(freq, 0.11, { wave: "square", gain: 0.12, at, slideTo: freq * 0.8 });
      this.hiss(0.09, { freq: 2600, q: 1.2, gain: 0.07, at });
    });
    const end = has.length * 0.16;
    this.hiss(0.18, { freq: 500, to: 1500, q: 2, gain: 0.16, at: end + 0.05, type: "lowpass" }); // snort
    this.tone(660, 0.5, { wave: "triangle", gain: 0.14, at: end + 0.35, slideTo: 1100 }); // mee-
    this.tone(1100, 0.45, { wave: "triangle", gain: 0.12, at: end + 0.85, slideTo: 520 }); // -ow
  }
}

let track: LaughTrack | null = null;

/** One laugh track for the whole arcade (its audio context opens on the first tap). */
export function laughTrack(): LaughTrack {
  track ??= new LaughTrack();
  return track;
}
