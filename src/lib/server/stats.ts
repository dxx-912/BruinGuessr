import "server-only";
import { adminClient } from "./supabase";

export type ImageStat = { id: string; lat: number; lng: number; guesses: number; avg_score: number; avg_distance_m: number | null };

export type AdminStats = {
  signups: number; signupsWeek: number; signupsToday: number; guestsNow: number;
  gamesPlayed: number; gamesWeek: number; gamesToday: number;
  soloGames: number; versusGames: number; abandoned: number; inProgress: number;
  avgScore: number | null; avgSoloScore: number | null; avgVersusScore: number | null; highScore: number | null;
  perfectRounds: number; noPinRounds: number; medianDistanceM: number | null;
  activePlayersWeek: number; repeatPlayers: number; gamesPerPlayer: number | null;
  contributionsWaiting: number; contributionsApproved: number; contributionsRejected: number;
  photos: number; photosHidden: number; openReports: number;
  gamesByDay: { day: string; games: number }[];
  signupsByDay: { day: string; signups: number }[];
  bestImages: ImageStat[]; worstImages: ImageStat[];
};

export async function adminStats(adminId: string): Promise<AdminStats> {
  const { data, error } = await adminClient().rpc("admin_stats", { p_admin: adminId });
  if (error || !data) throw new Error(`[stats] ${error?.message ?? "no data"}`);
  return data as AdminStats;
}
