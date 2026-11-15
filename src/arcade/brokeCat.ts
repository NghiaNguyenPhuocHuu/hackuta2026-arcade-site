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
 * Optional meme files, for organizers who have ones they're allowed to use:
 * put them in `public/` and set the paths (e.g. "/memes/laughing-cat.gif").
 * Left null, the pixel cat and the synthesized laugh track play instead.
 */
export const BROKE_MEME: { image: string | null; audio: string | null } = { image: null, audio: null };

export const TAUNTS: readonly string[] = [
  "The cat saw that. The cat will never forget.",
  "Zero points. Even Hades leaves a tip.",
  "You bet it all. The Fates said no. The cat said HA.",
  "Broke speedrun: new personal best.",
  "Down to nothing. Somewhere on Olympus, a cat is wheezing.",
];

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
