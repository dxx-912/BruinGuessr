import { currentUser } from "@/lib/server/auth";
import { startGame } from "@/lib/server/game";
import { startGuestGame } from "@/lib/server/guest";
import { fail, reply, sameOrigin } from "@/lib/server/http";
import { usernameOf } from "@/lib/server/profile";

/**
 * Starts a new solo game. Ends any game the player left unfinished.
 *
 * Signed in: a game on the player's account. Signed out: a guest game, within
 * the guest rate limits (see src/lib/server/guest.ts). Guest games follow the
 * same rules and anti-cheat path as every other game; they just never count.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail("bad_request");
  const user = await currentUser();
  if (!user) return reply(await startGuestGame(request));
  // Every game on the leaderboard needs a name next to it, so pick one first.
  if (!(await usernameOf(user.id))) return fail("no_username");
  return reply(await startGame(user.id));
}
