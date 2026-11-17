/**
 * The shapes of a player's public profile, as the `player_profile` SQL
 * function returns them. Nothing here is private: no account ID, no email,
 * no game ID, and no photo or answer location.
 */
import { ordinal } from "./leaderboard";

export type ProfileRound = { round: number; distanceM: number | null; score: number };

export type ProfileGame = {
  mode: "solo" | "versus";
  /** ms since 1970 */
  completedAt: number;
  total: number;
  roundCount: number;
  /** Versus only: 1 is first (ties share a place). */
  place: number | null;
  players: number | null;
  rounds: ProfileRound[];
};

export type ProfileStats = {
  bestScore: number | null;
  gamesPlayed: number;
  roundsPlayed: number;
  averageRound: number | null;
  bullseyes: number;
  versusPlayed: number;
  versusWon: number;
};

export type PlayerProfile = {
  username: string;
  joinedAt: number;
  isYou: boolean;
  /** Leaderboard rank, or null when the player is not on the board. */
  rank: number | null;
  stats: ProfileStats;
  recent: ProfileGame[];
};

/** "Nov 17, 2026", in campus time. */
export const formatDay = (ms: number) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" }).format(ms);

/** What a versus finish reads as: "Won", "2nd of 4". */
export function placeLabel(place: number, players: number): string {
  return place === 1 ? "Won" : `${ordinal(place)} of ${players}`;
}
