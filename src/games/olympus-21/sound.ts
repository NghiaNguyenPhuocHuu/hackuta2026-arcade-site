/**
 * Olympus 21's sounds, on the arcade's shared 8-bit engine (../sound.ts:
 * unlock, the game sound switch, coins/fanfare/lose/error).
 */
import { ChipTune } from "../sound";

/** The fields of an engine move the sounds read (see shared/olympus21/engine.js). */
export type O21Move = { kind: string; seat?: number };

export class O21Sfx extends ChipTune {
  /** A card slapped onto the pile. */
  card() {
    this.hiss(0.07, { freq: 4200, to: 1800, q: 1.5, gain: 0.2 });
    this.tone(880, 0.04, { wave: "triangle", gain: 0.07 });
  }

  /** A card drawn from the deck: softer and lower. */
  draw() {
    this.hiss(0.09, { freq: 1800, to: 3600, q: 1.2, gain: 0.12 });
  }

  /** Bet placed: chips onto the felt. */
  chips() {
    for (let i = 0; i < 3; i += 1) {
      this.hiss(0.04, { freq: 3400, q: 4, gain: 0.2, at: i * 0.06 });
      this.tone(1500 - i * 80, 0.04, { wave: "triangle", gain: 0.08, at: i * 0.06 });
    }
  }

  /** Your move: a bright two-note bell. */
  turn() {
    this.tone(1319, 0.12, { wave: "triangle", gain: 0.14 });
    this.tone(1760, 0.2, { wave: "triangle", gain: 0.14, at: 0.1 });
  }

  /** Sat down at a table: a short heroic call. */
  seated() {
    this.run([392, 523, 659, 784], 0.08, 0.12, { wave: "square", gain: 0.11 });
  }

  /** One move from the table's log; `mine` when the player made it. */
  move(move: O21Move, mine: boolean) {
    switch (move.kind) {
      case "play":
        return this.card();
      case "draw":
        return this.draw();
      case "skip": // Nobody: the Cyclops blocks the door
        this.card();
        return this.run([660, 440], 0.09, 0.08, { wave: "square", gain: 0.1, at: 0.05 });
      case "reverse": // Charybdis: a whirlpool
        this.card();
        this.hiss(0.5, { freq: 2400, to: 300, q: 2, gain: 0.14 });
        return this.tone(700, 0.45, { wave: "triangle", gain: 0.1, slideTo: 220 });
      case "plus2": // the Sirens' song
        this.card();
        this.tone(880, 0.25, { wave: "sine", gain: 0.12, slideTo: 1320 });
        return this.tone(1320, 0.3, { wave: "sine", gain: 0.12, at: 0.25, slideTo: 880 });
      case "wild": // Odysseus: a shimmer
        this.card();
        return this.run([784, 988, 1175, 1568], 0.05, 0.1, { wave: "triangle", gain: 0.1, at: 0.04 });
      case "bust":
        if (mine) return this.lose();
        return this.tone(160, 0.25, { wave: "sawtooth", gain: 0.12, slideTo: 80 });
      case "win":
        return mine ? this.fanfare() : this.coins(1);
      case "timeout":
        return this.tone(220, 0.18, { wave: "square", gain: 0.08, slideTo: 180 });
      default:
        return;
    }
  }
}
