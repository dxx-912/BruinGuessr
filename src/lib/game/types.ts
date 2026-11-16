/**
 * The shapes the browser and the server exchange for a game.
 * These mirror what the `_build_state` SQL function returns.
 */

export type LatLng = { lat: number; lng: number };

export type PhotoCredit = {
  photographer: string;
  source: "mapillary" | "wikimedia" | "original";
  license: string;
  licenseUrl: string | null;
};

/** One scored round. Only ever sent after the round is over. */
export type RoundResult = {
  round: number;
  /** Null when the player never placed a pin. */
  guess: LatLng | null;
  answer: LatLng;
  distanceM: number | null;
  score: number;
  credit: PhotoCredit;
  /** True once this player has reported the photo. */
  reported: boolean;
};

/** The round being played. Says nothing about the photo. */
export type OpenRound = {
  number: number;
  /** Server time (ms since 1970) when the clock starts and when it hits zero. */
  startsAt: number;
  deadlineAt: number;
  /** How long after the deadline the server still accepts a guess. */
  graceMs: number;
  /** The pin the server has saved for this player, if any. */
  pin: LatLng | null;
};

export type GameState = {
  id: string;
  mode: "solo" | "versus";
  status: "active" | "completed" | "abandoned";
  roundCount: number;
  roundSeconds: number;
  /** 0 before the first round opens. */
  currentRound: number;
  /** Server clock when this state was built, for syncing the countdown. */
  serverNow: number;
  totalScore: number;
  /** Present only while a round is open. */
  round: OpenRound | null;
  results: RoundResult[];
};

export const REPORT_REASONS = [
  { id: "wrong_location", label: "The answer is in the wrong place" },
  { id: "unclear", label: "Blurry, dark or impossible to place" },
  { id: "not_campus", label: "Not a campus photo" },
  { id: "inappropriate", label: "Inappropriate" },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]["id"] | "other";

/** Errors the game API can answer with, in the `error` field of the JSON body. */
export type GameError =
  | "unauthorized"
  | "not_found"
  | "bad_request"
  | "bad_pin"
  | "no_pin"
  | "round_closed"
  | "too_late"
  | "locked"
  | "daily_cap"
  | "bad_reason"
  | "no_username"
  | "server_error";

/** What the game screen should be showing, worked out from the state alone. */
export type GamePhase = "ready" | "guessing" | "reveal" | "finished" | "abandoned";

export function phaseOf(state: GameState): GamePhase {
  if (state.status === "abandoned") return "abandoned";
  if (state.status === "completed") return "finished";
  if (state.round) return "guessing";
  return state.currentRound === 0 ? "ready" : "reveal";
}

/** Highest total a game can reach. */
export function maxTotal(state: Pick<GameState, "roundCount">): number {
  return state.roundCount * 5000;
}
