/**
 * Background music for the arcade, composed and played with the Web Audio API
 * (no audio files). Two looping 8-bar tracks:
 *
 *   - "agora": relaxed, C major, ~92 bpm, for the lobby and the Wallet
 *   - "festival": bouncy, G major, ~120 bpm, with a light hi-hat, for the games
 *
 * Each is a soft pad, a plucked (lyre-like) arpeggio, a bass and a melody.
 * Switching tracks crossfades at the next bar. Browsers only allow sound after
 * a tap or key press, so `start()` must run from one; the arcade calls it on
 * the first one. Everything fails quietly: no AudioContext means no music,
 * never an error. Kept quiet so game sound effects stay on top.
 */

export type TrackName = "agora" | "festival";

type Quality = "maj" | "min";
type Track = {
  bpm: number;
  /** One chord per bar: root note (e.g. "C") and quality. */
  chords: Array<[string, Quality]>;
  /** One string per bar, 8 eighth notes: a note ("E5"), "-" to hold, "." for rest. */
  melody: string[];
  hats: boolean;
};

const TRACKS: Readonly<Record<TrackName, Track>> = {
  agora: {
    bpm: 92,
    chords: [["C", "maj"], ["A", "min"], ["F", "maj"], ["G", "maj"], ["C", "maj"], ["A", "min"], ["D", "min"], ["G", "maj"]],
    melody: [
      "E5 - G5 - C6 - B5 A5",
      "A5 - E5 - C5 - E5 .",
      "F5 - A5 - C6 - A5 F5",
      "G5 - - - D5 - G5 .",
      "E5 G5 C6 - E6 - D6 C6",
      "C6 - A5 - E5 - A5 .",
      "D5 F5 A5 - F5 - D5 .",
      "G5 - B5 - D6 - - .",
    ],
    hats: false,
  },
  festival: {
    bpm: 120,
    chords: [["G", "maj"], ["D", "maj"], ["E", "min"], ["C", "maj"], ["G", "maj"], ["D", "maj"], ["C", "maj"], ["D", "maj"]],
    melody: [
      "D5 G5 B5 G5 D6 - B5 G5",
      "A5 - F#5 A5 D6 - A5 .",
      "G5 B5 E6 - D6 B5 G5 .",
      "E5 G5 C6 - B5 - A5 G5",
      "B5 - D6 B5 G5 - B5 D6",
      "F#6 - E6 D6 A5 - F#5 A5",
      "G5 E5 C6 - E6 - D6 C6",
      "D6 - - - A5 - F#5 .",
    ],
    hats: true,
  },
};

const SEMITONES: Readonly<Record<string, number>> = { C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11 };

/** "F#5" → frequency in Hz; null for anything else. */
export function noteFrequency(note: string): number | null {
  const match = /^([A-G]#?)(\d)$/.exec(note);
  if (!match) return null;
  const midi = 12 * (Number(match[2]) + 1) + SEMITONES[match[1]!]!;
  return 440 * 2 ** ((midi - 69) / 12);
}

/** A bar's melody → [step, note, length in eighths] for each note. */
export function parseBar(bar: string): Array<[number, string, number]> {
  const tokens = bar.trim().split(/\s+/);
  const notes: Array<[number, string, number]> = [];
  tokens.forEach((token, step) => {
    if (token === "-" && notes.length) notes[notes.length - 1]![2] += 1;
    else if (token !== "." && token !== "-") notes.push([step, token, 1]);
  });
  return notes;
}

function chordFrequencies(root: string, quality: Quality, octave: number): number[] {
  const base = noteFrequency(`${root}${octave}`)!;
  const third = quality === "maj" ? 4 : 3;
  return [0, third, 7].map((semis) => base * 2 ** (semis / 12));
}

const MUSIC_VOLUME = 0.11;
const LOOKAHEAD_S = 0.15;
const TICK_MS = 40;

export class Music {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private track: TrackName = "agora";
  private pending: TrackName | null = null;
  private step = 0;
  private nextAt = 0;
  private playing = false;

  /** Starts (or resumes) playing. Call from a user gesture. */
  start(): void {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0;
        this.master.connect(this.ctx.destination);
        const length = Math.floor(this.ctx.sampleRate * 0.05);
        this.noise = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
        const data = this.noise.getChannelData(0);
        for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === "suspended") void this.ctx.resume();
      if (this.playing) return;
      this.playing = true;
      this.step = 0;
      this.nextAt = this.ctx.currentTime + 0.1;
      this.fadeTo(MUSIC_VOLUME, 1.2);
      this.timer = setInterval(() => this.schedule(), TICK_MS);
    } catch {
      this.ctx = null;
    }
  }

  /** Fades out and stops. */
  stop(): void {
    if (!this.playing) return;
    this.playing = false;
    this.fadeTo(0, 0.5);
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    const ctx = this.ctx;
    setTimeout(() => {
      if (!this.playing && ctx?.state === "running") void ctx.suspend().catch(() => {});
    }, 600);
  }

  /** Pause while the tab is hidden; resume when it's back (only if it was playing). */
  setHidden(hidden: boolean): void {
    if (!this.ctx) return;
    if (hidden) void this.ctx.suspend().catch(() => {});
    else if (this.playing) void this.ctx.resume().catch(() => {});
  }

  /** Switches track: a short dip at the next bar, then the new tune. */
  setTrack(name: TrackName): void {
    if (name === this.track && this.pending === null) return;
    this.pending = name;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  dispose(): void {
    this.stop();
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
  }

  private fadeTo(volume: number, seconds: number) {
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(volume, now + seconds);
  }

  /** Queues every eighth note that falls within the lookahead window. */
  private schedule() {
    const ctx = this.ctx;
    if (!ctx || !this.playing || ctx.state !== "running") return;
    while (this.nextAt < ctx.currentTime + LOOKAHEAD_S) {
      const stepInBar = this.step % 8;
      if (stepInBar === 0 && this.pending) {
        // Crossfade: dip, swap the tune at the bar line, come back up.
        this.track = this.pending;
        this.pending = null;
        this.step = 0;
        this.master?.gain.setValueAtTime(MUSIC_VOLUME * 0.35, this.nextAt);
        this.master?.gain.linearRampToValueAtTime(MUSIC_VOLUME, this.nextAt + 1.2);
      }
      this.playStep(this.nextAt);
      this.nextAt += 60 / TRACKS[this.track].bpm / 2;
      this.step += 1;
    }
  }

  private playStep(at: number) {
    const track = TRACKS[this.track];
    const eighth = 60 / track.bpm / 2;
    const bar = Math.floor(this.step / 8) % track.chords.length;
    const stepInBar = this.step % 8;
    const [root, quality] = track.chords[bar]!;

    if (stepInBar === 0) this.pad(chordFrequencies(root, quality, 4), at, eighth * 8);
    if (stepInBar === 0 || stepInBar === 4) this.bass(chordFrequencies(root, quality, 2)[0]!, at, eighth * 3.5);
    // Arpeggio: up and down the chord, an octave above the pad.
    const arp = chordFrequencies(root, quality, 4).concat(chordFrequencies(root, quality, 5)[0]!);
    const order = [0, 1, 2, 3, 2, 1, 0, 1];
    this.pluck(arp[order[stepInBar]!]!, at, eighth * 1.6, 0.16);
    for (const [step, note, length] of parseBar(track.melody[bar]!)) {
      if (step !== stepInBar) continue;
      const freq = noteFrequency(note);
      if (freq) this.lead(freq, at, eighth * length);
    }
    if (track.hats && stepInBar % 2 === 1) this.hat(at);
  }

  private voice(type: OscillatorType, freq: number, at: number, duration: number, peak: number, attack: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(peak, at + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(gain).connect(this.master!);
    osc.start(at);
    osc.stop(at + duration + 0.05);
  }

  private pad(freqs: number[], at: number, duration: number) {
    for (const freq of freqs) this.voice("sine", freq, at, duration, 0.07, duration * 0.3);
  }

  private bass(freq: number, at: number, duration: number) {
    this.voice("triangle", freq, at, duration, 0.32, 0.02);
  }

  private pluck(freq: number, at: number, duration: number, peak: number) {
    this.voice("triangle", freq, at, duration, peak, 0.005);
  }

  private lead(freq: number, at: number, duration: number) {
    this.voice("square", freq, at, Math.max(0.12, duration * 0.95), 0.05, 0.01);
    this.voice("sine", freq * 2, at, Math.max(0.12, duration * 0.8), 0.03, 0.01);
  }

  private hat(at: number) {
    const ctx = this.ctx!;
    if (!this.noise) return;
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    source.buffer = this.noise;
    filter.type = "highpass";
    filter.frequency.value = 7000;
    gain.gain.setValueAtTime(0.06, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.04);
    source.connect(filter).connect(gain).connect(this.master!);
    source.start(at);
    source.stop(at + 0.05);
  }
}

// ---- the arcade's one music player and the listener's choice ----

const STORAGE_KEY = "arcade-music";
let player: Music | null = null;
const listeners = new Set<() => void>();

/** On unless the listener turned it off (remembered per browser). */
export function musicEnabled(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setMusicEnabled(on: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
  } catch {
    // Blocked storage: the choice lasts for this visit only.
  }
  if (on) arcadeMusic().start();
  else player?.stop();
  for (const listener of listeners) listener();
}

export function subscribeMusic(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function arcadeMusic(): Music {
  if (!player) player = new Music();
  return player;
}
