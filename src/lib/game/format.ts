const WHOLE = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** 4321 → "4,321". */
export const formatPoints = (points: number): string => WHOLE.format(Math.round(points));

/** Meters for people: "8 m", "84 m", "1.2 km". */
export function formatDistance(meters: number): string {
  if (meters < 1) return "under 1 m";
  if (meters < 1000) return `${WHOLE.format(Math.round(meters))} m`;
  if (meters < 100_000) return `${(meters / 1000).toFixed(1)} km`;
  return `${WHOLE.format(Math.round(meters / 1000))} km`;
}

/** The same distance in feet or miles, for readers who think that way. */
export function formatImperial(meters: number): string {
  const feet = meters * 3.28084;
  if (feet < 1000) return `${WHOLE.format(Math.max(1, Math.round(feet)))} ft`;
  const miles = meters / 1609.344;
  return `${miles < 100 ? miles.toFixed(1) : WHOLE.format(Math.round(miles))} mi`;
}

/** A short reaction to one round's score. */
export function roundVerdict(score: number, hasGuess: boolean): string {
  if (!hasGuess) return "No guess";
  if (score >= 5000) return "Bullseye";
  if (score >= 4700) return "So close";
  if (score >= 4000) return "Great guess";
  if (score >= 2500) return "Not bad";
  if (score >= 1000) return "Right campus, wrong corner";
  return "Way off";
}

/** A short reaction to a whole game, by share of the maximum. */
export function gameVerdict(total: number, max: number): string {
  const share = max > 0 ? total / max : 0;
  if (share >= 1) return "A perfect game";
  if (share >= 0.9) return "You know this campus cold";
  if (share >= 0.75) return "True Bruin";
  if (share >= 0.5) return "Solid round of guessing";
  if (share >= 0.25) return "Time for a campus walk";
  return "Were you guessing from Westwood?";
}

/** 27_400 ms → "0:28" (rounds up, so it reads 0:00 only when time is really out). */
export function formatClock(msLeft: number): string {
  const seconds = Math.max(0, Math.ceil(msLeft / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

const SOURCE_NAMES = { mapillary: "Mapillary", wikimedia: "Wikimedia Commons", original: "BruinGuessr", community: "BruinGuessr players" } as const;
export const sourceName = (source: keyof typeof SOURCE_NAMES): string => SOURCE_NAMES[source];
