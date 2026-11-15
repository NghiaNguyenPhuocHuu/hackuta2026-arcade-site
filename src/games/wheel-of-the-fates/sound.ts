/**
 * Wheel of the Fates' sounds, on the arcade's shared 8-bit engine
 * (../sound.ts: unlock, the game sound switch, even/error/coins).
 */
import { ChipTune } from "../sound";

export class Sfx extends ChipTune {
  chip() {
    this.hiss(0.05, { freq: 3200, q: 3, gain: 0.25 });
    this.tone(1400, 0.05, { wave: "triangle", gain: 0.12, slideTo: 900 });
  }

  /** The ball passing a pocket divider. `strength` 0–1. */
  tick(strength: number) {
    this.tone(1900 + strength * 500, 0.018, { wave: "square", gain: 0.03 + strength * 0.07 });
  }

  spinStart() {
    this.hiss(0.9, { freq: 300, to: 2400, q: 0.8, gain: 0.22 });
    this.tone(220, 0.35, { wave: "triangle", gain: 0.12, slideTo: 660 });
  }

  /** Ball drops into its pocket. */
  clack() {
    this.hiss(0.06, { freq: 1500, q: 4, gain: 0.35 });
    this.tone(700, 0.06, { wave: "square", gain: 0.12 });
    this.tone(480, 0.08, { wave: "square", gain: 0.1, at: 0.07 });
  }

  /** A god appears: rising arpeggio with a shimmer; `big` for Zeus. */
  god(big: boolean) {
    const notes = big ? [523, 659, 784, 1047, 1319, 1568] : [523, 659, 784, 1047];
    notes.forEach((f, i) => this.tone(f, 0.16, { wave: "square", gain: 0.13, at: i * 0.085 }));
    const end = notes.length * 0.085;
    this.tone(big ? 2093 : 1568, 0.5, { wave: "triangle", gain: 0.1, at: end });
    this.hiss(0.6, { freq: 6000, q: 6, gain: 0.05, at: end, type: "highpass" });
    if (big) this.tone(98, 0.6, { wave: "sawtooth", gain: 0.12, at: 0, slideTo: 49 }); // thunder rumble
  }

  /** A demon appears: falling minor line over a growl; `big` for Hades. */
  demon(big: boolean) {
    const notes = big ? [392, 349, 311, 262, 196] : [330, 294, 262, 220];
    notes.forEach((f, i) => this.tone(f, 0.18, { wave: "square", gain: 0.11, at: i * 0.11 }));
    this.tone(big ? 70 : 90, big ? 0.9 : 0.6, { wave: "sawtooth", gain: 0.16, slideTo: big ? 40 : 55 });
    this.hiss(big ? 0.9 : 0.6, { freq: 180, q: 2, gain: 0.18, type: "lowpass" });
  }
}
