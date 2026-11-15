/**
 * Olympus Slots' sounds, on the arcade's shared 8-bit engine (../sound.ts:
 * unlock, the game sound switch, coins/fanfare/lose/even/error).
 */
import { ChipTune } from "../sound";

export class SlotsSfx extends ChipTune {
  /** Pulling the lever: a whoosh that rises into the spin. */
  lever() {
    this.hiss(0.5, { freq: 400, to: 3000, q: 0.9, gain: 0.18 });
    this.tone(196, 0.3, { wave: "triangle", gain: 0.12, slideTo: 587 });
  }

  /** A symbol flicking past while the reels spin (quiet; it repeats). */
  reelTick() {
    this.tone(1600 + Math.random() * 300, 0.015, { wave: "square", gain: 0.025 });
  }

  /** A reel lands; each reel a step higher so the four stops climb. */
  reelStop(index: number) {
    const base = [262, 330, 392, 523][index % 4]!;
    this.hiss(0.05, { freq: 900, q: 3, gain: 0.22 });
    this.tone(base, 0.09, { wave: "square", gain: 0.12 });
    this.tone(base / 2, 0.12, { wave: "triangle", gain: 0.12 });
  }

  /** The result, from the outcome and what the player got back. */
  result(outcome: string, net: number) {
    if (outcome === "big") this.fanfare();
    else if (net > 0) this.coins(outcome === "win" ? 2 : 1);
    else if (net === 0) this.even();
    else this.lose();
  }
}
