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

export const LEADERBOARD_PAGE_SIZE = 50;

/** The leaderboard lists this many players at most. */
export const LEADERBOARD_MAX = 100;

/** The page (1-based) that holds a rank. */
export const pageOfRank = (rank: number) => Math.floor((rank - 1) / LEADERBOARD_PAGE_SIZE) + 1;

/** "1st", "2nd", "3rd", "11th", "22nd"… */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

/** The longest reason an admin can give for taking a player off the leaderboard. */
export const REMOVAL_REASON_MAX = 300;
