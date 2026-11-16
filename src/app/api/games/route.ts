import { startGame } from "@/lib/server/game";
import { fail, reply, requireUser, sameOrigin } from "@/lib/server/http";

/** Starts a new solo game for the signed-in player. Ends any game they left unfinished. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail("bad_request");
  const user = await requireUser();
  if (user instanceof Response) return user;
  return reply(await startGame(user.id));
}
