/**
 * 8-bit sound effects for every arcade game, made with the Web Audio API (no
 * audio files). Each game extends `ChipTune` with its own named sounds, built
 * from `tone` (one enveloped note) and `hiss` (filtered noise).
 *
 * One arcade-wide "game sounds" switch (the SOUND ON | OFF button in every
 * game header) turns them all on or off; it is saved per browser and kept
 * separate from the site's background music.
 *
 * Browsers only allow sound after a tap or key press: `unlockOn(root)` resumes
 * audio on the first one inside the game. Everything fails quietly: no
 * AudioContext means no sound, never an error.
 */

type Wave = OscillatorType;

export type ToneOptions = { wave?: Wave; gain?: number; at?: number; slideTo?: number };
export type HissOptions = { freq?: number; to?: number; q?: number; gain?: number; at?: number; type?: BiquadFilterType };

/** Pixel speaker on a 9×7 grid, with sound waves (on) or a cross (off). */
const SPEAKER_ICON_PATH = "M0 2h2V1h1V0h1v7H3V6H2V5H0z";
export const SOUND_ON_ICON_PATH = `${SPEAKER_ICON_PATH}M6 2h1v3H6zM8 1h1v5H8z`;
export const SOUND_OFF_ICON_PATH = `${SPEAKER_ICON_PATH}M6 2h1v1H6zM8 2h1v1H8zM7 3h1v1H7zM6 4h1v1H6zM8 4h1v1H8z`;

const STORAGE_KEY = "arcade-game-sound";
const listeners = new Set<() => void>();
let enabledCache: boolean | null = null;

/** Game sounds are on unless the player switched them off. */
export function gameSoundEnabled(): boolean {
  if (enabledCache !== null) return enabledCache;
  try {
    enabledCache = window.localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    enabledCache = true;
  }
  return enabledCache;
}

export function setGameSoundEnabled(on: boolean): void {
  enabledCache = on;
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
  } catch {
    // Private mode or blocked storage: the choice just isn't remembered.
  }
  for (const listener of listeners) listener();
}

/** Called whenever the game sound switch changes, in any game. */
export function subscribeGameSound(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export class ChipTune {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;

  constructor(private readonly volume = 0.32) {}

  /** Create or resume the audio context. Call from a user gesture. */
  unlock(): void {
    if (!gameSoundEnabled()) return;
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.volume;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === "suspended") void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  /** Unlocks on every tap or key press inside `root` (cheap once running). Returns the cleanup. */
  unlockOn(root: HTMLElement): () => void {
    const handler = () => this.unlock();
    root.addEventListener("pointerdown", handler);
    root.addEventListener("keydown", handler);
    return () => {
      root.removeEventListener("pointerdown", handler);
      root.removeEventListener("keydown", handler);
    };
  }

  /** Closes the audio context; a later `unlock()` (e.g. a StrictMode remount) opens a new one. */
  dispose(): void {
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
  }

  private ready(): AudioContext | null {
    if (!gameSoundEnabled() || !this.ctx || !this.master || this.ctx.state !== "running") return null;
    return this.ctx;
  }

  /** One enveloped oscillator note. `at` is seconds from now. */
  protected tone(freq: number, dur: number, { wave = "square", gain = 0.2, at = 0, slideTo = 0 }: ToneOptions = {}) {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** Filtered noise burst (whooshes, clacks, card flicks, growls). */
  protected hiss(dur: number, { freq = 2000, to = 0, q = 1, gain = 0.2, at = 0, type = "bandpass" }: HissOptions = {}) {
    const ctx = this.ready();
    if (!ctx) return;
    if (!this.noise) {
      this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const env = ctx.createGain();
    src.buffer = this.noise;
    src.loop = true;
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(freq, t);
    if (to) filter.frequency.exponentialRampToValueAtTime(to, t + dur);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.08, dur / 3));
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(env).connect(this.master!);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  /** Notes in a row, `step` seconds apart. */
  protected run(freqs: readonly number[], step: number, dur: number, options: ToneOptions = {}) {
    const start = options.at ?? 0;
    freqs.forEach((freq, i) => this.tone(freq, dur, { ...options, at: start + i * step }));
  }

  // ---- sounds every game shares

  /** A small UI blip: picking a wager, a chip, a menu option. */
  blip() {
    this.tone(1200, 0.05, { wave: "square", gain: 0.08, slideTo: 1500 });
  }

  /** Played when sound is switched on, so the player hears it worked. */
  hello() {
    this.run([784, 1047], 0.07, 0.08, { wave: "square", gain: 0.09 });
  }

  /** Coins landing: a win or a cash-out. `size` 1–3. */
  coins(size = 1) {
    const notes = [988, 1319, 1568, 1976, 2349].slice(0, 2 + size);
    this.run(notes, 0.06, 0.09, { wave: "square", gain: 0.1 });
    this.hiss(0.25, { freq: 7000, q: 5, gain: 0.04, at: notes.length * 0.06, type: "highpass" });
  }

  /** Big win: rising fanfare with a thunder rumble under it. */
  fanfare() {
    const notes = [523, 659, 784, 1047, 1319, 1568];
    this.run(notes, 0.085, 0.16, { wave: "square", gain: 0.13 });
    const end = notes.length * 0.085;
    this.tone(2093, 0.55, { wave: "triangle", gain: 0.1, at: end });
    this.hiss(0.6, { freq: 6000, q: 6, gain: 0.05, at: end, type: "highpass" });
    this.tone(98, 0.6, { wave: "sawtooth", gain: 0.12, slideTo: 49 });
  }

  /** A loss: a short falling "wah". */
  lose() {
    this.run([392, 330, 262], 0.12, 0.14, { wave: "square", gain: 0.09 });
    this.tone(196, 0.3, { wave: "triangle", gain: 0.1, at: 0.36, slideTo: 150 });
  }

  /** Stake comes back: a shrug. */
  even() {
    this.tone(440, 0.12, { wave: "square", gain: 0.1 });
    this.tone(440, 0.16, { wave: "square", gain: 0.1, at: 0.16 });
  }

  error() {
    this.tone(150, 0.14, { wave: "square", gain: 0.12 });
    this.tone(120, 0.18, { wave: "square", gain: 0.12, at: 0.12 });
  }
}
