import { currentUser } from "@/lib/server/auth";
import { startGame } from "@/lib/server/game";
import { fail, reply, sameOrigin } from "@/lib/server/http";
import { usernameOf } from "@/lib/server/profile";

/**
 * Starts a new solo game. Ends any game the player left unfinished.
 *
 * Needs an account: a signed-out visitor gets 401 and is sent to sign up.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail("bad_request");
  const user = await currentUser();
  if (!user) return fail("unauthorized");
  // Every game on the leaderboard needs a name next to it, so pick one first.
  if (!(await usernameOf(user.id))) return fail("no_username");
  return reply(await startGame(user.id));
}
