import { leaderboard } from "@/lib/server/profile";
import { json, requireUser } from "@/lib/server/http";

/**
 * GET /api/me/standing → the signed-in player's best score and rank, for the
 * game summary. `you` is null until they complete a game.
 */
export async function GET() {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const board = await leaderboard(user.id, 1, 0);
  return json({ you: board.you, total: board.total });
}
