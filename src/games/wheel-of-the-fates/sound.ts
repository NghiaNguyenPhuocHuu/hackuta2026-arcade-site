/**
 * 8-bit sound effects, made with the Web Audio API (no audio files). Browsers
 * only allow sound after a tap or click, so `unlock()` is called from those.
 * Everything fails quietly: no AudioContext means no sound, never an error.
 */

type Wave = OscillatorType;

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  enabled = true;

  /** Create or resume the audio context. Call from a user gesture. */
  unlock(): void {
    if (!this.enabled) return;
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.32;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === "suspended") void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  dispose(): void {
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
  }

  private ready(): AudioContext | null {
    if (!this.enabled || !this.ctx || !this.master || this.ctx.state !== "running") return null;
    return this.ctx;
  }

  /** One enveloped oscillator note. `at` is seconds from now. */
  private tone(freq: number, dur: number, { wave = "square" as Wave, gain = 0.2, at = 0, slideTo = 0 } = {}) {
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

  /** Filtered noise burst (whooshes, clacks, growls). */
  private hiss(dur: number, { freq = 2000, to = 0, q = 1, gain = 0.2, at = 0, type = "bandpass" as BiquadFilterType } = {}) {
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
