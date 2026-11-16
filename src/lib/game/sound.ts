/**
 * Game sounds, synthesised in the browser. No audio files.
 * Browsers only allow sound after the visitor has clicked something, which in
 * this game they always have (the Play button) before the first sound is due.
 */

const STORAGE_KEY = "bruinguessr:muted";

let context: AudioContext | null = null;
let muted: boolean | null = null;

function isMuted(): boolean {
  if (muted === null) {
    try {
      muted = window.localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      muted = false;
    }
  }
  return muted;
}

function audio(): AudioContext | null {
  if (typeof window === "undefined" || isMuted()) return null;
  try {
    context ??= new AudioContext();
    if (context.state === "suspended") void context.resume();
    return context;
  } catch {
    return null;
  }
}

type Note = {
  /** Pitch in Hz, and optionally the pitch it slides to. */
  from: number;
  to?: number;
  /** Seconds from now, and length in seconds. */
  at?: number;
  length: number;
  volume?: number;
  wave?: OscillatorType;
};

function play(notes: Note[]) {
  const ctx = audio();
  if (!ctx) return;
  for (const note of notes) {
    const start = ctx.currentTime + (note.at ?? 0);
    const end = start + note.length;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = note.wave ?? "sine";
    osc.frequency.setValueAtTime(note.from, start);
    if (note.to) osc.frequency.exponentialRampToValueAtTime(note.to, end);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(note.volume ?? 0.12, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(end + 0.02);
  }
}

export const sound = {
  isMuted,
  setMuted(value: boolean) {
    muted = value;
    try {
      window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
    } catch {
      // Private browsing: the choice just will not be remembered.
    }
  },
  /** One of the last five seconds going by. The final second is higher. */
  tick: (last = false) => play([{ from: last ? 1320 : 880, length: 0.07, volume: 0.07, wave: "square" }]),
  /** A pin landing on the map. */
  pin: () => play([{ from: 320, to: 140, length: 0.12, volume: 0.2, wave: "triangle" }]),
  /** The guess is locked in. */
  lock: () => play([{ from: 440, length: 0.08, wave: "triangle" }, { from: 660, at: 0.08, length: 0.14, wave: "triangle" }]),
  /** The clock ran out. */
  timeUp: () => play([{ from: 330, to: 110, length: 0.5, volume: 0.14, wave: "sawtooth" }]),
  /** The score counting up. Higher scores climb further. */
  tally(score: number) {
    const steps = Math.max(1, Math.round((score / 5000) * 8));
    play(Array.from({ length: steps }, (_, i) => ({ from: 392 * 2 ** (i / 6), at: i * 0.09, length: 0.09, volume: 0.09, wave: "triangle" as const })));
  },
  /** A perfect guess. */
  bullseye: () =>
    play([523.25, 659.25, 783.99, 1046.5].map((from, i) => ({ from, at: i * 0.11, length: i === 3 ? 0.5 : 0.14, volume: 0.14, wave: "triangle" as const }))),
  /** A new round is about to start. */
  roundStart: () => play([{ from: 587, length: 0.1, wave: "triangle" }, { from: 880, at: 0.1, length: 0.18, wave: "triangle" }]),
};
