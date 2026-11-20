/** What the leaderboard function in the database returns. */
export type LeaderboardRow = {
  rank: number;
  username: string;
  score: number;
  /** When the score was reached: the end of that game, in ms since 1970. */
  reachedAt: number;
  mode: "solo" | "versus";
  isYou: boolean;
};

export type Leaderboard = {
  total: number;
  rows: LeaderboardRow[];
  /** The asking player's own row, wherever it is. Null if they have no completed game. */
  you: (LeaderboardRow & { gameId: string }) | null;
};

/** How many rows the leaderboard shows. Everyone below is told only their rank. */
export const LEADERBOARD_SIZE = 10;

/** "1st", "2nd", "3rd", "11th", "22nd"… */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}
