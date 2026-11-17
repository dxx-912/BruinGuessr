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
  /** Versus only: every player's pin for this round, by seat. */
  players?: PlayerResult[] | null;
};

/** One player's part of a scored versus round. */
export type PlayerResult = {
  seat: number;
  guess: LatLng | null;
  distanceM: number | null;
  score: number;
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
  /** True once this player has pressed Guess. In a versus game the round may still be open for others. */
  locked: boolean;
};

/** A player in a versus game. Says who has guessed, never where. */
export type VersusPlayer = {
  /** 1 to 5. Decides the player's colour. */
  seat: number;
  username: string;
  /** Sum of their scored rounds so far. */
  total: number;
  isYou: boolean;
  isHost: boolean;
  /** Left, or not heard from lately. Rounds do not wait for them. */
  away: boolean;
  /** Has pressed Guess in the round that is open. */
  locked: boolean;
};

export type VersusInfo = {
  /** The room's code. Null once the room has closed. */
  code: string | null;
  /** The Realtime channel that says "something changed, ask again". */
  channel: string | null;
  seat: number;
  isHost: boolean;
  /** Between rounds: server time (ms) when the next round opens by itself. */
  nextRoundAt: number | null;
  /**
   * After the game: `open` means the room is a lobby again and `ready` players
   * are waiting in it; `started` means the next game began without this player.
   */
  rematch: { state: "open" | "playing" | "started" | "closed"; ready: number };
  players: VersusPlayer[];
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
  /** The other players and the room. Null in a solo game. */
  versus: VersusInfo | null;
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
  | "account_required"
  | "rate_limited"
  | "room_locked"
  | "room_full"
  | "not_in_room"
  | "not_host"
  | "need_players"
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
