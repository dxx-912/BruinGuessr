import { fail, reply, requireUser, roomCode, sameOrigin } from "@/lib/server/http";
import { pingRoom, startRoomGame } from "@/lib/server/rooms";

/** The host starts the game. Round one opens for everyone in the lobby, on one clock. */
export async function POST(request: Request, ctx: RouteContext<"/api/rooms/[code]/start">) {
  if (!sameOrigin(request)) return fail("bad_request");
  const code = roomCode((await ctx.params).code);
  if (!code) return fail("not_found");
  const user = await requireUser();
  if (user instanceof Response) return user;
  const result = await startRoomGame(code, user.id);
  pingRoom(result);
  return reply(result);
}
