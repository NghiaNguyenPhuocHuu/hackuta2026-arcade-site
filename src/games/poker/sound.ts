/**
 * Olympus Poker's sounds, on the arcade's shared 8-bit engine (../sound.ts:
 * unlock, the game sound switch, coins/fanfare/lose/error).
 */
import type { PokerAction } from "../../../shared/poker";
import { ChipTune } from "../sound";
import type { PokerCue } from "./cues";

export class PokerSfx extends ChipTune {
  /** A card sliding off the deck. */
  card(at = 0) {
    this.hiss(0.07, { freq: 4200, to: 1800, q: 1.5, gain: 0.2, at });
    this.tone(900, 0.03, { wave: "triangle", gain: 0.05, at });
  }

  /** Chips clicking onto the felt; `many` for an all-in shove. */
  chips(many = false) {
    const count = many ? 5 : 2;
    for (let i = 0; i < count; i += 1) {
      this.hiss(0.04, { freq: 3400, q: 4, gain: 0.2, at: i * 0.06 });
      this.tone(1500 - i * 80, 0.04, { wave: "triangle", gain: 0.08, at: i * 0.06 });
    }
  }

  /** Knuckles on the table: a check. */
  knock() {
    this.hiss(0.05, { freq: 400, q: 2, gain: 0.3, type: "lowpass" });
    this.hiss(0.05, { freq: 400, q: 2, gain: 0.3, at: 0.12, type: "lowpass" });
  }

  /** Cards pushed away: a fold. */
  fold() {
    this.hiss(0.22, { freq: 2600, to: 600, q: 0.8, gain: 0.14 });
  }

  /** Your move: a bright two-note bell. */
  turn() {
    this.tone(1319, 0.12, { wave: "triangle", gain: 0.14 });
    this.tone(1760, 0.2, { wave: "triangle", gain: 0.14, at: 0.1 });
  }

  /** Seated at a table: a short heroic call. */
  seated() {
    this.run([392, 523, 659, 784], 0.08, 0.12, { wave: "square", gain: 0.11 });
  }

  /** Your own action, played the moment the button is pressed. */
  action(type: PokerAction["type"]) {
    if (type === "fold") this.fold();
    else if (type === "check") this.knock();
    else this.chips(type === "all_in");
  }

  /** A change at the table (see cues.ts). */
  cue(cue: PokerCue) {
    switch (cue) {
      case "seated":
        return this.seated();
      case "deal":
        return [0, 0.1, 0.2, 0.3].forEach((at) => this.card(at));
      case "board":
        return [0, 0.09, 0.18].forEach((at) => this.card(at));
      case "bet":
        return this.chips();
      case "fold":
        return this.fold();
      case "your-turn":
        return this.turn();
      case "win":
        return this.fanfare();
      case "lose":
        return this.lose();
      case "cashout":
        return this.coins(3);
    }
  }
}
