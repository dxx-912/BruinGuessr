import { fail, reply, requireUser, roomCode, sameOrigin } from "@/lib/server/http";
import { usernameOf } from "@/lib/server/profile";
import { joinRoom, pingRoom } from "@/lib/server/rooms";

/**
 * Joins the room. The same call brings a disconnected player back mid-game
 * and puts a player back in the lobby for a rematch.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/rooms/[code]/join">) {
  if (!sameOrigin(request)) return fail("bad_request");
  const code = roomCode((await ctx.params).code);
  if (!code) return fail("not_found");
  const user = await requireUser();
  if (user instanceof Response) return user;
  if (!(await usernameOf(user.id))) return fail("no_username");
  const result = await joinRoom(code, user.id);
  pingRoom(result);
  return reply(result);
}
