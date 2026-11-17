/**
 * How good a round was, as a colour. Used wherever a single round's points
 * appear (reveal, summary, round pips, profile rounds) so a game reads as a
 * row of colours. Totals stay gold. Values are in DESIGN.md ("Round score tones").
 */
export type ScoreTone = "bullseye" | "close" | "mid" | "far" | "none";

export function scoreTone(score: number, hasGuess: boolean): ScoreTone {
  if (!hasGuess) return "none";
  if (score >= 5000) return "bullseye";
  if (score >= 4000) return "close";
  if (score >= 1500) return "mid";
  return "far";
}

/** Text in the tone, on a dark surface. */
export const TONE_TEXT: Record<ScoreTone, string> = {
  bullseye: "text-ucla-gold",
  close: "text-leaf",
  mid: "text-sky",
  far: "text-brick-light",
  none: "text-out",
};

/** A fill in the tone (bars, pips); pair with TONE_ON for text on it. */
export const TONE_FILL: Record<ScoreTone, string> = {
  bullseye: "bg-ucla-gold",
  close: "bg-leaf",
  mid: "bg-sky",
  far: "bg-brick-light",
  none: "bg-out",
};

/** Every tone's fill carries dark text (all are 7:1 or better against night). */
export const TONE_ON = "text-night";
