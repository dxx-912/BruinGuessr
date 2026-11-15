/** Highest score for one round. */
export const MAX_ROUND_SCORE = 5000;

/** A guess this close to the true location (meters) is a perfect score. */
export const PERFECT_RADIUS_M = 10;

/**
 * Score for one round (SPEC.md, "Game rules"):
 *
 *   round(5000 × e^(−10 × max(0, d − 10) / D))
 *
 * `distanceM` is the haversine distance from guess to true location and
 * `diagonalM` is D, the diagonal of the campus.geojson bounding box.
 *
 * The server is the only place a real score is ever computed. This function
 * exists for display helpers and as the reference the SQL version is tested against.
 */
export function scoreForDistance(distanceM: number, diagonalM: number): number {
  if (!(diagonalM > 0)) throw new Error("diagonalM must be a positive number");
  if (!(distanceM >= 0)) throw new Error("distanceM must be zero or positive");
  const effective = Math.max(0, distanceM - PERFECT_RADIUS_M);
  return Math.round(MAX_ROUND_SCORE * Math.exp((-10 * effective) / diagonalM));
}

/** True when a guess earns the bullseye celebration. */
export function isBullseye(distanceM: number): boolean {
  return distanceM <= PERFECT_RADIUS_M;
}
